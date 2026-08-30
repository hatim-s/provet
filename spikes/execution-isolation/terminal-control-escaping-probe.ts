/** Identifies terminal controls and invisible bidirectional formatting controls. */
function isTerminalControlCodePoint(codePoint: number): boolean {
  return (
    codePoint <= 0x1f ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069)
  );
}

/** Renders terminal and bidirectional controls as visible Unicode code points. */
function escapeTerminalControlCharactersProbe(untrustedText: string): string {
  return [...untrustedText]
    .map((character) => {
      const codePoint = character.codePointAt(0);
      if (codePoint === undefined) {
        throw new Error("A matched control character had no code point.");
      }
      return isTerminalControlCodePoint(codePoint)
        ? `\\u{${codePoint.toString(16).padStart(2, "0")}}`
        : character;
    })
    .join("");
}

export { escapeTerminalControlCharactersProbe };
