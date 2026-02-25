#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
DIST_DIR="$ROOT_DIR/dist/usb"

TARGET_OS="${TARGET_OS:-linux}"
TARGET_ARCH="${TARGET_ARCH:-amd64}"
BIN_NAME="stockmate"
if [[ "$TARGET_OS" == "windows" ]]; then
  BIN_NAME="stockmate.exe"
fi

echo "[1/4] build frontend"
cd "$FRONTEND_DIR"
if [[ "${INSTALL_DEPS:-0}" == "1" || ! -d "$FRONTEND_DIR/node_modules" ]]; then
  npm ci
fi
npm run build

echo "[2/4] prepare dist"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/frontend" "$DIST_DIR/data"

cp -r "$FRONTEND_DIR/dist" "$DIST_DIR/frontend/dist"

echo "[3/4] build backend binary"
cd "$BACKEND_DIR"
GOOS="$TARGET_OS" GOARCH="$TARGET_ARCH" CGO_ENABLED=0 go build -o "$DIST_DIR/$BIN_NAME" ./cmd/server

cat > "$DIST_DIR/run.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
DB_DSN=sqlite:./data/app.db PORT=8080 STATIC_DIR=./frontend/dist ./stockmate
EOF
chmod +x "$DIST_DIR/run.sh"

cat > "$DIST_DIR/run.bat" <<'EOF'
@echo off
cd /d %~dp0
set DB_DSN=sqlite:./data/app.db
set PORT=8080
set STATIC_DIR=./frontend/dist
stockmate.exe
EOF

echo "[4/4] done"
cat <<EOF
USB package created:
  $DIST_DIR

Run (Linux/macOS):
  cd $DIST_DIR
  ./run.sh

Run (Windows):
  cd $DIST_DIR
  run.bat
EOF
