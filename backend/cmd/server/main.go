package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"stockmate/internal/db"
)

type Item struct {
	ID             int64           `json:"id"`
	SeriesID       *int64          `json:"series_id,omitempty"`
	SKU            string          `json:"sku"`
	Name           string          `json:"name"`
	ItemType       string          `json:"item_type"`
	PackQty        *float64        `json:"pack_qty,omitempty"`
	ManagedUnit    string          `json:"managed_unit"`
	RevCode        string          `json:"rev_code,omitempty"`
	StockManaged   bool            `json:"stock_managed"`
	IsSellable     bool            `json:"is_sellable"`
	IsFinal        bool            `json:"is_final"`
	OutputCategory string          `json:"output_category,omitempty"`
	Note           string          `json:"note,omitempty"`
	CreatedAt      string          `json:"created_at,omitempty"`
	UpdatedAt      string          `json:"updated_at,omitempty"`
	Assembly       *AssemblyDetail `json:"assembly,omitempty"`
	Material       *MaterialDetail `json:"material,omitempty"`
}

type AssemblyDetail struct {
	Manufacturer string   `json:"manufacturer,omitempty"`
	TotalWeight  *float64 `json:"total_weight,omitempty"`
	PackSize     string   `json:"pack_size,omitempty"`
	Note         string   `json:"note,omitempty"`
}

type MaterialDetail struct {
	Manufacturer string `json:"manufacturer,omitempty"`
	MaterialType string `json:"material_type,omitempty"`
	Color        string `json:"color,omitempty"`
}

func main() {
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		dsn = "sqlite:./data/stockmate.db"
	}

	conn, err := db.Open(dsn)
	if err != nil {
		panic(err)
	}
	defer conn.Close()

	if err := db.Migrate(conn); err != nil {
		panic(err)
	}

	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	})

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "ok")
	})

	if os.Getenv("APP_ENV") == "dev" {
		r.Get("/debug/dsn", func(w http.ResponseWriter, r *http.Request) {
			fmt.Fprintln(w, dsn)
		})
	}

	r.Post("/api/items", createItem(conn))
	r.Get("/api/items", listItems(conn))
	r.Put("/api/items/{id}", updateItem(conn))

	fmt.Println("listening on :8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		panic(err)
	}
}

func parseItemType(value string) (string, error) {
	itemType := strings.TrimSpace(value)
	if itemType == "" {
		itemType = "assembly"
	}
	if itemType != "material" && itemType != "assembly" {
		return "", fmt.Errorf("item_type must be material or assembly")
	}
	return itemType, nil
}

