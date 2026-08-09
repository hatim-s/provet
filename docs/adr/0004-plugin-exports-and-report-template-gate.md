# ADR 0004: Plugin exports and report-template gate

- Status: Accepted
- Date: 2026-08-09
- Roadmap node: FND-02

## Context

The product plan includes trusted TypeScript code graders and project-overridable static HTML templates. Both are extension boundaries that could otherwise leak internal APIs or make unreviewed security claims.

## Decision

The only v1 executable plugin boundary is a user code grader module with a default-exported `grade(ctx)` function. The loader adapts that external default export to the repository's named `GradingPort`; internal modules never add default exports for plugin convenience. No adapter, reporter, storage, configuration, or command plugin API is public in v1.

Repository exports remain named, purpose-specific, and inventoried. Internal implementation modules are not package exports. Adding a plugin category or exposing an internal symbol is a public API change requiring an ADR and compatibility review.

HTML template overrides are gated until their implementation proves all of the following:

1. the input is exactly the versioned `ReportViewModel` used by JSON and terminal reporting;
2. all untrusted values are escaped by default and raw insertion is unavailable;
3. partial names and paths are contained within the configured template root after canonicalization;
4. output is self-contained, has no remote resources by default, and is written atomically;
5. template parse/render failures are typed report errors and never produce a successful partial document.

Before that gate is green, built-in fixed rendering may be developed, but project template overrides must not execute.

## Consequences

- User grader compatibility does not widen repository export style.
- Templates consume a data view-model, not application services or persisted prose.
- The gate can fail independently of terminal/JSON reporting and does not block their safe implementation.
- Project templates are trusted presentation input only after containment and escaping evidence; they are not general code plugins.
