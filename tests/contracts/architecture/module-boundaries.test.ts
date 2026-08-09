import { describe, expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";

import moduleBoundaryConfiguration from "../../../architecture/module-boundaries.json" with {
  type: "json",
};

const REPOSITORY_ROOT = resolve(import.meta.dir, "../../..");
const SOURCE_ROOT = resolve(REPOSITORY_ROOT, "src");

/** Recursively lists TypeScript files in stable path order. */
async function listTypeScriptFiles(
  directoryPath: string,
): Promise<readonly string[]> {
  const directoryEntries = await readdir(directoryPath, {
    withFileTypes: true,
  });
  const nestedPaths = await Promise.all(
    directoryEntries.map((directoryEntry) => {
      const entryPath = resolve(directoryPath, directoryEntry.name);
      if (directoryEntry.isDirectory()) {
        return listTypeScriptFiles(entryPath);
      }

      return Promise.resolve(entryPath.endsWith(".ts") ? [entryPath] : []);
    }),
  );

  return nestedPaths.flat().sort();
}

/** Maps a source path to its enforced logical module. */
function readLogicalModule(sourcePath: string): string {
  const repositoryRelativePath = relative(SOURCE_ROOT, sourcePath);
  const repositoryPath = `src/${repositoryRelativePath}`;
  const fileModule = (
    moduleBoundaryConfiguration.fileModules as Readonly<Record<string, string>>
  )[repositoryPath];
  if (fileModule) {
    return fileModule;
  }

  if (repositoryRelativePath === "index.ts") {
    return "package";
  }

  const [logicalModule] = repositoryRelativePath.split(sep);
  if (!logicalModule) {
    throw new Error(
      `Cannot identify the module for ${repositoryRelativePath}.`,
    );
  }

  return logicalModule;
}

/** Resolves one relative ESM import back to its TypeScript owner module. */
function resolveImportedModule(
  sourcePath: string,
  moduleSpecifier: string,
): string | null {
  if (!moduleSpecifier.startsWith(".")) {
    return null;
  }

  const importedPath = resolve(
    dirname(sourcePath),
    moduleSpecifier.replace(/\.js$/u, ".ts"),
  );
  return importedPath.startsWith(`${SOURCE_ROOT}${sep}`)
    ? readLogicalModule(importedPath)
    : null;
}

/** Reads relative import and re-export specifiers from one source file. */
async function readImportedModules(
  sourcePath: string,
): Promise<readonly string[]> {
  const sourceText = await readFile(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const importedModules: string[] = [];

  for (const statement of sourceFile.statements) {
    if (
      (ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const importedModule = resolveImportedModule(
        sourcePath,
        statement.moduleSpecifier.text,
      );
      if (importedModule) {
        importedModules.push(importedModule);
      }
    }
  }

  return importedModules;
}

describe("module dependency boundaries", () => {
  test("every declared contract domain is an actual purpose-specific directory", async () => {
    for (const contractDomain of moduleBoundaryConfiguration.contractDomains) {
      const contractDomainPath = resolve(
        SOURCE_ROOT,
        "contracts",
        contractDomain,
      );
      expect((await stat(contractDomainPath)).isDirectory()).toBe(true);
      expect(
        (await listTypeScriptFiles(contractDomainPath)).length,
      ).toBeGreaterThan(0);
    }
  });

  test("all internal imports follow the configured inward direction", async () => {
    const sourcePaths = await listTypeScriptFiles(SOURCE_ROOT);
    const moduleRules = moduleBoundaryConfiguration.modules as Readonly<
      Record<string, readonly string[]>
    >;

    for (const sourcePath of sourcePaths) {
      const sourceModule = readLogicalModule(sourcePath);
      const allowedImports = moduleRules[sourceModule];
      expect(
        allowedImports,
        `Missing boundary rule for ${sourceModule}.`,
      ).toBeDefined();

      for (const importedModule of await readImportedModules(sourcePath)) {
        expect(
          allowedImports,
          `${relative(REPOSITORY_ROOT, sourcePath)} cannot import ${importedModule}.`,
        ).toContain(importedModule);
      }
    }
  });

  test("domain contracts do not import host runtime APIs", async () => {
    const contractSourcePaths = await listTypeScriptFiles(
      resolve(SOURCE_ROOT, "contracts"),
    );

    for (const contractSourcePath of contractSourcePaths) {
      const sourceText = await readFile(contractSourcePath, "utf8");
      expect(sourceText).not.toMatch(/from\s+["'](?:bun|node:)/u);
      expect(sourceText).not.toMatch(/\b(?:Bun|process)\s*\./u);
    }
  });
});
