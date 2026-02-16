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
	ID   int64  `json:"id"`
	SKU  string `json:"sku"`
	Name string `json:"name"`
	Unit string `json:"unit"`
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

	r.Get("/debug/dsn", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, dsn)
	})

	r.Post("/api/items", createItem(conn))
	r.Get("/api/items", listItems(conn))

	fmt.Println("listening on :8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		panic(err)
	}
}

func createItem(dbx *sql.DB) http.HandlerFunc {
	type Req struct {
		SKU  string `json:"sku"`
		Name string `json:"name"`
		Unit string `json:"unit"`
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
		if req.Unit == "" {
			req.Unit = "pcs"
		}

		res, err := dbx.Exec(`INSERT INTO items(sku, name, unit) VALUES(?,?,?)`, req.SKU, req.Name, req.Unit)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		id, _ := res.LastInsertId()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Item{ID: id, SKU: req.SKU, Name: req.Name, Unit: req.Unit})
	}
}

func listItems(dbx *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := dbx.Query(`SELECT id, sku, name, unit FROM items ORDER BY id DESC LIMIT 200`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var out []Item
		for rows.Next() {
			var it Item
			if err := rows.Scan(&it.ID, &it.SKU, &it.Name, &it.Unit); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			out = append(out, it)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	}
}
