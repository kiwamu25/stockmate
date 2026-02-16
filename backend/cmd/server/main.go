package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"stockmate/internal/db"
)

type Item struct {
	ID           int64  `json:"id"`
	SKU          string `json:"sku"`
	Name         string `json:"name"`
	Category     string `json:"category"`      // material / part / product
	BaseUnit     string `json:"base_unit"`     // g / pcs
	StockManaged bool   `json:"stock_managed"` // true/false
	Note         string `json:"note,omitempty"`
	CreatedAt    string `json:"created_at,omitempty"`
	UpdatedAt    string `json:"updated_at,omitempty"`
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
		SKU          string `json:"sku"`
		Name         string `json:"name"`
		Category     string `json:"category"`      // material/part/product
		BaseUnit     string `json:"base_unit"`     // g/pcs
		StockManaged *bool  `json:"stock_managed"` // optional
		Note         string `json:"note"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		var req Req
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}

		if req.SKU == "" || req.Name == "" {
			http.Error(w, "sku and name required", http.StatusBadRequest)
			return
		}

		// defaults
		if req.Category == "" {
			req.Category = "product"
		}
		if req.BaseUnit == "" {
			req.BaseUnit = "pcs"
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

		res, err := dbx.Exec(`
INSERT INTO items(sku, name, category, base_unit, stock_managed, note)
VALUES(?,?,?,?,?,?)
`, req.SKU, req.Name, req.Category, req.BaseUnit, sm, req.Note)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		id, _ := res.LastInsertId()

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Item{
			ID:           id,
			SKU:          req.SKU,
			Name:         req.Name,
			Category:     req.Category,
			BaseUnit:     req.BaseUnit,
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
  sku,
  name,
  category,
  base_unit,
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

		var out []Item
		for rows.Next() {
			var it Item
			var sm int
			if err := rows.Scan(
				&it.ID,
				&it.SKU,
				&it.Name,
				&it.Category,
				&it.BaseUnit,
				&sm,
				&it.Note,
				&it.CreatedAt,
				&it.UpdatedAt,
			); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			it.StockManaged = (sm != 0)
			out = append(out, it)
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	}
}
