interface JsonObject {
  [key: string]: unknown;
  apiKeySource?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  claude_code_version?: unknown;
  content?: unknown;
  costUSD?: unknown;
  contextWindow?: unknown;
  cwd?: unknown;
  data?: unknown;
  duration_api_ms?: unknown;
  duration_ms?: unknown;
  error?: unknown;
  errors?: unknown;
  id?: unknown;
  input?: unknown;
  input_tokens?: unknown;
  inputTokens?: unknown;
  is_error?: unknown;
  isError?: unknown;
  message?: unknown;
  model?: unknown;
  modelUsage?: unknown;
  mcp_servers?: unknown;
  name?: unknown;
  num_turns?: unknown;
  output_style?: unknown;
  output_tokens?: unknown;
  outputTokens?: unknown;
  parent_tool_use_id?: unknown;
  permissionMode?: unknown;
  permission_denials?: unknown;
  plugins?: unknown;
  result?: unknown;
  role?: unknown;
  server_tool_use?: unknown;
  service_tier?: unknown;
  signature?: unknown;
  stop_reason?: unknown;
  stop_sequence?: unknown;
  subtype?: unknown;
  session_id?: unknown;
  skills?: unknown;
  slash_commands?: unknown;
  terminal_reason?: unknown;
  text?: unknown;
  thinking?: unknown;
  tool_input?: unknown;
  tool_name?: unknown;
  tool_use_id?: unknown;
  tool_use_result?: unknown;
  toolCallId?: unknown;
  total_cost_usd?: unknown;
  tools?: unknown;
  type?: unknown;
  usage?: unknown;
  uuid?: unknown;
  web_fetch_requests?: unknown;
  web_search_requests?: unknown;
  webSearchRequests?: unknown;
  cacheCreationInputTokens?: unknown;
  cacheReadInputTokens?: unknown;
  maxOutputTokens?: unknown;
}

type ReplayDiagnosticCode =
  | "duplicate-tool-call"
  | "duplicate-init"
  | "invalid-assistant-message-shape"
  | "invalid-content-block"
  | "invalid-init-shape"
  | "invalid-result-shape"
  | "invalid-system-shape"
  | "invalid-user-message-shape"
  | "malformed-json"
  | "missing-init"
  | "missing-terminal-result"
  | "record-after-terminal"
  | "tool-result-without-call"
  | "unvalidated-provider-notice-shape"
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

