import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
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
const TYPESCRIPT_CONFIGURATION_PATH = resolve(REPOSITORY_ROOT, "tsconfig.json");

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

interface SemanticStructuralDeclaration {
  declaration: ts.Declaration;
  name: string;
  signature: string;
}

interface OwnedSemanticSignature {
  ownerPath: string;
  ownerType: ts.Type;
  symbolName: string;
}

/** Loads the repository compiler settings used by semantic inventory checks. */
function readCompilerConfiguration(): ts.ParsedCommandLine {
  const configurationResult = ts.readConfigFile(
    TYPESCRIPT_CONFIGURATION_PATH,
    ts.sys.readFile,
  );
  if (configurationResult.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(
        configurationResult.error.messageText,
        "\n",
      ),
    );
  }

  return ts.parseJsonConfigFileContent(
    configurationResult.config,
    ts.sys,
    REPOSITORY_ROOT,
  );
}

/** Builds a semantic program and optionally overlays one compiling probe. */
function createSemanticProgram(
  rootSourcePaths: readonly string[],
  additionalSource?: {
    readonly sourcePath: string;
    readonly sourceText: string;
  },
): ts.Program {
  const compilerConfiguration = readCompilerConfiguration();
  if (!additionalSource) {
    return ts.createProgram({
      options: compilerConfiguration.options,
      rootNames: [...rootSourcePaths],
    });
  }

  const normalizedAdditionalPath = resolve(additionalSource.sourcePath);
  const compilerHost = ts.createCompilerHost(
    compilerConfiguration.options,
    true,
  );
  const readDefaultSourceFile = compilerHost.getSourceFile.bind(compilerHost);
  compilerHost.fileExists = (sourcePath) =>
    resolve(sourcePath) === normalizedAdditionalPath ||
    ts.sys.fileExists(sourcePath);
  compilerHost.readFile = (sourcePath) =>
    resolve(sourcePath) === normalizedAdditionalPath
      ? additionalSource.sourceText
      : ts.sys.readFile(sourcePath);
  compilerHost.getSourceFile = (
    sourcePath,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    resolve(sourcePath) === normalizedAdditionalPath
      ? ts.createSourceFile(
          sourcePath,
          additionalSource.sourceText,
          languageVersion,
          true,
          ts.ScriptKind.TS,
        )
      : readDefaultSourceFile(
          sourcePath,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        );

  return ts.createProgram({
    host: compilerHost,
    options: compilerConfiguration.options,
    rootNames: [...rootSourcePaths, normalizedAdditionalPath],
  });
}

/** Reports whether a property is readonly in its semantic declaration. */
function isReadonlyProperty(propertySymbol: ts.Symbol): boolean {
  return Boolean(
    propertySymbol.declarations?.some(
      (declaration) =>
        ts.canHaveModifiers(declaration) &&
        ts
          .getModifiers(declaration)
          ?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword),
    ),
  );
}

/** Canonicalizes a function signature using checker-resolved parameter types. */
function readCallSignature(
  callSignature: ts.Signature,
  typeChecker: ts.TypeChecker,
  activeTypes: ReadonlySet<ts.Type>,
): string {
  const declaration = callSignature.getDeclaration();
  const parameters = callSignature.getParameters().map((parameter) => {
    const parameterDeclaration = parameter.valueDeclaration ?? declaration;
    const parameterType = typeChecker.getTypeOfSymbolAtLocation(
      parameter,
      parameterDeclaration,
    );
    return `${parameter.flags & ts.SymbolFlags.Optional ? "optional" : "required"}:${readSemanticTypeSignature(
      parameterType,
      parameterDeclaration,
      typeChecker,
      activeTypes,
    )}`;
  });
  const returnType = typeChecker.getReturnTypeOfSignature(callSignature);
  return `call(${parameters.join(",")})->${readSemanticTypeSignature(
    returnType,
    declaration,
    typeChecker,
    activeTypes,
  )}`;
}

