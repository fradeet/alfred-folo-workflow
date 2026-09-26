# Variables

## `frrResultCacheKey`

Whenever a Script Filter requests data from the Folo CLI, the response is stored as a JSON
file in `folo-requests/` inside the workflow's cache directory (`alfred_workflow_cache`).
The Script Filter reports the filename in this workflow variable, so downstream objects
always know which stored response belongs to the list they saw. The filename is a stable
hash of the complete CLI arguments: the same request maps to the same file, while another
view, feed, or cursor produces a new key.

Use it in a connected Run Script by joining it with the cache directory, for example to
inspect the stored response of the list the user just acted on:

```bash
cat "$alfred_workflow_cache/folo-requests/$frrResultCacheKey"
```

The mark-read-above action reads the stored timeline response through this variable: it
locates the selected entry in the recorded list and marks every unread entry above it,
so the action follows the list the user saw instead of a freshly fetched timeline. A
fresh CLI call overwrites the file of the same request.

## `frrTimelineRequest`

The timeline Script Filter reports its complete normalized query as a serialized
`TimelineStandardInput` JSON value in this session variable. It includes the effective
`query`, `view`, `limit`, `unreadOnly`, `cursor`, `feed`, `list`, and `category` values,
including defaults resolved from workflow configuration. Downstream actions can pass the
value unchanged as one argument to the timeline app or another app that accepts this
contract. The variable describes the current page, so its `cursor` is the cursor used to
fetch that page.

The timeline app also keeps a separate timestamped result in
`folo-requests/timeline/`, keyed by the complete normalized request including the
local `query`. It reads that result for up to 60 seconds, then refreshes it from
Folo. `frrResultCacheKey` continues to identify the response used by downstream
mark-read actions.

The last successful timeline input is also saved in
`folo-requests/timeline/last-timeline-request.json`. Run
`workflow/dist/app/last-timeline-query.js` to print its serialized standard input;
the output can be passed unchanged as one argument to `workflow/dist/app/timeline.js`.
This saved input does not expire with the 60-second result cache.

The timeline Script Filter's Shift and Enter connection runs
`workflow/script/refresh-timeline.sh`. That adapter forwards `frrTimelineRequest`
unchanged as one argv value to the timeline app and sets
`frrTimelineForceRefresh=1`. The app skips its 60-second read cache, fetches the
same page from Folo, and replaces the cached response. The selected item's
`arg` is a `TimelineSelection` for entry actions and is not the refresh input.
