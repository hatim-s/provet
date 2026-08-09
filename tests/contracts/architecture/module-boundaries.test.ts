import { describe, expect, test } from "bun:test";
import { readdir, stat } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";

import moduleBoundaryConfiguration from "../../../architecture/module-boundaries.json" with {
  type: "json",
};

const REPOSITORY_ROOT = resolve(import.meta.dir, "../../..");
const SOURCE_ROOT = resolve(REPOSITORY_ROOT, "src");
const TYPESCRIPT_CONFIGURATION_PATH = resolve(REPOSITORY_ROOT, "tsconfig.json");
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
const HOST_GLOBAL_NAMES = new Set([
  "Bun",
  "Function",
  "eval",
  "global",
  "globalThis",
  "process",
  "require",
]);

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

/** Loads the repository compiler settings used by compiling boundary probes. */
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

/** Builds a checker-backed program and optionally overlays one hostile source file. */
function createBoundaryProgram(hostileSource?: {
  readonly compilerOptions?: ts.CompilerOptions;
  readonly sourcePath: string;
  readonly sourceText: string;
}): ts.Program {
  const compilerConfiguration = readCompilerConfiguration();
  const compilerOptions = {
    ...compilerConfiguration.options,
    ...hostileSource?.compilerOptions,
  };
  if (!hostileSource) {
    return ts.createProgram({
      options: compilerOptions,
      rootNames: compilerConfiguration.fileNames,
    });
  }

  const normalizedHostilePath = resolve(hostileSource.sourcePath);
  const compilerHost = ts.createCompilerHost(compilerOptions, true);
  const readDefaultSourceFile = compilerHost.getSourceFile.bind(compilerHost);
  compilerHost.fileExists = (sourcePath) =>
    resolve(sourcePath) === normalizedHostilePath ||
    ts.sys.fileExists(sourcePath);
  compilerHost.readFile = (sourcePath) =>
    resolve(sourcePath) === normalizedHostilePath
      ? hostileSource.sourceText
      : ts.sys.readFile(sourcePath);
  compilerHost.getSourceFile = (
    sourcePath,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    resolve(sourcePath) === normalizedHostilePath
      ? ts.createSourceFile(
          sourcePath,
          hostileSource.sourceText,
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
    options: compilerOptions,
    rootNames: [normalizedHostilePath],
  });
}

/** Resolves a symbol through an import alias without losing local declarations. */
function readResolvedSymbol(
  symbol: ts.Symbol,
  typeChecker: ts.TypeChecker,
): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias
    ? typeChecker.getAliasedSymbol(symbol)
    : symbol;
}

/** Reports whether an identifier refers to an ambient host global, not local shadowing. */
function isAmbientHostIdentifier(
  identifier: ts.Identifier,
  typeChecker: ts.TypeChecker,
): boolean {
  if (!HOST_GLOBAL_NAMES.has(identifier.text)) {
    return false;
  }

  return isAmbientNamedIdentifier(identifier, identifier.text, typeChecker);
}

/** Reports whether a named identifier resolves outside repository source. */
function isAmbientNamedIdentifier(
  identifier: ts.Identifier,
  expectedName: string,
  typeChecker: ts.TypeChecker,
): boolean {
  if (identifier.text !== expectedName) {
    return false;
  }

  const symbol = typeChecker.getSymbolAtLocation(identifier);
  return (
    !symbol ||
    !symbol.declarations?.some((declaration) =>
      resolve(declaration.getSourceFile().fileName).startsWith(
        `${SOURCE_ROOT}${sep}`,
      ),
    )
  );
}

/** Reads every bound symbol from an identifier or destructuring pattern. */
function readBindingSymbols(
  bindingName: ts.BindingName,
  typeChecker: ts.TypeChecker,
): readonly ts.Symbol[] {
  if (ts.isIdentifier(bindingName)) {
    const symbol = typeChecker.getSymbolAtLocation(bindingName);
    return symbol ? [readResolvedSymbol(symbol, typeChecker)] : [];
  }

  return bindingName.elements.flatMap((bindingElement) =>
    ts.isOmittedExpression(bindingElement)
      ? []
      : readBindingSymbols(bindingElement.name, typeChecker),
  );
}

