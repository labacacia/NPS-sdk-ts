// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * Neural Web Manifest (NWM) — machine-readable capability descriptor exposed at
 * `/.nwm` on every NWP node (NPS-2 §4).
 * MIME type: application/nwp-manifest+json
 */

export interface NeuralWebManifest {
  /** NWP version string, e.g. `"0.2"`. */
  nwp:               string;
  /** Node NID in `urn:nps:node:{host}:{path}` format. */
  node_id:           string;
  /** `"memory"` / `"action"` / `"complex"` / `"anchor"` / `"bridge"`. */
  node_type:         string;
  display_name?:     string;
  wire_formats:      string[];
  preferred_format:  string;
  schema_anchors?:   Record<string, string>;
  capabilities:      NodeCapabilities;
  data_sources?:     string[];
  auth:              NodeAuth;
  endpoints:         NodeEndpoints;
  tokenizer_support?: string[];
  graph?:            NodeGraph;
  min_assurance_level?: string;
  token_budget?:     NwmTokenBudget;
  /** NWP v0.14 — uint32 monotonic counter incremented on every manifest change. */
  manifest_version?:    number;
  /** NWP v0.14 — ISO 8601 timestamp of last manifest update. */
  manifest_updated_at?: string;
}

/** HTTP header name for the NWP manifest version (NWP v0.14). */
export const X_NWM_VERSION = "X-NWM-Version" as const;

/** Capability flags advertised in the NWM (NPS-2 §4.2). */
export interface NodeCapabilities {
  query:              boolean;
  stream?:            boolean;
  subscribe?:         boolean;
  vector_search?:     boolean;
  token_budget_hint?: boolean;
  ext_frame?:         boolean;
  stream_query?:      boolean;
  aggregate?:         boolean;
  subscribe_filter?:  boolean;
  e2e_enc?:           boolean;
}

/** Authentication requirements declared in the NWM (NPS-2 §4.3). */
export interface NodeAuth {
  required:              boolean;
  identity_type?:        string;
  trusted_issuers?:      string[];
  required_capabilities?: string[];
  scope_check?:          string;
  ocsp_url?:             string;
}

/** Functional endpoint URLs advertised in the NWM (NPS-2 §4.1). */
export interface NodeEndpoints {
  query?:   string;
  stream?:  string;
  invoke?:  string;
  schema?:  string;
}

/** Sub-node graph declaration for Complex Nodes (NPS-2 §9). */
export interface NodeGraph {
  refs:       NodeGraphRef[];
  max_depth?: number;
}

export interface NodeGraphRef {
  rel:  string;
  node: string;
}

/** CGN budget block published in the NWM (token-budget.md §7.1). */
export interface NwmTokenBudget {
  cgn_limit: number;
  profile?:  string;
}
