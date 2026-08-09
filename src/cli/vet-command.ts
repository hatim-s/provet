import type { VetEffectPorts } from "../application/ports/vet-effect-ports.js";

const HELP_TEXT = `Usage: vet [options] <command>

Local-first agentic evaluations.

Options:
  --help     Show help and exit.
  --version  Show the semantic version and exit.

Commands are introduced in later roadmap nodes.
`;

interface VetCommandDependencies {
  ports: VetEffectPorts;
  version: string;
}

interface VetCommand {
  /** Executes the command and resolves to its process exit status. */
  run(commandArguments: readonly string[]): Promise<number>;
}

/** Creates the named vet composition root with all host effects injected. */
function createVetCommand(dependencies: VetCommandDependencies): VetCommand {
  /** Executes only the config-free discovery behavior owned by FND-01. */
  async function runVetCommand(
    commandArguments: readonly string[],
  ): Promise<number> {
    if (commandArguments.length === 1 && commandArguments[0] === "--help") {
      await dependencies.ports.terminal.writeStandardOutput(HELP_TEXT);
      return 0;
    }

    if (commandArguments.length === 1 && commandArguments[0] === "--version") {
      await dependencies.ports.terminal.writeStandardOutput(
        `${dependencies.version}\n`,
      );
      return 0;
    }

    await dependencies.ports.terminal.writeStandardError(
      "Only --help and --version are available in the FND-01 bootstrap.\n",
    );
    return 2;
  }

  return { run: runVetCommand };
}

export { createVetCommand, type VetCommand, type VetCommandDependencies };
