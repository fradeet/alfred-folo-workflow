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
- Export the input class, output class, and orchestration function when practical
  so they can be tested without executing the entry point.
- If an app module is imported by another module, guard its CLI entry point with
  an `import.meta.url`/`pathToFileURL` direct-execution check.
- App orchestration may convert an app input into a block input once and convert
  block outputs into the app output once. Do not repeatedly extract fields and
  rebuild ad-hoc intermediate objects.
- Catch entry-point failures at the outer boundary. Script Filters should emit
  an Alfred error item; action scripts should report the error on stderr and set
  a non-zero exit code.

## Cross-app JSON contracts

- Values passed between Alfred nodes are serialized class contracts, not raw
  Folo CLI objects and not anonymous object literals.
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

- Script Filter item `arg` values must contain the complete serialized selection
  expected by downstream apps.
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
