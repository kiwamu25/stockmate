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
	ID             int64            `json:"id"`
	SeriesID       *int64           `json:"series_id,omitempty"`
	SKU            string           `json:"sku"`
	Name           string           `json:"name"`
	ItemType       string           `json:"item_type"`
	PackQty        *float64         `json:"pack_qty,omitempty"`
	ManagedUnit    string           `json:"managed_unit"`
	RevCode        string           `json:"rev_code,omitempty"`
	StockManaged   bool             `json:"stock_managed"`
	IsSellable     bool             `json:"is_sellable"`
	IsFinal        bool             `json:"is_final"`
	OutputCategory string           `json:"output_category,omitempty"`
	Note           string           `json:"note,omitempty"`
	CreatedAt      string           `json:"created_at,omitempty"`
	UpdatedAt      string           `json:"updated_at,omitempty"`
	Assembly       *AssemblyDetail  `json:"assembly,omitempty"`
	Component      *ComponentDetail `json:"component,omitempty"`
}

type AssemblyDetail struct {
	Manufacturer string   `json:"manufacturer,omitempty"`
	TotalWeight  *float64 `json:"total_weight,omitempty"`
	PackSize     string   `json:"pack_size,omitempty"`
	Note         string   `json:"note,omitempty"`
}

type ComponentDetail struct {
	Manufacturer  string `json:"manufacturer,omitempty"`
	ComponentType string `json:"component_type,omitempty"`
	Color         string `json:"color,omitempty"`
}

type AssemblyComponent struct {
	ComponentItemID int64   `json:"component_item_id"`
	SKU             string  `json:"sku"`
	Name            string  `json:"name"`
	ItemType        string  `json:"item_type"`
	ManagedUnit     string  `json:"managed_unit"`
	QtyPerUnit      float64 `json:"qty_per_unit"`
	Note            string  `json:"note,omitempty"`
}

type AssemblyRevision struct {
	RecordID       int64  `json:"record_id"`
	RevNo          int64  `json:"rev_no"`
	CreatedAt      string `json:"created_at"`
	ComponentCount int64  `json:"component_count"`
}

type AssemblyComponentSet struct {
	ParentItemID     int64               `json:"parent_item_id"`
	CurrentRecordID  *int64              `json:"current_record_id,omitempty"`
	CurrentRevNo     *int64              `json:"current_rev_no,omitempty"`
	CurrentCreatedAt string              `json:"current_created_at,omitempty"`
	Revisions        []AssemblyRevision  `json:"revisions"`
	Components       []AssemblyComponent `json:"components"`
}

