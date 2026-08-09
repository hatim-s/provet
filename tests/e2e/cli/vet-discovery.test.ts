import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
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
});
