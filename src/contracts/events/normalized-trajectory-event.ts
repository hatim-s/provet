import type { InvocationMeasurements } from "../invocation/invocation-measurements.js";
import type { SerializedJsonValue } from "../versioning/serialized-json-value.js";

interface TrajectoryStepEvent {
  sequence: number;
  stepNumber: number;
  type: "step";
}

interface TrajectoryMessageEvent {
  role: "assistant" | "system" | "tool" | "user";
  sequence: number;
  text: string;
  type: "message";
}

interface TrajectoryToolCallEvent {
  durationMs: number | null;
  input: SerializedJsonValue;
  name: string;
  result: SerializedJsonValue | null;
  sequence: number;
  type: "tool_call";
}

interface TrajectoryResultEvent {
  measurements: InvocationMeasurements;
  output: string;
  sequence: number;
  type: "result";
}

/** Defines only the provider-neutral trajectory minimum proven by the product plan. */
type NormalizedTrajectoryEvent =
  | TrajectoryMessageEvent
  | TrajectoryResultEvent
  | TrajectoryStepEvent
  | TrajectoryToolCallEvent;

export type {
  NormalizedTrajectoryEvent,
  TrajectoryMessageEvent,
  TrajectoryResultEvent,
  TrajectoryStepEvent,
  TrajectoryToolCallEvent,
};
