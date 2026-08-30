# SPI-03 Docker isolation and authentication feasibility

Status: incomplete live evidence; isolation gate failed closed.

Observed: 2026-08-09 on an arm64 macOS host.

Purpose: read-only feasibility check, not production compatibility evidence.

## Guardrails used

The probe did not:

- start Docker Desktop or another daemon;
- pull or run an image;
- create a container, network, volume, context, or credential;
- invoke `docker login` or alter any provider account;
- copy, mount, print, or decode authentication material;
- install or update system software; or
- modify Docker, Claude Code, or Codex configuration.

Only version/status commands and credential-file presence/permission metadata
were inspected. Secret values and registry/account identifiers were not read.

## Read-only observations

| Item | Observation | Security meaning |
| --- | --- | --- |
| Host | Darwin 25.2.0, arm64 | One supported host family; Linux remains untested |
| Bun | 1.3.9 | Meets the repository's supported runtime floor |
| Docker client | 26.1.4 | Client presence alone does not prove container capability |
| Docker context | `default` | No claim about the backing daemon or VM |
| Docker daemon | Unavailable at the configured Unix socket | No container, mount, network, resource, or cleanup probe was possible |
| Docker config | `$HOME/.docker/config.json` absent | No Docker registry-auth path was available to test |
| Claude Code | 2.1.226; auth status reported not logged in | Authenticated container invocation cannot be tested |
| Codex CLI | 0.146.0; status reported ChatGPT login | Host auth exists, but container use was not attempted |
| Codex auth store | `$HOME/.codex/auth.json` present with owner-only `0600` permissions | Mounting/copying it would disclose durable host auth and is not approved |
| Claude credential file | Conventional credential file absent | File absence does not rule out keychain or other auth mechanisms |

The Codex command also emitted a warning that it could not create PATH aliases
under the restricted probe environment. This is an environment/tooling
limitation, not evidence about provider execution or isolation.

## Commands used

The following command families were invoked read-only:

```sh
bun --version
node --version
pnpm --version
uname -srm
command -v docker
command -v claude
command -v codex
docker version --format 'client={{.Client.Version}}'
docker context show
docker info --format '<selected non-secret platform/security fields>'
claude --version
claude auth status
codex --version
codex login status
```

Filesystem checks tested only whether conventional config/auth paths existed
and their permission bits. Their contents were not emitted.

## Feasibility comparison

| Question | Explicitly labelled `unsafe-local` | Future Docker-backed execution |
| --- | --- | --- |
| Can a process start on the observed host? | Spike subprocesses started successfully | Not tested; daemon unavailable |
| Is cwd copying host isolation? | No | A mount can form part of isolation only with all other host paths absent |
| Can same-group descendants be terminated? | Yes in the synthetic probe | Not tested |
| Can a new-session child escape lifecycle cleanup? | Yes; demonstrated | Container/cgroup cleanup must prove it cannot survive container removal |
| Can host filesystem access be denied? | No | Potentially, with exact mounts and runtime policy; unverified |
| Can arbitrary network be denied? | No | Potentially with `--network none`; unverified on this runtime |
| Are CPU/memory/process/disk bounds available? | Only timeout/output were spiked | Docker exposes mechanisms, but configuration/enforcement is unverified |
| Can Claude authenticate safely? | Not on this host; CLI reported logged out | Not testable |
| Can Codex authenticate safely? | Host ChatGPT session exists | Not testable without exposing or replacing host auth |
| Is mounting host auth read-only acceptable? | Not applicable | No; read-only still permits credential theft |
| Can Provet claim sandboxing now? | No | No; evidence gate is incomplete |

## Authentication analysis

Provider authentication inside a container is feasible only if the provider
supports a bounded, explicitly approved delivery mechanism. Acceptable evidence
would need to show all of the following without storing credentials in the
workspace or run artifacts:

1. Provet resolves a named credential just before container creation.
2. Only the intended adapter receives it.
3. The value is not present in argv, image layers, fixture copies, reports,
   retained workspaces, or Docker inspect output available to unrelated users.
4. The container cannot read the host provider configuration directory,
   keychain, agent socket, home directory, or Docker socket.
5. Revocation/expiry and provider errors do not echo the value.
6. Redaction is registered before any provider output is processed.
7. Container removal makes the delivery artifact unavailable.

The observed Codex login uses host ChatGPT authentication and an owner-readable
host auth file exists. Copying or mounting that durable file would widen the
container's privileges and is rejected by the proposed ADR. The observed Claude
CLI is not logged in. Therefore neither provider has passed container-auth
feasibility.

An environment token may eventually be testable for providers that officially
support one, but SPI-03 did not read host credential values, create tokens, or
attempt provider login. No token mechanism is approved by inference.

## Isolation evidence still required

A later read-only planning review and explicitly authorized live test must pin
the runtime/version and prove:

- daemon trust model and whether operation is rootless or rootful;
- exact container create/run arguments without a shell;
- non-root user, dropped capabilities, no privilege escalation, and reviewed
  syscall/runtime policy;
- read-only root filesystem and bounded private temporary storage;
- only the trial workspace mounted read-write;
- repository, fixture source, home, provider stores, sockets, agents, devices,
  and Docker socket absent;
- default-deny network and explicit disclosure for enabled network;
- CPU, memory, process-count, writable-disk, output, and time limits;
- timeout/cancellation removes same-group, forked, and new-session descendants;
- symlink/traversal/device fixtures cannot expand mounts or diff scope;
- supported behavior on both macOS and Linux; and
- provider authentication that does not expose durable host session material.

Image identity must be pinned and provenance recorded. A successful `docker run`
or `docker info` alone would not satisfy this matrix.

## Result

Docker-backed execution is **unverified and unavailable for an isolation claim**
on the observed host. The production design must fail closed when such a profile
is requested and the runtime or any required control cannot be verified. It
must not fall back to `unsafe-local`.

The only currently evidenced comparison is:

- `unsafe-local`: explicit argv, minimal environment, output/time bounds,
  process-group cleanup, and owner-only temp permissions can reduce accidental
  exposure, while host filesystem/network access and session escape remain; and
- Docker-backed: potentially stronger, but daemon, mounts, network, resources,
  lifecycle, cross-platform behavior, and provider authentication all remain
  untested.

Human approval of the execution-isolation ADR is required before any future
documentation or capability output describes Provet execution as isolated or
sandboxed.
