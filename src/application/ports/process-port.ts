/** Isolates host-process arguments and exit status from command orchestration. */
interface ProcessPort {
  /** Returns command arguments without the runtime and entry-point paths. */
  getArguments(): readonly string[];

  /** Records the process exit status without terminating eagerly. */
  setExitCode(exitCode: number): void;
}

export type { ProcessPort };
