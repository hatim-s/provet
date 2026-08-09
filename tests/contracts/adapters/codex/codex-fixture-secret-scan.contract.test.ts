import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const fixtureRoot = resolve(
  import.meta.dir,
  "../../../fixtures/adapters/codex",
);

const forbiddenSecretPatterns: ReadonlyArray<{
  description: string;
  pattern: RegExp;
}> = [
  { description: "OpenAI-style secret", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  {
    description: "authorization bearer value",
    pattern: /\bBearer\s+[A-Za-z0-9._~-]{12,}\b/i,
  },
  {
    description: "private key material",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    description: "unsanitized macOS home path",
    pattern: /\/Users\/(?!\[SANITIZED)/,
  },
  {
    description: "Codex authentication file path",
    pattern: /(?:^|\/)auth\.json\b/,
  },
];

/** Lists fixture files recursively in deterministic path order. */
async function listFixtureFiles(directoryPath: string): Promise<string[]> {
  const directoryEntries = await readdir(directoryPath, {
    withFileTypes: true,
  });
  const nestedFiles = await Promise.all(
    directoryEntries.map(async (directoryEntry) => {
      const entryPath = resolve(directoryPath, directoryEntry.name);
      if (directoryEntry.isDirectory()) {
        return listFixtureFiles(entryPath);
      }
      return [entryPath];
    }),
  );

  return nestedFiles.flat().sort();
}

test("sanitized Codex evidence contains no credential-shaped values", async () => {
  const fixtureFiles = await listFixtureFiles(fixtureRoot);

  expect(fixtureFiles.length).toBeGreaterThan(0);
  for (const fixtureFile of fixtureFiles) {
    const fixtureText = await readFile(fixtureFile, "utf8");
    for (const forbiddenSecretPattern of forbiddenSecretPatterns) {
      expect(fixtureText).not.toMatch(forbiddenSecretPattern.pattern);
    }
  }
});
