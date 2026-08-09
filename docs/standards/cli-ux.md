# CLI UX standard

Status: normative for Provet v1. **MUST**, **MUST NOT**, **SHOULD**, **SHOULD
NOT**, and **MAY** express requirement levels. **Post-v1** labels reserved
extensions that are not v1 requirements.

This document defines the human-facing and process-facing behavior of the
TypeScript/Bun `vet` binary. It relies on the
[repository standard](./repository.md) for implementation boundaries and the
[agent UX standard](./agent-ux.md) for autonomous use.

## Command grammar

The v1 grammar is:

```text
vet [global-options] <command> [command-options] [arguments]

command := init
         | new eval <name>
         | add case <eval>
         | add grader <eval>
         | validate
         | schema [config|eval-case|grader|run]
         | run
         | report [run]
         | diff <baseline> <candidate>
```

Command and option names **MUST** be lower-case kebab-case. Long options **MUST**
use `--name value` or, for booleans, `--name`; `--name=value` **SHOULD** also be
accepted. Short aliases **MAY** exist only when documented and unambiguous.
Options **MUST NOT** silently accept misspellings. Repeated scalar options,
unknown options, missing values, and extra positional arguments **MUST** be
usage errors.

The parser **MUST** accept global options before or after the command, except
after `--`, and **MUST** render the same semantics independent of position.
`--` ends option parsing where a command accepts arbitrary command arguments.
Help **MUST** show defaults, units, allowed values, file effects, exit behavior,
and whether an option is repeatable.

## Global options

These options are v1 requirements:

| Option | Contract |
| --- | --- |
| `--help` | Print contextual help to stdout and exit `0`; no config load or writes. |
| `--version` | Print only the `vet` semantic version to stdout and exit `0`; with `--json`, return capability metadata. |
| `--json` | Emit exactly one versioned JSON envelope on stdout for success or error. |
| `--no-color` | Disable ANSI color and styling. Machine modes imply it. |
| `--verbose` | Add bounded human diagnostics to stderr; **MUST NOT** change semantic output. |
| `--quiet` | Suppress human progress and nonessential diagnostics; final results remain. |

`--json` and the `run --reporter jsonl` stream are mutually exclusive.
`--quiet` and `--verbose` are mutually exclusive. Conflicts **MUST** produce a
structured usage error. V1 behavior **MUST NOT** depend on undeclared
`PROVET_*` environment switches. Standard terminal conventions such as
`NO_COLOR` **MAY** disable color but **MUST NOT** change data or control flow.

## Streams and rendering modes

### Human mode

Final command results **MUST** go to stdout. Progress, warnings, and verbose
diagnostics **MUST** go to stderr. Error explanations **MUST** go to stderr;
stdout **MUST** remain empty on a human-mode error unless a complete result was
already intentionally emitted.

When stderr is a TTY, `vet` **MAY** update bounded progress in place. It **MUST**
restore the cursor, clear incomplete progress, and finish with a newline on
success, error, timeout, or cancellation. When stderr is not a TTY, progress
**MUST** be append-only, line-oriented, rate-limited, and free of control
sequences. Piped stdout **MUST NOT** change result semantics.

### JSON mode

`--json` **MUST** write one UTF-8 JSON object plus a trailing newline to stdout.
Stdout **MUST NOT** contain headings, progress, ANSI sequences, or prose outside
that object. Stderr **MUST** be empty for handled outcomes, including handled
errors; bootstrap failures that prevent envelope creation **MAY** use stderr and
exit `70`.

Success envelope:

```json
{
  "schemaVersion": 1,
  "ok": true,
  "command": "validate",
  "data": {"valid": true, "diagnostics": []},
  "meta": {"vetVersion": "1.0.0"}
}
```

Error envelope:

```json
{
  "schemaVersion": 1,
  "ok": false,
  "command": "validate",
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "2 validation errors",
    "details": {"diagnostics": []},
    "remediation": "Fix the listed files and run `vet validate` again."
  },
  "meta": {"vetVersion": "1.0.0"}
}
```

`ok`, `command`, `schemaVersion`, and `meta.vetVersion` **MUST** always exist.
Exactly one of `data` or `error` **MUST** exist. Monetary amounts **MUST** carry
an explicit currency or use the contract's documented currency; durations
**MUST** end in `Ms`; unavailable measurements **MUST** be `null`.

