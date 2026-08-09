import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface ReplayedCodexEvent {
  rawLine: string;
  value: NativeCodexEvent;
}

interface CodexStreamReplay {
  events: ReplayedCodexEvent[];
  isTerminal: boolean;
  isTrajectoryComplete: boolean;
  malformedLineNumber: number | null;
  openItemIdentifiers: string[];
  protocolDiagnostics: CodexProtocolDiagnostic[];
  unknownEventTypes: string[];
  unknownItemTypes: string[];
}

type CodexProtocolDiagnosticCode =
  | "duplicate-event"
  | "duplicate-item-completion"
  | "duplicate-item-start"
  | "event-out-of-order"
  | "item-type-mismatch"
  | "malformed-event-shape"
  | "malformed-item-shape"
  | "terminal-with-open-items"
  | "unmatched-item-completion";

interface CodexProtocolDiagnostic {
  code: CodexProtocolDiagnosticCode;
  eventType: string;
  itemIdentifier?: string;
  lineNumber: number;
}

type CodexReplayPhase =
  | "awaiting-thread-start"
  | "awaiting-turn-start"
  | "in-turn"
  | "terminal";

interface CodexReplayLifecycle {
  activeItemTypes: Map<string, string>;
  completedItemIdentifiers: Set<string>;
  hasThreadStarted: boolean;
  hasTurnStarted: boolean;
  phase: CodexReplayPhase;
  protocolDiagnostics: CodexProtocolDiagnostic[];
}

interface NativeCodexEvent extends Record<string, unknown> {
  item?: unknown;
  thread_id?: unknown;
  type: string;
  usage?: unknown;
}

interface NativeCodexItem extends Record<string, unknown> {
  id: string;
  type: string;
}

const fixtureRoot = resolve(
  import.meta.dir,
  "../../../fixtures/adapters/codex",
);

const evidencedEventTypes = new Set([
  "thread.started",
  "turn.started",
  "item.started",
  "item.completed",
  "turn.completed",
]);
const evidencedItemTypes = new Set(["agent_message", "command_execution"]);

/** Returns whether an unknown JSON value is a non-null object record. */
function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Narrows a parsed object to the minimum native event framing contract. */
function isNativeCodexEvent(value: unknown): value is NativeCodexEvent {
  if (!isObjectRecord(value)) {
    return false;
  }

  const possibleEvent = value as Partial<NativeCodexEvent>;
  return typeof possibleEvent.type === "string";
}

/** Narrows a native item to the identifier required for lifecycle matching. */
function isNativeCodexItem(value: unknown): value is NativeCodexItem {
  if (!isObjectRecord(value)) {
    return false;
  }

  const possibleItem = value as Partial<NativeCodexItem>;
  return (
    typeof possibleItem.id === "string" && typeof possibleItem.type === "string"
  );
}

/** Returns whether an exact native event type has live fixture evidence. */
function isEvidencedEventType(eventType: string): boolean {
  return evidencedEventTypes.has(eventType);
}

/** Returns whether an exact native item discriminator has live fixture evidence. */
function isEvidencedItemType(itemType: string): boolean {
  return evidencedItemTypes.has(itemType);
}

/** Records a replay diagnostic without removing the offending raw event. */
function addProtocolDiagnostic(
  lifecycle: CodexReplayLifecycle,
  code: CodexProtocolDiagnosticCode,
  eventType: string,
  lineNumber: number,
  itemIdentifier?: string,
): void {
  lifecycle.protocolDiagnostics.push({
    code,
    eventType,
    ...(itemIdentifier === undefined ? {} : { itemIdentifier }),
    lineNumber,
  });
}

