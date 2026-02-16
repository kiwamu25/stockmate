package db

import (
	"database/sql"
	"fmt"
	"strings"

	_ "modernc.org/sqlite"
)

func Open(dsn string) (*sql.DB, error) {
	// 例: sqlite:./data/stockmate.db
	if strings.HasPrefix(dsn, "sqlite:") {
		path := strings.TrimPrefix(dsn, "sqlite:")
		// modernc sqliteは file: 形式も使える。相対パスならこのままでもOK。
		// WAL推奨（突然の電源断/抜き取り耐性を上げる）
		conn := fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)", path)
		db, err := sql.Open("sqlite", conn)
		if err != nil {
			return nil, err
		}
		// SQLiteは基本1接続運用が安定
		db.SetMaxOpenConns(1)
		db.SetMaxIdleConns(1)
		return db, nil
	}

	return nil, fmt.Errorf("unsupported DSN: %s", dsn)
}