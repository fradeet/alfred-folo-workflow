# PRD: App Standard Input

## 1. Document Information

- Status: Draft
- Target version: TBD
- In scope: executable entry points under `src/app` that Alfred invokes directly
- Out of scope: Folo blocks, contracts passed between Alfred nodes, and internal background workers

### 1.1 Confirmed Product Decisions

1. Standard JSON retains the `version` field. The executed entry point determines the target app, so the JSON does not need an `app` field.
2. Query behavior for `timeline`, `subscriptions`, and `unread` remains unchanged. This requirement does not add in-app filtering.
3. `login` supports standard input without changing its dependency on macOS, Alfred, or `osascript`.
4. Standard input retains global-configuration fallbacks, with lower priority than argv and app-specific camelCase standard variables.

## 2. Background

The executable entry points under `src/app` primarily serve the Alfred workflow:

- Alfred nodes pass complete serialized class contracts through argv.
- Workflow configuration and auxiliary runtime state are passed through environment variables.
- Some entry points also accept compatibility inputs such as plain strings.

This design works well for internal workflow orchestration, but an external program that wants to invoke an app directly must understand Alfred's node structure, upstream contracts, or the existing collection of environment variables. To reduce that burden, every app that Alfred invokes directly should provide a uniform, stable, and verifiable standard-input capability.

Standard input is a public interface. It neither replaces nor changes existing workflow-internal input contracts. Each app hardcodes its environment variable names; names must not be generated from filenames, class names, or property names. argv and standard environment variables are merged only after the invocation has been recognized as standard input.

## 3. Product Goals

### 3.1 Goals

1. Allow external callers to invoke public apps directly without constructing an upstream Alfred selection contract.
2. Represent all standard input required by each app with one app-specific class.
3. Accept standard input from argv, app-specific environment variables, or both.
4. Allow argv and environment variables to form one complete input, with argv taking precedence for the same field.
5. Parse, convert, merge, and validate all external input at the app boundary.
6. Preserve existing Alfred workflow behavior, inter-node contracts, output formats, and error handling.
7. Establish environment variable names, field types, defaults, and error semantics as stable public interfaces.
8. Make standard input a repository-wide shared capability that future Alfred entry points adopt by default, rather than designing a new parser for every entry point.

### 3.2 Non-goals

1. Do not read input from Unix stdin. “Standard input” is the name of this project's app input protocol.
2. Do not convert existing contracts passed between Alfred nodes into standard input.
3. Do not allow environment variables to override business fields in non-standard inputs, such as selections, entry IDs, or feed IDs.
4. Do not generate environment variable names from filenames or property names.
5. Do not change Folo CLI arguments or its JSON envelope.
6. Do not change existing app output contracts.
7. Do not require internal background workers to support standard input.
8. Do not add query filtering, cache generation, or login capabilities. This requirement only standardizes input for capabilities the apps already provide.

## 4. Terminology

### 4.1 Standard Input

App input intended for external callers. An app-specific class represents standard input, which may be constructed from standard JSON argv, standard environment variables, or both.

### 4.2 Non-standard Input

Existing contracts passed between Alfred nodes, plain query strings, Folo share URLs, view inputs, and other compatibility inputs. Non-standard input continues through its existing parsing path and never participates in standard environment-variable merging.

### 4.3 App ID

A stable identifier for the target app in the standard-input protocol. The app ID is documented explicitly and is never derived from a file path at runtime. The first-version app IDs match the current filenames:

- `timeline`
- `subscriptions`
- `unread`
- `mark-read`
- `mark-read-above`
- `login`

Every new entry point must document a new stable app ID. Once published as part of the standard-input interface, an app ID must not change merely because a file is renamed.

## 5. User Scenarios

### 5.1 argv Only

An external caller passes complete standard input as one JSON argument:

```bash
node workflow/dist/app/mark-read.js \
  '{"kind":"standard","version":1,"entryId":"entry-1"}'
```

### 5.2 Environment Variables Only

An external caller constructs the input from the standard marker and app-specific environment variables:

```bash
frrMarkReadIsStandardInput=1 \
frrMarkReadEntryId=entry-1 \
node workflow/dist/app/mark-read.js
```

