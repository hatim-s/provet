/** Emits more bytes than the spike capture ceiling without reading input. */
function emitHugeOutput(): void {
  const outputChunk = "x".repeat(4_096);
  process.stdout.write(outputChunk);
  process.stderr.write(outputChunk);
}

emitHugeOutput();

export { emitHugeOutput };