/** Reads a statically named property from dot or bracket access. */
function readAccessedPropertyName(
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): string | null {
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  return expression.argumentExpression &&
    ts.isStringLiteral(expression.argumentExpression)
    ? expression.argumentExpression.text
    : null;
}

/** Removes syntax-only wrappers before classifying a runtime expression. */
function readUnwrappedExpression(expression: ts.Expression): ts.Expression {
  if (
    ts.isAsExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    return readUnwrappedExpression(expression.expression);
  }

  return expression;
}

/** Reports whether an expression is callable or constructable at runtime. */
function isCallableRuntimeExpression(
  expression: ts.Expression,
  typeChecker: ts.TypeChecker,
): boolean {
  const runtimeType = typeChecker.getTypeAtLocation(expression);
  return (
    runtimeType.getCallSignatures().length > 0 ||
    runtimeType.getConstructSignatures().length > 0
  );
}

/** Resolves ambient prototype-reader methods through local aliases. */
function isAmbientPrototypeReader(
  expression: ts.Expression,
  typeChecker: ts.TypeChecker,
  inspectedSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const unwrappedExpression = readUnwrappedExpression(expression);
  if (ts.isIdentifier(unwrappedExpression)) {
    const symbol = typeChecker.getSymbolAtLocation(unwrappedExpression);
    const resolvedSymbol = symbol
      ? readResolvedSymbol(symbol, typeChecker)
      : undefined;
    if (!resolvedSymbol || inspectedSymbols.has(resolvedSymbol)) {
      return false;
    }

    const nestedInspectedSymbols = new Set(inspectedSymbols);
    nestedInspectedSymbols.add(resolvedSymbol);
    return Boolean(
      resolvedSymbol.declarations?.some(
        (declaration) =>
          ts.isVariableDeclaration(declaration) &&
          declaration.initializer &&
          isAmbientPrototypeReader(
            declaration.initializer,
            typeChecker,
            nestedInspectedSymbols,
          ),
      ),
    );
  }

  if (
    !ts.isPropertyAccessExpression(unwrappedExpression) &&
    !ts.isElementAccessExpression(unwrappedExpression)
  ) {
    return false;
  }

  const prototypeOwner = readUnwrappedExpression(
    unwrappedExpression.expression,
  );
  return (
    readAccessedPropertyName(unwrappedExpression) === "getPrototypeOf" &&
    ts.isIdentifier(prototypeOwner) &&
    (isAmbientNamedIdentifier(prototypeOwner, "Object", typeChecker) ||
      isAmbientNamedIdentifier(prototypeOwner, "Reflect", typeChecker))
  );
}

/** Traces prototype reads whose input is a callable runtime value. */
function isCallablePrototypeExpression(
  expression: ts.Expression,
  typeChecker: ts.TypeChecker,
  inspectedSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const unwrappedExpression = readUnwrappedExpression(expression);
  if (ts.isIdentifier(unwrappedExpression)) {
    const symbol = typeChecker.getSymbolAtLocation(unwrappedExpression);
    const resolvedSymbol = symbol
      ? readResolvedSymbol(symbol, typeChecker)
      : undefined;
    if (!resolvedSymbol || inspectedSymbols.has(resolvedSymbol)) {
      return false;
    }

    const nestedInspectedSymbols = new Set(inspectedSymbols);
    nestedInspectedSymbols.add(resolvedSymbol);
    return Boolean(
      resolvedSymbol.declarations?.some(
        (declaration) =>
          ts.isVariableDeclaration(declaration) &&
          declaration.initializer &&
          isCallablePrototypeExpression(
            declaration.initializer,
            typeChecker,
            nestedInspectedSymbols,
          ),
      ),
    );
  }

  return (
    ts.isCallExpression(unwrappedExpression) &&
    isAmbientPrototypeReader(unwrappedExpression.expression, typeChecker) &&
    Boolean(
      unwrappedExpression.arguments[0] &&
        isCallableRuntimeExpression(
          unwrappedExpression.arguments[0],
          typeChecker,
        ),
    )
  );
}