// These top-level SDK union members are recognized but deliberately remain
// raw-only until each complete nested shape is pinned and validated. A known
// discriminator alone is not sufficient evidence for lossless replay.
const RAW_ONLY_PROVIDER_NOTICE_TYPES = new Set([
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

// Exact TerminalReason union from @anthropic-ai/claude-agent-sdk@0.3.226.
// A future string member is protocol drift until the candidate is reviewed.
const KNOWN_TERMINAL_REASONS = new Set([
  "aborted_streaming",
  "aborted_tools",
  "api_error",
  "background_requested",
  "blocking_limit",
  "budget_exhausted",
  "completed",
  "hook_stopped",
  "image_error",
  "malformed_tool_use_exhausted",
  "max_turns",
  "model_error",
  "prompt_too_long",
  "rapid_refill_breaker",
  "stop_hook_prevented",
  "structured_output_retry_exhausted",
  "tool_deferred",
  "tool_deferred_unavailable",
  "turn_setup_failed",
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

/** Returns true for finite counters or costs that cannot be negative. */
function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

/** Returns true for finite integer counters that cannot be negative. */
function isNonNegativeInteger(value: unknown): value is number {
  return isNonNegativeFiniteNumber(value) && Number.isInteger(value);
}

/** Validates provenance fields shared by published system notice records. */
function hasMessageProvenance(nativeEvent: JsonObject): boolean {
  return (
    typeof nativeEvent.uuid === "string" &&
    typeof nativeEvent.session_id === "string"
  );
}

/** Validates the required token counters shared by assistant and result usage. */
function hasCoreTokenUsageShape(usage: unknown): usage is JsonObject {
  return (
    isJsonObject(usage) &&
    isNonNegativeInteger(usage.input_tokens) &&
    isNonNegativeInteger(usage.cache_creation_input_tokens) &&
    isNonNegativeInteger(usage.cache_read_input_tokens) &&
    isNonNegativeInteger(usage.output_tokens)
  );
}

/** Validates the pinned assistant message envelope before mapping its blocks. */
function hasValidAssistantMessageShape(nativeEvent: JsonObject): boolean {
  const message = nativeEvent.message;

  return (
    isJsonObject(message) &&
    typeof message.id === "string" &&
    message.type === "message" &&
    message.role === "assistant" &&
    typeof message.model === "string" &&
    Array.isArray(message.content) &&
    (typeof message.stop_reason === "string" || message.stop_reason === null) &&
    (typeof message.stop_sequence === "string" ||
      message.stop_sequence === null) &&
    hasCoreTokenUsageShape(message.usage) &&
    (typeof nativeEvent.parent_tool_use_id === "string" ||
      nativeEvent.parent_tool_use_id === null) &&
    hasMessageProvenance(nativeEvent)
  );
}

/** Validates the pinned user message envelope before mapping its blocks. */
function hasValidUserMessageShape(nativeEvent: JsonObject): boolean {
  const message = nativeEvent.message;

  return (
    isJsonObject(message) &&
    message.role === "user" &&
    Array.isArray(message.content) &&
    (typeof nativeEvent.parent_tool_use_id === "string" ||
      nativeEvent.parent_tool_use_id === null) &&
    (nativeEvent.uuid === undefined || typeof nativeEvent.uuid === "string") &&
    (nativeEvent.session_id === undefined ||
      typeof nativeEvent.session_id === "string")
  );
}

/** Validates the pinned cumulative result usage object recursively. */
function hasValidResultUsageShape(usage: unknown): boolean {
  if (!hasCoreTokenUsageShape(usage)) {
    return false;
  }

  const serverToolUse = usage.server_tool_use;
  return (
    isJsonObject(serverToolUse) &&
    isNonNegativeInteger(serverToolUse.web_search_requests) &&
    isNonNegativeInteger(serverToolUse.web_fetch_requests) &&
    typeof usage.service_tier === "string" &&
    usage.service_tier.length > 0
  );
}

/** Validates one pinned ModelUsage entry including counters and USD estimate. */
function hasValidModelUsageEntry(modelUsage: unknown): boolean {
  return (
    isJsonObject(modelUsage) &&
    isNonNegativeInteger(modelUsage.inputTokens) &&
    isNonNegativeInteger(modelUsage.outputTokens) &&
    isNonNegativeInteger(modelUsage.cacheReadInputTokens) &&
    isNonNegativeInteger(modelUsage.cacheCreationInputTokens) &&
    isNonNegativeInteger(modelUsage.webSearchRequests) &&
    isNonNegativeFiniteNumber(modelUsage.costUSD) &&
    isNonNegativeInteger(modelUsage.contextWindow) &&
    isNonNegativeInteger(modelUsage.maxOutputTokens)
  );
}

/** Validates every per-model cumulative usage entry under its native model key. */
function hasValidModelUsageShape(modelUsage: unknown): boolean {
  return (
    isJsonObject(modelUsage) &&
    Object.entries(modelUsage).every(
      ([modelName, usage]) =>
        modelName.length > 0 && hasValidModelUsageEntry(usage),
    )
  );
}

/** Validates every terminal permission denial against the pinned SDK shape. */
function hasValidPermissionDenialsShape(permissionDenials: unknown): boolean {
  return (
    Array.isArray(permissionDenials) &&
    permissionDenials.every(
      (permissionDenial) =>
        isJsonObject(permissionDenial) &&
        typeof permissionDenial.tool_name === "string" &&
        permissionDenial.tool_name.length > 0 &&
        typeof permissionDenial.tool_use_id === "string" &&
        permissionDenial.tool_use_id.length > 0 &&
        isJsonObject(permissionDenial.tool_input),
    )
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
    !isNonNegativeFiniteNumber(nativeEvent.duration_ms) ||
    !isNonNegativeFiniteNumber(nativeEvent.duration_api_ms) ||
    typeof nativeEvent.is_error !== "boolean" ||
    !isNonNegativeInteger(nativeEvent.num_turns) ||
    !isNonNegativeFiniteNumber(nativeEvent.total_cost_usd) ||
    !(
      typeof nativeEvent.stop_reason === "string" ||
      nativeEvent.stop_reason === null
    ) ||
    !hasValidResultUsageShape(nativeEvent.usage) ||
    !hasValidModelUsageShape(nativeEvent.modelUsage) ||
    !hasValidPermissionDenialsShape(nativeEvent.permission_denials) ||
    !(
      nativeEvent.terminal_reason === undefined ||
      (typeof nativeEvent.terminal_reason === "string" &&
        KNOWN_TERMINAL_REASONS.has(nativeEvent.terminal_reason))
    ) ||
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

  return (
    nativeEvent.is_error === true &&
    Array.isArray(nativeEvent.errors) &&
    nativeEvent.errors.every((error) => typeof error === "string")
  );
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
  pendingToolCallCounts: Map<string, number>,
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

    if (contentBlock.type === "text") {
      if (typeof contentBlock.text !== "string") {
        diagnostics.push({
          code: "invalid-content-block",
          lineNumber,
          message: `Assistant text block ${contentBlockIndex} has no string text field.`,
        });
        return;
      }

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

    if (contentBlock.type === "tool_use") {
      if (
        typeof contentBlock.id !== "string" ||
        contentBlock.id.length === 0 ||
        typeof contentBlock.name !== "string" ||
        contentBlock.name.length === 0 ||
        !isJsonObject(contentBlock.input)
      ) {
        diagnostics.push({
          code: "invalid-content-block",
          lineNumber,
          message: `Assistant tool_use block ${contentBlockIndex} is missing its id, name, or object input.`,
        });
        return;
      }

      const pendingToolCallCount =
        pendingToolCallCounts.get(contentBlock.id) ?? 0;
      if (pendingToolCallCount > 0) {
        diagnostics.push({
          code: "duplicate-tool-call",
          lineNumber,
          message: `Tool call identifier \`${contentBlock.id}\` is already pending.`,
        });
      }
      pendingToolCallCounts.set(contentBlock.id, pendingToolCallCount + 1);
      appendNormalizedEvent(
        events,
        "tool_call_started",
        {
          input: contentBlock.input,
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

    // Thinking blocks remain raw-only, but their pinned required fields still
    // need validation so malformed native bytes cannot look lossless.
    if (contentBlock.type === "thinking") {
      if (
        typeof contentBlock.thinking !== "string" ||
        typeof contentBlock.signature !== "string"
      ) {
        diagnostics.push({
          code: "invalid-content-block",
          lineNumber,
          message: `Assistant thinking block ${contentBlockIndex} is missing thinking or signature text.`,
        });
      }
      return;
    }

    if (contentBlock.type === "redacted_thinking") {
      if (typeof contentBlock.data !== "string") {
        diagnostics.push({
          code: "invalid-content-block",
          lineNumber,
          message: `Assistant redacted_thinking block ${contentBlockIndex} has no string data field.`,
        });
      }
      return;
    }

    diagnostics.push({
      code: "unknown-content-block",
      lineNumber,
      message: `Assistant content block type \`${contentBlock.type}\` is not recognized.`,
    });
  });
}

/** Maps tool results and verifies that each result refers to a prior call. */
function mapUserEvent(
  nativeEvent: JsonObject,
  lineNumber: number,
  events: ProposedNormalizedEvent[],
  diagnostics: ReplayDiagnostic[],
  pendingToolCallCounts: Map<string, number>,
): void {
  readMessageContent(nativeEvent).forEach((contentBlock, contentBlockIndex) => {
    if (!isJsonObject(contentBlock) || typeof contentBlock.type !== "string") {
      diagnostics.push({
        code: "unknown-content-block",
        lineNumber,
        message: `User content block ${contentBlockIndex} has no supported discriminator.`,
      });
      return;
    }

    if (contentBlock.type === "text") {
      if (typeof contentBlock.text !== "string") {
        diagnostics.push({
          code: "invalid-content-block",
          lineNumber,
          message: `User text block ${contentBlockIndex} has no string text field.`,
        });
      }
      return;
    }

    if (contentBlock.type !== "tool_result") {
      diagnostics.push({
        code: "unknown-content-block",
        lineNumber,
        message: `User content block type \`${contentBlock.type}\` is not recognized.`,
      });
      return;
    }

    if (
      typeof contentBlock.tool_use_id !== "string" ||
      contentBlock.tool_use_id.length === 0 ||
      (contentBlock.is_error !== undefined &&
        typeof contentBlock.is_error !== "boolean")
    ) {
      diagnostics.push({
        code: "invalid-content-block",
        lineNumber,
        message: `User tool_result block ${contentBlockIndex} has an invalid tool identifier or error flag.`,
      });
      return;
    }

    const pendingToolCallCount =
      pendingToolCallCounts.get(contentBlock.tool_use_id) ?? 0;
    if (pendingToolCallCount === 0) {
      diagnostics.push({
        code: "tool-result-without-call",
        lineNumber,
        message: `Tool result \`${contentBlock.tool_use_id}\` has no prior tool call.`,
      });
    } else if (pendingToolCallCount === 1) {
      pendingToolCallCounts.delete(contentBlock.tool_use_id);
    } else {
      pendingToolCallCounts.set(
        contentBlock.tool_use_id,
        pendingToolCallCount - 1,
      );
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
  const pendingToolCallCounts = new Map<string, number>();
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
      if (!hasValidAssistantMessageShape(parsedValue)) {
        diagnostics.push({
          code: "invalid-assistant-message-shape",
          lineNumber,
          message:
            "The assistant record is missing required message or provenance framing.",
        });
        return;
      }

      mapAssistantEvent(
        parsedValue,
        lineNumber,
        events,
        diagnostics,
        pendingToolCallCounts,
      );
      return;
    }

    if (parsedValue.type === "user") {
      if (!hasValidUserMessageShape(parsedValue)) {
        diagnostics.push({
          code: "invalid-user-message-shape",
          lineNumber,
          message: "The user record is missing required message framing.",
        });
        return;
      }

      mapUserEvent(
        parsedValue,
        lineNumber,
        events,
        diagnostics,
        pendingToolCallCounts,
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

    if (RAW_ONLY_PROVIDER_NOTICE_TYPES.has(parsedValue.type)) {
      diagnostics.push({
        code: "unvalidated-provider-notice-shape",
        lineNumber,
        message: `Provider notice type \`${parsedValue.type}\` is retained raw until its exact schema-candidate shape is validated.`,
      });
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

  for (const [
    toolCallIdentifier,
    pendingToolCallCount,
  ] of pendingToolCallCounts) {
    diagnostics.push({
      code: "unterminated-tool-call",
      lineNumber: null,
      message:
        pendingToolCallCount === 1
          ? `Tool call \`${toolCallIdentifier}\` has no result record.`
          : `Tool call \`${toolCallIdentifier}\` has ${pendingToolCallCount} unresolved result records.`,
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
