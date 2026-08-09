# SPI-01: Claude Code stream behavior

- Status: schema characterized; live compatibility unavailable
- Roadmap node: `SPI-01`
- Observed: 2026-08-09
- Downstream consumer: `RUN-04`

## Conclusion

Claude Code `2.1.226` is installed on the research host. The non-mutating
`claude auth status --json` preflight exited `1`, so no provider prompt, tool
call, workspace mutation, cancellation probe, or billed request was run. No
login, logout, account, credential, or settings mutation was attempted. Spend
was USD 0.

The installed version has a numerically matching published
`@anthropic-ai/claude-agent-sdk@0.3.226` package. Its `sdk.d.ts` is the primary
schema evidence for this spike. Anthropic describes the Agent SDK as using the
Claude Code runtime and documents the same ordered system, assistant, user, and
result message flow. This is strong implementation evidence, but it is **not**
a live compatibility result for `claude -p --output-format stream-json`.

`RUN-04` can implement deterministic replay and fail-closed degradation from
this evidence. It must initially treat `2.1.226` as a **schema candidate**, not
as a supported live version. A version enters the support allowlist only after
the separate opt-in live gate reproduces the cases in this document.

## Evidence classes

| Class | Evidence | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Local observation | CLI path exists; `claude --version` printed `2.1.226 (Claude Code)` and exited `0`; auth status exited `1` with output suppressed | Installed executable/version and unavailable auth gate | Provider behavior, stdout/stderr purity, signal exit, tools, or cost |
| Published schema | Exact npm tarball for `@anthropic-ai/claude-agent-sdk@0.3.226`; SHA-256 and npm integrity in the fixture manifest | Current native message discriminants, fields, result subtypes, terminal reasons, and documented provenance semantics | That the CLI emits every allowed shape, or emits it identically under this host/auth/model |
| Anthropic documentation | CLI reference, Agent SDK type reference, cookbook streams, SDK changelog | Flag availability, message ordering examples, stream evolution, and SDK/Claude Code relationship | Local compatibility |
| Schema-derived replay | Sanitized fixtures built from the exact published types | Parser decisions and deterministic degradation behavior | Live compatibility or native byte-for-byte captures |
| Negative synthetic replay | Deliberately malformed, partial, unknown, and future-version streams | Fail-closed behavior | A failure observed from Claude Code |

The fixture
[`provenance-manifest.json`](../../tests/fixtures/adapters/claude-code/provenance-manifest.json)
records the full evidence classification, source package integrity, hashes,
sanitization, live invocation count, and spend. Tests prevent any fixture from
being relabelled as live evidence.

## Installed CLI and prerequisites

Observed commands were deliberately limited to discovery:

```text
command -v claude
claude --version
claude --help
claude auth --help
claude auth status --help
claude auth status --json  # stdout/stderr suppressed; only exit recorded
```

| Prerequisite | Observation | Adapter behavior |
| --- | --- | --- |
| Executable | Installed | Missing executable is a preflight adapter error before a trial starts. |
| CLI version | `2.1.226` | Detect with `claude --version` before any billed invocation and compare with an exact allowlist. |
| Authentication | Unavailable; status exit `1` | Report an authentication prerequisite failure. Never start login or echo status JSON. |
| Noninteractive mode | Local help advertises `-p`/`--print` | Required. Interactive prompts and trust/account dialogs are not an adapter protocol. |
| Stream output | Local help advertises `--output-format stream-json` with `--print` | Required stdout protocol. |
| Spend bound | Local help advertises `--max-budget-usd` with `--print` | Required on every live evidence invocation in addition to the external aggregate cap. |
| Session persistence | Local help advertises `--no-session-persistence` with `--print` | Use for isolated one-case evidence unless a resume case is explicitly being tested. |
| Workspace | `--print` skips the workspace trust dialog according to local help | Invoke only inside a disposable copied fixture; skipping the dialog is not sandboxing. |

