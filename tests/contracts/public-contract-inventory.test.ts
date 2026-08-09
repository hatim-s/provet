import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import ts from "typescript";

import type { AdapterConfiguration } from "../../src/contracts/invocation/adapter-configuration.js";
import type { GraderDefinition } from "../../src/contracts/grading/grader-definition.js";
import type { GraderVerdictStatus } from "../../src/contracts/grading/grading-port.js";
import { PUBLIC_CONTRACT_INVENTORY } from "../../src/contracts/public-contract-inventory.js";
import type { ReportCaseStatus } from "../../src/contracts/reporting/report-view-model.js";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const SOURCE_ROOT = resolve(REPOSITORY_ROOT, "src");
const CONTRACT_ROOT = resolve(SOURCE_ROOT, "contracts");
const INVENTORY_SOURCE_PATH = "src/contracts/public-contract-inventory.ts";

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

/** Reads the names exposed by deliberate named export statements. */
async function readNamedExports(
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
  const exportNames: string[] = [];

  for (const statement of sourceFile.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const exportSpecifier of statement.exportClause.elements) {
        exportNames.push(exportSpecifier.name.text);
      }
    }
  }

  return exportNames.sort();
}

/** Reads local named declarations that could duplicate an owned DTO symbol. */
async function readDeclaredNames(
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
  const declarationNames: string[] = [];

  for (const statement of sourceFile.statements) {
    if (
      (ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isFunctionDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)) &&
      statement.name
    ) {
      declarationNames.push(statement.name.text);
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const variableDeclaration of statement.declarationList
        .declarations) {
        if (ts.isIdentifier(variableDeclaration.name)) {
          declarationNames.push(variableDeclaration.name.text);
        }
      }
    }
  }

  return declarationNames;
}

interface StructuralDeclaration {
  name: string;
  signature: string;
}

/** Canonicalizes one member so property order and formatting cannot hide a copy. */
function readMemberSignature(
  member: ts.TypeElement,
  sourceFile: ts.SourceFile,
): string {
  if (ts.isPropertySignature(member)) {
    const isReadonly = member.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
    );
    return [
      "property",
      isReadonly ? "readonly" : "mutable",
      member.name.getText(sourceFile),
      member.questionToken ? "optional" : "required",
      member.type ? readTypeSignature(member.type, sourceFile) : "unknown",
    ].join(":");
  }

  return member.getText(sourceFile).replace(/\s+/gu, "");
}

/** Canonicalizes structural type syntax while preserving referenced owner names. */
function readTypeSignature(
  typeNode: ts.TypeNode,
  sourceFile: ts.SourceFile,
): string {
  if (ts.isTypeLiteralNode(typeNode)) {
    return `{${typeNode.members
      .map((member) => readMemberSignature(member, sourceFile))
      .sort()
      .join(";")}}`;
  }
  if (ts.isUnionTypeNode(typeNode) || ts.isIntersectionTypeNode(typeNode)) {
    const operator = ts.isUnionTypeNode(typeNode) ? "union" : "intersection";
    return `${operator}(${typeNode.types
      .map((memberType) => readTypeSignature(memberType, sourceFile))
      .sort()
      .join(",")})`;
  }
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return readTypeSignature(typeNode.type, sourceFile);
  }
  if (ts.isArrayTypeNode(typeNode)) {
    return `array(${readTypeSignature(typeNode.elementType, sourceFile)})`;
  }

  return typeNode.getText(sourceFile).replace(/\s+/gu, "");
}

/** Reads canonical signatures for top-level DTO interfaces and type aliases. */
function readStructuralDeclarations(
  sourcePath: string,
  sourceText: string,
): readonly StructuralDeclaration[] {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const structuralDeclarations: StructuralDeclaration[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement)) {
      structuralDeclarations.push({
        name: statement.name.text,
        signature: `interface(${statement.members
          .map((member) => readMemberSignature(member, sourceFile))
          .sort()
          .join(";")})`,
      });
    } else if (ts.isTypeAliasDeclaration(statement)) {
      structuralDeclarations.push({
        name: statement.name.text,
        signature: `type(${readTypeSignature(statement.type, sourceFile)})`,
      });
    }
  }

  return structuralDeclarations;
}

