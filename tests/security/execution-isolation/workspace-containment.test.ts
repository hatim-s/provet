import { expect, test } from "bun:test";
import {
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  resolveContainedWorkspacePathProbe,
  WorkspaceContainmentProbeError,
} from "../../../spikes/execution-isolation/canonical-workspace-path-probe.js";
import { createPermissionRestrictedTempProbe } from "../../../spikes/execution-isolation/permission-restricted-temp-probe.js";

test("canonical containment rejects traversal to an existing external file", async () => {
  const temporaryParent = await mkdtemp(
    join(tmpdir(), "provet-spi-03-traversal-"),
  );

  try {
    const workspaceRoot = join(temporaryParent, "workspace");
    const externalDirectory = join(temporaryParent, "external");
    await mkdir(workspaceRoot);
    await mkdir(externalDirectory);
    await writeFile(join(externalDirectory, "secret.txt"), "synthetic\n");

    await expect(
      resolveContainedWorkspacePathProbe(
        workspaceRoot,
        "../external/secret.txt",
      ),
    ).rejects.toBeInstanceOf(WorkspaceContainmentProbeError);
  } finally {
    await rm(temporaryParent, { force: true, recursive: true });
  }
});

test("canonical containment rejects a symlink that resolves outside", async () => {
  const temporaryParent = await mkdtemp(
    join(tmpdir(), "provet-spi-03-symlink-"),
  );

  try {
    const workspaceRoot = join(temporaryParent, "workspace");
    const externalDirectory = join(temporaryParent, "external");
    await mkdir(workspaceRoot);
    await mkdir(externalDirectory);
    await writeFile(join(externalDirectory, "secret.txt"), "synthetic\n");
    await symlink(externalDirectory, join(workspaceRoot, "external-link"));

    await expect(
      resolveContainedWorkspacePathProbe(
        workspaceRoot,
        "external-link/secret.txt",
      ),
    ).rejects.toBeInstanceOf(WorkspaceContainmentProbeError);
  } finally {
    await rm(temporaryParent, { force: true, recursive: true });
  }
});

test("canonical containment permits an internal symlink target", async () => {
  const temporaryParent = await mkdtemp(
    join(tmpdir(), "provet-spi-03-internal-link-"),
  );

  try {
    const workspaceRoot = join(temporaryParent, "workspace");
    const internalDirectory = join(workspaceRoot, "internal");
    const internalFilePath = join(internalDirectory, "allowed.txt");
    await mkdir(workspaceRoot);
    await mkdir(internalDirectory);
    await writeFile(internalFilePath, "allowed\n");
    await symlink(internalDirectory, join(workspaceRoot, "internal-link"));

    await expect(
      resolveContainedWorkspacePathProbe(
        workspaceRoot,
        "internal-link/allowed.txt",
      ),
    ).resolves.toBe(await realpath(internalFilePath));
  } finally {
    await rm(temporaryParent, { force: true, recursive: true });
  }
});

test("temporary workspaces are explicitly restricted to their owner", async () => {
  const temporaryParent = await mkdtemp(
    join(tmpdir(), "provet-spi-03-permissions-parent-"),
  );

  try {
    const workspacePath = await createPermissionRestrictedTempProbe({
      parentDirectory: temporaryParent,
      prefix: "workspace-",
    });
    const workspaceStatus = await lstat(workspacePath);

    expect(workspaceStatus.mode & 0o777).toBe(0o700);
  } finally {
    await rm(temporaryParent, { force: true, recursive: true });
  }
});