func createItem(dbx *sql.DB) http.HandlerFunc {
	type AssemblyReq struct {
		Manufacturer string   `json:"manufacturer"`
		TotalWeight  *float64 `json:"total_weight"`
		PackSize     string   `json:"pack_size"`
		Note         string   `json:"note"`
	}
	type MaterialReq struct {
		Manufacturer string `json:"manufacturer"`
		MaterialType string `json:"material_type"`
		Color        string `json:"color"`
	}

	type Req struct {
		SeriesID       *int64       `json:"series_id"`
		SKU            string       `json:"sku"`
		Name           string       `json:"name"`
		ItemType       string       `json:"item_type"`
		ManagedUnit    string       `json:"managed_unit"`
		BaseUnit       string       `json:"base_unit"`
		PackQty        *float64     `json:"pack_qty"`
		RevCode        string       `json:"rev_code"`
		StockManaged   *bool        `json:"stock_managed"`
		IsSellable     bool         `json:"is_sellable"`
		IsFinal        bool         `json:"is_final"`
		OutputCategory string       `json:"output_category"`
		Note           string       `json:"note"`
		Assembly       *AssemblyReq `json:"assembly"`
		Material       *MaterialReq `json:"material"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		var req Req
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}

		req.SKU = strings.TrimSpace(req.SKU)
		req.Name = strings.TrimSpace(req.Name)
		req.RevCode = strings.TrimSpace(req.RevCode)
		req.Note = strings.TrimSpace(req.Note)
		req.OutputCategory = strings.TrimSpace(req.OutputCategory)
		if req.SKU == "" || req.Name == "" {
			http.Error(w, "sku and name required", http.StatusBadRequest)
			return
		}

		itemType, err := parseItemType(req.ItemType)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		unit := strings.TrimSpace(req.ManagedUnit)
		if unit == "" {
			unit = strings.TrimSpace(req.BaseUnit)
		}
		if unit == "" {
			unit = "pcs"
		}
		if unit != "g" && unit != "pcs" {
			http.Error(w, "managed_unit must be g or pcs", http.StatusBadRequest)
			return
		}
		if req.PackQty != nil && *req.PackQty <= 0 {
			http.Error(w, "pack_qty must be > 0", http.StatusBadRequest)
			return
		}
		if req.Assembly != nil && req.Assembly.TotalWeight != nil && *req.Assembly.TotalWeight <= 0 {
			http.Error(w, "assembly.total_weight must be > 0", http.StatusBadRequest)
			return
		}
		stockManaged := true
		if req.StockManaged != nil {
			stockManaged = *req.StockManaged
		}

		sm := 0
		if stockManaged {
			sm = 1
		}
		sellable := 0
		if req.IsSellable {
			sellable = 1
		}
		final := 0
		if req.IsFinal {
			final = 1
		}

		var seriesID any = nil
		if req.SeriesID != nil {
			seriesID = *req.SeriesID
		}
		var packQty any = nil
		if req.PackQty != nil {
			packQty = *req.PackQty
		}

		tx, err := dbx.BeginTx(r.Context(), nil)
		if err != nil {
			http.Error(w, "failed to begin transaction", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		res, err := tx.Exec(`
INSERT INTO items(series_id, sku, name, item_type, stock_managed, is_sellable, is_final, output_category, pack_qty, managed_unit, rev_code, note)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
`, seriesID, req.SKU, req.Name, itemType, sm, sellable, final, req.OutputCategory, packQty, unit, req.RevCode, req.Note)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		id, _ := res.LastInsertId()
		switch itemType {
		case "assembly":
			manufacturer := ""
			var totalWeight any = nil
			packSize := ""
			assemblyNote := ""
			if req.Assembly != nil {
				manufacturer = strings.TrimSpace(req.Assembly.Manufacturer)
				if req.Assembly.TotalWeight != nil {
					totalWeight = *req.Assembly.TotalWeight
				}
				packSize = strings.TrimSpace(req.Assembly.PackSize)
				assemblyNote = strings.TrimSpace(req.Assembly.Note)
			}
			if _, err := tx.Exec(`
INSERT INTO assemblies(item_id, manufacturer, total_weight, pack_size, note)
VALUES(?,?,?,?,?)
`, id, manufacturer, totalWeight, packSize, assemblyNote); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
		case "material":
			manufacturer := ""
			materialType := ""
			color := ""
			if req.Material != nil {
				manufacturer = strings.TrimSpace(req.Material.Manufacturer)
				materialType = strings.TrimSpace(req.Material.MaterialType)
				color = strings.TrimSpace(req.Material.Color)
			}
			if _, err := tx.Exec(`
INSERT INTO materials(item_id, manufacturer, material_type, color)
VALUES(?,?,?,?)
`, id, manufacturer, materialType, color); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
		}

		if err := tx.Commit(); err != nil {
			http.Error(w, "failed to commit transaction", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Item{
			ID:             id,
			SeriesID:       req.SeriesID,
			SKU:            req.SKU,
			Name:           req.Name,
			ItemType:       itemType,
			PackQty:        req.PackQty,
			ManagedUnit:    unit,
			RevCode:        req.RevCode,
			StockManaged:   stockManaged,
			IsSellable:     req.IsSellable,
			IsFinal:        req.IsFinal,
			OutputCategory: req.OutputCategory,
			Note:           req.Note,
		})
	}
}

func listItems(dbx *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := dbx.Query(`
SELECT
  i.item_id AS id,
  i.series_id,
  i.sku,
  i.name,
  i.item_type,
  i.pack_qty,
  i.managed_unit,
  i.rev_code,
  i.stock_managed,
  i.is_sellable,
  i.is_final,
  i.output_category,
  i.note,
  i.created_at,
  i.updated_at,
  a.manufacturer,
  a.total_weight,
  a.pack_size,
  a.note,
  m.manufacturer,
  m.material_type,
  m.color
FROM items i
LEFT JOIN assemblies a ON a.item_id = i.item_id
LEFT JOIN materials m ON m.item_id = i.item_id
ORDER BY i.item_id DESC
LIMIT 200
`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		out := make([]Item, 0)
		for rows.Next() {
			var it Item
			var seriesID sql.NullInt64
			var sku sql.NullString
			var name sql.NullString
			var itemType sql.NullString
			var packQty sql.NullFloat64
			var managedUnit sql.NullString
			var revCode sql.NullString
			var outputCategory sql.NullString
			var note sql.NullString
			var createdAt sql.NullString
			var updatedAt sql.NullString
			var assemblyManufacturer sql.NullString
			var assemblyTotalWeight sql.NullFloat64
			var assemblyPackSize sql.NullString
			var assemblyNote sql.NullString
			var materialManufacturer sql.NullString
			var materialType sql.NullString
			var materialColor sql.NullString
			var sm int
			var sellable int
			var final int
			if err := rows.Scan(
				&it.ID,
				&seriesID,
				&sku,
				&name,
				&itemType,
				&packQty,
				&managedUnit,
				&revCode,
				&sm,
				&sellable,
				&final,
				&outputCategory,
				&note,
				&createdAt,
				&updatedAt,
				&assemblyManufacturer,
				&assemblyTotalWeight,
				&assemblyPackSize,
				&assemblyNote,
				&materialManufacturer,
				&materialType,
				&materialColor,
			); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if seriesID.Valid {
				sid := seriesID.Int64
				it.SeriesID = &sid
			}
			if sku.Valid {
				it.SKU = sku.String
			}
			if name.Valid {
				it.Name = name.String
			}
			if itemType.Valid {
				it.ItemType = itemType.String
			}
			if packQty.Valid {
				pq := packQty.Float64
				it.PackQty = &pq
			}
			if managedUnit.Valid {
				it.ManagedUnit = managedUnit.String
			}
			if revCode.Valid {
				it.RevCode = revCode.String
			}
			if outputCategory.Valid {
				it.OutputCategory = outputCategory.String
			}
			if note.Valid {
				it.Note = note.String
			}
			if createdAt.Valid {
				it.CreatedAt = createdAt.String
			}
			if updatedAt.Valid {
				it.UpdatedAt = updatedAt.String
			}
			if assemblyManufacturer.Valid || assemblyTotalWeight.Valid || assemblyPackSize.Valid || assemblyNote.Valid {
				it.Assembly = &AssemblyDetail{
					Manufacturer: assemblyManufacturer.String,
					PackSize:     assemblyPackSize.String,
					Note:         assemblyNote.String,
				}
				if assemblyTotalWeight.Valid {
					tw := assemblyTotalWeight.Float64
					it.Assembly.TotalWeight = &tw
				}
			}
			if materialManufacturer.Valid || materialType.Valid || materialColor.Valid {
				it.Material = &MaterialDetail{
					Manufacturer: materialManufacturer.String,
					MaterialType: materialType.String,
					Color:        materialColor.String,
				}
			}
			it.StockManaged = (sm != 0)
			it.IsSellable = (sellable != 0)
			it.IsFinal = (final != 0)
			out = append(out, it)
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	}
}

func updateItem(dbx *sql.DB) http.HandlerFunc {
	type AssemblyReq struct {
		Manufacturer string   `json:"manufacturer"`
		TotalWeight  *float64 `json:"total_weight"`
		PackSize     string   `json:"pack_size"`
		Note         string   `json:"note"`
	}
	type MaterialReq struct {
		Manufacturer string `json:"manufacturer"`
		MaterialType string `json:"material_type"`
		Color        string `json:"color"`
	}
	type Req struct {
		SKU            string       `json:"sku"`
		Name           string       `json:"name"`
		ManagedUnit    string       `json:"managed_unit"`
		PackQty        *float64     `json:"pack_qty"`
		RevCode        string       `json:"rev_code"`
		StockManaged   bool         `json:"stock_managed"`
		IsSellable     bool         `json:"is_sellable"`
		IsFinal        bool         `json:"is_final"`
		OutputCategory string       `json:"output_category"`
		Note           string       `json:"note"`
		Assembly       *AssemblyReq `json:"assembly"`
		Material       *MaterialReq `json:"material"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		idStr := chi.URLParam(r, "id")
		itemID, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil || itemID <= 0 {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var req Req
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}

		req.SKU = strings.TrimSpace(req.SKU)
		req.Name = strings.TrimSpace(req.Name)
		req.ManagedUnit = strings.TrimSpace(req.ManagedUnit)
		req.RevCode = strings.TrimSpace(req.RevCode)
		req.Note = strings.TrimSpace(req.Note)
		req.OutputCategory = strings.TrimSpace(req.OutputCategory)
		if req.SKU == "" || req.Name == "" {
			http.Error(w, "sku and name required", http.StatusBadRequest)
			return
		}
		if req.ManagedUnit != "g" && req.ManagedUnit != "pcs" {
			http.Error(w, "managed_unit must be g or pcs", http.StatusBadRequest)
			return
		}
		if req.PackQty != nil && *req.PackQty <= 0 {
			http.Error(w, "pack_qty must be > 0", http.StatusBadRequest)
			return
		}
		if req.Assembly != nil && req.Assembly.TotalWeight != nil && *req.Assembly.TotalWeight <= 0 {
			http.Error(w, "assembly.total_weight must be > 0", http.StatusBadRequest)
			return
		}

		tx, err := dbx.BeginTx(r.Context(), nil)
		if err != nil {
			http.Error(w, "failed to begin transaction", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		var itemType string
		if err := tx.QueryRow(`SELECT item_type FROM items WHERE item_id = ?`, itemID).Scan(&itemType); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "item not found", http.StatusNotFound)
				return
			}
			http.Error(w, "failed to load item", http.StatusInternalServerError)
			return
		}

		sm := 0
		if req.StockManaged {
			sm = 1
		}
		sellable := 0
		if req.IsSellable {
			sellable = 1
		}
		final := 0
		if req.IsFinal {
			final = 1
		}
		var packQty any = nil
		if req.PackQty != nil {
			packQty = *req.PackQty
		}

		if _, err := tx.Exec(`
UPDATE items
SET sku = ?, name = ?, stock_managed = ?, is_sellable = ?, is_final = ?, output_category = ?, pack_qty = ?, managed_unit = ?, rev_code = ?, note = ?
WHERE item_id = ?
`, req.SKU, req.Name, sm, sellable, final, req.OutputCategory, packQty, req.ManagedUnit, req.RevCode, req.Note, itemID); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		switch itemType {
		case "assembly":
			manufacturer := ""
			var totalWeight any = nil
			packSize := ""
			assemblyNote := ""
			if req.Assembly != nil {
				manufacturer = strings.TrimSpace(req.Assembly.Manufacturer)
				if req.Assembly.TotalWeight != nil {
					totalWeight = *req.Assembly.TotalWeight
				}
				packSize = strings.TrimSpace(req.Assembly.PackSize)
				assemblyNote = strings.TrimSpace(req.Assembly.Note)
			}
			if _, err := tx.Exec(`
INSERT INTO assemblies(item_id, manufacturer, total_weight, pack_size, note)
VALUES(?,?,?,?,?)
ON CONFLICT(item_id) DO UPDATE SET
  manufacturer = excluded.manufacturer,
  total_weight = excluded.total_weight,
  pack_size = excluded.pack_size,
  note = excluded.note
`, itemID, manufacturer, totalWeight, packSize, assemblyNote); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
		case "material":
			manufacturer := ""
			materialType := ""
			color := ""
			if req.Material != nil {
				manufacturer = strings.TrimSpace(req.Material.Manufacturer)
				materialType = strings.TrimSpace(req.Material.MaterialType)
				color = strings.TrimSpace(req.Material.Color)
			}
			if _, err := tx.Exec(`
INSERT INTO materials(item_id, manufacturer, material_type, color)
VALUES(?,?,?,?)
ON CONFLICT(item_id) DO UPDATE SET
  manufacturer = excluded.manufacturer,
  material_type = excluded.material_type,
  color = excluded.color
`, itemID, manufacturer, materialType, color); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
		}

		if err := tx.Commit(); err != nil {
			http.Error(w, "failed to commit transaction", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
