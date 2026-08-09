# Public contract inventory

FND-02 establishes the following owner modules at schema version `1`. The executable inventory in `src/contracts/public-contract-inventory.ts` is checked against exported declarations; this document explains the consumption boundary.

| Contract ID | Owner | Stability | Owner source |
| --- | --- | --- | --- |
| `provet.cli-envelope` | CLI | Provisional | `src/contracts/cli/cli-envelope.ts` |
| `provet.project-configuration` | Config | Stable | `src/contracts/config/project-configuration.ts` |
| `provet.normalized-eval-case` | Evals | Stable | `src/contracts/evals/normalized-eval-case.ts` |
| `provet.normalized-trajectory-event` | Events | Provisional | `src/contracts/events/normalized-trajectory-event.ts` |
| `provet.run-event-record` | Events | Provisional | `src/contracts/events/run-event-record.ts` |
| `provet.pass-policy` | Execution | Stable | `src/contracts/execution/pass-policy.ts` |
| `provet.run-plan` | Execution | Stable | `src/contracts/execution/run-plan.ts` |
| `provet.grader-definition` | Grading | Stable | `src/contracts/grading/grader-definition.ts` |
| `provet.grading-port` | Grading | Stable | `src/contracts/grading/grading-port.ts` |
| `provet.adapter-configuration` | Invocation | Stable | `src/contracts/invocation/adapter-configuration.ts` |
| `provet.invocation-measurements` | Invocation | Stable | `src/contracts/invocation/invocation-measurements.ts` |
| `provet.invocation-port` | Invocation | Provisional | `src/contracts/invocation/invocation-port.ts` |
| `provet.run-artifact` | Persistence | Provisional | `src/contracts/persistence/run-artifact.ts` |
| `provet.report-view-model` | Reporting | Provisional | `src/contracts/reporting/report-view-model.ts` |
| `provet.schema-version` | Versioning | Stable | `src/contracts/versioning/schema-version.ts` |
| `provet.serialized-json-value` | Versioning | Stable | `src/contracts/versioning/serialized-json-value.ts` |

Stable means FND-02 ratifies the minimum v1 shape and compatibility rules. Provisional means the owner and version are fixed but evidence-sensitive fields may stabilize only through the named Phase 0 spike and compatibility review. Provisional does not authorize a consumer to redeclare or widen the DTO.

The public surface is consumed through the exact owner source. There is deliberately no catch-all contract barrel. Every exported symbol appears in exactly one inventory entry and must be declared only by that entry's source file. TypeScript-checker semantic signatures also prohibit a consumer from evading ownership through renamed or quoted properties, reordered fields, split intersections, aliases, interface heritage, exported class instances, exported object values, or exported function-return shapes. A consumer may directly alias, implement, return, or extend an imported owner DTO because that preserves, rather than forks, its ownership.
