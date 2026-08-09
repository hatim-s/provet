import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const FIXTURE_DIRECTORY = resolve(
  import.meta.dir,
  "../../../fixtures/adapters/claude-code",
);

const FORBIDDEN_SECRET_OR_IDENTITY_PATTERNS = [
  { name: "Anthropic credential", pattern: /sk-ant-[A-Za-z0-9_-]+/u },
  { name: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/u },
  { name: "GitHub token", pattern: /(?:ghp_|github_pat_)[A-Za-z0-9_]+/u },
  { name: "OpenAI credential", pattern: /sk-proj-[A-Za-z0-9_-]+/u },
  { name: "Slack token", pattern: /xox[baprs]-[A-Za-z0-9-]+/u },
  { name: "authorization header", pattern: /authorization\s*:\s*bearer/iu },
  { name: "email address", pattern: /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u },
  { name: "macOS home path", pattern: /\/Users\/[^/\s]+/u },
  { name: "Linux home path", pattern: /\/home\/[^/\s]+/u },
] as const;

/** Reads every fixture artifact in stable path order for a byte-level scan. */
async function readFixtureArtifacts() {
  const fixtureNames = (await readdir(FIXTURE_DIRECTORY)).sort();

  return Promise.all(
    fixtureNames.map(async (fixtureName) => ({
      fixtureName,
      text: await readFile(resolve(FIXTURE_DIRECTORY, fixtureName), "utf8"),
    })),
  );
}

describe("Claude Code fixture secret scan", () => {
  test("contains no credential, identity, or user-home patterns", async () => {
    const fixtureArtifacts = await readFixtureArtifacts();

    for (const fixtureArtifact of fixtureArtifacts) {
      for (const forbiddenPattern of FORBIDDEN_SECRET_OR_IDENTITY_PATTERNS) {
        expect(
          forbiddenPattern.pattern.test(fixtureArtifact.text),
          `${fixtureArtifact.fixtureName} contains ${forbiddenPattern.name}`,
        ).toBe(false);
      }
    }
  });
});
