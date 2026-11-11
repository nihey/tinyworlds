#!/usr/bin/env bash
# Build the viewer for one world (or the front page, or everything) and copy it, with its
# generated map data, to the web server. The server is a stock nginx serving a directory of
# static files (see deploy/README.md), so nothing restarts: the files are simply replaced.
#
#   deploy/deploy.sh tinynyc             build + sync site and data
#   deploy/deploy.sh tinyrao --no-data   skip the tiles (code-only change)
#   deploy/deploy.sh tinynyc --index     site + the small JSON indexes, not the tiles
#   deploy/deploy.sh tinyrao --data      the data only, no build (after a re-render)
#   deploy/deploy.sh home                the front page that lists the worlds
#
#   deploy/deploy.sh all [--parallel[=N] | --serial] [--no-data | --index | --data]
#                                        every world in the viewer's registry, then the front
#                                        page; builds and uploads 3 at a time (--parallel=N:
#                                        N), or one at a time with --serial
#   deploy/deploy.sh check               only the checks `all` starts with
#
# `all` first checks that every world in the registry (tinyworlds-frontend/src/worlds/index.ts)
# is complete: its map data, its share card, its pipeline city and its place in the docs. Then
# it builds every target, and uploads only once all of them have built, so a failing build
# leaves the site as it was.
#
# Every build runs in a copy of the frontend of its own (node_modules hard-linked, public/data
# left out), so builds can run side by side and the generated data is never moved.
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

FRONTEND="$ROOT/tinyworlds-frontend"
REGISTRY="$FRONTEND/src/worlds/index.ts"

usage() {
  cat >&2 <<'EOF'
usage: deploy/deploy.sh <world | home> [--no-data | --index | --data]
       deploy/deploy.sh all [--parallel[=N] | --serial] [--no-data | --index | --data]
       deploy/deploy.sh check
EOF
  exit 2
}

# ---- what there is to deploy ----------------------------------------------------------------

# Every world in the viewer's registry, in the order the front page shows them: the entries of
# `export const WORLDS = { … }` (one per line, as Prettier writes them).
registry_worlds() {
  sed -n '/^export const WORLDS/,/^};/p' "$REGISTRY" |
    sed -nE 's/^[[:space:]]+([a-z][a-z0-9]*)[[:space:]]*[,:].*/\1/p'
}

# What a world needs before it is deployed; prints one line per thing missing.
world_problems() {
  local world="$1"
  [[ -f "$FRONTEND/src/worlds/$world.ts" ]] || echo "no viewer config (tinyworlds-frontend/src/worlds/$world.ts)"
  [[ -f "$FRONTEND/public/data/$world/manifest.json" ]] ||
    echo "no map data (run 'npm run all -- --city $world' in tinyworlds-pipeline)"
  [[ -f "$FRONTEND/public/og/$world.jpg" ]] ||
    echo "no share card (run 'npm run cli -- --city $world card' in tinyworlds-pipeline)"
  [[ -f "$ROOT/tinyworlds-pipeline/src/cities/$world.ts" ]] ||
    echo "no pipeline city (tinyworlds-pipeline/src/cities/$world.ts)"
  grep -q "\`$world\`" "$ROOT/CLAUDE.md" || echo "not in the worlds table of CLAUDE.md"
  grep -q "$world" "$ROOT/README.md" || echo "not in README.md"
  grep -q "\`$world\`" "$FRONTEND/CLAUDE.md" || echo "not in tinyworlds-frontend/CLAUDE.md"
}

# Checks every world in the registry; lists everything missing at once, and fails if anything is.
check_all() {
  local worlds world problems failed=0
  worlds="$(registry_worlds)"
  if [[ -z "$worlds" ]]; then
    echo "Found no worlds in $REGISTRY: has the WORLDS registry changed shape?" >&2
    return 1
  fi
  for world in $worlds; do
    problems="$(world_problems "$world")"
    if [[ -n "$problems" ]]; then
      failed=1
      echo "$world:" >&2
      sed 's/^/  - /' <<<"$problems" >&2
    elif [[ ! -f "$FRONTEND/public/loops/$world.mp4" ]]; then
      # not a failure: without a loop the world's card on the front page simply stays still
      echo "$world: ok (no front-page loop yet: its card stays still)"
    else
      echo "$world: ok"
    fi
  done
  if ((failed)); then
    echo "Not deploying: some worlds are incomplete (see above)." >&2
    return 1
  fi
}

# ---- building -------------------------------------------------------------------------------

base_path_of() { [[ "$1" == "home" ]] && echo "" || echo "/$1"; }