### 5.3 Combined argv and Environment Variables

An external caller can provide defaults through environment variables and override selected fields through argv:

```bash
frrTimelineLimit=50 \
frrTimelineView=articles \
node workflow/dist/app/timeline.js \
  '{"kind":"standard","version":1,"limit":20,"unreadOnly":false}'
```

The resulting input has `limit` set to `20`, `view` set to `articles`, and `unreadOnly` set to `false`.

### 5.4 Preserve Alfred's Internal Input

When `mark-read` receives a `TimelineSelection`, it must continue parsing the complete existing contract. Even if the process environment contains `frrMarkReadEntryId`, that variable must not override the selection's `entryId`.

## 6. Standard-input Protocol

### 6.1 JSON Structure

Standard argv is a JSON object passed as one complete command-line argument:

```json
{
  "kind": "standard",
  "version": 1,
  "view": "articles",
  "limit": 30
}
```

The common protocol fields are:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | `"standard"` | yes | Identifies standard input |
| `version` | positive integer | no | Defaults to `1`; unsupported versions are errors |

Business fields live at the top level of the same JSON object, avoiding an unnecessary envelope for a small set of scalar parameters. The executable selected by the caller determines the target app, so standard JSON does not repeat an `app` field. Stable app IDs remain relevant to environment variable naming, entry-point configuration, documentation, and future compatibility management.

### 6.2 Standard-input Detection

argv JSON is recognized as standard input when `kind === "standard"`.

For an environment-only invocation, standard-input mode is enabled only when the app-specific `frr<AppId>IsStandardInput` environment variable is exactly `1`.

Detection must follow this order:

1. If non-empty argv can be recognized as an existing non-standard contract, parse it through the existing path and ignore all standard environment variables.
2. If non-empty argv carries the standard marker, enter standard-input mode.
3. Only when argv is empty may an environment marker enable standard-input mode by itself.
4. Otherwise, preserve the app's existing input behavior.

If argv simultaneously represents a known non-standard contract and standard input, report an input conflict instead of guessing the caller's intent.

### 6.3 Merge Priority

After entering standard-input mode, resolve each business field in this order:

1. A field explicitly present in argv JSON.
2. The corresponding app-specific lowerCamelCase environment variable.
3. An explicitly linked global configuration value for that field.
4. The default defined by the app input class.
5. If a required field still has no value, report a missing argument.

The third source applies only to fields explicitly linked to global configuration. The implementation must not merge all global environment variables into standard input automatically.

Merging must depend on field presence, not truthiness. The following argv values all count as explicit input:

- `false`
- `0`
- `""`
- `null`

The app-specific input class decides whether such values are valid, but the merge stage must not replace them with lower-priority values.

When argv overrides a lower-priority value, the lower-priority value does not need to be parsed or validated. For example, if argv provides a valid `limit`, an invalid overridden `frrTimelineLimit` must not fail the invocation.

### 6.4 Parsing and Validation

1. Treat argv and environment variables as untrusted input.
2. Read environment variables only through mappings explicitly declared by the app.
3. Convert numbers, booleans, and nullable values with field-specific rules rather than JavaScript coercion.
4. After merging, construct the app's standard-input class exactly once and let that class perform final validation and normalization.
5. For unsupported versions, missing required fields, or invalid field values, report errors according to the app type:
   - A Script Filter emits an Alfred error item and sets a non-zero exit code.
   - An action script writes the error to stderr and sets a non-zero exit code.
6. Unknown JSON fields in version 1 are errors so callers discover typos promptly.

### 6.5 Marker Consistency

JSON uses only `kind: "standard"` to mark standard input. Environment input uses only the app-specific `frr<AppId>IsStandardInput=1` marker. The two forms do not share a field name or value type.

## 7. Alfred Variable and Environment-variable Conventions

### 7.1 Project Variable Layers

Because apps run inside the Alfred workflow environment, the project uses naming style to distinguish variable scope and origin. Project-owned variables must follow these conventions:

