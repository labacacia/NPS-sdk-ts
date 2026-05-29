// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

const BYTES_PER_CGN = 4;

/** CGN = ceil(UTF-8 bytes / 4). Returns 0 for empty input. */
export function estimateCgn(value: string | Uint8Array): number {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  return bytes.length === 0 ? 0 : Math.ceil(bytes.length / BYTES_PER_CGN);
}

/** Compact-JSON-serialize obj, then estimateCgn. */
export function estimateCgnJson(obj: unknown): number {
  return estimateCgn(JSON.stringify(obj));
}

/** Sum CGN estimates for an array of JSON-serializable rows. */
export function estimateCgnRows(rows: unknown[]): number {
  return rows.reduce<number>((acc, r) => acc + estimateCgnJson(r), 0);
}

export interface TokenBudgetMeta {
  cgn_limit: number;
  tokenizer?: string;
  supported_tokenizers?: string[];
  token_budget_hint?: boolean;
  profile?: string;
}

export class BudgetExceededError extends Error {
  constructor(public readonly requested: number, public readonly limit: number) {
    super(`CGN budget exceeded: ${requested} > ${limit}`);
    this.name = "BudgetExceededError";
  }
}
