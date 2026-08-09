import { fstat, stat, write } from "node:fs";
import { promisify } from "node:util";

import type { TerminalPort } from "../../application/ports/index.js";

const readFileDescriptorStatus = promisify(fstat);
const readPathStatus = promisify(stat);

/** Writes one terminal payload and resolves only after every byte is accepted. */
async function writeTerminalText(
  fileDescriptor: 1 | 2,
  text: string,
): Promise<void> {
  const [descriptorStatus, nullDeviceStatus] = await Promise.all([
    readFileDescriptorStatus(fileDescriptor),
    readPathStatus("/dev/null"),
  ]);
  if (
    descriptorStatus.dev === nullDeviceStatus.dev &&
    descriptorStatus.ino === nullDeviceStatus.ino &&
    descriptorStatus.rdev === nullDeviceStatus.rdev
  ) {
    // Bun maps a descriptor closed before startup to /dev/null; required CLI bytes are not observable there.
    throw new Error("Terminal descriptor is unavailable.");
  }

  await new Promise<void>((resolve, reject) => {
    const outputBytes = Buffer.from(text, "utf8");

    /** Continues partial writes until every required byte reaches the descriptor. */
    const writeRemainingBytes = (byteOffset: number): void => {
      write(
        fileDescriptor,
        outputBytes,
        byteOffset,
        outputBytes.byteLength - byteOffset,
        null,
        (error, writtenByteCount) => {
          if (error) {
            reject(error);
            return;
          }

          if (writtenByteCount === 0) {
            reject(new Error("Terminal write made no progress."));
            return;
          }

          const nextByteOffset = byteOffset + writtenByteCount;
          if (nextByteOffset === outputBytes.byteLength) {
            resolve();
          } else {
            writeRemainingBytes(nextByteOffset);
          }
        },
      );
    };

    writeRemainingBytes(0);
  });
}

/** Creates the system terminal adapter at the executable effect boundary. */
function createSystemTerminalPort(): TerminalPort {
  return {
    getStandardOutputWidth: () => process.stdout.columns ?? null,
    isStandardErrorInteractive: () => process.stderr.isTTY,
    writeStandardError: (text) => writeTerminalText(2, text),
    writeStandardOutput: (text) => writeTerminalText(1, text),
  };
}

export { createSystemTerminalPort };
