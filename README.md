# Alfred Folo

An Alfred workflow backed by the official [Folo CLI](https://api.folo.is/skill.md).

## Features

- `folo [query]` — browse the latest timeline entries, optionally filtered by a local query.
  Its `TimelineBlockInput` maps onto the Folo CLI options (`view`, `limit`, `unreadOnly`,
  `cursor`, `feed`, `list`, and `category`). Entries keep the timeline's own order; the
  response sets `skipknowledge` so Alfred does not reorder the learned ranking.
- `flists [query]` — list and locally filter Feed/List subscriptions; Inbox subscriptions are hidden.
- `funread [query]` — list and locally filter subscriptions that contain unread entries.
- `fv` — pick a Folo view (articles, social, pictures, audio, notifications) and open the
  timeline in it. The selected view reaches the timeline app as a `TimelineViewInput` JSON
  value such as `{"kind": "view-input", "view": "articles"}` in the item's `arg`;
  hold Option to include already-read entries.
- `folologin` — open the browser, save the token through Alfred, and notify on successful login.
- Subscription and unread results put a complete `SubscriptionSelection` or `UnreadSelection`
  JSON value in each item's `arg` for the timeline app.
- Timeline results pass a complete `TimelineSelection` JSON value downstream. Both the URL
  action and mark-read action parse the same value without intermediate field extraction.
  Hold Option and press Enter to load the next page; Option shows “No next page”
  when there is no next cursor. Hold Shift and Option, then press Enter to return
  to the latest entries; it shows “Already at the top” when the current page
  has no cursor.
- Shift and Enter on a timeline item refreshes the current page's cache from Folo.
  The Script Filter exports the current query through the `frrTimeline…` standard
  input variables; the downstream script reads them without using the item `arg`.
- Every Folo CLI request made by a Script Filter stores its response as a JSON file in
  Alfred's workflow cache (`folo-requests/`). The filename is a stable hash of the CLI
  arguments, and each Script Filter response reports it in the `frrResultCacheKey`
  workflow variable for consumers of cached CLI responses.
- Timeline output includes all eight standard input field variables. These preserve
  the current keyword, view, limit, unread setting, cursor, feed, list, and category
  for downstream actions. The refresh script enables standard input mode.
- Timeline reads reuse a timestamped cache for 5 minutes. The cache key includes the
  full normalized request, so a different keyword, unread setting, view, source, or
  page has its own entry. Expired or invalid entries are fetched again from Folo.
- After a successful timeline query, the workflow remembers its complete input. To
  run that same query again, pass the helper script's output directly to timeline:

  ```bash
  node workflow/dist/app/timeline.js "$(node workflow/dist/app/last-timeline-query.js)"
  ```

  The helper returns an error when there is no previous query. The saved input remains
  available after the 5-minute result cache expires.

To refresh from a downstream Run Script, use the exported standard input
variables with the provided adapter:

```bash
frrTimelineQuery="TypeScript" workflow/script/refresh-timeline.sh
```
- Feed and list icons use Folo's `image` field. Feeds without one fall back to
  `icons.folo.is/<site-domain>` and are cached by feed/list ID in Alfred's
  workflow cache. Folo fallback icons follow the service's 30-day cache policy;
  official images refresh after 7 days. A cache miss in `funread` starts a
  non-blocking background subscription sync so the current results appear immediately.

The keywords, result limit, and token can be changed in Alfred's
workflow configuration.

## Requirements

- macOS with Alfred 5 and the Powerpack
- Node.js 24 or later. Icon downloads use the built-in `fetch`, which honors
  `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` through Node 24's `NODE_USE_ENV_PROXY`
  support in proxied environments.
- A Folo account

## Development setup

Install the TypeScript development tools and all runtime dependencies, including
the pinned Folo CLI:

```bash
pnpm install
pnpm run install:workflow
```

Authenticate once using the official browser login:

```bash
npm --prefix workflow exec folo -- login
```

Alternatively, set `FOLO_TOKEN` in the workflow configuration after importing it.
The CLI also recognizes the `FOLO_TOKEN` environment variable and its normal
`~/.folo/config.json` login store.

Verify the project and build an importable workflow:

```bash
pnpm run check
pnpm run package
```

`pnpm run build` compiles the TypeScript sources in `src/` to executable ESM
files in `workflow/dist/`. The generated directory is not committed and is
rebuilt automatically before packaging.

The single-entry read action accepts a serialized timeline selection and emits a
serialized mark-read result after a successful update:

```bash
node workflow/dist/app/mark-read.js "$TIMELINE_SELECTION_JSON"
```

The timeline app accepts Folo share URLs, serialized resource selections, and Alfred
node configuration JSON directly:

```bash
node workflow/dist/app/timeline.js "https://app.folo.is/share/feeds/<id>"
node workflow/dist/app/timeline.js '{"view": "articles"}'
```

## Standard input

The public app entry points Alfred calls directly (`timeline`, `subscriptions`,
`unread`, `mark-read`, `login`) also accepts a uniform
external calling convention: one JSON object as argv marked with
`kind: "standard"`, the app's `frr<AppId>…` environment variables, or both —
argv always wins:

```bash
node workflow/dist/app/mark-read.js \
  '{"kind":"standard","version":1,"entryId":"entry-1"}'

frrMarkReadIsStandardInput=1 frrMarkReadEntryId=entry-1 \
  node workflow/dist/app/mark-read.js
```

Workflow-internal calls are unchanged: node contracts keep flowing through
argv and never read the standard variables. Protocol rules, implementation
links, and per-app caveats live in
[docs/reference/standard-input.md](docs/reference/standard-input.md).

Then open `Folo.alfredworkflow` to install it in Alfred.

## CLI behavior

The workflow calls the locally installed `folocli` package directly and consumes
its documented JSON envelope. It does not require a global `folo` executable.
The dependency is included in the packaged workflow; Node.js itself remains a
system requirement and is resolved by `#!/usr/bin/env node`.
