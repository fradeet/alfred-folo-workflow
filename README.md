# Alfred Folo

![][show1]

An Alfred workflow backed by the official [Folo CLI][].

## Requirements

- Alfred and the Powerpack
- Node.js 24 or later
- A Folo account

## Usage

For usage instructions, see [workflow/README.md][].

## Development setup

Install the TypeScript development tools and all runtime dependencies, including
the pinned Folo CLI:

```bash
npm ci
npm run install:workflow
```

And install the `workflow` folder as an Alfred workflow using whichever method you prefer.

[Folo CLI]: https://api.folo.is/skill.md
[workflow/README.md]: /workflow/README.md
[show1]: /workflow/assets/imgs/show1.png
