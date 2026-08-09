import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSystemVetEffectPorts } from "../../../src/platform/create-system-vet-effect-ports.js";

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