| Form | Example | Meaning | Stability |
| --- | --- | --- | --- |
| uppercase snake case | `FRR_TIMELINE_LIMIT` | Global environment variable or user-configurable workflow setting | Stable; may be used by multiple nodes or apps |
| lower camel case | `frrTimelineUnreadOnly` | Stable value produced by an Alfred node or supplied by a caller for one app | Stable; may be an interface between nodes and apps |
| lowercase snake case | `result_cache_key` | Non-public, short-lived workflow intermediate, usually passed near the end of a flow | Private; not guaranteed across versions |

Standard-input fields belong to the second category. Alfred or an external caller sets them for a particular app and passes them through the environment, so they consistently use lower camel case.

Uppercase variables must not represent per-invocation standard-input fields; they are reserved for workflow-global or cross-app configuration. Lowercase snake-case variables must not become part of the public standard-input interface.

Alfred's own reserved variables retain their platform-defined names, such as `alfred_workflow_bundleid` and `alfred_workflow_cache`.

### 7.2 Standard-input Variable Naming

Standard-input variables use this readable structure:

```text
<prefix><AppId><Field>
```

The first version uses the lowercase `frr` prefix, followed by the app ID and field converted to UpperCamelCase. For example:

```text
frrMarkReadEntryId
frrMarkReadAboveResultCacheKey
```

This format provides naming consistency only. Every variable name must still be written explicitly in the corresponding app's code. The implementation must not construct environment variable names dynamically from filenames, app IDs, or field names.

### 7.3 Common Marker Variable

Each app explicitly declares its own standard-input marker:

```text
frr<AppId>IsStandardInput
```

The environment enters standard-input mode when this variable is exactly the string `1`.

For example, `timeline` uses `frrTimelineIsStandardInput`.

### 7.4 Global Variables, Standard Variables, and Defaults

The same business concept may have both a global configuration value and a per-invocation standard-input value, but they must use different names with explicit precedence. For example, the timeline limit uses:

- `FRR_TIMELINE_LIMIT`: user-defined global workflow configuration.
- `frrTimelineLimit`: input for one standard timeline invocation.

In standard-input mode, precedence is:

1. argv JSON field.
2. App-specific lowerCamelCase standard variable.
3. Uppercase snake-case global configuration.
4. App input class default.

Non-standard input preserves the current global-configuration behavior and ignores camelCase business variables that exist only for standard input. CamelCase variables already used by Alfred's internal flow retain their existing semantics.

### 7.5 Existing Environment Variables

Existing Alfred variables retain their current semantics, including:

- `FRR_TIMELINE_LIMIT`
- `frrTimelineUnreadOnly`
- `frrResultCacheKey`
- `alfred_workflow_bundleid`

If standard input also adopts an existing variable, the app must explicitly document whether it is a standard variable, a compatibility alias, or internal to Alfred. Standard input must not implicitly scan or inherit other environment variables.

## 8. App Input Definitions

The following tables define the first-version public fields. Final class names may follow project naming conventions, but every app must have its own standard-input class.

### 8.1 `timeline`

Suggested class: `TimelineStandardInput`

| JSON field | Environment variable | Type | Required | Default |
| --- | --- | --- | --- | --- |
| `query` | `frrTimelineQuery` | string | no | `""` |
| `view` | `frrTimelineView` | string | no | none |
| `limit` | `frrTimelineLimit` | positive integer | no | `FRR_TIMELINE_LIMIT`, otherwise `30` |
| `unreadOnly` | `frrTimelineUnreadOnly` | boolean | no | `false` |
| `cursor` | `frrTimelineCursor` | string | no | none |
| `feed` | `frrTimelineFeed` | string | no | none |
| `list` | `frrTimelineList` | string | no | none |
| `category` | `frrTimelineCategory` | string | no | none |

`frrTimelineUnreadOnly` is already used by an internal Alfred node. It is also the fixed standard-input variable for timeline, but it retains its current Alfred semantics for non-standard invocations. Standard fields should behave consistently with `TimelineBlockInput`. Alfred currently performs result filtering for `query`; this requirement does not add in-app filtering for external calls.

### 8.2 `subscriptions`

Suggested class: `SubscriptionsStandardInput`

| JSON field | Environment variable | Type | Required | Default |
| --- | --- | --- | --- | --- |
| `query` | `frrSubscriptionsQuery` | string | no | `""` |
| `view` | `frrSubscriptionsView` | string | no | none |
| `category` | `frrSubscriptionsCategory` | string | no | none |

