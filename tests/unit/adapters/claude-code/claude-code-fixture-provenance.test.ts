import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const FIXTURE_DIRECTORY = resolve(
  import.meta.dir,
  "../../../fixtures/adapters/claude-code",
);
const MANIFEST_PATH = resolve(FIXTURE_DIRECTORY, "provenance-manifest.json");

interface FixtureProvenanceEntry {
  evidenceClass: "negative-synthetic" | "schema-derived";
  file: string;
  isLiveCompatibilityEvidence: false;
  scenario: string;
  sha256: string;
}

interface FixtureProvenanceManifest {
  fixtures: FixtureProvenanceEntry[];
  localGate: {
    authenticationAvailable: boolean;
    liveCompatibilityStatus: string;
    liveProviderInvocations: number;
    liveSpendUsd: number;
  };
  roadmapNode: string;
  schemaVersion: number;
}

/** Parses the reviewed fixture provenance manifest used by integrity tests. */
async function readProvenanceManifest(): Promise<FixtureProvenanceManifest> {
  return JSON.parse(
    await readFile(MANIFEST_PATH, "utf8"),
  ) as FixtureProvenanceManifest;
}

/** Computes the stable SHA-256 digest recorded for one sanitized fixture. */
async function hashFixture(fixtureName: string): Promise<string> {
  const fixtureBytes = await readFile(resolve(FIXTURE_DIRECTORY, fixtureName));
  return createHash("sha256").update(fixtureBytes).digest("hex");
}

describe("Claude Code fixture provenance", () => {
  test("accounts for every replay fixture with reviewed immutable bytes", async () => {
    const manifest = await readProvenanceManifest();
    const fixtureNames = (await readdir(FIXTURE_DIRECTORY))
      .filter((fixtureName) => fixtureName.endsWith(".jsonl"))
      .sort();
    const manifestFixtureNames = manifest.fixtures
      .map((fixture) => fixture.file)
      .sort();

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.roadmapNode).toBe("SPI-01");
    expect(manifestFixtureNames).toEqual(fixtureNames);

    for (const fixture of manifest.fixtures) {
      expect(fixture.scenario.length).toBeGreaterThan(0);
      expect(await hashFixture(fixture.file)).toBe(fixture.sha256);
    }
  });

  test("cannot label schema-derived or synthetic replay as live evidence", async () => {
    const manifest = await readProvenanceManifest();

    expect(manifest.localGate).toEqual(
      expect.objectContaining({
        authenticationAvailable: false,
        liveCompatibilityStatus: "unavailable-authentication",
        liveProviderInvocations: 0,
        liveSpendUsd: 0,
      }),
    );
    expect(
      manifest.fixtures.every(
        (fixture) => fixture.isLiveCompatibilityEvidence === false,
      ),
    ).toBe(true);
  });
});
