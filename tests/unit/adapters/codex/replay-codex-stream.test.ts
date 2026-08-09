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
  unknownEventTypes: string[];
  unknownItemTypes: string[];
}

interface NativeCodexEvent extends Record<string, unknown> {
  item?: unknown;
  type: string;
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

/** Replays JSONL without discarding raw lines, unknown events, or an incomplete prefix. */
function replayCodexJsonLines(jsonLines: string): CodexStreamReplay {
  const events: ReplayedCodexEvent[] = [];
  const openItemIdentifiers = new Set<string>();
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
    }

    const item = parsedValue.item;
    if (isNativeCodexItem(item)) {
      if (!isEvidencedItemType(item.type)) {
        unknownItemTypes.add(item.type);
      }
      if (parsedValue.type === "item.started") {
        openItemIdentifiers.add(item.id);
      } else if (parsedValue.type === "item.completed") {
        openItemIdentifiers.delete(item.id);
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
      openItemIdentifiers.size === 0 &&
      unknownEventTypes.size === 0 &&
      unknownItemTypes.size === 0,
    malformedLineNumber,
    openItemIdentifiers: [...openItemIdentifiers],
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