/** Canonicalizes checker-resolved type semantics, including intersections and heritage. */
function readSemanticTypeSignature(
  semanticType: ts.Type,
  location: ts.Node,
  typeChecker: ts.TypeChecker,
  activeTypes: ReadonlySet<ts.Type> = new Set(),
): string {
  if (activeTypes.has(semanticType)) {
    return "recursive";
  }

  const nestedActiveTypes = new Set(activeTypes);
  nestedActiveTypes.add(semanticType);

  if (semanticType.isUnion()) {
    return `union(${semanticType.types
      .map((memberType) =>
        readSemanticTypeSignature(
          memberType,
          location,
          typeChecker,
          nestedActiveTypes,
        ),
      )
      .sort()
      .join(",")})`;
  }
  if (semanticType.flags & ts.TypeFlags.StringLiteral) {
    return `string-literal(${JSON.stringify((semanticType as ts.StringLiteralType).value)})`;
  }
  if (semanticType.flags & ts.TypeFlags.NumberLiteral) {
    return `number-literal(${(semanticType as ts.NumberLiteralType).value})`;
  }

  const primitiveSignatures: readonly [ts.TypeFlags, string][] = [
    [ts.TypeFlags.Any, "any"],
    [ts.TypeFlags.Unknown, "unknown"],
    [ts.TypeFlags.Never, "never"],
    [ts.TypeFlags.Null, "null"],
    [ts.TypeFlags.Undefined, "undefined"],
    [ts.TypeFlags.Boolean, "boolean"],
    [ts.TypeFlags.Number, "number"],
    [ts.TypeFlags.String, "string"],
    [ts.TypeFlags.BigInt, "bigint"],
  ];
  const primitiveSignature = primitiveSignatures.find(
    ([typeFlag]) => semanticType.flags & typeFlag,
  );
  if (primitiveSignature) {
    return primitiveSignature[1];
  }

  if (typeChecker.isTupleType(semanticType)) {
    return `tuple(${typeChecker
      .getTypeArguments(semanticType as ts.TypeReference)
      .map((elementType) =>
        readSemanticTypeSignature(
          elementType,
          location,
          typeChecker,
          nestedActiveTypes,
        ),
      )
      .join(",")})`;
  }
  if (typeChecker.isArrayType(semanticType)) {
    const [elementType] = typeChecker.getTypeArguments(
      semanticType as ts.TypeReference,
    );
    return `array(${elementType ? readSemanticTypeSignature(elementType, location, typeChecker, nestedActiveTypes) : "unknown"})`;
  }

  const semanticSymbol = semanticType.aliasSymbol ?? semanticType.symbol;
  const isExternalReference = Boolean(
    semanticSymbol?.declarations?.every(
      (declaration) =>
        !resolve(declaration.getSourceFile().fileName).startsWith(
          `${SOURCE_ROOT}${sep}`,
        ),
    ),
  );
  if (semanticSymbol && isExternalReference) {
    const typeArguments =
      semanticType.flags & ts.TypeFlags.Object
        ? typeChecker.getTypeArguments(semanticType as ts.TypeReference)
        : [];
    return `external(${semanticSymbol.getName()}${typeArguments
      .map(
        (typeArgument) =>
          `:${readSemanticTypeSignature(
            typeArgument,
            location,
            typeChecker,
            nestedActiveTypes,
          )}`,
      )
      .join("")})`;
  }

  const properties = typeChecker.getPropertiesOfType(semanticType);
  const propertySignatures = properties.map((property) => {
    const propertyLocation = property.valueDeclaration ?? location;
    const propertyType = typeChecker.getTypeOfSymbolAtLocation(
      property,
      propertyLocation,
    );
    return [
      property.getName(),
      isReadonlyProperty(property) ? "readonly" : "mutable",
      property.flags & ts.SymbolFlags.Optional ? "optional" : "required",
      readSemanticTypeSignature(
        propertyType,
        propertyLocation,
        typeChecker,
        nestedActiveTypes,
      ),
    ].join(":");
  });
  const callSignatures = semanticType
    .getCallSignatures()
    .map((callSignature) =>
      readCallSignature(callSignature, typeChecker, nestedActiveTypes),
    );
  const stringIndexType = typeChecker.getIndexTypeOfType(
    semanticType,
    ts.IndexKind.String,
  );
  const numberIndexType = typeChecker.getIndexTypeOfType(
    semanticType,
    ts.IndexKind.Number,
  );
  return `object(${[
    ...propertySignatures,
    ...callSignatures,
    ...(stringIndexType
      ? [
          `string-index:${readSemanticTypeSignature(
            stringIndexType,
            location,
            typeChecker,
            nestedActiveTypes,
          )}`,
        ]
      : []),
    ...(numberIndexType
      ? [
          `number-index:${readSemanticTypeSignature(
            numberIndexType,
            location,
            typeChecker,
            nestedActiveTypes,
          )}`,
        ]
      : []),
  ]
    .sort()
    .join(";")})`;
}

