# Provet v1 execution threat model

Status: SPI-03 review draft; no isolation claim is approved.

Scope: subprocesses, credentials, trial workspaces, captured output, network
access, retained workspaces, and trusted custom graders.

Out of scope: implementing the production supervisor or workspace lifecycle.

## Security conclusion

Changing a process's current directory does not sandbox it. A subprocess run as
the current user can normally read and write everything that user can, reach the
network, inspect other processes where the host permits it, and create a new
session that escapes a process-group kill. Provet must label this capability
profile `unsafe-local` and must not describe a copied working directory,
minimal environment, timeout, or process group as isolation.

A future container-backed profile may make a narrower claim only after its
filesystem mounts, credentials, network, resource bounds, process cleanup, and
supported macOS/Linux behavior pass deterministic and reviewed live probes.
SPI-03 did not pass that gate because the available Docker client could not
connect to a daemon. No production execution profile is approved by this
document.

## Security objectives

Provet's execution boundary should:

1. never grant a target, judge, or grader a capability that was not explicitly
   selected for that consumer;
2. never silently replace a requested isolation capability with
   `unsafe-local`;
3. keep fixture sources and the repository unchanged by trial execution;
4. avoid forwarding ambient credentials or unrelated environment variables;
5. bound time, captured output, mutable disk, and process lifetime;
6. redact before persistence and before any reporter sees data;
7. make unavoidable trust and network exposure visible before execution; and
8. retain failed workspaces only by explicit policy and disclose their path and
   sensitivity.

The following are not security objectives for `unsafe-local`:

- preventing host filesystem access available to the invoking user;
- preventing arbitrary outbound network connections;
- containing a process that creates a new session or uses another host process
  as an execution deputy;
- safely executing hostile custom TypeScript graders; or
- protecting the host from an intentionally malicious local target.

## Assets and principals

### Assets

- source fixtures, repository files, Git metadata, and uncommitted work;
- provider tokens, API keys, browser/keychain sessions, SSH material, cloud
  configuration, and Docker credentials;
- case inputs, target and judge prompts, trajectories, grader reasoning, and
  outputs;
- run events, reports, snapshots, workspace diffs, and retained workspaces;
- host availability: CPU, memory, disk, process table, file descriptors, and
  terminal state; and
- correctness of pass/fail, interruption, truncation, cost, and provenance
  records.

### Principals

- the human or coding agent invoking `vet`;
- the Provet orchestrator and its effect adapters;
- the target process or HTTP endpoint;
- the judge process or HTTP endpoint;
- a custom TypeScript grader, which is trusted repository code in v1;
- the container runtime and daemon when a future container profile is used;
- the host operating system and current user account; and
- fixture, prompt, trajectory, and subprocess output authors, all of whose
  content is untrusted for path and rendering purposes.

## Trust boundaries

```text
host user account
|
+-- vet orchestrator -------------------- run storage / reporters
|      |                                      ^
|      | redaction must happen first --------+
|      |
|      +-- unsafe-local subprocess --X-- no host containment claim
|      |         |
|      |         +-- unique copied cwd (organization, not sandboxing)
|      |
|      +-- future container runtime -- unapproved isolation boundary
|      |         |
|      |         +-- explicit mounts, env, network, resources required
|      |
|      +-- explicit HTTP destination -------- remote trust boundary
|
+-- trusted custom grader ---------------- no v1 sandbox claim
```

The workspace-copy boundary protects fixture integrity only if paths are
canonicalized and the subprocess lacks another route back to the source. Under
`unsafe-local`, the process still has that route through absolute paths or
filesystem discovery, so the copy is not a host-security boundary.

## Capability profiles

These labels describe threat-model profiles, not a ratified CLI or schema
surface. FND-02 must own any public representation.

| Capability | `unsafe-local` | Future container-backed profile |
| --- | --- | --- |
| Working directory | Unique owner-only copied workspace | Unique owner-only workspace mounted read-write |
| Host filesystem | Current user's full ambient access remains | Only explicit mounts; no home, repo, sockets, or device mounts |
| Environment | Explicit allowlist, but other host discovery remains possible | Explicit allowlist and named secret injection only |
| Process lifetime | Best-effort process-group termination | Container/cgroup lifecycle plus in-container reaping |
| Process escape | New sessions and host deputies can escape | Must prove container/cgroup descendants are removed |
| Network | Host network remains available | Default deny; explicit enablement and disclosure required |
| Credentials | Named values may be passed; host stores remain reachable | No host credential mounts; named ephemeral delivery only |
| Resource bounds | Timeout and captured-output bounds only | CPU, memory, process, disk, and output bounds required |
| Isolation claim | None; explicitly unsafe | Blocked until platform evidence and human approval |
| Custom graders | Trusted and unsandboxed | Still trusted unless a separate grader boundary is approved |

