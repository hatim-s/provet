import { writeFile } from "node:fs/promises";

/** Writes a synthetic marker after a caller-provided delay. */
async function writeMarkerAfterDelay(): Promise<void> {
  const markerPath = process.argv[2];
  const delayText = process.argv[3];
  if (markerPath === undefined || delayText === undefined) {
    throw new Error("Expected marker path and delay arguments.");
  }

  const delayMs = Number(delayText);
  if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
    throw new Error("Marker delay must be a non-negative safe integer.");
  }

  await Bun.sleep(delayMs);
  await writeFile(markerPath, "child survived\n", "utf8");
}

await writeMarkerAfterDelay();

export { writeMarkerAfterDelay };
