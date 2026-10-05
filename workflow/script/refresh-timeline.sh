#!/bin/sh

# Alfred passes standard timeline input fields as workflow environment variables.
exec env frrTimelineIsStandardInput=1 frrTimelineForceRefresh=1 node "$(dirname "$0")/../dist/app/timeline.js" >/dev/null
