package db

import (
	"database/sql"
	"fmt"
)

const pragmaFK = `PRAGMA foreign_keys = ON;`

const createSeries = `
CREATE TABLE IF NOT EXISTS series (
  series_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
`

const createItems = `
CREATE TABLE IF NOT EXISTS items (
  item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('component','assembly')),
  stock_managed INTEGER NOT NULL DEFAULT 1 CHECK (stock_managed IN (0,1)),
  is_sellable INTEGER NOT NULL DEFAULT 0 CHECK (is_sellable IN (0,1)),
  is_final INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0,1)),
  output_category TEXT,
  pack_qty REAL,
  managed_unit TEXT NOT NULL CHECK (managed_unit IN ('g','pcs')),
  rev_code TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (series_id) REFERENCES series(series_id)
);
`

const createIdxItemsSeries = `
CREATE INDEX IF NOT EXISTS idx_items_series ON items(series_id);
`

const triggerItemsUpdatedAt = `
CREATE TRIGGER IF NOT EXISTS trg_items_updated_at
AFTER UPDATE ON items
FOR EACH ROW
BEGIN
  UPDATE items SET updated_at = datetime('now') WHERE item_id = OLD.item_id;
END;
`

const createComponents = `
CREATE TABLE IF NOT EXISTS components (
  component_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL UNIQUE,
  manufacturer TEXT,
  component_type TEXT NOT NULL DEFAULT 'material' CHECK (component_type IN ('part','material')),
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE
);
`

const createAssemblies = `
CREATE TABLE IF NOT EXISTS assemblies (
  assembly_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL UNIQUE,
  manufacturer TEXT,
  total_weight REAL,
  pack_size TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE
);
`

const createStockTransactions = `
CREATE TABLE IF NOT EXISTS stock_transactions (
  transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  qty REAL NOT NULL CHECK (qty > 0),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('IN','OUT','ADJUST')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(item_id)
);
`

const createIdxStockTransactionsItem = `
CREATE INDEX IF NOT EXISTS idx_st_item ON stock_transactions(item_id);
`

const createAssemblyRecords = `
CREATE TABLE IF NOT EXISTS assembly_records (
  record_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  rev_no INTEGER NOT NULL CHECK (rev_no > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
  UNIQUE (item_id, rev_no)
);
`

const createIdxAssemblyRecordsItem = `
CREATE INDEX IF NOT EXISTS idx_assembly_records_item ON assembly_records(item_id);
`

const createAssemblyComponents = `
CREATE TABLE IF NOT EXISTS assembly_components (
  record_id INTEGER NOT NULL,
  component_item_id INTEGER NOT NULL,
  qty_per_unit REAL NOT NULL CHECK (qty_per_unit > 0),
  note TEXT,
  PRIMARY KEY (record_id, component_item_id),
  FOREIGN KEY (record_id) REFERENCES assembly_records(record_id) ON DELETE CASCADE,
  FOREIGN KEY (component_item_id) REFERENCES items(item_id)
);
`

const createIdxAssemblyComponentsComponent = `
CREATE INDEX IF NOT EXISTS idx_assembly_components_component ON assembly_components(component_item_id);
`

func Migrate(db *sql.DB) error {
	stmts := []struct {
		name string
		sql  string
	}{
		{"pragma foreign_keys", pragmaFK},
		{"create series", createSeries},
		{"create items", createItems},
		{"trigger items.updated_at", triggerItemsUpdatedAt},
		{"index items(series_id)", createIdxItemsSeries},
		{"create components", createComponents},
		{"create assemblies", createAssemblies},
		{"create stock_transactions", createStockTransactions},
		{"index stock_transactions(item_id)", createIdxStockTransactionsItem},
		{"create assembly_records", createAssemblyRecords},
		{"index assembly_records(item_id)", createIdxAssemblyRecordsItem},
		{"create assembly_components", createAssemblyComponents},
		{"index assembly_components(component_item_id)", createIdxAssemblyComponentsComponent},
	}

	for _, s := range stmts {
		if _, err := db.Exec(s.sql); err != nil {
			return fmt.Errorf("migration failed at %s: %w", s.name, err)
		}
	}

	return nil
}
