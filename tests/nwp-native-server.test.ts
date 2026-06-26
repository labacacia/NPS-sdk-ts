// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { NpsFrameCodec } from "../src/core/codec.js";
import { EncodingTier } from "../src/core/frames.js";
import { CapsFrame, ErrorFrame } from "../src/ncp/frames.js";
import { createFullRegistry } from "../src/setup.js";
import { ActionFrame, QueryFrame } from "../src/nwp/frames.js";
import { NwpNativeNodeServer } from "../src/nwp/native-server.js";

describe("NwpNativeNodeServer", () => {
  it("dispatchWire returns a CapsFrame for QueryFrame", async () => {
    const codec = new NpsFrameCodec(createFullRegistry());
    const server = new NwpNativeNodeServer({
      codec,
      queryHandler: () => [{ id: 42 }],
    });

    const out = await server.dispatchWire(
      codec.encode(new QueryFrame("sha256:a"), { overrideTier: EncodingTier.MSGPACK }),
    );
    const frame = codec.decode(out);

    expect(frame).toBeInstanceOf(CapsFrame);
    expect((frame as CapsFrame).count).toBe(1);
    expect((frame as CapsFrame).data[0]?.id).toBe(42);
  });

  it("serves frames from an async chunk source", async () => {
    const codec = new NpsFrameCodec(createFullRegistry());
    const server = new NwpNativeNodeServer({
      codec,
      actionHandler: (frame) => ({ action: frame.actionId }),
    });
    const request = codec.encode(new ActionFrame("ping"), { overrideTier: EncodingTier.MSGPACK });
    const writes: Uint8Array[] = [];

    await server.serve([request.slice(0, 2), request.slice(2)], {
      write(chunk) { writes.push(chunk); },
    });

    const frame = codec.decode(writes[0]!);
    expect(frame).toBeInstanceOf(CapsFrame);
    expect((frame as CapsFrame).data[0]?.action).toBe("ping");
  });

  it("accepts the legacy action key", () => {
    const frame = ActionFrame.fromDict({ action: "ping" });

    expect(frame.actionId).toBe("ping");
  });

  it("returns ErrorFrame for unsupported frames", async () => {
    const server = new NwpNativeNodeServer();
    const frame = await server.dispatch(new ErrorFrame("NPS-TEST", "TEST"));

    expect(frame).toBeInstanceOf(ErrorFrame);
    expect((frame as ErrorFrame).error).toBe("NWP-NATIVE-FRAME-UNSUPPORTED");
  });
});
