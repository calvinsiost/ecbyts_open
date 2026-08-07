// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

export type UType = 'absolute' | 'relative';

export interface UValue {
    value: number;
    u: number | null;
    k: number;
    type: UType;
}

export interface CreateUValueOptions {
    k?: unknown;
    type?: unknown;
}

function isRecord(input: unknown): input is Record<string, unknown> {
    return input != null && typeof input === 'object';
}

export function createUValue(value: unknown, u: unknown, opts: CreateUValueOptions = {}): UValue {
    const v = Number(value);
    const parsedU = u == null ? null : Number(u);
    const parsedK = Number(opts.k);
    const k = Number.isFinite(parsedK) && parsedK > 0 ? parsedK : 2;
    const type = opts.type === 'relative' ? 'relative' : 'absolute';

    return {
        value: Number.isFinite(v) ? v : 0,
        u: parsedU != null && Number.isFinite(parsedU) && parsedU >= 0 ? parsedU : null,
        k,
        type,
    };
}

export function isUValue(input: unknown): input is UValue {
    if (!isRecord(input)) return false;
    return Number.isFinite(Number(input.value)) && (input.u == null || Number.isFinite(Number(input.u)));
}

export function toAbsolute(uv: unknown): number | null {
    if (!isUValue(uv) || uv.u == null) return null;
    if (uv.type === 'relative') {
        return (Math.abs(uv.value) * uv.u) / 100;
    }
    return uv.u;
}

export function toRelative(uv: unknown): number | null {
    if (!isUValue(uv) || uv.u == null) return null;
    if (uv.type === 'relative') return uv.u;
    if (!Number.isFinite(uv.value) || uv.value === 0) return null;
    return Math.abs(uv.u / uv.value) * 100;
}

export function unwrap(input: unknown): number {
    if (typeof input === 'number') return input;
    if (isUValue(input)) return input.value;
    return 0;
}
