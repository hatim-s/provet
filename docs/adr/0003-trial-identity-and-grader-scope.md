# ADR 0003: Trial identity and grader scope

- Status: Accepted
- Date: 2026-08-09
- Roadmap node: FND-02

## Context

Run planning, persistence, graders, and reports need the same names for eval cases and repeated attempts. Grader placement also needs a v1 boundary that does not accidentally introduce the v1.1 shared-grader feature.

## Decision

The authoritative case identity is the structured pair `evalName` plus `caseId`; its normalized display form is `qualifiedCaseId` written as `<evalName>/<caseId>`. A trial adds a one-based positive `trialNumber`. Its derived display/storage lookup is `trialKey`, written as `<qualifiedCaseId>#<trialNumber>`. Code must compare the structured fields; it must not parse a display key to recover authority.

Run planning expands repeats only after selection and serializes plans in stable eval, case, then trial-number order. Concurrency cannot change identity or serialized order. SPI-04 still owns aggregation denominators, state transitions, interruption semantics, and comparability.

Every v1 grader definition is attached to one normalized case. The `expect` sugar normalizes into those same per-case definitions. There is no eval-level shared-grader declaration, inheritance mechanism, majority-vote judge setting, or hidden global grader list in v1. A code grader's required default export is compatibility at the external loader boundary only; repository-owned grader contracts remain named exports.

## Consequences

- Storage, events, grading, and reporting share one trial identity.
- Duplicate case IDs are evaluated within their eval namespace, while the qualified ID is globally addressable.
- Shared eval graders and majority voting remain post-v1 and require a compatibility decision before implementation.
- Grader execution or parse failure remains `grader-error`, distinct from an assertion `fail`.
