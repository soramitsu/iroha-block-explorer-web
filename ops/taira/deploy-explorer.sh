#!/usr/bin/env bash
set -euo pipefail

ROOT="${TAIRA_EXPLORER_ROOT:-/Users/administrator/dev/iroha-block-explorer-web}"
SERVED_DIST="${TAIRA_EXPLORER_SERVED_DIST:-/Users/administrator/dev/iroha2-block-explorer-web/dist}"
HEALTH_URL="${TAIRA_EXPLORER_URL:-https://taira-explorer.sora.org/}"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$ROOT"

if [[ "${TAIRA_EXPLORER_PULL:-0}" == "1" ]]; then
  git fetch --prune origin
  git pull --ff-only origin "$(git branch --show-current)"
fi

if command -v corepack >/dev/null 2>&1; then
  corepack enable
fi

if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile
  pnpm build
else
  npm ci
  npm run build
fi

mkdir -p "$SERVED_DIST"
rsync -a --delete "$ROOT/dist/" "$SERVED_DIST/"

for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    echo "Explorer is reachable: $HEALTH_URL"
    echo "Synced dist to: $SERVED_DIST"
    exit 0
  fi
  sleep 2
done

echo "Explorer did not become reachable: $HEALTH_URL" >&2
exit 1
