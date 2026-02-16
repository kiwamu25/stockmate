package db

import (
	"database/sql"
	"fmt"
)

const pragmaFK = `PRAGMA foreign_keys = ON;`

const createItems = `
CREATE TABLE IF NOT EXISTS items (
  item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('material','part','product')),
  base_unit TEXT NOT NULL CHECK (base_unit IN ('g','pcs')),
  stock_managed INTEGER NOT NULL DEFAULT 1 CHECK (stock_managed IN (0,1)),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

// updated_at 自動更新（SQLiteは ON UPDATE が無いのでトリガ）
const triggerItemsUpdatedAt = `
CREATE TRIGGER IF NOT EXISTS trg_items_updated_at
AFTER UPDATE ON items
FOR EACH ROW
BEGIN
  UPDATE items SET updated_at = datetime('now') WHERE item_id = OLD.item_id;
END;
`

const createStockTransactions = `
CREATE TABLE IF NOT EXISTS stock_transactions (
  transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  qty REAL NOT NULL, -- gもpcsもここ。pcsは整数運用
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('IN','OUT','ADJUST')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(item_id)
);
`

const createIdxStockTransactionsItem = `
CREATE INDEX IF NOT EXISTS idx_st_item ON stock_transactions(item_id);
`

const createPartBOM = `
CREATE TABLE IF NOT EXISTS part_bom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_item_id INTEGER NOT NULL,
  material_item_id INTEGER NOT NULL,
  qty_g REAL NOT NULL,
  loss_rate REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (part_item_id) REFERENCES items(item_id),
  FOREIGN KEY (material_item_id) REFERENCES items(item_id),
  UNIQUE (part_item_id, material_item_id)
);
`

const createProductBOM = `
CREATE TABLE IF NOT EXISTS product_bom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_item_id INTEGER NOT NULL,
  part_item_id INTEGER NOT NULL,
  qty_pcs INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_item_id) REFERENCES items(item_id),
  FOREIGN KEY (part_item_id) REFERENCES items(item_id),
  UNIQUE (product_item_id, part_item_id)
);
`

func Migrate(db *sql.DB) error {
	stmts := []struct {
		name string
		sql  string
	}{
		{"pragma foreign_keys", pragmaFK},
		{"create items", createItems},
		{"trigger items.updated_at", triggerItemsUpdatedAt},
		{"create stock_transactions", createStockTransactions},
		{"index stock_transactions(item_id)", createIdxStockTransactionsItem},
		{"create part_bom", createPartBOM},
		{"create product_bom", createProductBOM},
	}

	for _, s := range stmts {
		if _, err := db.Exec(s.sql); err != nil {
			return fmt.Errorf("migration failed at %s: %w", s.name, err)
		}
	}
	return nil
}
