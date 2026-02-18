package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"stockmate/internal/db"
)

type Item struct {
	ID           int64    `json:"id"`
	SeriesID     *int64   `json:"series_id,omitempty"`
	SKU          string   `json:"sku"`
	Name         string   `json:"name"`
	Category     string   `json:"category"` // material / part / product
	PackQty      *float64 `json:"pack_qty,omitempty"`
	ManagedUnit  string   `json:"managed_unit"` // g / pcs
	RevCode      string   `json:"rev_code,omitempty"`
	StockManaged bool     `json:"stock_managed"` // true/false
	Note         string   `json:"note,omitempty"`
	CreatedAt    string   `json:"created_at,omitempty"`
	UpdatedAt    string   `json:"updated_at,omitempty"`
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
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
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

	fmt.Println("listening on :8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		panic(err)
	}
}

func createItem(dbx *sql.DB) http.HandlerFunc {
	type Req struct {
		SeriesID     *int64   `json:"series_id"`
		SKU          string   `json:"sku"`
		Name         string   `json:"name"`
		Category     string   `json:"category"`     // material/part/product
		ManagedUnit  string   `json:"managed_unit"` // g/pcs
		BaseUnit     string   `json:"base_unit"`    // legacy alias
		PackQty      *float64 `json:"pack_qty"`     // optional
		RevCode      string   `json:"rev_code"`
		StockManaged *bool    `json:"stock_managed"` // optional
		Note         string   `json:"note"`
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

		res, err := dbx.Exec(`
INSERT INTO items(series_id, sku, name, category, stock_managed, pack_qty, managed_unit, rev_code, note)
VALUES(?,?,?,?,?,?,?,?,?)
`, seriesID, req.SKU, req.Name, req.Category, sm, packQty, unit, req.RevCode, req.Note)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		id, _ := res.LastInsertId()

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
  item_id AS id,
  series_id,
  sku,
  name,
  category,
  pack_qty,
  managed_unit,
  rev_code,
  stock_managed,
  note,
  created_at,
  updated_at
FROM items
ORDER BY item_id DESC
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
			var packQty sql.NullFloat64
			var sm int
			if err := rows.Scan(
				&it.ID,
				&seriesID,
				&it.SKU,
				&it.Name,
				&it.Category,
				&packQty,
				&it.ManagedUnit,
				&it.RevCode,
				&sm,
				&it.Note,
				&it.CreatedAt,
				&it.UpdatedAt,
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
			it.StockManaged = (sm != 0)
			out = append(out, it)
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	}
}
