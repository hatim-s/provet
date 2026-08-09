# ADR 0001: Domain boundaries and contract ownership

- Status: Accepted
- Date: 2026-08-09
- Roadmap node: FND-02

## Context

The repository standard requires inward dependencies and one owner for every public data shape. Parallel implementation cannot safely begin if lanes can redeclare DTOs or import concrete outer-layer behavior.

## Decision

The implementation uses the logical modules `cli`, `config`, `evals`, `adapters`, `execution`, `graders`, `workspaces`, `runs`, and `reporting`, with host implementations under `platform` and orchestration ports under `application`. Stable cross-module data and ports live in purpose-specific owner directories beneath `src/contracts/`; this central contract root is the domain layer rather than a feature implementation layer.

Dependencies point inward as encoded in `architecture/module-boundaries.json`:

```text
cli / config / evals / adapters / graders / workspaces / runs / reporting / platform
                                      |
                                      v
                         application / execution
                                      |
                                      v
                              src/contracts
```

An outer module consumes an owner contract and never another outer module's implementation. Effectful outer modules may import the narrow ports owned by `application`; this does not authorize importing another outer implementation. The executable composition root is the only source module allowed to import and wire every concrete outer module. `src/contracts` imports only within `src/contracts`. Application and execution code may import application/execution modules and contracts, but not outer implementations. They also reject Node/Bun modules, static or dynamic runtime loading, CommonJS loading, and `process`/`Bun` globals. The package boundary may expose only intentional CLI and contract surfaces.

`src/contracts/public-contract-inventory.ts` is authoritative for public ownership, version, source file, exported symbols, and stability. A symbol in that inventory may be declared only in its owner file. Consumers must import it and cannot redeclare, widen, rename, or structurally copy it. Contract tests verify the import graph, host-free inward layers, the inventory, exact symbol ownership, and canonical structural signatures independent of property order.

## Consequences

- Downstream lanes can consume pinned contract paths without taking ownership.
- The composition root can wire concrete config, eval, adapter, execution, grader, workspace, run, report, CLI, and platform implementations through narrow ports.
- A new public shape or owner move requires an inventory update, compatibility review, and an ADR when the repository standard triggers one.
- Empty downstream feature implementations are not stubbed by FND-02; their contract directories are real and their allowed module roots are reserved by the boundary configuration.
- Internal effect ports from FND-01 remain application-owned and are not product-public DTOs.
