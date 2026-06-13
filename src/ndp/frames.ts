// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { EncodingTier, FrameType } from "../core/frames.js";
import type { NpsFrame } from "../core/codec.js";

export interface NdpAddress {
  host:     string;
  port:     number;
  protocol: string;
}

export interface NdpGraphNode {
  nid:            string;
  cluster_anchor?: string;
  node_roles?:    string[];
}

export interface NdpGraphEdge {
  from_nid:    string;
  to_nid:      string;
  latency_ms?: number;
  protocol?:   string;
}

export interface NdpResolveResult {
  host:              string;
  port:              number;
  ttl:               number;
  certFingerprint?:  string;
}

export class AnnounceFrame implements NpsFrame {
  readonly frameType     = FrameType.ANNOUNCE;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly nid:                  string,
    public readonly addresses:            readonly NdpAddress[],
    public readonly capabilities:         readonly string[],
    public readonly ttl:                  number,
    public readonly timestamp:            string,
    public readonly signature:            string,
    public readonly nodeType?:            string,
    public readonly node_roles?:          string[],
    public readonly cluster_anchor?:      string,
    public readonly spawn_spec_ref?:      Record<string, unknown>, // NDP v0.9 §3.1.1 schema
    public readonly bridge_protocols?:    string[],
    public readonly activation_mode?:     string,
    public readonly activation_endpoint?: string,
    public readonly heartbeat_interval_ms: number = 60_000, // NDP v0.9 §3.1
    // NDP v0.9 liveness — wire-only, EXCLUDED from the signed canonical form
    // (last_seen updates every heartbeat → must not require re-signing; §3.2.1).
    public readonly health?:              string, // "healthy" / "degraded" / "draining"
    public readonly last_seen?:           string, // ISO 8601 UTC liveness beat
  ) {}

  unsignedDict(): Record<string, unknown> {
    return {
      nid:                  this.nid,
      addresses:            this.addresses,
      capabilities:         this.capabilities,
      ttl:                  this.ttl,
      timestamp:            this.timestamp,
      node_type:            this.nodeType            ?? null,
      node_roles:           this.node_roles           ?? null,
      cluster_anchor:       this.cluster_anchor       ?? null,
      spawn_spec_ref:       this.spawn_spec_ref       ?? null,
      bridge_protocols:     this.bridge_protocols     ?? null,
      activation_mode:       this.activation_mode        ?? null,
      activation_endpoint:   this.activation_endpoint    ?? null,
      heartbeat_interval_ms: this.heartbeat_interval_ms,
    };
  }

  toDict(): Record<string, unknown> {
    const d: Record<string, unknown> = { ...this.unsignedDict(), signature: this.signature };
    // Liveness fields live on the wire only (not in unsignedDict → not signed).
    if (this.health !== undefined) d["health"] = this.health;
    if (this.last_seen !== undefined) d["last_seen"] = this.last_seen;
    return d;
  }

  static fromDict(data: Record<string, unknown>): AnnounceFrame {
    return new AnnounceFrame(
      data["nid"]                  as string,
      data["addresses"]            as NdpAddress[],
      data["capabilities"]         as string[],
      data["ttl"]                  as number,
      data["timestamp"]            as string,
      data["signature"]            as string,
      (data["node_type"]            as string | null) ?? undefined,
      ((data["node_roles"] ?? data["node_kind"]) as string[] | null) ?? undefined,
      (data["cluster_anchor"]       as string | null) ?? undefined,
      (data["spawn_spec_ref"]         as Record<string, unknown> | null) ?? undefined,
      (data["bridge_protocols"]       as string[] | null) ?? undefined,
      (data["activation_mode"]        as string | null) ?? undefined,
      (data["activation_endpoint"]    as string | null) ?? undefined,
      (data["heartbeat_interval_ms"]  as number | null) ?? 60_000,
      (data["health"]                 as string | null) ?? undefined,
      (data["last_seen"]              as string | null) ?? undefined,
    );
  }
}

export class ResolveFrame implements NpsFrame {
  readonly frameType     = FrameType.RESOLVE;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly target:        string,
    public readonly requesterNid?: string,
    public readonly resolved?:     NdpResolveResult,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      target:        this.target,
      requester_nid: this.requesterNid ?? null,
      resolved:      this.resolved     ?? null,
    };
  }

  static fromDict(data: Record<string, unknown>): ResolveFrame {
    return new ResolveFrame(
      data["target"]         as string,
      (data["requester_nid"] as string | null) ?? undefined,
      (data["resolved"]      as NdpResolveResult | null) ?? undefined,
    );
  }
}

export interface GraphFrameData {
  graph_id:  string;
  nodes:     NdpGraphNode[];
  edges:     NdpGraphEdge[];
  ttl:       number;
  metadata?: Record<string, unknown>;
}

export class GraphFrame implements NpsFrame {
  readonly frameType     = FrameType.GRAPH;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly graph_id:  string,
    public readonly nodes:     readonly NdpGraphNode[],
    public readonly edges:     readonly NdpGraphEdge[],
    public readonly ttl:       number,
    public readonly metadata?: Record<string, unknown>,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      graph_id:  this.graph_id,
      nodes:     this.nodes,
      edges:     this.edges,
      ttl:       this.ttl,
      metadata:  this.metadata ?? null,
    };
  }

  static fromDict(data: Record<string, unknown>): GraphFrame {
    return new GraphFrame(
      data["graph_id"] as string,
      (data["nodes"]   as NdpGraphNode[]) ?? [],
      (data["edges"]   as NdpGraphEdge[]) ?? [],
      data["ttl"]      as number,
      (data["metadata"] as Record<string, unknown> | null) ?? undefined,
    );
  }
}
