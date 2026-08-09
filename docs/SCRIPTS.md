# Package scripts

Run repository commands through pnpm so the version recorded in `package.json`
and the committed lockfile remain authoritative.

## Build

| Script | Command | Purpose |
| --- | --- | --- |
| `build` | `pnpm build` | Bundle the Bun-targeted `vet` executable to `dist/vet.js`. |
| `prepack` | Automatic during `pnpm pack` | Build `dist/vet.js` before package contents are collected so the declared `vet` binary is always present. |

## Static verification

| Script | Command | Purpose |
| --- | --- | --- |
| `format` | `pnpm format` | Rewrite supported repository files to the Biome format. |
| `format:check` | `pnpm format:check` | Verify formatting without changing files. |
| `lint` | `pnpm lint` | Run the Biome recommended lint rules without rewriting files. |
| `typecheck` | `pnpm typecheck` | Type-check all source and test TypeScript with the strict repository configuration without emitting files. |

## Test lanes

| Script | Command | Purpose |
| --- | --- | --- |
| `test` | `pnpm test` | Run unit, contract, integration, and e2e lanes in that order. |
| `test:contracts` | `pnpm test:contracts` | Verify the owned compile-time and runtime boundaries under `tests/contracts/`. |
| `test:e2e` | `pnpm test:e2e` | Build and execute the `vet` entry point in config-free temporary directories using tests under `tests/e2e/`. |
| `test:integration` | `pnpm test:integration` | Exercise composed host adapters under `tests/integration/`. |
| `test:unit` | `pnpm test:unit` | Run isolated unit tests under `tests/unit/`. |
