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

An outer module consumes an owner contract and never another outer module's implementation. `src/contracts` imports only within `src/contracts`. Application and execution code may import application/execution modules and contracts, but not outer implementations. The package boundary may expose only intentional CLI and contract surfaces.

`src/contracts/public-contract-inventory.ts` is authoritative for public ownership, version, source file, exported symbols, and stability. A symbol in that inventory may be declared only in its owner file. Consumers must import it and cannot redeclare, widen, or copy it. Contract tests verify the import graph, the inventory, and duplicate declarations.

## Consequences

- Downstream lanes can consume pinned contract paths without taking ownership.
- A new public shape or owner move requires an inventory update, compatibility review, and an ADR when the repository standard triggers one.
- Empty downstream feature implementations are not stubbed by FND-02; their contract directories are real and their allowed module roots are reserved by the boundary configuration.
- Internal effect ports from FND-01 remain application-owned and are not product-public DTOs.
