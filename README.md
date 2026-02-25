# StockMate

Go + SQLite + React で構成された在庫/BOM 管理アプリです。  
`component` と `assembly` を管理し、アセンブリの構成部品リビジョンと在庫調整を扱えます。

ローカル運用（localhost）を前提とした構成です。
外部公開時に必要な安全策（認証/認可、TLS終端、レート制限、WAF、監査ログ等）はこのリポジトリでは未実装です。

## Stack
- Backend: Go (`net/http`, `chi`), SQLite
- Frontend: React (Vite), TypeScript, TailwindCSS
- Container: Docker / Docker Compose

## Current Data Model
- `items.item_type`: `component` or `assembly`
- `items.reorder_point`: 補充目安在庫（アプリ上は `0` 初期値運用）
- `components.component_type`: `part` or `material`
- BOM:
  - `assembly_records` (revision header)
  - `assembly_components` (revision lines)

## Main Features
- Item 登録/一覧/更新
- Component 詳細管理（manufacturer, component_type, color）
- Assembly 詳細管理（manufacturer, total_weight, pack_size）
- Assembly の BOM リビジョン管理
- Assembly 在庫一覧と在庫調整
- Dashboard 在庫一覧（`stock_managed=true` のみ表示、typeフィルタ付き）
- Production > Parts（part一覧、複数一括入庫、BOM消費表示）
- Production > Shipping（assembly一覧、複数一括出荷、BOM通り減算）
- Item CSV テンプレート出力/取込
- モバイル対応ナビ（ハンバーガーメニュー）

## API Endpoints (major)
- `POST /api/items`
- `GET /api/items`
- `PUT /api/items/{id}`
- `GET /api/assemblies`
- `GET /api/assemblies/{id}/components`
- `PUT /api/assemblies/{id}/components`
- `DELETE /api/assemblies/{id}/components/{rev}`
- `GET /api/assemblies/stock`
- `POST /api/assemblies/{id}/adjust`
- `GET /api/stock/summary`
- `GET /api/production/parts`
- `POST /api/production/parts/{id}/complete`
- `GET /api/production/shipments/assemblies`
- `POST /api/production/shipments/complete`
- `GET /health`

## Run (Local)

### Backend
```bash
cd backend
go run ./cmd/server
```

Backend default:
- URL: `http://localhost:8080`
- DB: `sqlite:./data/stockmate.db`

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend default:
- URL: `http://localhost:5173`

## Run (Docker Compose)
```bash
docker compose up --build
```

Compose default:
- Backend URL: `http://localhost:8080`
- DB: `./data/app.db` (host volume mounted)

## Run (USB Package / No Docker)
Build package (Linux):
```bash
INSTALL_DEPS=1 ./scripts/build_usb.sh
```

Build package (Linux, deps already installed):
```bash
./scripts/build_usb.sh
```

Build package (Windows .exe):
```bash
INSTALL_DEPS=1 TARGET_OS=windows TARGET_ARCH=amd64 ./scripts/build_usb.sh
```

Run package (Linux/macOS):
```bash
cd dist/usb
./run.sh
```

Run package (Windows):
```bat
cd dist\usb
run.bat
```

Then open:
- `http://localhost:8080`

## License
- MIT License (`LICENSE`)
