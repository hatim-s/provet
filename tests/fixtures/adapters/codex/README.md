# Codex adapter stream fixtures

These fixtures are compatibility evidence for SPI-02. They are not a public
Provet event contract. `manifest.json` records whether each capture is live or
synthetic, the installed CLI version, sanitization, and the evidence limits.

The `0.146.0/live-command-workspace` family came from one bounded, ephemeral,
non-nested `codex exec --json` run in an isolated temporary Git repository.
Identifiers and timestamps are replaced with stable markers. Event order,
event fields, usage values, stdout/stderr separation, exit status, and the
observed workspace after-state bytes are otherwise retained. No before-state
manifest was captured, so this fixture proves file presence after invocation,
not that Codex added or changed the file.

The `synthetic-negative` family exists only to exercise replay degradation for
malformed JSON, partial streams, invalid lifecycle framing, malformed known
items, duplicate or unmatched item records, additive unknown events, hostile
family members, and unknown item discriminators. Synthetic files must never be
reported as proof of live Codex behavior.
