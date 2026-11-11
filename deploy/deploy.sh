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
#   deploy/deploy.sh release [--everything]
#                                        what main has and the server does not: the API (when
#                                        tinyworlds-api changed), then every viewer without data
#                                        (when the frontend or deploy/ did). What GitHub Actions
#                                        runs on every push to main.
#
# `all` first checks that every world in the registry (tinyworlds-frontend/src/worlds/index.ts)
# is complete: its map data (on the server, for --no-data), its share card, its pipeline city and
# its place in the docs. Then it builds every target, and uploads only once all of them have
# built, so a failing build leaves the site as it was.
#
# Every build runs in a copy of the frontend of its own (node_modules hard-linked, public/data
# left out), so builds can run side by side and the generated data is never moved.
#
# The server is reached with rsync alone (no command runs there), so the key that uploads can be
# one that may do nothing else. Beside the site it keeps which commit its viewers and its API
# were last deployed from (deployed/viewers, deployed/api): a build from a tree that lacks it is
# refused, since it would put older code back.
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
       deploy/deploy.sh release [--everything]
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

# Where a world's map data is looked for: the generated folder here or, with SERVER_DATA set (a
# deploy without data), the server's manifests and quizzes copied there by mirror_server_data.
data_of() {
  if [[ -n "${SERVER_DATA:-}" ]]; then echo "$SERVER_DATA/$1/data"; else echo "$FRONTEND/public/data/$1"; fi
}

# What a world needs before it is deployed; prints one line per thing missing.
world_problems() {
  local world="$1" data
  data="$(data_of "$world")"
  [[ -f "$FRONTEND/src/worlds/$world.ts" ]] || echo "no viewer config (tinyworlds-frontend/src/worlds/$world.ts)"
  if [[ ! -f "$data/manifest.json" ]]; then
    if [[ -n "${SERVER_DATA:-}" ]]; then
      echo "no map data on the server (send it first: 'deploy/deploy.sh $world --data')"
    else
      echo "no map data (run 'npm run all -- --city $world' in tinyworlds-pipeline)"
    fi
  fi
  [[ -f "$FRONTEND/public/og/$world.jpg" ]] ||
    echo "no share card (run 'npm run cli -- --city $world card' in tinyworlds-pipeline)"
  [[ -f "$ROOT/tinyworlds-pipeline/src/cities/$world.ts" ]] ||
    echo "no pipeline city (tinyworlds-pipeline/src/cities/$world.ts)"
  grep -q "\`$world\`" "$ROOT/CLAUDE.md" || echo "not in the worlds table of CLAUDE.md"
  grep -q "$world" "$ROOT/README.md" || echo "not in README.md"
  grep -q "\`$world\`" "$FRONTEND/CLAUDE.md" || echo "not in tinyworlds-frontend/CLAUDE.md"
  if grep -q "quiz: true" "$FRONTEND/src/worlds/$world.ts" 2>/dev/null &&
    [[ ! -f "$data/quiz.en-US.json" ]]; then
    if [[ -n "${SERVER_DATA:-}" ]]; then
      echo "no quiz on the server (send it: 'deploy/deploy.sh $world --index')"
    else
      echo "no quiz (run 'npm run cli -- --city $world quiz' in tinyworlds-pipeline)"
    fi
  fi
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
    elif [[ ! -f "$FRONTEND/public/loops/hero-$world.jpg" && "$world" != "tinynyc" ]]; then
      # nor is this: the front page's hero goes round the worlds that have a film (the first
      # world's is hero.jpg)
      echo "$world: ok (no hero film yet: it is left out of the front page's hero)"
    else
      echo "$world: ok"
    fi
  done
  if ((failed)); then
    echo "Not deploying: some worlds are incomplete (see above)." >&2
    return 1
  fi
}

# ---- the server -----------------------------------------------------------------------------

# Prints a file on the server (a path under DEPLOY_DIR), or nothing when it is not there; fails
# only when the server could not be reached.
server_cat() {
  local tmp errors status=0
  tmp="$(mktemp)"
  errors="$(mktemp)"
  rsync -q "$DEPLOY_HOST:$DEPLOY_DIR/$1" "$tmp" 2>"$errors" || status=$?
  if ((status == 0)); then
    cat "$tmp"
  # a missing file is an answer too; rsync says so as "link_stat … failed", rrsync (the
  # restricted key's) as "open failed", and either exit code may mean anything
  elif ! grep -qE '(link_stat|open failed).*No such file or directory' "$errors"; then
    echo "Could not read $1 from the server (rsync exit $status)." >&2
    status=-1
  fi
  rm -f "$tmp" "$errors"
  ((status != -1))
}