### JSONL reporter

`vet run --reporter jsonl` **MUST** emit one complete, versioned JSON object per
line on stdout and nothing else. The first event **MUST** be `run_started`; case
and trial events follow; the last event **MUST** be exactly one of
`run_completed`, `run_failed`, or `run_cancelled`. Every event **MUST** contain
`schemaVersion`, `type`, `runId`, `sequence`, and `timestamp`. Sequences **MUST**
be strictly increasing in emission order.

```jsonl
{"schemaVersion":1,"type":"run_started","runId":"20260809-123000-a1b2","sequence":1,"timestamp":"2026-08-09T07:00:00.000Z","data":{"caseCount":2}}
{"schemaVersion":1,"type":"case_completed","runId":"20260809-123000-a1b2","sequence":8,"timestamp":"2026-08-09T07:00:03.000Z","data":{"caseId":"refunds/smoke","status":"pass"}}
{"schemaVersion":1,"type":"run_completed","runId":"20260809-123000-a1b2","sequence":9,"timestamp":"2026-08-09T07:00:03.010Z","data":{"status":"pass"}}
```

Progress events **MUST NOT** replace the normalized per-case trajectory logs in
run storage. A failure after streaming begins **MUST** end with a structured
terminal event and the matching non-zero exit status.

## Stable exit and error codes

Exit codes are v1 public API and **MUST NOT** be reused:

| Exit | Meaning |
| ---: | --- |
| `0` | Command succeeded; a run/report has no non-passing case; a diff has no regression. |
| `1` | Completed semantic outcome contains an eval failure or diff regression. |
| `2` | Usage, configuration, validation, or selection error. |
| `3` | One or more grader errors made the result incomplete. |
| `4` | Target/adapter invocation or protocol error. |
| `5` | Timeout occurred. |
| `6` | Workspace, storage, report generation, or security boundary error. |
| `70` | Unexpected internal error. |
| `130` | Cancelled by SIGINT or an explicit cancellation signal. |

When multiple outcomes occur, precedence is `130`, `70`, `6`, `5`, `4`, `3`,
`2`, `1`, `0`. The summary **MUST** retain all underlying statuses even when
one exit code wins.

Stable v1 error codes **MUST** be upper snake case and include at least:
`USAGE_ERROR`, `CONFIG_NOT_FOUND`, `CONFIG_INVALID`, `VALIDATION_FAILED`,
`SELECTION_EMPTY`, `RUN_NOT_FOUND`, `ALREADY_EXISTS`, `WRITE_CONFLICT`,
`TARGET_FAILED`, `ADAPTER_PROTOCOL_ERROR`, `GRADER_ERROR`, `JUDGE_PARSE_ERROR`,
`TIMEOUT`, `CANCELLED`, `WORKSPACE_ERROR`, `STORAGE_ERROR`, `REPORT_ERROR`,
`SECURITY_ERROR`, and `INTERNAL_ERROR`. New codes **MAY** be added within v1;
existing meanings **MUST NOT** change.

## Paths and selectors

`vet` **MUST** discover `provet.yaml` from the current directory upward to the
filesystem root, stopping at the first match. It **MUST** report the resolved
config path in verbose and machine output. Paths inside configuration and eval
documents **MUST** resolve relative to the containing document, not the caller's
current directory. Displayed paths **SHOULD** be repository-relative when safe.

Eval arguments identify the exact normalized eval name. Case IDs **MUST** be
globally represented as `<eval>/<case>`. `--filter <pattern>` **MUST** apply a
documented, shell-independent glob syntax to that full ID; it **MAY** be repeated
and repeated filters use OR semantics. Zero matches is `SELECTION_EMPTY`, not a
green run. Shell expansion **MUST NOT** be required; examples quote patterns.

A run selector is an exact run ID, an explicit path to a run directory, or the
reserved selector `latest`. `vet report` without a selector is equivalent to
`vet report latest`. `vet diff` **MUST** receive both selectors. Run paths **MUST**
contain a valid supported run manifest. Ambiguous prefixes and undocumented
selectors such as `previous` **MUST** be rejected in v1.

## Authoring writes, idempotency, and force

