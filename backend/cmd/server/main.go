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
	ID           int64           `json:"id"`
	SeriesID     *int64          `json:"series_id,omitempty"`
	SKU          string          `json:"sku"`
	Name         string          `json:"name"`
	Category     string          `json:"category"` // material / part / product
	PackQty      *float64        `json:"pack_qty,omitempty"`
	ManagedUnit  string          `json:"managed_unit"` // g / pcs
	RevCode      string          `json:"rev_code,omitempty"`
	StockManaged bool            `json:"stock_managed"` // true/false
	Note         string          `json:"note,omitempty"`
	CreatedAt    string          `json:"created_at,omitempty"`
	UpdatedAt    string          `json:"updated_at,omitempty"`
	Product      *ProductDetail  `json:"product,omitempty"`
	Material     *MaterialDetail `json:"material,omitempty"`
	Part         *PartDetail     `json:"part,omitempty"`
}

type ProductDetail struct {
	TotalWeight *float64 `json:"total_weight,omitempty"`
	PackSize    string   `json:"pack_size,omitempty"`
	Note        string   `json:"note,omitempty"`
}

type MaterialDetail struct {
	Manufacturer string `json:"manufacturer,omitempty"`
	MaterialType string `json:"material_type,omitempty"`
	Color        string `json:"color,omitempty"`
}

