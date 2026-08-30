# ADR: Execution isolation and capability disclosure

- **Status:** Proposed — human security approval required
- **Roadmap node:** SPI-03
- **Date:** 2026-08-09
- **Decision owners:** Provet maintainers and designated human security reviewer

## Context

Provet runs AI-agent targets, command adapters, provider CLIs, judges, and
trusted custom TypeScript graders. These consumers do not have the same
privileges. A target may need a writable trial workspace and provider
credentials; a judge should receive redacted immutable evidence and a narrow
verdict contract; a custom grader is trusted repository code in v1.

The v1 product is local-first. That property says where execution and data live;
it does not establish host containment. A copied current working directory,
minimal child environment, process group, timeout, or output ceiling can reduce
accidental damage but cannot stop a process running as the current user from
using that user's filesystem and network capabilities. The SPI-03 process
escape probe also demonstrates that a child can create a new session and
outlive termination of the original process group.

The repository standard requires an ADR before changing process isolation,
workspace retention, path trust, secret handling, or redaction. This ADR records
the proposed boundary for downstream design. It does not implement or approve a
production supervisor, workspace lifecycle, or public configuration schema.

## Decision proposal

### 1. Use explicit capability profiles

The threat-model label `unsafe-local` means the subprocess runs as the current
host user without a containment claim. Any future container-backed profile is a
different capability and may be advertised only after the evidence and approval
gate below passes.

FND-02 owns the eventual public DTO, schema, and CLI representation. Whatever
names it ratifies must retain these semantic distinctions:

- profile selection is explicit and machine-readable;
- unsupported profiles fail before any subprocess starts;
- requesting isolation never downgrades to `unsafe-local`;
- requesting enforced network denial never uses a profile that cannot enforce
  it; and
- target, judge, and grader consumers receive independently limited capability
  sets.

### 2. Label local process bounding accurately

`unsafe-local` execution must use:

- an explicit executable and argv with `shell: false` by default;
- ignored stdin unless the adapter contract explicitly supplies bounded input;
- a fresh, consumer-specific minimal environment;
- an owner-only unique trial workspace;
- a combined stdout/stderr byte ceiling;
- a timeout and cancellation signal;
- a new process group with graceful then forced group termination; and
- typed outcomes that distinguish completion, target error, timeout,
  cancellation, output limit, signal, and forced termination.

These are process-bounding controls, not sandboxing. Human and machine output
must identify the profile as `unsafe-local` and disclose that host filesystem,
network, and new-session process escape remain possible.

An opt-in shell command, if the product contract later retains it, is a separate
unsafe capability. It must never be inferred from a command string or used by
provider presets that can pass explicit argv.

### 3. Make stronger isolation fail closed

A container-backed profile cannot be exposed merely because a `docker` binary
is present. Before spawn, it must verify the selected runtime and every required
control. Missing or unverifiable controls produce a typed security error and no
execution.

The minimum container contract is:

- one trial per container or equivalently isolated runtime lifecycle;
- only the trial workspace mounted read-write;
- fixture source, repository, home directory, provider configuration stores,
  SSH agents, Docker socket, host sockets, devices, and unrelated paths absent;
- read-only container root filesystem plus bounded private temporary storage;
- non-root user, dropped capabilities, no privilege escalation, and a reviewed
  seccomp/runtime policy where supported;
- CPU, memory, process-count, writable-disk, timeout, and output limits;
- default no network; explicit network enablement disclosed and enforced;
- runtime-owned cleanup of all descendants, including new sessions; and
- platform/version provenance recorded without secrets.

Rootful Docker daemon access is a high-trust boundary. The daemon socket must
never be mounted into a trial container. A rootless runtime is preferable but
still requires the same evidence; its label alone is not proof that mounts,
network, credentials, or lifecycle are safe.

### 4. Allow only named environment and credential capabilities

Each invocation receives a new environment built from fixed safe values and an
explicit allowlist. Production code must not clone `process.env` and delete
known-dangerous keys. `PATH`, `HOME`, proxy variables, language/runtime loader
variables, cloud profiles, and provider settings are absent unless the
consumer's ratified contract names them.

Secret values:

- are referenced by name in configuration and resolved only for the invocation
  that needs them;
- are never passed in argv;
- are registered with shared redaction before spawn or request;
- are not copied into fixtures, workspaces, run storage, diagnostics, reports,
  HTML, or retained evidence; and