/** Reads names deliberately exported from one source module. */
function readExportedLocalNames(
  sourceFile: ts.SourceFile,
): ReadonlySet<string> {
  const exportedLocalNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const exportSpecifier of statement.exportClause.elements) {
        exportedLocalNames.add(
          (exportSpecifier.propertyName ?? exportSpecifier.name).text,
        );
      }
    }

    if (
      ts.canHaveModifiers(statement) &&
      ts
        .getModifiers(statement)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      if (
        (ts.isClassDeclaration(statement) ||
          ts.isFunctionDeclaration(statement) ||
          ts.isInterfaceDeclaration(statement) ||
          ts.isTypeAliasDeclaration(statement)) &&
        statement.name
      ) {
        exportedLocalNames.add(statement.name.text);
      } else if (ts.isVariableStatement(statement)) {
        for (const variableDeclaration of statement.declarationList
          .declarations) {
          if (ts.isIdentifier(variableDeclaration.name)) {
            exportedLocalNames.add(variableDeclaration.name.text);
          }
        }
      }
    }
  }

  return exportedLocalNames;
}

/** Reports whether a semantic type exposes a public object shape. */
function isObjectShape(semanticType: ts.Type): boolean {
  return semanticType.isUnion() || semanticType.isIntersection()
    ? semanticType.types.every((memberType) => isObjectShape(memberType))
    : Boolean(semanticType.flags & ts.TypeFlags.Object);
}

/** Reads the public object types exposed by an exported value declaration. */
function readValueDeclarationTypes(
  declaration:
    | ts.ClassDeclaration
    | ts.FunctionDeclaration
    | ts.VariableDeclaration,
  typeChecker: ts.TypeChecker,
): readonly ts.Type[] {
  if (ts.isClassDeclaration(declaration)) {
    if (!declaration.name) {
      return [];
    }
    const classSymbol = typeChecker.getSymbolAtLocation(declaration.name);
    return classSymbol
      ? [typeChecker.getDeclaredTypeOfSymbol(classSymbol)]
      : [];
  }
  if (ts.isFunctionDeclaration(declaration)) {
    const callSignature = typeChecker.getSignatureFromDeclaration(declaration);
    return callSignature
      ? [typeChecker.getReturnTypeOfSignature(callSignature)]
      : [];
  }

  const variableSymbol = ts.isIdentifier(declaration.name)
    ? typeChecker.getSymbolAtLocation(declaration.name)
    : undefined;
  if (!variableSymbol) {
    return [];
  }
  const variableType = typeChecker.getTypeOfSymbolAtLocation(
    variableSymbol,
    declaration,
  );
  const constructedTypes = variableType
    .getConstructSignatures()
    .map((constructSignature) =>
      typeChecker.getReturnTypeOfSignature(constructSignature),
    );
  if (constructedTypes.length > 0) {
    return constructedTypes;
  }
  const returnedTypes = variableType
    .getCallSignatures()
    .map((callSignature) =>
      typeChecker.getReturnTypeOfSignature(callSignature),
    );
  return returnedTypes.length > 0 ? returnedTypes : [variableType];
}

/** Reads semantic signatures for owned types and exported object surfaces. */
function readSemanticStructuralDeclarations(
  program: ts.Program,
  sourcePath: string,
): readonly SemanticStructuralDeclaration[] {
  const sourceFile = program.getSourceFile(sourcePath);
  if (!sourceFile) {
    throw new Error(`TypeScript did not load ${sourcePath}.`);
  }
  const typeChecker = program.getTypeChecker();
  const structuralDeclarations: SemanticStructuralDeclaration[] = [];
  const exportedLocalNames = readExportedLocalNames(sourceFile);

  /** Records one checker-resolved object shape for ownership comparison. */
  const recordStructuralDeclaration = (
    declaration: ts.Declaration,
    declarationName: string,
    semanticType: ts.Type,
  ): void => {
    if (!isObjectShape(semanticType)) {
      return;
    }
    structuralDeclarations.push({
      declaration,
      name: declarationName,
      signature: readSemanticTypeSignature(
        semanticType,
        declaration,
        typeChecker,
      ),
    });
  };

  for (const statement of sourceFile.statements) {
    if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      recordStructuralDeclaration(
        statement,
        statement.name.text,
        typeChecker.getTypeAtLocation(statement),
      );
      continue;
    }

    if (
      (ts.isClassDeclaration(statement) ||
        ts.isFunctionDeclaration(statement)) &&
      statement.name &&
      exportedLocalNames.has(statement.name.text)
    ) {
      for (const exposedType of readValueDeclarationTypes(
        statement,
        typeChecker,
      )) {
        recordStructuralDeclaration(
          statement,
          statement.name.text,
          exposedType,
        );
      }
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const variableDeclaration of statement.declarationList
        .declarations) {
        if (
          !ts.isIdentifier(variableDeclaration.name) ||
          !exportedLocalNames.has(variableDeclaration.name.text)
        ) {
          continue;
        }
        for (const exposedType of readValueDeclarationTypes(
          variableDeclaration,
          typeChecker,
        )) {
          recordStructuralDeclaration(
            variableDeclaration,
            variableDeclaration.name.text,
            exposedType,
          );
        }
      }
    }
  }

  return structuralDeclarations;
}

