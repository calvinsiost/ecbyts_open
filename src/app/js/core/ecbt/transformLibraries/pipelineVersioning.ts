// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Versioning - Phase 42 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S42
 *
 * Phase 42 (2026-05-02) - pure-logic semver versioning para pipelines.
 * Suporta:
 *   - parseVersion / compareVersions (major.minor.patch)
 *   - bumpVersion (major|minor|patch)
 *   - isCompatible (caret/tilde/exact range)
 *   - createVersionedSnapshot
 *   - listVersions / summarizeVersions
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** AGPL-3.0 */

export const DEFAULT_CONFIG = Object.freeze({
    initialVersion: '0.1.0',
    maxHistory: 100,
} as const);

export const VERSIONING_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 42,
    deliveredAt: '2026-05-02',
} as const);

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export interface ParsedVersion {
    major: number;
    minor: number;
    patch: number;
}

export interface VersionedSnapshot {
    pipelineId: string;
    version: string;
    payload: unknown;
    createdAt: number;
}

/**
 * Parse semver "X.Y.Z" para {major, minor, patch}. Retorna null se inválido.
 */
export function parseVersion(v: unknown): ParsedVersion | null {
    if (typeof v !== 'string') return null;
    const m = SEMVER_RE.exec(v.trim());
    if (!m) return null;
    return Object.freeze({
        major: parseInt(m[1] || '0', 10),
        minor: parseInt(m[2] || '0', 10),
        patch: parseInt(m[3] || '0', 10),
    }) as ParsedVersion;
}

/**
 * Compara duas versões. Retorna -1, 0, 1. Inválidas → 0.
 */
export function compareVersions(a: unknown, b: unknown): number {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (!pa || !pb) return 0;
    if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
    if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
    if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
    return 0;
}

/**
 * Bump versão por tipo. Retorna nova string ou null.
 */
export function bumpVersion(v: string, kind: 'major' | 'minor' | 'patch'): string | null {
    const p = parseVersion(v);
    if (!p) return null;
    if (kind === 'major') return `${p.major + 1}.0.0`;
    if (kind === 'minor') return `${p.major}.${p.minor + 1}.0`;
    if (kind === 'patch') return `${p.major}.${p.minor}.${p.patch + 1}`;
    return null;
}

/**
 * Verifica compatibilidade. Range:
 *   - "1.2.3" exato
 *   - "^1.2.3" mesmo major, ≥1.2.3
 *   - "~1.2.3" mesmo major.minor, ≥1.2.3
 *   - "*" qualquer
 */
export function isCompatible(version: unknown, range: unknown): boolean {
    if (typeof version !== 'string' || typeof range !== 'string') return false;
    const r = range.trim();
    if (r === '*') return parseVersion(version) !== null;
    const v = parseVersion(version);
    if (!v) return false;
    if (r.startsWith('^')) {
        const target = parseVersion(r.slice(1));
        if (!target) return false;
        if (v.major !== target.major) return false;
        return compareVersions(version, r.slice(1)) >= 0;
    }
    if (r.startsWith('~')) {
        const target = parseVersion(r.slice(1));
        if (!target) return false;
        if (v.major !== target.major || v.minor !== target.minor) return false;
        return compareVersions(version, r.slice(1)) >= 0;
    }
    return compareVersions(version, r) === 0;
}

/**
 * Cria snapshot versionado de pipeline.
 */
export function createVersionedSnapshot(
    pipelineId: string,
    version: string,
    payload: unknown,
    now?: number,
): VersionedSnapshot | null {
    if (typeof pipelineId !== 'string' || !pipelineId) return null;
    if (!parseVersion(version)) return null;
    const timestamp = Number.isFinite(now) ? now : Date.now();
    return Object.freeze({
        pipelineId,
        version,
        payload: payload === undefined ? null : payload,
        createdAt: timestamp,
    }) as VersionedSnapshot;
}

/**
 * Lista versões de uma coleção de snapshots, ordenadas asc.
 */
export function listVersions(
    snapshots?: ReadonlyArray<{ version: string }> | null,
): ReadonlyArray<string> {
    if (!Array.isArray(snapshots)) return Object.freeze([]);
    const versions = snapshots
        .filter((s): s is { version: string } => !!s && parseVersion(s.version) !== null)
        .map((s) => s.version);
    const sorted = [...versions].sort((a, b) => compareVersions(a, b));
    return Object.freeze(sorted);
}

/**
 * Sumariza coleção de snapshots.
 */
export function summarizeVersions(
    snapshots?: ReadonlyArray<{ version: string }> | null,
): { count: number; latest: string | null; earliest: string | null; majors: number } {
    const empty = { count: 0, latest: null as string | null, earliest: null as string | null, majors: 0 };
    if (!Array.isArray(snapshots) || snapshots.length === 0) return Object.freeze(empty);
    const sorted = listVersions(snapshots);
    if (sorted.length === 0) return Object.freeze(empty);
    const majors = new Set(sorted.map((v) => {
        const p = parseVersion(v);
        return p ? p.major : 0;
    }));
    return Object.freeze({
        count: sorted.length,
        latest: sorted[sorted.length - 1] ?? null,
        earliest: sorted[0] ?? null,
        majors: majors.size,
    });
}

/**
 * Module identity export.
 */
export const pipelineVersioningMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 42,
    deliveredAt: '2026-05-02',
    exports: [
        'DEFAULT_CONFIG',
        'VERSIONING_META',
        'parseVersion',
        'compareVersions',
        'bumpVersion',
        'isCompatible',
        'createVersionedSnapshot',
        'listVersions',
        'summarizeVersions',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
} as const);