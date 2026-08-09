type SerializedJsonPrimitive = boolean | null | number | string;

/** Describes data that can cross a JSON or JSONL public boundary without coercion. */
type SerializedJsonValue =
  | SerializedJsonPrimitive
  | readonly SerializedJsonValue[]
  | { readonly [propertyName: string]: SerializedJsonValue };

export type { SerializedJsonPrimitive, SerializedJsonValue };
