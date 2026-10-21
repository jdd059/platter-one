#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
printf '\nSetup complete. Start with: ./Start\ Platter\ One.command\n'
