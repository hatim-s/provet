import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runBoundedSubprocessProbe } from "../../../spikes/execution-isolation/bounded-subprocess-probe.js";
import { escapeTerminalControlCharactersProbe } from "../../../spikes/execution-isolation/terminal-control-escaping-probe.js";

const terminalFixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/security/execution-isolation/emit-terminal-controls.ts",
);

test("captured terminal controls become visible inert text before display", async () => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "provet-spi-03-terminal-"),
  );

  try {
    const executionResult = await runBoundedSubprocessProbe({
      arguments: [terminalFixturePath],
      environment: { LANG: "C", LC_ALL: "C" },
      executable: process.execPath,
      maximumOutputBytes: 1_024,
      terminationGraceMs: 40,
      timeoutMs: 1_000,
      workingDirectory: temporaryDirectory,
    });
    const escapedOutput = escapeTerminalControlCharactersProbe(
      executionResult.standardOutput,
    );

    expect(escapedOutput).toContain("\\u{1b}[31m");
    expect(escapedOutput).toContain("\\u{07}");
    expect(escapedOutput).toContain("\\u{0d}");
    expect(escapedOutput).toContain("\\u{202e}");
    expect(
      [...escapedOutput].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return (
          codePoint <= 0x1f ||
          (codePoint >= 0x7f && codePoint <= 0x9f) ||
          (codePoint >= 0x202a && codePoint <= 0x202e) ||
          (codePoint >= 0x2066 && codePoint <= 0x2069)
        );
      }),
    ).toBe(false);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});
