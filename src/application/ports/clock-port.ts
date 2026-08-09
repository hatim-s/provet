/** Provides wall-clock time without coupling application code to the host clock. */
interface ClockPort {
  /** Returns the current wall-clock time. */
  getCurrentTime(): Date;
}

export type { ClockPort };
