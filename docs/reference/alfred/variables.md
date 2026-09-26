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
