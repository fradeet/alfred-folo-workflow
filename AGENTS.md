# AGENTS.md

## Project overview

This repository builds an Alfred workflow for browsing and managing Folo feeds.
It is a strict TypeScript ESM project targeting Node.js 18 or later. Source files
use `.js` extensions in relative imports so the emitted ESM runs directly in
`workflow/dist`.

Read `workflow/node_modules/folocli/skill.md` before changing or using Folo CLI
integration. Treat the documented JSON envelope as the external CLI contract.

## Project structure

- `src/app/`: executable Alfred entry points and workflow-level orchestration.
- `src/block/`: small, reusable single-purpose operations with explicit input
  and output classes.
- `src/block/folo/`: Folo CLI operations. `client.ts` is the low-level process
  adapter; the other files each represent one CLI capability.
- `src/contracts/`: JSON contracts passed unchanged between Alfred workflow
  nodes and app entry points.
- `src/types/`: typed representations of external Folo and Alfred data.
- `src/shared/`: stateless helpers and technical utilities shared by apps.
- `test/`: Node test-runner tests. Keep block and contract tests in their
  corresponding test files; end-to-end rendering behavior belongs in
  `alfred.test.ts`.
- `workflow/info.plist`: Alfred object graph and connections.
- `workflow/script/`: small shell adapters required by Alfred.
- `workflow/dist/`: generated JavaScript. Never edit it directly.
- `scripts/build.mjs`: compiles `src/` into `workflow/dist/` and sets executable
  permissions on Alfred entry points.

## Dependency direction

Keep imports flowing in this direction:

```text
app -> block -> Folo CLI
app -> contracts/types/shared
block -> types/shared
contracts -> types/shared
```

- `block` must never import from `app`.
- External Folo payloads must be decoded into classes at the block boundary.
- Alfred-specific output structures must not leak into Folo blocks.
- App-to-app imports are allowed only when consuming the destination app's
  public input contract. Do not import another app's orchestration internals.

## Block rules

- One exported block operation performs one capability, such as fetching the
  timeline, listing subscriptions, or marking one entry as read.
- Every operation accepts one input class and returns one output class. Do not
  expose positional primitive arguments from block functions.
- The input class owns validation, normalization, and CLI argument construction.
- Reuse the result classes in `src/types/folo-types.ts` as block outputs when
  they already describe the CLI response.
- Keep raw `spawnSync`, JSON-envelope handling, timeouts, and CLI path resolution
  inside `src/block/folo/client.ts`.
- Blocks must not read Alfred arguments, write stdout, or construct Alfred items.

## App rules

- An app file is an Alfred boundary: parse argv/environment into an input class,
  compose block operations, and emit an output class.
- Pass an app's primary input, especially a serialized class contract, through
  command-line arguments. Apps may read auxiliary configuration or
  workflow-global state directly from environment variables.
- Use a shell adapter when Alfred supplies an app's primary input through an
  environment variable. The adapter must forward the complete value unchanged
  as one command-line argument to the app entry point.
- Keep shell adapters thin. JSON parsing, validation, field extraction, and
  business logic belong in TypeScript app entry points, not shell scripts.
- Export the input class, output class, and orchestration function when practical
  so they can be tested without executing the entry point.
- If an app module is imported by another module, guard its CLI entry point with
  an `import.meta.url`/`pathToFileURL` direct-execution check.
- App orchestration converts an app input into block inputs in one place and
  converts block outputs into the app output in one place. Calling a block
  operation in a loop over a list computed once is fine; repeatedly extracting
  fields and rebuilding ad-hoc intermediate objects is not.
- Catch entry-point failures at the outer boundary. Script Filters should emit
  an Alfred error item; action scripts should report the error on stderr and set
  a non-zero exit code.

## Cross-app JSON contracts

- Values passed between Alfred nodes are serialized class contracts, not raw
  Folo CLI objects and not anonymous object literals.
- The upstream item payload and downstream orchestration input must use the same
  neutral contract type from `src/contracts/`. Do not add an app-specific input
  wrapper when it carries no additional validation or semantics.
- Give each cross-app contract a stable `kind` discriminator.
- Implement explicit `toJSON()` and `serialize()` output plus `from()` or
  `parse()` validation at the receiving boundary.
- JSON parsing destroys prototypes. Recreate nested classes such as `FoloEntry`
  and `FoloFeed` instead of casting parsed objects with `as`.
- Preserve the complete contract between nodes. Downstream apps may read the
  fields they need internally, but `workflow/info.plist` should not extract and
  recombine business fields such as `entryId`, `url`, or feed identifiers.
- Plain strings are appropriate only for terminal adapters whose consumer
  requires them, such as Alfred's Open URL action.
- When one downstream app accepts several upstream contracts, use a discriminated
  union and a boundary parser instead of wrapper classes around each selection.

## Types and validation

- Keep TypeScript `strict` mode passing.
- Use `unknown` for untrusted JSON and validate it before use.
- Prefer the existing constructors, `from()` methods, and small guard helpers
  over type assertions.
- Preserve meaningful `false`, `0`, empty strings, and `null` values when the
  external contract distinguishes them. Omit only fields defined as optional.
- Do not add a runtime validation or serialization dependency unless the manual
  class-based approach has become demonstrably insufficient.

## Alfred workflow rules

- Pass cross-node selections as complete serialized contracts, whether carried
  by a Script Filter item `arg` or an Alfred workflow variable. Do not split a
  contract across several arguments or variables.
- When an Alfred workflow variable carries an app's primary input, use a shell
  adapter to convert that environment value into the app's command-line
  argument. Reserve direct environment reads in TypeScript for auxiliary
  configuration and workflow-global state.
- Keep workflow nodes focused on routing. Business parsing and field selection
  belong in TypeScript app entry points.
- When changing app inputs, outputs, filenames, or connections, update
  `workflow/info.plist`, README examples, and relevant tests together.
- After editing the plist, check that every connection source and destination UID
  still refers to an existing object.

## Dependencies and generated files

- Prefer Node.js built-ins and the existing class-based utilities.
- Runtime packages used by the packaged workflow belong in
  `workflow/package.json`; development-only packages belong in the root
  `package.json`.
- Do not edit lockfiles unless a dependency actually changes.
- Do not commit changes to generated `workflow/dist/`; regenerate it with the
  build command for local verification.

## Verification

Run the smallest relevant test while iterating, then run the complete check
before handing off a change:

```bash
pnpm run check
```

This performs the TypeScript check, all Node tests, a clean build, and
`plutil -lint workflow/info.plist`. Also run `git diff --check` after editing.