## Threat enumeration and required controls

### Host filesystem

Threats:

- a target reads the repository, home directory, SSH keys, cloud profiles,
  browser data, provider configuration, or other trial workspaces;
- a target writes outside its trial workspace through an absolute path,
  traversal, symlink, hard link, bind mount, device file, or race;
- a target mutates the source fixture or repository after discovering its
  absolute path;
- a diff walker follows an outbound symlink and captures host files; and
- cleanup resolves a replaced path and removes data outside the workspace.

Required rules:

- canonicalize the declared fixture and every existing path after symlink
  resolution; reject traversal and outbound links;
- copy without following outbound symlinks and reject device nodes, sockets,
  FIFOs, and unsupported special files;
- create one owner-only workspace per trial; never share mutable state across
  parallel trials;
- walk diffs with `lstat` semantics and record symlinks without following them;
- bind cleanup to a verified directory identity, not an untrusted string that
  can be replaced; and
- disclose that these controls protect Provet's own file operations but do not
  contain an `unsafe-local` subprocess.

### Workspace traversal and symlinks

Threats:

- `../` segments resolve outside the fixture root;
- an apparently internal symlink resolves outside after canonicalization;
- a path is checked and then swapped before copy, execution, diff, or cleanup;
- a dangling link becomes external later; and
- a case supplies an absolute path while the caller assumes it is relative.

Required rules:

- resolve against the owning document, canonicalize the trusted root and the
  existing candidate, and compare path components rather than string prefixes;
- reject absolute case paths unless a separately reviewed contract explicitly
  permits them;
- fail closed on missing, dangling, racing, or unsupported file types;
- use descriptor-relative or equivalent race-resistant operations in the
  production workspace implementation; and
- never let `--force` bypass containment.

The spike proves basic canonical traversal and symlink rejection. It does not
solve time-of-check/time-of-use races; RUN-06 must do so before making integrity
claims.

### Environment and credentials

Threats:

- forwarding `process.env` exposes provider keys, session tokens, proxy
  credentials, cloud configuration, CI secrets, and dynamic-loader controls;
- `PATH`, `HOME`, language/runtime variables, or plugin search paths cause an
  unintended executable or credential store to be loaded;
- secrets appear in argv, `/proc`-style process metadata, errors, output,
  snapshots, retained workspaces, or reports;
- a target steals a judge credential or one judge receives another judge's
  credential; and
- an authorization failure echoes the invalid value.

Required rules:

- construct a fresh environment from a consumer-specific allowlist; do not
  clone and delete from the ambient environment;
- pin locale and no-prompt behavior; resolve executables deliberately rather
  than trusting an unreviewed `PATH`;
- deliver only explicitly named credentials required by that invocation and
  never place secret values in argv;
- keep target and judge credential capabilities separate despite their shared
  adapter family;
- register configured secret values and sensitive provider fields with the
  redactor before invocation; and
- on redaction uncertainty, suppress the affected output and return a security
  error.

The synthetic environment probe reports only presence and confirms that an
ambient secret and `HOME` are absent from an explicit child environment. It
does not prove that a local process cannot read credentials through filesystem
or operating-system facilities.

### Network

Threats:

- a local command exfiltrates prompts, credentials, repository files, or run
  data to an arbitrary destination;
- provider CLIs contact endpoints beyond the configured logical provider;
- proxy variables redirect traffic or leak proxy credentials;
- DNS, redirects, localhost services, metadata endpoints, or Unix sockets
  bypass a hostname allowlist; and
- a supposedly offline command unexpectedly performs update checks or telemetry.

Required rules:

- discovery, schema, authoring dry-run, and validation remain offline;
- `unsafe-local` must disclose that network denial is unenforced;
- HTTP adapters identify their configured destination in redacted provenance,
  reject unrelated environment forwarding, and apply explicit redirect and
  response-size policy;
- a future isolated profile starts with no network and fails closed when a
  requested provider needs unavailable connectivity; and
- enabling network must disclose that a general CLI agent can make connections
  beyond the configured provider unless an independently verified egress
  control enforces destinations.

### Process tree and host availability

Threats:

- a child forks descendants that keep running after the leader exits;
- a child creates a new process group/session and escapes negative-PID signals;
- a child ignores graceful termination or leaves zombies;
- a target spawns many processes, consumes CPU/memory/disk/file descriptors, or
  holds output pipes open;
- timeout and cancellation race with normal exit and produce a false completed
  record; and
- PID reuse causes a late signal to hit an unrelated process.

Required rules:

