#!/bin/sh

# Alfred supplies the complete timeline request as a Script Filter variable.
exec env frrTimelineForceRefresh=1 node "$(dirname "$0")/../dist/app/timeline.js" "$frrTimelineRequest" >/dev/null
