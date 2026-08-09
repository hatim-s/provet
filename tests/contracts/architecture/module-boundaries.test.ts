import { describe, expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";

import moduleBoundaryConfiguration from "../../../architecture/module-boundaries.json" with {
  type: "json",
};

const REPOSITORY_ROOT = resolve(import.meta.dir, "../../..");
const SOURCE_ROOT = resolve(REPOSITORY_ROOT, "src");
const HOST_MODULE_SPECIFIERS = new Set([
  "bun",
  "bun:ffi",
  "bun:jsc",
  "bun:sqlite",
  "bun:test",
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
]);
const HOST_FREE_MODULES = new Set(["application", "contracts", "execution"]);

interface SourceDependencyObservation {
  hostBoundaryViolations: readonly string[];
  importedModules: readonly string[];
}

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

/** Reports whether an identifier is a runtime reference rather than a declaration name. */
function isRuntimeIdentifierReference(identifier: ts.Identifier): boolean {
  const parentNode = identifier.parent;
  if (
    (ts.isPropertyAccessExpression(parentNode) &&
      parentNode.name === identifier) ||
    ("name" in parentNode && parentNode.name === identifier)
  ) {
    return false;
  }

  return !(
    ts.isExportSpecifier(parentNode) || ts.isImportSpecifier(parentNode)
  );
}

/** Reads internal dependencies and forbidden host-runtime access from source text. */
function inspectSourceDependencies(
  sourcePath: string,
  sourceText: string,
): SourceDependencyObservation {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const importedModules: string[] = [];
  const hostBoundaryViolations: string[] = [];

  /** Records one static module specifier at both the module and host boundaries. */
  const inspectModuleSpecifier = (moduleSpecifier: ts.Expression): void => {
    if (!ts.isStringLiteral(moduleSpecifier)) {
      return;
    }

    const importedModule = resolveImportedModule(
      sourcePath,
      moduleSpecifier.text,
    );
    if (importedModule) {
      importedModules.push(importedModule);
    }
    if (HOST_MODULE_SPECIFIERS.has(moduleSpecifier.text)) {
      hostBoundaryViolations.push(`host module ${moduleSpecifier.text}`);
    }
  };

  for (const statement of sourceFile.statements) {
    if (
      (ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      inspectModuleSpecifier(statement.moduleSpecifier);
    }
  }

  /** Finds dynamic loading and host globals that top-level import checks miss. */
  const inspectNode = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        hostBoundaryViolations.push("dynamic import");
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require"
      ) {
        hostBoundaryViolations.push("CommonJS require");
      }
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      (node.initializer.text === "global" ||
        node.initializer.text === "globalThis")
    ) {
      for (const bindingElement of node.name.elements) {
        const hostGlobalName =
          bindingElement.propertyName ?? bindingElement.name;
        if (
          ts.isIdentifier(hostGlobalName) &&
          (hostGlobalName.text === "Bun" || hostGlobalName.text === "process")
        ) {
          hostBoundaryViolations.push(
            `destructured host global ${hostGlobalName.text}`,
          );
        }
      }
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "global" ||
        node.expression.text === "globalThis") &&
      (node.name.text === "Bun" || node.name.text === "process")
    ) {
      hostBoundaryViolations.push(`host global globalThis.${node.name.text}`);
    } else if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "global" ||
        node.expression.text === "globalThis") &&
      ts.isStringLiteral(node.argumentExpression) &&
      (node.argumentExpression.text === "Bun" ||
        node.argumentExpression.text === "process")
    ) {
      hostBoundaryViolations.push(
        `host global globalThis[${node.argumentExpression.text}]`,
      );
    } else if (
      ts.isIdentifier(node) &&
      (node.text === "Bun" || node.text === "process") &&
      isRuntimeIdentifierReference(node)
    ) {
      hostBoundaryViolations.push(`host global ${node.text}`);
    }

    ts.forEachChild(node, inspectNode);
  };
  inspectNode(sourceFile);

  return { hostBoundaryViolations, importedModules };
}

/** Reads one real source file through the same hostile-inspection path. */
async function inspectSourceFile(
  sourcePath: string,
): Promise<SourceDependencyObservation> {
  return inspectSourceDependencies(
    sourcePath,
    await readFile(sourcePath, "utf8"),
  );
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

      const dependencyObservation = await inspectSourceFile(sourcePath);
      for (const importedModule of dependencyObservation.importedModules) {
        expect(
          allowedImports,
          `${relative(REPOSITORY_ROOT, sourcePath)} cannot import ${importedModule}.`,
        ).toContain(importedModule);
      }
    }
  });

  test("the composition root can wire every concrete outer module", () => {
    const compositionRootImports =
      moduleBoundaryConfiguration.modules["composition-root"];
    expect(compositionRootImports).toEqual(
      expect.arrayContaining([
        "adapters",
        "cli",
        "config",
        "evals",
        "execution",
        "graders",
        "platform",
        "reporting",
        "runs",
        "workspaces",
      ]),
    );
  });

  test.each(["config", "evals", "graders", "reporting"])(
    "%s can satisfy application-owned effect ports",
    (effectfulModule) => {
      expect(
        moduleBoundaryConfiguration.modules[
          effectfulModule as keyof typeof moduleBoundaryConfiguration.modules
        ],
      ).toContain("application");
    },
  );

  test("application, contracts, and execution reject host runtime access", async () => {
    const protectedSourcePaths = (
      await listTypeScriptFiles(SOURCE_ROOT)
    ).filter((sourcePath) =>
      HOST_FREE_MODULES.has(readLogicalModule(sourcePath)),
    );

    for (const protectedSourcePath of protectedSourcePaths) {
      expect(
        (await inspectSourceFile(protectedSourcePath)).hostBoundaryViolations,
        `${relative(REPOSITORY_ROOT, protectedSourcePath)} crosses the host boundary.`,
      ).toEqual([]);
    }
  });

  test.each([
    ["static Node import", 'import { readFile } from "node:fs/promises";'],
    ["bare Node import", 'import { readFile } from "fs/promises";'],
    ["Bun module import", 'import { expect } from "bun:test";'],
    ["dynamic import", 'const modulePromise = import("node:path");'],
    ["CommonJS require", 'const moduleValue = require("node:path");'],
    ["process global", "const runtimeVersion = process.version;"],
    ["Bun global", "const runtimeVersion = Bun.version;"],
    [
      "globalThis host global",
      "const runtimeVersion = globalThis.process.version;",
    ],
    [
      "computed host global",
      'const runtimeVersion = globalThis["process"].version;',
    ],
    [
      "destructured host global",
      "const { process: runtimeProcess } = globalThis;",
    ],
    ["host global type query", "type Runtime = typeof Bun;"],
  ])("rejects a hostile %s bypass", (_description, hostileSource) => {
    expect(
      inspectSourceDependencies(
        resolve(SOURCE_ROOT, "application/hostile-boundary-probe.ts"),
        hostileSource,
      ).hostBoundaryViolations,
    ).not.toEqual([]);
  });
});
