# Alfred Folo

An Alfred workflow backed by the official [Folo CLI](https://api.folo.is/skill.md).

## Features

- `folo [query]` — browse the latest timeline entries, optionally filtered by a local query.
  Its `TimelineBlockInput` maps onto the Folo CLI options (`view`, `limit`, `unreadOnly`,
  `cursor`, `feed`, `list`, and `category`).
- `flists [query]` — list and locally filter Feed/List subscriptions; Inbox subscriptions are hidden.
- `funread [query]` — list and locally filter subscriptions that contain unread entries.
- `flogin` — open the browser, save the token through Alfred, and notify on successful login.
- Subscription and unread results put a complete `FoloResourceSelection` JSON value in the
  `frr_timeline_filter` workflow variable for the timeline app; hold Option to open a Feed's
  original site URL or the Folo share URL.
- Timeline results pass a complete `TimelineSelection` JSON value downstream. Both the URL
  action and mark-read action parse the same value without intermediate field extraction.
- Feed and list icons use Folo's `image` field. Feeds without one fall back to
  `icons.folo.is/<site-domain>` and are cached by feed/list ID in Alfred's
  workflow cache. Folo fallback icons follow the service's 30-day cache policy;
  official images refresh after 7 days. A cache miss in `funread` starts a
  non-blocking background subscription sync so the current results appear immediately.

The keywords, result limit, and token can be changed in Alfred's
workflow configuration.

## Requirements

- macOS with Alfred 5 and the Powerpack
- Node.js 18 or later
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

The timeline app accepts Folo share URLs and serialized resource selections directly:

```bash
node workflow/dist/app/timeline.js "https://app.folo.is/share/feeds/<id>"
```

Then open `Folo.alfredworkflow` to install it in Alfred.

## CLI behavior

The workflow calls the locally installed `folocli` package directly and consumes
its documented JSON envelope. It does not require a global `folo` executable.
The dependency is included in the packaged workflow; Node.js itself remains a
system requirement and is resolved by `#!/usr/bin/env node`.