# Copies every world's manifest and quiz from the server into <dir>/<world>/data/: what a deploy
# without data counts on finding there.
mirror_server_data() {
  mkdir -p "$1"
  rsync -r --prune-empty-dirs --include='/*/' --include='/*/data/' \
    --include='/*/data/manifest.json' --include='/*/data/quiz.en-US.json' --exclude='*' \
    "$DEPLOY_HOST:$DEPLOY_DIR/site/" "$1/"
}

# The commit the server's viewers (or its API) were deployed from: `deployed_commit viewers`
# or `deployed_commit api`. Empty when it is not known.
deployed_commit() {
  local text
  text="$(server_cat "deployed/$1")" || return
  head -n 1 <<<"$text" | tr -dc '0-9a-f'
}

# Records the commit (or, empty, that it is not known) the server's viewers or API come from.
# Like every file sent, it goes into its folder under its own name: the restricted key's rrsync
# cannot rename a file on the way.
set_deployed() {
  local dir status=0
  dir="$(mktemp -d)"
  printf '%s\n' "$2" >"$dir/$1"
  rsync -q --mkpath "$dir/$1" "$DEPLOY_HOST:$DEPLOY_DIR/deployed/" || status=$?
  rm -rf "$dir"
  return "$status"
}

# Whether this tree is a commit of origin/main, unchanged: nothing edited or added in the
# viewer or in deploy/.
tree_is_main() {
  git -C "$ROOT" merge-base --is-ancestor HEAD origin/main 2>/dev/null &&
    [[ -z "$(git -C "$ROOT" status --porcelain -- tinyworlds-frontend deploy)" ]]
}

# Refuses (before anything is built) a tree without the commit the server's viewers come from:
# deploying it would put older code back.
guard_tree() {
  local deployed
  deployed="$(deployed_commit viewers)" || return
  [[ -z "$deployed" ]] && return 0
  git -C "$ROOT" merge-base --is-ancestor "$deployed" HEAD 2>/dev/null && return 0
  echo "Not deploying: the site's viewers come from ${deployed:0:12}, which this tree does not have." \
    "Fetch, and rebase onto origin/main." >&2
  return 1
}

