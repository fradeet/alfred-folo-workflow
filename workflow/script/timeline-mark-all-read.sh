#!/bin/sh
# Reuse the timeline's exported standard input variables.
exec env frrTimelineMarkAllReadIsStandardInput=1 node "$(dirname "$0")/../dist/app/timeline-mark-all-read.js"
