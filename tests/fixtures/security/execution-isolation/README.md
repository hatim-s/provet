# SPI-03 execution-isolation fixtures

These fixtures are synthetic adversarial programs used only by
`bun test tests/security`. They contain no provider transcript, account data,
credential value, or personal path.

| Fixture | Purpose |
| --- | --- |
| `print-arguments.ts` | Prove shell metacharacters remain inert argv data |
| `report-environment-presence.ts` | Report variable presence without values |
| `emit-huge-output.ts` | Exceed the combined stdout/stderr capture ceiling |
| `ignore-graceful-termination.ts` | Require SIGTERM-to-SIGKILL escalation |
| `spawn-same-group-child.ts` | Fork a descendant that group termination should remove |
| `spawn-escaped-session-child.ts` | Demonstrate that a new session escapes unsafe-local process-group cleanup |
| `write-marker-after-delay.ts` | Produce a temporary survival marker for the child probes |
| `emit-terminal-controls.ts` | Emit ANSI, OSC, bell, carriage-return, newline, and bidirectional controls |

All marker files and workspaces are created below an operating-system temporary
directory and removed by the owning test. The escaped-session fixture is
deliberately short-lived: it writes one synthetic marker after one second
and exits. Its passing assertion proves a limitation, not successful
containment.

These fixtures must never be relabelled as production supervisor, workspace,
container, provider, or redaction compatibility evidence.
