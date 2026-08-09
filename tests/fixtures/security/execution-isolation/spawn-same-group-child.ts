import { spawn } from "node:child_process";

/** Forks a marker writer into the inherited process group, then remains alive. */
async function spawnSameGroupChild(): Promise<void> {
  const markerPath = process.argv[2];
  const markerWriterPath = process.argv[3];
  if (markerPath === undefined || markerWriterPath === undefined) {
    throw new Error("Expected marker and writer paths.");
  }

  spawn(process.execPath, [markerWriterPath, markerPath, "1000"], {
    detached: false,
    env: {},
    stdio: "ignore",
  });
  await Bun.sleep(5_000);
}

await spawnSameGroupChild();

export { spawnSameGroupChild };
