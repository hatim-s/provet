interface JsonObject {
  [key: string]: unknown;
  claude_code_version?: unknown;
  content?: unknown;
  error?: unknown;
  errors?: unknown;
  id?: unknown;
  input?: unknown;
  is_error?: unknown;
  isError?: unknown;
  message?: unknown;
  model?: unknown;
  modelUsage?: unknown;
  name?: unknown;
  parent_tool_use_id?: unknown;
  permissionMode?: unknown;
  result?: unknown;
  stop_reason?: unknown;
  subtype?: unknown;
  terminal_reason?: unknown;
  text?: unknown;
  tool_use_id?: unknown;
  tool_use_result?: unknown;
  toolCallId?: unknown;
  total_cost_usd?: unknown;
  type?: unknown;
  usage?: unknown;
}

type ReplayDiagnosticCode =
  | "malformed-json"
  | "missing-terminal-result"
  | "tool-result-without-call"
  | "unknown-content-block"
  | "unknown-event"
  | "unsupported-version"
  | "unterminated-tool-call";

interface ReplayDiagnostic {
  code: ReplayDiagnosticCode;
  lineNumber: number | null;
  message: string;
}

interface RawReplayRecord {
  lineNumber: number;
  rawLine: string;
  value: JsonObject | null;
}

type ProposedNormalizedEventType =
  | "adapter_completed"
  | "adapter_failed"
  | "assistant_text"
  | "provider_notice"
  | "session_started"
  | "tool_call_completed"
  | "tool_call_started"
  | "usage_reported";

interface ProposedNormalizedEvent {
  data: JsonObject;
  sequence: number;
  sourceContentBlockIndex: number | null;
  sourceLineNumber: number;
  type: ProposedNormalizedEventType;
}

interface ClaudeCodeReplayOptions {
  supportedClaudeCodeVersions: readonly string[];
}

interface ClaudeCodeReplay {
  diagnostics: readonly ReplayDiagnostic[];
  events: readonly ProposedNormalizedEvent[];
  observedClaudeCodeVersion: string | null;
  rawRecords: readonly RawReplayRecord[];
  status: "complete" | "partial" | "unsupported";
}

const KNOWN_PROVIDER_NOTICE_TYPES = new Set([
  "auth_status",
  "conversation_reset",
  "prompt_suggestion",
  "rate_limit_event",
  "stream_event",
  "tool_progress",
  "tool_use_summary",
]);

/** Returns true only for non-null JSON objects that are safe to inspect by key. */
function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the message content array without assuming an Anthropic SDK type. */
function readMessageContent(nativeEvent: JsonObject): readonly unknown[] {
  const message = nativeEvent.message;

  if (!isJsonObject(message) || !Array.isArray(message.content)) {
    return [];
  }

  return message.content;
}

/** Adds one proposed event while preserving native line and content-block order. */
function appendNormalizedEvent(
  events: ProposedNormalizedEvent[],
  type: ProposedNormalizedEventType,
  data: JsonObject,
  sourceLineNumber: number,
  sourceContentBlockIndex: number | null,
): void {
  events.push({
    data,
    sequence: events.length + 1,
    sourceContentBlockIndex,
    sourceLineNumber,
    type,
  });
}

/** Maps one assistant record into text and tool-call proposals. */
function mapAssistantEvent(
  nativeEvent: JsonObject,
  lineNumber: number,
  events: ProposedNormalizedEvent[],
  diagnostics: ReplayDiagnostic[],
  pendingToolCallIdentifiers: Set<string>,
): void {
  if (typeof nativeEvent.error === "string") {
    appendNormalizedEvent(
      events,
      "provider_notice",
      { assistantError: nativeEvent.error },
      lineNumber,
      null,
    );
  }

  const messageContent = readMessageContent(nativeEvent);

  messageContent.forEach((contentBlock, contentBlockIndex) => {
    if (!isJsonObject(contentBlock) || typeof contentBlock.type !== "string") {
      diagnostics.push({
        code: "unknown-content-block",
        lineNumber,
        message: `Assistant content block ${contentBlockIndex} has no supported discriminator.`,
      });
      return;
    }

    if (contentBlock.type === "text" && typeof contentBlock.text === "string") {
      appendNormalizedEvent(
        events,
        "assistant_text",
        {
          parentToolUseId:
            typeof nativeEvent.parent_tool_use_id === "string"
              ? nativeEvent.parent_tool_use_id
              : null,
          text: contentBlock.text,
        },
        lineNumber,
        contentBlockIndex,
      );
      return;
    }

    if (
      contentBlock.type === "tool_use" &&
      typeof contentBlock.id === "string" &&
      typeof contentBlock.name === "string"
    ) {
      pendingToolCallIdentifiers.add(contentBlock.id);
      appendNormalizedEvent(
        events,
        "tool_call_started",
        {
          input: isJsonObject(contentBlock.input) ? contentBlock.input : {},
          name: contentBlock.name,
          parentToolUseId:
            typeof nativeEvent.parent_tool_use_id === "string"
              ? nativeEvent.parent_tool_use_id
              : null,
          toolCallId: contentBlock.id,
        },
        lineNumber,
        contentBlockIndex,
      );
      return;
    }

    // Thinking and redacted-thinking blocks are intentionally retained raw but
    // do not become v1 trajectory events. Other block types signal drift.
    if (
      contentBlock.type !== "thinking" &&
      contentBlock.type !== "redacted_thinking"
    ) {
      diagnostics.push({
        code: "unknown-content-block",
        lineNumber,
        message: `Assistant content block type \`${contentBlock.type}\` is not mapped.`,
      });
    }
  });
}

