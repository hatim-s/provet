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
    expect(replay.observedClaudeCodeVersion).toBe(SCHEMA_CANDIDATE_VERSION);
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

  test("rejects a stream before normalization when the init version drifts", async () => {
    const replay = await replayFixture("negative-unsupported-version.jsonl");

    expect(replay.status).toBe("unsupported");
    expect(replay.observedClaudeCodeVersion).toBe("999.0.0");
    expect(replay.diagnostics[0]?.code).toBe("unsupported-version");
  });
});