# Asks Dokploy to redeploy one application through its deploy webhook (the application's
# Deployments → Webhook URL, a secret that can do nothing else), saying what GitHub says of a
# push to main. <message> becomes the deployment's title.
dokploy_deploy() {
  local url="$1" message="$2" commit answer status=0 code
  commit="$(git -C "$ROOT" rev-parse HEAD)"
  answer="$(mktemp)"
  # no curl errors on screen: they would name the host
  code="$(curl -s --max-time 30 -o "$answer" -w '%{http_code}' -X POST \
    -H 'content-type: application/json' -H 'x-github-event: push' \
    --data "{\"ref\":\"refs/heads/main\",\"after\":\"$commit\",\"head_commit\":{\"id\":\"$commit\",\"message\":\"$message\"},\"commits\":[]}" \
    "$url")" || status=$?
  if ((status)) || [[ "$code" != 200 ]]; then
    echo "Dokploy did not take the deploy (curl exit $status, HTTP ${code:-none}): $(head -c 200 "$answer")" >&2
    rm -f "$answer"
    return 1
  fi
  rm -f "$answer"
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

# The `build` a manifest names (read from stdin): which render it describes.
build_of() { { grep -o '"build":"[^"]*"' || true; } | head -n 1 | cut -d '"' -f 4; }

# An index-only upload sends the manifest too (it names the indexes' version), and a manifest
# also describes the tiles: it may only replace one from the same render, or it would point the
# viewer at tiles that are not on the server. Says so and fails otherwise.
same_render() {
  local target="$1" data="$2" base_path="$3" here there
  here="$(build_of <"$data/manifest.json")"
  there="$(server_cat "site$base_path/data/manifest.json" | build_of)" || true
  if [[ -z "$here" || "$here" != "$there" ]]; then
    echo "Not sending $target's indexes: its manifest here is from render ${here:-?}," \
      "the server's from ${there:-none}. Deploy its data first (without --index)." >&2
    return 1
  fi
}

# Copies one target to the server: its built site from <out> (unless mode is --data), and its
# map data as the mode says. Every step is checked: uploads side by side run inside an `if`,
# where `set -e` does not reach. --mkpath makes the folders a new world needs.
upload() {
  local target="$1" out="$2" mode="$3" base_path site data progress="--info=stats1"
  base_path="$(base_path_of "$target")"
  site="$DEPLOY_DIR/site$base_path"
  data="$FRONTEND/public/data/$target"
  [[ -t 1 ]] && progress="--info=progress2"
  # before anything is sent, so a refusal leaves the site as it was
  if [[ "$mode" == "--index" && "$target" != "home" ]]; then
    same_render "$target" "$data" "$base_path" || return
  fi
  if [[ "$mode" != "--data" ]]; then
    if [[ "$target" == "home" ]]; then
      # the worlds live in folders beside the front page: replace its own files, delete nothing else
      rsync -az --mkpath --delete "$out/_next/" "$DEPLOY_HOST:$site/_next/" || return
      rsync -az --exclude '/_next/' "$out/" "$DEPLOY_HOST:$site/" || return
    else
      # the loops are the front page's own pictures: a world's folder does not carry them
      rsync -az --mkpath --delete --exclude '/data/' --exclude '/loops/' "$out/" "$DEPLOY_HOST:$site/" || return
    fi
  fi
  if [[ "$target" != "home" ]]; then
    case "$mode" in
      --no-data) ;;
      --index)
        # the indexes, and the sights with their texts and pictures where the world has them
        # (the pictures first: sights.json points at them)
        if [[ -d "$data/sights" ]]; then
          rsync -az --mkpath --delete "$data/sights/" "$DEPLOY_HOST:$site/data/sights/" || return
        fi
        local indexes=("$data/places.json" "$data/hoods.json" "$data/life.json") sight
        # the sights' texts, and Guess the building's questions where the world has them
        for sight in "$data"/sights*.json "$data"/quiz*.json; do [[ -e "$sight" ]] && indexes+=("$sight"); done
        rsync -az --mkpath "${indexes[@]}" "$DEPLOY_HOST:$site/data/" || return
        # the manifest last: it names the indexes' version, so visitors ask for them anew
        rsync -a "$data/manifest.json" "$DEPLOY_HOST:$site/data/" || return
        ;;
      *)
        # tiles first, manifest last: visitors never see a manifest that points at tiles not yet there
        rsync -a --mkpath --delete --exclude 'manifest.json' "$progress" "$data/" "$DEPLOY_HOST:$site/data/" || return
        rsync -a "$data/manifest.json" "$DEPLOY_HOST:$site/data/" || return
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

# ---- announcing ------------------------------------------------------------------------------

