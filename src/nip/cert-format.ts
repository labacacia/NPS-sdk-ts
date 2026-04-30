// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/** Wire-form constants for `IdentFrame.cert_format` (NPS-RFC-0002 §4.5). */

export const V1_PROPRIETARY = "v1-proprietary" as const;
export const V2_X509        = "v2-x509"        as const;

export type CertFormat = typeof V1_PROPRIETARY | typeof V2_X509;