- spawn with an explicit executable and argv, `shell: false`, ignored stdin,
  explicit cwd/environment, and a new process group;
- stop scheduling on cancellation, send graceful termination to the group,
  wait a bounded grace period, send forced termination, and reap before return;
- use one combined bounded byte budget for stdout/stderr and stop the process on
  overflow;
- record whether the outcome was completed, timed out, cancelled, output
  limited, signalled, or force-killed without collapsing states; and
- do not claim that process groups enforce containment. A stronger profile must
  use a runtime-owned lifecycle such as a container/cgroup and prove cleanup.

The forked-child probe shows same-group cleanup. The escaped-session probe shows
the exact counterexample: its marker is written after the supervised group is
terminated. This is expected evidence that `unsafe-local` is not isolation.

### Shell and executable resolution

Threats:

- prompt or case text becomes shell syntax through interpolation;
- an executable name resolves to an attacker-controlled path;
- a command adapter's documented shell mode is mistaken for the safer default;
  and
- arguments containing newlines or option-like prefixes alter a provider CLI's
  meaning.

Required rules:

- all default invocations use explicit argv and no shell;
- input is carried through a documented data channel rather than interpolated
  into executable text;
- executable resolution and provider-owned option boundaries are explicit; and
- any future opt-in shell capability is a separate unsafe capability with an
  exact command disclosure and must never be inferred from a string.

The argv probe passes shell metacharacters literally and proves that no marker
file is created. It does not validate provider-specific option-injection
boundaries, which belong to the adapter spikes and RUN-03 through RUN-05.

### Captured output and terminal injection

Threats:

- unlimited stdout/stderr exhausts memory or disk;
- ANSI/OSC sequences change colors, titles, clipboard contents, or terminal
  state;
- carriage returns, backspaces, newlines, and bidirectional controls forge or
  reorder diagnostics;
- invalid UTF-8 or split multibyte sequences corrupt reporting; and
- truncation hides the security-relevant suffix while appearing complete.

Required rules:

- count raw bytes across stdout and stderr before decoding; store no more than
  the configured combined ceiling;
- stop the process on overflow and record `truncated`, original-known byte
  counts, and the output-limit outcome;
- decode with a defined UTF-8 error policy and escape C0, C1, OSC/ANSI introducers,
  carriage returns, and bidirectional controls before human terminal display;
- keep machine serialization valid and never pass raw untrusted output to a TTY;
  and
- do not call a truncated trajectory complete or grade it as ordinary output.

The huge-output probe caps retained bytes. The terminal probe makes ANSI, OSC,
bell, carriage-return, newline, and bidirectional controls visible before
display. The spike sanitizer is evidence, not the production reporter API.

### Temporary directories and retained workspaces

Threats:

- other local users read a workspace before cleanup;
- a crash leaves prompts, outputs, generated credentials, or repository
  material in temporary storage;
- a retained path leaks usernames or secret-derived names in output;
- cleanup deletes retained evidence or retention silently disables cleanup; and
- disk exhaustion turns retention into a denial of service.

Required rules:

- create temporary roots atomically with owner-only `0700` permissions and
  create files no broader than `0600` unless fixture semantics require an
  executable bit;
- clean on ordinary completion; define crash-startup scavenging separately;
- retain only through an explicit documented option/policy, never implicitly;
- report a normalized/redacted retained path, reason, sensitivity warning, and
  cleanup responsibility;
- apply disk/age/count bounds before a release claim; and
- never retain injected credential material by design.

SPI-03 proves owner-only directory mode on the supported POSIX host. It does
not implement retention or cleanup policy.

### Redaction and persistence

Threats:

- a secret reaches an event, diagnostic, report, HTML file, snapshot, diff,
  fixture, log, or PR artifact before redaction;
- encoding, chunk splitting, structured nesting, or derived authorization
  headers bypass literal matching;
- redaction destroys field identity, making absence indistinguishable from
  concealment; and
- a reporter or grader retains an unredacted reference.

Required rules:

- perform shared structural and byte/string redaction before persistence and
  before constructing any reporter view;
- cover registered secret values, authorization headers, common credential
  forms, and provider-declared sensitive fields across chunk boundaries;
- use a stable marker such as `[REDACTED]` and retain non-sensitive field shape;
- never include a secret value in an error; name only its variable and config
  pointer; and
- fail closed for the affected sink if redaction cannot provide a complete
  answer.

Machine mode, retained workspaces, and local files are not trusted sinks.

### Custom graders and judges

Threats:

- custom TypeScript grader code reads or changes arbitrary host files, starts
  processes, uses the network, or exfiltrates evidence;
- a judge receives writable workspace access or target credentials it does not
  need;