/** Validates the minimum live-evidenced framing and item lifecycle for one event. */
function validateCodexLifecycleEvent(
  event: NativeCodexEvent,
  lineNumber: number,
  lifecycle: CodexReplayLifecycle,
): void {
  if (event.type === "thread.started") {
    if (typeof event.thread_id !== "string") {
      addProtocolDiagnostic(
        lifecycle,
        "malformed-event-shape",
        event.type,
        lineNumber,
      );
      return;
    }
    if (lifecycle.phase !== "awaiting-thread-start") {
      addProtocolDiagnostic(
        lifecycle,
        lifecycle.hasThreadStarted ? "duplicate-event" : "event-out-of-order",
        event.type,
        lineNumber,
      );
      return;
    }

    lifecycle.hasThreadStarted = true;
    lifecycle.phase = "awaiting-turn-start";
    return;
  }

  if (event.type === "turn.started") {
    if (lifecycle.phase !== "awaiting-turn-start") {
      addProtocolDiagnostic(
        lifecycle,
        lifecycle.hasTurnStarted ? "duplicate-event" : "event-out-of-order",
        event.type,
        lineNumber,
      );
      return;
    }

    lifecycle.hasTurnStarted = true;
    lifecycle.phase = "in-turn";
    return;
  }

  if (event.type === "turn.completed") {
    if (!isObjectRecord(event.usage)) {
      addProtocolDiagnostic(
        lifecycle,
        "malformed-event-shape",
        event.type,
        lineNumber,
      );
    }
    if (lifecycle.phase !== "in-turn") {
      addProtocolDiagnostic(
        lifecycle,
        lifecycle.phase === "terminal"
          ? "duplicate-event"
          : "event-out-of-order",
        event.type,
        lineNumber,
      );
      return;
    }
    if (lifecycle.activeItemTypes.size > 0) {
      addProtocolDiagnostic(
        lifecycle,
        "terminal-with-open-items",
        event.type,
        lineNumber,
      );
    }

    lifecycle.phase = "terminal";
    return;
  }

  const item = event.item;
  if (!isNativeCodexItem(item)) {
    addProtocolDiagnostic(
      lifecycle,
      "malformed-item-shape",
      event.type,
      lineNumber,
    );
    return;
  }
  if (lifecycle.phase !== "in-turn") {
    addProtocolDiagnostic(
      lifecycle,
      "event-out-of-order",
      event.type,
      lineNumber,
      item.id,
    );
    return;
  }

  if (event.type === "item.started") {
    if (
      lifecycle.activeItemTypes.has(item.id) ||
      lifecycle.completedItemIdentifiers.has(item.id)
    ) {
      addProtocolDiagnostic(
        lifecycle,
        "duplicate-item-start",
        event.type,
        lineNumber,
        item.id,
      );
      return;
    }

    lifecycle.activeItemTypes.set(item.id, item.type);
    return;
  }

  const activeItemType = lifecycle.activeItemTypes.get(item.id);
  if (activeItemType !== undefined) {
    if (activeItemType !== item.type) {
      addProtocolDiagnostic(
        lifecycle,
        "item-type-mismatch",
        event.type,
        lineNumber,
        item.id,
      );
      return;
    }

    lifecycle.activeItemTypes.delete(item.id);
    lifecycle.completedItemIdentifiers.add(item.id);
    return;
  }

  if (lifecycle.completedItemIdentifiers.has(item.id)) {
    addProtocolDiagnostic(
      lifecycle,
      "duplicate-item-completion",
      event.type,
      lineNumber,
      item.id,
    );
    return;
  }

  // The live capture establishes agent messages as atomic completed items.
  if (item.type === "agent_message") {
    lifecycle.completedItemIdentifiers.add(item.id);
    return;
  }

  addProtocolDiagnostic(
    lifecycle,
    "unmatched-item-completion",
    event.type,
    lineNumber,
    item.id,
  );
}

/** Replays JSONL without discarding raw lines, unknown events, or an incomplete prefix. */
function replayCodexJsonLines(jsonLines: string): CodexStreamReplay {
  const events: ReplayedCodexEvent[] = [];
  const lifecycle: CodexReplayLifecycle = {
    activeItemTypes: new Map(),
    completedItemIdentifiers: new Set(),
    hasThreadStarted: false,
    hasTurnStarted: false,
    phase: "awaiting-thread-start",
    protocolDiagnostics: [],
  };
  const unknownEventTypes = new Set<string>();
  const unknownItemTypes = new Set<string>();
  let malformedLineNumber: number | null = null;

  const lines = jsonLines.split("\n");
  for (const [lineIndex, rawLine] of lines.entries()) {
    if (rawLine.length === 0) {
      continue;
    }

    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(rawLine);
    } catch {
      malformedLineNumber = lineIndex + 1;
      break;
    }

    if (!isNativeCodexEvent(parsedValue)) {
      malformedLineNumber = lineIndex + 1;
      break;
    }

    events.push({ rawLine, value: parsedValue });
    if (!isEvidencedEventType(parsedValue.type)) {
      unknownEventTypes.add(parsedValue.type);
    } else {
      validateCodexLifecycleEvent(parsedValue, lineIndex + 1, lifecycle);
    }

    const item = parsedValue.item;
    if (isNativeCodexItem(item)) {
      if (!isEvidencedItemType(item.type)) {
        unknownItemTypes.add(item.type);
      }
    }
  }

  const terminalEventType = events.at(-1)?.value.type;
  const isTerminal =
    terminalEventType === "turn.completed" ||
    terminalEventType === "turn.failed";
  return {
    events,
    isTerminal,
    isTrajectoryComplete:
      isTerminal &&
      malformedLineNumber === null &&
      lifecycle.activeItemTypes.size === 0 &&
      lifecycle.protocolDiagnostics.length === 0 &&
      unknownEventTypes.size === 0 &&
      unknownItemTypes.size === 0,
    malformedLineNumber,
    openItemIdentifiers: [...lifecycle.activeItemTypes.keys()],
    protocolDiagnostics: lifecycle.protocolDiagnostics,
    unknownEventTypes: [...unknownEventTypes],
    unknownItemTypes: [...unknownItemTypes],
  };
}