- cannot be shared from a target capability into a judge capability or the
  reverse.

Host session stores or keychain files must not be mounted or copied into a
container merely to make provider authentication convenient. If a provider
cannot authenticate through an explicitly approved ephemeral mechanism, that
provider/profile combination is unsupported and fails closed.

### 5. Treat workspace copies as integrity boundaries only

Every trial receives a unique, permission-restricted copy of its declared
fixture. Parallel trials never share a mutable workspace. Provet's copy, diff,
retention, and cleanup operations must canonicalize paths after symlink
resolution, reject traversal and unsupported special files, and avoid following
outbound links.

This protects source fixture integrity only to the extent the execution profile
prevents another route to the source. Under `unsafe-local`, the subprocess can
still discover and mutate host paths available to the current user. Product
documentation and diagnostics must say so.

RUN-06 must resolve time-of-check/time-of-use behavior for copy, diff, and
cleanup before claiming race-resistant workspace integrity. The SPI-03
canonical-path prototype covers existing-path evidence only.

### 6. Default to cleanup; make retention explicit and sensitive

Normal completion cleans the temporary workspace. Failed or interrupted
workspace retention may be offered only through a deliberate documented policy
owned by a later roadmap node. Retention must:

- be selected before execution rather than triggered by untrusted output;
- retain only the affected trial workspace;
- preserve owner-only permissions;
- report a normalized/redacted path, retention reason, sensitivity warning,
  and cleanup responsibility;
- remain subject to future age/count/disk bounds; and
- never turn retained storage into a trusted or unredacted sink.

SPI-03 does not choose a CLI flag, default retention duration, or scavenging
schedule.

### 7. Redact before persistence and reporting

One shared redaction boundary applies to command, target, judge, grader, event,
diagnostic, report, HTML, snapshot, diff, and retained-workspace disclosures.
Redaction occurs before persistence and before a reporter receives data.

It must cover registered values, authorization headers, common credential
formats, sensitive structured provider fields, and chunk boundaries. A stable
marker such as `[REDACTED]` preserves field presence. If redaction cannot
determine a safe representation, the affected sink is suppressed and the
operation returns a typed security error. Machine output is not a trusted sink.

The production redaction implementation and its adversarial tests belong to
downstream contract/authoring work; the rule is fixed here so no adapter can
bypass it.

### 8. Separate network capability from adapter identity

Discovery, schema, authoring dry-runs, and validation are offline. An explicit
HTTP target or judge has a configured remote destination, but that destination
does not imply a general provider CLI is technically restricted to one host.

- `unsafe-local` cannot enforce network denial and must disclose that fact.
- A container-backed profile begins with no network.
- Enabling container network is explicit, machine-readable, and disclosed.
- A destination claim requires an independently tested egress control that
  accounts for DNS, redirects, proxies, localhost, metadata endpoints, and
  sockets. Without that control, output may identify the intended provider but
  must state that arbitrary egress is possible.

### 9. Keep custom graders trusted and unsandboxed in v1

Custom TypeScript graders are repository code executed with host privileges in
v1. Help, capability output, validation diagnostics, and run disclosures must
not call them sandboxed. Agents should inspect new grader code before execution.

A target container does not constrain a host-loaded custom grader. Sandboxing
grader code would be a separate public/security decision and is not approved by
this ADR.

## Capability decision matrix

| Requested condition | `unsafe-local` result | Future container result |
| --- | --- | --- |
| Host isolation required | Reject before spawn | Run only after approved control verification |
| Network denied | Reject as unenforceable | Run with verified no-network configuration |
| Network allowed | Run with arbitrary-egress disclosure | Run with enabled-network disclosure; destination enforcement only if proved |
| Named credential unavailable | Reject before spawn | Reject before container creation |
| Unknown environment key | Reject validation/planning | Reject validation/planning |
| Workspace path escapes after canonicalization | Security/workspace error | Security/workspace error |
| Output ceiling exceeded | Terminate group; truncated output-limit result | Terminate container; truncated output-limit result |
| Timeout/cancellation | Graceful then forced group kill; escape limitation disclosed | Graceful then forced container cleanup; descendants must be proved gone |
| Runtime unavailable | Local profile remains available only if explicitly selected | Reject; never downgrade |
| Custom grader present | Trusted unsandboxed disclosure | Same disclosure unless a separate grader isolation decision exists |

## Alternatives considered

### Call every copied-cwd run sandboxed

