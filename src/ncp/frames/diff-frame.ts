// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// DiffFrame (0x02) — Incremental data patch
// NPS-1 §4.2

import { NcpError, EncodingTier } from "../../core/frame-header.js";
import { isValidPatchFormat, type PatchFormat } from "../ncp-patch-format.js";

export interface JsonPatchOperation {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

export interface DiffFrame {
  frame: string;
  anchor_ref: string;
  base_seq: number;
  patch_format?: PatchFormat;
  patch: JsonPatchOperation[] | Uint8Array;
  entity_id?: string;
}

/**
 * Validate DiffFrame base_seq against current sequence.
 * @throws {NcpError} NCP-STREAM-SEQ-GAP if sequences don't match.
 */
export function validateDiffSeq(frame: DiffFrame, currentSeq: number): void {
  if (frame.base_seq !== currentSeq) {
    throw new NcpError(
      "NCP-STREAM-SEQ-GAP",
      `DiffFrame base_seq=${frame.base_seq} does not match current seq=${currentSeq}`,
    );
  }
}

/**
 * Validate DiffFrame patch_format against the encoding tier.
 *
 * binary_bitset is only supported on Tier-2 (MsgPack) frames.
 * Unknown patch_format values are also rejected.
 *
 * @throws {NcpError} NCP-DIFF-FORMAT-UNSUPPORTED if binary_bitset on non-Tier-2,
 *   or if patch_format is an unknown value.
 */
export function validateDiffFrame(
  frame: DiffFrame,
  encodingTier: EncodingTier | number,
): void {
  const fmt = frame.patch_format;

  // Unknown patch_format
  if (fmt !== undefined && !isValidPatchFormat(fmt)) {
    throw new NcpError(
      "NCP-DIFF-FORMAT-UNSUPPORTED",
      `Unknown patch_format "${String(fmt)}"`,
    );
  }

  // binary_bitset requires Tier-2 MsgPack
  if (fmt === "binary_bitset" && encodingTier !== EncodingTier.MsgPack) {
    throw new NcpError(
      "NCP-DIFF-FORMAT-UNSUPPORTED",
      "patch_format=binary_bitset requires Tier-2 MsgPack encoding",
    );
  }
}
