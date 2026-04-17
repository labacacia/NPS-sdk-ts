// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// HelloFrame (0x06) — Native-mode client handshake
// NPS-1 §4.6

import { NcpError } from "../../core/frame-header.js";

export interface HelloFrame {
  frame: string;
  nps_version: string;
  min_version?: string;
  supported_encodings: string[];
  supported_protocols: string[];
  agent_id?: string;
  max_frame_payload?: number;
  ext_support?: boolean;
  max_concurrent_streams?: number;
  e2e_enc_algorithms?: string[];
}

/**
 * Validate a HelloFrame.
 *
 * Required fields: nps_version, supported_encodings (non-empty), supported_protocols (non-empty).
 *
 * @throws {NcpError} NPS-CLIENT-BAD-FRAME if any required field is missing or empty.
 */
export function validateHelloFrame(frame: HelloFrame): void {
  if (!frame.nps_version) {
    throw new NcpError(
      "NPS-CLIENT-BAD-FRAME",
      "HelloFrame missing required field: nps_version",
    );
  }

  if (!frame.supported_encodings || frame.supported_encodings.length === 0) {
    throw new NcpError(
      "NPS-CLIENT-BAD-FRAME",
      "HelloFrame missing required field: supported_encodings (must be non-empty)",
    );
  }

  if (!frame.supported_protocols || frame.supported_protocols.length === 0) {
    throw new NcpError(
      "NPS-CLIENT-BAD-FRAME",
      "HelloFrame missing required field: supported_protocols (must be non-empty)",
    );
  }
}