/** Detects dynamic loaders and function constructors reached without a global name. */
function isIntrinsicDynamicCapability(
  expression: ts.Expression,
  typeChecker: ts.TypeChecker,
): boolean {
  if (
    !ts.isPropertyAccessExpression(expression) &&
    !ts.isElementAccessExpression(expression)
  ) {
    return false;
  }

  const accessedPropertyName = readAccessedPropertyName(expression);
  if (
    accessedPropertyName === "require" &&
    ts.isMetaProperty(expression.expression) &&
    expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword
  ) {
    return true;
  }

  const constructorOwner = readUnwrappedExpression(expression.expression);
  return (
    accessedPropertyName === "constructor" &&
    (ts.isArrowFunction(constructorOwner) ||
      ts.isFunctionExpression(constructorOwner) ||
      ts.isClassExpression(constructorOwner) ||
      isCallableRuntimeExpression(constructorOwner, typeChecker) ||
      isCallablePrototypeExpression(constructorOwner, typeChecker))
  );
}

/** Reports whether an expression exposes a host capability directly or through aliases. */
function doesExpressionExposeHost(
  expression: ts.Expression,
  typeChecker: ts.TypeChecker,
  hostCapabilitySymbols: ReadonlySet<ts.Symbol>,
): boolean {
  if (ts.isIdentifier(expression)) {
    const symbol = typeChecker.getSymbolAtLocation(expression);
    return (
      isAmbientHostIdentifier(expression, typeChecker) ||
      Boolean(
        symbol &&
          hostCapabilitySymbols.has(readResolvedSymbol(symbol, typeChecker)),
      )
    );
  }
  if (
    ts.isPropertyAccessExpression(expression) ||
    ts.isElementAccessExpression(expression)
  ) {
    if (isIntrinsicDynamicCapability(expression, typeChecker)) {
      return true;
    }
    return doesExpressionExposeHost(
      expression.expression,
      typeChecker,
      hostCapabilitySymbols,
    );
  }
  if (
    ts.isAsExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    return doesExpressionExposeHost(
      expression.expression,
      typeChecker,
      hostCapabilitySymbols,
    );
  }

  return false;
}

/** Propagates ambient host capability through variable aliases to a fixed point. */
function readHostCapabilitySymbols(
  sourceFile: ts.SourceFile,
  typeChecker: ts.TypeChecker,
): ReadonlySet<ts.Symbol> {
  const hostCapabilitySymbols = new Set<ts.Symbol>();
  let hasAddedCapability = true;

  while (hasAddedCapability) {
    hasAddedCapability = false;

    /** Taints bindings whose initializer already exposes a host capability. */
    const inspectAlias = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        doesExpressionExposeHost(
          node.initializer,
          typeChecker,
          hostCapabilitySymbols,
        )
      ) {
        for (const bindingSymbol of readBindingSymbols(
          node.name,
          typeChecker,
        )) {
          if (!hostCapabilitySymbols.has(bindingSymbol)) {
            hostCapabilitySymbols.add(bindingSymbol);
            hasAddedCapability = true;
          }
        }
      }

      ts.forEachChild(node, inspectAlias);
    };
    inspectAlias(sourceFile);
  }

  return hostCapabilitySymbols;
}

