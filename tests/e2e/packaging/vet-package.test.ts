import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../../..");

interface CommandExecution {
  exitCode: number;
  standardError: string;
  standardOutput: string;
}

/** Executes a packaging command with captured process channels. */
async function executeCommand(
  command: readonly string[],
  workingDirectory: string,
): Promise<CommandExecution> {
  const childProcess = Bun.spawn([...command], {
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

test("a clean package installs an executable vet binary", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "provet-package-"));

  try {
    const consumerDirectory = join(temporaryDirectory, "consumer");
    const packageSourceDirectory = join(temporaryDirectory, "package-source");
    const packageTarballPath = join(temporaryDirectory, "provet-0.1.0.tgz");
    await mkdir(consumerDirectory, { recursive: true });
    await mkdir(packageSourceDirectory, { recursive: true });
    await Promise.all([
      cp(join(REPOSITORY_ROOT, "src"), join(packageSourceDirectory, "src"), {
        recursive: true,
      }),
      ...["package.json", "bun.lock", "tsconfig.json"].map((fileName) =>
        cp(
          join(REPOSITORY_ROOT, fileName),
          join(packageSourceDirectory, fileName),
        ),
      ),
    ]);

    const packExecution = await executeCommand(
      ["bun", "pm", "pack", "--destination", temporaryDirectory],
      packageSourceDirectory,
    );
    expect(packExecution.exitCode).toBe(0);
    expect(existsSync(packageTarballPath)).toBe(true);

    await writeFile(
      join(consumerDirectory, "package.json"),
      `${JSON.stringify(
        {
          dependencies: { provet: `file:${packageTarballPath}` },
          name: "provet-package-consumer",
          private: true,
          version: "0.0.0",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const installExecution = await executeCommand(
      ["bun", "install", "--offline"],
      consumerDirectory,
    );
    expect(installExecution.exitCode).toBe(0);

    const installedVetPath = join(consumerDirectory, "node_modules/.bin/vet");
    expect(existsSync(installedVetPath)).toBe(true);
    expect(
      await executeCommand([installedVetPath, "--version"], consumerDirectory),
    ).toEqual({ exitCode: 0, standardError: "", standardOutput: "0.1.0\n" });
    expect(
      await executeCommand([installedVetPath, "--help"], consumerDirectory),
    ).toMatchObject({ exitCode: 0, standardError: "" });
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});