# Tells the donors of the given worlds' cities, by mail, that they are built: the API's announce
# command, run once for all of them in its container. The command sends once per city, so it is
# safe on every deploy. It never fails the deploy: a problem is a warning. It goes one of two ways:
# - ANNOUNCE_HOST: an ssh target whose key may run nothing but deploy/announce-command.sh (its
#   forced command, which knows the container): what GitHub Actions uses, as its upload key runs
#   nothing at all;
# - otherwise a shell on DEPLOY_HOST, in the container API_SERVICE names, or the Swarm service
#   whose task runs it (<service>.1.<task>).
announce_built() {
  local world worlds=() status=0
  for world in "$@"; do
    if [[ "$world" =~ ^[a-z0-9]{3,20}$ ]]; then
      worlds+=("$world")
    else
      echo "Not announcing '$world': not a world id." >&2
    fi
  done
  ((${#worlds[@]})) || return 0
  if [[ -n "${ANNOUNCE_HOST:-}" ]]; then
    # the forced command reads the world ids from the command asked for, and checks them again
    ssh "$ANNOUNCE_HOST" "${worlds[*]}" </dev/null || status=$?
    if ((status)); then
      echo "Warning: telling the donors of ${worlds[*]} that their city is built did not fully work (exit $status, see above). The deploy itself is done." >&2
    fi
    return 0
  fi
  if [[ -z "${API_SERVICE:-}" ]]; then
    echo "Not telling the donors of ${worlds[*]} that their city is built: set ANNOUNCE_HOST or API_SERVICE in deploy/.env (see deploy/README.md)."
    return 0
  fi
  if [[ ! "$API_SERVICE" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
    echo "Warning: API_SERVICE is not a container or service name; nobody was told a city is built." >&2
    return 0
  fi
  # the remote command, each word quoted for the remote shell; the script comes on stdin
  ssh "$DEPLOY_HOST" "$(printf '%q ' sh -s -- "$API_SERVICE" "${worlds[@]}")" <<'REMOTE' || status=$?
service="$1"
shift
container="$(docker ps --format '{{.Names}}' | awk -v s="$service" '$0 == s || index($0, s ".") == 1' | head -n 1)"
if [ -z "$container" ]; then
  echo "No running container is named $service, nor runs a service of that name." >&2
  exit 3
fi
exec docker exec "$container" node dist/benefactors/announce-cli.js "$@"
REMOTE
  if ((status)); then
    echo "Warning: telling the donors of ${worlds[*]} that their city is built did not fully work (exit $status, see above). The deploy itself is done." >&2
  fi
  return 0
}

# Sends nginx.conf, in place: the container bind-mounts this one file, and a renamed copy would
# leave it reading the old one. nginx only reads it when it starts, so when it changed, the site's
# Dokploy application is redeployed (SITE_DEPLOY_WEBHOOK): a new container starts before the old
# one stops, and Dokploy rolls back if the new one fails.
sync_nginx() {
  local changes
  changes="$(rsync -c --inplace --itemize-changes "$ROOT/deploy/nginx.conf" "$DEPLOY_HOST:$DEPLOY_DIR/")"
  # "<f…": the contents were sent; anything else is at most a change of times or mode
  [[ "$changes" == "<"* ]] || return 0
  if [[ -n "${SITE_DEPLOY_WEBHOOK:-}" ]]; then
    dokploy_deploy "$SITE_DEPLOY_WEBHOOK" "nginx.conf changed"
    echo "nginx.conf changed: the web server is restarting with it"
  else
    echo "nginx.conf changed: reload nginx in its container (nginx -s reload), or set SITE_DEPLOY_WEBHOOK" >&2
  fi
}

# ---- release: what main has and the server does not -----------------------------------------

# Whether anything under the given paths changed between <commit> and HEAD; always, when the
# commit is not known.
changed_since() {
  local since="$1"
  shift
  [[ -z "$since" ]] && return 0
  ! git -C "$ROOT" diff --quiet "$since" HEAD -- "$@"
}

# The API's GraphQL endpoint: API_URL, on the site's origin when it is a path.
api_endpoint() {
  case "${API_URL:-}" in
    http://* | https://*) echo "$API_URL" ;;
    /*) [[ -n "${DEPLOY_URL:-}" ]] && echo "$DEPLOY_URL$API_URL" ;;
    *) return 1 ;;
  esac
}

# Seconds the API's process has been up, or nothing while it does not answer.
api_uptime() {
  { curl -s --max-time 10 -X POST -H 'content-type: application/json' \
    --data '{"query":"{ uptime }"}' "$1" || true; } | sed -nE 's/.*"uptime":([0-9]+).*/\1/p'
}

# Redeploys the API and waits for the new one: answers from a process started since the deploy
# was asked for, twice in a row (the old container answers for a moment after the new one is
# up). Fails after 15 minutes.
deploy_api() {
  local endpoint asked=$SECONDS up fresh=0
  endpoint="$(api_endpoint)" || {
    echo "API_URL (and DEPLOY_URL, for a path) must say where the API answers." >&2
    return 1
  }
  dokploy_deploy "$API_DEPLOY_WEBHOOK" "deploy/deploy.sh release $(git -C "$ROOT" rev-parse --short HEAD)" || return
  echo "API: redeploying; waiting for the new one to answer"
  while ((SECONDS - asked < 900)); do
    sleep 10
    up="$(api_uptime "$endpoint")"
    if [[ -n "$up" ]] && ((up < SECONDS - asked)); then
      fresh=$((fresh + 1))
      if ((fresh == 2)); then
        echo "API: the new one is up ($((SECONDS - asked))s)"
        return 0
      fi
    else
      fresh=0
    fi
  done
  echo "The new API did not answer within 15 minutes: see its deployment in Dokploy." >&2
  return 1
}

# Deploys what this tree (a commit of main) has and the server does not, as deployed/api and
# deployed/viewers say: the API first, then the viewers, which may count on it. A part whose
# deploy fails keeps its old record, so the next release tries it again.
release() {
  local everything="$1" head api_at viewers_at at api=0 viewers=0
  if ! tree_is_main; then
    echo "Not releasing: this tree is not a commit of origin/main as it is" \
      "(fetch, check out main, and leave the viewer and deploy/ unchanged)." >&2
    return 1
  fi
  head="$(git -C "$ROOT" rev-parse HEAD)"
  api_at="$(deployed_commit api)" || return
  viewers_at="$(deployed_commit viewers)" || return
  for at in "$api_at" "$viewers_at"; do
    if [[ -n "$at" ]] && ! git -C "$ROOT" merge-base --is-ancestor "$at" HEAD 2>/dev/null; then
      echo "Not releasing ${head:0:12}: the server has ${at:0:12}, which is newer or not on main." >&2
      return 1
    fi
  done
  if [[ -n "$everything" ]] || changed_since "$api_at" tinyworlds-api ':!*.md'; then api=1; fi
  if [[ -n "$everything" ]] || changed_since "$viewers_at" tinyworlds-frontend deploy ':!*.md'; then viewers=1; fi
  echo "Releasing ${head:0:12}"
  if ((api)); then echo "  API: to deploy (the server's is from ${api_at:-an unknown commit})"; else echo "  API: up to date"; fi
  if ((viewers)); then echo "  viewers: to deploy (the server's are from ${viewers_at:-an unknown commit})"; else echo "  viewers: up to date"; fi

  if ((api)); then
    if [[ -z "${API_DEPLOY_WEBHOOK:-}" ]]; then
      echo "The API changed but API_DEPLOY_WEBHOOK is not set: not deploying it, nor the viewers." >&2
      return 1
    fi
    deploy_api
    set_deployed api "$head"
  fi
  if ((viewers)); then
    if [[ ! -d "$FRONTEND/node_modules" ]]; then
      (cd "$FRONTEND" && npm ci --no-audit --no-fund)
    fi
    # it records deployed/viewers itself, once every viewer is up
    "$ROOT/deploy/deploy.sh" all --no-data
  fi
}

# ---- the command line -----------------------------------------------------------------------

TARGET="${1:-}"
[[ -z "$TARGET" || "$TARGET" == -* ]] && usage
shift

if [[ "$TARGET" == "check" ]]; then
  check_all
  exit
fi

: "${DEPLOY_HOST:?set DEPLOY_HOST (ssh target) in deploy/.env}"
: "${DEPLOY_DIR:?set DEPLOY_DIR (directory on the server) in deploy/.env}"

if [[ "$TARGET" == "release" ]]; then
  EVERYTHING=""
  for arg in "$@"; do
    case "$arg" in
      --everything) EVERYTHING=1 ;;
      *) usage ;;
    esac
  done
  release "$EVERYTHING"
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

# the builds' copies live beside the frontend, on its disk (hard links cannot cross disks)
WORK="$(mktemp -d "$ROOT/.deploy-work.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# without data, what counts is the data on the server
if [[ "$MODE" == "--no-data" ]]; then
  SERVER_DATA="$WORK/server-data"
  mirror_server_data "$SERVER_DATA"
fi

if [[ "$TARGET" == "all" ]]; then
  check_all
  # shellcheck disable=SC2207
  WORLDS=($(registry_worlds))
  TARGETS=("${WORLDS[@]}")
  [[ "$MODE" != "--data" ]] && TARGETS+=(home)
else
  if [[ "$TARGET" != "home" && ! -f "$(data_of "$TARGET")/manifest.json" ]]; then
    if [[ -n "${SERVER_DATA:-}" ]]; then
      echo "No map data for $TARGET on the server: send it first ('deploy/deploy.sh $TARGET --data')." >&2
    else
      echo "No map data for $TARGET: run 'npm run all -- --city $TARGET' in tinyworlds-pipeline first." >&2
    fi
    exit 1
  fi
  TARGETS=("$TARGET")
fi

if [[ "$MODE" != "--data" ]]; then
  guard_tree
  # what goes up is not main's: until a release puts main back, the server does not know what
  # its viewers come from (and the next release rebuilds them all)
  tree_is_main || set_deployed viewers ""
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
if [[ "$MODE" != "--data" ]]; then
  sync_nginx
  # every viewer, from a commit of main: that is what the site now runs
  if [[ "$TARGET" == "all" ]] && tree_is_main; then
    set_deployed viewers "$(git -C "$ROOT" rev-parse HEAD)"
  fi
fi

# the worlds are up: the donors of a city that has just been built hear of it
if [[ "$TARGET" == "all" ]]; then
  announce_built "${WORLDS[@]}"
elif [[ "$TARGET" != "home" ]]; then
  announce_built "$TARGET"
fi

if [[ "$TARGET" == "all" ]]; then
  echo "Deployed ${#TARGETS[@]} targets: ${TARGETS[*]}"
fi