/** Reports whether an identifier is a reference rather than a declaration/property name. */
function isRuntimeIdentifierReference(identifier: ts.Identifier): boolean {
  const parentNode = identifier.parent;
  if (
    (ts.isPropertyAccessExpression(parentNode) &&
      parentNode.name === identifier) ||
    (ts.isPropertyAssignment(parentNode) && parentNode.name === identifier) ||
    (ts.isPropertySignature(parentNode) && parentNode.name === identifier) ||
    (ts.isBindingElement(parentNode) && parentNode.name === identifier) ||
    (ts.isVariableDeclaration(parentNode) && parentNode.name === identifier)
  ) {
    return false;
  }

  return !(
    ts.isExportSpecifier(parentNode) || ts.isImportSpecifier(parentNode)
  );
}

/** Reads internal dependencies and checker-resolved host capability access. */
function inspectSourceDependencies(
  sourceFile: ts.SourceFile,
  typeChecker: ts.TypeChecker,
): SourceDependencyObservation {
  const sourcePath = sourceFile.fileName;
  const importedModules: string[] = [];
  const hostBoundaryViolations: string[] = [];
  const hostCapabilitySymbols = readHostCapabilitySymbols(
    sourceFile,
    typeChecker,
  );

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
    } else if (
      ts.isImportEqualsDeclaration(statement) &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      statement.moduleReference.expression
    ) {
      inspectModuleSpecifier(statement.moduleReference.expression);
    }
  }

  /** Finds dynamic loading and checker-resolved host aliases. */
  const inspectNode = (node: ts.Node): void => {
    if (
      (ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node)) &&
      isIntrinsicDynamicCapability(node, typeChecker)
    ) {
      hostBoundaryViolations.push("intrinsic dynamic host capability");
    }

    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        hostBoundaryViolations.push("dynamic import");
      } else if (
        doesExpressionExposeHost(
          node.expression,
          typeChecker,
          hostCapabilitySymbols,
        )
      ) {
        hostBoundaryViolations.push("host capability call");
      }
    }

    if (
      ts.isIdentifier(node) &&
      isRuntimeIdentifierReference(node) &&
      (isAmbientHostIdentifier(node, typeChecker) ||
        Boolean(
          typeChecker.getSymbolAtLocation(node) &&
            hostCapabilitySymbols.has(
              readResolvedSymbol(
                typeChecker.getSymbolAtLocation(node) as ts.Symbol,
                typeChecker,
              ),
            ),
        ))
    ) {
      hostBoundaryViolations.push(`host capability ${node.text}`);
    }

    ts.forEachChild(node, inspectNode);
  };
  inspectNode(sourceFile);

  return { hostBoundaryViolations, importedModules };
}

