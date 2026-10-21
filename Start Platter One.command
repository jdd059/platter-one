#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
    printf 'Run ./scripts/setup.sh once to install the bridge dependencies\n'
    exit 1
fi
exec .venv/bin/python -m bridge.server "$@"
