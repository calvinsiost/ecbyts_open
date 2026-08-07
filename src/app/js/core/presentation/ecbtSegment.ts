// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Presentation ECBT Segment - pure encoder/decoder for the `presentation` field
// carried inside the ECBT key payload. The ECBT key itself is handled by
// core/io/encoder.js; this module exposes a self-contained, round-trippable
// pair so the pure-logic slice can be tested in isolation.
//
// Output format:
//   ecbt-pres/v1:<base64url(JSON)>
// - `ecbt-pres` disambiguates from other ECBT segments (io, telemetry, etc.)
// - `v1` is the segment schema version - downstream must treat unknown v as skip
// - Base64url (RFC 4648 §5, no padding) keeps the segment URL-safe for URLs
//   and ECBT key segments that forbid '+/='
// - JSON is the payload; deterministic key order preserved for hash stability
//
// Spec: docs/specs/features/SPEC_PRESENTATION_MODE.md §3.4 / Q4

export interface PresentationStep {
    id?: string;
    title?: string;
    duration?: number;
    transitionDuration?: number;
    transitionEase?: string;
    audioType?: string;
    notes?: string;
    narration?: string;
    cameraRef?: unknown;
    sceneRef?: unknown;
}

export interface Presentation {
    id: string;
    title?: string;
    description?: string;
    createdAt?: string | number;
    schemaVersion?: string | number;
    steps: PresentationStep[];
}

export const ECBT_SEGMENT_PREFIX = 'ecbt-pres/';
export const ECBT_SEGMENT_VERSION = 'v1';

const CANONICAL_STEP_KEYS = ['id', 'title', 'duration', 'transitionDuration', 'transitionEase', 'audioType', 'notes', 'narration', 'cameraRef', 'sceneRef'] as const;

const CANONICAL_PRESENTATION_KEYS = ['id', 'title', 'description', 'createdAt', 'schemaVersion', 'steps'] as const;

function canonicalizeStep(step: PresentationStep): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of CANONICAL_STEP_KEYS) {
        const v = step[k as keyof PresentationStep];
        if (v !== undefined) out[k] = v;
    }
    return out;
}

function canonicalizePresentation(p: Presentation): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of CANONICAL_PRESENTATION_KEYS) {
        if (k === 'steps') {
            out.steps = (p.steps || []).map(canonicalizeStep);
        } else {
            const v = p[k as keyof Presentation];
            if (v !== undefined) out[k] = v;
        }
    }
    return out;
}

function base64urlEncode(str: string): string {
    let b64: string;
    const _Buffer = (globalThis as any).Buffer;
    if (typeof _Buffer !== 'undefined') {
        b64 = _Buffer.from(str, 'utf-8').toString('base64');
    } else if (typeof btoa !== 'undefined') {
        // Encode UTF-8 → binary string → btoa.
        b64 = btoa(unescape(encodeURIComponent(str)));
    } else {
        throw new Error('base64urlEncode: no Buffer or btoa available');
    }
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(segment: string): string {
    const pad = segment.length % 4 === 0 ? '' : '='.repeat(4 - (segment.length % 4));
    const b64 = segment.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const _Buffer = (globalThis as any).Buffer;
    if (typeof _Buffer !== 'undefined') {
        return _Buffer.from(b64, 'base64').toString('utf-8');
    }
    if (typeof atob !== 'undefined') {
        return decodeURIComponent(escape(atob(b64)));
    }
    throw new Error('base64urlDecode: no Buffer or atob available');
}

export function encodePresentationSegment(presentation: Presentation): string {
    if (!presentation || typeof presentation !== 'object') {
        throw new TypeError('encodePresentationSegment: presentation required');
    }
    if (!presentation.id || !Array.isArray(presentation.steps)) {
        throw new RangeError('encodePresentationSegment: malformed presentation (id + steps required)');
    }
    const canonical = canonicalizePresentation(presentation);
    const json = JSON.stringify(canonical);
    const b64 = base64urlEncode(json);
    return `${ECBT_SEGMENT_PREFIX}${ECBT_SEGMENT_VERSION}:${b64}`;
}

export function decodePresentationSegment(segment: string): Record<string, unknown> {
    if (typeof segment !== 'string' || !segment.startsWith(ECBT_SEGMENT_PREFIX)) {
        throw new TypeError(`decodePresentationSegment: expected prefix "${ECBT_SEGMENT_PREFIX}"`);
    }
    const rest = segment.slice(ECBT_SEGMENT_PREFIX.length);
    const colon = rest.indexOf(':');
    if (colon < 0) {
        throw new RangeError('decodePresentationSegment: missing version separator');
    }
    const version = rest.slice(0, colon);
    const body = rest.slice(colon + 1);
    if (version !== ECBT_SEGMENT_VERSION) {
        throw new RangeError(`decodePresentationSegment: unsupported segment version "${version}"`);
    }
    let json: string;
    try {
        json = base64urlDecode(body);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new RangeError(`decodePresentationSegment: invalid base64url (${msg})`, { cause: e });
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new RangeError(`decodePresentationSegment: invalid JSON (${msg})`, { cause: e });
    }
    if (
        !parsed ||
        typeof parsed !== 'object' ||
        !Array.isArray((parsed as Record<string, unknown>).steps)
    ) {
        throw new RangeError('decodePresentationSegment: payload missing steps[]');
    }
    return parsed as Record<string, unknown>;
}

export function isPresentationSegment(segment: unknown): boolean {
    return typeof segment === 'string' && segment.startsWith(ECBT_SEGMENT_PREFIX);
}

export function getSegmentVersion(segment: unknown): string | null {
    if (!isPresentationSegment(segment)) return null;
    const s = segment as string;
    const rest = s.slice(ECBT_SEGMENT_PREFIX.length);
    const colon = rest.indexOf(':');
    return colon < 0 ? null : rest.slice(0, colon);
}