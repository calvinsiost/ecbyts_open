// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

// Seeded PRNG for Random Module Rebuild V2.
// WARNING: not cryptographically secure.

function stringifySeedPart(value: unknown, fallback: string): string {
    if (!value) return fallback;
    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint' ||
        typeof value === 'symbol'
    ) {
        return String(value);
    }
    return Object.prototype.toString.call(value);
}

export function hashString(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

export function createSeededRng(seed: string | number): () => number {
    let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    if (a === 0) a = 0xdeadbeef;
    return function mulberry32(): number {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function deriveSeed(label: unknown, salt: unknown = ''): string {
    return `${stringifySeedPart(label, 'default')}::${stringifySeedPart(salt, '')}`;
}

export function generateFallbackSeed(): string {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 10);
    return `${t}-${r}`;
}
