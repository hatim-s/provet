/** Prints received arguments as data so metacharacters cannot be mistaken for syntax. */
function printArguments(): void {
  process.stdout.write(`${JSON.stringify(process.argv.slice(2))}\n`);
}

printArguments();

export { printArguments };
