import { expect, test } from "bun:test";

import type { VetEffectPorts } from "../../../src/application/ports/index.js";

test("the initial composition owns every FND-01 effect boundary", () => {
  const ports = {
    clock: { getCurrentTime: () => new Date(0) },
    fileSystem: { readTextFile: () => Promise.resolve("") },
    git: { readRepositoryState: () => Promise.resolve(null) },
    identifierGenerator: { generateIdentifier: () => "identifier" },
    process: { getArguments: () => [], setExitCode: () => undefined },
    terminal: {
      getStandardOutputWidth: () => null,
      isStandardErrorInteractive: () => false,
      writeStandardError: () => Promise.resolve(),
      writeStandardOutput: () => Promise.resolve(),
    },
  } satisfies VetEffectPorts;

  expect(Object.keys(ports).sort()).toEqual([
    "clock",
    "fileSystem",
    "git",
    "identifierGenerator",
    "process",
    "terminal",
  ]);
});
