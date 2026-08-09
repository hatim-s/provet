interface JsonObject {
  [key: string]: unknown;
  apiKeySource?: unknown;
  claude_code_version?: unknown;
  content?: unknown;
  cwd?: unknown;
  duration_api_ms?: unknown;
  duration_ms?: unknown;
  error?: unknown;
  errors?: unknown;
  id?: unknown;
  input?: unknown;
  is_error?: unknown;
  isError?: unknown;
  message?: unknown;
  model?: unknown;
  modelUsage?: unknown;
  mcp_servers?: unknown;
  name?: unknown;
  num_turns?: unknown;
  output_style?: unknown;
  parent_tool_use_id?: unknown;
  permissionMode?: unknown;
  permission_denials?: unknown;
  plugins?: unknown;
  result?: unknown;
  stop_reason?: unknown;
  subtype?: unknown;
  session_id?: unknown;
  skills?: unknown;
  slash_commands?: unknown;
  terminal_reason?: unknown;
  text?: unknown;
  tool_use_id?: unknown;
  tool_use_result?: unknown;
  toolCallId?: unknown;
  total_cost_usd?: unknown;
  tools?: unknown;
  type?: unknown;
  usage?: unknown;
  uuid?: unknown;
}

type ReplayDiagnosticCode =
  | "duplicate-init"
  | "invalid-init-shape"
  | "invalid-result-shape"
  | "invalid-system-shape"
  | "malformed-json"
  | "missing-init"
  | "missing-terminal-result"
  | "record-after-terminal"
  | "tool-result-without-call"
  | "unknown-content-block"
  | "unknown-event"
  | "unknown-result-subtype"
  | "unknown-system-subtype"
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

interface ReplayVersionProvenance {
  candidateVersions: readonly string[];
  evidenceClass: "schema-derived-or-synthetic-replay";
  isLiveCompatibilityEvidence: false;
  observedVersion: string | null;
  source: "system-init" | "unavailable";
  sourceLineNumber: number | null;
}

interface ClaudeCodeReplay {
  diagnostics: readonly ReplayDiagnostic[];
  events: readonly ProposedNormalizedEvent[];
  observedClaudeCodeVersion: string | null;
  rawRecords: readonly RawReplayRecord[];
  status: "complete" | "partial" | "unsupported";
  trajectoryEvidence: "complete" | "degraded" | "unavailable";
  versionProvenance: ReplayVersionProvenance;
}

type ReplayStreamState =
  | "awaiting-init"
  | "streaming"
  | "terminal"
  | "unsupported";

const KNOWN_PROVIDER_NOTICE_TYPES = new Set([
  "auth_status",
  "conversation_reset",
  "prompt_suggestion",
  "rate_limit_event",
  "stream_event",
  "tool_progress",
  "tool_use_summary",
]);

const KNOWN_RESULT_SUBTYPES = new Set([
  "error_during_execution",
  "error_max_budget_usd",
  "error_max_structured_output_retries",
  "error_max_turns",
  "success",
]);

// This exact set comes from the SDKMessage union in the inspected
// @anthropic-ai/claude-agent-sdk@0.3.226 declaration file. It is intentionally
// version-pinned: additive future subtypes must degrade replay evidence until
// reviewed rather than being treated as harmless notices.
const KNOWN_SYSTEM_NOTICE_SUBTYPES = new Set([
  "api_retry",
  "background_tasks_changed",
  "commands_changed",
  "compact_boundary",
  "control_request_progress",
  "elicitation_complete",
  "files_persisted",
  "hook_progress",
  "hook_response",
  "hook_started",
  "informational",
  "local_command_output",
  "memory_recall",
  "mirror_error",
  "model_refusal_fallback",
  "model_refusal_no_fallback",
  "notification",
  "permission_denied",
  "plugin_install",
  "session_state_changed",
  "status",
  "task_notification",
  "task_progress",
  "task_started",
  "task_updated",
  "thinking_tokens",
  "worker_shutting_down",
]);

