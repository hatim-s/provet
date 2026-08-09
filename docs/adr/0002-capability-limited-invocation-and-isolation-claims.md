# ADR 0002: Capability-limited invocation and isolation claims

- Status: Accepted
- Date: 2026-08-09
- Roadmap node: FND-02
- Related spike: SPI-03

## Context

Targets and judges share adapter families and transport primitives, but they do not share authority. FND-02 must establish that boundary without pre-empting SPI-03's process, workspace, credential, or containment evidence.

## Decision

Target and judge invocation use distinct ports and request types. A target request may receive its trial identity, task input, a trial workspace reference, and an explicit upper capability grant. A judge request receives only case input, rubric, trial identity, and immutable evidence that has already been redacted. It never receives a target workspace reference, target credentials, or target tool grants through shared plumbing.

Both ports may return the same adapter result, normalized trajectory, measurement, and provenance primitives. Sharing those result types does not make the request capabilities interchangeable. Provider-native raw events and detected provider versions remain mandatory provenance; their final parsing and storage representation is provisional pending SPI-01, SPI-02, SPI-04, and SPI-05.

Capability grants describe what orchestration intends to allow. They are not evidence that the host has enforced a sandbox. Until SPI-03 is approved, Provet may describe execution only as local host execution with bounded requested capabilities; it must not claim process, filesystem, credential, or network isolation. SPI-03 exclusively owns `docs/adr/execution-isolation.md` and the final `unsafe-local` wording, process controls, fail-closed rules, and release gate.

## Consequences

- A judge cannot acquire target workspace or tool privileges by accepting a shared request object.
- Adapters must map role-specific requests without widening them.
- FND-02 does not approve Docker, sandboxing, process-tree containment, environment filtering, or retained-workspace behavior.
- If SPI-03 cannot prove an isolation property, downstream documentation and diagnostics must disclose the limitation rather than infer safety from workspace copying.