`init`, `new eval`, `add case`, and `add grader` are the only v1 mutating
commands. They **MUST** validate all inputs, construct the complete proposed
change in memory, and then write atomically. Failure **MUST** leave original
files byte-for-byte unchanged. Repeating a command that would create the same
semantic artifact **SHOULD** succeed without duplicate content and report
`changed: false`; conflicting content **MUST** return `WRITE_CONFLICT`.

Each mutating command **MUST** support `--dry-run`, which performs discovery,
validation, conflict checks, and renders the proposed file operations without
writing. `--force` **MUST** be required for an explicitly supported overwrite or
destructive replacement. `--force` **MUST NOT** bypass schema validation, path
containment, or secret protections. In machine output, file operations **MUST**
list normalized `create`, `update`, `unchanged`, and `conflict` actions.

## Run selection, repeats, concurrency, and timeouts

- `--repeat <N>` **MUST** accept a positive integer and override case, eval, and
  project repeat defaults for the selected run.
- `--concurrency <C>` **MUST** accept a positive bounded integer and control the
  maximum simultaneously active trials, not cases. Results **MUST** serialize
  in stable eval/case/trial order regardless of completion order.
- `--filter <pattern>` **MAY** repeat as described above. Filtering happens
  before repeat expansion.
- Per-case `pass_if` **MUST** resolve through case, eval, then project defaults
  and support `all`, `any`, and `ratio:<0..1>`. A ratio compares passed trials
  divided by completed trials and **MUST NOT** count grader errors as failures.
- Adapter/configured timeouts **MUST** be positive seconds at the config boundary
  and normalized to milliseconds internally. A timeout **MUST** identify scope
  and elapsed limit in output.

The run planner **MUST** snapshot the resolved selection and configuration before
execution. Subsequent file edits **MUST NOT** change an in-flight plan.

## Progress, cancellation, and partial runs

Human progress **SHOULD** show completed/total trials, pass/fail/error counts,
elapsed time, and known cost without printing prompt or secret content. It
**MUST** be usable at narrow terminal widths and without color.

On the first SIGINT, `vet` **MUST** stop scheduling new trials, cancel active
work, persist a terminal interruption state, and exit `130`. A second SIGINT
**MAY** force immediate termination but **MUST NOT** report a completed run.
Timeout and cancellation **MUST** remain distinct. A partial run **MAY** be
reported but **MUST NOT** be eligible as a successful diff baseline without an
explicit future contract.

V1 does not resume execution of an interrupted run. **Post-v1 reserved:** a
resume command or checkpoint protocol. V1 artifacts **SHOULD** retain enough
terminal state for a future implementation to diagnose, not silently resume.

## Report semantics

`vet report [run]` **MUST** derive terminal, JSON, and HTML output from the same
versioned report view-model. Summary totals **MUST** partition cases into
`pass`, `fail`, `grader-error`, and `skipped`. Drill-down by `--case <id>` **MUST**
show each trial's final output, trajectory/tool calls, grader outcomes and
reasoning, target and judge cost, tokens, and latency, subject to redaction.

`--html` **MUST** write a self-contained static document atomically and return
its path. Project `templates/` overrides **MUST** consume the same view-model and
must be validated. `--open` **MUST** require `--html`, **MUST** be rejected in
non-TTY or machine mode, and **MUST** open only after a successful write.
`--html` and `--json` are mutually exclusive in v1.

## Diff semantics

`vet diff <baseline> <candidate>` always computes `candidate - baseline`.
Cases **MUST** match by fully qualified case ID. Output **MUST** classify:

- `improved`: non-pass to pass;
- `regressed`: pass to non-pass, or a newly introduced grader/target error;
- `unchanged`: same semantic status;
- `added` and `removed`: present in only one run.

Added/removed cases **MUST** be reported separately and **MUST NOT** silently
count as improvements/regressions. For matched cases the diff **MUST** include
trial/pass-rate change, status change, target-cost delta, judge-cost delta,
token delta, and latency delta when both values are known. Deltas are candidate
minus baseline; unknown values remain `null`. Different repeat counts **MUST**
compare rates and retain raw numerators/denominators. A regression exits `1`.

Dirty Git state, differing commits, config fingerprints, and incompatible
schema versions **MUST** be visible. An unsupported schema comparison **MUST**
fail rather than guess.

## Accessibility and terminal behavior

- Meaning **MUST NOT** depend on color, Unicode glyphs, animation, or column
  position. Status words and signs **MUST** accompany visual styling.
