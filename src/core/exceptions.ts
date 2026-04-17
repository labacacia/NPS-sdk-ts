// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NPS exception hierarchy — ported from nps_sdk/core/exceptions.py
// NPS-1 §6

/** Base class for all NPS SDK errors. */
export class NpsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NpsError";
  }
}

/** Frame parse or structural error. */
export class NpsFrameError extends NpsError {
  constructor(message: string) {
    super(message);
    this.name = "NpsFrameError";
  }
}

/** Encode or decode error. */
export class NpsCodecError extends NpsError {
  constructor(message: string) {
    super(message);
    this.name = "NpsCodecError";
  }
}

/** Anchor cache miss — requested anchor ID not found. */
export class NpsAnchorNotFoundError extends NpsError {
  readonly anchorId: string;
  constructor(anchorId: string, message?: string) {
    super(message ?? `Anchor not found: ${anchorId}`);
    this.name = "NpsAnchorNotFoundError";
    this.anchorId = anchorId;
  }
}

/** Anchor ID collision — same ID but different schema content. */
export class NpsAnchorPoisonError extends NpsError {
  readonly anchorId: string;
  constructor(anchorId: string, message?: string) {
    super(message ?? `Anchor poison detected: ${anchorId}`);
    this.name = "NpsAnchorPoisonError";
    this.anchorId = anchorId;
  }
}

/** Stream-level error (sequence gap, unknown stream ID, etc.). */
export class NpsStreamError extends NpsError {
  constructor(message: string) {
    super(message);
    this.name = "NpsStreamError";
  }
}
