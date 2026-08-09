/** Generates opaque identifiers through an injectable source of nondeterminism. */
interface IdentifierGeneratorPort {
  /** Returns a new opaque identifier. */
  generateIdentifier(): string;
}

export type { IdentifierGeneratorPort };
