# Agent UX standard

Status: normative for Provet v1. **MUST**, **MUST NOT**, **SHOULD**, **SHOULD
NOT**, and **MAY** express requirement levels. Capabilities labelled
**Post-v1** are reserved and are not v1 commitments.

Coding agents are first-class `vet` users. This standard builds on the
[CLI UX standard](./cli-ux.md) and the implementation and security boundaries
in the [repository standard](./repository.md).

## Noninteractive contract

Every v1 operation **MUST** be completable without prompts, cursor interaction,
a pager, a browser, or a TTY. The same arguments and files **MUST** produce the
same semantic operation in human and machine environments. Missing required
choices **MUST** fail with structured diagnostics; `vet` **MUST NOT** guess,
prompt, or wait for keystrokes.

An agent **MUST** be able to:

1. query tool/protocol capabilities;
2. obtain the exact schema it needs;
3. author or propose a change;
4. validate without invoking a target or judge;
5. fix deterministic diagnostics;
6. run selected cases while watching structured events;
7. inspect or compare stored results.

Network use **MUST** occur only when a configured target or judge requires it.
Discovery, schema output, authoring dry-runs, and validation **MUST** work
offline.

## Capability and version negotiation

Before automation, an agent **SHOULD** run `vet --version --json`. Its `data`
object **MUST** include this stable v1 shape:

```json
{
  "name": "vet",
  "version": "1.0.0",
  "protocolVersion": 1,
  "schemaVersions": {
    "config": [1],
    "eval-case": [1],
    "grader": [1],
    "run": [1],
    "cli-envelope": [1],
    "vet-events": [1]
  },
  "capabilities": {
    "json": true,
    "jsonlReporter": true,
    "dryRunWrites": true,
    "resumableRuns": false,
    "interactivePrompts": false
  }
}
```

Capability keys **MUST** be lower camel case, boolean, additive within protocol
v1, and documented. An agent **MUST** test required values rather than infer
support from the version string. `protocolVersion` covers command envelopes and
event negotiation; individual file/schema versions remain independently
declared. Unsupported required versions **MUST** fail before any write or run.

**Post-v1 reserved:** a capability may advertise SQLite, resumable runs,
dashboard/TUI, remote execution, multi-turn cases, shared eval graders, or
majority-vote judging. V1 **MUST** report these as absent/false, not accept
partial hidden implementations.

## Discoverability and the authoring loop

`vet --help`, `vet <command> --help`, `vet --version --json`, and `vet schema`
**MUST** succeed without a project. Help is for humans; version metadata and
schemas are the machine discovery sources.

`vet schema [config|eval-case|grader|run]` **MUST** return the authoritative JSON
Schema and stable `$id` for that contract. `vet schema <name> --json` **MUST**
place the schema in `data.schema`; it **MUST NOT** return a prose rendering.
Schemas **MUST** define required fields, enums, defaults, numeric bounds,
formats, and whether unknown properties are accepted.

The v1 agent authoring loop is normative:

```text
negotiate -> request one schema -> generate/dry-run -> validate -> repair -> run
```

Agents **SHOULD** request only the schema they need and **MUST** run
`vet validate --json` after changing configuration, eval cases, graders, or
templates. Validation **MUST** be complete enough that a structurally valid
project does not encounter a later avoidable parser/schema error during `run`.
It **MUST NOT** invoke targets or judges or mutate project/run files.

## Standard input, output, and process discipline

An agent **MUST** select machine mode explicitly. `--json` is a single final
document; `run --reporter jsonl` is a stream. They are mutually exclusive.
Machine stdout **MUST** contain only the selected format and a trailing newline.
Handled machine-mode errors **MUST** use the same stdout format and leave stderr
empty, as specified by the [CLI UX standard](./cli-ux.md).

`vet` **MUST NOT** read stdin unless the command explicitly receives `-` as its
input source. This prevents hangs in autonomous environments. `add case
--from-json -` **MUST** read exactly one UTF-8 JSON value, reject trailing
non-whitespace bytes, enforce a documented maximum size, and stop at EOF.
Malformed input **MUST** produce a JSON diagnostic and no writes. Prompts,
password reads, implicit editor launches, and implicit browser launches are
prohibited.