# Builds one target in a copy of the frontend of its own, at <dir>; the site ends up in <dir>/out.
# The copy leaves public/data out (the export would copy every tile, and the data is synced
# separately) and hard-links node_modules, which takes a second.
build_in() {
  local target="$1" dir="$2" base_path
  base_path="$(base_path_of "$target")"
  # each step checked: this runs inside an `if`, where `set -e` does not reach
  mkdir -p "$dir" || return
  rsync -a --exclude '/node_modules/' --exclude '/.next/' --exclude '/out/' \
    --exclude '/public/data/' --exclude '/.data-stash.*/' "$FRONTEND/" "$dir/" || return
  cp -al "$FRONTEND/node_modules" "$dir/node_modules" || return
  (cd "$dir" && NEXT_PUBLIC_WORLD="$target" NEXT_PUBLIC_BASE_PATH="$base_path" \
    NEXT_PUBLIC_DATA_BASE="$base_path/data" NEXT_PUBLIC_SITE_URL="${DEPLOY_URL:-}" \
    NEXT_PUBLIC_API_URL="${API_URL:-}" \
    NEXT_PUBLIC_ANALYTICS_SRC="${ANALYTICS_SRC:-}" NEXT_PUBLIC_ANALYTICS_SITE_ID="${ANALYTICS_SITE_ID:-}" \
    NEXT_PUBLIC_GTM_ID="${GTM_ID:-}" \
    NEXT_PUBLIC_DONATE_URL="${DONATE_URL:-}" NEXT_PUBLIC_DONATE_URL_PT="${DONATE_URL_PT:-}" \
    NEXT_PUBLIC_DONATE_URL_ES="${DONATE_URL_ES:-}" \
    npm run build)
}

# Builds every target, <jobs> at a time, each with its own log; fails if any build did, after
# printing the end of its log.
build_all() {
  local max="$1" target failed=()
  shift
  if ((max == 1)); then echo "Building $# targets, one at a time"; else echo "Building $# targets, $max at a time"; fi
  for target in "$@"; do
    while (($(jobs -rp | wc -l) >= max)); do wait -n || true; done
    (
      started=$SECONDS
      if build_in "$target" "$WORK/$target" >"$WORK/$target.log" 2>&1; then
        touch "$WORK/$target.built"
        echo "  built $target ($((SECONDS - started))s)"
      else
        echo "  FAILED $target ($((SECONDS - started))s)"
      fi
    ) &
  done
  wait
  for target in "$@"; do
    [[ -f "$WORK/$target.built" ]] || failed+=("$target")
  done
  if ((${#failed[@]})); then
    for target in "${failed[@]}"; do
      echo "---- $target: the end of its build log" >&2
      tail -n 30 "$WORK/$target.log" >&2
    done
    echo "Not deploying anything: ${failed[*]} failed to build." >&2
    return 1
  fi
}

# ---- uploading ------------------------------------------------------------------------------

# Copies one target to the server: its built site from <out> (unless mode is --data), and its
# map data as the mode says. Every step is checked: uploads side by side run inside an `if`,
# where `set -e` does not reach.
upload() {
  local target="$1" out="$2" mode="$3" base_path site data progress="--info=stats1"
  base_path="$(base_path_of "$target")"
  site="$DEPLOY_DIR/site$base_path"
  data="$FRONTEND/public/data/$target"
  [[ -t 1 ]] && progress="--info=progress2"
  if [[ "$mode" != "--data" ]]; then
    ssh "$DEPLOY_HOST" "mkdir -p '$site'" || return
    if [[ "$target" == "home" ]]; then
      # the worlds live in folders beside the front page: replace its own files, delete nothing else
      rsync -az --delete "$out/_next/" "$DEPLOY_HOST:$site/_next/" || return
      rsync -az --exclude '/_next/' "$out/" "$DEPLOY_HOST:$site/" || return
    else
      # the loops are the front page's own pictures: a world's folder does not carry them
      rsync -az --delete --exclude '/data/' --exclude '/loops/' "$out/" "$DEPLOY_HOST:$site/" || return
    fi
  fi
  if [[ "$target" != "home" ]]; then
    case "$mode" in
      --no-data) ;;
      --index)
        # the indexes, and the sights with their texts and pictures where the world has them
        # (the pictures first: sights.json points at them)
        if [[ -d "$data/sights" ]]; then
          ssh "$DEPLOY_HOST" "mkdir -p '$site/data'" || return
          rsync -az --delete "$data/sights/" "$DEPLOY_HOST:$site/data/sights/" || return
        fi
        local indexes=("$data/places.json" "$data/hoods.json" "$data/life.json") sight
        for sight in "$data"/sights*.json; do [[ -e "$sight" ]] && indexes+=("$sight"); done
        rsync -az "${indexes[@]}" "$DEPLOY_HOST:$site/data/" || return
        ;;
      *)
        ssh "$DEPLOY_HOST" "mkdir -p '$site/data'" || return
        # tiles first, manifest last: visitors never see a manifest that points at tiles not yet there
        rsync -a --delete --exclude 'manifest.json' "$progress" "$data/" "$DEPLOY_HOST:$site/data/" || return
        rsync -a "$data/manifest.json" "$DEPLOY_HOST:$site/data/manifest.json" || return
        ;;
    esac
  fi
  echo "Deployed $target${DEPLOY_URL:+ to $DEPLOY_URL$base_path/}"
}

