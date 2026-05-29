// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/** NWP Bridge Node type definitions (NPS-2 §2A, NPS-CR-0001). */

export const NODE_TYPE_BRIDGE = "bridge" as const;

/** Standard bridge_protocols wire-string constants (NPS-CR-0001 §3). */
export const BridgeProtocols = {
  HTTP:     "http",
  GRPC:     "grpc",
  MCP:      "mcp",
  A2A:      "a2a",
  STANDARD: ["http", "grpc", "mcp", "a2a"] as const,
} as const;

/** Declares which external protocols a Bridge Node deployment can reach. */
export interface BridgeNodeDescriptor {
  nid: string;
  supportedProtocols: ReadonlySet<string> | string[];
}

/** Inbound parameter object for a bridge invocation. */
export interface BridgeTarget {
  protocol: string;
  endpoint: string;
  extras?:  Record<string, unknown>;
}

export function bridgeTargetToDict(t: BridgeTarget): Record<string, unknown> {
  const d: Record<string, unknown> = { protocol: t.protocol, endpoint: t.endpoint };
  if (t.extras !== undefined) d["extras"] = t.extras;
  return d;
}

export function bridgeTargetFromDict(d: Record<string, unknown>): BridgeTarget {
  return {
    protocol: d["protocol"] as string,
    endpoint: d["endpoint"] as string,
    extras:   d["extras"] !== undefined ? d["extras"] as Record<string, unknown> : undefined,
  };
}
