import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BUILT_VET_PATH = resolve(import.meta.dir, "../../../dist/vet.js");
const EXPECTED_HELP_TEXT = `Usage: vet [options] <command>

Local-first agentic evaluations.

Options:
  --help     Show help and exit.
  --version  Show the semantic version and exit.

Commands are introduced in later roadmap nodes.
`;
const EXPECTED_OUTPUT_FAILURE_TEXT = "vet: failed to write command output.\n";
const EXPECTED_USAGE_ERROR_TEXT =
  "Only --help and --version are available in the FND-01 bootstrap.\n";

interface BuiltVetExecution {
  exitCode: number;
  standardError: string;
  standardOutput: string;
}

/** Executes the built CLI and captures each process channel independently. */
async function executeBuiltVet(
  commandArguments: readonly string[],
  workingDirectory: string,
): Promise<BuiltVetExecution> {
  const childProcess = Bun.spawn([BUILT_VET_PATH, ...commandArguments], {
    cwd: workingDirectory,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, standardError, standardOutput] = await Promise.all([
    childProcess.exited,
    new Response(childProcess.stderr).text(),
    new Response(childProcess.stdout).text(),
  ]);

  return { exitCode, standardError, standardOutput };
}

/** Executes a POSIX shell probe around the built CLI for descriptor failures. */
async function executeShellProbe(
  shellScript: string,
  commandArguments: readonly string[],
): Promise<BuiltVetExecution> {
  const childProcess = Bun.spawn(
    ["/bin/sh", "-c", shellScript, "provet-e2e", ...commandArguments],
    {
      stderr: "pipe",
      stdout: "pipe",
    },
  );
  const [exitCode, standardError, standardOutput] = await Promise.all([
    childProcess.exited,
    new Response(childProcess.stderr).text(),
    new Response(childProcess.stdout).text(),
  ]);

  return { exitCode, standardError, standardOutput };
}

describe("built vet discovery", () => {
  test("prints version outside a project without file effects", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "provet-e2e-"));

    try {
      const execution = await executeBuiltVet(
        ["--version"],
        temporaryDirectory,
      );

      expect(execution).toEqual({
        exitCode: 0,
        standardError: "",
        standardOutput: "0.1.0\n",
      });
      expect(await readdir(temporaryDirectory)).toEqual([]);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test("prints help outside a project without file effects", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "provet-e2e-"));

    try {
      const execution = await executeBuiltVet(["--help"], temporaryDirectory);

      expect(execution).toEqual({
        exitCode: 0,
        standardError: "",
        standardOutput: EXPECTED_HELP_TEXT,
      });
      expect(await readdir(temporaryDirectory)).toEqual([]);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test.each([
    ["missing arguments", []],
    ["unknown option", ["--bogus"]],
    ["repeated option", ["--help", "--help"]],
    ["extra argument", ["--help", "typo"]],
    ["trailing unknown option", ["--help", "--bogus"]],
  ])("rejects %s without project file effects", async (_description, args) => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "provet-e2e-"));

    try {
      const execution = await executeBuiltVet(args, temporaryDirectory);

      expect(execution).toEqual({
        exitCode: 2,
        standardError: EXPECTED_USAGE_ERROR_TEXT,
        standardOutput: "",
      });
      expect(await readdir(temporaryDirectory)).toEqual([]);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test("maps a closed stdout descriptor to a stack-free internal error", async () => {
    const execution = await executeShellProbe('"$1" --help 1>&-', [
      BUILT_VET_PATH,
    ]);

    expect(execution).toEqual({
      exitCode: 70,
      standardError: EXPECTED_OUTPUT_FAILURE_TEXT,
      standardOutput: "",
    });
  });

  test("maps an early-closing stdout pipe to a stack-free internal error", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "provet-e2e-"));

    try {
      const producerExitPath = join(temporaryDirectory, "producer-exit.txt");
      const execution = await executeShellProbe(
        '( "$1" --help; printf "%s" "$?" > "$2" ) | /usr/bin/true',
        [BUILT_VET_PATH, producerExitPath],
      );

      expect(execution).toEqual({
        exitCode: 0,
        standardError: EXPECTED_OUTPUT_FAILURE_TEXT,
        standardOutput: "",
      });
      expect(await readFile(producerExitPath, "utf8")).toBe("70");
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
