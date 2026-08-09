/** Owns terminal byte streams and presentation capabilities at the CLI edge. */
interface TerminalPort {
  /** Returns the stdout width when the host exposes one. */
  getStandardOutputWidth(): number | null;

  /** Reports whether stderr is connected to an interactive terminal. */
  isStandardErrorInteractive(): boolean;

  /** Writes exact bytes to stderr. */
  writeStandardError(text: string): Promise<void>;

  /** Writes exact bytes to stdout. */
  writeStandardOutput(text: string): Promise<void>;
}

export type { TerminalPort };
