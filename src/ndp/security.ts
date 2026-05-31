// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/** NDP security profile constants (NPS-4 §7.2) */
export const SecurityProfile = {
  LOCAL_DEV:        'local-dev',
  ORG_PRIVATE:      'org-private',
  PUBLIC_FEDERATED: 'public-federated',
} as const;
export type SecurityProfileValue = typeof SecurityProfile[keyof typeof SecurityProfile];