/** Returns true only for non-null JSON objects that are safe to inspect by key. */
function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns true only for finite numeric fields in a published native shape. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Validates provenance fields shared by published system notice records. */
function hasMessageProvenance(nativeEvent: JsonObject): boolean {
  return (
    typeof nativeEvent.uuid === "string" &&
    typeof nativeEvent.session_id === "string"
  );
}

/** Validates the required framing fields of the inspected system/init shape. */
function hasValidInitShape(
  nativeEvent: JsonObject,
): nativeEvent is JsonObject & { claude_code_version: string } {
  return (
    typeof nativeEvent.apiKeySource === "string" &&
    typeof nativeEvent.claude_code_version === "string" &&
    nativeEvent.claude_code_version.length > 0 &&
    typeof nativeEvent.cwd === "string" &&
    Array.isArray(nativeEvent.tools) &&
    Array.isArray(nativeEvent.mcp_servers) &&
    typeof nativeEvent.model === "string" &&
    typeof nativeEvent.permissionMode === "string" &&
    Array.isArray(nativeEvent.slash_commands) &&
    typeof nativeEvent.output_style === "string" &&
    Array.isArray(nativeEvent.skills) &&
    Array.isArray(nativeEvent.plugins) &&
    typeof nativeEvent.uuid === "string" &&
    typeof nativeEvent.session_id === "string"
  );
}