type PartDetail struct {
	Manufacturer string `json:"manufacturer,omitempty"`
	Note         string `json:"note,omitempty"`
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

	// publicで事故りやすいので DEV の時だけ有効にする
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

func createItem(dbx *sql.DB) http.HandlerFunc {
	type ProductReq struct {
		TotalWeight *float64 `json:"total_weight"`
		PackSize    string   `json:"pack_size"`
		Note        string   `json:"note"`
	}
	type MaterialReq struct {
		Manufacturer string `json:"manufacturer"`
		MaterialType string `json:"material_type"`
		Color        string `json:"color"`
	}
	type PartReq struct {
		Manufacturer string `json:"manufacturer"`
		Note         string `json:"note"`
	}

	type Req struct {
		SeriesID     *int64       `json:"series_id"`
		SKU          string       `json:"sku"`
		Name         string       `json:"name"`
		Category     string       `json:"category"`     // material/part/product
		ManagedUnit  string       `json:"managed_unit"` // g/pcs
		BaseUnit     string       `json:"base_unit"`    // legacy alias
		PackQty      *float64     `json:"pack_qty"`     // optional
		RevCode      string       `json:"rev_code"`
		StockManaged *bool        `json:"stock_managed"` // optional
		Note         string       `json:"note"`
		Product      *ProductReq  `json:"product"`
		Material     *MaterialReq `json:"material"`
		Part         *PartReq     `json:"part"`
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
		if req.SKU == "" || req.Name == "" {
			http.Error(w, "sku and name required", http.StatusBadRequest)
			return
		}

		// defaults
		if req.Category == "" {
			req.Category = "product"
		}
		if req.Category != "material" && req.Category != "part" && req.Category != "product" {
			http.Error(w, "category must be material, part, or product", http.StatusBadRequest)
			return
		}
		unit := req.ManagedUnit
		if unit == "" {
			unit = req.BaseUnit // backward compatibility
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
		if req.Product != nil && req.Product.TotalWeight != nil && *req.Product.TotalWeight <= 0 {
			http.Error(w, "product.total_weight must be > 0", http.StatusBadRequest)
			return
		}
		stockManaged := true
		if req.StockManaged != nil {
			stockManaged = *req.StockManaged
		}

		// bool -> 0/1 for sqlite
		sm := 0
		if stockManaged {
			sm = 1
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
INSERT INTO items(series_id, sku, name, category, stock_managed, pack_qty, managed_unit, rev_code, note)
VALUES(?,?,?,?,?,?,?,?,?)
`, seriesID, req.SKU, req.Name, req.Category, sm, packQty, unit, req.RevCode, req.Note)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		id, _ := res.LastInsertId()
		switch req.Category {
		case "product":
			var totalWeight any = nil
			packSize := ""
			productNote := ""
			if req.Product != nil {
				if req.Product.TotalWeight != nil {
					totalWeight = *req.Product.TotalWeight
				}
				packSize = strings.TrimSpace(req.Product.PackSize)
				productNote = strings.TrimSpace(req.Product.Note)
			}
			if _, err := tx.Exec(`
INSERT INTO products(item_id, total_weight, pack_size, note)
VALUES(?,?,?,?)
`, id, totalWeight, packSize, productNote); err != nil {
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
INSERT INTO material(item_id, manufacturer, material_type, color)
VALUES(?,?,?,?)
`, id, manufacturer, materialType, color); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
		case "part":
			manufacturer := ""
			partNote := ""
			if req.Part != nil {
				manufacturer = strings.TrimSpace(req.Part.Manufacturer)
				partNote = strings.TrimSpace(req.Part.Note)
			}
			if _, err := tx.Exec(`
INSERT INTO parts(item_id, manufacturer, note)
VALUES(?,?,?)
`, id, manufacturer, partNote); err != nil {
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
			ID:           id,
			SeriesID:     req.SeriesID,
			SKU:          req.SKU,
			Name:         req.Name,
			Category:     req.Category,
			PackQty:      req.PackQty,
			ManagedUnit:  unit,
			RevCode:      req.RevCode,
			StockManaged: stockManaged,
			Note:         req.Note,
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
  i.category,
  i.pack_qty,
  i.managed_unit,
  i.rev_code,
  i.stock_managed,
  i.note,
  i.created_at,
  i.updated_at,
  p.total_weight,
  p.pack_size,
  p.note,
  m.manufacturer,
  m.material_type,
  m.color,
  pt.manufacturer,
  pt.note
FROM items i
LEFT JOIN products p ON p.item_id = i.item_id
LEFT JOIN material m ON m.item_id = i.item_id
LEFT JOIN parts pt ON pt.item_id = i.item_id
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
			var category sql.NullString
			var packQty sql.NullFloat64
			var managedUnit sql.NullString
			var revCode sql.NullString
			var note sql.NullString
			var createdAt sql.NullString
			var updatedAt sql.NullString
			var productTotalWeight sql.NullFloat64
			var productPackSize sql.NullString
			var productNote sql.NullString
			var materialManufacturer sql.NullString
			var materialType sql.NullString
			var materialColor sql.NullString
			var partManufacturer sql.NullString
			var partNote sql.NullString
			var sm int
			if err := rows.Scan(
				&it.ID,
				&seriesID,
				&sku,
				&name,
				&category,
				&packQty,
				&managedUnit,
				&revCode,
				&sm,
				&note,
				&createdAt,
				&updatedAt,
				&productTotalWeight,
				&productPackSize,
				&productNote,
				&materialManufacturer,
				&materialType,
				&materialColor,
				&partManufacturer,
				&partNote,
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
			if category.Valid {
				it.Category = category.String
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
			if note.Valid {
				it.Note = note.String
			}
			if createdAt.Valid {
				it.CreatedAt = createdAt.String
			}
			if updatedAt.Valid {
				it.UpdatedAt = updatedAt.String
			}
			if productTotalWeight.Valid || productPackSize.Valid || productNote.Valid {
				it.Product = &ProductDetail{
					PackSize: productPackSize.String,
					Note:     productNote.String,
				}
				if productTotalWeight.Valid {
					tw := productTotalWeight.Float64
					it.Product.TotalWeight = &tw
				}
			}
			if materialManufacturer.Valid || materialType.Valid || materialColor.Valid {
				it.Material = &MaterialDetail{
					Manufacturer: materialManufacturer.String,
					MaterialType: materialType.String,
					Color:        materialColor.String,
				}
			}
			if partManufacturer.Valid || partNote.Valid {
				it.Part = &PartDetail{
					Manufacturer: partManufacturer.String,
					Note:         partNote.String,
				}
			}
			it.StockManaged = (sm != 0)
			out = append(out, it)
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	}
}

func updateItem(dbx *sql.DB) http.HandlerFunc {
	type ProductReq struct {
		TotalWeight *float64 `json:"total_weight"`
		PackSize    string   `json:"pack_size"`
		Note        string   `json:"note"`
	}
	type MaterialReq struct {
		Manufacturer string `json:"manufacturer"`
		MaterialType string `json:"material_type"`
		Color        string `json:"color"`
	}
	type PartReq struct {
		Manufacturer string `json:"manufacturer"`
		Note         string `json:"note"`
	}
	type Req struct {
		SKU          string       `json:"sku"`
		Name         string       `json:"name"`
		ManagedUnit  string       `json:"managed_unit"`
		PackQty      *float64     `json:"pack_qty"`
		RevCode      string       `json:"rev_code"`
		StockManaged bool         `json:"stock_managed"`
		Note         string       `json:"note"`
		Product      *ProductReq  `json:"product"`
		Material     *MaterialReq `json:"material"`
		Part         *PartReq     `json:"part"`
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
		if req.Product != nil && req.Product.TotalWeight != nil && *req.Product.TotalWeight <= 0 {
			http.Error(w, "product.total_weight must be > 0", http.StatusBadRequest)
			return
		}

		tx, err := dbx.BeginTx(r.Context(), nil)
		if err != nil {
			http.Error(w, "failed to begin transaction", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		var category string
		if err := tx.QueryRow(`SELECT category FROM items WHERE item_id = ?`, itemID).Scan(&category); err != nil {
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
		var packQty any = nil
		if req.PackQty != nil {
			packQty = *req.PackQty
		}

		if _, err := tx.Exec(`
UPDATE items
SET sku = ?, name = ?, stock_managed = ?, pack_qty = ?, managed_unit = ?, rev_code = ?, note = ?
WHERE item_id = ?
`, req.SKU, req.Name, sm, packQty, req.ManagedUnit, req.RevCode, req.Note, itemID); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		switch category {
		case "product":
			var totalWeight any = nil
			packSize := ""
			productNote := ""
			if req.Product != nil {
				if req.Product.TotalWeight != nil {
					totalWeight = *req.Product.TotalWeight
				}
				packSize = strings.TrimSpace(req.Product.PackSize)
				productNote = strings.TrimSpace(req.Product.Note)
			}
			if _, err := tx.Exec(`
INSERT INTO products(item_id, total_weight, pack_size, note)
VALUES(?,?,?,?)
ON CONFLICT(item_id) DO UPDATE SET
  total_weight = excluded.total_weight,
  pack_size = excluded.pack_size,
  note = excluded.note
`, itemID, totalWeight, packSize, productNote); err != nil {
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
INSERT INTO material(item_id, manufacturer, material_type, color)
VALUES(?,?,?,?)
ON CONFLICT(item_id) DO UPDATE SET
  manufacturer = excluded.manufacturer,
  material_type = excluded.material_type,
  color = excluded.color
`, itemID, manufacturer, materialType, color); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
		case "part":
			manufacturer := ""
			partNote := ""
			if req.Part != nil {
				manufacturer = strings.TrimSpace(req.Part.Manufacturer)
				partNote = strings.TrimSpace(req.Part.Note)
			}
			if _, err := tx.Exec(`
INSERT INTO parts(item_id, manufacturer, note)
VALUES(?,?,?)
ON CONFLICT(item_id) DO UPDATE SET
  manufacturer = excluded.manufacturer,
  note = excluded.note
`, itemID, manufacturer, partNote); err != nil {
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
