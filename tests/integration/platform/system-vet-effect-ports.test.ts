import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { createSystemVetEffectPorts } from "../../../src/platform/create-system-vet-effect-ports.js";
import {
  createSystemGitPort,
  type SystemGitPortOptions,
} from "../../../src/platform/git/create-system-git-port.js";

type GitPortTestOptionOverrides = Partial<
  Omit<SystemGitPortOptions, "environment" | "executable">
>;

/** Creates deterministic bounded Git options for one isolated integration probe. */
function createGitPortTestOptions(
  executable: string,
  overrides: GitPortTestOptionOverrides = {},
): SystemGitPortOptions {
  return {
    environment: {
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: dirname(executable),
    },
    executable,
    maximumOutputBytes: overrides.maximumOutputBytes ?? 1_048_576,
    terminationGraceMs: overrides.terminationGraceMs ?? 50,
    timeoutMs: overrides.timeoutMs ?? 1_000,
  };
}

test("system ports expose bounded host capabilities", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "provet-fnd-01-"));

  try {
    const textFilePath = join(temporaryDirectory, "sample.txt");
    await writeFile(textFilePath, "sample bytes", "utf8");

    const ports = createSystemVetEffectPorts();
    const repositoryState =
      await ports.git.readRepositoryState(temporaryDirectory);

    expect(await ports.fileSystem.readTextFile(textFilePath)).toBe(
      "sample bytes",
    );
    expect(ports.clock.getCurrentTime()).toBeInstanceOf(Date);
    expect(ports.identifierGenerator.generateIdentifier()).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(ports.process.getArguments()).toBeArray();
    expect(repositoryState).toBeNull();
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("missing Git remains distinct from a non-repository directory", async () => {
  const gitPort = createSystemGitPort(
    createGitPortTestOptions("/path/without/git"),
  );

  await expect(
    gitPort.readRepositoryState(process.cwd()),
  ).rejects.toMatchObject({
    cause: expect.any(Error),
    code: "spawn-failed",
  });
});

test("a hanging Git process is terminated by the bounded port", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "provet-git-hang-"));

  try {
    const gitExecutablePath = join(temporaryDirectory, "git");
    await writeFile(gitExecutablePath, "#!/bin/sh\n/bin/sleep 5\n", "utf8");
    await chmod(gitExecutablePath, 0o755);

    const gitPort = createSystemGitPort(
      createGitPortTestOptions(gitExecutablePath, { timeoutMs: 100 }),
    );
    await expect(
      gitPort.readRepositoryState(process.cwd()),
    ).rejects.toMatchObject({ code: "timed-out" });
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("a failed Git process cannot leave a sibling running", async () => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "provet-git-sibling-"),
  );

  try {
    const gitExecutablePath = join(temporaryDirectory, "git");
    const siblingMarkerPath = join(temporaryDirectory, "sibling-finished");
    await writeFile(
      gitExecutablePath,
      `#!/bin/sh
( /bin/sleep 1; /usr/bin/touch "${siblingMarkerPath}" ) >/dev/null 2>&1 &
exec /usr/bin/false
`,
      "utf8",
    );
    await chmod(gitExecutablePath, 0o755);

    const gitPort = createSystemGitPort(
      createGitPortTestOptions(gitExecutablePath, { timeoutMs: 3_000 }),
    );
    await expect(
      gitPort.readRepositoryState(process.cwd()),
    ).rejects.toMatchObject({ code: "exit-failed" });
    await Bun.sleep(1_200);

    expect(existsSync(siblingMarkerPath)).toBe(false);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("Git output is terminated at the combined capture limit", async () => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "provet-git-output-"),
  );

  try {
    const gitExecutablePath = join(temporaryDirectory, "git");
    await writeFile(
      gitExecutablePath,
      "#!/bin/sh\n/usr/bin/yes x | /usr/bin/head -c 4096\n",
      "utf8",
    );
    await chmod(gitExecutablePath, 0o755);

    const gitPort = createSystemGitPort(
      createGitPortTestOptions(gitExecutablePath, {
        maximumOutputBytes: 1_024,
        timeoutMs: 3_000,
      }),
    );
    await expect(
      gitPort.readRepositoryState(process.cwd()),
    ).rejects.toMatchObject({ code: "output-limit" });
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("an invalid Git working directory is an execution failure", async () => {
  const ports = createSystemVetEffectPorts();

  await expect(
    ports.git.readRepositoryState("/path/that/does/not/exist"),
  ).rejects.toMatchObject({
    cause: expect.any(Error),
    code: "exit-failed",
  });
});