type AssemblyStock struct {
	ItemID    int64   `json:"item_id"`
	SKU       string  `json:"sku"`
	Name      string  `json:"name"`
	StockQty  float64 `json:"stock_qty"`
	UpdatedAt string  `json:"updated_at,omitempty"`
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
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
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
	r.Get("/api/assemblies", listAssemblies(conn))
	r.Get("/api/assemblies/{id}/components", getAssemblyComponents(conn))
	r.Put("/api/assemblies/{id}/components", createAssemblyComponentsRevision(conn))
	r.Delete("/api/assemblies/{id}/components/{rev}", deleteAssemblyComponentsRevision(conn))
	r.Get("/api/assemblies/stock", listAssemblyStock(conn))
	r.Post("/api/assemblies/{id}/adjust", adjustAssemblyStock(conn))
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
	if itemType != "component" && itemType != "assembly" {
		return "", fmt.Errorf("item_type must be component or assembly")
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
	type ComponentReq struct {
		Manufacturer  string `json:"manufacturer"`
		ComponentType string `json:"component_type"`
		Color         string `json:"color"`
	}

	type Req struct {
		SeriesID       *int64        `json:"series_id"`
		SKU            string        `json:"sku"`
		Name           string        `json:"name"`
		ItemType       string        `json:"item_type"`
		ManagedUnit    string        `json:"managed_unit"`
		BaseUnit       string        `json:"base_unit"`
		PackQty        *float64      `json:"pack_qty"`
		RevCode        string        `json:"rev_code"`
		StockManaged   *bool         `json:"stock_managed"`
		IsSellable     bool          `json:"is_sellable"`
		IsFinal        bool          `json:"is_final"`
		OutputCategory string        `json:"output_category"`
		Note           string        `json:"note"`
		Assembly       *AssemblyReq  `json:"assembly"`
		Component      *ComponentReq `json:"component"`
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
		case "component":
			manufacturer := ""
			componentType := "material"
			color := ""
			if req.Component != nil {
				manufacturer = strings.TrimSpace(req.Component.Manufacturer)
				componentType = strings.TrimSpace(req.Component.ComponentType)
				color = strings.TrimSpace(req.Component.Color)
			}
			if componentType == "" {
				componentType = "material"
			}
			if componentType != "part" && componentType != "material" {
				http.Error(w, "component.component_type must be part or material", http.StatusBadRequest)
				return
			}
			if _, err := tx.Exec(`
INSERT INTO components(item_id, manufacturer, component_type, color)
VALUES(?,?,?,?)
`, id, manufacturer, componentType, color); err != nil {
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
  c.manufacturer,
  c.component_type,
  c.color
FROM items i
LEFT JOIN assemblies a ON a.item_id = i.item_id
LEFT JOIN components c ON c.item_id = i.item_id
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
			var componentManufacturer sql.NullString
			var componentType sql.NullString
			var componentColor sql.NullString
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
				&componentManufacturer,
				&componentType,
				&componentColor,
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
			if componentManufacturer.Valid || componentType.Valid || componentColor.Valid {
				it.Component = &ComponentDetail{
					Manufacturer:  componentManufacturer.String,
					ComponentType: componentType.String,
					Color:         componentColor.String,
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

func listAssemblies(dbx *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		manufacturer := strings.TrimSpace(r.URL.Query().Get("manufacturer"))
		finalStr := strings.TrimSpace(r.URL.Query().Get("final"))
		sellableStr := strings.TrimSpace(r.URL.Query().Get("sellable"))
		managedStr := strings.TrimSpace(r.URL.Query().Get("managed"))

		limit := 50
		if limitStr := strings.TrimSpace(r.URL.Query().Get("limit")); limitStr != "" {
			v, err := strconv.Atoi(limitStr)
			if err != nil || v <= 0 {
				http.Error(w, "invalid limit", http.StatusBadRequest)
				return
			}
			if v > 200 {
				v = 200
			}
			limit = v
		}

		sb := strings.Builder{}
		sb.WriteString(`
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
  a.note
FROM items i
JOIN assemblies a ON a.item_id = i.item_id
WHERE i.item_type = 'assembly'
`)
		args := make([]any, 0)
		if q != "" {
			sb.WriteString(" AND (i.sku LIKE ? OR i.name LIKE ?)")
			like := "%" + q + "%"
			args = append(args, like, like)
		}
		if manufacturer != "" {
			sb.WriteString(" AND a.manufacturer LIKE ?")
			args = append(args, "%"+manufacturer+"%")
		}

		parseBool := func(name string, value string) (valid bool, b bool, err error) {
			if value == "" {
				return false, false, nil
			}
			switch strings.ToLower(value) {
			case "1", "true", "yes":
				return true, true, nil
			case "0", "false", "no":
				return true, false, nil
			default:
				return false, false, fmt.Errorf("invalid %s", name)
			}
		}
		if valid, b, err := parseBool("final", finalStr); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		} else if valid {
			sb.WriteString(" AND i.is_final = ?")
			if b {
				args = append(args, 1)
			} else {
				args = append(args, 0)
			}
		}
		if valid, b, err := parseBool("sellable", sellableStr); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		} else if valid {
			sb.WriteString(" AND i.is_sellable = ?")
			if b {
				args = append(args, 1)
			} else {
				args = append(args, 0)
			}
		}
		if valid, b, err := parseBool("managed", managedStr); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		} else if valid {
			sb.WriteString(" AND i.stock_managed = ?")
			if b {
				args = append(args, 1)
			} else {
				args = append(args, 0)
			}
		}

		sb.WriteString(" ORDER BY i.item_id DESC LIMIT ?")
		args = append(args, limit)

		rows, err := dbx.Query(sb.String(), args...)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		out := make([]Item, 0)
		for rows.Next() {
			var it Item
			var seriesID sql.NullInt64
			var packQty sql.NullFloat64
			var revCode sql.NullString
			var outputCategory sql.NullString
			var note sql.NullString
			var createdAt sql.NullString
			var updatedAt sql.NullString
			var assemblyManufacturer sql.NullString
			var assemblyTotalWeight sql.NullFloat64
			var assemblyPackSize sql.NullString
			var assemblyNote sql.NullString
			var sm int
			var sellable int
			var final int
			if err := rows.Scan(
				&it.ID,
				&seriesID,
				&it.SKU,
				&it.Name,
				&it.ItemType,
				&packQty,
				&it.ManagedUnit,
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
			); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if seriesID.Valid {
				sid := seriesID.Int64
				it.SeriesID = &sid
			}
			if packQty.Valid {
				pq := packQty.Float64
				it.PackQty = &pq
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
			it.StockManaged = sm != 0
			it.IsSellable = sellable != 0
			it.IsFinal = final != 0
			it.Assembly = &AssemblyDetail{
				Manufacturer: assemblyManufacturer.String,
				PackSize:     assemblyPackSize.String,
				Note:         assemblyNote.String,
			}
			if assemblyTotalWeight.Valid {
				tw := assemblyTotalWeight.Float64
				it.Assembly.TotalWeight = &tw
			}
			out = append(out, it)
		}
		if err := rows.Err(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
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
	type ComponentReq struct {
		Manufacturer  string `json:"manufacturer"`
		ComponentType string `json:"component_type"`
		Color         string `json:"color"`
	}
	type Req struct {
		SKU            string        `json:"sku"`
		Name           string        `json:"name"`
		ManagedUnit    string        `json:"managed_unit"`
		PackQty        *float64      `json:"pack_qty"`
		RevCode        string        `json:"rev_code"`
		StockManaged   bool          `json:"stock_managed"`
		IsSellable     bool          `json:"is_sellable"`
		IsFinal        bool          `json:"is_final"`
		OutputCategory string        `json:"output_category"`
		Note           string        `json:"note"`
		Assembly       *AssemblyReq  `json:"assembly"`
		Component      *ComponentReq `json:"component"`
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
		case "component":
			manufacturer := ""
			componentType := "material"
			color := ""
			if req.Component != nil {
				manufacturer = strings.TrimSpace(req.Component.Manufacturer)
				componentType = strings.TrimSpace(req.Component.ComponentType)
				color = strings.TrimSpace(req.Component.Color)
			}
			if componentType == "" {
				componentType = "material"
			}
			if componentType != "part" && componentType != "material" {
				http.Error(w, "component.component_type must be part or material", http.StatusBadRequest)
				return
			}
			if _, err := tx.Exec(`
INSERT INTO components(item_id, manufacturer, component_type, color)
VALUES(?,?,?,?)
ON CONFLICT(item_id) DO UPDATE SET
  manufacturer = excluded.manufacturer,
  component_type = excluded.component_type,
  color = excluded.color
`, itemID, manufacturer, componentType, color); err != nil {
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

func listAssemblyStock(dbx *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		limit := 50
		if limitStr := strings.TrimSpace(r.URL.Query().Get("limit")); limitStr != "" {
			v, err := strconv.Atoi(limitStr)
			if err != nil || v <= 0 {
				http.Error(w, "invalid limit", http.StatusBadRequest)
				return
			}
			if v > 500 {
				v = 500
			}
			limit = v
		}

		sb := strings.Builder{}
		sb.WriteString(`
SELECT
  i.item_id,
  i.sku,
  i.name,
  COALESCE(SUM(
    CASE
      WHEN st.transaction_type = 'OUT' THEN -st.qty
      ELSE st.qty
    END
  ), 0) AS stock_qty,
  MAX(st.created_at) AS updated_at
FROM items i
LEFT JOIN stock_transactions st ON st.item_id = i.item_id
WHERE i.item_type = 'assembly'
`)
		args := make([]any, 0)
		if q != "" {
			sb.WriteString(" AND (i.sku LIKE ? OR i.name LIKE ?)")
			like := "%" + q + "%"
			args = append(args, like, like)
		}
		sb.WriteString(`
GROUP BY i.item_id, i.sku, i.name
ORDER BY i.item_id DESC
LIMIT ?
`)
		args = append(args, limit)

		rows, err := dbx.Query(sb.String(), args...)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		out := make([]AssemblyStock, 0)
		for rows.Next() {
			var row AssemblyStock
			var updatedAt sql.NullString
			if err := rows.Scan(&row.ItemID, &row.SKU, &row.Name, &row.StockQty, &updatedAt); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if updatedAt.Valid {
				row.UpdatedAt = updatedAt.String
			}
			out = append(out, row)
		}
		if err := rows.Err(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	}
}

func adjustAssemblyStock(dbx *sql.DB) http.HandlerFunc {
	type Req struct {
		Direction string  `json:"direction"`
		Qty       float64 `json:"qty"`
		Note      string  `json:"note"`
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
		req.Direction = strings.ToUpper(strings.TrimSpace(req.Direction))
		req.Note = strings.TrimSpace(req.Note)
		if req.Direction != "IN" && req.Direction != "OUT" {
			http.Error(w, "direction must be IN or OUT", http.StatusBadRequest)
			return
		}
		if req.Qty <= 0 {
			http.Error(w, "qty must be > 0", http.StatusBadRequest)
			return
		}

		var itemType string
		if err := dbx.QueryRow(`SELECT item_type FROM items WHERE item_id = ?`, itemID).Scan(&itemType); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "item not found", http.StatusNotFound)
				return
			}
			http.Error(w, "failed to load item", http.StatusInternalServerError)
			return
		}
		if itemType != "assembly" {
			http.Error(w, "item must be assembly", http.StatusBadRequest)
			return
		}

		var currentStock float64
		if err := dbx.QueryRow(`
SELECT COALESCE(SUM(
  CASE WHEN transaction_type = 'OUT' THEN -qty ELSE qty END
), 0)
FROM stock_transactions
WHERE item_id = ?
`, itemID).Scan(&currentStock); err != nil {
			http.Error(w, "failed to compute current stock", http.StatusInternalServerError)
			return
		}
		if req.Direction == "OUT" && currentStock < req.Qty {
			http.Error(w, "insufficient stock: cannot go below zero", http.StatusBadRequest)
			return
		}

		if _, err := dbx.Exec(`
INSERT INTO stock_transactions(item_id, qty, transaction_type, note)
VALUES(?,?,?,?)
`, itemID, req.Qty, req.Direction, req.Note); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		var stockQty float64
		if err := dbx.QueryRow(`
SELECT COALESCE(SUM(
  CASE WHEN transaction_type = 'OUT' THEN -qty ELSE qty END
), 0)
FROM stock_transactions
WHERE item_id = ?
`, itemID).Scan(&stockQty); err != nil {
			http.Error(w, "failed to compute stock", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"item_id":   itemID,
			"stock_qty": stockQty,
		})
	}
}

func getAssemblyComponents(dbx *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idStr := chi.URLParam(r, "id")
		parentItemID, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil || parentItemID <= 0 {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var parentType string
		if err := dbx.QueryRow(`SELECT item_type FROM items WHERE item_id = ?`, parentItemID).Scan(&parentType); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "item not found", http.StatusNotFound)
				return
			}
			http.Error(w, "failed to load item", http.StatusInternalServerError)
			return
		}
		if parentType != "assembly" {
			http.Error(w, "item must be assembly", http.StatusBadRequest)
			return
		}

		revisions := make([]AssemblyRevision, 0)
		revRows, err := dbx.Query(`
SELECT
  ar.record_id,
  ar.rev_no,
  ar.created_at,
  COALESCE(COUNT(ac.component_item_id), 0) AS component_count
FROM assembly_records ar
LEFT JOIN assembly_components ac ON ac.record_id = ar.record_id
WHERE ar.item_id = ?
GROUP BY ar.record_id, ar.rev_no, ar.created_at
ORDER BY ar.rev_no DESC
`, parentItemID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		for revRows.Next() {
			var row AssemblyRevision
			if err := revRows.Scan(&row.RecordID, &row.RevNo, &row.CreatedAt, &row.ComponentCount); err != nil {
				revRows.Close()
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			revisions = append(revisions, row)
		}
		if err := revRows.Err(); err != nil {
			revRows.Close()
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := revRows.Close(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		resp := AssemblyComponentSet{
			ParentItemID: parentItemID,
			Revisions:    revisions,
			Components:   make([]AssemblyComponent, 0),
		}
		if len(revisions) == 0 {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(resp)
			return
		}

		targetRevNo := int64(0)
		if revNoStr := strings.TrimSpace(r.URL.Query().Get("rev_no")); revNoStr != "" {
			v, err := strconv.ParseInt(revNoStr, 10, 64)
			if err != nil || v <= 0 {
				http.Error(w, "invalid rev_no", http.StatusBadRequest)
				return
			}
			targetRevNo = v
		} else {
			targetRevNo = revisions[0].RevNo
		}

		var recordID int64
		var createdAt string
		if err := dbx.QueryRow(`
SELECT record_id, created_at
FROM assembly_records
WHERE item_id = ? AND rev_no = ?
`, parentItemID, targetRevNo).Scan(&recordID, &createdAt); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "revision not found", http.StatusNotFound)
				return
			}
			http.Error(w, "failed to load revision", http.StatusInternalServerError)
			return
		}

		resp.CurrentRecordID = &recordID
		resp.CurrentRevNo = &targetRevNo
		resp.CurrentCreatedAt = createdAt

		rows, err := dbx.Query(`
SELECT
  ac.component_item_id,
  i.sku,
  i.name,
  i.item_type,
  i.managed_unit,
  ac.qty_per_unit,
  ac.note
FROM assembly_components ac
JOIN items i ON i.item_id = ac.component_item_id
WHERE ac.record_id = ?
ORDER BY ac.component_item_id
`, recordID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		for rows.Next() {
			var row AssemblyComponent
			var note sql.NullString
			if err := rows.Scan(
				&row.ComponentItemID,
				&row.SKU,
				&row.Name,
				&row.ItemType,
				&row.ManagedUnit,
				&row.QtyPerUnit,
				&note,
			); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if note.Valid {
				row.Note = note.String
			}
			resp.Components = append(resp.Components, row)
		}
		if err := rows.Err(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}
}

func createAssemblyComponentsRevision(dbx *sql.DB) http.HandlerFunc {
	type ComponentReq struct {
		ComponentItemID int64   `json:"component_item_id"`
		QtyPerUnit      float64 `json:"qty_per_unit"`
		Note            string  `json:"note"`
	}
	type Req struct {
		Components []ComponentReq `json:"components"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		idStr := chi.URLParam(r, "id")
		parentItemID, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil || parentItemID <= 0 {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var req Req
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}

		var parentType string
		if err := dbx.QueryRow(`SELECT item_type FROM items WHERE item_id = ?`, parentItemID).Scan(&parentType); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "item not found", http.StatusNotFound)
				return
			}
			http.Error(w, "failed to load item", http.StatusInternalServerError)
			return
		}
		if parentType != "assembly" {
			http.Error(w, "item must be assembly", http.StatusBadRequest)
			return
		}
		if len(req.Components) == 0 {
			http.Error(w, "components are required", http.StatusBadRequest)
			return
		}

		seen := make(map[int64]struct{}, len(req.Components))
		for _, c := range req.Components {
			if c.ComponentItemID <= 0 {
				http.Error(w, "component_item_id must be > 0", http.StatusBadRequest)
				return
			}
			if c.ComponentItemID == parentItemID {
				http.Error(w, "self reference is not allowed", http.StatusBadRequest)
				return
			}
			if c.QtyPerUnit <= 0 {
				http.Error(w, "qty_per_unit must be > 0", http.StatusBadRequest)
				return
			}
			if _, exists := seen[c.ComponentItemID]; exists {
				http.Error(w, "duplicate component_item_id is not allowed", http.StatusBadRequest)
				return
			}
			seen[c.ComponentItemID] = struct{}{}

			var exists int
			if err := dbx.QueryRow(`SELECT COUNT(1) FROM items WHERE item_id = ?`, c.ComponentItemID).Scan(&exists); err != nil {
				http.Error(w, "failed to validate component item", http.StatusInternalServerError)
				return
			}
			if exists == 0 {
				http.Error(w, fmt.Sprintf("component item not found: %d", c.ComponentItemID), http.StatusBadRequest)
				return
			}
		}

		tx, err := dbx.BeginTx(r.Context(), nil)
		if err != nil {
			http.Error(w, "failed to begin transaction", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		var nextRevNo int64
		if err := tx.QueryRow(`
SELECT COALESCE(MAX(rev_no), 0) + 1
FROM assembly_records
WHERE item_id = ?
`, parentItemID).Scan(&nextRevNo); err != nil {
			http.Error(w, "failed to compute next revision", http.StatusInternalServerError)
			return
		}

		res, err := tx.Exec(`
INSERT INTO assembly_records(item_id, rev_no)
VALUES(?,?)
`, parentItemID, nextRevNo)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		recordID, _ := res.LastInsertId()

		for _, c := range req.Components {
			note := strings.TrimSpace(c.Note)
			if _, err := tx.Exec(`
INSERT INTO assembly_components(record_id, component_item_id, qty_per_unit, note)
VALUES(?,?,?,?)
`, recordID, c.ComponentItemID, c.QtyPerUnit, note); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
		}

		if err := tx.Commit(); err != nil {
			http.Error(w, "failed to commit transaction", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"record_id": recordID,
			"rev_no":    nextRevNo,
		})
	}
}

func deleteAssemblyComponentsRevision(dbx *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idStr := chi.URLParam(r, "id")
		parentItemID, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil || parentItemID <= 0 {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		revStr := chi.URLParam(r, "rev")
		revNo, err := strconv.ParseInt(revStr, 10, 64)
		if err != nil || revNo <= 0 {
			http.Error(w, "invalid rev", http.StatusBadRequest)
			return
		}

		var parentType string
		if err := dbx.QueryRow(`SELECT item_type FROM items WHERE item_id = ?`, parentItemID).Scan(&parentType); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "item not found", http.StatusNotFound)
				return
			}
			http.Error(w, "failed to load item", http.StatusInternalServerError)
			return
		}
		if parentType != "assembly" {
			http.Error(w, "item must be assembly", http.StatusBadRequest)
			return
		}

		tx, err := dbx.BeginTx(r.Context(), nil)
		if err != nil {
			http.Error(w, "failed to begin transaction", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		var recordID int64
		if err := tx.QueryRow(`
SELECT record_id
FROM assembly_records
WHERE item_id = ? AND rev_no = ?
`, parentItemID, revNo).Scan(&recordID); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "revision not found", http.StatusNotFound)
				return
			}
			http.Error(w, "failed to load revision", http.StatusInternalServerError)
			return
		}

		if _, err := tx.Exec(`DELETE FROM assembly_records WHERE record_id = ?`, recordID); err != nil {
			http.Error(w, "failed to delete revision", http.StatusInternalServerError)
			return
		}
		if _, err := tx.Exec(`
UPDATE assembly_records
SET rev_no = rev_no - 1
WHERE item_id = ? AND rev_no > ?
`, parentItemID, revNo); err != nil {
			http.Error(w, "failed to resequence revisions", http.StatusInternalServerError)
			return
		}

		if err := tx.Commit(); err != nil {
			http.Error(w, "failed to commit transaction", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
