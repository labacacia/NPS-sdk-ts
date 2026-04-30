// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/** ACME wire-level DTOs (RFC 8555 + NPS-RFC-0002 §4.4) — plain interfaces. */

export interface DirectoryMeta {
  termsOfService?:          string;
  website?:                 string;
  caaIdentities?:           readonly string[];
  externalAccountRequired?: boolean;
}

export interface Directory {
  newNonce:    string;
  newAccount:  string;
  newOrder:    string;
  revokeCert?: string;
  keyChange?:  string;
  meta?:       DirectoryMeta;
}

export interface NewAccountPayload {
  termsOfServiceAgreed?: boolean;
  contact?:              readonly string[];
  onlyReturnExisting?:   boolean;
}

export interface Account {
  status:    string;
  contact?:  readonly string[];
  orders?:   string;
}

export interface Identifier {
  type:  string;   // "nid" per NPS-RFC-0002 §4.4
  value: string;
}

export interface NewOrderPayload {
  identifiers: readonly Identifier[];
  notBefore?:  string;
  notAfter?:   string;
}

export interface ProblemDetail {
  type:    string;
  detail?: string;
  status?: number;
}

export interface Order {
  status:         string;
  expires?:       string;
  identifiers:    readonly Identifier[];
  authorizations: readonly string[];
  finalize:       string;
  certificate?:   string;
  error?:         ProblemDetail;
}

export interface Challenge {
  type:       string;   // "agent-01" per NPS-RFC-0002 §4.4
  url:        string;
  status:     string;
  token:      string;
  validated?: string;
  error?:     ProblemDetail;
}

export interface Authorization {
  status:     string;
  expires?:   string;
  identifier: Identifier;
  challenges: readonly Challenge[];
}

export interface ChallengeRespondPayload {
  /** base64url(Ed25519(token)) per NPS-RFC-0002 §4.4. */
  agent_signature: string;
}

export interface FinalizePayload {
  /** base64url(CSR DER). */
  csr: string;
}
