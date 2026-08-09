# Provet project documentation

The published [Provet Product Plan (v1)](https://hatim-s.github.io/planloft-plans/p/pPwFxUlWUK/) is the product source of truth. Repository documents refine implementation and operating contracts without silently changing that plan.

## Roadmap and implementation plan

- [Provet v1 roadmap and implementation plan](./plan/provet-v1-implementation-plan.html) — self-contained HTML containing only the dependency DAG, phases, task steps, gates, and release cuts.
- [Plan source](./plan/provet-v1-implementation-plan.md) — Markdown input used by Planloft to generate and publish the HTML artifact.

## Normative standards

- [Repository standard](./standards/repository.md) — architecture, contract ownership, evidence gates, security, compatibility, and review rules.
- [CLI UX standard](./standards/cli-ux.md) — command grammar, machine streams, errors/exits, reporting, and diff semantics.
- [Agent UX standard](./standards/agent-ux.md) — noninteractive authoring, schema/validation loop, safe writes, diagnostics, and conformance journey.

When documents disagree, stop implementation and resolve the conflict through the ADR/product-decision process in the repository standard. Do not infer that a researched recommendation has already amended the product plan.
