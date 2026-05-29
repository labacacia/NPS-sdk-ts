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
  nid:          string;
  addresses:    readonly NdpAddress[];
  capabilities: readonly string[];
  nodeType?:    string;
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
    public readonly spawn_spec_ref?:      string,
    public readonly bridge_protocols?:    string[],
    public readonly activation_mode?:     string,
    public readonly activation_endpoint?: string,
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
      activation_mode:      this.activation_mode      ?? null,
      activation_endpoint:  this.activation_endpoint  ?? null,
    };
  }

  toDict(): Record<string, unknown> {
    return { ...this.unsignedDict(), signature: this.signature };
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
      (data["spawn_spec_ref"]       as string | null) ?? undefined,
      (data["bridge_protocols"]     as string[] | null) ?? undefined,
      (data["activation_mode"]      as string | null) ?? undefined,
      (data["activation_endpoint"]  as string | null) ?? undefined,
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

export class GraphFrame implements NpsFrame {
  readonly frameType     = FrameType.GRAPH;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly seq:         number,
    public readonly initialSync: boolean,
    public readonly nodes?:      readonly NdpGraphNode[],
    public readonly patch?:      readonly Record<string, unknown>[],
  ) {}

  toDict(): Record<string, unknown> {
    return {
      seq:          this.seq,
      initial_sync: this.initialSync,
      nodes:        this.nodes ?? null,
      patch:        this.patch ?? null,
    };
  }

  static fromDict(data: Record<string, unknown>): GraphFrame {
    return new GraphFrame(
      data["seq"]          as number,
      data["initial_sync"] as boolean,
      (data["nodes"] as NdpGraphNode[] | null) ?? undefined,
      (data["patch"] as Record<string, unknown>[] | null) ?? undefined,
    );
  }
}
