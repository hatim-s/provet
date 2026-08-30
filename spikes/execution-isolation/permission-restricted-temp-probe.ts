import { chmod, mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";

interface PermissionRestrictedTempProbeOptions {
  parentDirectory: string;
  prefix: string;
}

/**
 * Creates a spike-only temporary directory and verifies POSIX owner-only mode.
 */
async function createPermissionRestrictedTempProbe(
  options: PermissionRestrictedTempProbeOptions,
): Promise<string> {
  const temporaryDirectoryPath = await mkdtemp(
    join(options.parentDirectory, options.prefix),
  );

  try {
    await chmod(temporaryDirectoryPath, 0o700);
    const temporaryDirectoryStatus = await stat(temporaryDirectoryPath);
    if ((temporaryDirectoryStatus.mode & 0o777) !== 0o700) {
      throw new Error("Temporary directory permissions are not owner-only.");
    }
    return temporaryDirectoryPath;
  } catch (cause) {
    await rm(temporaryDirectoryPath, { force: true, recursive: true });
    throw cause;
  }
}

export {
  createPermissionRestrictedTempProbe,
  type PermissionRestrictedTempProbeOptions,
};
