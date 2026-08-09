import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

/** Identifies an existing path that resolves outside its trusted workspace. */
class WorkspaceContainmentProbeError extends Error {
  /** Creates an evidence-only containment failure without exposing file bytes. */
  constructor() {
    super("The resolved path is outside the allowed workspace.");
    this.name = "WorkspaceContainmentProbeError";
  }
}

/**
 * Resolves an existing candidate through symlinks and rejects paths outside the
 * canonical workspace root.
 */
async function resolveContainedWorkspacePathProbe(
  workspaceRoot: string,
  candidatePath: string,
): Promise<string> {
  const canonicalWorkspaceRoot = await realpath(workspaceRoot);
  const canonicalCandidatePath = await realpath(
    resolve(canonicalWorkspaceRoot, candidatePath),
  );
  const workspaceRelativePath = relative(
    canonicalWorkspaceRoot,
    canonicalCandidatePath,
  );

  if (
    workspaceRelativePath === ".." ||
    workspaceRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(workspaceRelativePath)
  ) {
    throw new WorkspaceContainmentProbeError();
  }

  return canonicalCandidatePath;
}

export { resolveContainedWorkspacePathProbe, WorkspaceContainmentProbeError };
