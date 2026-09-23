# Standard input reference

Every app entry point under `workflow/dist/app/` that Alfred calls directly also
accepts a uniform "standard input" for external callers. Standard input is the
name of this project's app input protocol; it is not Unix stdin.

The protocol leaves the workflow's internal behavior untouched: Alfred nodes
keep passing complete serialized contracts through argv, and those calls never
read the standard input variables described here.

## JSON format

Pass one JSON object as the complete argv argument, marked as standard input by
`kind` or `isStandardInput`:

```json
{
  "kind": "standard",
  "version": 1,
  "view": "articles",
  "limit": 30
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `kind` | `"standard"` | one of the two markers | Recognized when exactly `"standard"` |
| `isStandardInput` | `1` | one of the two markers | Number `1` in JSON, string `"1"` in the environment |
| `version` | positive integer | no | Defaults to `1`; any other version is an error |
| business fields | per app | per app | Top level of the same object; unknown fields are errors |

The target app is the executable you invoke, so the JSON never names an app.
If both markers appear, `kind` must be `"standard"` and `isStandardInput` must
be `1`. An argv value that is both a known workflow contract and a standard
input is rejected as a conflict.

## Detection and merging

A call enters standard input mode when:

1. argv is a JSON object carrying `kind: "standard"` or `isStandardInput: 1`
   (a call that matches a known workflow contract is never treated as
   standard input), or
2. argv is empty and the app's `frr<AppId>Kind` is exactly `standard` or its
   `frr<AppId>IsStandardInput` is exactly `1`.

In standard input mode each field resolves by priority:

1. the argv JSON field, when present — `false`, `0`, `""`, and `null` count as
   present and are never replaced by lower-priority values;
2. the app's `frr<AppId><Field>` environment variable;
3. the field's linked global configuration (only `FRR_TIMELINE_LIMIT` today);
4. the app input class default.

Environment values convert strictly: booleans accept `1`, `0`, `true`,
`false`; integers accept non-negative digits; anything else is an error. An
invalid environment value that argv overrides does not fail the call. Markers,
versions, unknown fields, missing required fields, and wrong types produce an
error — Script Filters emit an Alfred error item with exit code 1, action
scripts write the message to stderr with exit code 1.

Non-standard calls (queries, share URLs, selections, view inputs) ignore every
`frr<AppId>…` standard business variable. Do not pass tokens or other secrets
through argv: the argument list is visible to other processes on the system.

## Apps

### `timeline`

Executable: `workflow/dist/app/timeline.js`

| JSON field | Environment variable | Type | Required | Default |
| --- | --- | --- | --- | --- |
| `query` | `frrTimelineQuery` | string | no | `""` |
| `view` | `frrTimelineView` | string | no | none |
| `limit` | `frrTimelineLimit` | positive integer | no | `FRR_TIMELINE_LIMIT`, else `30` |
| `unreadOnly` | `frrTimelineUnreadOnly` | boolean | no | `false` |
| `cursor` | `frrTimelineCursor` | string | no | none |
| `feed` | `frrTimelineFeed` | string | no | none |
| `list` | `frrTimelineList` | string | no | none |
| `category` | `frrTimelineCategory` | string | no | none |

Markers: `frrTimelineKind`, `frrTimelineIsStandardInput`.

`query` is accepted for interface completeness but, as with the workflow
itself, result filtering is done by Alfred — an external caller gets the full
rendered list. `frrTimelineUnreadOnly` keeps its existing Alfred meaning in
workflow-internal calls.

### `subscriptions`

Executable: `workflow/dist/app/subscriptions.js`

| JSON field | Environment variable | Type | Required | Default |
| --- | --- | --- | --- | --- |
| `query` | `frrSubscriptionsQuery` | string | no | `""` |
| `view` | `frrSubscriptionsView` | string | no | none |
| `category` | `frrSubscriptionsCategory` | string | no | none |

Markers: `frrSubscriptionsKind`, `frrSubscriptionsIsStandardInput`.

`query` is not applied inside the app; Alfred filters the workflow's rendered
items, so external standard calls return the unfiltered list.

### `unread`

Executable: `workflow/dist/app/unread.js`

| JSON field | Environment variable | Type | Required | Default |
| --- | --- | --- | --- | --- |
| `query` | `frrUnreadQuery` | string | no | `""` |
| `view` | `frrUnreadView` | string | no | none |

Markers: `frrUnreadKind`, `frrUnreadIsStandardInput`.

`query` behaves like `subscriptions`: filtering is Alfred's job.

### `mark-read`

Executable: `workflow/dist/app/mark-read.js`

| JSON field | Environment variable | Type | Required | Default |
| --- | --- | --- | --- | --- |
| `entryId` | `frrMarkReadEntryId` | non-empty string | yes | none |

Markers: `frrMarkReadKind`, `frrMarkReadIsStandardInput`.

Workflow-internal calls still pass the complete `TimelineSelection`; standard
variables never override a selection's fields.

### `mark-read-above`

Executable: `workflow/dist/app/mark-read-above.js`

| JSON field | Environment variable | Type | Required | Default |
| --- | --- | --- | --- | --- |
| `entryId` | `frrMarkReadAboveEntryId` | non-empty string | yes | none |
| `resultCacheKey` | `frrMarkReadAboveResultCacheKey` | non-empty string | yes | none |

Markers: `frrMarkReadAboveKind`, `frrMarkReadAboveIsStandardInput`.

`resultCacheKey` must name a timeline response already stored by a previous
Script Filter run in the same environment (the `frrResultCacheKey` reported by
the timeline or subscription list). Standard input only transports the key; it
neither creates, transfers, nor restores the cache, and a missing cache file is
an error.

### `login`

Executable: `workflow/dist/app/login.js`

| JSON field | Environment variable | Type | Required | Default |
| --- | --- | --- | --- | --- |
| `workflowBundleId` | `frrLoginWorkflowBundleId` | non-empty string | yes | none |

Markers: `frrLoginKind`, `frrLoginIsStandardInput`.

`workflowBundleId` names the Alfred workflow whose `FOLO_TOKEN`
configuration receives the token; workflow-internal calls keep using
`alfred_workflow_bundleid`. Login still requires macOS, a running Alfred, and
`osascript` — standard input only changes how the bundle ID is provided.

`cache-subscription-icons` is an internal background worker, not called by
Alfred directly, and offers no standard input.

## Examples

argv only:

```bash
node workflow/dist/app/mark-read.js \
  '{"kind":"standard","version":1,"entryId":"entry-1"}'
```

environment only:

```bash
frrMarkReadKind=standard \
frrMarkReadEntryId=entry-1 \
node workflow/dist/app/mark-read.js
```

mixed, with argv overriding the environment (`limit` is `20`, `view` is
`articles`, `unreadOnly` is `false`):

```bash
frrTimelineLimit=50 \
frrTimelineView=articles \
node workflow/dist/app/timeline.js \
  '{"kind":"standard","version":1,"limit":20,"unreadOnly":false}'
```
