#!/bin/sh
set -eu

PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH
unset CDPATH ENV BASH_ENV NODE_OPTIONS NODE_PATH

COMMAND="${1:-deploy}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
DEFAULT_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd -P)"
ROOT="${TAIRA_EXPLORER_ROOT:-$DEFAULT_ROOT}"

case "$COMMAND" in
  manifest|initialize|deploy|prepare-transition|verify)
    if [ "$#" -ne 1 ]; then
      echo "Usage: $0 $COMMAND" >&2
      exit 2
    fi
    ;;
  transition|rollback)
    if [ "$#" -ne 2 ]; then
      echo "Usage: $0 $COMMAND <exact-release-id>" >&2
      exit 2
    fi
    ;;
  *)
    echo "Unknown command: $COMMAND" >&2
    echo "Usage: $0 {manifest|initialize|deploy|prepare-transition|transition <exact-release-id>|verify|rollback <exact-release-id>}" >&2
    exit 2
    ;;
esac

cd -- "$ROOT"
ROOT="$(pwd -P)"
export TAIRA_EXPLORER_ROOT="$ROOT"

exec /bin/sh "$DEFAULT_ROOT/scripts/bootstrap-exact-toolchain.sh" \
  taira-release "$@"
