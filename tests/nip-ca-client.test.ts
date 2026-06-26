// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import { NipCaClient, NipCaClientError } from "../src/nip/ca-client.js";

const ident = {
  frame: "0x20",
  nid: "urn:nps:agent:example.test:a",
  pub_key: "ed25519:a",
  capabilities: ["nwp:query"],
  scope: {},
  issued_by: "urn:nps:org:example.test",
  issued_at: "2026-01-01T00:00:00Z",
  expires_at: "2026-01-02T00:00:00Z",
  serial: "0x1",
  signature: "ed25519:sig",
};

describe("NipCaClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends typed register request with bearer token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(ident), { status: 201, headers: { "content-type": "application/json" } }),
    );

    const client = new NipCaClient("https://ca.example.test", { routePrefix: "/nip" });
    const frame = await client.registerAgent(
      { identifier: "a", pub_key: "ed25519:a", capabilities: ["nwp:query"], scope_json: "{}" },
      "secret",
    );

    expect(frame.nid).toBe("urn:nps:agent:example.test:a");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ca.example.test/nip/v1/agents/register");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer secret");
    expect(JSON.parse(init.body as string).identifier).toBe("a");
  });

  it("throws typed errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error_code: "NIP-CA-UNAUTHORIZED", message: "nope" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    const client = new NipCaClient("https://ca.example.test");
    await expect(client.renewAgent("urn:nps:agent:example.test:a")).rejects.toMatchObject({
      errorCode: "NIP-CA-UNAUTHORIZED",
      statusCode: 401,
    } satisfies Partial<NipCaClientError>);
  });
});
