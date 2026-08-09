#!/usr/bin/env bun

import packageMetadata from "../../package.json" with { type: "json" };
import { createSystemVetEffectPorts } from "../platform/create-system-vet-effect-ports.js";
import { createVetCommand } from "./vet-command.js";

const ports = createSystemVetEffectPorts();
const vetCommand = createVetCommand({
  ports,
  version: packageMetadata.version,
});
let exitCode = 70;

try {
  exitCode = await vetCommand.run(ports.process.getArguments());
} catch {
  try {
    await ports.terminal.writeStandardError(
      "vet: failed to write command output.\n",
    );
  } catch {
    // With both terminal streams unavailable, exit 70 is the only observable contract.
  }
}

ports.process.setExitCode(exitCode);
