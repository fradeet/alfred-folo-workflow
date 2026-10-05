#!/bin/sh

exec node dist/app/timeline.js "$frr_timeline_filter"
