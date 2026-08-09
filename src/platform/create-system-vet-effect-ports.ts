import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { VetEffectPorts } from "../application/ports/index.js";
import { createSystemGitPort } from "./git/create-system-git-port.js";
import { createSystemTerminalPort } from "./terminal/create-system-terminal-port.js";

/** Creates concrete host adapters only at the executable composition boundary. */
function createSystemVetEffectPorts(): VetEffectPorts {
  return {
    clock: {
      getCurrentTime: () => new Date(),
    },
    fileSystem: {
      readTextFile: (filePath) => readFile(filePath, "utf8"),
    },
    git: createSystemGitPort(),
    identifierGenerator: {
      generateIdentifier: () => randomUUID(),
    },
    process: {
      getArguments: () => process.argv.slice(2),
      setExitCode: (exitCode) => {
        process.exitCode = exitCode;
      },
    },
    terminal: createSystemTerminalPort(),
  };
}

export { createSystemVetEffectPorts };
