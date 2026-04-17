// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// Handshake — Version negotiation and encoding negotiation
// NPS-1 §2.6

/**
 * Parse a "major.minor" (optionally "major.minor.patch") version string into a
 * tuple of numeric components. Invalid parts become NaN which makes subsequent
 * comparisons return false in both directions (safe failure).
 */
function parseVersion(v: string): number[] {
  return v.split(".").map((p) => Number.parseInt(p, 10));
}

/**
 * Numeric component-wise comparison of two version strings.
 * Returns negative if a < b, zero if equal, positive if a > b.
 * Avoids the lexicographic pitfall where "0.9" > "0.10".
 */
function compareVersions(a: string, b: string): number {
  const partsA = parseVersion(a);
  const partsB = parseVersion(b);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i += 1) {
    const x = partsA[i] ?? 0;
    const y = partsB[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/**
 * Negotiate the session NPS version between client and server.
 *
 * Session version = numeric min of client.nps_version and server.nps_version
 * (component-wise — "0.9" < "0.10" < "1.0").
 * If the effective client minimum (min_version ?? nps_version) > server.nps_version,
 * the versions are incompatible.
 *
 * Spec: NPS-1 §2.6
 */
export function negotiateVersion(
  client: { nps_version: string; min_version?: string },
  server: { nps_version: string },
): { session_version: string; compatible: boolean; error_code?: string } {
  const clientMin = client.min_version ?? client.nps_version;
  const serverVersion = server.nps_version;

  if (compareVersions(clientMin, serverVersion) > 0) {
    return {
      session_version: serverVersion,
      compatible: false,
      error_code: "NCP-VERSION-INCOMPATIBLE",
    };
  }

  // Session version = component-wise min of client.nps_version and server.nps_version
  const sessionVersion =
    compareVersions(client.nps_version, serverVersion) <= 0
      ? client.nps_version
      : serverVersion;

  return { session_version: sessionVersion, compatible: true };
}

/**
 * Negotiate the encoding between client and server preferred lists.
 *
 * Returns the first mutually supported encoding, preferring "msgpack" over "json".
 * Returns null if there is no intersection.
 */
export function negotiateEncoding(
  client: string[],
  server: string[],
): { encoding: string | null } {
  const serverSet = new Set(server);

  // Prefer msgpack over json (and over any other encoding)
  if (client.includes("msgpack") && serverSet.has("msgpack")) {
    return { encoding: "msgpack" };
  }
  if (client.includes("json") && serverSet.has("json")) {
    return { encoding: "json" };
  }

  // Fall back to first intersection in client-preference order
  for (const enc of client) {
    if (serverSet.has(enc)) {
      return { encoding: enc };
    }
  }

  return { encoding: null };
}
