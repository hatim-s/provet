# ADR 0002: Capability-limited invocation and isolation claims

- Status: Accepted
- Date: 2026-08-09
- Roadmap node: FND-02
- Related spike: SPI-03

## Context

Targets and judges share adapter families and transport primitives, but they do not share authority. FND-02 must establish that boundary without pre-empting SPI-03's process, workspace, credential, or containment evidence.

## Decision

Target and judge invocation use distinct ports and request types. A target request may receive its trial identity, task input, a trial workspace reference, and a compatible capability grant. A judge request receives only case input, rubric, trial identity, and immutable evidence that has already been redacted. It never receives a target workspace reference, target credentials, or target tool grants through shared plumbing.

A target capability keeps four facts separate: the selected execution profile, requested access, observed enforcement, and effective access. `unsafe-local` is the only named profile fixed by Phase 0 evidence. It has no isolation enforcement, arbitrary effective host egress, unenforced network restriction, and unrestricted effective host-workspace access even when Provet organizes work inside one trial directory. A future named profile remains `unknown` until its controls are verified; the DTO does not call that profile a container or freeze an unproved runtime.

An invocation request can carry only `TargetCapabilityGrant`, which represents a compatible state. Capability planning returns an incompatible result instead when isolation is required but unverified, a workspace restriction cannot be enforced, or network denial/destination-only egress cannot be enforced. In particular, `unsafe-local` can produce a grant only for requested unrestricted network access and requested read-write workspace access while disclosing unrestricted/unenforced effective host access. Requested network denial/destination-only access or requested `none`/`read-only` workspace access fails before spawn with the corresponding enforcement-unavailable reason. Unknown enforcement or effective access is non-invokable rather than silently treated as a grant.

Both ports may return the same adapter result, normalized trajectory, measurement, and provenance primitives. Sharing those result types does not make the request capabilities interchangeable. Provider-native raw events and detected provider versions remain mandatory provenance; their final parsing and storage representation is provisional pending SPI-01, SPI-02, SPI-04, and SPI-05.

Capability grants report enforcement and effective access; a requested limit alone is never evidence that the host enforced it. Until SPI-03 is approved, Provet may describe execution only as local host execution with explicit observed limitations; it must not claim process, filesystem, credential, or network isolation. SPI-03 exclusively owns `docs/adr/execution-isolation.md` and the final security approval, process controls, and release gate. FND-02 consumes its demonstrated unsafe-local counterexamples without approving a stronger profile.

## Consequences

- A judge cannot acquire target workspace or tool privileges by accepting a shared request object.
- Adapters must map role-specific requests without widening them.
- Planning must reject restrictive network requests against `unsafe-local`; it cannot manufacture a false denial or destination-only grant.
- Planning must reject `none` and `read-only` workspace requests against `unsafe-local`; it cannot treat unrestricted host-filesystem access as a compatible restriction.
- Unknown profile facts remain explicit and non-invokable until the owning evidence gate verifies them.
- FND-02 does not approve Docker, sandboxing, process-tree containment, environment filtering, or retained-workspace behavior.
- If SPI-03 cannot prove an isolation property, downstream documentation and diagnostics must disclose the limitation rather than infer safety from workspace copying.
