// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { NDP_FEDERATION_LOOP } from "./ndp-error-codes.js";

export const NDP_FORWARDED_BY_HEADER = "ndp-forwarded-by" as const;
export const MAX_FEDERATION_HOPS = 3;

export class NdpFederationLoopError extends Error {
  readonly code = NDP_FEDERATION_LOOP;
}

export function parseForwardedBy(header?: string | null): string[] {
  if (!header) return [];
  return header.split(",").map((part) => part.trim()).filter(Boolean);
}

export function appendForwardedBy(ownNid: string, header?: string | null): string | undefined {
  const hops = parseForwardedBy(header);
  if (hops.includes(ownNid)) {
    throw new NdpFederationLoopError(`${NDP_FEDERATION_LOOP}: own NID already appears in ndp-forwarded-by`);
  }
  if (hops.length >= MAX_FEDERATION_HOPS) return undefined;
  return [...hops, ownNid].join(", ");
}
