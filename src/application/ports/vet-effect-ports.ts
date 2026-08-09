import type { ClockPort } from "./clock-port.js";
import type { FileSystemPort } from "./file-system-port.js";
import type { GitPort, GitRepositoryState } from "./git-port.js";
import type { IdentifierGeneratorPort } from "./identifier-generator-port.js";
import type { ProcessPort } from "./process-port.js";
import type { TerminalPort } from "./terminal-port.js";

/** Collects every host effect injected into the initial vet composition root. */
interface VetEffectPorts {
  clock: ClockPort;
  fileSystem: FileSystemPort;
  git: GitPort;
  identifierGenerator: IdentifierGeneratorPort;
  process: ProcessPort;
  terminal: TerminalPort;
}

export type {
  ClockPort,
  FileSystemPort,
  GitPort,
  GitRepositoryState,
  IdentifierGeneratorPort,
  ProcessPort,
  TerminalPort,
  VetEffectPorts,
};