`view` and `category` map to existing `SubscriptionsBlockInput` capabilities. Alfred currently performs result filtering for `query`; this requirement does not add local filtering for external-call results, and public documentation must explain that distinction.

### 8.3 `unread`

Suggested class: `UnreadStandardInput`

| JSON field | Environment variable | Type | Required | Default |
| --- | --- | --- | --- | --- |
| `query` | `frrUnreadQuery` | string | no | `""` |
| `view` | `frrUnreadView` | string | no | none |

`view` maps to an existing `UnreadBlockInput` capability. Alfred currently performs result filtering for `query`; this requirement does not add local filtering for external calls.

### 8.4 `mark-read`

Suggested class: `MarkReadStandardInput`

| JSON field | Environment variable | Type | Required | Default |
| --- | --- | --- | --- | --- |
| `entryId` | `frrMarkReadEntryId` | non-empty string | yes | none |

Standard input only needs the entry ID required by the action. Alfred continues to pass a complete `TimelineSelection`, and standard environment variables must not override its fields.

### 8.5 `mark-read-above`

Suggested class: `MarkReadAboveStandardInput`

| JSON field | Environment variable | Type | Required | Default |
| --- | --- | --- | --- | --- |
| `entryId` | `frrMarkReadAboveEntryId` | non-empty string | yes | none |
| `resultCacheKey` | `frrMarkReadAboveResultCacheKey` | non-empty string | yes | none |

`resultCacheKey` must identify an existing timeline response cache accessible in the invocation environment. Standard input only transports the parameter; it does not create, transfer, or restore the cache.

Alfred continues to construct execution input from the complete `TimelineSelection` and `frrResultCacheKey`.

### 8.6 `login`

Suggested class: `LoginStandardInput`

| JSON field | Environment variable | Type | Required | Default |
| --- | --- | --- | --- | --- |
| `workflowBundleId` | `frrLoginWorkflowBundleId` | non-empty string | yes | none |

The workflow bundle ID in standard input identifies where `FOLO_TOKEN` is saved. Alfred's internal invocation remains compatible with `alfred_workflow_bundleid`. Standard input does not remove this feature's dependency on macOS, Alfred, or `osascript`.

### 8.7 Entry Point Excluded from the First Version

`cache-subscription-icons` is an internal background worker started by an app, not a public entry point invoked directly by Alfred, so it does not support standard input.

## 9. App Boundary and Execution Model

Every public app entry point should follow the same stages:

```text
argv + process.env
        │
        ▼
Recognize existing contract / standard / legacy input
        │
        ▼
Standard only: read mapped environment fields and merge
        │
        ▼
Construct and validate app input class
        │
        ▼
App orchestration
        │
        ▼
Existing app output
```

Orchestration functions must not read standard-input environment variables themselves. All standard-input parsing belongs at the outer app boundary so business logic can be tested directly with class instances.

Existing upstream contracts may be converted into execution input at the app boundary, but `workflow/info.plist` must not split and reconstruct business fields.

### 9.1 Shared Capability Requirements

Standard-input detection, field-source merging, and primitive conversion must be provided by a shared module. Each app is responsible only for declaring:

- A stable app ID registered in the reference documentation.
- Its standard marker variable name.
- JSON field-to-hardcoded-environment-variable mappings.
- Field types and optional global-configuration fallbacks.
- Final validation in the app-specific input class.
- Conversion from existing non-standard input into app execution input.

The shared module is responsible for:

- Deciding whether an invocation uses standard input.
- Ensuring non-standard input does not read standard business variables.
- Merging argv, camelCase standard variables, explicitly linked global configuration, and defaults in that order.
- Applying precedence by field presence rather than truthiness.
- Providing consistent conversion rules for strings, booleans, integers, and similar primitive values.
- Checking the standard marker, protocol version, unknown fields, and source conflicts.
- Returning an `unknown` record that the app input class can validate.

The shared module must not:

- Generate environment variable names dynamically.
- Reference a specific app.
- Read Folo CLI payloads.
- Construct Alfred output.
- Execute app business logic directly.