/** Loads the structural signatures that only their inventoried owner may declare. */
async function readOwnedStructuralSignatures(): Promise<
  ReadonlyMap<
    string,
    { readonly ownerPath: string; readonly symbolName: string }
  >
> {
  const ownedSignatures = new Map<
    string,
    { readonly ownerPath: string; readonly symbolName: string }
  >();

  for (const contractEntry of PUBLIC_CONTRACT_INVENTORY) {
    const ownerSourcePath = resolve(REPOSITORY_ROOT, contractEntry.sourcePath);
    const structuralDeclarations = readStructuralDeclarations(
      ownerSourcePath,
      await readFile(ownerSourcePath, "utf8"),
    );
    for (const structuralDeclaration of structuralDeclarations) {
      if (
        !(contractEntry.exportedSymbols as readonly string[]).includes(
          structuralDeclaration.name,
        )
      ) {
        continue;
      }

      expect(
        ownedSignatures.has(structuralDeclaration.signature),
        `${structuralDeclaration.name} duplicates another inventoried shape.`,
      ).toBe(false);
      ownedSignatures.set(structuralDeclaration.signature, {
        ownerPath: contractEntry.sourcePath,
        symbolName: structuralDeclaration.name,
      });
    }
  }

  return ownedSignatures;
}

/** Forces an exhaustive compile-time decision for the closed adapter union. */
function readAdapterKind(configuration: AdapterConfiguration): string {
  switch (configuration.type) {
    case "claude-code":
    case "codex":
    case "command":
    case "http":
      return configuration.type;
    default: {
      const unreachableConfiguration: never = configuration;
      return unreachableConfiguration;
    }
  }
}

/** Forces an exhaustive compile-time decision for the closed grader union. */
function readGraderKind(definition: GraderDefinition): string {
  switch (definition.type) {
    case "called-tool":
    case "code":
    case "contains":
    case "equals":
    case "files-untouched":
    case "json-schema":
    case "judge":
    case "maximum-steps":
    case "minimum-steps":
    case "never-called-tool":
    case "regular-expression":
      return definition.type;
    default: {
      const unreachableDefinition: never = definition;
      return unreachableDefinition;
    }
  }
}

/** Forces status consumers to keep grader errors distinct from assertion failure. */
function readGraderStatus(status: GraderVerdictStatus): string {
  switch (status) {
    case "fail":
    case "grader-error":
    case "pass":
      return status;
    default: {
      const unreachableStatus: never = status;
      return unreachableStatus;
    }
  }
}

/** Forces reports to retain the complete closed case-status partition. */
function readReportStatus(status: ReportCaseStatus): string {
  switch (status) {
    case "fail":
    case "grader-error":
    case "pass":
    case "skipped":
      return status;
    default: {
      const unreachableStatus: never = status;
      return unreachableStatus;
    }
  }
}

