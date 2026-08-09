#!/usr/bin/env bun

import packageMetadata from "../../package.json" with { type: "json" };
import { createSystemVetEffectPorts } from "../platform/create-system-vet-effect-ports.js";
import { createVetCommand } from "./vet-command.js";

const ports = createSystemVetEffectPorts();
const vetCommand = createVetCommand({
  ports,
  version: packageMetadata.version,
});
const exitCode = await vetCommand.run(ports.process.getArguments());

ports.process.setExitCode(exitCode);
