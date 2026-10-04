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

## Timeline refresh input

The timeline Script Filter exports `frrTimelineQuery`, `frrTimelineView`, `frrTimelineLimit`,
`frrTimelineUnreadOnly`, `frrTimelineCursor`, `frrTimelineFeed`,
`frrTimelineList`, and `frrTimelineCategory`. These are the exact standard
environment input fields accepted by the timeline app. The output includes
empty values for unset optional fields, so an older environment value cannot
change the current query. The item `arg` remains a `TimelineSelection` for
entry actions.

The timeline app also keeps a separate timestamped result in
`folo-requests/timeline/`, keyed by the complete normalized request including the
local `query`. It reads that result for up to 5 minutes, then refreshes it from
Folo. `frrResultCacheKey` identifies the corresponding CLI response cache file.

The last successful timeline input is also saved in
`folo-requests/timeline/last-timeline-request.json`. Run
`workflow/dist/app/last-timeline-query.js` to print its serialized standard input;
the output can be passed unchanged as one argument to `workflow/dist/app/timeline.js`.
This saved input does not expire with the 5-minute result cache.

The timeline Script Filter's Shift and Enter connection runs
`workflow/script/refresh-timeline.sh`. The script sets
`frrTimelineIsStandardInput=1` and `frrTimelineForceRefresh=1`, then runs the
timeline app with no argv input. The app reads the exported field variables,
skips its 60-second read cache, fetches the same page from Folo, and replaces
the cached response.
