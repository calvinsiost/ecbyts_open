// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB-001 F2 — Content-defined chunking / CDC (item 46). Pure-logic.

   Divide um fluxo de bytes em pedaços cujos LIMITES dependem do CONTEÚDO (não
   de offsets fixos). Vantagem: ao inserir/remover bytes no meio, só o pedaço
   afetado muda — os demais mantêm o mesmo limite e o mesmo hash → ótimo para
   deduplicação e sincronização incremental. Usa um rolling hash "Gear"
   (FastCDC, patent-free). Determinístico.

   Uso no ecbyts: deduplicar uploads de documentos/modelos na ingestão e fazer
   sync incremental (só os pedaços mudados sobem) — economiza armazenamento e
   banda no Supabase Storage.

   Ref: Xia et al. 2016, "FastCDC: a Fast and Efficient Content-Defined
   Chunking Approach for Data Deduplication" (USENIX ATC 2016). Gear hash.
   ================================================================ */

// Tabela Gear: 256 valores de 32 bits gerados deterministicamente (SplitMix32).
const GEAR: Uint32Array = (() => {
    const t = new Uint32Array(256);
    let s = 0x9e3779b9 >>> 0;
    for (let i = 0; i < 256; i++) {
        s = (s + 0x9e3779b9) >>> 0;
        let z = s;
        z = (Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0) >>> 0;
        z = (Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0) >>> 0;
        t[i] = (z ^ (z >>> 15)) >>> 0;
    }
    return t;
})();

export interface Chunk {
    readonly offset: number;
    readonly length: number;
}

export interface ChunkOptions {
    readonly minSize?: number; // não corta antes disso
    readonly avgSize?: number; // alvo médio (define a máscara de bits)
    readonly maxSize?: number; // corta à força aqui
}

function toBytes(data: Uint8Array | number[] | string): Uint8Array {
    if (data instanceof Uint8Array) return data;
    if (typeof data === 'string') {
        const out = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) out[i] = data.charCodeAt(i) & 0xff;
        return out;
    }
    return Uint8Array.from(data);
}

function maskForAvg(avgSize: number): number {
    // bits ≈ log2(avgSize); máscara com esse nº de bits baixos.
    const bits = Math.max(1, Math.round(Math.log2(avgSize)));
    return (1 << bits) - 1;
}

/**
 * Quebra `data` em pedaços content-defined. Limites estáveis a inserções
 * locais. Retorna offsets/comprimentos (não copia os bytes).
 */
export function chunk(data: Uint8Array | number[] | string, opts: ChunkOptions = {}): Chunk[] {
    const bytes = toBytes(data);
    const n = bytes.length;
    const minSize = Math.max(1, opts.minSize ?? 2048);
    const avgSize = Math.max(minSize, opts.avgSize ?? 8192);
    const maxSize = Math.max(avgSize, opts.maxSize ?? 65536);
    const mask = maskForAvg(avgSize);
    const chunks: Chunk[] = [];
    if (n === 0) return chunks;

    let start = 0;
    while (start < n) {
        let hash = 0;
        let i = start;
        const hardEnd = Math.min(start + maxSize, n);
        // pula o mínimo: nenhum corte antes de minSize
        const skipTo = Math.min(start + minSize, n);
        for (; i < hardEnd; i++) {
            hash = ((hash << 1) + GEAR[bytes[i]!]!) >>> 0;
            if (i + 1 >= skipTo && (hash & mask) === 0) {
                i++; // inclui o byte do ponto de corte
                break;
            }
        }
        const end = Math.min(i, n) === start ? Math.min(start + minSize, n) : Math.min(i, hardEnd);
        const length = Math.max(1, end - start);
        chunks.push(Object.freeze({ offset: start, length }));
        start += length;
    }
    return chunks;
}

/** FNV-1a 32-bit de um pedaço — id estável para deduplicação. */
export function chunkHash(bytes: Uint8Array, offset: number, length: number): number {
    let h = 0x811c9dc5 >>> 0;
    const end = offset + length;
    for (let i = offset; i < end; i++) {
        h ^= bytes[i]!;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}