/** Loads semantic signatures that only their inventoried owner may declare. */
function readOwnedSemanticSignatures(
  program: ts.Program,
): ReadonlyMap<string, OwnedSemanticSignature> {
  const ownedSignatures = new Map<string, OwnedSemanticSignature>();
  const typeChecker = program.getTypeChecker();

  for (const contractEntry of PUBLIC_CONTRACT_INVENTORY) {
    const ownerSourcePath = resolve(REPOSITORY_ROOT, contractEntry.sourcePath);
    const structuralDeclarations = readSemanticStructuralDeclarations(
      program,
      ownerSourcePath,
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
        ownerType: typeChecker.getTypeAtLocation(
          structuralDeclaration.declaration,
        ),
        symbolName: structuralDeclaration.name,
      });
    }
  }

  return ownedSignatures;
}

/** Reports whether a declaration genuinely reuses the matched owner type. */
function doesDeclarationReuseOwner(
  structuralDeclaration: SemanticStructuralDeclaration,
  ownedSignature: OwnedSemanticSignature,
  typeChecker: ts.TypeChecker,
): boolean {
  let doesReuseOwner = false;

  /** Finds a referenced type whose checker-resolved semantics equal the owner. */
  const inspectReference = (node: ts.Node): void => {
    if (
      (ts.isTypeReferenceNode(node) ||
        ts.isExpressionWithTypeArguments(node)) &&
      readSemanticTypeSignature(
        typeChecker.getTypeAtLocation(node),
        node,
        typeChecker,
      ) === structuralDeclaration.signature
    ) {
      doesReuseOwner = true;
      return;
    }

    ts.forEachChild(node, inspectReference);
  };
  inspectReference(structuralDeclaration.declaration);

  return (
    doesReuseOwner &&
    readSemanticTypeSignature(
      ownedSignature.ownerType,
      structuralDeclaration.declaration,
      typeChecker,
    ) === structuralDeclaration.signature
  );
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
    const sourcePaths = await listTypeScriptFiles(SOURCE_ROOT);
    const semanticProgram = createSemanticProgram(sourcePaths);
    const typeChecker = semanticProgram.getTypeChecker();
    const ownedSignatures = readOwnedSemanticSignatures(semanticProgram);

    for (const sourcePath of sourcePaths) {
      const repositoryRelativePath = relative(REPOSITORY_ROOT, sourcePath);
      for (const structuralDeclaration of readSemanticStructuralDeclarations(
        semanticProgram,
        sourcePath,
      )) {
        const ownedSignature = ownedSignatures.get(
          structuralDeclaration.signature,
        );
        if (
          ownedSignature &&
          !doesDeclarationReuseOwner(
            structuralDeclaration,
            ownedSignature,
            typeChecker,
          )
        ) {
          expect(
            repositoryRelativePath,
            `${structuralDeclaration.name} copies ${ownedSignature.symbolName}.`,
          ).toBe(ownedSignature.ownerPath);
        }
      }
    }
  });

  test("detects compiling interface, intersection, heritage, and class DTO copies", async () => {
    const sourcePaths = await listTypeScriptFiles(SOURCE_ROOT);
    const hostileSourcePath = resolve(
      SOURCE_ROOT,
      "adapters/alternate-invocation-measurements.ts",
    );
    const semanticProgram = createSemanticProgram(sourcePaths, {
      sourcePath: hostileSourcePath,
      sourceText: `import type {
          InvocationMeasurements,
          MonetaryAmount,
          TokenUsage,
        } from "../contracts/invocation/invocation-measurements.js";

        interface QuotedInvocationMeasurements {
          "tokens": TokenUsage | null;
          "cost": MonetaryAmount | null;
          "durationMs": number | null;
        }

        type SplitInvocationMeasurements = {
          "durationMs": number | null;
        } & {
          cost: MonetaryAmount | null;
        } & {
          tokens: TokenUsage | null;
        };

        interface MeasurementDuration {
          "durationMs": number | null;
        }
        interface MeasurementCost extends MeasurementDuration {
          cost: MonetaryAmount | null;
        }
        interface HeritageInvocationMeasurements extends MeasurementCost {
          tokens: TokenUsage | null;
        }

        class AlternateInvocationMeasurementsClass {
          declare cost: MonetaryAmount | null;
          declare durationMs: number | null;
          declare tokens: TokenUsage | null;
        }

        type ReusedInvocationMeasurements = InvocationMeasurements;
        interface ReusedInvocationMeasurementsInterface
          extends InvocationMeasurements {}
        class ReusedInvocationMeasurementsClass
          implements InvocationMeasurements {
          declare cost: MonetaryAmount | null;
          declare durationMs: number | null;
          declare tokens: TokenUsage | null;
        }
        interface ExtendedInvocationMeasurements
          extends InvocationMeasurements {
          source: string;
        }
        const reusedInvocationMeasurementsValue =
          {} as InvocationMeasurements;
        function createReusedInvocationMeasurements(): InvocationMeasurements {
          return reusedInvocationMeasurementsValue;
        }

        export {
          AlternateInvocationMeasurementsClass,
          createReusedInvocationMeasurements,
          ReusedInvocationMeasurementsClass,
          reusedInvocationMeasurementsValue,
          type ExtendedInvocationMeasurements,
          type HeritageInvocationMeasurements,
          type QuotedInvocationMeasurements,
          type ReusedInvocationMeasurements,
          type ReusedInvocationMeasurementsInterface,
          type SplitInvocationMeasurements,
        };`,
    });
    const hostileDeclarations = readSemanticStructuralDeclarations(
      semanticProgram,
      hostileSourcePath,
    );
    const ownedSignatures = readOwnedSemanticSignatures(semanticProgram);
    const invocationOwnerPath =
      "src/contracts/invocation/invocation-measurements.ts";

    expect(ts.getPreEmitDiagnostics(semanticProgram)).toEqual([]);
    for (const hostileName of [
      "QuotedInvocationMeasurements",
      "SplitInvocationMeasurements",
      "HeritageInvocationMeasurements",
      "AlternateInvocationMeasurementsClass",
    ]) {
      expect(
        hostileDeclarations.map((declaration) => declaration.name),
      ).toContain(hostileName);
      const hostileDeclaration = hostileDeclarations.find(
        (declaration) => declaration.name === hostileName,
      );
      expect(
        ownedSignatures.get(hostileDeclaration?.signature ?? "")?.ownerPath,
      ).toBe(invocationOwnerPath);
    }

    for (const reusedName of [
      "ReusedInvocationMeasurements",
      "ReusedInvocationMeasurementsInterface",
      "ReusedInvocationMeasurementsClass",
      "reusedInvocationMeasurementsValue",
      "createReusedInvocationMeasurements",
    ]) {
      const reusedDeclaration = hostileDeclarations.find(
        (declaration) => declaration.name === reusedName,
      );
      const reusedOwner = ownedSignatures.get(
        reusedDeclaration?.signature ?? "",
      );
      expect(reusedDeclaration).toBeDefined();
      expect(reusedOwner?.ownerPath).toBe(invocationOwnerPath);
      expect(
        reusedDeclaration && reusedOwner
          ? doesDeclarationReuseOwner(
              reusedDeclaration,
              reusedOwner,
              semanticProgram.getTypeChecker(),
            )
          : false,
      ).toBe(true);
    }

    const extendedDeclaration = hostileDeclarations.find(
      (declaration) => declaration.name === "ExtendedInvocationMeasurements",
    );
    expect(extendedDeclaration).toBeDefined();
    expect(ownedSignatures.has(extendedDeclaration?.signature ?? "")).toBe(
      false,
    );
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
