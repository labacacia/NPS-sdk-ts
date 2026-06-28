// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// Tier-3 BinaryVector Codec — MessagePack metadata + float32 vector segments
// NPS-1 §8.1

import { encode, decode } from "@msgpack/msgpack";

const MAGIC = new Uint8Array([0x4e, 0x50, 0x42, 0x56]); // NPBV
const VERSION = 1;
const PREFIX_SIZE = 16;
const MARKER_KEY = "$nps_binary_vector";

type MetadataRecord = Record<string, unknown>;

/**
 * Encode a frame payload to Tier-3 BinaryVector v1 bytes.
 */
export function encodeBinaryVectorPayload(payload: unknown): Uint8Array {
  const metadata = cloneMetadata(payload);
  if (!isRecord(metadata)) {
    throw new Error("Tier-3 BinaryVector metadata root must be an object.");
  }

  const vectors: number[][] = [];
  extractVectorSearchVector(metadata, vectors);

  if (vectors.length > 0xffff) {
    throw new Error("Tier-3 BinaryVector supports at most 65535 vectors per frame.");
  }

  const metadataBytes = encode(metadata);
  const segmentBytes = vectors.reduce((sum, vector) => sum + 4 + vector.length * 4, 0);
  const out = new Uint8Array(PREFIX_SIZE + metadataBytes.length + segmentBytes);
  const view = new DataView(out.buffer);

  out.set(MAGIC, 0);
  out[4] = VERSION;
  out[5] = 0;
  view.setUint16(6, vectors.length, false);
  view.setUint32(8, metadataBytes.length, false);
  view.setUint32(12, 0, false);
  out.set(metadataBytes, PREFIX_SIZE);

  let offset = PREFIX_SIZE + metadataBytes.length;
  for (const vector of vectors) {
    view.setUint32(offset, vector.length, false);
    offset += 4;
    for (const value of vector) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
  }

  return out;
}

/**
 * Decode Tier-3 BinaryVector v1 bytes to a payload object.
 */
export function decodeBinaryVectorPayload(bytes: Uint8Array): unknown {
  if (bytes.length < PREFIX_SIZE) {
    throw new Error(`Tier-3 BinaryVector payload too short: ${bytes.length} bytes.`);
  }

  if (!MAGIC.every((value, index) => bytes[index] === value)) {
    throw new Error("Tier-3 BinaryVector payload magic mismatch.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[4] !== VERSION) {
    throw new Error(`Unsupported Tier-3 BinaryVector version: ${bytes[4]}.`);
  }

  if (bytes[5] !== 0 || view.getUint32(12, false) !== 0) {
    throw new Error("Tier-3 BinaryVector reserved fields must be zero.");
  }

  const vectorCount = view.getUint16(6, false);
  const metadataLength = view.getUint32(8, false);
  if (metadataLength > bytes.length - PREFIX_SIZE) {
    throw new Error("Tier-3 BinaryVector metadata length exceeds payload length.");
  }

  let offset = PREFIX_SIZE;
  const metadataBytes = bytes.subarray(offset, offset + metadataLength);
  offset += metadataLength;

  const metadata = decode(metadataBytes);
  if (!isRecord(metadata)) {
    throw new Error("Tier-3 BinaryVector metadata root must be a map.");
  }

  const vectors: number[][] = [];
  for (let i = 0; i < vectorCount; i += 1) {
    if (bytes.length - offset < 4) {
      throw new Error("Tier-3 BinaryVector vector segment missing dimension.");
    }

    const dim = view.getUint32(offset, false);
    offset += 4;
    const byteLength = dim * 4;
    if (bytes.length - offset < byteLength) {
      throw new Error("Tier-3 BinaryVector vector segment is truncated.");
    }

    const vector: number[] = [];
    for (let j = 0; j < dim; j += 1) {
      vector.push(view.getFloat32(offset, true));
      offset += 4;
    }
    vectors.push(vector);
  }

  if (offset !== bytes.length) {
    throw new Error("Tier-3 BinaryVector payload has trailing bytes.");
  }

  restoreVectorSearchVector(metadata, vectors);
  return metadata;
}

function extractVectorSearchVector(metadata: MetadataRecord, vectors: number[][]): void {
  const vectorSearch = metadata["vector_search"];
  if (!isRecord(vectorSearch)) return;

  const vector = vectorSearch["vector"];
  if (!Array.isArray(vector) || !vector.every((value) => typeof value === "number" && Number.isFinite(value))) {
    return;
  }

  const index = vectors.length;
  vectors.push([...vector]);
  vectorSearch["vector"] = {
    [MARKER_KEY]: index,
    dtype: "float32",
    dim: vector.length,
  };
}

function restoreVectorSearchVector(metadata: MetadataRecord, vectors: readonly number[][]): void {
  const vectorSearch = metadata["vector_search"];
  if (!isRecord(vectorSearch) || !Object.hasOwn(vectorSearch, "vector")) return;

  const marker = vectorSearch["vector"];
  if (!isRecord(marker)) {
    throw new Error("Tier-3 BinaryVector marker must be an object.");
  }

  const index = marker[MARKER_KEY];
  if (typeof index !== "number" || !Number.isInteger(index)) {
    throw new Error("Tier-3 BinaryVector marker missing vector index.");
  }

  if (index < 0 || index >= vectors.length) {
    throw new Error(`Tier-3 BinaryVector marker references vector ${index}, but only ${vectors.length} vectors are present.`);
  }

  if (marker["dtype"] !== "float32") {
    throw new Error("Tier-3 BinaryVector v1 only supports dtype=float32.");
  }

  const dim = marker["dim"];
  if (typeof dim !== "number" || !Number.isInteger(dim) || dim !== vectors[index]!.length) {
    throw new Error("Tier-3 BinaryVector marker dimension does not match vector segment.");
  }

  vectorSearch["vector"] = vectors[index]!;
}

function cloneMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneMetadata);
  }

  if (isRecord(value)) {
    const out: MetadataRecord = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = cloneMetadata(item);
    }
    return out;
  }

  return value;
}

function isRecord(value: unknown): value is MetadataRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
