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
  category TEXT NOT NULL CHECK (category IN ('material','part','product')),
  stock_managed INTEGER NOT NULL DEFAULT 1 CHECK (stock_managed IN (0,1)),
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

// updated_at 自動更新（SQLiteは ON UPDATE が無いのでトリガ）
const triggerItemsUpdatedAt = `
CREATE TRIGGER IF NOT EXISTS trg_items_updated_at
AFTER UPDATE ON items
FOR EACH ROW
BEGIN
  UPDATE items SET updated_at = datetime('now') WHERE item_id = OLD.item_id;
END;
`

const createProducts = `
CREATE TABLE IF NOT EXISTS products (
  product_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL UNIQUE,
  total_weight REAL,
  pack_size TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE
);
`

const createMaterial = `
CREATE TABLE IF NOT EXISTS material (
  material_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL UNIQUE,
  manufacturer TEXT,
  material_type TEXT,
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE
);
`

const createParts = `
CREATE TABLE IF NOT EXISTS parts (
  part_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL UNIQUE,
  manufacturer TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE
);
`

const createStockTransactions = `
CREATE TABLE IF NOT EXISTS stock_transactions (
  transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  qty REAL NOT NULL CHECK (qty > 0), -- gもpcsもここ。pcsは整数運用
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('IN','OUT','ADJUST')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(item_id)
);
`

const createIdxStockTransactionsItem = `
CREATE INDEX IF NOT EXISTS idx_st_item ON stock_transactions(item_id);
`

const createProductBOM = `
CREATE TABLE IF NOT EXISTS product_bom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_item_id INTEGER NOT NULL,
  part_item_id INTEGER NOT NULL,
  qty REAL NOT NULL CHECK (qty > 0),
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
		{"create series", createSeries},
		{"create items", createItems},
		{"trigger items.updated_at", triggerItemsUpdatedAt},
		{"create products", createProducts},
		{"create material", createMaterial},
		{"create parts", createParts},
		{"create stock_transactions", createStockTransactions},
		{"index stock_transactions(item_id)", createIdxStockTransactionsItem},
		{"create product_bom", createProductBOM},
	}

	for _, s := range stmts {
		if _, err := db.Exec(s.sql); err != nil {
			return fmt.Errorf("migration failed at %s: %w", s.name, err)
		}
	}

	// 既存DB互換: 旧itemsスキーマに必要列を後付けする
	if err := ensureItemsColumns(db); err != nil {
		return fmt.Errorf("migration failed at ensure items columns: %w", err)
	}
	if _, err := db.Exec(createIdxItemsSeries); err != nil {
		return fmt.Errorf("migration failed at index items(series_id): %w", err)
	}
	// 既存データ互換: category別サブテーブル行を補完
	if err := ensureCategorySubtableRows(db); err != nil {
		return fmt.Errorf("migration failed at ensure category subtable rows: %w", err)
	}

	return nil
}

func ensureItemsColumns(db *sql.DB) error {
	cols, err := getTableColumns(db, "items")
	if err != nil {
		return err
	}

	if _, ok := cols["series_id"]; !ok {
		if _, err := db.Exec(`ALTER TABLE items ADD COLUMN series_id INTEGER REFERENCES series(series_id);`); err != nil {
			return err
		}
	}
	if _, ok := cols["pack_qty"]; !ok {
		if _, err := db.Exec(`ALTER TABLE items ADD COLUMN pack_qty REAL;`); err != nil {
			return err
		}
	}
	if _, ok := cols["managed_unit"]; !ok {
		if _, err := db.Exec(`ALTER TABLE items ADD COLUMN managed_unit TEXT NOT NULL DEFAULT 'pcs';`); err != nil {
			return err
		}
	}
	if _, ok := cols["rev_code"]; !ok {
		if _, err := db.Exec(`ALTER TABLE items ADD COLUMN rev_code TEXT;`); err != nil {
			return err
		}
	}

	cols, err = getTableColumns(db, "items")
	if err != nil {
		return err
	}
	if _, hasBaseUnit := cols["base_unit"]; hasBaseUnit {
		if _, err := db.Exec(`
UPDATE items
SET managed_unit = base_unit
WHERE (managed_unit IS NULL OR managed_unit = '') AND base_unit IN ('g','pcs')
`); err != nil {
			return err
		}
	}
	return nil
}

func getTableColumns(db *sql.DB, table string) (map[string]struct{}, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%s);", table))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]struct{})
	for rows.Next() {
		var (
			cid       int
			name      string
			typ       string
			notnull   int
			dfltValue sql.NullString
			pk        int
		)
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dfltValue, &pk); err != nil {
			return nil, err
		}
		out[name] = struct{}{}
	}
	return out, rows.Err()
}

func ensureCategorySubtableRows(db *sql.DB) error {
	stmts := []string{
		`
INSERT INTO products(item_id)
SELECT i.item_id
FROM items i
LEFT JOIN products p ON p.item_id = i.item_id
WHERE i.category = 'product' AND p.item_id IS NULL
`,
		`
INSERT INTO material(item_id)
SELECT i.item_id
FROM items i
LEFT JOIN material m ON m.item_id = i.item_id
WHERE i.category = 'material' AND m.item_id IS NULL
`,
		`
INSERT INTO parts(item_id)
SELECT i.item_id
FROM items i
LEFT JOIN parts pt ON pt.item_id = i.item_id
WHERE i.category = 'part' AND pt.item_id IS NULL
`,
	}

	for _, q := range stmts {
		if _, err := db.Exec(q); err != nil {
			return err
		}
	}
	return nil
}