Do not pass the ambient environment wholesale. Authentication remains the
Claude executable's responsibility, but the adapter must never inspect, copy,
log, or persist credential values. Record only the selected auth mechanism's
non-secret provenance when the native init event exposes it.

## Process observations and unavailable live cases

The current gate distinguishes discovery from provider execution:

| Case | stdout | stderr | exit | signal | ordering/workspace | Evidence status |
| --- | --- | --- | --- | --- | --- | --- |
| `--version` | Version text observed | Not captured as a compatibility fixture | `0` | none | one discovery line | local discovery only |
| auth status | Suppressed | Suppressed | `1` | none | no account mutation | local gate only |
| text | not run | not run | unavailable | unavailable | unavailable | auth blocked |
| tool | not run | not run | unavailable | unavailable | unavailable | auth blocked |
| parallel tools | not run | not run | unavailable | unavailable | unavailable | auth blocked |
| tool/provider error | not run | not run | unavailable | unavailable | unavailable | auth blocked |
| budget/turn limit | not run | not run | unavailable | unavailable | unavailable | auth blocked |
| cancellation | not run | not run | unavailable | unavailable | unavailable | auth blocked |
| workspace edit | not run | not run | unavailable | unavailable | unavailable | auth blocked |
| malformed provider output | never a live claim | never a live claim | synthetic only | synthetic only | replay only | negative replay |

Exact stderr bytes, cross-pipe interleaving, signal delivery, exit status on
SIGINT, and workspace effects remain a live evidence gate. `RUN-04` must record
stdout chunks, stderr chunks, process exit, terminating signal, supervisor
timeout/cancellation cause, and workspace manifest evidence as separate
provenance. Separate pipes do not provide a trustworthy global stdout/stderr
order; preserve order within each pipe and supervisor receive order without
claiming it is the provider's write order.

## Native schema candidate: 2.1.226

The exact package inspected was downloaded from the
[official npm package](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk/v/0.3.226).
The installed CLI and published SDK versions matched numerically at observation
time, but no Anthropic guarantee was found that these version numbers will
always remain lockstep. The adapter must inspect both independently.

### Core records

| Native discriminator | Relevant fields | Ordering and meaning |
| --- | --- | --- |
| `system/init` | `claude_code_version`, `session_id`, `uuid`, `cwd`, `model`, `tools`, `mcp_servers`, `permissionMode`, `apiKeySource`, optional `capabilities` | Expected first semantic record based on published examples. It is the in-stream version and capability authority. Absolute cwd and auth source require redaction/minimization. |
| `assistant` | `message.content[]`, `parent_tool_use_id`, `uuid`, `session_id`, optional `error`, `aborted`, `subagent_type`, `task_description`, `timestamp` | One API turn can produce multiple assistant records. Preserve line order, then content-array index. Timestamp is display provenance only; the published type explicitly says not to order by it. |
| `user` | `message.content[]`, `parent_tool_use_id`, optional `tool_use_result`, `isSynthetic`, `uuid`, `session_id`, subagent metadata | Claude Code uses user-role records for tool results and optional replay acknowledgements. Correlate by `tool_use_id`, never adjacency alone. |
| `result/success` | `result`, `stop_reason`, optional `terminal_reason`, `is_error`, `duration_ms`, `duration_api_ms`, `num_turns`, `total_cost_usd`, `usage`, `modelUsage`, `permission_denials` | Terminal query result. `result` is the canonical final text; assistant text remains the trajectory. |
| `result/error_*` | Same measures plus `errors[]`; subtype is `error_during_execution`, `error_max_turns`, `error_max_budget_usd`, or `error_max_structured_output_retries` | A protocol-complete failed query is distinct from a malformed or truncated stream. |

