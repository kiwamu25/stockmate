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
  item_type TEXT NOT NULL CHECK (item_type IN ('material','assembly')),
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

const createMaterials = `
CREATE TABLE IF NOT EXISTS materials (
  material_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL UNIQUE,
  manufacturer TEXT,
  material_type TEXT,
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

const createRecipes = `
CREATE TABLE IF NOT EXISTS recipes (
  recipe_id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  process_type TEXT NOT NULL DEFAULT 'assembly' CHECK (process_type IN ('assembly','processing','mixing')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

const triggerRecipesUpdatedAt = `
CREATE TRIGGER IF NOT EXISTS trg_recipes_updated_at
AFTER UPDATE ON recipes
FOR EACH ROW
BEGIN
  UPDATE recipes SET updated_at = datetime('now') WHERE recipe_id = OLD.recipe_id;
END;
`

const createRecipeInputs = `
CREATE TABLE IF NOT EXISTS recipe_inputs (
  recipe_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  qty_per_batch REAL NOT NULL CHECK (qty_per_batch > 0),
  PRIMARY KEY (recipe_id, item_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(item_id)
);
`

const createRecipeOutputs = `
CREATE TABLE IF NOT EXISTS recipe_outputs (
  recipe_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  qty_per_batch REAL NOT NULL CHECK (qty_per_batch > 0),
  PRIMARY KEY (recipe_id, item_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(item_id)
);
`

const createIdxRecipeInputsItem = `
CREATE INDEX IF NOT EXISTS idx_recipe_inputs_item ON recipe_inputs(item_id);
`

const createIdxRecipeOutputsItem = `
CREATE INDEX IF NOT EXISTS idx_recipe_outputs_item ON recipe_outputs(item_id);
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
		{"create materials", createMaterials},
		{"create assemblies", createAssemblies},
		{"create stock_transactions", createStockTransactions},
		{"index stock_transactions(item_id)", createIdxStockTransactionsItem},
		{"create recipes", createRecipes},
		{"trigger recipes.updated_at", triggerRecipesUpdatedAt},
		{"create recipe_inputs", createRecipeInputs},
		{"create recipe_outputs", createRecipeOutputs},
		{"index recipe_inputs(item_id)", createIdxRecipeInputsItem},
		{"index recipe_outputs(item_id)", createIdxRecipeOutputsItem},
	}

	for _, s := range stmts {
		if _, err := db.Exec(s.sql); err != nil {
			return fmt.Errorf("migration failed at %s: %w", s.name, err)
		}
	}

	return nil
}
