import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import type {
  GitRepositoryState,
  VetEffectPorts,
} from "../application/ports/index.js";

const executeFile = promisify(execFile);

/** Reads current Git provenance without leaking subprocess details inward. */
async function readRepositoryState(
  workingDirectory: string,
): Promise<GitRepositoryState | null> {
  try {
    const [revisionExecution, statusExecution] = await Promise.all([
      executeFile("git", ["rev-parse", "HEAD"], {
        cwd: workingDirectory,
        encoding: "utf8",
      }),
      executeFile("git", ["status", "--porcelain"], {
        cwd: workingDirectory,
        encoding: "utf8",
      }),
    ]);

    return {
      commit: revisionExecution.stdout.trim(),
      isDirty: statusExecution.stdout.length > 0,
    };
  } catch {
    // A missing Git binary and a non-repository directory both mean provenance is unavailable.
    return null;
  }
}

/** Creates concrete host adapters only at the executable composition boundary. */
function createSystemVetEffectPorts(): VetEffectPorts {
  return {
    clock: {
      getCurrentTime: () => new Date(),
    },
    fileSystem: {
      readTextFile: (filePath) => readFile(filePath, "utf8"),
    },
    git: {
      readRepositoryState,
    },
    identifierGenerator: {
      generateIdentifier: () => randomUUID(),
    },
    process: {
      getArguments: () => process.argv.slice(2),
      setExitCode: (exitCode) => {
        process.exitCode = exitCode;
      },
    },
    terminal: {
      getStandardOutputWidth: () => process.stdout.columns ?? null,
      isStandardErrorInteractive: () => process.stderr.isTTY,
      writeStandardError: (text) => {
        process.stderr.write(text);
      },
      writeStandardOutput: (text) => {
        process.stdout.write(text);
      },
    },
  };
}

export { createSystemVetEffectPorts };
