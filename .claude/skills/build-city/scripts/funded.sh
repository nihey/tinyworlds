#!/usr/bin/env bash
# Lists the live site's cities with their status, funded first: a FUNDED city is waiting to be
# built. Reads DEPLOY_URL and API_URL from deploy/.env (gitignored: copy it into a worktree).
# usage: bash .claude/skills/build-city/scripts/funded.sh
set -euo pipefail
root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
set -a
# shellcheck disable=SC1091
. "$root/deploy/.env"
set +a
url="$API_URL"
[[ "$url" == http* ]] || url="${DEPLOY_URL%/}$url"
curl -sf -m 20 "$url" -H 'content-type: application/json' \
  -d '{"query":"{ cityMilestones { slug name raisedCents goalCents donations status worldId } }"}' |
  jq -r '.data.cityMilestones
    | sort_by(if .status == "FUNDED" then 0 elif .status == "BUILDING" then 1 elif .status == "PROPOSED" then 2 else 3 end)
    | .[] | [.status, .slug, .name, "US$\(.raisedCents / 100) of \(.goalCents / 100)", "\(.donations) gifts", (.worldId // "-")]
    | @tsv'
