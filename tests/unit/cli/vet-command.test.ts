import { describe, expect, test } from "bun:test";

import type { VetEffectPorts } from "../../../src/application/ports/index.js";
import { createVetCommand } from "../../../src/cli/vet-command.js";

interface CommandObservation {
  effectAccessCount: number;
  standardError: string;
  standardOutput: string;
}

/** Creates observed ports that expose any accidental discovery-time effect. */
function createObservedPorts(observation: CommandObservation): VetEffectPorts {
  return {
    clock: {
      getCurrentTime: () => {
        observation.effectAccessCount += 1;
        return new Date(0);
      },
    },
    fileSystem: {
      readTextFile: () => {
        observation.effectAccessCount += 1;
        return Promise.reject(new Error("Unexpected filesystem read."));
      },
    },
    git: {
      readRepositoryState: () => {
        observation.effectAccessCount += 1;
        return Promise.reject(new Error("Unexpected Git read."));
      },
    },
    identifierGenerator: {
      generateIdentifier: () => {
        observation.effectAccessCount += 1;
        return "unexpected-identifier";
      },
    },
    process: {
      getArguments: () => {
        observation.effectAccessCount += 1;
        return [];
      },
      setExitCode: () => {
        observation.effectAccessCount += 1;
      },
    },
    terminal: {
      getStandardOutputWidth: () => {
        observation.effectAccessCount += 1;
        return null;
      },
      isStandardErrorInteractive: () => {
        observation.effectAccessCount += 1;
        return false;
      },
      writeStandardError: (text) => {
        observation.standardError += text;
      },
      writeStandardOutput: (text) => {
        observation.standardOutput += text;
      },
    },
  };
}

describe("createVetCommand", () => {
  test("prints the semantic version without accessing project effects", async () => {
    const observation: CommandObservation = {
      effectAccessCount: 0,
      standardError: "",
      standardOutput: "",
    };
    const vetCommand = createVetCommand({
      ports: createObservedPorts(observation),
      version: "1.2.3",
    });

    const exitCode = await vetCommand.run(["--version"]);

    expect(exitCode).toBe(0);
    expect(observation.standardOutput).toBe("1.2.3\n");
    expect(observation.standardError).toBe("");
    expect(observation.effectAccessCount).toBe(0);
  });

  test("prints help without accessing project effects", async () => {
    const observation: CommandObservation = {
      effectAccessCount: 0,
      standardError: "",
      standardOutput: "",
    };
    const vetCommand = createVetCommand({
      ports: createObservedPorts(observation),
      version: "1.2.3",
    });

    const exitCode = await vetCommand.run(["--help"]);

    expect(exitCode).toBe(0);
    expect(observation.standardOutput).toContain(
      "Usage: vet [options] <command>\n",
    );
    expect(observation.standardOutput.endsWith("\n")).toBe(true);
    expect(observation.standardError).toBe("");
    expect(observation.effectAccessCount).toBe(0);
  });
});
