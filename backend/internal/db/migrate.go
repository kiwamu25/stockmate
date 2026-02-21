package db

import (
	"database/sql"
	"fmt"
	"strings"
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
  pack_qty REAL,
  reorder_point REAL CHECK (reorder_point > 0),
  managed_unit TEXT NOT NULL CHECK (managed_unit IN ('g','pcs')),
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
  component_type TEXT NOT NULL DEFAULT 'material' CHECK (component_type IN ('part','material','consumable')),
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

const createComponentPurchaseLinks = `
CREATE TABLE IF NOT EXISTS component_purchase_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  FOREIGN KEY (component_id) REFERENCES components(component_id) ON DELETE CASCADE
);
`

const createIdxComponentPurchaseLinksComponent = `
CREATE INDEX IF NOT EXISTS idx_component_purchase_links_component
ON component_purchase_links(component_id, sort_order, id);
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
	if err := ensureItemsReorderPoint(db); err != nil {
		return err
	}
	if err := ensureComponentsConsumable(db); err != nil {
		return err
	}
	if err := ensureComponentPurchaseLinksTable(db); err != nil {
		return err
	}

	return nil
}

func ensureItemsReorderPoint(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(items);`)
	if err != nil {
		return fmt.Errorf("migration failed at pragma table_info(items): %w", err)
	}
	defer rows.Close()

	hasReorderPoint := false
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull int
		var defaultValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultValue, &pk); err != nil {
			return fmt.Errorf("migration failed at scan table_info(items): %w", err)
		}
		if strings.EqualFold(name, "reorder_point") {
			hasReorderPoint = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("migration failed at rows table_info(items): %w", err)
	}
	if hasReorderPoint {
		return nil
	}
	if _, err := db.Exec(`ALTER TABLE items ADD COLUMN reorder_point REAL CHECK (reorder_point > 0);`); err != nil {
		return fmt.Errorf("migration failed at add items.reorder_point: %w", err)
	}
	return nil
}

func ensureComponentsConsumable(db *sql.DB) error {
	var createSQL sql.NullString
	if err := db.QueryRow(`
SELECT sql
FROM sqlite_master
WHERE type = 'table' AND name = 'components'
`).Scan(&createSQL); err != nil {
		return fmt.Errorf("migration failed at load components schema: %w", err)
	}
	if !createSQL.Valid {
		return nil
	}
	if strings.Contains(strings.ToLower(createSQL.String), "'consumable'") {
		return nil
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("migration failed at begin components migration: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`ALTER TABLE components RENAME TO components_old;`); err != nil {
		return fmt.Errorf("migration failed at rename components: %w", err)
	}
	if _, err := tx.Exec(`
CREATE TABLE components (
  component_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL UNIQUE,
  manufacturer TEXT,
  component_type TEXT NOT NULL DEFAULT 'material' CHECK (component_type IN ('part','material','consumable')),
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE
);
`); err != nil {
		return fmt.Errorf("migration failed at recreate components: %w", err)
	}
	if _, err := tx.Exec(`
INSERT INTO components(component_id, item_id, manufacturer, component_type, color, created_at)
SELECT
  component_id,
  item_id,
  manufacturer,
  CASE
    WHEN component_type IN ('part', 'material', 'consumable') THEN component_type
    ELSE 'material'
  END,
  color,
  created_at
FROM components_old;
`); err != nil {
		return fmt.Errorf("migration failed at copy components: %w", err)
	}
	if _, err := tx.Exec(`DROP TABLE components_old;`); err != nil {
		return fmt.Errorf("migration failed at drop old components: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("migration failed at commit components migration: %w", err)
	}
	return nil
}

func ensureComponentPurchaseLinksTable(db *sql.DB) error {
	var createSQL sql.NullString
	if err := db.QueryRow(`
SELECT sql
FROM sqlite_master
WHERE type = 'table' AND name = 'component_purchase_links'
`).Scan(&createSQL); err != nil {
		if err != sql.ErrNoRows {
			return fmt.Errorf("migration failed at load component_purchase_links schema: %w", err)
		}
	}

	// Missing table: create with the latest schema and index.
	if !createSQL.Valid {
		if _, err := db.Exec(createComponentPurchaseLinks); err != nil {
			return fmt.Errorf("migration failed at create component_purchase_links: %w", err)
		}
		if _, err := db.Exec(createIdxComponentPurchaseLinksComponent); err != nil {
			return fmt.Errorf("migration failed at index component_purchase_links(component_id, sort_order, id): %w", err)
		}
		return nil
	}

	schema := strings.ToLower(createSQL.String)
	needsRecreate := strings.Contains(schema, "references components_old(")
	if !needsRecreate {
		if _, err := db.Exec(createIdxComponentPurchaseLinksComponent); err != nil {
			return fmt.Errorf("migration failed at index component_purchase_links(component_id, sort_order, id): %w", err)
		}
		return nil
	}

	// Broken FK (points to components_old): rebuild table with correct FK.
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("migration failed at begin component_purchase_links migration: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`ALTER TABLE component_purchase_links RENAME TO component_purchase_links_old;`); err != nil {
		return fmt.Errorf("migration failed at rename component_purchase_links: %w", err)
	}
	if _, err := tx.Exec(createComponentPurchaseLinks); err != nil {
		return fmt.Errorf("migration failed at recreate component_purchase_links: %w", err)
	}
	if _, err := tx.Exec(`
INSERT INTO component_purchase_links(id, component_id, url, label, sort_order, created_at, enabled)
SELECT id, component_id, url, label, sort_order, created_at, enabled
FROM component_purchase_links_old;
`); err != nil {
		return fmt.Errorf("migration failed at copy component_purchase_links: %w", err)
	}
	if _, err := tx.Exec(`DROP TABLE component_purchase_links_old;`); err != nil {
		return fmt.Errorf("migration failed at drop old component_purchase_links: %w", err)
	}
	if _, err := tx.Exec(createIdxComponentPurchaseLinksComponent); err != nil {
		return fmt.Errorf("migration failed at index component_purchase_links(component_id, sort_order, id): %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("migration failed at commit component_purchase_links migration: %w", err)
	}
	return nil
}