/** Reads one real source file through the checker-backed inspection path. */
function inspectSourceFile(
  program: ts.Program,
  sourcePath: string,
): SourceDependencyObservation {
  const sourceFile = program.getSourceFile(sourcePath);
  if (!sourceFile) {
    throw new Error(`TypeScript did not load ${sourcePath}.`);
  }

  return inspectSourceDependencies(sourceFile, program.getTypeChecker());
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
    const repositoryProgram = createBoundaryProgram();
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

      const dependencyObservation = inspectSourceFile(
        repositoryProgram,
        sourcePath,
      );
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
    const repositoryProgram = createBoundaryProgram();
    const protectedSourcePaths = (
      await listTypeScriptFiles(SOURCE_ROOT)
    ).filter((sourcePath) =>
      HOST_FREE_MODULES.has(readLogicalModule(sourcePath)),
    );

    for (const protectedSourcePath of protectedSourcePaths) {
      expect(
        inspectSourceFile(repositoryProgram, protectedSourcePath)
          .hostBoundaryViolations,
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
    const hostileSourcePath = resolve(
      SOURCE_ROOT,
      "application/hostile-boundary-probe.ts",
    );
    const hostileProgram = createBoundaryProgram({
      sourcePath: hostileSourcePath,
      sourceText: hostileSource,
    });

    expect(
      inspectSourceFile(hostileProgram, hostileSourcePath)
        .hostBoundaryViolations,
    ).not.toEqual([]);
  });

  test.each([
    [
      "globalThis alias",
      "application",
      `const hostRuntime = globalThis;
       const runtimeVersion = hostRuntime.process.version;
       export { runtimeVersion };`,
    ],
    [
      "require alias",
      "contracts",
      `const loadHostModule = require;
       const fileSystem = loadHostModule("node:fs");
       export { fileSystem };`,
    ],
    [
      "multi-hop destructured process alias",
      "execution",
      `const firstHostRuntime = globalThis;
       const secondHostRuntime = firstHostRuntime;
       const { process: runtimeProcess } = secondHostRuntime;
       const runtimeVersion = runtimeProcess.version;
       export { runtimeVersion };`,
    ],
    [
      "global alias",
      "application",
      `const hostRuntime = global;
       const runtimeVersion = hostRuntime.process.version;
       export { runtimeVersion };`,
    ],
    [
      "process alias",
      "contracts",
      `const runtimeProcess = process;
       const runtimeVersion = runtimeProcess.version;
       export { runtimeVersion };`,
    ],
    [
      "Bun alias",
      "execution",
      `const bunRuntime = Bun;
       const runtimeVersion = bunRuntime.version;
       export { runtimeVersion };`,
    ],
  ])(
    "rejects a compiling %s in %s",
    (_description, protectedModule, hostileSource) => {
      const hostileSourcePath = resolve(
        SOURCE_ROOT,
        protectedModule,
        "host-alias-boundary-probe.ts",
      );
      const hostileProgram = createBoundaryProgram({
        sourcePath: hostileSourcePath,
        sourceText: hostileSource,
      });

      expect(ts.getPreEmitDiagnostics(hostileProgram)).toEqual([]);
      expect(
        inspectSourceFile(hostileProgram, hostileSourcePath)
          .hostBoundaryViolations,
      ).not.toEqual([]);
    },
  );

  test("rejects a compiling import-equals host module", () => {
    const hostileSourcePath = resolve(
      SOURCE_ROOT,
      "execution/import-equals-boundary-probe.ts",
    );
    const hostileProgram = createBoundaryProgram({
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        verbatimModuleSyntax: false,
      },
      sourcePath: hostileSourcePath,
      sourceText: `import fileSystem = require("node:fs");
        const runtimeVersion = fileSystem.constants.COPYFILE_EXCL;
        export { runtimeVersion };`,
    });

    expect(ts.getPreEmitDiagnostics(hostileProgram)).toEqual([]);
    expect(
      inspectSourceFile(hostileProgram, hostileSourcePath)
        .hostBoundaryViolations,
    ).not.toEqual([]);
  });

  test.each([
    [
      "ambient eval",
      "application",
      `const runtimeProcess = eval("process");
       export { runtimeProcess };`,
    ],
    [
      "Function constructor",
      "contracts",
      `const runtimeProcess = Function("return process")();
       export { runtimeProcess };`,
    ],
    [
      "import.meta.require",
      "execution",
      `const fileSystem = import.meta.require("node:fs");
       export { fileSystem };`,
    ],
    [
      "multi-hop eval alias",
      "application",
      `const firstEvaluator = eval;
       const secondEvaluator = firstEvaluator;
       const runtimeProcess = secondEvaluator("process");
       export { runtimeProcess };`,
    ],
    [
      "multi-hop Function alias",
      "contracts",
      `const firstConstructor = Function;
       const secondConstructor = firstConstructor;
       const runtimeProcess = secondConstructor("return process")();
       export { runtimeProcess };`,
    ],
    [
      "multi-hop import.meta.require alias",
      "execution",
      `const firstLoader = import.meta.require;
       const secondLoader = firstLoader;
       const fileSystem = secondLoader("node:fs");
       export { fileSystem };`,
    ],
    [
      "function constructor property",
      "application",
      `const dynamicConstructor = (function domainFunction() {}).constructor;
       export { dynamicConstructor };`,
    ],
    [
      "class constructor property",
      "application",
      `const dynamicConstructor = (class DomainClass {}).constructor;
       const runtimeProcess = dynamicConstructor("return process")();
       export { runtimeProcess };`,
    ],
    [
      "declared class constructor property",
      "contracts",
      `class DomainClass {}
       const dynamicConstructor = DomainClass.constructor;
       const runtimeProcess = dynamicConstructor("return process")();
       export { runtimeProcess };`,
    ],
    [
      "prototype-derived function constructor",
      "execution",
      `const functionPrototype = Object.getPrototypeOf(function domainFunction() {});
       const dynamicConstructor = functionPrototype.constructor;
       const runtimeProcess = dynamicConstructor("return process")();
       export { runtimeProcess };`,
    ],
    [
      "computed prototype-derived function constructor",
      "application",
      `const functionPrototype = Object["getPrototypeOf"](() => "domain-value");
       const dynamicConstructor = functionPrototype["constructor"];
       const runtimeProcess = dynamicConstructor("return process")();
       export { runtimeProcess };`,
    ],
    [
      "aliased prototype-derived class constructor",
      "contracts",
      `const readPrototype = Object.getPrototypeOf;
       const secondPrototypeReader = readPrototype;
       const classPrototype = secondPrototypeReader(class DomainClass {});
       const dynamicConstructor = classPrototype.constructor;
       const runtimeProcess = dynamicConstructor("return process")();
       export { runtimeProcess };`,
    ],
    [
      "Reflect-derived function constructor",
      "execution",
      `const functionPrototype = Reflect.getPrototypeOf(() => "domain-value")!;
       const dynamicConstructor = functionPrototype.constructor;
       const runtimeProcess = dynamicConstructor("return process")();
       export { runtimeProcess };`,
    ],
  ])(
    "rejects a compiling %s loader in %s",
    (_description, protectedModule, hostileSource) => {
      const hostileSourcePath = resolve(
        SOURCE_ROOT,
        protectedModule,
        "dynamic-host-loader-probe.ts",
      );
      const hostileProgram = createBoundaryProgram({
        sourcePath: hostileSourcePath,
        sourceText: hostileSource,
      });

      expect(ts.getPreEmitDiagnostics(hostileProgram)).toEqual([]);
      expect(
        inspectSourceFile(hostileProgram, hostileSourcePath)
          .hostBoundaryViolations,
      ).not.toEqual([]);
    },
  );

  test.each([
    [
      "process",
      `const process = { version: "domain-version" };
       const value = process.version;
       export { value };`,
    ],
    [
      "eval property",
      `const evaluator = { eval: (source: string) => source };
       const value = evaluator.eval("domain-value");
       export { value };`,
    ],
    [
      "Function",
      `const Function = (source: string) => source;
       const value = Function("domain-value");
       export { value };`,
    ],
    [
      "require property",
      `const moduleMetadata = { require: (name: string) => name };
       const value = moduleMetadata.require("domain-module");
       export { value };`,
    ],
    [
      "Object.getPrototypeOf",
      `const Object = {
         getPrototypeOf: (_value: unknown) => ({ constructor: "domain-constructor" }),
       };
       const value = Object.getPrototypeOf(() => "domain-value").constructor;
       export { value };`,
    ],
    [
      "Reflect.getPrototypeOf",
      `const Reflect = {
         getPrototypeOf: (_value: unknown) => ({ constructor: "domain-constructor" }),
       };
       const value = Reflect.getPrototypeOf(() => "domain-value").constructor;
       export { value };`,
    ],
  ])("permits a compiling local %s shadow", (_description, sourceText) => {
    const sourcePath = resolve(SOURCE_ROOT, "application/local-host-name.ts");
    const sourceProgram = createBoundaryProgram({ sourcePath, sourceText });

    expect(ts.getPreEmitDiagnostics(sourceProgram)).toEqual([]);
    expect(
      inspectSourceFile(sourceProgram, sourcePath).hostBoundaryViolations,
    ).toEqual([]);
  });
});
