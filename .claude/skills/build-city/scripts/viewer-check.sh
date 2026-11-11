#!/usr/bin/env bash
# Builds one world's viewer the way the deploy does, serves it with this checkout's map data and
# drives it in headless Chrome (check-viewer.mjs): <out>-view.png, -hover.png (the pointer over
# a sight), -quiz.png and -answer.png (a round of Guess the building), and the console errors.
# Needs node_modules in tinyworlds-frontend and tinyworlds-videos (puppeteer-core), and
# /usr/bin/google-chrome. `next dev` is not used: it dies with EMFILE when other sessions hold
# the inotify instances.
# usage: bash viewer-check.sh <world> "<lat>,<lon>,<scale>" <hoverX> <hoverY> <outPrefix> [port]
#        bash viewer-check.sh --live <world> "<lat>,<lon>,<scale>" <hoverX> <hoverY> <outPrefix>
#          (the deployed site, DEPLOY_URL from deploy/.env: no build)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(git -C "$here" rev-parse --show-toplevel)"
if [[ "${1:-}" == "--live" ]]; then
  shift
  set -a
  # shellcheck disable=SC1091
  . "$root/deploy/.env"
  set +a
  exec node "$here/check-viewer.mjs" "$root/tinyworlds-videos" "${DEPLOY_URL%/}/$1/#$2" "$5" "$3" "$4"
fi
world="$1" view="$2" hx="$3" hy="$4" out="$5" port="${6:-4185}"
fe="$root/tinyworlds-frontend"
[[ -f "$fe/public/data/$world/manifest.json" ]] || { echo "no map data for $world in $fe/public/data" >&2; exit 1; }
work="$root/.deploy-work.check-$world"
rm -rf "$work"
mkdir -p "$work/site"
srv=""
cleanup() {
  [[ -n "$srv" ]] && kill "$srv" 2>/dev/null
  rm -rf "$work"
}
trap cleanup EXIT
# the build copies public/ into out/: leave the tiles out of it, link them in afterwards
rsync -a --exclude '/node_modules/' --exclude '/.next/' --exclude '/out/' --exclude '/public/data/' "$fe/" "$work/fe/"
cp -al "$fe/node_modules" "$work/fe/node_modules"
if ! (cd "$work/fe" && NEXT_PUBLIC_WORLD="$world" NEXT_PUBLIC_BASE_PATH="/$world" \
  NEXT_PUBLIC_DATA_BASE="/$world/data" npm run build >"$work/build.log" 2>&1); then
  tail -30 "$work/build.log" >&2
  exit 1
fi
cp -r "$work/fe/out" "$work/site/$world"
ln -s "$fe/public/data/$world" "$work/site/$world/data"
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$work/site" >"$work/http.log" 2>&1 &
srv=$!
sleep 1
node "$here/check-viewer.mjs" "$root/tinyworlds-videos" "http://127.0.0.1:$port/$world/#$view" "$out" "$hx" "$hy"
