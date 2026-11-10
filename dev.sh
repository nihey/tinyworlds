#!/usr/bin/env bash
# tinyworlds in tmux: the viewer's dev server, the donations API, and a shell in the pipeline.
#   ./dev.sh            the New York viewer
#   ./dev.sh tinyrao    another world (or "home" for the front page)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION="tinyworlds"
WORLD="${1:-tinynyc}"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  exec tmux attach -t "$SESSION"
fi

tmux new-session -d -s "$SESSION" -n dev -c "$ROOT/tinyworlds-frontend"
tmux send-keys -t "$SESSION:dev.0" "NEXT_PUBLIC_WORLD=$WORLD NEXT_PUBLIC_API_URL=http://localhost:4000/api/graphql npm run dev" C-m
tmux split-window -h -t "$SESSION:dev" -c "$ROOT/tinyworlds-api"
tmux send-keys -t "$SESSION:dev.1" "docker compose up -d && npm run start:dev" C-m
tmux split-window -v -t "$SESSION:dev.1" -c "$ROOT/tinyworlds-pipeline"
tmux send-keys -t "$SESSION:dev.2" "# npm run all -- --city $WORLD   (fetch → scene → render → index);  npm run cli -- --city $WORLD preview --at lon,lat" C-m
tmux select-pane -t "$SESSION:dev.0"
exec tmux attach -t "$SESSION"
