import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

type SubprocessProbeTerminationReason =
  | "cancelled"
  | "completed"
  | "output-limit"
  | "timed-out";

interface BoundedSubprocessProbeOptions {
  abortSignal?: AbortSignal;
  arguments: readonly string[];
  environment: Readonly<Record<string, string>>;
  executable: string;
  maximumOutputBytes: number;
  terminationGraceMs: number;
  timeoutMs: number;
  workingDirectory: string;
}

interface BoundedSubprocessProbeResult {
  capturedOutputBytes: number;
  didForceKill: boolean;
  durationMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  standardError: string;
  standardOutput: string;
  terminationReason: SubprocessProbeTerminationReason;
  terminationSignals: readonly NodeJS.Signals[];
  wasOutputTruncated: boolean;
}

/** Rejects invalid probe bounds before any subprocess can start. */
function validateBoundedSubprocessProbeOptions(
  options: BoundedSubprocessProbeOptions,
): void {
  if (
    !Number.isSafeInteger(options.maximumOutputBytes) ||
    options.maximumOutputBytes <= 0
  ) {
    throw new RangeError("maximumOutputBytes must be a positive safe integer.");
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new RangeError("timeoutMs must be positive.");
  }

  if (
    !Number.isFinite(options.terminationGraceMs) ||
    options.terminationGraceMs < 0
  ) {
    throw new RangeError("terminationGraceMs must be non-negative.");
  }
}

/** Signals the detached process group without falling back to a shell. */
function signalSubprocessProbeGroup(
  processIdentifier: number | undefined,
  signal: NodeJS.Signals | 0,
): boolean {
  if (processIdentifier === undefined) {
    return false;
  }

  try {
    process.kill(-processIdentifier, signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * Exercises the bounded subprocess mechanics proposed for RUN-02.
 *
 * This evidence-only spike is intentionally not exported from the production
 * package and does not claim containment against a child that creates a new
 * session or against host access available to the invoking user.
 */
function runBoundedSubprocessProbe(
  options: BoundedSubprocessProbeOptions,
): Promise<BoundedSubprocessProbeResult> {
  validateBoundedSubprocessProbeOptions(options);

  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const standardErrorChunks: Buffer[] = [];
    const standardOutputChunks: Buffer[] = [];
    const terminationSignals: NodeJS.Signals[] = [];
    let capturedOutputBytes = 0;
    let didClose = false;
    let didForceKill = false;
    let exitCode: number | null = null;
    let signal: NodeJS.Signals | null = null;
    let terminationReason: SubprocessProbeTerminationReason = "completed";
    let wasOutputTruncated = false;
    let terminationTimer: ReturnType<typeof setTimeout> | undefined;

    const childProcess = spawn(options.executable, [...options.arguments], {
      cwd: options.workingDirectory,
      detached: true,
      env: { ...options.environment },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const removeAbortListener = (): void => {
      options.abortSignal?.removeEventListener("abort", abortExecution);
    };

    /** Resolves only after the leader closes and its original group is gone. */
    const finishExecution = (): void => {
      if (!didClose || signalSubprocessProbeGroup(childProcess.pid, 0)) {
        return;
      }

      if (terminationTimer !== undefined) {
        clearTimeout(terminationTimer);
        terminationTimer = undefined;
      }
      removeAbortListener();
      resolve({
        capturedOutputBytes,
        didForceKill,
        durationMs: performance.now() - startedAt,
        exitCode,
        signal,
        standardError: Buffer.concat(standardErrorChunks).toString("utf8"),
        standardOutput: Buffer.concat(standardOutputChunks).toString("utf8"),
        terminationReason,
        terminationSignals,
        wasOutputTruncated,
      });
    };

    /** Requests group termination once, then escalates after the grace bound. */
    const terminateExecution = (
      nextTerminationReason: Exclude<
        SubprocessProbeTerminationReason,
        "completed"
      >,
    ): void => {
      if (terminationReason !== "completed" || terminationTimer !== undefined) {
        return;
      }

      terminationReason = nextTerminationReason;
      terminationSignals.push("SIGTERM");
      signalSubprocessProbeGroup(childProcess.pid, "SIGTERM");
      terminationTimer = setTimeout(() => {
        terminationSignals.push("SIGKILL");
        didForceKill = signalSubprocessProbeGroup(childProcess.pid, "SIGKILL");
        finishExecution();
      }, options.terminationGraceMs);
    };

    /** Converts cancellation into the same bounded group-termination path. */
    function abortExecution(): void {
      terminateExecution("cancelled");
    }

    /** Captures no more than the combined configured stdout/stderr ceiling. */
    const captureOutputChunk = (chunks: Buffer[], chunk: Buffer): void => {
      const remainingOutputBytes =
        options.maximumOutputBytes - capturedOutputBytes;
      if (remainingOutputBytes <= 0) {
        wasOutputTruncated = true;
        terminateExecution("output-limit");
        return;
      }

      const capturedChunk = chunk.subarray(0, remainingOutputBytes);
      chunks.push(capturedChunk);
      capturedOutputBytes += capturedChunk.byteLength;

      if (capturedChunk.byteLength < chunk.byteLength) {
        wasOutputTruncated = true;
        terminateExecution("output-limit");
      }
    };

    const standardErrorStream = childProcess.stderr;
    const standardOutputStream = childProcess.stdout;
    if (!standardErrorStream || !standardOutputStream) {
      signalSubprocessProbeGroup(childProcess.pid, "SIGKILL");
      reject(new Error("Subprocess probe output pipes were unavailable."));
      return;
    }

    standardOutputStream.on("data", (chunk: Buffer) => {
      captureOutputChunk(standardOutputChunks, chunk);
    });
    standardErrorStream.on("data", (chunk: Buffer) => {
      captureOutputChunk(standardErrorChunks, chunk);
    });
    childProcess.once("error", (cause) => {
      removeAbortListener();
      reject(new Error("Subprocess probe failed to start.", { cause }));
    });

    const timeoutTimer = setTimeout(() => {
      terminateExecution("timed-out");
    }, options.timeoutMs);

    childProcess.once("close", (nextExitCode, nextSignal) => {
      clearTimeout(timeoutTimer);
      didClose = true;
      exitCode = nextExitCode;
      signal = nextSignal;

      if (signalSubprocessProbeGroup(childProcess.pid, 0)) {
        // A leader may exit while a forked descendant remains in the group.
        terminationSignals.push("SIGTERM");
        signalSubprocessProbeGroup(childProcess.pid, "SIGTERM");
        terminationTimer ??= setTimeout(() => {
          terminationSignals.push("SIGKILL");
          didForceKill = signalSubprocessProbeGroup(
            childProcess.pid,
            "SIGKILL",
          );
          finishExecution();
        }, options.terminationGraceMs);
        return;
      }

      finishExecution();
    });

    if (options.abortSignal?.aborted) {
      abortExecution();
    } else {
      options.abortSignal?.addEventListener("abort", abortExecution, {
        once: true,
      });
    }
  });
}

export {
  runBoundedSubprocessProbe,
  type BoundedSubprocessProbeOptions,
  type BoundedSubprocessProbeResult,
  type SubprocessProbeTerminationReason,
};
