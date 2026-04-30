// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * NCP native-mode connection preamble — the 8-byte ASCII constant
 * `"NPS/1.0\n"` that every native-mode client MUST emit immediately
 * after the transport handshake and before its first HelloFrame.
 * Defined by NPS-RFC-0001 and NPS-1 NCP §2.6.1.
 *
 * HTTP-mode connections do not use the preamble.
 */

export const PREAMBLE_LITERAL = "NPS/1.0\n";
export const PREAMBLE_LENGTH = 8;
export const PREAMBLE_BYTES: Uint8Array = new TextEncoder().encode(PREAMBLE_LITERAL);
/** Validation timeout in milliseconds (NPS-RFC-0001 §4.1). */
export const PREAMBLE_READ_TIMEOUT_MS = 10_000;
/** Maximum delay before closing after a mismatch, in milliseconds. */
export const PREAMBLE_CLOSE_DEADLINE_MS = 500;

export const PREAMBLE_ERROR_CODE  = "NCP-PREAMBLE-INVALID";
export const PREAMBLE_STATUS_CODE = "NPS-PROTO-PREAMBLE-INVALID";

export class NcpPreambleInvalidError extends Error {
  readonly errorCode  = PREAMBLE_ERROR_CODE;
  readonly statusCode = PREAMBLE_STATUS_CODE;

  constructor(reason: string) {
    super(reason);
    this.name = "NcpPreambleInvalidError";
  }
}

/**
 * Returns `true` iff `buf` starts with the 8-byte NPS/1.0 preamble.
 * Safe to call with shorter buffers.
 */
export function preambleMatches(buf: Uint8Array): boolean {
  if (buf.length < PREAMBLE_LENGTH) return false;
  for (let i = 0; i < PREAMBLE_LENGTH; i++) {
    if (buf[i] !== PREAMBLE_BYTES[i]) return false;
  }
  return true;
}

/**
 * Validates a presumed-preamble buffer.
 * Returns `{ valid: true, reason: "" }` on success or `{ valid: false, reason }` on failure.
 */
export function tryValidatePreamble(buf: Uint8Array): { valid: boolean; reason: string } {
  if (buf.length < PREAMBLE_LENGTH) {
    return { valid: false, reason: `short read (${buf.length}/${PREAMBLE_LENGTH} bytes); peer is not speaking NCP` };
  }
  if (!preambleMatches(buf)) {
    // "NPS/" = 0x4E 0x50 0x53 0x2F
    const isNps = buf[0] === 0x4e && buf[1] === 0x50 && buf[2] === 0x53 && buf[3] === 0x2f;
    if (isNps) {
      return { valid: false, reason: "future-major-version NPS preamble; close with NPS-PREAMBLE-UNSUPPORTED-VERSION diagnostic" };
    }
    return { valid: false, reason: "preamble mismatch; peer is not speaking NPS/1.x" };
  }
  return { valid: true, reason: "" };
}

/**
 * Validates a presumed-preamble buffer, throwing {@link NcpPreambleInvalidError} on mismatch.
 */
export function validatePreamble(buf: Uint8Array): void {
  const { valid, reason } = tryValidatePreamble(buf);
  if (!valid) throw new NcpPreambleInvalidError(reason);
}

/**
 * Writes the preamble bytes to `writer`.
 * `writer` must expose a `write(buf: Uint8Array): void` method (e.g. Node.js `net.Socket`).
 */
export function writePreamble(writer: { write(buf: Uint8Array): void }): void {
  writer.write(PREAMBLE_BYTES);
}
