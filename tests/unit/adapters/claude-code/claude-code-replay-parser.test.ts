import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { replayClaudeCodeStream } from "./support/claude-code-replay-parser.js";

const FIXTURE_DIRECTORY = resolve(
  import.meta.dir,
  "../../../fixtures/adapters/claude-code",
);
const SCHEMA_CANDIDATE_VERSION = "2.1.226";

/** Reads one immutable replay fixture as raw UTF-8 JSONL bytes. */
async function readReplayFixture(fixtureName: string): Promise<string> {
  return readFile(resolve(FIXTURE_DIRECTORY, fixtureName), "utf8");
}

/** Replays a fixture against the schema candidate used by this spike. */
async function replayFixture(fixtureName: string) {
  return replayClaudeCodeStream(await readReplayFixture(fixtureName), {
    supportedClaudeCodeVersions: [SCHEMA_CANDIDATE_VERSION],
  });
}

describe("Claude Code replay parser spike", () => {
  test("preserves raw text record order and emits cumulative result usage", async () => {
    const replay = await replayFixture("schema-derived-text.jsonl");

    expect(replay.status).toBe("complete");
    expect(replay.trajectoryEvidence).toBe("complete");
    expect(replay.observedClaudeCodeVersion).toBe(SCHEMA_CANDIDATE_VERSION);
    expect(replay.versionProvenance).toEqual({
      candidateVersions: [SCHEMA_CANDIDATE_VERSION],
      evidenceClass: "schema-derived-or-synthetic-replay",
      isLiveCompatibilityEvidence: false,
      observedVersion: SCHEMA_CANDIDATE_VERSION,
      source: "system-init",
      sourceLineNumber: 1,
    });
    expect(replay.rawRecords.map((record) => record.lineNumber)).toEqual([
      1, 2, 3,
    ]);
    expect(replay.events.map((event) => event.type)).toEqual([
      "session_started",
      "assistant_text",
      "usage_reported",
      "adapter_completed",
    ]);
    expect(replay.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(replay.events[2]?.data).toMatchObject({
      provenance: "claude-result-cumulative-estimate",
      totalCostUsd: 0.00001,
    });
  });

  test("preserves parallel tool block order and correlates results by identifier", async () => {
    const replay = await replayFixture("schema-derived-parallel-tools.jsonl");
    const toolEvents = replay.events.filter((event) =>
      event.type.startsWith("tool_call_"),
    );

    expect(replay.status).toBe("complete");
    expect(
      toolEvents.map((event) => [
        event.type,
        event.data.toolCallId,
        event.sourceContentBlockIndex,
      ]),
    ).toEqual([
      ["tool_call_started", "tool_fixture_glob", 0],
      ["tool_call_started", "tool_fixture_read_parallel", 1],
      ["tool_call_completed", "tool_fixture_glob", 0],
      ["tool_call_completed", "tool_fixture_read_parallel", 1],
    ]);
  });

  test("keeps a tool failure distinct from a successful adapter result", async () => {
    const replay = await replayFixture("schema-derived-tool-error.jsonl");
    const toolResult = replay.events.find(
      (event) => event.type === "tool_call_completed",
    );

    expect(replay.status).toBe("complete");
    expect(toolResult?.data.isError).toBe(true);
    expect(replay.events.at(-1)).toMatchObject({
      data: { isError: false, nativeSubtype: "success" },
      type: "adapter_completed",
    });
  });

  test("maps budget exhaustion to a typed adapter failure", async () => {
    const replay = await replayFixture("schema-derived-budget-limit.jsonl");

    expect(replay.status).toBe("complete");
    expect(replay.events.at(-1)).toMatchObject({
      data: {
        isError: true,
        nativeSubtype: "error_max_budget_usd",
        terminalReason: "budget_exhausted",
      },
      type: "adapter_failed",
    });
  });

  test("preserves an assistant provider error before the terminal failure", async () => {
    const replay = await replayFixture("schema-derived-provider-error.jsonl");

    expect(replay.status).toBe("complete");
    expect(replay.events).toContainEqual(
      expect.objectContaining({
        data: { assistantError: "overloaded" },
        type: "provider_notice",
      }),
    );
    expect(replay.events.at(-1)).toMatchObject({
      data: { terminalReason: "api_error" },
      type: "adapter_failed",
    });
  });

  test("marks cancellation with an unresolved tool call as a partial trajectory", async () => {
    const replay = await replayFixture("schema-derived-cancellation.jsonl");

    expect(replay.status).toBe("partial");
    expect(replay.diagnostics).toContainEqual({
      code: "unterminated-tool-call",
      lineNumber: null,
      message: "Tool call `tool_fixture_cancelled` has no result record.",
    });
    expect(replay.events.at(-1)).toMatchObject({
      data: { terminalReason: "aborted_tools" },
      type: "adapter_failed",
    });
  });

  test("does not promote workspace-edit tool intent into workspace evidence", async () => {
    const replay = await replayFixture("schema-derived-workspace-edit.jsonl");

    expect(replay.status).toBe("complete");
    expect(replay.events).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Write" }),
        type: "tool_call_started",
      }),
    );
    expect(
      replay.events.some((event) =>
        event.type.toString().includes("workspace"),
      ),
    ).toBe(false);
  });

  test.each([
    ["negative-malformed-line.jsonl", "malformed-json"],
    ["negative-partial-trajectory.jsonl", "missing-terminal-result"],
    ["negative-unknown-event.jsonl", "unknown-event"],
  ] as const)(
    "fails closed for %s with %s",
    async (fixtureName, expectedDiagnosticCode) => {
      const replay = await replayFixture(fixtureName);

      expect(replay.status).toBe("partial");
      expect(replay.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        expectedDiagnosticCode,
      );
    },
  );

  test("rejects a terminal result that is missing init and version framing", async () => {
    const replay = await replayFixture("negative-missing-init.jsonl");

    expect(replay.status).toBe("partial");
    expect(replay.trajectoryEvidence).toBe("unavailable");
    expect(replay.observedClaudeCodeVersion).toBeNull();
    expect(replay.events).toEqual([]);
    expect(replay.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "missing-init",
      "missing-terminal-result",
    ]);
    expect(replay.rawRecords[0]?.value).toMatchObject({
      subtype: "success",
      type: "result",
    });
    expect(replay.versionProvenance).toMatchObject({
      isLiveCompatibilityEvidence: false,
      observedVersion: null,
      source: "unavailable",
      sourceLineNumber: null,
    });
  });

  test("preserves an unknown system subtype raw and degrades trajectory evidence", async () => {
    const replay = await replayFixture("negative-unknown-system-subtype.jsonl");

    expect(replay.status).toBe("partial");
    expect(replay.trajectoryEvidence).toBe("degraded");
    expect(replay.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "unknown-system-subtype",
    );
    expect(replay.rawRecords[1]?.value).toMatchObject({
      subtype: "future_security_event",
      type: "system",
    });
    expect(replay.events.map((event) => event.type)).toEqual([
      "session_started",
      "usage_reported",
      "adapter_completed",
    ]);
  });

  test("preserves an unknown result subtype raw without accepting it as terminal", async () => {
    const replay = await replayFixture("negative-unknown-result-subtype.jsonl");

    expect(replay.status).toBe("partial");
    expect(replay.trajectoryEvidence).toBe("degraded");
    expect(replay.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "unknown-result-subtype",
      "missing-terminal-result",
    ]);
    expect(replay.rawRecords[1]?.value).toMatchObject({
      subtype: "future_result",
      type: "result",
    });
    expect(replay.events.map((event) => event.type)).toEqual([
      "session_started",
    ]);
  });

  test("requires the known terminal subtype to have a coherent published shape", async () => {
    const fixtureLines = (await readReplayFixture("schema-derived-text.jsonl"))
      .trimEnd()
      .split("\n");
    const invalidResult = JSON.parse(fixtureLines[2] ?? "{}") as Record<
      string,
      unknown
    >;
    Reflect.deleteProperty(invalidResult, "usage");
    fixtureLines[2] = JSON.stringify(invalidResult);

    const replay = replayClaudeCodeStream(`${fixtureLines.join("\n")}\n`, {
      supportedClaudeCodeVersions: [SCHEMA_CANDIDATE_VERSION],
    });

    expect(replay.status).toBe("partial");
    expect(replay.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "invalid-result-shape",
      "missing-terminal-result",
    ]);
    expect(
      replay.events.some((event) => event.type === "adapter_completed"),
    ).toBe(false);
  });

  test("requires known system notices to retain their published provenance shape", async () => {
    const fixtureLines = (await readReplayFixture("schema-derived-text.jsonl"))
      .trimEnd()
      .split("\n");
    fixtureLines.splice(
      1,
      0,
      JSON.stringify({ status: null, subtype: "status", type: "system" }),
    );

    const replay = replayClaudeCodeStream(`${fixtureLines.join("\n")}\n`, {
      supportedClaudeCodeVersions: [SCHEMA_CANDIDATE_VERSION],
    });

    expect(replay.status).toBe("partial");
    expect(replay.diagnostics).toContainEqual({
      code: "invalid-system-shape",
      lineNumber: 2,
      message: "System subtype `status` is missing required provenance fields.",
    });
    expect(replay.rawRecords[1]?.value).toMatchObject({
      subtype: "status",
      type: "system",
    });
  });

  test("requires exactly one init record", async () => {
    const fixtureLines = (await readReplayFixture("schema-derived-text.jsonl"))
      .trimEnd()
      .split("\n");
    fixtureLines.splice(1, 0, fixtureLines[0] ?? "");

    const replay = replayClaudeCodeStream(`${fixtureLines.join("\n")}\n`, {
      supportedClaudeCodeVersions: [SCHEMA_CANDIDATE_VERSION],
    });

    expect(replay.status).toBe("partial");
    expect(replay.trajectoryEvidence).toBe("degraded");
    expect(replay.diagnostics).toContainEqual({
      code: "duplicate-init",
      lineNumber: 2,
      message: "The stream contains more than one system/init record.",
    });
  });

  test("degrades malformed assistant framing while preserving the raw record", async () => {
    const replay = await replayFixture("negative-malformed-assistant.jsonl");

    expect(replay.status).toBe("partial");
    expect(replay.trajectoryEvidence).toBe("degraded");
    expect(replay.diagnostics).toContainEqual({
      code: "invalid-assistant-message-shape",
      lineNumber: 2,
      message:
        "The assistant record is missing required message or provenance framing.",
    });
    expect(replay.rawRecords[1]?.value).toMatchObject({
      message: { content: "not-an-array" },
      type: "assistant",
    });
    expect(replay.events.at(-1)?.type).toBe("adapter_completed");
  });

  test("degrades an unknown user content block without silently discarding it", async () => {
    const replay = await replayFixture("negative-unknown-user-block.jsonl");

    expect(replay.status).toBe("partial");
    expect(replay.trajectoryEvidence).toBe("degraded");
    expect(replay.diagnostics).toContainEqual({
      code: "unknown-content-block",
      lineNumber: 2,
      message: "User content block type `future_user_block` is not recognized.",
    });
    expect(replay.rawRecords[1]?.value).toMatchObject({
      message: { content: [{ type: "future_user_block" }] },
      type: "user",
    });
  });

  test("preserves duplicate tool-call cardinality when only one result arrives", async () => {
    const replay = await replayFixture("negative-duplicate-tool-id.jsonl");
    const toolEvents = replay.events.filter((event) =>
      event.type.startsWith("tool_call_"),
    );

    expect(replay.status).toBe("partial");
    expect(replay.trajectoryEvidence).toBe("degraded");
    expect(replay.diagnostics).toContainEqual({
      code: "duplicate-tool-call",
      lineNumber: 2,
      message:
        "Tool call identifier `tool_fixture_duplicate` is already pending.",
    });
    expect(replay.diagnostics).toContainEqual({
      code: "unterminated-tool-call",
      lineNumber: null,
      message: "Tool call `tool_fixture_duplicate` has no result record.",
    });
    expect(
      toolEvents.map((event) => [
        event.type,
        event.data.toolCallId,
        event.sourceContentBlockIndex,
      ]),
    ).toEqual([
      ["tool_call_started", "tool_fixture_duplicate", 0],
      ["tool_call_started", "tool_fixture_duplicate", 1],
      ["tool_call_completed", "tool_fixture_duplicate", 0],
    ]);
  });

  test("rejects malformed nested terminal accounting and permission fields", async () => {
    const replay = await replayFixture("negative-invalid-nested-result.jsonl");

    expect(replay.status).toBe("partial");
    expect(replay.trajectoryEvidence).toBe("degraded");
    expect(replay.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "invalid-result-shape",
      "missing-terminal-result",
    ]);
    expect(replay.rawRecords[2]?.value).toMatchObject({
      modelUsage: { "claude-schema-candidate": {} },
      permission_denials: [null],
      subtype: "success",
      usage: {},
    });
    expect(
      replay.events.some(
        (event) =>
          event.type === "adapter_completed" || event.type === "usage_reported",
      ),
    ).toBe(false);
  });

  test.each([
    [
      "main-agent token counter",
      (terminalResult: Record<string, unknown>) => {
        const usage = Reflect.get(terminalResult, "usage") as object;
        Reflect.set(usage, "output_tokens", -1);
      },
    ],
    [
      "per-model cost",
      (terminalResult: Record<string, unknown>) => {
        const modelUsage = Reflect.get(terminalResult, "modelUsage") as Record<
          string,
          Record<string, unknown>
        >;
        const schemaCandidateUsage = modelUsage["claude-fixture-model"];
        if (schemaCandidateUsage !== undefined) {
          Reflect.set(schemaCandidateUsage, "costUSD", -0.01);
        }
      },
    ],
    [
      "permission denial element",
      (terminalResult: Record<string, unknown>) => {
        Reflect.set(terminalResult, "permission_denials", [
          {
            tool_input: "not-an-object",
            tool_name: "Read",
            tool_use_id: "tool_fixture_denial",
          },
        ]);
      },
    ],
  ] as const)(
    "rejects an invalid nested %s without terminal normalization",
    async (_fieldDescription, makeNestedFieldInvalid) => {
      const fixtureLines = (
        await readReplayFixture("schema-derived-text.jsonl")
      )
        .trimEnd()
        .split("\n");
      const invalidResult = JSON.parse(fixtureLines[2] ?? "{}") as Record<
        string,
        unknown
      >;
      makeNestedFieldInvalid(invalidResult);
      fixtureLines[2] = JSON.stringify(invalidResult);

      const replay = replayClaudeCodeStream(`${fixtureLines.join("\n")}\n`, {
        supportedClaudeCodeVersions: [SCHEMA_CANDIDATE_VERSION],
      });

      expect(replay.status).toBe("partial");
      expect(replay.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
        "invalid-result-shape",
        "missing-terminal-result",
      ]);
      expect(
        replay.events.some(
          (event) =>
            event.type === "adapter_completed" ||
            event.type === "usage_reported",
        ),
      ).toBe(false);
    },
  );

  test.each([
    ["negative-minimal-rate-limit-event.jsonl", "rate_limit_event"],
    ["negative-minimal-tool-progress.jsonl", "tool_progress"],
    ["negative-minimal-stream-event.jsonl", "stream_event"],
  ] as const)(
    "retains unvalidated provider notice %s as raw-only degraded evidence",
    async (fixtureName, providerNoticeType) => {
      const replay = await replayFixture(fixtureName);

      expect(replay.status).toBe("partial");
      expect(replay.trajectoryEvidence).toBe("degraded");
      expect(replay.diagnostics).toContainEqual({
        code: "unvalidated-provider-notice-shape",
        lineNumber: 2,
        message: `Provider notice type \`${providerNoticeType}\` is retained raw until its exact schema-candidate shape is validated.`,
      });
      expect(replay.rawRecords[1]?.value).toEqual({ type: providerNoticeType });
      expect(
        replay.events.some((event) => event.type === "provider_notice"),
      ).toBe(false);
      expect(replay.events.at(-1)?.type).toBe("adapter_completed");
    },
  );

  test("rejects a present terminal reason outside the exact schema-candidate domain", async () => {
    const replay = await replayFixture(
      "negative-invalid-terminal-reason.jsonl",
    );

    expect(replay.status).toBe("partial");
    expect(replay.trajectoryEvidence).toBe("degraded");
    expect(replay.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "invalid-result-shape",
      "missing-terminal-result",
    ]);
    expect(replay.rawRecords[2]?.value).toMatchObject({
      subtype: "success",
      terminal_reason: 42,
      type: "result",
    });
    expect(
      replay.events.some(
        (event) =>
          event.type === "adapter_completed" || event.type === "usage_reported",
      ),
    ).toBe(false);
  });

  test("rejects a stream before normalization when the init version drifts", async () => {
    const replay = await replayFixture("negative-unsupported-version.jsonl");

    expect(replay.status).toBe("unsupported");
    expect(replay.trajectoryEvidence).toBe("unavailable");
    expect(replay.observedClaudeCodeVersion).toBe("999.0.0");
    expect(replay.diagnostics[0]?.code).toBe("unsupported-version");
    expect(replay.events).toEqual([]);
    expect(replay.versionProvenance).toMatchObject({
      evidenceClass: "schema-derived-or-synthetic-replay",
      isLiveCompatibilityEvidence: false,
      observedVersion: "999.0.0",
      source: "system-init",
      sourceLineNumber: 1,
    });
  });
});
