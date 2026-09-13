# Alfred Folo

An Alfred workflow backed by the official [Folo CLI](https://api.folo.is/skill.md).

## Features

- `folo [query]` — browse and locally filter the latest timeline entries.
- `flogin` — open the browser, save the token through Alfred, and notify on successful login.
- Opening a timeline result opens its URL.

The keywords, result limit, Folo view, and token can be changed in Alfred's
workflow configuration.

## Requirements

- macOS with Alfred 5 and the Powerpack
- Node.js 18 or later
- A Folo account

## Development setup

Install all runtime dependencies, including the pinned Folo CLI:

```bash
npm run install:workflow
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
npm run check
npm run package
```

Then open `Folo.alfredworkflow` to install it in Alfred.

## CLI behavior

The workflow calls the locally installed `folocli` package directly and consumes
its documented JSON envelope. It does not require a global `folo` executable.
The dependency is included in the packaged workflow; Node.js itself remains a
system requirement and is resolved by `#!/usr/bin/env node`.