/** Maps tool results and verifies that each result refers to a prior call. */
function mapUserEvent(
  nativeEvent: JsonObject,
  lineNumber: number,
  events: ProposedNormalizedEvent[],
  diagnostics: ReplayDiagnostic[],
  pendingToolCallIdentifiers: Set<string>,
): void {
  readMessageContent(nativeEvent).forEach((contentBlock, contentBlockIndex) => {
    if (
      !isJsonObject(contentBlock) ||
      contentBlock.type !== "tool_result" ||
      typeof contentBlock.tool_use_id !== "string"
    ) {
      return;
    }

    if (!pendingToolCallIdentifiers.delete(contentBlock.tool_use_id)) {
      diagnostics.push({
        code: "tool-result-without-call",
        lineNumber,
        message: `Tool result \`${contentBlock.tool_use_id}\` has no prior tool call.`,
      });
    }

    appendNormalizedEvent(
      events,
      "tool_call_completed",
      {
        content: contentBlock.content ?? null,
        isError: contentBlock.is_error === true,
        structuredResult: nativeEvent.tool_use_result ?? null,
        toolCallId: contentBlock.tool_use_id,
      },
      lineNumber,
      contentBlockIndex,
    );
  });
}

/** Maps the native cumulative usage and terminal result without summing turns. */
function mapResultEvent(
  nativeEvent: JsonObject,
  lineNumber: number,
  events: ProposedNormalizedEvent[],
): void {
  appendNormalizedEvent(
    events,
    "usage_reported",
    {
      mainAgentUsage: isJsonObject(nativeEvent.usage)
        ? nativeEvent.usage
        : null,
      modelUsage: isJsonObject(nativeEvent.modelUsage)
        ? nativeEvent.modelUsage
        : null,
      provenance: "claude-result-cumulative-estimate",
      totalCostUsd:
        typeof nativeEvent.total_cost_usd === "number"
          ? nativeEvent.total_cost_usd
          : null,
    },
    lineNumber,
    null,
  );

  const isError = nativeEvent.is_error === true;
  appendNormalizedEvent(
    events,
    isError ? "adapter_failed" : "adapter_completed",
    {
      errors: Array.isArray(nativeEvent.errors) ? nativeEvent.errors : [],
      finalOutput:
        typeof nativeEvent.result === "string" ? nativeEvent.result : null,
      isError,
      nativeSubtype:
        typeof nativeEvent.subtype === "string" ? nativeEvent.subtype : null,
      stopReason:
        typeof nativeEvent.stop_reason === "string"
          ? nativeEvent.stop_reason
          : null,
      terminalReason:
        typeof nativeEvent.terminal_reason === "string"
          ? nativeEvent.terminal_reason
          : null,
    },
    lineNumber,
    null,
  );
}

/**
 * Replays newline-delimited Claude Code output into a deliberately provisional
 * event shape. It preserves every raw line and fails closed on protocol drift.
 */
