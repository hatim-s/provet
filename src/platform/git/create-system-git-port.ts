import { spawn } from "node:child_process";

import type {
  GitPort,
  GitRepositoryState,
} from "../../application/ports/index.js";

type GitExecutionFailureCode =
  | "exit-failed"
  | "invalid-output"
  | "output-limit"
  | "spawn-failed"
  | "timed-out";

interface GitExecutionResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  standardError: string;
  standardOutput: string;
}

interface SystemGitPortOptions {
  environment: Readonly<Record<string, string>>;
  executable: string;
  maximumOutputBytes: number;
  terminationGraceMs: number;
  timeoutMs: number;
}

interface GitExecutionErrorOptions {
  cause?: unknown;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
}

/** Preserves the stage and cause of a bounded Git execution failure. */
class GitExecutionError extends Error {
  readonly code: GitExecutionFailureCode;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;

  /** Creates an internal Git error without collapsing its execution identity. */
  constructor(
    code: GitExecutionFailureCode,
    message: string,
    options: GitExecutionErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "GitExecutionError";
    this.code = code;
    this.exitCode = options.exitCode ?? null;
    this.signal = options.signal ?? null;
  }
}

/** Creates the explicit, minimal host contract used for Git provenance reads. */
function createDefaultSystemGitPortOptions(): SystemGitPortOptions {
  const { PATH: executableSearchPath } = process.env;

  return {
    environment: {
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: executableSearchPath ?? "",
    },
    executable: "git",
    maximumOutputBytes: 1_048_576,
    terminationGraceMs: 100,
    timeoutMs: 2_000,
  };
}

/** Signals the detached Git process group, falling back to the direct child. */
function signalProcessGroup(
  processIdentifier: number | undefined,
  signal: NodeJS.Signals,
): void {
  if (processIdentifier === undefined) {
    return;
  }

  try {
    process.kill(-processIdentifier, signal);
  } catch {
    try {
      process.kill(processIdentifier, signal);
    } catch {
      // The group was already reaped between observation and signalling.
    }
  }
}

/** Executes one bounded porcelain-v2 status command and reaps its process tree. */
function executeGitStatus(
  workingDirectory: string,
  options: SystemGitPortOptions,
): Promise<GitExecutionResult> {
  return new Promise((resolve, reject) => {
    let childProcess: ReturnType<typeof spawn>;
    try {
      childProcess = spawn(
        options.executable,
        [
          "--no-optional-locks",
          "-C",
          workingDirectory,
          "status",
          "--porcelain=v2",
          "--branch",
          "--untracked-files=normal",
        ],
        {
          detached: true,
          env: options.environment,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (cause) {
      reject(
        new GitExecutionError("spawn-failed", "Git failed to start.", {
          cause,
        }),
      );
      return;
    }

    const standardErrorStream = childProcess.stderr;
    const standardOutputStream = childProcess.stdout;
    if (!standardErrorStream || !standardOutputStream) {
      signalProcessGroup(childProcess.pid, "SIGKILL");
      reject(
        new GitExecutionError(
          "spawn-failed",
          "Git output pipes were unavailable.",
        ),
      );
      return;
    }

    const standardErrorChunks: Buffer[] = [];
    const standardOutputChunks: Buffer[] = [];
    let capturedOutputBytes = 0;
    let failure: GitExecutionError | null = null;
    let terminationTimer: ReturnType<typeof setTimeout> | undefined;

    /** Starts bounded process-group termination while retaining the first failure. */
    const terminate = (nextFailure?: GitExecutionError): void => {
      failure ??= nextFailure ?? null;
      signalProcessGroup(childProcess.pid, "SIGTERM");
      terminationTimer ??= setTimeout(() => {
        signalProcessGroup(childProcess.pid, "SIGKILL");
      }, options.terminationGraceMs);
    };

    /** Captures output until the configured combined byte ceiling is reached. */
    const captureChunk = (chunks: Buffer[], chunk: Buffer): void => {
      if (failure) {
        return;
      }

      capturedOutputBytes += chunk.byteLength;
      if (capturedOutputBytes > options.maximumOutputBytes) {
        terminate(
          new GitExecutionError(
            "output-limit",
            "Git exceeded its output limit.",
          ),
        );
        return;
      }

      chunks.push(chunk);
    };

    standardOutputStream.on("data", (chunk: Buffer) => {
      captureChunk(standardOutputChunks, chunk);
    });
    standardErrorStream.on("data", (chunk: Buffer) => {
      captureChunk(standardErrorChunks, chunk);
    });
    childProcess.once("error", (cause) => {
      failure ??= new GitExecutionError(
        "spawn-failed",
        "Git failed to start.",
        { cause },
      );
    });
    childProcess.once("exit", (exitCode, signal) => {
      if (exitCode !== 0 || signal !== null) {
        // A failed leader must not leave descendants holding pipes or mutating state.
        terminate();
      }
    });

    const timeoutTimer = setTimeout(() => {
      terminate(new GitExecutionError("timed-out", "Git execution timed out."));
    }, options.timeoutMs);

    childProcess.once("close", (exitCode, signal) => {
      clearTimeout(timeoutTimer);
      if (terminationTimer !== undefined) {
        clearTimeout(terminationTimer);
        // The leader is closed; kill any descendant that detached its stdio before returning.
        signalProcessGroup(childProcess.pid, "SIGKILL");
      }

      if (failure) {
        reject(failure);
        return;
      }

      resolve({
        exitCode,
        signal,
        standardError: Buffer.concat(standardErrorChunks).toString("utf8"),
        standardOutput: Buffer.concat(standardOutputChunks).toString("utf8"),
      });
    });
  });
}

/** Parses one successful porcelain-v2 status response into repository state. */
function parseRepositoryState(standardOutput: string): GitRepositoryState {
  const outputLines = standardOutput.split(/\r?\n/u).filter(Boolean);
  const commitLine = outputLines.find((line) =>
    line.startsWith("# branch.oid "),
  );
  const commit = commitLine?.slice("# branch.oid ".length);

  if (!commit || commit === "(initial)") {
    throw new GitExecutionError(
      "invalid-output",
      "Git did not return a committed repository revision.",
    );
  }

  return {
    commit,
    isDirty: outputLines.some((line) => !line.startsWith("# ")),
  };
}

/** Creates the bounded system Git adapter used by the executable composition. */
function createSystemGitPort(
  options = createDefaultSystemGitPortOptions(),
): GitPort {
  return {
    readRepositoryState: async (workingDirectory) => {
      const execution = await executeGitStatus(workingDirectory, options);

      if (execution.exitCode === 0 && execution.signal === null) {
        return parseRepositoryState(execution.standardOutput);
      }

      const normalizedStandardError = execution.standardError.toLowerCase();
      if (
        execution.exitCode === 128 &&
        normalizedStandardError.includes("not a git repository")
      ) {
        return null;
      }

      throw new GitExecutionError("exit-failed", "Git status failed.", {
        cause: new Error(execution.standardError.trim() || "Git exited."),
        exitCode: execution.exitCode,
        signal: execution.signal,
      });
    },
  };
}

export {
  createSystemGitPort,
  GitExecutionError,
  type GitExecutionFailureCode,
  type SystemGitPortOptions,
};
