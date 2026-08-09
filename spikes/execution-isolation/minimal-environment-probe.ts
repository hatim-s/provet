interface MinimalEnvironmentProbeOptions {
  allowedInheritedVariableNames: readonly string[];
  fixedVariables: Readonly<Record<string, string>>;
  inheritedEnvironment: NodeJS.ProcessEnv;
}

const environmentVariableNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Constructs an explicit subprocess environment from an allowlist and fixed
 * values without forwarding the ambient host environment wholesale.
 */
function constructMinimalEnvironmentProbe(
  options: MinimalEnvironmentProbeOptions,
): Readonly<Record<string, string>> {
  const minimalEnvironment: Record<string, string> = {};

  for (const variableName of options.allowedInheritedVariableNames) {
    if (!environmentVariableNamePattern.test(variableName)) {
      throw new Error(`Invalid environment variable name: ${variableName}`);
    }

    const variableValue = options.inheritedEnvironment[variableName];
    if (variableValue !== undefined) {
      minimalEnvironment[variableName] = variableValue;
    }
  }

  for (const [variableName, variableValue] of Object.entries(
    options.fixedVariables,
  )) {
    if (!environmentVariableNamePattern.test(variableName)) {
      throw new Error(`Invalid environment variable name: ${variableName}`);
    }
    minimalEnvironment[variableName] = variableValue;
  }

  return Object.freeze(minimalEnvironment);
}

export {
  constructMinimalEnvironmentProbe,
  type MinimalEnvironmentProbeOptions,
};
