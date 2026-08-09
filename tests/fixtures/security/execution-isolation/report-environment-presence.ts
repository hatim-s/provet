/** Reports only whether requested variables exist, never their values. */
function reportEnvironmentPresence(): void {
  const variablePresence = Object.fromEntries(
    process.argv
      .slice(2)
      .map((variableName) => [
        variableName,
        Object.hasOwn(process.env, variableName),
      ]),
  );
  process.stdout.write(`${JSON.stringify(variablePresence)}\n`);
}

reportEnvironmentPresence();

export { reportEnvironmentPresence };
