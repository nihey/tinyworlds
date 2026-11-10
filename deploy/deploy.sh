#!/usr/bin/env bash
# Build one world's viewer (or the front page) and copy it, with its generated map data, to the
# web server. The server is a stock nginx serving a directory of static files (see
# deploy/README.md), so nothing restarts: the files are simply replaced.
#
#   deploy/deploy.sh tinynyc             build + sync site and data
#   deploy/deploy.sh tinyrao --no-data   skip the tiles (code-only change)
#   deploy/deploy.sh tinynyc --index     site + the small JSON indexes, not the tiles
#   deploy/deploy.sh tinyrao --data      the data only, no build (after a re-render)
#   deploy/deploy.sh home                the front page that lists the worlds
#
# Where it goes is not in the repository: put DEPLOY_HOST and DEPLOY_DIR in deploy/.env
# (see deploy/.env.example) or in the environment.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$ROOT/deploy/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/deploy/.env"
  set +a
fi

WORLD="${1:-}"
MODE="${2:-}"
if [[ -z "$WORLD" || "$WORLD" == -* ]]; then
  echo "usage: deploy/deploy.sh <world | home> [--no-data | --index | --data]" >&2
  exit 2
fi
: "${DEPLOY_HOST:?set DEPLOY_HOST (ssh target) in deploy/.env}"
: "${DEPLOY_DIR:?set DEPLOY_DIR (directory on the server) in deploy/.env}"

FRONTEND="$ROOT/tinyworlds-frontend"
DATA="$FRONTEND/public/data/$WORLD"
if [[ "$WORLD" == "home" ]]; then
  BASE_PATH=""
  MODE="--no-data"
else
  BASE_PATH="/$WORLD"
  if [[ ! -f "$DATA/manifest.json" ]]; then
    echo "No map data for $WORLD: run 'npm run all -- --city $WORLD' in tinyworlds-pipeline first." >&2
    exit 1
  fi
fi
SITE="$DEPLOY_DIR/site$BASE_PATH"

build() {
  # Build without the data in public/, so the export does not copy what is rsynced separately.
  local stash
  stash="$(mktemp -d "$FRONTEND/.data-stash.XXXXXX")"
  restore() { [[ -d "$stash/data" ]] && mv "$stash/data" "$FRONTEND/public/data"; rmdir "$stash" 2>/dev/null || true; }
  trap restore EXIT
  [[ -d "$FRONTEND/public/data" ]] && mv "$FRONTEND/public/data" "$stash/data"
  (cd "$FRONTEND" && NEXT_PUBLIC_WORLD="$WORLD" NEXT_PUBLIC_BASE_PATH="$BASE_PATH" \
    NEXT_PUBLIC_DATA_BASE="$BASE_PATH/data" NEXT_PUBLIC_SITE_URL="${DEPLOY_URL:-}" \
    NEXT_PUBLIC_API_URL="${API_URL:-}" \
    NEXT_PUBLIC_ANALYTICS_SRC="${ANALYTICS_SRC:-}" NEXT_PUBLIC_ANALYTICS_SITE_ID="${ANALYTICS_SITE_ID:-}" \
    NEXT_PUBLIC_DONATE_URL="${DONATE_URL:-}" NEXT_PUBLIC_DONATE_URL_PT="${DONATE_URL_PT:-}" \
    NEXT_PUBLIC_DONATE_URL_ES="${DONATE_URL_ES:-}" \
    npm run build)
  restore
  trap - EXIT
}

if [[ "$MODE" != "--data" ]]; then
  build
  ssh "$DEPLOY_HOST" "mkdir -p '$SITE'"
  if [[ "$WORLD" == "home" ]]; then
    # the worlds live in folders beside the front page: replace its own files, delete nothing else
    rsync -az --delete "$FRONTEND/out/_next/" "$DEPLOY_HOST:$SITE/_next/"
    rsync -az --exclude '/_next/' "$FRONTEND/out/" "$DEPLOY_HOST:$SITE/"
  else
    # the loops are the front page's own pictures: a world's folder does not carry them
    rsync -az --delete --exclude '/data/' --exclude '/loops/' "$FRONTEND/out/" "$DEPLOY_HOST:$SITE/"
  fi
  # in place: the container bind-mounts this one file, and a renamed copy would leave it reading the old one
  rsync -az --inplace "$ROOT/deploy/nginx.conf" "$DEPLOY_HOST:$DEPLOY_DIR/nginx.conf"
fi

PROGRESS="--info=stats1"
[[ -t 1 ]] && PROGRESS="--info=progress2"
case "$MODE" in
  --no-data) ;;
  --index)
    rsync -az "$DATA/places.json" "$DATA/hoods.json" "$DATA/life.json" "$DEPLOY_HOST:$SITE/data/"
    ;;
  *)
    ssh "$DEPLOY_HOST" "mkdir -p '$SITE/data'"
    # tiles first, manifest last: visitors never see a manifest that points at tiles not yet there
    rsync -a --delete --exclude 'manifest.json' "$PROGRESS" "$DATA/" "$DEPLOY_HOST:$SITE/data/"
    rsync -a "$DATA/manifest.json" "$DEPLOY_HOST:$SITE/data/manifest.json"
    ;;
esac

echo "Deployed $WORLD${DEPLOY_URL:+ to $DEPLOY_URL$BASE_PATH/}"
