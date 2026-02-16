package db

import (
	"database/sql"
	"fmt"
)

const createItems = `
CREATE TABLE IF NOT EXISTS items (
  item_id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  category ENUM('material','part','product') NOT NULL,
  base_unit ENUM('g','pcs') NOT NULL,
  stock_managed BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
`

const createStockTransactions = `
CREATE TABLE IF NOT EXISTS stock_transactions (
  transaction_id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  qty DECIMAL(12,2) NOT NULL,
  transaction_type ENUM('IN','OUT','ADJUST') NOT NULL,
  note VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_st_item FOREIGN KEY (item_id) REFERENCES items(item_id)
);
`

const createIdxStockTransactionsItem = `
CREATE INDEX IF NOT EXISTS idx_st_item ON stock_transactions(item_id);
`

const createPartBOM = `
CREATE TABLE IF NOT EXISTS part_bom (
  id INT AUTO_INCREMENT PRIMARY KEY,
  part_item_id INT NOT NULL,
  material_item_id INT NOT NULL,
  qty_g DECIMAL(10,2) NOT NULL,
  loss_rate DECIMAL(6,4) NOT NULL DEFAULT 1.0000,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pb_part FOREIGN KEY (part_item_id) REFERENCES items(item_id),
  CONSTRAINT fk_pb_material FOREIGN KEY (material_item_id) REFERENCES items(item_id),
  UNIQUE KEY uq_part_material (part_item_id, material_item_id)
);
`

const createProductBOM = `
CREATE TABLE IF NOT EXISTS product_bom (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_item_id INT NOT NULL,
  part_item_id INT NOT NULL,
  qty_pcs INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prb_product FOREIGN KEY (product_item_id) REFERENCES items(item_id),
  CONSTRAINT fk_prb_part FOREIGN KEY (part_item_id) REFERENCES items(item_id),
  UNIQUE KEY uq_product_part (product_item_id, part_item_id)
);
`

func Migrate(db *sql.DB) error {
	stmts := []struct {
		name string
		sql  string
	}{
		{"create items", createItems},
		{"create stock_transactions", createStockTransactions},
		{"create index stock_transactions(item_id)", createIdxStockTransactionsItem},
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
