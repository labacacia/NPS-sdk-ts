// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NCP Patch Format — DiffFrame patch encoding types
// NPS-1 §4.2

export const PATCH_FORMAT = {
  JSON_PATCH: "json_patch",
  BINARY_BITSET: "binary_bitset",
} as const;

export type PatchFormat = typeof PATCH_FORMAT[keyof typeof PATCH_FORMAT];

export function isValidPatchFormat(v: unknown): v is PatchFormat {
  return v === PATCH_FORMAT.JSON_PATCH || v === PATCH_FORMAT.BINARY_BITSET;
}