Rejected. A cwd is an organization boundary, not an access-control boundary.
The subprocess retains the current user's host capabilities and can use absolute
paths, the network, and escaped descendants.

### Rely only on process groups

Rejected as an isolation strategy. Process groups are still required for
best-effort cleanup, but the SPI-03 new-session fixture escapes the group and
writes its marker after timeout.

### Forward the ambient environment and redact later

Rejected. Redaction cannot revoke a credential already disclosed to a child and
cannot enumerate every secret-bearing variable or loader behavior. Environments
must be constructed from an allowlist.

### Mount host CLI authentication stores read-only into containers

Rejected as the default. Read-only access still permits credential theft and
may expose durable refresh/session material. SPI-03 did not validate provider
authentication in a container, and convenience is insufficient to widen the
credential boundary.

### Require containers for all v1 execution

Not adopted by this spike. The observed Docker daemon was unavailable, Claude
was unauthenticated, and Codex used host ChatGPT authentication. Requiring a
container now would assert unproved portability and authentication behavior and
could block the local-first product loop. A human may ratify a supported
container profile after the evidence gate, while `unsafe-local` remains clearly
labelled.

### Sandbox custom graders as part of SPI-03

Rejected as out of scope and inconsistent with the v1 product contract. V1
graders remain trusted repository code; changing that boundary requires a
separate ADR and implementation node.

## Consequences

Positive:

- users and agents can distinguish process bounding from host containment;
- downstream contracts have explicit no-downgrade and least-capability rules;
- target and judge adapter reuse cannot silently merge privileges;
- provider-auth inconvenience cannot justify mounting durable host credentials;
- process escape, network, retention, and custom-grader risks remain visible;
  and
- later container evidence can strengthen one profile without changing the
  meaning of `unsafe-local`.

Costs and limitations:

- some requested runs will fail closed instead of falling back to a convenient
  local process;
- a minimal environment may require provider-specific allowlist work;
- general CLI-provider egress may be disclosable but not destination-enforceable
  without additional infrastructure;
- cross-platform container and process cleanup evidence adds release work;
- secure provider authentication inside containers may remain unsupported; and
- `unsafe-local` is unsuitable for hostile targets or graders.

## Downstream requirements

- FND-02 must ratify the public capability ownership and labels without widening
  these trust boundaries.
- RUN-01 must keep target and judge request ports capability-limited.
- RUN-02 may use the spike as evidence but must implement a reviewed production
  supervisor rather than export or depend on spike code.
- RUN-03 through RUN-05 must document provider-specific argv, environment,
  credential, network, and cancellation requirements.
- RUN-06 must implement race-resistant fixture copy, diff, cleanup, and any
  retention policy.
- EXE-05 and STO-01 must preserve distinct timeout/cancellation/security states
  and redaction-before-persistence.
- REL-01 must include adversarial process/workspace/redaction coverage; live
  runtime/provider evidence remains a separate gate.

No downstream node may cite the SPI-03 deterministic suite as proof that its
production implementation or a live provider is safe.

## Evidence

Deterministic spike command:

```sh
bun test tests/security
```

The suite covers explicit argv, minimal environment, combined bounded capture,
normal success, nonzero exit, spontaneous signal, typed spawn failure,
same-group fork cleanup, new-session escape, timeout/cancellation and forced
termination, traversal, outbound/internal symlinks, owner-only temp mode, and
terminal controls. Detailed claims and exclusions are in the
[execution threat model](../security/threat-model.md). Docker/provider findings
are in the [Docker feasibility record](../security/docker-feasibility.md).

## Human approval gate

This ADR must remain **Proposed** until a human security reviewer examines the
threat model, repeats the applicable evidence, and chooses the v1 isolation
claim. Automation, an implementation agent, or passing deterministic tests
cannot approve it.

The reviewer must record the decision in a follow-up change:

| Field | Required value |
| --- | --- |
| Decision | Approve, approve with conditions, or reject |
| Approved profiles | Exact claim for each profile |
| Reviewer | Human identity or accountable team |
| Date | ISO 8601 date |
| Evidence | macOS/Linux/runtime/provider evidence references |
| Conditions/expiry | Version bounds, unresolved gaps, and re-review triggers |

Until that record exists, Provet has no approved isolation claim. The accurate
SPI-03 conclusion is: bounded spike mechanics work for selected effects,
`unsafe-local` remains uncontained, and container isolation/authentication is
unverified.