The shared module must live in a location consistent with the repository's dependency direction, allowing `app` to depend on it without making `block` depend on `app`. The implementation phase determines the exact filename.

### 9.2 Default Requirements for New Entry Points

Every new executable entry point under `src/app` that Alfred invokes directly must:

1. Register a stable app ID in the reference documentation.
2. Define and export a standard-input class.
3. Explicitly write the camelCase environment variable names for the standard marker and business fields.
4. Use the shared capability to parse and merge standard argv/environment input.
5. Keep Alfred's internal contracts isolated from external standard input.
6. Register the standard-input class/spec source location, important constraints, and invocation forms in the reference documentation.
7. Add argv-only, environment-only, mixed-input, and non-standard-isolation tests.

Only internal workers not invoked directly by Alfred, or internal entry points explicitly excluded by a requirement, may be exempt. The exemption reason must appear in a code comment or design document.

## 10. Backward Compatibility

1. All existing argv inputs remain valid.
2. Alfred nodes continue passing complete serialized contracts.
3. Existing shell adapters retain their internal workflow role and are not removed merely because standard input exists.
4. Non-standard invocations do not read standard business environment variables.
5. Output JSON, Alfred items, stdout/stderr behavior, and exit-code rules remain unchanged.
6. `workflow/info.plist` does not need to adopt standard input.
7. If a standard variable shares a name with an existing variable, all currently valid values retain their meaning.

External standard input is an explicit exception to the `AGENTS.md` rule that primary app input is passed through argv. The exception applies only after the invocation is recognized by a standard marker and does not change internal Alfred workflow rules. The implementation must document this boundary in `AGENTS.md`.

## 11. Error Handling

The following conditions must produce actionable errors:

- An invalid standard marker value.
- An unsupported protocol version.
- A required field still missing after merging.
- An environment variable that cannot be converted to its declared type.
- An argv JSON field with an invalid type.
- An unknown standard-input field.
- Input that simultaneously matches a known non-standard contract and standard input.
- A cache declared by `mark-read-above` that cannot be found.

Error messages must not expose tokens or other sensitive environment values.

## 12. Observability and Security

1. Standard-input mode must not silently fall back to a plain query string, because that can hide caller errors.
2. Do not append debug information to normal stdout, because doing so would corrupt JSON output contracts.
3. Error logs may report field names and sources but must not print the complete environment.
4. argv may be visible in the system process list; documentation must not recommend passing tokens or other secrets through standard input.
5. Environment variables not explicitly included in a mapping must not affect standard input.

## 13. Testing Requirements

Each public app must cover at least:

1. Successful parsing of complete argv standard input.
2. Successful parsing of environment-only standard input.
3. Successful combination of argv and environment variables.
4. argv overriding the environment for the same field.
5. `false`, `0`, empty strings, and `null` not being replaced incorrectly during merging.
6. A non-standard contract completely ignoring standard environment variables.
7. Failure when a required field is missing.
8. Failure for an invalid field type or environment-variable format.
9. Failure for an unknown field or unsupported version.
10. Existing Alfred input and output regression tests continuing to pass.

The shared parsing utility must also cover:

- Recognition of the JSON `kind: "standard"` marker.
- Failure for an invalid environment standard marker.
- Skipping invalid environment values that argv overrides.
- Not reading standard business variables when no standard marker is present.

After implementation, run:

```bash
pnpm run check
git diff --check
```

## 14. Documentation Requirements

The README or a dedicated reference document must include:

- The standard JSON format.
- Every app ID.
- Each app's executable entry point and standard-input class/spec source location.
- argv precedence rules.
- argv-only, environment-only, and mixed invocation forms.
- The fact that Alfred performs query filtering for `timeline`, `subscriptions`, and `unread`.
- The workflow-cache dependency of `mark-read-above`.
- The Alfred and macOS dependencies of `login`.

Concrete business fields, types, requiredness, defaults, and hardcoded environment mappings are authoritative in each app's standard-input class and adjacent spec. The reference documentation must not duplicate those field tables.

## 15. Acceptance Criteria

The requirement is accepted when all of the following are true:

