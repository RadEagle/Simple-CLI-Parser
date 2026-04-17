#!/bin/bash
set -e

entry_ts="$1"
shift

tsc -p tsconfig.json
exec node "${entry_ts%.ts}.js" "$@"