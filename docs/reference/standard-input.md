# Standard input reference

Every app entry point under `workflow/dist/app/` that Alfred calls directly also
accepts a uniform "standard input" for external callers. Standard input is the
name of this project's app input protocol; it is not Unix stdin.

The protocol leaves the workflow's internal behavior untouched: Alfred nodes
keep passing complete serialized contracts through argv, and those calls never
read the standard input variables described here.

## JSON format

Pass one JSON object as the complete argv argument, marked as standard input by
`kind`:

```json
{
  "kind": "standard",
  "version": 1
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `kind` | `"standard"` | yes | Recognized when exactly `"standard"` |
| `version` | positive integer | no | Defaults to `1`; any other version is an error |
| business fields | per app | per app | Top level of the same object; unknown fields are errors |

The target app is the executable you invoke, so the JSON never names an app.
The former argv field `isStandardInput` is not supported; use
`kind: "standard"`. An argv value that is both a known workflow contract and a
standard input is rejected as a conflict.

## Detection and merging

A call enters standard input mode when:

1. argv is a JSON object carrying `kind: "standard"` (a call that matches a
   known workflow contract is never treated as standard input), or
2. argv is empty and the app's `frr<AppId>IsStandardInput` is exactly `1`.

In standard input mode each field resolves by priority:

1. the argv JSON field, when present — `false`, `0`, `""`, and `null` count as
   present and are never replaced by lower-priority values;
2. the app's `frr<AppId><Field>` environment variable;
3. the field's explicitly linked global configuration, when one exists;
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

The app module is the authoritative source for its business fields. Its
`*StandardInput` class defines validation, normalization, required values, and
defaults; the adjacent `*StandardSpec` declares the hardcoded environment
variable mapping.

| App | Executable | Input definition | Notes |
| --- | --- | --- | --- |
| `timeline` | `workflow/dist/app/timeline.js` | [`TimelineStandardInput` and `timelineStandardSpec`](../../src/app/timeline.ts) | Query filtering remains Alfred's responsibility. The existing workflow meaning of `frrTimelineUnreadOnly` is preserved. |
| `subscriptions` | `workflow/dist/app/subscriptions.js` | [`SubscriptionsStandardInput` and `subscriptionsStandardSpec`](../../src/app/subscriptions.ts) | Query filtering remains Alfred's responsibility. |
| `unread` | `workflow/dist/app/unread.js` | [`UnreadStandardInput` and `unreadStandardSpec`](../../src/app/unread.ts) | Query filtering remains Alfred's responsibility. |
| `mark-read` | `workflow/dist/app/mark-read.js` | [`MarkReadStandardInput` and `markReadStandardSpec`](../../src/app/mark-read.ts) | Workflow selections remain complete contracts and ignore standard business variables. |
| `mark-read-above` | `workflow/dist/app/mark-read-above.js` | [`MarkReadAboveStandardInput` and `markReadAboveStandardSpec`](../../src/app/mark-read-above.ts) | Requires an accessible cached timeline response; standard input does not create or restore the cache. |
| `login` | `workflow/dist/app/login.js` | [`LoginStandardInput` and `loginStandardSpec`](../../src/app/login.ts) | Still requires macOS, Alfred, and `osascript`. |

`cache-subscription-icons` is an internal background worker and does not offer
standard input.

## Examples

argv form:

```text
node workflow/dist/app/<app>.js \
  '{"kind":"standard","version":1,"<field>":"<value>"}'
```

environment-only form:

```text
frr<AppId>IsStandardInput=1 \
frr<AppId><Field>=<value> \
node workflow/dist/app/<app>.js
```

The two forms may be combined. An argv field always overrides its mapped
environment variable.
