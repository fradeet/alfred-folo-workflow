# Alfred Folo

An Alfred workflow backed by the official [Folo CLI](https://api.folo.is/skill.md).

## Features

- `folo [query or Folo URL]` — browse the latest timeline entries, optionally filtered by a Feed/List URL.
- `flists [query]` — list and locally filter Feed/List subscriptions; Inbox subscriptions are hidden.
- `funread [query]` — list and locally filter subscriptions that contain unread entries.
- `flogin` — open the browser, save the token through Alfred, and notify on successful login.
- Subscription results use their Folo URL; hold Option to open a Feed's original site URL.
- Timeline results expose their entry ID to downstream actions as `FOLO_ENTRY_ID`.

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

The single-entry read action accepts an entry ID and echoes the same ID after a
successful update:

```bash
node workflow/dist/mark-read.js "$FOLO_ENTRY_ID"
```

Then open `Folo.alfredworkflow` to install it in Alfred.

## CLI behavior

The workflow calls the locally installed `folocli` package directly and consumes
its documented JSON envelope. It does not require a global `folo` executable.
The dependency is included in the packaged workflow; Node.js itself remains a
system requirement and is resolved by `#!/usr/bin/env node`.
