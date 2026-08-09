/** Identifies the only public contract schema version supported by Provet v1. */
const PUBLIC_SCHEMA_VERSION = 1 as const;

type PublicSchemaVersion = typeof PUBLIC_SCHEMA_VERSION;

export { PUBLIC_SCHEMA_VERSION, type PublicSchemaVersion };
