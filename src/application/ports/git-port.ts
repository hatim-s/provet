/** Describes the repository provenance exposed to later application services. */
interface GitRepositoryState {
  commit: string;
  isDirty: boolean;
}

/** Reads Git provenance without exposing command execution to the application. */
interface GitPort {
  /** Returns repository state or null when the directory has no Git provenance. */
  readRepositoryState(
    workingDirectory: string,
  ): Promise<GitRepositoryState | null>;
}

export type { GitPort, GitRepositoryState };