1. All six apps invoked directly by Alfred define and export their own standard-input classes.
2. Every app supports complete argv, complete environment-only input, and a combination of the two.
3. Every environment variable name is explicit in code; no names are generated dynamically.
4. argv standard input is recognized by `kind=standard`, while environment standard input is recognized by the app-specific `frr<AppId>IsStandardInput=1`.
5. argv always wins when the same field exists in both sources, including for falsy values.
6. Standard business environment variables never affect non-standard input.
7. Contracts passed between Alfred nodes and routing in `workflow/info.plist` remain unchanged.
8. App orchestration receives a validated class and does not read standard environment variables itself.
9. All new parsing and merging behavior has automated test coverage.
10. `pnpm run check` and `git diff --check` pass.
11. The shared parser contains no app-specific branches; a new entry point can integrate by declaring a mapping and input class.
12. `AGENTS.md` establishes standard input as the default requirement for new Alfred app entry points and records the allowed exemption scope.

## 16. Implementation Plan

### 16.1 Phase One: Define the Shared Protocol

1. Fix the common standard-input fields, version, and conflict rules according to the confirmed decisions.
2. Confirm the three Alfred variable naming layers.
3. Confirm fixed environment variable names and field tables for the six existing apps.
4. Write focused tests for the shared parser before integrating individual apps.

### 16.2 Phase Two: Implement Shared Parsing

1. Add an app-independent module for standard-input detection and merging.
2. Declare hardcoded environment mappings with an explicit schema or field descriptors; do not generate names dynamically.
3. Implement presence-based merging, type conversion, version checks, unknown-field checks, and error messages.
4. Verify that the shared module does not read standard business variables for non-standard invocations.

### 16.3 Phase Three: Migrate Existing Entry Points

Integrate existing entry points from lower to higher risk:

1. `subscriptions` and `unread`.
2. `timeline`.
3. `mark-read`.
4. `mark-read-above`.
5. `login`.

For each migration, add the input class, environment declarations, direct-execution guard, tests, and external-call documentation together. Keep `cache-subscription-icons` as an internal worker without standard input.

### 16.4 Phase Four: Update `AGENTS.md`

The implementation must update the repository-root `AGENTS.md` in the same change. The planned rules are:

1. Under **App rules**, require every new app invoked directly by Alfred to define and export a standard-input class and use the repository's shared parser.
2. State that external standard input is an exception to the rule requiring primary input through argv, and that the exception applies only after `kind=standard` is confirmed.
3. State that non-standard Alfred contracts never merge standard environment variables and that existing complete contracts continue through argv unchanged.
4. Add variable naming layers:
   - Uppercase snake case for global configuration.
   - Lower camel case for stable values produced by Alfred and passed to scripts, including standard input.
   - Lowercase snake case for private temporary variables.
   - Platform-defined names for Alfred's built-in variables.
5. Require every standard environment variable name to be explicit in app code and prohibit generation from filenames or property names.
6. Fix merge priority as argv, app-specific camelCase standard variables, explicitly linked global configuration, then class defaults.
7. Require presence-based merging that preserves `false`, `0`, empty strings, and `null`, leaving final validity to the input class.
8. Require new entry points to register their class/spec source location and important constraints in the standard-input reference, and add argv-only, environment-only, mixed-input, and non-standard-isolation tests.
9. Allow exemptions for internal workers; require any other exemption to be justified in a requirement or design document.
10. Under **Verification**, require app-input changes to verify the hardcoded variable table, non-standard isolation, and argv precedence over the environment.

The `AGENTS.md` update must ship with the shared capability so rules do not precede their supporting implementation and the implementation does not land without guidance for future entry points.

### 16.5 Phase Five: Documentation and Full Verification

1. Update the README and standard-input reference.
2. Confirm that `workflow/info.plist` does not need to switch to standard input.
3. Run all new tests, `pnpm run check`, and `git diff --check`.
4. Exercise each app's argv-only, environment-only, and mixed-input examples against the built artifacts.

## 17. Future Extensions

The following are outside the first version, but the protocol reserves `version` for future evaluation:

- Reading actual JSON from stdin.
- Batch processing of multiple standard-input objects.
- Output-protocol version negotiation.
- Automatic CLI help or JSON Schema generation.
- Packaging standard app input as an independent npm API.
