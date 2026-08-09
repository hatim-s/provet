# ADR 0005: Public data versioning and extension policy

- Status: Accepted
- Date: 2026-08-09
- Roadmap node: FND-02

## Context

Pinned contracts need consistent rules for versions, units, missing measurements, and future fields. FND-02 must also avoid freezing evidence-sensitive details before the Phase 0 spikes report.

## Decision

Every persisted or machine-readable top-level object has integer `schemaVersion: 1`. The source configuration separately retains `sourceVersion: 1`. Protocol and individual file schema versions remain independently declared. Readers reject unsupported future major versions before writes or execution.

Public fields use these conventions:

- durations end in `Ms` internally and in machine output; configuration timeouts end in `Seconds` at the config boundary and normalize once before invocation;
- token counts are non-negative integers and monetary values always carry an explicit currency;
- `null` means a semantically applicable value is unknown or unavailable;
- an explicit `unknown` enum state means planning observed that a security capability is unverified; it is not interchangeable with `null`, `unrestricted`, or an enforced state;
- an optional field means the field is not applicable to that variant; serialized contracts do not use `undefined` as data;
- timestamps are ISO 8601 strings and ordering uses explicit sequence or plan order, never timestamps;
- counts and one-based trial numbers are integers; ratios and scores use numbers within their documented bounds.

Discriminators, lifecycle states, statuses, grader kinds, adapter kinds, and command names are closed within schema v1 unless a contract explicitly marks the field extensible. Adding or changing a closed enum member is a compatibility change and requires review. CLI error codes and provisional run event types are explicitly extensible: consumers must preserve/handle unknown values without treating them as a known success state.

Additive optional fields may be introduced within v1. Removing, renaming, changing meaning or units, making an optional field required, or reusing a code is breaking. Consumers do not locally widen owner types.

Normalized provider event mappings, raw-event representation, run lifecycle payloads, event partitioning, atomic storage mechanics, final report drill-down, and CLI stream bytes remain provisional. SPI-01 through SPI-05 own the evidence needed to stabilize those details. Their provisional owner modules establish import seams, not approval of guessed semantics.

## Consequences

- Unknown cost, token, version, and latency evidence stays `null`, never fabricated as zero.
- Exhaustive switches are valid only for closed unions and must fail type checking when their owner changes.
- Provisional inventory entries cannot be cited as live-provider, durability, isolation, or byte-stream evidence.
- Stabilizing a provisional shape requires its named spike evidence, contract tests, and compatibility review.
