# Codex CLI adapter stream research

Status: SPI-02 compatibility evidence, not a ratified public adapter contract.

Observed CLI: `codex-cli 0.146.0` on `Darwin arm64`.

Capture date: 2026-08-09.

## Conclusion

`codex exec --json` is a line-ordered native JSONL stream with no stream schema
version, event sequence, or event timestamp in the observed capture. A
successful run emitted `thread.started`, `turn.started`, command item lifecycle,
an assistant message, and `turn.completed` usage. It exited `0`, left a hashed
workspace after-state, and still wrote operational warnings to stderr. Because
no before-state manifest was captured, the after-state proves file presence but
not an addition or modification. The future adapter must decide success from
the JSONL terminal state plus process exit, not from stderr emptiness.

The native stream is rich enough to begin `RUN-05` replay work without inventing
message, command, or usage events. Raw JSONL, stderr, detected CLI version,
process termination, and honestly classified workspace evidence remain
mandatory provenance.
Approval, cancellation/signal, compaction, nested-agent, MCP, web-search,
file-change-item, provider-error, and parallel-item behavior was not exercised.
Those capabilities must remain explicitly unsupported or compatibility-unknown
until separately captured; synthetic negative fixtures are not live evidence.

## Evidence sources and boundaries

The evidence set deliberately separates three sources:

1. [Official OpenAI non-interactive-mode documentation](https://developers.openai.com/codex/noninteractive)
   documents `codex exec`, `--ephemeral`, JSONL stdout, the documented event and
   item families, authentication, stdin behavior, sandbox selection, and the
   Git-repository prerequisite.
2. Read-only local commands recorded the installed version, help, and
   authentication mode. `codex login status` reported saved ChatGPT
   authentication; no credential file or credential value was read.
3. One bounded, ephemeral, non-nested live invocation captured sanitized
   stdout, stderr, exit, usage, command lifecycle, and resulting temporary
   workspace after-state bytes. No before-state workspace manifest was retained.
   A separate parse-time invalid-option invocation did not reach the provider.

The fixture manifest at
`tests/fixtures/adapters/codex/manifest.json` records capture source, sanitized
invocation, byte digests, coverage, and evidence gaps. Live captures replace
thread identifiers, timestamps, temporary paths, and one host warning with
stable markers while preserving event order and semantic fields. The
`synthetic-negative` fixtures cover parser failure modes only.

This spike did not create, delegate, resume, or fork Codex tasks. Nested-agent
behavior was prohibited by the orchestration policy and live prompt. No account
login, logout, credential mutation, plugin mutation, MCP mutation, or user
configuration mutation was requested.

## Runtime prerequisites and invocation discipline

`RUN-05` should treat these as versioned prerequisites rather than ambient
assumptions:

- Resolve `codex` from the supervisor's explicit minimal `PATH`, then capture
  `codex --version` before provider invocation. The observed output was
  `codex-cli 0.146.0` plus a host warning on stderr.
- Run `codex login status` as a preflight when saved CLI authentication is the
  selected auth mode. A zero exit proves credentials are present, not that the
  account has quota or provider connectivity. Never read or copy `auth.json`.
- Invoke inside the isolated trial Git repository. Official documentation says
  Codex requires a Git repository unless `--skip-git-repo-check` is used; the
  adapter should not weaken that guard for normal workspace trials.
- Use `--json` and close stdin. Official documentation says piped stdin is
  appended even when a prompt argument is present. The observed harness left a
  pipe visible and stderr contained `Reading additional input from stdin...`.
  Provet must provide an explicit closed stdin so an autonomous run cannot hang
  or accidentally append unrelated bytes.
- Use explicit sandbox and approval arguments in their version-correct
  positions. On 0.146.0, `-a never` is a global option and must precede `exec`;
  placing it after `exec` exits `2` before emitting JSONL.
- `--ephemeral` prevents normal session rollout persistence, but it does not
  imply a zero-write Codex home. In the restricted harness, startup attempted to
  open the Codex state database and failed when that home was read-only. SPI-03
  must decide and document the allowed state/auth boundary.
- `--ignore-user-config` and `--ignore-rules` made the probe less dependent on
  personal configuration. They are research controls, not yet ratified adapter
  defaults.

The observed live argv shape was:

```text
codex -a never exec --json --ephemeral --ignore-user-config --ignore-rules \
  -s workspace-write -C <isolated-git-workspace> <non-nested-prompt>
```

## Observed stdout event stream

Line position was the only observed ordering key. The six live events appeared
in this exact order:

```text
thread.started
turn.started
item.started    command_execution / in_progress
item.completed  command_execution / completed / exit_code 0
item.completed  agent_message
turn.completed  usage
```

| Native event | Observed fields | Characterization |
| --- | --- | --- |
| `thread.started` | `thread_id` | Session provenance. Identifier is sensitive linkage and is sanitized in fixtures. No schema version or timestamp was present. |
| `turn.started` | no additional fields | A turn boundary, but no native sequence or step number. |
| `item.started` / `command_execution` | `id`, `command`, `aggregated_output`, `exit_code`, `status` | Start carried empty aggregate output, `null` exit, and `in_progress`. The command is a rendered shell command string, not a lossless argv array. |
| `item.completed` / `command_execution` | same shape | Completion reused the item ID, carried exit `0`, and status `completed`. Empty command output remained an empty string. |
| `item.completed` / `agent_message` | `id`, `text`, `type` | The final assistant text was `probe complete`. The event itself had no explicit `isFinal` field. |
| `turn.completed` | `usage` | Usage included input, cached input, cache-write input, output, and reasoning-output token counts. No currency cost or latency field was present. |

The live stream is in
`tests/fixtures/adapters/codex/0.146.0/live-command-workspace/stdout.jsonl`.
It retains the observed token counts so downstream replay cannot silently drop
new usage categories.

Official documentation additionally lists `turn.failed`, `item.*`, and `error`
event families, and item types for reasoning, file changes, MCP calls, web
searches, and plan updates. They were not present in this live capture. Their
documented existence is not sufficient evidence for exact field shapes.

## Stdout, stderr, exits, signals, and workspace effects

| Channel | Live result | Adapter consequence |
| --- | --- | --- |
| stdout | Six complete JSON objects, one per line | Parse incrementally as UTF-8 JSONL and retain each original line before normalization. |
| stderr | Non-empty startup/model-cache/state warnings | Capture separately and bound it. Non-empty stderr is diagnostic provenance, not failure by itself. |
| exit | `0` | Success still requires a recognized terminal JSONL event and no protocol truncation. |
| signal | none | No cancellation or signal contract was established. |
| workspace | One eight-byte file present in the hashed after-state | No before-state was captured, so this does not prove an addition or modification. Authoritative effects require pre/post snapshots and diffs from the workspace subsystem. |

The workspace after-state retained an eight-byte file containing `"fixture`.
Those bytes are an observation after invocation only. The stream reported the
shell command and exit `0`, but did not emit a separate file-change item, and no
hashed before-state was retained. The future adapter must not infer an addition,
modification, or complete workspace diff from command text or after-state bytes.

The parse-time invalid-option capture emitted no stdout, wrote usage diagnostics
to stderr, and exited `2`. It proves that an invocation can fail before any
JSONL prefix exists. A prior restricted-environment attempt also exited `1`
with no stdout when the Codex state database was not writable; that host failure
is recorded here as an environment gate rather than promoted to a portable
fixture contract.

## Proposed lossless and lossy mapping

This table is research input for the later adapter contract owner. It does not
add a public DTO.

| Native evidence | Proposed normalized meaning | Fidelity and rule |
| --- | --- | --- |
| Raw JSONL line and ordinal | Adapter raw event provenance | Lossless after documented redaction. Preserve before interpreting. Ordinal is Provet capture order, not a claimed Codex sequence. |
| `thread.started.thread_id` | Provider session identifier | Lossless value when retention policy permits; redact from shareable fixtures. Never use as event order. |
| `turn.started` | Turn/step boundary | Event presence is lossless; a numeric step is Provet-derived and must be marked derived. |
| Command item start/completion | Command/tool lifecycle | Status, rendered command, aggregate output, and exit are lossless. Executable/argv, duration, and workspace effect are unavailable and must remain `null` or external provenance. Do not shell-split the rendered command. |
| `agent_message.text` | Assistant message | Text is lossless. Treating the last message before `turn.completed` as final output is a version-bound inference because no `isFinal` flag was observed. |
| `turn.completed.usage` | Target token measures | Each observed token category is lossless. Total input semantics must not be guessed from cached counts. Cost, currency, and latency remain `null`. |
| stderr line | Adapter diagnostic | Preserve bounded/redacted bytes separately. Do not manufacture trajectory items from warnings. |
| process exit/signal | Invocation termination | Exit is lossless. Signal mapping remains unsupported until captured. |
| pre/post workspace snapshots | Workspace additions/deletions/modifications | External authoritative evidence when both states are captured and tied. This capture has only an after-state; never derive an effect solely from stream content or after-state bytes. |

No live evidence established approval events, tool-result pairing beyond
commands, nested-agent parentage, compaction boundaries, parallel ordering, or
provider-reported monetary cost. A normalized field for any of those would be
invented today.

## Replay and degradation policy

The replay spike under `tests/unit/adapters/codex/` applies these conservative
rules:

1. Read complete newline-delimited records in emission order and retain each raw
   line with its parsed value.
2. On malformed JSON, retain the valid prefix, record the exact one-based
   failing line, mark the trajectory partial, and return an adapter protocol
   failure. Never replace the prefix with a synthetic fallback event.
3. On EOF without `turn.completed` or `turn.failed`, retain open item IDs, mark
   the trajectory partial, and fail protocol completion even when the process
   exit is `0`.
4. Validate the minimum evidenced lifecycle before claiming completeness:
   `thread.started`, then `turn.started`, matched command item starts and
   completions, atomic completed agent messages, then a terminal record.
   Malformed shapes, reordered or duplicate records, unmatched completions, and
   terminals with open items remain in the raw replay with line-addressed
   diagnostics and force completeness false.
5. Enumerate only exact evidenced top-level event types and item discriminators.
   Retain unknown records verbatim, including new members under familiar
   `turn.*` and `item.*` prefixes, and mark trajectory completeness degraded.
   Unknown data may be ignored only for a consumer that can prove it is
   irrelevant; trajectory graders must not receive a silent completeness claim.
6. A terminal event and process termination are jointly authoritative. An
   `error` event is evidence, not by itself proof that no later terminal record
   exists. A non-zero exit remains invocation failure even if a terminal prefix
   was parsed.
7. Preserve stdout, stderr, exit, signal, version, and workspace evidence as
   separate channels. Redaction occurs before any shareable persistence.

The malformed, partial, lifecycle-hostile, and unknown-event streams are
synthetic and labelled as such in provenance. They verify deterministic parser
behavior, not provider compatibility.

## Supported-version policy

The JSONL objects do not carry a native schema version. Compatibility must
therefore bind to the detected CLI version and captured fixtures:

- The only evidenced version is exact `0.146.0`. Do not treat `0.146.x`, a
  caret range, or a newer minor as supported without replay and live evidence.
- Parse `codex --version` strictly as the observed `codex-cli <version>` shape.
  Missing, malformed, or unsupported versions fail before a paid invocation.
- A newly supported version needs sanitized provenance, all replay fixtures,
  secret scan, owned deterministic tests, and an opt-in live smoke reported
  separately. Fixture families remain version-addressed.
- Unknown event variants or item discriminators within an otherwise supported
  exact version are retained and surfaced as lossy protocol drift. Prefix
  membership does not make a variant supported, and drift does not silently
  widen the supported range or preserve a completeness claim.
- Persist detected version and redacted raw native evidence with every trial so
  later import, debugging, and compatibility review can reproduce the decision.

This exact-version policy is intentionally narrow for a `0.x` CLI whose event
contract can drift. A broader range requires later reviewed evidence; it is not
an incidental parser choice.

## Compatibility matrix

| Behavior | 0.146.0 evidence | Downstream status |
| --- | --- | --- |
| Assistant message | Live | Implement exact observed shape. |
| Command start/result | Live | Implement exact observed shape; rendered command is not argv. |
| Usage | Live | Preserve five observed token categories; cost and latency unknown. |
| Successful exit with stderr | Live | Terminal + exit decides success; stderr is diagnostic. |
| Workspace after-state file presence | Live hashed after-state only | Not authoritative evidence of an addition or modification; RUN-06 must produce tied pre/post evidence. |
| Parse-time CLI error | Live local validation | Support zero-event non-zero exit. |
| Malformed/partial JSONL | Synthetic negative | Fail protocol with retained prefix; not live compatibility. |
| Malformed/reordered known records | Synthetic negative | Retain raw records, diagnose invalid framing or item lifecycle, and keep completeness false; not live compatibility. |
| Additive unknown event or item discriminator | Synthetic negative | Retain raw, record the unsupported discriminator, and degrade completeness even under familiar prefixes. |
| Approval request/denial | Not exercised | Unsupported/unknown; no mapping may be claimed. |
| Cancellation/signals | Not exercised | Unsupported/unknown; supervisor evidence must be captured before support. |
| Compaction | Not exercised | Unsupported/unknown; do not infer a message or token boundary. |
| Nested agents | Prohibited, not exercised | Unsupported/unknown under orchestration policy. |
| MCP, web, plan, reasoning, file-change items | Officially listed, not live captured | Event families known; exact fields and mapping remain unsupported. |
| Provider failure after stream start | Not exercised | Unsupported/unknown; generic partial-stream policy applies only. |
| Parallel items | Not exercised | Ordering/parentage unsupported; never infer concurrency from adjacent lines. |

## Evidence checks

The owned tests provide three independent gates:

- replay tests prove raw-order retention, framed item lifecycle, final message,
  usage, separate stderr/exit/workspace after-state evidence, malformed-line
  reporting, partial open-item retention, line-addressed lifecycle diagnostics,
  and hostile unknown event/item preservation with degraded completeness;
- provenance contract tests verify source classification and SHA-256 of every
  manifest-owned fixture byte;
- secret-scan contract tests reject credential-shaped values, private keys,
  unsanitized macOS home paths, and Codex auth-file paths.

These deterministic checks do not prove current provider compatibility beyond
the single recorded 0.146.0 live capture. Before `RUN-05` claims cancellation,
approval, compaction, nested-agent, or non-command tool support, it needs a new
policy-approved live evidence family or an authoritative version-matched fixture
with the same provenance and secret gates.