describe("Codex JSONL replay spike", () => {
  test("preserves the live event order, lifecycle, message, and usage", async () => {
    const stdout = await readFile(
      resolve(fixtureRoot, "0.146.0/live-command-workspace/stdout.jsonl"),
      "utf8",
    );
    const replay = replayCodexJsonLines(stdout);

    expect(replay.malformedLineNumber).toBeNull();
    expect(replay.isTerminal).toBe(true);
    expect(replay.isTrajectoryComplete).toBe(true);
    expect(replay.openItemIdentifiers).toEqual([]);
    expect(replay.protocolDiagnostics).toEqual([]);
    expect(replay.unknownEventTypes).toEqual([]);
    expect(replay.unknownItemTypes).toEqual([]);
    expect(replay.events.map(({ value }) => value.type)).toEqual([
      "thread.started",
      "turn.started",
      "item.started",
      "item.completed",
      "item.completed",
      "turn.completed",
    ]);
    expect(replay.events[4]?.value).toMatchObject({
      item: {
        id: "item_1",
        text: "probe complete",
        type: "agent_message",
      },
      type: "item.completed",
    });
    expect(replay.events[5]?.value).toMatchObject({
      type: "turn.completed",
      usage: {
        cache_write_input_tokens: 0,
        cached_input_tokens: 19_968,
        input_tokens: 33_830,
        output_tokens: 115,
        reasoning_output_tokens: 38,
      },
    });
  });

  test("keeps a valid prefix and exact failure line for malformed JSONL", async () => {
    const stdout = await readFile(
      resolve(fixtureRoot, "synthetic-negative/malformed.jsonl"),
      "utf8",
    );
    const replay = replayCodexJsonLines(stdout);

    expect(replay.events).toHaveLength(2);
    expect(replay.malformedLineNumber).toBe(3);
    expect(replay.isTerminal).toBe(false);
    expect(replay.isTrajectoryComplete).toBe(false);
  });

  test("marks premature EOF as partial and retains the in-progress item", async () => {
    const stdout = await readFile(
      resolve(fixtureRoot, "synthetic-negative/partial.jsonl"),
      "utf8",
    );
    const replay = replayCodexJsonLines(stdout);

    expect(replay.malformedLineNumber).toBeNull();
    expect(replay.isTerminal).toBe(false);
    expect(replay.isTrajectoryComplete).toBe(false);
    expect(replay.openItemIdentifiers).toEqual(["item_0"]);
  });

  test("rejects a terminal-only stream as reordered framing", async () => {
    const stdout = await readFile(
      resolve(fixtureRoot, "synthetic-negative/terminal-only.jsonl"),
      "utf8",
    );
    const replay = replayCodexJsonLines(stdout);

    expect(replay.isTerminal).toBe(true);
    expect(replay.isTrajectoryComplete).toBe(false);
    expect(replay.protocolDiagnostics).toEqual([
      {
        code: "event-out-of-order",
        eventType: "turn.completed",
        lineNumber: 1,
      },
    ]);
    expect(replay.events).toHaveLength(1);
    expect(replay.events[0]?.rawLine).toBe(
      '{"type":"turn.completed","usage":{}}',
    );
  });

  test("retains and diagnoses an item start without an identifier", async () => {
    const stdout = await readFile(
      resolve(fixtureRoot, "synthetic-negative/missing-item-identifier.jsonl"),
      "utf8",
    );
    const replay = replayCodexJsonLines(stdout);

    expect(replay.isTerminal).toBe(true);
    expect(replay.isTrajectoryComplete).toBe(false);
    expect(replay.protocolDiagnostics).toEqual([
      {
        code: "malformed-item-shape",
        eventType: "item.started",
        lineNumber: 3,
      },
    ]);
    expect(replay.events[2]?.rawLine).toContain(
      '"item":{"type":"command_execution"',
    );
  });

  test("retains and diagnoses an unmatched item completion", async () => {
    const stdout = await readFile(
      resolve(
        fixtureRoot,
        "synthetic-negative/unmatched-item-completion.jsonl",
      ),
      "utf8",
    );
    const replay = replayCodexJsonLines(stdout);

    expect(replay.isTerminal).toBe(true);
    expect(replay.isTrajectoryComplete).toBe(false);
    expect(replay.protocolDiagnostics).toEqual([
      {
        code: "unmatched-item-completion",
        eventType: "item.completed",
        itemIdentifier: "never-started",
        lineNumber: 3,
      },
    ]);
    expect(replay.events[2]?.rawLine).toContain('"id":"never-started"');
  });

  test("retains and diagnoses a duplicate item start", async () => {
    const stdout = await readFile(
      resolve(fixtureRoot, "synthetic-negative/duplicate-item-start.jsonl"),
      "utf8",
    );
    const replay = replayCodexJsonLines(stdout);

    expect(replay.isTerminal).toBe(true);
    expect(replay.isTrajectoryComplete).toBe(false);
    expect(replay.protocolDiagnostics).toEqual([
      {
        code: "duplicate-item-start",
        eventType: "item.started",
        itemIdentifier: "item_duplicate",
        lineNumber: 4,
      },
    ]);
    expect(replay.events[3]?.rawLine).toContain('"id":"item_duplicate"');
  });

  test("retains additive unknown events while completing the known stream", async () => {
    const stdout = await readFile(
      resolve(fixtureRoot, "synthetic-negative/unknown-event.jsonl"),
      "utf8",
    );
    const replay = replayCodexJsonLines(stdout);

    expect(replay.isTerminal).toBe(true);
    expect(replay.isTrajectoryComplete).toBe(false);
    expect(replay.unknownEventTypes).toEqual(["future.event"]);
    expect(replay.events[2]?.rawLine).toContain("synthetic additive event");
  });

  test("degrades an unknown turn family member despite a terminal event", async () => {
    const stdout = await readFile(
      resolve(fixtureRoot, "synthetic-negative/unknown-turn-event.jsonl"),
      "utf8",
    );
    const replay = replayCodexJsonLines(stdout);

    expect(replay.isTerminal).toBe(true);
    expect(replay.isTrajectoryComplete).toBe(false);
    expect(replay.unknownEventTypes).toEqual(["turn.future"]);
    expect(replay.events[2]?.rawLine).toContain("turn.future");
  });

  test("degrades and preserves an unknown item discriminator", async () => {
    const stdout = await readFile(
      resolve(fixtureRoot, "synthetic-negative/unknown-item-type.jsonl"),
      "utf8",
    );
    const replay = replayCodexJsonLines(stdout);

    expect(replay.isTerminal).toBe(true);
    expect(replay.isTrajectoryComplete).toBe(false);
    expect(replay.unknownEventTypes).toEqual([]);
    expect(replay.unknownItemTypes).toEqual(["future_item"]);
    expect(replay.events[2]?.rawLine).toContain("future_item");
  });

  test("keeps successful stderr separate from exit and workspace evidence", async () => {
    const captureRoot = resolve(fixtureRoot, "0.146.0/live-command-workspace");
    const [standardError, exitCode, workspaceAfter] = await Promise.all([
      readFile(resolve(captureRoot, "stderr.txt"), "utf8"),
      readFile(resolve(captureRoot, "exit-code.txt"), "utf8"),
      readFile(resolve(captureRoot, "workspace-after.json"), "utf8"),
    ]);

    expect(standardError).not.toBe("");
    expect(standardError).toContain("codex_models_manager::cache");
    expect(exitCode).toBe("0\n");
    expect(JSON.parse(workspaceAfter)).toEqual({
      files: [
        {
          byteLength: 8,
          path: "codex-probe.txt",
          utf8Content: '"fixture',
        },
      ],
    });
  });
});