The Agent SDK reference and Anthropic's cookbook describe the high-level order
as system initialization, assistant messages, user tool-result messages, and an
always-last result message. See the
[Agent SDK type reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
and the
[published raw stream example](https://platform.claude.com/cookbook/claude-agent-sdk-07-hosting-the-agent).

### Assistant content blocks

The v1 adapter needs these blocks:

- `text`: normalize to assistant text with native line and content index.
- `tool_use`: normalize `id`, `name`, and object `input`; retain the raw block.
- `thinking` and `redacted_thinking`: retain only in sanitized raw evidence.
  They are not v1 semantic trajectory events and must not be printed or used by
  graders.
- Unknown blocks: preserve raw, mark protocol drift, and make trajectory
  evidence unavailable. Do not silently discard them.

A single assistant content array may contain multiple `tool_use` blocks.
Preserve their array order and correlate results by identifier. Multiple blocks
prove grouped calls, but without live timing evidence they do not prove actual
parallel scheduling or completion order. Anthropic's
[parallel tool documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use)
also requires identifier-based result matching.

### Tool results

Within a user message, `tool_result` blocks carry `tool_use_id`, content, and
optional `is_error`. The wrapper's optional `tool_use_result` contains richer,
tool-specific structured output. Proposed precedence is:

1. Use `tool_use_id` for correlation.
2. Preserve the model-visible `tool_result.content` as raw tool evidence.
3. Preserve `tool_use_result` as structured native evidence when present; do
   not invent a stable shape for it.
4. Map `is_error: true` to a failed tool call, not automatically to a failed
   adapter invocation. Claude may recover and emit `result/success`.

### Optional and version-dependent records

The `0.3.226` `SDKMessage` union also permits:

- `stream_event` partial assistant events when partial messages are enabled;
- `system` notices including `status`, `api_retry`, `compact_boundary`,
  `permission_denied`, `task_started`, `task_progress`, `task_updated`,
  `task_notification`, `background_tasks_changed`, `thinking_tokens`,
  `commands_changed`, `notification`, `files_persisted`, `memory_recall`, hook
  lifecycle messages, plugin installation, model-refusal fallback, mirror
  errors, informational messages, and conversation/session state changes;
- top-level `tool_progress`, `tool_use_summary`, `auth_status`,
  `rate_limit_event`, `prompt_suggestion`, and `conversation_reset` records.

These are an open, version-dependent surface. `RUN-04` should normalize only
the ratified v1 meanings below, preserve all recognized notices raw, and treat
an unknown discriminator as degraded evidence. The
[SDK changelog](https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md)
shows that result errors, status events, terminal reasons, task events, and
stream behavior change across patch releases, supporting an exact-version
policy rather than optimistic range matching.

`stream_event` is deliberately not required for v1. Invoke without
`--include-partial-messages`; completed `assistant` records are the semantic
source. If partial records appear, retain them as raw progress only and never
double-count their content alongside completed assistant messages.

## Proposed normalized mapping

These names are proposals for the future adapter owner, not public contracts.
SPI-01 does not add or widen `src/contracts/**`.

| Native evidence | Proposed normalized meaning | Availability/loss |
| --- | --- | --- |
| `system/init` | session/adapter started; adapter identity/version/model/capabilities | Lossless for selected non-secret fields; raw cwd/auth metadata must be minimized or redacted |
| assistant `text` | assistant text trajectory step | Lossless after redaction; content index retained |
| assistant `tool_use` | tool call started with ID/name/input | Lossless after redaction; execution timing unavailable |
| user `tool_result` | tool call completed/error, correlated by ID | Content is native evidence; structured result is tool-specific and version-dependent |
| several `tool_use` blocks in one assistant message | grouped/parallel-capable tool calls | Grouping lossless; actual parallel execution unavailable without timing evidence |
| assistant `error` | provider/model request error category | Category available; provider prose and retry cause may be version-dependent |
| `system/permission_denied` and terminal `permission_denials[]` | denied tool evidence | Terminal array is authoritative; advisory notice can race according to the published type comments |
| `system/compact_boundary` | context compaction notice | Trigger and token counts available; no v1 grader meaning |
| `rate_limit_event` | rate-limit notice | Subscription-specific and optional; never infer zero/none when absent |
| `result/success` | adapter completed with canonical final output | Protocol-complete when all prior records parse and tool calls correlate |
| error result subtype | adapter/target failure with native subtype | Lossless subtype; Provet taxonomy mapping depends on supervisor cause |
| `result.total_cost_usd` | cumulative estimated query cost in USD | Estimate, not billing statement |
| `result.usage` | main-agent-loop usage | Excludes Task subagents, sidechains, and auxiliary model calls according to published types |
| `result.modelUsage` | per-model query-pipeline usage and cost | Preferred accounting source; includes main loop, Task subagents, sidechains, and internal query-pipeline calls |
| `result.duration_*` | native provider/CLI duration provenance | Do not replace supervisor wall-clock latency |
| tool call for `Write`/`Edit` | workspace mutation intent | **Not** proof of file effects; actual diff unavailable from the stream |
| supervisor pre/post workspace manifest | added/deleted/modified/mode/symlink evidence | Authoritative workspace effect source; owned by `RUN-06` later |

### Ordering keys

The deterministic proposed key is:

```text
native stdout line number -> native content-block index -> normalized expansion index
```

Native UUIDs are correlation/provenance, not order. Provider timestamps are
display provenance, not order. Parallel completion must not reorder stored
semantic events. The raw sanitized stdout line stays attached to every mapped
event or to a bounded raw artifact reference.

## Cost and usage provenance

The `0.3.226` result type contains unusually important guidance:

- `total_cost_usd` is a cumulative **estimate** for the query call, not a
  billing statement.
- With streaming input, result totals are cumulative across turns. Read the
  latest result; do not sum result records.
- Resumed sessions start fresh and `/clear` resets the running total.
- `usage` describes the main agent loop only and excludes Task subagents,
  sidechains, and auxiliary calls.
- `modelUsage` is the preferred token/cost accounting source for the query
  pipeline, including Task subagents, sidechains, compaction, and workflow
  calls. It still excludes helper calls outside that pipeline.
- Crash/startup errors can expose zeroed native measures. Provet must not turn
  missing/untrusted cost into semantic zero; unknown remains `null` with a
  reason.

Store both the aggregate estimate and per-model breakdown with the installed
CLI version, native model keys, invocation role (`target` or `judge`), and
whether the terminal result was present. Never merge target and judge cost.

## Completion, degradation, and failure policy

```text
preflight executable/version/auth
        |
        v
capture stdout + stderr + process provenance
        |
        v
parse init -> assistant/user records -> result
        |
        +--> unknown version --------------------> unsupported (no billed run)
        +--> malformed/unknown/missing result ---> partial + protocol error
        +--> unmatched tool call/result ---------> partial trajectory
        +--> result/error_* ---------------------> complete failed invocation
        `--> result/success + coherent prefix ---> complete invocation
```

### Unsupported versions

1. Preflight `claude --version` before provider execution.
2. Require an exact allowlisted version. At the end of SPI-01 the allowlist is
   empty because live compatibility is unavailable; `2.1.226` is only a schema
   candidate.
3. Confirm the same version in `system/init`. A mismatch is protocol drift.
4. Reject unsupported versions before the billed prompt. Do not guess patch or
   minor compatibility.
5. Ignore unknown additive fields only inside recognized shapes on an exact
   reviewed version. Unknown event/content discriminators degrade trajectory
   evidence even if a later result says success.

### Partial trajectories

A stream is partial when any of these holds:

- stdout contains malformed JSON or a non-object record;
- a native discriminator/content block is unknown;
- no terminal result is observed;
- a tool result has no prior tool call;
- a tool call has no result when the stream terminates;
- the process exits or is killed before coherent terminal capture;
- capture truncation/overflow occurs.

Preserve the valid prefix and raw failure bytes. Final output may be available,
but trajectory graders must receive explicit unavailable/degraded capability,
not an ordinary false assertion. A complete native error result is a failed
invocation, not necessarily a partial protocol.

### Cancellation and signals

The published schema permits assistant `aborted: true` and result
`terminal_reason` values including `aborted_streaming` and `aborted_tools`.
Other terminal reasons include `max_turns`, `budget_exhausted`,
`malformed_tool_use_exhausted`, `prompt_too_long`, `model_error`, `api_error`,
`completed`, and setup/hook/deferred-tool outcomes.

The supervisor is authoritative for a user cancellation or timeout because a
terminal result may never arrive. Record:

- requested cancellation/timeout cause and time;
- graceful signal and forced-kill signal, if any;
- process exit code and terminating signal separately;
- whether a native result arrived and its terminal reason;
- whether any tool call remained unresolved;
- whether the workspace was retained and its post-state snapshot completed.

Do not hard-code Claude's SIGINT exit status from this spike; it was not
observed. The Provet CLI still maps an explicit cancellation through its own
normative exit contract after the supervisor reaps the process tree.

### Errors and limits

| Native evidence | Proposed classification |
| --- | --- |
| executable absent | adapter prerequisite error |
| auth preflight unavailable | adapter authentication prerequisite error; no provider run |
| assistant `authentication_failed`/`billing_error` | provider/adapter failure with native category |
| assistant `rate_limit`/`overloaded`/`server_error` | provider failure; retain any retry notices |
| `result/error_max_budget_usd` + `budget_exhausted` | configured budget limit; target incomplete/error, not semantic failure |
| `result/error_max_turns` + `max_turns` | configured turn limit; explicit incomplete/error |
| supervisor timeout | timeout even if Claude later emits a generic execution error |
| supervisor cancellation | cancelled even if no result or a generic execution error arrives |
| malformed/unknown stdout | adapter protocol error with valid prefix retained |
| nonzero exit after coherent error result | retain both; native result explains provider outcome, exit is process provenance |
| nonzero exit without coherent result | target/adapter process failure and partial trajectory |

## Workspace effects

The stream can show `Write`, `Edit`, or `Bash` intent and a tool result, but it
cannot prove the final filesystem tree. A hook, subprocess, symlink, or later
tool can change the same path. Therefore:

- run the CLI only in the unique trial workspace supplied by the future
  workspace owner;
- do not enable `--dangerously-skip-permissions`;
- use the narrowest allowed tool set and a noninteractive permission mode;
- snapshot the workspace before and after through `RUN-06` evidence;
- treat stream tool input/output as trajectory only;
- calculate additions, deletions, modifications, modes, and symlinks from the
  workspace manifests, not tool prose;
- never call a copied working directory a sandbox.

The workspace-edit replay fixture intentionally asserts only a `Write` tool
call and result. Its test verifies that the replay spike produces no fabricated
workspace-diff event.

## Replay fixtures and automated evidence

Fixtures live under
[`tests/fixtures/adapters/claude-code/`](../../tests/fixtures/adapters/claude-code/).

| Fixture | Purpose |
| --- | --- |
| `schema-derived-text.jsonl` | init, assistant text, success result, cost/usage |
| `schema-derived-tool.jsonl` | tool call/result correlation and final text |
| `schema-derived-parallel-tools.jsonl` | stable content order and ID correlation for grouped calls |
| `schema-derived-tool-error.jsonl` | failed tool distinct from successful adapter result |
| `schema-derived-budget-limit.jsonl` | typed result limit and terminal reason |
| `schema-derived-provider-error.jsonl` | assistant provider error followed by terminal failure |
| `schema-derived-cancellation.jsonl` | aborted tool plus terminal error; intentionally partial tool trajectory |
| `schema-derived-workspace-edit.jsonl` | edit intent without fabricated filesystem proof |
| `negative-malformed-line.jsonl` | malformed JSON after a valid init prefix |
| `negative-unknown-event.jsonl` | unknown event despite a later success result |
| `negative-partial-trajectory.jsonl` | EOF before a result |
| `negative-unsupported-version.jsonl` | exact-version rejection |

The test-only parser at
[`claude-code-replay-parser.ts`](../../tests/unit/adapters/claude-code/support/claude-code-replay-parser.ts)
is a spike, not production adapter code or a public contract. Tests cover raw
ordering, normalized expansion order, parallel correlation, error separation,
limits, cancellation, workspace evidence boundaries, malformed/partial input,
unknown events, and unsupported versions. Separate provenance and secret-scan
tests verify fixture inventory, hashes, evidence labels, spend, credentials,
identity strings, and user-home paths.

## Bounded live revalidation plan

Run this only after `claude auth status --json` exits `0` without login/account
mutation and the human-authorized aggregate cap remains USD 2 or lower. Capture
the status exit only; do not persist its JSON body.

Every invocation must use explicit argv, a disposable workspace, bounded
stdout/stderr, a timeout, a process group, no session persistence, and a
per-case `--max-budget-usd`. A conservative evidence budget is:

| Case | Per-case cap USD |
| --- | ---: |
| text with tools disabled | 0.05 |
| one read-only tool | 0.10 |
| two independent read-only tools | 0.15 |
| recoverable tool error | 0.10 |
| explicit max-turn or budget limit | 0.05 |
| cancellation of a bounded long action | 0.10 |
| one write in a disposable workspace | 0.15 |
| reserved retry for drift | 0.20 |
| **Maximum planned total** | **0.90** |

The external harness must stop scheduling when its accumulated native estimate
reaches USD 0.90 or any single case exceeds its cap. USD 2 is the absolute
assignment ceiling, not a spending target. Malformed and unsupported streams
remain offline replay cases.

For successful live captures:

1. Preserve raw stdout/stderr/process/workspace evidence outside the repository.
2. Redact secrets, host/user paths, account/organization data, session/message
   identifiers, prompts, outputs, and unstable timestamps with reviewed
   deterministic replacements.
3. Preserve line/content ordering and process-channel provenance.
4. Add a manifest entry with CLI/model/version/time, argv with sensitive values
   omitted, exit/signal, native cost, source hash, sanitized hash, and reviewer.
5. Re-run the fixture secret scan and inspect the byte diff.
6. Only then mark the exact CLI version supported in `RUN-04`/`REL-02` evidence.

## RUN-04 decision ledger

`RUN-04` should proceed with these decisions and no broader scope:

- construct explicit non-shell argv and preflight executable, exact version,
  and auth before a billed run;
- initially support no live version; use `2.1.226` only for deterministic schema
  replay until live evidence ratifies it;
- parse stdout incrementally as UTF-8 JSONL while preserving bounded sanitized
  raw lines and separate stderr/process provenance;
- order by native line, content index, and normalized expansion index;
- correlate tool calls/results by ID and keep tool failure distinct from query
  failure;
- treat `result.result` as canonical final output and assistant text as
  trajectory;
- use the latest cumulative result, retain `total_cost_usd`, `usage`, and
  `modelUsage` with their different scopes, and keep unknown measures `null`;
- let supervisor cause override ambiguous native cancellation/timeout reasons;
- fail closed on unsupported versions, malformed records, unknown
  discriminators, capture truncation, and partial trajectories;
- never infer filesystem effects from tool events; consume future `RUN-06`
  manifests;
- keep deterministic replay and opt-in live compatibility as separate gates.

## Sources

- [Claude Code CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage)
- [Claude Agent SDK TypeScript reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Anthropic cookbook raw SDK stream example](https://platform.claude.com/cookbook/claude-agent-sdk-07-hosting-the-agent)
- [Claude Agent SDK TypeScript repository](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Claude Agent SDK changelog](https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md)
- [Anthropic parallel tool-use guidance](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use)