Agents **SHOULD** capture stdout and exit status separately. They **MUST NOT**
parse human tables, color, progress text, or error prose. Producers **MUST**
preserve useful output even with a non-zero exit status: a completed failing run
still returns its structured run summary.

## Deterministic diagnostics

Validation and write-conflict diagnostics **MUST** use this shape:

```json
{
  "code": "REQUIRED_PROPERTY_MISSING",
  "severity": "error",
  "message": "Required property `id` is missing.",
  "path": "evals/refunds/cases.yaml",
  "pointer": "/0/id",
  "range": {"start":{"line":1,"column":1},"end":{"line":1,"column":1}},
  "remediation": {
    "action": "add-property",
    "description": "Add a unique non-empty case id.",
    "expected": {"type":"string","minLength":1}
  }
}
```

- `code`, `severity`, `message`, and `remediation` **MUST** exist.
- `path` **MUST** be normalized repository-relative when the error belongs to a
  file; `pointer` **MUST** be an RFC 6901 JSON Pointer into the normalized
  document. Root errors use the empty pointer `""`.
- `range` **SHOULD** identify the original YAML, Markdown/frontmatter, JSON, or
  TypeScript reference when available, using one-based line and column values.
- Remediation **MUST** state a bounded next action. It **MUST NOT** suggest
  `--force` for invalid syntax, schema, secrets, or unsafe paths.
- Diagnostics **MUST** be sorted by normalized path, pointer, severity, then
  code. Concurrency and filesystem enumeration **MUST NOT** affect ordering.
- Duplicate root causes **SHOULD** be coalesced while retaining affected paths.
- Messages **MUST** redact secrets and **MUST NOT** include stacks unless an
  explicit human debug mode is introduced. Machine contracts use codes.

Warnings do not make `ok` false unless a documented strict mode exists;
**Post-v1 reserved:** strict-warning policy. Errors make validation exit `2`.

## Safe agent-authored file changes

For `init`, `new eval`, `add case`, and `add grader`, an agent **SHOULD** call
`--dry-run --json` first. The response **MUST** include a complete ordered edit
plan with paths, action (`create`, `update`, `unchanged`, or `conflict`), and
content hashes before/after where applicable. Dry-run **MUST** take no locks,
write no temporary files, update no timestamps, and create no `.provet` state.

The real write **MUST** revalidate the observed before-hashes immediately before
an atomic commit. Drift **MUST** return `WRITE_CONFLICT`; it **MUST NOT** apply a
stale preview. Partial multi-file edits are prohibited. Existing unrelated
content in `AGENTS.md`, eval manifests, or case files **MUST** be preserved.

`--force` is explicit human/agent authority to perform only the command's
documented conflicting replacement. It **MUST NOT** mean “ignore errors,” bypass
hash checks against post-preview drift, follow unsafe symlinks, widen the edit
set, overwrite secrets, or delete unmentioned artifacts. A forced dry-run
**MUST** show the exact replacement before any real forced write.

## Watching runs and resumability boundaries

Agents **SHOULD** use `vet run --reporter jsonl` for long-running work. They
**MUST** process events by `sequence`, tolerate additive unknown event fields,
and wait for a terminal event plus process exit. Event timestamps are
provenance, not ordering keys.

The stream **MUST** expose run start, selection, trial/case progress, grader
outcomes, and one terminal run event without exposing secrets or unredacted
prompts configured as sensitive. Events **SHOULD** be concise references to
persisted artifacts rather than duplicate entire trajectories. The terminal
event **MUST** include the run ID, aggregate status, artifact location, and
summary necessary to decide the next command.

V1 supports observation, not reconnection or execution resume. If the consumer
disconnects, the `vet` process follows ordinary pipe/process semantics; a later
agent **MAY** inspect a finalized or interrupted artifact with `vet report`, but
**MUST NOT** assume work continues in a daemon. An interrupted/partial run
**MUST** be visibly marked and is not a valid successful baseline.

**Post-v1 reserved:** cursor-based replay, detach/reattach, checkpoints, and a
`resume` command. Future fields such as `cursor` **MUST NOT** imply v1 support.

## `AGENTS.md` and skill snippet contract

