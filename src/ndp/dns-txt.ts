// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import type { NdpResolveResult } from "./frames.js";

export const DNS_TXT_DEFAULT_TTL = 300;

/**
 * Extract the hostname from an NWP target URI.
 * e.g. "nwp://api.example.com/products" → "api.example.com"
 */
export function extractHostFromTarget(target: string): string | undefined {
  if (!target.startsWith("nwp://")) return undefined;
  const rest     = target.slice("nwp://".length);
  const slashIdx = rest.indexOf("/");
  const host     = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
  return host.length > 0 ? host : undefined;
}

/**
 * Parse one TXT record (array of string chunks) into an NdpResolveResult.
 *
 * Expected format (chunks joined with a single space):
 *   v=nps1 type=<type> port=<port> nid=<nid> fp=sha256:<fingerprint>
 *
 * Rules:
 *  - `v` MUST be present and equal to "nps1"
 *  - `nid` MUST be present
 *  - `port` defaults to 17433 when absent
 *  - `fp` is mapped to certFingerprint
 */
export function parseNpsTxtRecord(
  parts: string[],
  host: string,
): NdpResolveResult | undefined {
  const joined = parts.join(" ");
  const kv     = new Map<string, string>();

  for (const token of joined.split(/\s+/)) {
    const eq = token.indexOf("=");
    if (eq === -1) continue;
    const key = token.slice(0, eq);
    const val = token.slice(eq + 1);
    kv.set(key, val);
  }

  if (kv.get("v") !== "nps1") return undefined;

  const nid = kv.get("nid");
  if (!nid) return undefined;

  const rawPort = kv.get("port");
  const port    = rawPort !== undefined ? Number(rawPort) : 17433;
  const fp      = kv.get("fp");

  const result: NdpResolveResult = {
    host,
    port,
    ttl: DNS_TXT_DEFAULT_TTL,
  };

  if (fp !== undefined) {
    result.certFingerprint = fp;
  }

  return result;
}

/**
 * Abstraction over DNS TXT lookups.
 * The default implementation uses Node's `dns.promises`; pass a mock in tests.
 */
export interface DnsTxtLookup {
  resolveTxt(hostname: string): Promise<string[][]>;
}

/**
 * System DNS TXT resolver backed by Node's built-in `dns.promises`.
 * The dynamic `import()` keeps browser bundles from failing at parse time.
 */
export class SystemDnsTxtLookup implements DnsTxtLookup {
  async resolveTxt(hostname: string): Promise<string[][]> {
    const { promises: dns } = await import("node:dns");
    return dns.resolveTxt(hostname);
  }
}
