// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0
//
// RFC-0005 reputation policy types and default in-process evaluator.

// ── Policy types ─────────────────────────────────────────────────────────────

/** Node-side reputation enforcement policy (NPS-RFC-0005 §4.1). */
export interface ReputationPolicy {
  enabled?:           boolean;
  logSources?:        string[];
  minAssuranceLevel?: string; // "anonymous" | "attested" | "verified"
  cacheTtlSeconds?:   number;
  banTtlSeconds?:     number;
  onLogUnavailable?:  string; // "allow" | "deny"
  throttleOn?:        ReputationRule[];
  rejectOn?:          ReputationRule[];
  banOn?:             ReputationRule[];
}

/** A single ban_on / reject_on / throttle_on rule. */
export interface ReputationRule {
  incident?:   string; // RFC-0004 incident type or "*"; default "*"
  severity?:   string; // e.g. ">=minor" or "critical"; default ">=minor"
  withinDays?: number;
  count?:      number; // default 1
}

export enum RepOutcome { Accept, Throttle, Reject, Ban }

export interface ReputationDecision {
  outcome:     RepOutcome;
  matchedRule?: ReputationRule;
  errorCode?:  string;
}

export interface IReputationEvaluator {
  evaluate(nid: string, assuranceLevel: string, policy: ReputationPolicy): Promise<ReputationDecision>;
  clearBan(nid: string): void;
}

// ── Severity / assurance ordering ────────────────────────────────────────────

const SEV_ORDER = ["info", "minor", "moderate", "major", "critical"];
const ASS_ORDER = ["anonymous", "attested", "verified"];

const sevIdx = (s: string) => SEV_ORDER.indexOf(s.toLowerCase());
const assIdx = (s: string) => ASS_ORDER.indexOf(s.toLowerCase());

// ── Default evaluator ─────────────────────────────────────────────────────────

interface BanEntry   { expiresAt: number }
interface CacheEntry { expiresAt: number; entries: LogEntry[] }
interface LogEntry   { incident: string; severity: string; timestamp: string }
interface LogResp    { entries: LogEntry[] }

class DefaultReputationEvaluator implements IReputationEvaluator {
  private readonly _bans  = new Map<string, BanEntry>();
  private readonly _cache = new Map<string, CacheEntry>();

  async evaluate(nid: string, assurance: string, p: ReputationPolicy): Promise<ReputationDecision> {
    if (p.enabled === false) return { outcome: RepOutcome.Accept };

    // Assurance floor
    if (assIdx(p.minAssuranceLevel ?? "anonymous") > assIdx(assurance))
      return { outcome: RepOutcome.Reject, errorCode: "NWP-AUTH-ASSURANCE-TOO-LOW" };

    // Ban cache
    const ban = this._bans.get(nid);
    if (ban && ban.expiresAt > Date.now())
      return { outcome: RepOutcome.Ban, errorCode: "NWP-AUTH-REPUTATION-BLOCKED" };

    const entries = await this._fetchEntries(nid, p);

    for (const rule of p.banOn ?? []) {
      if (ruleMatches(rule, entries)) {
        const exp = Date.now() + (p.banTtlSeconds ?? 3600) * 1000;
        this._bans.set(nid, { expiresAt: exp });
        return { outcome: RepOutcome.Ban, matchedRule: rule, errorCode: "NWP-AUTH-REPUTATION-BLOCKED" };
      }
    }
    for (const rule of p.rejectOn ?? []) {
      if (ruleMatches(rule, entries))
        return { outcome: RepOutcome.Reject, matchedRule: rule, errorCode: "NWP-AUTH-REPUTATION-BLOCKED" };
    }
    for (const rule of p.throttleOn ?? []) {
      if (ruleMatches(rule, entries))
        return { outcome: RepOutcome.Throttle, matchedRule: rule };
    }
    return { outcome: RepOutcome.Accept };
  }

  clearBan(nid: string): void { this._bans.delete(nid); }

  private async _fetchEntries(nid: string, p: ReputationPolicy): Promise<LogEntry[]> {
    const ttl = p.cacheTtlSeconds ?? 300;
    if (ttl > 0) {
      const c = this._cache.get(nid);
      if (c && c.expiresAt > Date.now()) return c.entries;
    }

    let entries: LogEntry[] | null = null;
    for (const source of p.logSources ?? []) {
      try {
        const url = source.replace(/\/$/, "") + "/entries?subject_nid=" + encodeURIComponent(nid);
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) continue;
        const data = await resp.json() as LogResp;
        entries = data.entries ?? [];
        break;
      } catch { /* try next source */ }
    }

    if (entries === null) {
      entries = (p.onLogUnavailable ?? "allow").toLowerCase() === "deny"
        ? [{ incident: "*", severity: "critical", timestamp: new Date().toISOString() }]
        : [];
    }

    if (ttl > 0)
      this._cache.set(nid, { expiresAt: Date.now() + ttl * 1000, entries });

    return entries;
  }
}

// ── Package-level singleton ───────────────────────────────────────────────────

let _singleton: DefaultReputationEvaluator | null = null;

/** Returns the package-level default evaluator (in-memory ban cache). */
export function defaultReputationEvaluator(): IReputationEvaluator {
  return (_singleton ??= new DefaultReputationEvaluator());
}

// ── Rule matching ─────────────────────────────────────────────────────────────

function ruleMatches(rule: ReputationRule, entries: LogEntry[]): boolean {
  const cutoff = rule.withinDays != null
    ? Date.now() - rule.withinDays * 86_400_000 : null;
  const [op, threshold] = parseSev(rule.severity ?? ">=minor");
  const needed = rule.count ?? 1;
  let matched = 0;
  for (const e of entries) {
    if (cutoff != null && new Date(e.timestamp).getTime() < cutoff) continue;
    if (!incidentMatch(rule.incident ?? "*", e.incident)) continue;
    if (!sevMatch(op, threshold, e.severity)) continue;
    if (++matched >= needed) return true;
  }
  return false;
}

function incidentMatch(pattern: string, incident: string): boolean {
  return pattern === "*" || pattern.toLowerCase() === incident.toLowerCase();
}

function sevMatch(op: string, threshold: number, actual: string): boolean {
  const idx = sevIdx(actual);
  if (idx < 0) return false;
  return op === ">=" ? idx >= threshold : idx === threshold;
}

function parseSev(s: string): [string, number] {
  if (s.startsWith(">=")) return [">=", sevIdx(s.slice(2))];
  return ["=", sevIdx(s)];
}
