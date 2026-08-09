# Repository standard

Status: normative for Provet v1. The keywords **MUST**, **MUST NOT**, **SHOULD**,
**SHOULD NOT**, and **MAY** express requirement levels. A section labelled
**Post-v1** is reserved design space, not a v1 implementation requirement.

This standard governs the TypeScript/Bun implementation of the local-first
`vet` CLI described by the
[Provet v1 product plan](https://hatim-s.github.io/planloft-plans/p/pPwFxUlWUK/).
It is complemented by the [CLI UX standard](./cli-ux.md) and the
[agent UX standard](./agent-ux.md).

## V1 architecture

The architecture **MUST** preserve the product's `define -> run -> grade ->
compare` loop while keeping policy separate from effects. The core model is a
plain-data domain with ports around filesystem, process, clock, Git, network,
and terminal effects.

The implementation **MUST** use deep, purpose-specific modules with these
logical boundaries (exact folder names may evolve through an ADR):

- `cli/`: command parsing, command composition, reporters, and exit mapping.
- `config/`: `provet.yaml` loading, environment interpolation, defaults,
  schema-version dispatch, and validation.
- `evals/`: YAML/Markdown discovery, normalization, selection, and authoring.
- `adapters/`: shared transport and event primitives plus `claude-code`,
  `codex`, `http`, and `command` implementations. Targets and judges **MUST**
  use the same adapter families and configuration discriminators, while
  capability-limited target and judge request ports prevent privilege leakage.
- `execution/`: run planning, repeat expansion, bounded scheduling,
  cancellation, timeouts, and aggregation.
- `graders/`: deterministic, trajectory, code, and judge grading.
- `workspaces/`: fixture copying, temporary working directories, snapshots,
  and diffs.
- `runs/`: run IDs, immutable event persistence, summary materialization,
  selectors, and the `latest` pointer.
- `reporting/`: the shared report view-model, terminal rendering, static HTML
  templating, and run comparison.
- `contracts/`: versioned schemas and stable public DTOs only.

Command modules **MUST NOT** contain domain decisions. Adapter modules **MUST
NOT** grade, persist runs, or format UI. Reporters **MUST NOT** reconstruct
domain facts from prose. Storage modules **MUST NOT** import CLI modules.

## Dependency direction and contract ownership

Dependencies **MUST** point inward:

```text
CLI / reporters / adapters / storage / workspace effects
                         |
                         v
              application orchestration
                         |
                         v
                 domain contracts
```

The domain and application layers **MUST NOT** import Bun process globals,
concrete adapters, filesystem implementations, terminal renderers, or HTML
templates. Effectful implementations **MUST** satisfy narrow ports injected by
the command composition root.

Every public data shape **MUST** have one owner:

| Contract | Owner | Consumers |
| --- | --- | --- |
| Config and eval schemas | `config/` and `evals/` | validator, authoring, schema command |
| Normalized trajectory and adapter result | `adapters/` contract module | execution, trajectory graders, judges |
| Grader input and verdict | `graders/` contract module | graders, execution, run persistence |
| Run/event storage schemas | `runs/` contract module | persistence, report, diff, future import |
| Report view-model | `reporting/` contract module | terminal, JSON, HTML templates |
| CLI success/error envelopes | `cli/` contract module | every command and machine consumer |

Consumers **MUST** import an owner's contract rather than redeclare or widen it.
Schema generation, runtime validation, TypeScript types, examples, and fixtures
**MUST** derive from or be checked against the same owner.

Sharing the adapter layer **MUST NOT** imply sharing privileges. A target request
may carry a trial workspace and tool capabilities; a judge request receives
redacted immutable evidence and a constrained verdict schema. Both use common
transport, event, usage, cancellation, and adapter-configuration primitives,
but neither consumer may widen the other's capability-limited port.

## Files, names, exports, and comments

- Each file **MUST** have one purpose and live beside the closest sibling by
  responsibility. New flat catch-all modules are prohibited.
- Source file names **MUST** be kebab-case and describe their main export.
  Names such as `utils.ts`, `helpers.ts`, `common.ts`, numbered names, and
  unexplained abbreviations are prohibited.
- Variables **MUST** be descriptive nouns, functions **MUST** start with a verb,
  and booleans **MUST** read as yes/no questions.
- Repository modules **MUST** use named exports collected in one export
  statement. `index.ts` and `index.js` **MUST** contain exports only.
- Major functions, classes, and methods **MUST** have doc comments. Non-obvious
  invariants, security boundaries, and algorithms **MUST** have concise inline
  comments; comments that merely restate syntax **SHOULD NOT** be added.
- Tests **MUST** live under dedicated `tests/` or `e2e/` trees, not beside source.
- Dead code, commented-out blocks, and copy-modify duplicates are prohibited.

The v1 product contract describes user code graders as default-exporting
`grade(ctx)`. The code-grader loader **MUST** contain that compatibility at the
external plugin boundary. Repository-owned implementation modules remain named
exports; the default export **MUST NOT** leak into internal contracts.

## Public and internal APIs

The v1 public surface consists only of documented CLI commands and flags,
published JSON/JSONL schemas, config/eval file schemas, the normalized
`vet-events` protocol, the code-grader boundary, stored run formats, and the
HTML template view-model. Anything else **MUST** be treated as internal.

Public symbols **MUST** be exported through a deliberate package boundary and
documented with stability and version information. Internal modules **MUST NOT**
be exported for convenience. A new public symbol or field requires contract
tests and compatibility review. Internal refactors **MAY** be breaking only when
they leave every public contract unchanged.

## Testing taxonomy and evidence gates

Tests **MUST** be layered:

1. **Unit tests** cover pure parsing, normalization, selection, aggregation,
   grading, redaction, comparison, and exit mapping.
2. **Contract tests** exercise every adapter, grader, schema, JSON envelope,
   JSONL event, run file, and template view-model against the owned contract.
3. **Integration tests** use real temporary filesystems and controlled fake
   subprocess/HTTP boundaries to cover orchestration and failure paths.
4. **End-to-end tests** invoke the built `vet` binary and assert bytes on
   stdout/stderr, exit status, file effects, signals, and TTY/non-TTY behavior.
5. **Compatibility tests** read every supported persisted/config schema version
   and prove either migration or a stable actionable rejection.
6. **Live adapter smoke tests** **MAY** exercise installed providers, but **MUST**
   be opt-in, secret-safe, and reported separately from deterministic tests.

A change is mergeable only when type checking, formatting/linting, owned unit
and contract tests, relevant integration/end-to-end tests, and documentation
checks pass. Adapter changes **MUST** include captured provider-contract evidence
or clearly identify that live evidence was unavailable. A deterministic green
suite **MUST NOT** be presented as proof of live-provider compatibility.

## Fixtures and goldens

Fixtures **MUST** be minimal, synthetic, deterministic, free of credentials and
personal data, and owned by the test family that uses them. Fixture paths
**MUST NOT** escape their fixture root through symlinks or traversal.

Golden files are appropriate for stable serialized contracts, terminal output,
JSONL streams, HTML view-models, and reports. They **MUST** exclude unstable
timestamps, temporary paths, random IDs, durations, and unordered maps through
explicit normalization. Goldens **MUST NOT** hide semantic fields merely to make
tests pass. Updates **MUST** be reviewed as product-contract changes, never
accepted wholesale without inspecting the diff.

Real provider transcripts **MUST** be sanitized before becoming fixtures.
Binary or large fixtures **SHOULD** be generated from a documented small source
or justified in the fixture README.

## Security and privacy

- Secrets **MUST** come from environment interpolation at execution time and
  **MUST NOT** be written to config, run artifacts, events, HTML, snapshots,
  diagnostics, fixtures, or logs.
- Redaction **MUST** happen before persistence and before any reporter receives
  data. Redaction failure **MUST** fail closed for affected output.
- YAML and JSON parsing **MUST** reject unsafe object construction and excessive
  depth/size. Paths **MUST** be normalized, constrained to allowed roots, and
  checked after symlink resolution.
- HTML reports **MUST** escape untrusted case, output, trajectory, and grader
  content and **MUST NOT** load remote resources by default.
- HTTP adapters **MUST** make the destination explicit and **MUST NOT** forward
  unrelated environment values. Command arguments **MUST** be passed without a
  shell unless the command adapter contract explicitly selects a shell.
- Custom graders execute trusted repository code in v1. The CLI **MUST** say so
  in documentation and diagnostics; it **MUST NOT** imply sandboxing.
- Telemetry, upload, cloud execution, and remote storage are outside v1. The CLI
  **MUST NOT** transmit run data except to explicitly configured adapters.

## Subprocess and workspace isolation

Each trial **MUST** receive a unique temporary working directory copied from its
declared fixture. Parallel trials **MUST NOT** share a mutable workspace. The
source fixture and repository **MUST NOT** be mutated by target execution.

Subprocesses **MUST** use explicit executable/argument arrays, a minimal
documented environment, bounded stdout/stderr capture, a timeout, and a process
group that can be terminated as a unit. On cancellation or timeout, `vet`
**MUST** request graceful termination, wait a bounded grace period, then kill
the process tree. It **MUST** reap children and finish or mark interrupted event
records before returning.

Temporary directories **MUST** be permission-restricted and cleaned on normal
completion. Failed/interrupted workspace retention **MAY** be offered through an
explicit documented option; retained paths **MUST** be reported and redacted.
Workspace diffs **MUST** account for additions, deletions, modifications,
permissions, and symlinks without following links outside the workspace.

## Logging, provenance, and reproducibility

Every run **MUST** persist its run ID, schema version, `vet` version, start/end
time, resolved configuration without secrets, selected cases, repeat and
concurrency settings, pass policy, adapter identities, Git commit and dirty
flag, per-trial events, token/cost/latency measures, grader outcomes, and
interruption state when applicable. Unknown cost or tokens **MUST** be `null`,
not zero.

Machine events **MUST** use deterministic ordering keys and explicit timestamps.
Human diagnostic verbosity **MAY** vary; persisted semantic results **MUST NOT**
depend on TTY, color, locale, or concurrency completion order. Provenance **MUST**
distinguish target cost/latency from judge cost/latency.

## Error taxonomy

Typed errors **MUST** preserve cause and stage. At minimum, the domain taxonomy
is `usage`, `configuration`, `validation`, `selection`, `adapter`, `target`,
`timeout`, `cancelled`, `grader`, `workspace`, `storage`, `report`, `security`,
and `internal`. Expected user errors **MUST NOT** be collapsed into `internal`.

Case assertion failure, grader execution/parse failure, target failure, and run
infrastructure failure are distinct states. In particular, `grader-error`
**MUST NOT** be counted as `fail`. The CLI maps domain errors to the stable
codes defined in the [CLI UX standard](./cli-ux.md); internal modules **MUST NOT**
call `process.exit`.

## Compatibility and schema versioning

Every persisted and machine-readable top-level object **MUST** include an
integer schema version. `provet.yaml` v1 uses `version: 1`; JSON/JSONL contracts
use an explicit `schemaVersion` field. Readers **MUST** reject unsupported future
major versions with an actionable error and **SHOULD** ignore documented unknown
additive fields within a supported version.

Within v1, additive optional fields and new error codes **MAY** be introduced;
removing/renaming fields, changing meaning or units, changing default behavior,
or reusing an error/exit code is breaking and prohibited. Persisted v1 runs
**MUST** remain importable for the planned v1.1 SQLite migration. Run artifacts
**MUST** be immutable after completion except for an atomic `latest` pointer.

The following are **Post-v1 reserved** and **MUST NOT** shape v1 behavior beyond
stable import/view-model seams: SQLite, dashboard/TUI, eval-level shared graders,
multi-turn evals, majority-vote judging, CI integration, cloud execution, web
UI, dataset tooling, and prompt registries.

## Documentation synchronization

- Any package script added, removed, renamed, or changed **MUST** update
  `docs/SCRIPTS.md` in the same change.
- Any environment variable, secret, or Cloudflare binding added, removed, or
  renamed **MUST** update `docs/ENV.md` in the same change.
- Any CLI flag, exit/error code, schema, stored format, template field, or public
  API change **MUST** update its reference documentation and examples together.
- Generated `--help`, schema output, and checked-in examples **MUST** be tested
  against the same command/contract definitions to prevent drift.

## Incremental delivery and commits

Changes **MUST** be small enough to review and **MUST** leave the repository
type-correct with owned tests passing. Commits **MUST** use Conventional Commits
and represent one coherent increment. Unrelated edits **MUST NOT** be bundled.
Database or migration work requires explicit human approval and is not part of
v1.

## Review checklist

Every review **MUST** answer:

- Does the change preserve v1 scope and the public CLI/data contracts?
- Is each file purpose-specific, correctly placed, clearly named, documented,
  and exported through a minimal boundary?
- Does dependency direction remain inward with one owner per contract?
- Are user failure, assertion failure, grader error, provider error, timeout,
  cancellation, and internal error still distinguishable?
- Are secrets redacted before reporters/storage, paths constrained, HTML
  escaped, and subprocesses/workspaces bounded and isolated?
- Are concurrency, nondeterminism, cancellation, dirty Git state, and partial
  writes covered?
- Are tests at the right layer, goldens normalized and inspected, and live
  evidence separated from deterministic evidence?
- Are compatibility, docs, scripts, environment references, and schema versions
  synchronized?
- Is a new abstraction necessary, narrow, and reusable rather than copied?
- Does the diff contain only the intended increment and satisfy the relevant
  ADR rules?

## ADR triggers

An ADR **MUST** precede a change that does any of the following:

- changes a public command, schema, event, run format, grader API, adapter port,
  template view-model, default, exit code, or compatibility policy;
- crosses or reverses a module dependency boundary;
- adds a runtime dependency that owns serialization, execution, templating,
  validation, persistence, networking, or security behavior;
- changes secret handling, path trust, process isolation, workspace retention,
  or redaction;
- introduces nondeterministic ordering, caching, migrations, background state,
  a database, network service, telemetry, or remote execution;
- adopts a post-v1 capability early or changes the versioning strategy.

Routine bug fixes, tests, documentation corrections, and internal refactors that
do not change these decisions **SHOULD NOT** require an ADR. If reviewers cannot
agree whether a public invariant changed, the change **MUST** use an ADR.