/** Validates the stable required fields shared by known terminal result shapes. */
function hasValidResultShape(nativeEvent: JsonObject): boolean {
  if (
    typeof nativeEvent.subtype !== "string" ||
    !KNOWN_RESULT_SUBTYPES.has(nativeEvent.subtype) ||
    !isFiniteNumber(nativeEvent.duration_ms) ||
    !isFiniteNumber(nativeEvent.duration_api_ms) ||
    typeof nativeEvent.is_error !== "boolean" ||
    !isFiniteNumber(nativeEvent.num_turns) ||
    !isFiniteNumber(nativeEvent.total_cost_usd) ||
    !(
      typeof nativeEvent.stop_reason === "string" ||
      nativeEvent.stop_reason === null
    ) ||
    !isJsonObject(nativeEvent.usage) ||
    !isJsonObject(nativeEvent.modelUsage) ||
    !Array.isArray(nativeEvent.permission_denials) ||
    typeof nativeEvent.uuid !== "string" ||
    typeof nativeEvent.session_id !== "string"
  ) {
    return false;
  }

  if (nativeEvent.subtype === "success") {
    return (
      nativeEvent.is_error === false && typeof nativeEvent.result === "string"
    );
  }

  return nativeEvent.is_error === true && Array.isArray(nativeEvent.errors);
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
  let hasSeenInitRecord = false;
  let hasTerminalResult = false;
  let hasValidInit = false;
  let isUnsupportedVersion = false;
  let replayStreamState: ReplayStreamState = "awaiting-init";
  let observedClaudeCodeVersion: string | null = null;
  let versionSourceLineNumber: number | null = null;

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
      if (hasSeenInitRecord) {
        diagnostics.push({
          code: "duplicate-init",
          lineNumber,
          message: "The stream contains more than one system/init record.",
        });
        return;
      }

      hasSeenInitRecord = true;
      versionSourceLineNumber = lineNumber;
      observedClaudeCodeVersion =
        typeof parsedValue.claude_code_version === "string"
          ? parsedValue.claude_code_version
          : null;

      if (!hasValidInitShape(parsedValue)) {
        diagnostics.push({
          code: "invalid-init-shape",
          lineNumber,
          message:
            "The system/init record is missing required schema-candidate framing fields.",
        });
        return;
      }

      hasValidInit = true;
      const validatedClaudeCodeVersion = parsedValue.claude_code_version;

      if (
        !options.supportedClaudeCodeVersions.includes(
          validatedClaudeCodeVersion,
        )
      ) {
        replayStreamState = "unsupported";
        isUnsupportedVersion = true;
        diagnostics.push({
          code: "unsupported-version",
          lineNumber,
          message: `Claude Code version \`${observedClaudeCodeVersion}\` is not supported.`,
        });
        return;
      }

      replayStreamState = "streaming";
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

      return;
    }

    if (replayStreamState === "unsupported") {
      return;
    }

    if (replayStreamState === "awaiting-init") {
      if (
        !diagnostics.some((diagnostic) => diagnostic.code === "missing-init")
      ) {
        diagnostics.push({
          code: "missing-init",
          lineNumber,
          message: `Native event type \`${parsedValue.type}\` appeared before the required system/init record.`,
        });
      }
      return;
    }

    if (replayStreamState === "terminal") {
      diagnostics.push({
        code: "record-after-terminal",
        lineNumber,
        message: `Native event type \`${parsedValue.type}\` appeared after the terminal result.`,
      });
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
      if (
        typeof parsedValue.subtype !== "string" ||
        !KNOWN_RESULT_SUBTYPES.has(parsedValue.subtype)
      ) {
        diagnostics.push({
          code: "unknown-result-subtype",
          lineNumber,
          message: `Result subtype \`${typeof parsedValue.subtype === "string" ? parsedValue.subtype : "missing"}\` is not recognized for the schema candidate.`,
        });
        return;
      }

      if (!hasValidResultShape(parsedValue)) {
        diagnostics.push({
          code: "invalid-result-shape",
          lineNumber,
          message: `Result subtype \`${parsedValue.subtype}\` is missing required schema-candidate fields.`,
        });
        return;
      }

      replayStreamState = "terminal";
      hasTerminalResult = true;
      mapResultEvent(parsedValue, lineNumber, events);
      return;
    }

    if (parsedValue.type === "system") {
      if (
        typeof parsedValue.subtype !== "string" ||
        !KNOWN_SYSTEM_NOTICE_SUBTYPES.has(parsedValue.subtype)
      ) {
        diagnostics.push({
          code: "unknown-system-subtype",
          lineNumber,
          message: `System subtype \`${typeof parsedValue.subtype === "string" ? parsedValue.subtype : "missing"}\` is not recognized for the schema candidate.`,
        });
        return;
      }

      if (!hasMessageProvenance(parsedValue)) {
        diagnostics.push({
          code: "invalid-system-shape",
          lineNumber,
          message: `System subtype \`${parsedValue.subtype}\` is missing required provenance fields.`,
        });
        return;
      }

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

    if (KNOWN_PROVIDER_NOTICE_TYPES.has(parsedValue.type)) {
      appendNormalizedEvent(
        events,
        "provider_notice",
        { nativeSubtype: null, nativeType: parsedValue.type },
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

  if (!hasValidInit && !isUnsupportedVersion) {
    if (!diagnostics.some((diagnostic) => diagnostic.code === "missing-init")) {
      diagnostics.push({
        code: "missing-init",
        lineNumber: null,
        message: "The stream ended without one valid system/init record.",
      });
    }
  }

  if (!hasTerminalResult && !isUnsupportedVersion) {
    diagnostics.push({
      code: "missing-terminal-result",
      lineNumber: null,
      message: "The stream ended without a coherent native result record.",
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
  const status = isUnsupported
    ? "unsupported"
    : diagnostics.length === 0
      ? "complete"
      : "partial";

  return {
    diagnostics,
    events,
    observedClaudeCodeVersion,
    rawRecords,
    status,
    trajectoryEvidence:
      isUnsupported || !hasValidInit
        ? "unavailable"
        : status === "complete"
          ? "complete"
          : "degraded",
    versionProvenance: {
      candidateVersions: [...options.supportedClaudeCodeVersions],
      evidenceClass: "schema-derived-or-synthetic-replay",
      isLiveCompatibilityEvidence: false,
      observedVersion: observedClaudeCodeVersion,
      source: hasSeenInitRecord ? "system-init" : "unavailable",
      sourceLineNumber: versionSourceLineNumber,
    },
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
  type ReplayVersionProvenance,
  replayClaudeCodeStream,
};
