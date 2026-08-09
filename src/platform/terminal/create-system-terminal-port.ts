import { fstat, read, stat, write } from "node:fs";
import { promisify } from "node:util";

import type { TerminalPort } from "../../application/ports/index.js";

const readFileDescriptorStatus = promisify(fstat);
const readPathStatus = promisify(stat);

/** Detects Bun's read-write /dev/null replacement for an inherited closed descriptor. */
async function isRemappedClosedDescriptor(
  fileDescriptor: 1 | 2,
): Promise<boolean> {
  const [descriptorStatus, nullDeviceStatus] = await Promise.all([
    readFileDescriptorStatus(fileDescriptor),
    readPathStatus("/dev/null"),
  ]);
  const isNullDevice =
    descriptorStatus.dev === nullDeviceStatus.dev &&
    descriptorStatus.ino === nullDeviceStatus.ino &&
    descriptorStatus.rdev === nullDeviceStatus.rdev;
  if (!isNullDevice) {
    return false;
  }

  return new Promise<boolean>((resolve, reject) => {
    read(
      fileDescriptor,
      Buffer.allocUnsafe(1),
      0,
      1,
      null,
      (error, readByteCount) => {
        if ((error as NodeJS.ErrnoException | null)?.code === "EBADF") {
          // POSIX `>/dev/null` is write-only, so a rejected read identifies a legitimate sink.
          resolve(false);
          return;
        }
        if (error) {
          reject(error);
          return;
        }

        // Bun 1.3 replaces a pre-start closed standard descriptor with read-write /dev/null.
        resolve(readByteCount === 0);
      },
    );
  });
}

/** Writes one terminal payload and resolves only after every byte is accepted. */
async function writeTerminalText(
  fileDescriptor: 1 | 2,
  text: string,
): Promise<void> {
  if (await isRemappedClosedDescriptor(fileDescriptor)) {
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
