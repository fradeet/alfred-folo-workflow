#!/bin/sh

frrTimelineUnreadOnly=${frrTimelineUnreadOnly:-1}

exec node dist/app/timeline.js "$frrTimelineFilter"
