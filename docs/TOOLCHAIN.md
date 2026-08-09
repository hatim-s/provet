# Toolchain support

FND-01 ratifies the following repository baseline. Changes to these decisions
require an explicit follow-up decision rather than an incidental dependency or
source import.

## Package manager and lockfile

- pnpm `10.8.x` is the repository package manager.
- `package.json` records the package-manager version and `pnpm-lock.yaml` is the
  only dependency lockfile.
- Dependency versions are exact in `package.json`; clean installs use
  `pnpm install --frozen-lockfile`.

## Runtime compatibility

- Bun `1.3.0` or newer is the supported runtime for the `vet` CLI, tests, and
  build.
- Node.js `22.0.0` or newer is the compatibility floor for shared standard
  library APIs and development tooling. The executable entry point still uses
  Bun, and Node execution is not a supported CLI path in v1.
- Type checking pins the Node.js 22 declaration family so source cannot
  accidentally adopt a newer standard-library API than the documented floor.
- Source code avoids Bun-only runtime APIs outside the executable/build/test
  boundary so later packaging work can evaluate distribution without hidden
  portability constraints.

## Modules and TypeScript

- The package uses native ECMAScript modules through `"type": "module"`.
- TypeScript targets ES2022 with bundler-style ESM resolution and emits no files
  during type checking.
- Strict mode is enabled together with exact optional properties, unchecked
  indexed-access checks, unknown catch variables, forced casing consistency,
  and switch fallthrough protection.
- Repository modules use named exports collected in one export statement.
  Every `index.ts` is export-only and exposes only an intentional boundary.

## Supported host assumptions

- Supported v1 hosts are 64-bit macOS and Linux on architectures supported by
  the chosen Bun release.
- The implementation may rely on POSIX path, permission, process, and signal
  semantics. Git must be available when a later command requests repository
  provenance.
- Bun 1.3 replaces a standard descriptor inherited closed with a read-write
  `/dev/null` descriptor. The terminal adapter distinguishes normal write-only
  `/dev/null` redirection from that replacement; an explicitly read-write
  `/dev/null` redirection is indistinguishable and is treated as unavailable.
- Native Windows is not supported in v1 until process, signal, filesystem, and
  terminal behavior receive explicit compatibility evidence.
