import type { PublicSchemaVersion } from "../versioning/schema-version.js";
import type { SerializedJsonValue } from "../versioning/serialized-json-value.js";

/**
 * Reserves event ownership while SPI-04 and SPI-05 determine lifecycle payloads,
 * terminal sequencing, and byte-level stream rules.
 */
interface RunEventRecord {
  data: SerializedJsonValue;
  eventType: string;
  occurredAt: string;
  runId: string;
  schemaVersion: PublicSchemaVersion;
  sequence: number;
}

interface RunEventPort {
  publishRunEvent(event: RunEventRecord): Promise<void>;
}

export type { RunEventPort, RunEventRecord };