- prompt injection in the trajectory causes a judge adapter to invoke tools;
  and
- a judge's reasoning repeats secrets into persisted output.

Required rules:

- disclose before invocation that v1 custom graders are trusted repository
  code and not sandboxed;
- agents should inspect new grader code before running it;
- judges receive redacted immutable evidence and a constrained verdict schema,
  never the target's mutable workspace or tool capabilities by default;
- judge credentials are consumer-specific and judge output is redacted before
  persistence; and
- grader error remains distinct from an assertion failure.

Containerizing a target does not make a host-loaded custom grader safe.

## Fail-closed capability rules

Downstream contracts must preserve these rules:

1. Every invocation plan names the capabilities it requires: host filesystem
   profile, network state, environment keys, credential references, writable
   workspace, executable, timeout, output ceiling, and retention policy.
2. Unknown capability names, unsupported combinations, invalid bounds, missing
   isolation runtimes, and unavailable credentials fail before spawn.
3. A request for isolation never falls back to `unsafe-local`.
4. A request for no network never runs in a profile that cannot enforce it.
5. A target request cannot inherit judge capabilities, and a judge request
   cannot inherit target workspace/tool capabilities.
6. Path canonicalization, redaction registration, and workspace creation finish
   before the first subprocess or network effect.
7. Redaction uncertainty blocks the affected persistence/reporting sink.
8. Retention is opt-in and cannot be activated by subprocess output or exit
   status alone.
9. Custom graders require the explicit trusted-code disclosure; they are not
   represented as sandboxed.
10. Security-boundary failures remain typed security/workspace outcomes and do
    not become ordinary eval failures.

## Required disclosures

Before a run, human and machine output must make these facts inspectable without
exposing secret values:

- execution profile and whether host containment is enforced;
- requested network state and, for explicit HTTP, the redacted destination;
- names of environment variables/credential references made available, never
  their values;
- writable workspace scope and whether the repository/source fixture remains
  reachable under the chosen profile;
- timeout, output, and other effective resource bounds;
- retained-workspace policy and cleanup responsibility; and
- whether trusted unsandboxed custom grader code will execute.

Warnings are not substitutes for fail-closed enforcement where a capability is
claimed.

## Adversarial evidence

Run the deterministic SPI-03 suite with:

```sh
bun test tests/security
```

| Threat | Probe | Observed result | Meaning |
| --- | --- | --- | --- |
| Shell injection | explicit argv metacharacters | marker absent; argument preserved | no shell interpretation in spike |
| Secret inheritance | synthetic ambient secret and `HOME` | both absent | explicit environment is minimal |
| Huge output | 8 KiB producer, 512-byte combined bound | exactly 512 bytes retained; output-limit | capture is bounded |
| Forked child | inherited process group | child marker absent after timeout | group termination reaches same-group child |
| Process escape | child starts new session | escaped marker present after timeout | `unsafe-local` is not isolation |
| Forced termination | SIGTERM-ignoring process | SIGTERM then SIGKILL; cancelled | grace and escalation are distinguishable |
| Traversal | `../external/secret.txt` | rejected after canonicalization | basic existing-path traversal blocked |
| Symlink escape | internal link to external directory | rejected after canonicalization | basic outbound link blocked |
| Internal symlink | link remains within root | canonical path accepted | containment is component-based |
| Temp permissions | created workspace | POSIX mode `0700` | owner-only directory proved on host |
| Terminal injection | ANSI/OSC/bell/CR/newline/bidi bytes | controls rendered visibly | raw controls need not reach a terminal |

These probes use only synthetic values and temporary paths. The passing suite is
not proof of container isolation, race-free copying/cleanup, provider
compatibility, network denial, redaction completeness, or production readiness.

## Release-blocking evidence and human decision

Before any v1 isolation claim is approved, a human security reviewer must
confirm all of the following with current macOS and Linux evidence:

- the public capability/profile contract and no-downgrade behavior;
- container daemon/runtime availability and rootless/rootful trust implications;
- exact read-only/read-write mounts, no Docker socket, no host home or provider
  credential-store mounts, and read-only container root filesystem;
- default-deny network behavior and the disclosure for any enabled network;
- CPU, memory, process-count, disk, timeout, output, and process-tree bounds;
- container exit removes forked/new-session descendants and reaps children;
- provider authentication can be supplied without copying durable host session
  stores into the workspace or run artifacts;
- workspace copy/diff/cleanup resists symlink and replacement races;
- redaction covers every persistence and reporter sink; and
- custom graders remain labelled trusted and unsandboxed.

Approval must be recorded in the execution-isolation ADR. Until then, the only
accurate claim is that spike mechanics bound selected effects while local
execution remains explicitly unsafe.
