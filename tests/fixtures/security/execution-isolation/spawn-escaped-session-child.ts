import { spawn } from "node:child_process";

/** Starts a marker writer in a new session to demonstrate process-group escape. */
async function spawnEscapedSessionChild(): Promise<void> {
  const markerPath = process.argv[2];
  const markerWriterPath = process.argv[3];
  if (markerPath === undefined || markerWriterPath === undefined) {
    throw new Error("Expected marker and writer paths.");
  }

  const escapedChild = spawn(
    process.execPath,
    [markerWriterPath, markerPath, "1000"],
    {
      detached: true,
      env: {},
      stdio: "ignore",
    },
  );
  escapedChild.unref();
  await Bun.sleep(5_000);
}

await spawnEscapedSessionChild();

export { spawnEscapedSessionChild };