function replayClaudeCodeStream(
  streamText: string,
  options: ClaudeCodeReplayOptions,
): ClaudeCodeReplay {
  const diagnostics: ReplayDiagnostic[] = [];
  const events: ProposedNormalizedEvent[] = [];
  const pendingToolCallIdentifiers = new Set<string>();
  const rawRecords: RawReplayRecord[] = [];
  let hasTerminalResult = false;
  let observedClaudeCodeVersion: string | null = null;

  const streamLines = streamText.endsWith("\n")
    ? streamText.slice(0, -1).split("\n")
    : streamText.split("\n");

  streamLines.forEach((rawLine, lineIndex) => {
    const lineNumber = lineIndex + 1;
    let parsedValue: unknown;

    try {
      parsedValue = JSON.parse(rawLine);
    } catch {
      rawRecords.push({ lineNumber, rawLine, value: null });
      diagnostics.push({
        code: "malformed-json",
        lineNumber,
        message: `Line ${lineNumber} is not a complete JSON object.`,
      });
      return;
    }

    if (!isJsonObject(parsedValue) || typeof parsedValue.type !== "string") {
      rawRecords.push({ lineNumber, rawLine, value: null });
      diagnostics.push({
        code: "unknown-event",
        lineNumber,
        message: `Line ${lineNumber} has no supported event discriminator.`,
      });
      return;
    }

    rawRecords.push({ lineNumber, rawLine, value: parsedValue });

    if (parsedValue.type === "system" && parsedValue.subtype === "init") {
      observedClaudeCodeVersion =
        typeof parsedValue.claude_code_version === "string"
          ? parsedValue.claude_code_version
          : null;
      appendNormalizedEvent(
        events,
        "session_started",
        {
          claudeCodeVersion: observedClaudeCodeVersion,
          model:
            typeof parsedValue.model === "string" ? parsedValue.model : null,
          permissionMode:
            typeof parsedValue.permissionMode === "string"
              ? parsedValue.permissionMode
              : null,
        },
        lineNumber,
        null,
      );

      if (
        observedClaudeCodeVersion === null ||
        !options.supportedClaudeCodeVersions.includes(observedClaudeCodeVersion)
      ) {
        diagnostics.push({
          code: "unsupported-version",
          lineNumber,
          message: `Claude Code version \`${observedClaudeCodeVersion ?? "missing"}\` is not supported.`,
        });
      }
      return;
    }

    if (parsedValue.type === "assistant") {
      mapAssistantEvent(
        parsedValue,
        lineNumber,
        events,
        diagnostics,
        pendingToolCallIdentifiers,
      );
      return;
    }

    if (parsedValue.type === "user") {
      mapUserEvent(
        parsedValue,
        lineNumber,
        events,
        diagnostics,
        pendingToolCallIdentifiers,
      );
      return;
    }

    if (parsedValue.type === "result") {
      hasTerminalResult = true;
      mapResultEvent(parsedValue, lineNumber, events);
      return;
    }

    if (
      (parsedValue.type === "system" &&
        typeof parsedValue.subtype === "string") ||
      KNOWN_PROVIDER_NOTICE_TYPES.has(parsedValue.type)
    ) {
      appendNormalizedEvent(
        events,
        "provider_notice",
        {
          nativeSubtype:
            typeof parsedValue.subtype === "string"
              ? parsedValue.subtype
              : null,
          nativeType: parsedValue.type,
        },
        lineNumber,
        null,
      );
      return;
    }

    diagnostics.push({
      code: "unknown-event",
      lineNumber,
      message: `Native event type \`${parsedValue.type}\` is not recognized.`,
    });
  });

  if (!hasTerminalResult) {
    diagnostics.push({
      code: "missing-terminal-result",
      lineNumber: null,
      message: "The stream ended without a native result record.",
    });
  }

  for (const toolCallIdentifier of pendingToolCallIdentifiers) {
    diagnostics.push({
      code: "unterminated-tool-call",
      lineNumber: null,
      message: `Tool call \`${toolCallIdentifier}\` has no result record.`,
    });
  }

  const isUnsupported = diagnostics.some(
    (diagnostic) => diagnostic.code === "unsupported-version",
  );

  return {
    diagnostics,
    events,
    observedClaudeCodeVersion,
    rawRecords,
    status: isUnsupported
      ? "unsupported"
      : diagnostics.length === 0
        ? "complete"
        : "partial",
  };
}

export {
  type ClaudeCodeReplay,
  type ClaudeCodeReplayOptions,
  type ProposedNormalizedEvent,
  type ProposedNormalizedEventType,
  type RawReplayRecord,
  type ReplayDiagnostic,
  type ReplayDiagnosticCode,
  replayClaudeCodeStream,
};