- Color **MUST** respect `--no-color`, non-TTY output, and `NO_COLOR`.
- Tables **MUST** degrade to labelled records when the available width cannot
  preserve content; essential values **MUST NOT** be truncated silently.
- Output **MUST** use locale-independent numbers and ISO 8601 timestamps in
  machine formats. Human output **SHOULD** include units.
- Interactive prompts, pagers, spinners without text alternatives, desktop
  notifications, and sound are prohibited in v1.
- All emitted text **MUST** be valid UTF-8 and end with a newline. User content
  **MUST** be escaped so control characters cannot manipulate the terminal.

## Command examples

Every example below is v1 and noninteractive.

### `vet init`

Scaffold `provet.yaml`, a working example eval, and optionally the documented
agent guidance. `--agent-guidance <none|agents|skill>` **MUST** default to
`none`; `agents` updates the marked section in `AGENTS.md`, while `skill` writes
`.agents/skills/provet/SKILL.md`. Existing conflicting files require `--force`.

```sh
vet init --dry-run
vet init --agent-guidance agents --json
```

### `vet new eval`

Create a directory-form eval by default, or the single-file shorthand.

```sh
vet new eval refunds --format dir
vet new eval smoke --format file --json
```

`--format` **MUST** accept only `dir` or `file`.

### `vet add case`

Add a YAML or Markdown case. Exactly one input source **MUST** be supplied:
`--input`, `--from-json <path>`, or stdin (`--from-json -`).

```sh
vet add case refunds --input "Approve an in-window refund" --format yaml
printf '%s\n' '{"id":"late-refund","input":"Decline a late refund"}' \
  | vet add case refunds --from-json - --format md --json
```

### `vet add grader`

Add a per-case grader definition; v1 does not create eval-level shared graders.
The target case selector **MUST** be explicit through the command's documented
case option.

```sh
vet add grader refunds --case late-refund --type judge \
  --use strict --rubric "Was the refund policy followed?"
vet add grader refunds --case smoke --type contains \
  --value "refund approved" --dry-run --json
```

### `vet validate`

Validate config and every discovered eval file without invoking targets or
judges and without writing files.

```sh
vet validate
vet validate --json
```

### `vet schema`

Dump JSON Schema for one contract. With no argument, list available schema
names and versions; it **MUST NOT** concatenate multiple schemas ambiguously.

```sh
vet schema config
vet schema eval-case --json
```

### `vet run`

Run the selected trials with bounded concurrency. JSONL is the streaming mode;
`--json` emits one final envelope after completion.

```sh
vet run --filter 'refunds/*' --repeat 5 --concurrency 2
vet run --reporter jsonl > run-events.jsonl
vet run --json > run-result.json
```

### `vet report`

Inspect the latest or selected run, optionally a single case, or render static
HTML.

```sh
vet report latest --case refunds/tricky-customer
vet report 20260809-123000-a1b2 --json
vet report latest --html
```

### `vet diff`

Compare candidate against baseline; cost and latency deltas use the same order.

```sh
vet diff 20260809-120000-9f8e 20260809-123000-a1b2
vet diff ./saved/baseline .provet/runs/20260809-123000-a1b2 --json
```

## Snapshot and conformance testing

The built binary **MUST** be snapshot-tested across success and error for every
v1 command in TTY-like human, non-TTY human, `--json`, and applicable JSONL
modes. Tests **MUST** assert stdout bytes, stderr bytes, exit code, file effects,
ANSI absence/presence, and terminal newline restoration. Dynamic values **MUST**
be normalized through injected clock/ID/path providers, not broad regex removal.

Machine snapshots **MUST** also validate against published schemas. At minimum,
tests cover unknown/repeated options, empty selections, invalid schemas,
conflicting writes, `--dry-run`, `--force`, partial JSONL failure, SIGINT,
timeout, narrow terminal width, Unicode/control-character input, differing
repeat counts, missing runs, grader errors distinct from failures, and redacted
secrets.

## Post-v1 reserved extensions

The following **MAY** be designed later but **MUST NOT** be accepted as hidden v1
syntax: resume/checkpoint commands, TUI/dashboard, CI-specific reporters,
remote/cloud run selectors, SQLite query selectors, multi-turn controls,
majority-vote judge controls, eval-level shared grader flags, and interactive
prompts. Adding any requires the compatibility and ADR process in the
[repository standard](./repository.md).