`vet init` **MAY** add agent guidance only through
`--agent-guidance <none|agents|skill>`, which **MUST** default to `none`.
`agents` updates a marked section in `AGENTS.md`; `skill` writes
`.agents/skills/provet/SKILL.md`. The default **MUST NOT** modify an existing
agent instruction file. The payload **MUST** be usable either as that marked
section or as the body of the repository skill. It **MUST** be idempotent and
delimited exactly once with versioned markers:

```markdown
<!-- provet:agent-guidance:start version=1 -->
## Provet eval workflow

- Run `vet --version --json` and verify protocol version 1.
- Read only the needed schema with `vet schema <name> --json`.
- Preview authoring writes with `--dry-run --json`; never use `--force` without
  reviewing the reported conflicts.
- After edits, run `vet validate --json` and repair diagnostics by `path` and
  `pointer` before running evals.
- Watch long runs with `vet run --reporter jsonl`; treat the terminal event and
  exit code together as authoritative.
- Compare candidate against baseline with `vet diff <baseline> <candidate>
  --json` and report regressions, grader errors, target/judge cost, and latency
  separately.
<!-- provet:agent-guidance:end -->
```

The generated section **MUST NOT** contain provider credentials, project-specific
secret names/values, unverified command options, absolute user paths, or claims
that `vet` can use cloud/CI/UI/resume features in v1. Updating an existing marked
v1 section **MUST** use the safe preview/hash/write flow. An unmarked similar
section is user content and **MUST NOT** be replaced automatically.

The skill form **MUST** add YAML frontmatter with `name: provet-eval-workflow`
and a concise `description` that activates for authoring, validating, running,
reporting, or diffing Provet evals. It **MUST** otherwise use the same marked
body; the workflow **MUST NOT** fork into a contradictory contract. The snippet
**MUST** point to local `vet <command> --help` and schema discovery rather than
embedding large schemas that will drift.

## Security, privacy, and redaction

- Agents **MUST** pass secret values through explicitly configured environment
  interpolation, never case text, command arguments, generated files, or stdin
  JSON that will be persisted.
- All command, adapter, judge, grader, event, diagnostic, report, and HTML paths
  **MUST** share pre-persistence redaction. Machine mode is not a trusted sink.
- Redaction **MUST** cover configured secret values, authorization headers,
  common credential formats, and provider payload fields declared sensitive.
  It **MUST** preserve field presence with a stable marker such as
  `"[REDACTED]"` so agents can distinguish absence from concealment.
- Diagnostics **MUST NOT** echo an invalid environment value. They **SHOULD**
  identify only the variable name and affected config pointer.
- Agent-supplied paths **MUST** be contained after canonicalization. Symlink
  escape, traversal, device files, and writes outside the planned project files
  **MUST** be rejected even with `--force`.
- Custom TypeScript graders are trusted repository code in v1. Capability and
  help output **MUST** disclose that they are not sandboxed. Agents **SHOULD**
  inspect new grader code before invocation.
- The tool **MUST NOT** upload telemetry, transcripts, or results. Explicit HTTP
  target/judge calls are the only v1 network exception and **MUST** identify the
  configured destination in redacted provenance.

## Context and token efficiency

Machine interfaces **SHOULD** minimize context without dropping decisions:

- capability output is a compact manifest, not help text;
- schema retrieval returns one requested schema, not the entire schema catalog;
- successful validation returns an empty diagnostics array, not restated input;
- JSON errors provide one summary plus structured diagnostics, without duplicate
  prose on stderr;
- JSONL progress references case/trial IDs and stored artifacts rather than
  repeating full prompts or trajectories;
- report case selection returns only the requested case plus run-level context;
- diff returns changed cases first and **MAY** omit unchanged detail only when it
  still reports the unchanged count and the omission explicitly.

Output **MUST NOT** become lossy solely to save tokens. Truncation **MUST** be
explicit with `truncated: true`, original byte/item counts, and a stable artifact
reference or narrower command. Silent truncation and repeated embedded base64 or
full schema blobs are prohibited.

## Agent authoring golden journey

The following v1 journey **MUST** pass end to end in a clean temporary project
without a TTY:

1. Negotiate: `vet --version --json`; assert protocol `1`, JSON, JSONL, and
   dry-run support, and no resumability.
2. Initialize safely: `vet init --agent-guidance agents --dry-run --json`;
   inspect the proposed config, example, and marked guidance, then repeat without
   `--dry-run` and verify only declared files changed.
