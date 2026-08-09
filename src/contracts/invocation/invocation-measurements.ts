/** Records a monetary amount in an explicit ISO 4217 currency. */
interface MonetaryAmount {
  amount: number;
  currency: string;
}

/** Records provider token counts; unavailable individual counts remain null. */
interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

/** Keeps target and judge measures attributable to their individual invocation. */
interface InvocationMeasurements {
  cost: MonetaryAmount | null;
  durationMs: number | null;
  tokens: TokenUsage | null;
}

export type { InvocationMeasurements, MonetaryAmount, TokenUsage };
