import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  runBoundedSubprocessProbe,
  type BoundedSubprocessProbeOptions,
} from "../../../spikes/execution-isolation/bounded-subprocess-probe.js";
import { constructMinimalEnvironmentProbe } from "../../../spikes/execution-isolation/minimal-environment-probe.js";

const fixtureDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/security/execution-isolation",
);

/** Creates one explicit, secret-free process option set for a fixture. */
function createSubprocessProbeOptions(
  workingDirectory: string,
  fixtureName: string,
  argumentsAfterFixture: readonly string[] = [],
  overrides: Partial<
    Pick<
      BoundedSubprocessProbeOptions,
      | "abortSignal"
      | "environment"
      | "maximumOutputBytes"
      | "terminationGraceMs"
      | "timeoutMs"
    >
  > = {},
): BoundedSubprocessProbeOptions {
  const options: BoundedSubprocessProbeOptions = {
    arguments: [join(fixtureDirectory, fixtureName), ...argumentsAfterFixture],
    environment:
      overrides.environment ??
      constructMinimalEnvironmentProbe({
        allowedInheritedVariableNames: [],
        fixedVariables: { LANG: "C", LC_ALL: "C" },
        inheritedEnvironment: process.env,
      }),
    executable: process.execPath,
    maximumOutputBytes: overrides.maximumOutputBytes ?? 1_024,
    terminationGraceMs: overrides.terminationGraceMs ?? 40,
    timeoutMs: overrides.timeoutMs ?? 1_000,
    workingDirectory,
  };

  if (overrides.abortSignal !== undefined) {
    options.abortSignal = overrides.abortSignal;
  }

  return options;
}

test("explicit argv preserves shell metacharacters as inert data", async () => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "provet-spi-03-arguments-"),
  );

  try {
    const unexpectedMarkerPath = join(temporaryDirectory, "shell-expanded");
    const untrustedArgument = `$(touch ${unexpectedMarkerPath}); echo injected`;
    const executionResult = await runBoundedSubprocessProbe(
      createSubprocessProbeOptions(temporaryDirectory, "print-arguments.ts", [
        untrustedArgument,
      ]),
    );

    expect(JSON.parse(executionResult.standardOutput)).toEqual([
      untrustedArgument,
    ]);
    expect(executionResult.exitCode).toBe(0);
    expect(existsSync(unexpectedMarkerPath)).toBe(false);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("minimal environment construction does not inherit a host secret", async () => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "provet-spi-03-environment-"),
  );
  const secretVariableName = "SPI03_SECRET_INHERITANCE_PROBE";
  const previousSecretValue = process.env[secretVariableName];
  process.env[secretVariableName] = "synthetic-secret-that-must-not-be-emitted";

  try {
    const executionResult = await runBoundedSubprocessProbe(
      createSubprocessProbeOptions(
        temporaryDirectory,
        "report-environment-presence.ts",
        [secretVariableName, "HOME"],
      ),
    );

    expect(JSON.parse(executionResult.standardOutput)).toEqual({
      HOME: false,
      [secretVariableName]: false,
    });
    expect(executionResult.standardOutput).not.toContain(
      process.env[secretVariableName] ?? "",
    );
  } finally {
    if (previousSecretValue === undefined) {
      delete process.env[secretVariableName];
    } else {
      process.env[secretVariableName] = previousSecretValue;
    }
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("combined stdout and stderr capture stops at its byte ceiling", async () => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "provet-spi-03-output-"),
  );

  try {
    const executionResult = await runBoundedSubprocessProbe(
      createSubprocessProbeOptions(
        temporaryDirectory,
        "emit-huge-output.ts",
        [],
        { maximumOutputBytes: 512 },
      ),
    );

    expect(executionResult.capturedOutputBytes).toBe(512);
    expect(
      Buffer.byteLength(
        executionResult.standardOutput + executionResult.standardError,
      ),
    ).toBeLessThanOrEqual(512);
    expect(executionResult.terminationReason).toBe("output-limit");
    expect(executionResult.wasOutputTruncated).toBe(true);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("timeout terminates a forked child that remains in the process group", async () => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "provet-spi-03-process-group-"),
  );

  try {
    const childMarkerPath = join(temporaryDirectory, "child-finished");
    const markerWriterPath = join(
      fixtureDirectory,
      "write-marker-after-delay.ts",
    );
    const executionResult = await runBoundedSubprocessProbe(
      createSubprocessProbeOptions(
        temporaryDirectory,
        "spawn-same-group-child.ts",
        [childMarkerPath, markerWriterPath],
        { timeoutMs: 500 },
      ),
    );
    await Bun.sleep(700);

    expect(executionResult.terminationReason).toBe("timed-out");
    expect(executionResult.terminationSignals).toContain("SIGTERM");
    expect(existsSync(childMarkerPath)).toBe(false);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("an unsafe-local child can escape by creating a new session", async () => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "provet-spi-03-process-escape-"),
  );

  try {
    const escapedMarkerPath = join(temporaryDirectory, "escaped-child");
    const markerWriterPath = join(
      fixtureDirectory,
      "write-marker-after-delay.ts",
    );
    const executionResult = await runBoundedSubprocessProbe(
      createSubprocessProbeOptions(
        temporaryDirectory,
        "spawn-escaped-session-child.ts",
        [escapedMarkerPath, markerWriterPath],
        { timeoutMs: 500 },
      ),
    );
    await Bun.sleep(700);

    expect(executionResult.terminationReason).toBe("timed-out");
    expect(existsSync(escapedMarkerPath)).toBe(true);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("cancellation escalates when a process ignores graceful termination", async () => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "provet-spi-03-forced-termination-"),
  );
  const cancellationController = new AbortController();

  try {
    const executionPromise = runBoundedSubprocessProbe(
      createSubprocessProbeOptions(
        temporaryDirectory,
        "ignore-graceful-termination.ts",
        [],
        {
          abortSignal: cancellationController.signal,
          terminationGraceMs: 50,
        },
      ),
    );
    await Bun.sleep(100);
    cancellationController.abort();
    const executionResult = await executionPromise;

    expect(executionResult.terminationReason).toBe("cancelled");
    expect(executionResult.didForceKill).toBe(true);
    expect(executionResult.terminationSignals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(executionResult.standardOutput).toContain(
      "graceful termination observed",
    );
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});