3. Discover: `vet schema eval-case --json`; validate the returned schema `$id`
   and version.
4. Author: pipe one case object to
   `vet add case example --from-json - --format yaml --dry-run --json`; inspect
   paths/hashes, then repeat without `--dry-run`.
5. Validate: run `vet validate --json`; deliberately test one malformed case,
   repair it using `path`, `pointer`, and remediation, and return to `ok: true`.
6. Execute: run a deterministic local target with
   `vet run --filter 'example/*' --repeat 2 --concurrency 1 --reporter jsonl`;
   verify ordered events, terminal status, exit code, and run artifacts.
7. Inspect: `vet report <run-id> --json`; verify separate target/judge measures
   and case/grader statuses.
8. Compare: make an intentional candidate improvement, run again, then call
   `vet diff <baseline> <candidate> --json`; verify candidate-minus-baseline
   semantics and no hidden changes.
9. Conflict safety: modify a previewed file before applying and verify
   `WRITE_CONFLICT` with zero partial writes and no secret leakage.

The golden journey **MUST** use injected deterministic adapters and clock/ID
providers. A separate opt-in live smoke test **MAY** establish provider
compatibility but **MUST NOT** replace it.

## Conformance matrix

| Area | Required scenario | Required evidence |
| --- | --- | --- |
| Negotiation | Supported and unsupported protocol/schema versions | Version envelope, no writes on mismatch |
| Discovery | Help outside a project; each named schema | Exit/stdout snapshots plus schema validation |
| Noninteractive | Closed stdin, non-TTY, no editor/browser | Bounded completion and no prompts |
| Stream discipline | Human, JSON, JSONL success and error | Exact stdout/stderr bytes and exit status |
| Diagnostics | YAML, Markdown frontmatter, JSON, config, cross-file errors | Stable sort, pointers/ranges, actionable remediation |
| Authoring | Create, identical repeat, conflict, dry-run, force, preview drift | File tree and before/after hashes; atomicity |
| Validation | Valid project and multiple simultaneous errors | Complete deterministic diagnostic set; no target calls |
| Execution watch | Parallel completion, failure, grader error, timeout, SIGINT | Ordered sequences and exactly one terminal event |
| Resume boundary | Consumer disconnect and interrupted artifact | No daemon/resume claim; partial state visible |
| Report/diff | Pass, fail, grader-error, missing case, unequal repeats, unknown cost | Schema-valid view-model and correct exit/deltas |
| Security | Secrets in env, headers, prompts, errors; path/symlink escape | Redacted all sinks; unsafe actions rejected |
| Context size | Large trajectory and diagnostics | Explicit truncation metadata and artifact references |
| Guidance | New/existing `AGENTS.md`, marked and unmarked content | Idempotency, preserved user text, versioned markers |

Every row **MUST** have deterministic automated coverage. Security, cancellation,
and atomic-write rows **MUST** also receive adversarial review. Live-provider
tests **SHOULD** be reported as a separate evidence gate.

## Anti-patterns

The following are prohibited in v1:

- prompting to resolve missing input, overwrite files, select a run, or approve
  a destructive operation;
- inferring success from exit `0` while ignoring case status, or treating every
  non-zero exit as the same failure;
- parsing human tables or stderr prose when JSON/JSONL is available;
- returning prose or ANSI before/after JSON, or mixing JSON and JSONL;
- reading stdin opportunistically or waiting forever for EOF;
- emitting nondeterministically ordered diagnostics or completion-order results;
- reporting `grader-error` as an ordinary failed assertion;
- using `--force` to bypass validation, containment, preview drift, or redaction;
- mutating `AGENTS.md` by fuzzy replacement or adding guidance without request;
- embedding full schemas, trajectories, or repeated prompts in every event;
- silently truncating output or substituting zero for unknown cost/tokens;
- leaking secrets into run artifacts, errors, goldens, HTML, or verbose logs;
- claiming custom graders are sandboxed, a partial run is resumable, or a v1
  local run is CI/cloud execution;
- relying on undocumented environment variables, TTY state, locale, or current
  directory to change semantics.

Changes that weaken these guarantees or introduce a post-v1 capability require
the ADR and compatibility process in the
[repository standard](./repository.md).
