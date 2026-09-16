#!/bin/sh

exec node dist/app/timeline.js "$FRR_TIMELINE_FILTER"
