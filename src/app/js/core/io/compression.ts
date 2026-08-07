// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * COMPRESSION — Wrapper for the browser-native Compression Streams API.
 *
 * Pure helper module over the Compression Streams API (Baseline 2023).
 * Uses `deflate-raw` so the resulting payload carries no header and is
 * 18 bytes shorter than `gzip` for the use case (the model already
 * carries its own CRC-32).
 *
 * SUPPORT: Chrome 80+, Firefox 113+, Safari 16.4+, Edge 80+, Node 18+.
 *
 * ECO4 PIPELINE:
 *     JSON → TextEncoder → compress(deflate-raw) → XOR(salt) → Base64URL
 *     Base64URL → XOR(salt) → decompress(deflate-raw) → TextDecoder → JSON
 *
 * FALLBACK: when CompressionStream is missing, `compress` returns the
 * input untouched and the encoder must downgrade to ECO2. `decompress`
 * does NOT degrade silently — it throws, because reading an ECO4 key
 * without the API is impossible.
 */

declare const CompressionStream: {
    new (format: string): {
        readable: ReadableStream<Uint8Array>;
        writable: WritableStream<Uint8Array>;
    };
};

declare const DecompressionStream: {
    new (format: string): {
        readable: ReadableStream<Uint8Array>;
        writable: WritableStream<Uint8Array>;
    };
};

/**
 * Detect whether the Compression Streams API is available in this runtime.
 */
export function isCompressionSupported(): boolean {
    return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

/**
 * Compress bytes using `deflate-raw`.
 *
 * If the API is unavailable, returns the input bytes unchanged so callers
 * can downgrade to a non-compressed format.
 */
export async function compress(data: Uint8Array): Promise<Uint8Array> {
    if (!isCompressionSupported()) {
        return data;
    }

    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();

    // Write input and close the stream
    writer.write(data);
    writer.close();

    // Drain compressed chunks
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
    }

    // Concatenate chunks into one Uint8Array
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return result;
}

/**
 * Decompress bytes that were produced with `deflate-raw`.
 *
 * Unlike `compress`, this function does NOT silently fall back: it
 * throws when the API is unavailable, because there is no way to read
 * a compressed ECO4 payload without it.
 *
 * @throws {Error} when DecompressionStream is unavailable or the payload
 * is corrupted.
 */
export async function decompress(data: Uint8Array): Promise<Uint8Array> {
    if (!isCompressionSupported()) {
        throw new Error(
            'Chave ECO4 requer browser moderno com Compression Streams API. ' +
                'Atualize para Chrome 80+, Firefox 113+, Safari 16.4+ ou Edge 80+.',
        );
    }

    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    writer.write(data);
    writer.close();

    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return result;
}
