import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface ManifestFile {
  path: string;
  sha256: string;
}

interface ManifestCapture {
  files: ManifestFile[];
  id: string;
  providerInvocation: boolean;
  source: string;
  workspaceEvidence?: {
    beforeStateCaptured: boolean;
    claim: string;
    classification: string;
  };
}

interface CodexFixtureManifest {
  captures: ManifestCapture[];
  cli: { name: string; version: string };
  coverage: { notExercised: string[]; observed: string[] };
  roadmapNode: string;
  schemaVersion: number;
}

const fixtureRoot = resolve(
  import.meta.dir,
  "../../../fixtures/adapters/codex",
);

/** Calculates the persisted-byte digest recorded by the provenance manifest. */
function calculateSha256(fileBytes: Uint8Array): string {
  return createHash("sha256").update(fileBytes).digest("hex");
}

test("every Codex fixture has source provenance and stable bytes", async () => {
  const manifest = JSON.parse(
    await readFile(resolve(fixtureRoot, "manifest.json"), "utf8"),
  ) as CodexFixtureManifest;

  expect(manifest).toMatchObject({
    cli: { name: "codex-cli", version: "0.146.0" },
    roadmapNode: "SPI-02",
    schemaVersion: 1,
  });
  expect(manifest.captures.map(({ source }) => source)).toEqual([
    "live",
    "live-local-validation",
    "synthetic",
  ]);
  expect(manifest.captures).toContainEqual(
    expect.objectContaining({
      id: "live-command-workspace",
      providerInvocation: true,
      source: "live",
      workspaceEvidence: {
        beforeStateCaptured: false,
        claim:
          "file presence after invocation only; addition or modification is not proven",
        classification: "after-state-only",
      },
    }),
  );

  for (const capture of manifest.captures) {
    expect(capture.files.length).toBeGreaterThan(0);
    for (const manifestFile of capture.files) {
      const fileBytes = await readFile(resolve(fixtureRoot, manifestFile.path));
      expect(calculateSha256(fileBytes)).toBe(manifestFile.sha256);
    }
  }
});

test("provenance distinguishes observed behavior from evidence gaps", async () => {
  const manifest = JSON.parse(
    await readFile(resolve(fixtureRoot, "manifest.json"), "utf8"),
  ) as CodexFixtureManifest;

  expect(manifest.coverage.observed).toContain("usage");
  expect(manifest.coverage.observed).toContain(
    "workspace file presence in a hashed after-state",
  );
  expect(manifest.coverage.observed).not.toContain("workspace file addition");
  expect(manifest.coverage.notExercised).toContain("cancellation and signals");
  expect(manifest.coverage.notExercised).toContain("nested agent work");
  expect(manifest.coverage.notExercised).toContain("compaction");
});
