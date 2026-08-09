/** Emits ANSI, OSC, carriage-return, bell, and bidirectional control probes. */
function emitTerminalControls(): void {
  process.stdout.write(
    "safe\u001b[31mred\u001b[0m\u001b]0;forged-title\u0007\rforged\n\u202etxt",
  );
}

emitTerminalControls();

export { emitTerminalControls };
