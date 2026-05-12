#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# seed-stores.sh — herstel bestaande stores vanuit de store server in de DB
#
# Gebruik op de tool server (ubuntu-server-2404):
#   chmod +x UIcontrol/scripts/seed-stores.sh
#   bash UIcontrol/scripts/seed-stores.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

DB_PATH="${DATABASE_PATH:-$HOME/Dropships/UIcontrol/data/dropship.db}"
STORE_SERVER="${STORE_SERVER_HOST:-192.168.121.11}"
STORE_USER="${STORE_SERVER_USER:-deploy}"
SSH_KEY="${STORE_SSH_KEY_PATH:-}"
STORES_DIR="/var/www/stores"
PORT_START=4001

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
if [ -n "$SSH_KEY" ]; then
  SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
fi

echo "==> Dropshipping Store Seed Script"
echo "    DB:     $DB_PATH"
echo "    Server: $STORE_USER@$STORE_SERVER"
echo ""

# Haal beste run_id op uit de DB
BEST_RUN=$(sqlite3 "$DB_PATH" \
  "SELECT run_id FROM runs WHERE status IN ('completed','running') ORDER BY started_at DESC LIMIT 1;" 2>/dev/null || echo "")

if [ -z "$BEST_RUN" ]; then
  echo "WARN: geen completed/running run gevonden — stores worden zonder FK ingevoegd"
fi

# Lijst store directories op de store server
echo "==> Store directories ophalen van $STORE_SERVER..."
DIRS=$(ssh $SSH_OPTS "$STORE_USER@$STORE_SERVER" "ls $STORES_DIR/" 2>/dev/null)

if [ -z "$DIRS" ]; then
  echo "ERROR: Kon geen directories ophalen van $STORE_SERVER:$STORES_DIR"
  echo "       Controleer SSH toegang: ssh $SSH_OPTS $STORE_USER@$STORE_SERVER 'ls $STORES_DIR/'"
  exit 1
fi

echo "   Gevonden: $DIRS"
echo ""

# Huidige hoogste poort ophalen
MAX_PORT=$(sqlite3 "$DB_PATH" \
  "SELECT COALESCE(MAX(port), $((PORT_START - 1))) FROM stores WHERE port IS NOT NULL;" 2>/dev/null || echo "$((PORT_START - 1))")

for DIR in $DIRS; do
  [ "$DIR" = "testshop" ] && continue  # skip testshop

  echo "─── $DIR"

  # Controleer of al bestaat
  EXISTS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM stores WHERE subdomein='$DIR';" 2>/dev/null || echo "0")
  if [ "$EXISTS" -gt 0 ]; then
    echo "    al aanwezig — skip"
    continue
  fi

  # Lees store.json
  STORE_JSON=$(ssh $SSH_OPTS "$STORE_USER@$STORE_SERVER" \
    "cat $STORES_DIR/$DIR/store.json 2>/dev/null || echo '{}'" 2>/dev/null)

  # Parse velden
  STORE_ID=$(echo "$STORE_JSON" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('storeId',''))" 2>/dev/null || echo "")
  NICHE=$(echo "$STORE_JSON" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('niche',''))" 2>/dev/null || echo "")
  CREATED_AT=$(echo "$STORE_JSON" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('createdAt',''))" 2>/dev/null || echo "")

  # Fallbacks
  [ -z "$STORE_ID" ]   && STORE_ID="${DIR%%.*}-recovered"
  [ -z "$NICHE" ]      && NICHE="${DIR%%.*}"
  [ -z "$CREATED_AT" ] && CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  MAX_PORT=$((MAX_PORT + 1))
  PORT=$MAX_PORT
  PREVIEW_URL="https://$DIR"

  echo "    id=$STORE_ID  niche='$NICHE'  port=$PORT"

  if [ -n "$BEST_RUN" ]; then
    sqlite3 "$DB_PATH" "
      INSERT OR IGNORE INTO stores
        (store_id, run_id, subdomein, niche, preview_url, created_at, status, port, health_status)
      VALUES
        ('$STORE_ID', '$BEST_RUN', '$DIR', '$NICHE', '$PREVIEW_URL', '$CREATED_AT', 'live', $PORT, 'unknown');
    "
  else
    # Zet tijdelijk FK's uit
    sqlite3 "$DB_PATH" "
      PRAGMA foreign_keys = OFF;
      INSERT OR IGNORE INTO stores
        (store_id, run_id, subdomein, niche, preview_url, created_at, status, port, health_status)
      VALUES
        ('$STORE_ID', 'recovered', '$DIR', '$NICHE', '$PREVIEW_URL', '$CREATED_AT', 'live', $PORT, 'unknown');
      PRAGMA foreign_keys = ON;
    "
  fi
  echo "    ✓ ingevoegd"
done

echo ""
echo "==> Klaar! Stores in DB:"
sqlite3 "$DB_PATH" "SELECT store_id, subdomein, niche, port, status FROM stores;" \
  2>/dev/null | column -t -s '|' || true
