// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0
//
// DAG validation for NPS-5 §3.1.1.
// Checks: node count ≤ 32, no duplicate IDs, edges reference existing nodes,
// input_from references valid nodes, at least one root + one terminal,
// no cycles (Kahn topological sort), condition length ≤ 512.

import type { TaskDag } from "./models.js";

export const MAX_DAG_NODES       = 32;
export const MAX_CONDITION_LEN   = 512;
export const MAX_DELEGATE_DEPTH  = 3;

export interface DagValidationResult {
  valid:              boolean;
  errorCode?:         string;
  errorMessage?:      string;
  /** Topological order (node IDs, roots first) — only present when valid=true. */
  topologicalOrder?:  readonly string[];
  roots?:             readonly string[];
  terminals?:         readonly string[];
}

export function validateDag(dag: TaskDag): DagValidationResult {
  if (!dag.nodes || dag.nodes.length === 0)
    return fail("NOP-TASK-DAG-INVALID", "DAG must contain at least one node.");

  if (dag.nodes.length > MAX_DAG_NODES)
    return fail("NOP-TASK-DAG-TOO-LARGE",
      `DAG contains ${dag.nodes.length} nodes, exceeding the maximum of ${MAX_DAG_NODES}.`);

  // Duplicate node IDs
  const nodeIds = new Set<string>();
  for (const node of dag.nodes) {
    if (nodeIds.has(node.id))
      return fail("NOP-TASK-DAG-INVALID", `Duplicate node ID: '${node.id}'.`);
    nodeIds.add(node.id);
  }

  // Condition length
  for (const node of dag.nodes) {
    if (node.condition && node.condition.length > MAX_CONDITION_LEN)
      return fail("NOP-TASK-DAG-INVALID",
        `Node '${node.id}' condition expression exceeds ${MAX_CONDITION_LEN} characters.`);
  }

  // Build adjacency + in-degree for Kahn
  const adj:      Map<string, string[]> = new Map();
  const inDegree: Map<string, number>   = new Map();
  for (const id of nodeIds) { adj.set(id, []); inDegree.set(id, 0); }

  for (const edge of dag.edges ?? []) {
    if (!nodeIds.has(edge.from))
      return fail("NOP-TASK-DAG-INVALID", `Edge references unknown source node: '${edge.from}'.`);
    if (!nodeIds.has(edge.to))
      return fail("NOP-TASK-DAG-INVALID", `Edge references unknown target node: '${edge.to}'.`);
    adj.get(edge.from)!.push(edge.to);
    inDegree.set(edge.to, inDegree.get(edge.to)! + 1);
  }

  // Validate input_from references
  for (const node of dag.nodes) {
    for (const upstream of node.inputFrom ?? []) {
      if (!nodeIds.has(upstream))
        return fail("NOP-TASK-DAG-INVALID",
          `Node '${node.id}' references unknown upstream node '${upstream}' in input_from.`);
    }
  }

  // Kahn topological sort — detects cycles
  const queue: string[]  = [];
  const order: string[]  = [];
  for (const [id, deg] of inDegree) { if (deg === 0) queue.push(id); }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    order.push(cur);
    for (const next of adj.get(cur)!) {
      const deg = inDegree.get(next)! - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  if (order.length !== dag.nodes.length)
    return fail("NOP-TASK-DAG-CYCLE", "DAG contains a cycle.");

  // Identify roots and terminals
  const origInDegree = new Map<string, number>();
  for (const id of nodeIds) origInDegree.set(id, 0);
  for (const edge of dag.edges ?? [])
    origInDegree.set(edge.to, origInDegree.get(edge.to)! + 1);

  const origOutDegree = new Map<string, number>();
  for (const id of nodeIds) origOutDegree.set(id, 0);
  for (const edge of dag.edges ?? [])
    origOutDegree.set(edge.from, origOutDegree.get(edge.from)! + 1);

  const roots     = order.filter(id => origInDegree.get(id)  === 0);
  const terminals = order.filter(id => origOutDegree.get(id) === 0);

  if (roots.length === 0)
    return fail("NOP-TASK-DAG-INVALID", "DAG must have at least one root node (no incoming edges).");
  if (terminals.length === 0)
    return fail("NOP-TASK-DAG-INVALID", "DAG must have at least one terminal node (no outgoing edges).");

  return { valid: true, topologicalOrder: order, roots, terminals };
}

function fail(errorCode: string, errorMessage: string): DagValidationResult {
  return { valid: false, errorCode, errorMessage };
}
