// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { RepOutcome } from "../src/nwp/reputation.js";
import type { ReputationPolicy, ReputationRule, ReputationDecision } from "../src/nwp/reputation.js";

// ── RepOutcome ────────────────────────────────────────────────────────────────

describe("RepOutcome", () => {
  it("has four distinct values", () => {
    const values = new Set([RepOutcome.Accept, RepOutcome.Throttle, RepOutcome.Reject, RepOutcome.Ban]);
    expect(values.size).toBe(4);
  });

  it("Accept is 0", () => {
    expect(RepOutcome.Accept).toBe(0);
  });

  it("Throttle is 1", () => {
    expect(RepOutcome.Throttle).toBe(1);
  });

  it("Reject is 2", () => {
    expect(RepOutcome.Reject).toBe(2);
  });

  it("Ban is 3", () => {
    expect(RepOutcome.Ban).toBe(3);
  });
});

// ── ReputationPolicy ──────────────────────────────────────────────────────────

describe("ReputationPolicy", () => {
  it("accepts a fully-specified policy object", () => {
    const policy: ReputationPolicy = {
      enabled: true,
      logSources: ["https://log.example.com"],
      minAssuranceLevel: "anonymous",
      cacheTtlSeconds: 300,
      banTtlSeconds: 3600,
      onLogUnavailable: "allow",
      throttleOn: [],
      rejectOn: [],
      banOn: [],
    };
    expect(policy.enabled).toBe(true);
    expect(policy.logSources).toHaveLength(1);
    expect(policy.minAssuranceLevel).toBe("anonymous");
  });

  it("accepts a minimal policy object (all fields optional)", () => {
    const policy: ReputationPolicy = {};
    expect(policy.enabled).toBeUndefined();
  });
});

// ── ReputationRule ────────────────────────────────────────────────────────────

describe("ReputationRule", () => {
  it("accepts a fully-specified rule object", () => {
    const rule: ReputationRule = {
      incident: "spam",
      severity: ">=minor",
      withinDays: 30,
      count: 3,
    };
    expect(rule.incident).toBe("spam");
    expect(rule.severity).toBe(">=minor");
    expect(rule.withinDays).toBe(30);
    expect(rule.count).toBe(3);
  });

  it("accepts a minimal rule object (all fields optional)", () => {
    const rule: ReputationRule = {};
    expect(rule.incident).toBeUndefined();
  });
});

// ── ReputationDecision ────────────────────────────────────────────────────────

describe("ReputationDecision", () => {
  it("carries outcome", () => {
    const d: ReputationDecision = { outcome: RepOutcome.Accept };
    expect(d.outcome).toBe(RepOutcome.Accept);
  });

  it("can carry matchedRule and errorCode", () => {
    const rule: ReputationRule = { incident: "*", severity: ">=major" };
    const d: ReputationDecision = {
      outcome: RepOutcome.Ban,
      matchedRule: rule,
      errorCode: "NWP-AUTH-REPUTATION-BLOCKED",
    };
    expect(d.outcome).toBe(RepOutcome.Ban);
    expect(d.matchedRule).toBe(rule);
    expect(d.errorCode).toBe("NWP-AUTH-REPUTATION-BLOCKED");
  });

  it("outcome can be Throttle", () => {
    const d: ReputationDecision = { outcome: RepOutcome.Throttle };
    expect(d.outcome).toBe(RepOutcome.Throttle);
  });

  it("outcome can be Reject", () => {
    const d: ReputationDecision = { outcome: RepOutcome.Reject };
    expect(d.outcome).toBe(RepOutcome.Reject);
  });
});