# Uploads every built target, <max> worlds at a time (each with its own log), and the front page
# last, once every world is up: its links lead to them. Stops before the front page if a world
# failed, after printing the end of its log.
upload_all() {
  local max="$1" mode="$2" target failed=()
  shift 2
  for target in "$@"; do
    [[ "$target" == "home" ]] && continue
    if ((max == 1)); then
      # one at a time: straight to the terminal, progress bar and all
      upload "$target" "$WORK/$target/out" "$mode"
      continue
    fi
    while (($(jobs -rp | wc -l) >= max)); do wait -n || true; done
    (
      if upload "$target" "$WORK/$target/out" "$mode" >"$WORK/$target.upload.log" 2>&1; then
        touch "$WORK/$target.uploaded"
        tail -n 1 "$WORK/$target.upload.log"
      else
        echo "  FAILED to upload $target"
      fi
    ) &
  done
  wait
  if ((max > 1)); then
    for target in "$@"; do
      [[ "$target" == "home" || -f "$WORK/$target.uploaded" ]] || failed+=("$target")
    done
    if ((${#failed[@]})); then
      for target in "${failed[@]}"; do
        echo "---- $target: the end of its upload log" >&2
        tail -n 30 "$WORK/$target.upload.log" >&2
      done
      echo "Stopped before the front page: ${failed[*]} failed to upload." >&2
      return 1
    fi
  fi
  for target in "$@"; do
    [[ "$target" == "home" ]] && upload home "$WORK/home/out" "$mode"
  done
  return 0
}

sync_nginx() {
  # in place: the container bind-mounts this one file, and a renamed copy would leave it reading the old one
  rsync -az --inplace "$ROOT/deploy/nginx.conf" "$DEPLOY_HOST:$DEPLOY_DIR/nginx.conf"
}

# ---- the command line -----------------------------------------------------------------------

TARGET="${1:-}"
[[ -z "$TARGET" || "$TARGET" == -* ]] && usage
shift

if [[ "$TARGET" == "check" ]]; then
  check_all
  exit
fi

JOBS=""
MODE=""
for arg in "$@"; do
  case "$arg" in
    --parallel) JOBS=3 ;;
    --parallel=*) JOBS="${arg#--parallel=}" ;;
    --serial) JOBS=1 ;;
    --no-data | --index | --data) MODE="$arg" ;;
    *) usage ;;
  esac
done
if [[ "$TARGET" != "all" && -n "$JOBS" ]]; then
  echo "--parallel and --serial are for 'all': one target is one build." >&2
  exit 2
fi
JOBS="${JOBS:-3}"
[[ "$JOBS" =~ ^[1-9][0-9]*$ ]] || usage

: "${DEPLOY_HOST:?set DEPLOY_HOST (ssh target) in deploy/.env}"
: "${DEPLOY_DIR:?set DEPLOY_DIR (directory on the server) in deploy/.env}"

if [[ "$TARGET" == "all" ]]; then
  check_all
  # shellcheck disable=SC2207
  WORLDS=($(registry_worlds))
  TARGETS=("${WORLDS[@]}")
  [[ "$MODE" != "--data" ]] && TARGETS+=(home)
else
  if [[ "$TARGET" != "home" && ! -f "$FRONTEND/public/data/$TARGET/manifest.json" ]]; then
    echo "No map data for $TARGET: run 'npm run all -- --city $TARGET' in tinyworlds-pipeline first." >&2
    exit 1
  fi
  TARGETS=("$TARGET")
fi

# the builds' copies live beside the frontend, on its disk (hard links cannot cross disks)
WORK="$(mktemp -d "$ROOT/.deploy-work.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

if [[ "$MODE" != "--data" ]]; then
  if [[ "$TARGET" == "all" ]]; then
    build_all "$JOBS" "${TARGETS[@]}"
  else
    # one target: its build log goes straight to the terminal
    build_in "$TARGET" "$WORK/$TARGET"
  fi
fi

# the worlds first, the front page last, and the server's nginx config once
if [[ "$TARGET" == "all" ]]; then
  upload_all "$JOBS" "$MODE" "${TARGETS[@]}"
else
  upload "$TARGET" "$WORK/$TARGET/out" "$MODE"
fi
[[ "$MODE" != "--data" ]] && sync_nginx

if [[ "$TARGET" == "all" ]]; then
  echo "Deployed ${#TARGETS[@]} targets: ${TARGETS[*]}"
fi
