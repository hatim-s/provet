/** Ignores graceful termination so the probe must escalate to a forced kill. */
function ignoreGracefulTermination(): void {
  process.on("SIGTERM", () => {
    process.stdout.write("graceful termination observed\n");
  });
  setInterval(() => undefined, 1_000);
}

ignoreGracefulTermination();

export { ignoreGracefulTermination };