describe("public contract inventory", () => {
  test("has one versioned owner for every deliberate contract export", async () => {
    const inventorySourcePaths = PUBLIC_CONTRACT_INVENTORY.map(
      (contractEntry) => contractEntry.sourcePath,
    );
    expect(new Set(inventorySourcePaths).size).toBe(
      inventorySourcePaths.length,
    );
    expect(
      new Set(PUBLIC_CONTRACT_INVENTORY.map((entry) => entry.contractId)).size,
    ).toBe(PUBLIC_CONTRACT_INVENTORY.length);

    const contractSourcePaths = (await listTypeScriptFiles(CONTRACT_ROOT))
      .map((sourcePath) => relative(REPOSITORY_ROOT, sourcePath))
      .filter((sourcePath) => sourcePath !== INVENTORY_SOURCE_PATH);
    expect([...inventorySourcePaths].sort() as string[]).toEqual(
      contractSourcePaths,
    );

    for (const contractEntry of PUBLIC_CONTRACT_INVENTORY) {
      expect(contractEntry.schemaVersion).toBe(1);
      expect(
        await readNamedExports(
          resolve(REPOSITORY_ROOT, contractEntry.sourcePath),
        ),
      ).toEqual(contractEntry.exportedSymbols.slice().sort());
    }
  });

  test("prohibits duplicate declarations of inventoried DTO symbols", async () => {
    const symbolOwners = new Map<string, string>();
    for (const contractEntry of PUBLIC_CONTRACT_INVENTORY) {
      for (const exportedSymbol of contractEntry.exportedSymbols) {
        expect(symbolOwners.has(exportedSymbol)).toBe(false);
        symbolOwners.set(exportedSymbol, contractEntry.sourcePath);
      }
    }

    for (const sourcePath of await listTypeScriptFiles(SOURCE_ROOT)) {
      const repositoryRelativePath = relative(REPOSITORY_ROOT, sourcePath);
      for (const declaredName of await readDeclaredNames(sourcePath)) {
        const ownerPath = symbolOwners.get(declaredName);
        if (ownerPath) {
          expect(
            repositoryRelativePath,
            `${declaredName} must be imported from its owner.`,
          ).toBe(ownerPath);
        }
      }
    }
  });

  test("prohibits renamed structural copies of inventoried DTOs", async () => {
    const ownedSignatures = await readOwnedStructuralSignatures();

    for (const sourcePath of await listTypeScriptFiles(SOURCE_ROOT)) {
      const repositoryRelativePath = relative(REPOSITORY_ROOT, sourcePath);
      for (const structuralDeclaration of readStructuralDeclarations(
        sourcePath,
        await readFile(sourcePath, "utf8"),
      )) {
        const ownedSignature = ownedSignatures.get(
          structuralDeclaration.signature,
        );
        if (ownedSignature) {
          expect(
            repositoryRelativePath,
            `${structuralDeclaration.name} copies ${ownedSignature.symbolName}.`,
          ).toBe(ownedSignature.ownerPath);
        }
      }
    }
  });

  test("detects a hostile renamed and reordered measurement DTO copy", async () => {
    const ownedSignatures = await readOwnedStructuralSignatures();
    const [hostileDeclaration] = readStructuralDeclarations(
      "src/adapters/alternate-invocation-measurements.ts",
      `interface AlternateInvocationMeasurements {
        tokens: TokenUsage | null;
        cost: MonetaryAmount | null;
        durationMs: number | null;
      }`,
    );

    expect(hostileDeclaration).toBeDefined();
    expect(ownedSignatures.get(hostileDeclaration?.signature ?? "")).toEqual({
      ownerPath: "src/contracts/invocation/invocation-measurements.ts",
      symbolName: "InvocationMeasurements",
    });
  });

  test("keeps the human inventory synchronized with executable ownership", async () => {
    const inventoryDocument = await readFile(
      resolve(REPOSITORY_ROOT, "docs/contracts/public-contract-inventory.md"),
      "utf8",
    );

    for (const contractEntry of PUBLIC_CONTRACT_INVENTORY) {
      expect(inventoryDocument).toContain(`\`${contractEntry.contractId}\``);
      expect(inventoryDocument).toContain(`\`${contractEntry.sourcePath}\``);
    }
  });

  test("keeps closed public unions compile-time exhaustive", () => {
    expect(
      readAdapterKind({
        arguments: [],
        model: null,
        timeoutSeconds: 1,
        type: "codex",
      }),
    ).toBe("codex");
    expect(
      readGraderKind({
        graderId: "contains",
        type: "contains",
        value: "ok",
        caseSensitive: true,
      }),
    ).toBe("contains");
    expect(readGraderStatus("grader-error")).toBe("grader-error");
    expect(readReportStatus("skipped")).toBe("skipped");
  });
});
