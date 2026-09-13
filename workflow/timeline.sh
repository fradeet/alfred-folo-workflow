#!/bin/sh

set -- node dist/timeline.js "$FOLO_FILTER"

if [ "${FOLO_IS_UNREAD:-}" = "1" ]; then
  set -- "$@" --unread-only
fi

exec "$@"
