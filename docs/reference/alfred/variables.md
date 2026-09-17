# Variables

## `frr_result_cache_key`

Whenever a Script Filter requests data from the Folo CLI, the response is stored as a JSON
file in `folo-requests/` inside the workflow's cache directory (`alfred_workflow_cache`).
The Script Filter reports the filename in this workflow variable, so downstream objects
always know which stored response belongs to the list they saw. The filename is a stable
hash of the complete CLI arguments: the same request maps to the same file, while another
view, feed, or cursor produces a new key.

Use it in a connected Run Script by joining it with the cache directory, for example to
inspect the stored response of the list the user just acted on:

```bash
cat "$alfred_workflow_cache/folo-requests/$frr_result_cache_key"
```
