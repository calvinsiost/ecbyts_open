// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Versioning - Phase 12 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S15
 *
 * Phase 12 (2026-05-01) - pure-logic engine de versionamento semver-style
 * para documentos de compliance. Suporta major/minor/patch + branches +
 * merge com conflict detection.
 *
 * Estratégia:
 *   - Version: {major, minor, patch} immutável
 *   - Bump policies: major/minor/patch baseadas em tipo de mudança
 *   - Branch: linha paralela de versões (ex: 1.2.0-draft → 1.2.0)
 *   - Merge: combina branches detectando conflitos por field
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Bump types canônicos (ordenados por magnitude). */
export const BUMP_TYPES = Object.freeze(['patch', 'minor', 'major']);

/** Change classifications canônicas (mapeiam para bump type). */
export const CHANGE_CLASSES = Object.freeze({
    typo: 'patch',
    formatting: 'patch',
    clarification: 'patch',
    update: 'minor',
    addition: 'minor',
    removal: 'major',
    breaking: 'major',
    structural: 'major',
});

/** Identidade do módulo. */
export const VERSIONING_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 12,
    deliveredAt: '2026-05-01',
    bumpTypes: BUMP_TYPES,
    changeClasses: Object.keys(CHANGE_CLASSES),
});

/**
 * Cria objeto frozen de versão.
 *
 * @param {number} major
 * @param {number} minor
 * @param {number} patch
 * @param {string|null} [branch] - null/main para versão principal
 * @returns {Object}
 */
export function createVersion(major: number, minor: number, patch: number, branch: string|null = null): Object {
    if (!Number.isInteger(major) || major < 0) {
        throw new TypeError('createVersion: major must be non-negative integer');
    }
    if (!Number.isInteger(minor) || minor < 0) {
        throw new TypeError('createVersion: minor must be non-negative integer');
    }
    if (!Number.isInteger(patch) || patch < 0) {
        throw new TypeError('createVersion: patch must be non-negative integer');
    }
    return Object.freeze({
        major,
        minor,
        patch,
        branch: typeof branch === 'string' && branch.trim() ? branch : null,
    });
}

/**
 * Parse semver string "M.m.p" ou "M.m.p-branch".
 *
 * @param {string} str
 * @returns {Object|null}
 */
export function parseVersion(str: string): Object|null {
    if (typeof str !== 'string') return null;
    const match = str.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-z0-9-]+))?$/i);
    if (!match) return null;
    try {
        return createVersion(
            parseInt(match[1]!, 10),
            parseInt(match[2]!, 10),
            parseInt(match[3]!, 10),
            match[4] || undefined,
        );
    } catch (e: any) {
        console.debug('[versioning:parseVersion]', e?.message || e);
        return null;
    }
}

/**
 * Formata versão como string.
 *
 * @param {Record<string, any>} version
 * @returns {string}
 */
export function formatVersion(version: Record<string, any>): string {
    if (!version || !Number.isInteger(version.major)) return '0.0.0';
    const base = `${version.major}.${version.minor}.${version.patch}`;
    return version.branch ? `${base}-${version.branch}` : base;
}

/**
 * Compara duas versões (a − b).
 *
 * @param {Record<string, any>} a
 * @param {Record<string, any>} any>
 * @returns {number} <0, 0, >0
 */
export function compareVersions(a: Record<string, any>, b: Record<string, any>): number {
    if (!a || !b) return 0;
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    if (a.patch !== b.patch) return a.patch - b.patch;
    // Same numeric - compare branch (null < string)
    if (a.branch === b.branch) return 0;
    if (!a.branch && b.branch) return 1; // main > branch
    if (a.branch && !b.branch) return -1;
    return a.branch.localeCompare(b.branch);
}

/**
 * Bump versão por tipo.
 *
 * @param {Record<string, any>} version
 * @param {string} any> - patch / minor / major
 * @returns {Object} nova versão frozen
 */
export function bumpVersion(version: Record<string, any>, type: string): Object {
    if (!version) return createVersion(0, 0, 1);
    if (!BUMP_TYPES.includes(type)) {
        throw new TypeError(`bumpVersion: type must be one of ${BUMP_TYPES.join(',')}`);
    }
    if (type === 'major') {
        return createVersion(version.major + 1, 0, 0, version.branch);
    }
    if (type === 'minor') {
        return createVersion(version.major, version.minor + 1, 0, version.branch);
    }
    return createVersion(version.major, version.minor, version.patch + 1, version.branch);
}

/**
 * Determina bump type baseado em classe de mudança.
 *
 * @param {string} changeClass
 * @returns {string} bump type
 */
export function classToBump(changeClass: string): string {
    return ((CHANGE_CLASSES as Record<string, any>)[changeClass] || 'patch' as any);
}

/**
 * Verifica se versão é prerelease (tem branch != null).
 */
export function isPrerelease(version: any) {
    return Boolean(version && version.branch);
}

/**
 * Verifica se versão B é estritamente maior que A.
 */
export function isNewer(a: any, b: any) {
    return compareVersions(a, b) < 0;
}

/**
 * Cria branch de uma versão.
 *
 * @param {Record<string, any>} version
 * @param {string} any>
 * @returns {Object}
 */
export function createBranch(version: Record<string, any>, branchName: string): Object {
    if (!version) throw new TypeError('createBranch: version required');
    if (typeof branchName !== 'string' || !branchName.trim()) {
        throw new TypeError('createBranch: branchName required');
    }
    return createVersion(version.major, version.minor, version.patch, branchName);
}

/**
 * Promove branch para main (remove branch tag).
 *
 * @param {Record<string, any>} version
 * @returns {Object}
 */
export function promoteToMain(version: Record<string, any>): Object {
    if (!version) return createVersion(0, 0, 0);
    return createVersion(version.major, version.minor, version.patch, undefined);
}

/**
 * Detecta conflitos entre dois objetos changes.
 *
 * @param {any} changesA - { fieldPath: newValue }
 * @param {any} changesB
 * @returns {Array<{field: any, valueA: any, valueB: any}>}
 */
export function detectConflicts(changesA: any, changesB: any): Array<{field: any, valueA: any, valueB: any}> {
        const empty: any[]= [];
    if (!changesA || !changesB || typeof changesA !== 'object' || typeof changesB !== 'object') {
        return empty;
    }
        const conflicts: any[]= [];
    for (const field of Object.keys(changesA)) {
        if (field in changesB && JSON.stringify(changesA[field]) !== JSON.stringify(changesB[field])) {
            conflicts.push(Object.freeze({ field, valueA: changesA[field], valueB: changesB[field] }));
        }
    }
    return (Object.freeze(conflicts) as any);
}

/**
 * Merge changesA + changesB. Conflitos resolvidos por strategy.
 *
 * @param {any} changesA
 * @param {any} changesB
 * @param {Object} [options]
 * @param {string} [options.strategy='B'] - 'A' | 'B' | 'fail'
 * @returns {{merged: any, conflicts: any[]}}
 */
export function mergeChanges(changesA: any, changesB: any, options: { strategy?: string } = {}): {merged: any, conflicts: any[]} {
    const conflicts = detectConflicts(changesA, changesB);
    const strategy = options.strategy || 'B';
    if (conflicts.length > 0 && strategy === 'fail') {
        return (Object.freeze({ merged: null, conflicts }) as any);
    }
        const merged: Record<string, any>= { ...(changesA || {}) };
    for (const field of Object.keys(changesB || {})) {
        if (field in merged && conflicts.some((c) => c.field === field)) {
            // Apply strategy
            if (strategy === 'B') merged[field] = changesB[field];
            // strategy === 'A' keeps original
        } else {
            merged[field] = changesB[field];
        }
    }
    return (Object.freeze({ merged: Object.freeze(merged), conflicts }) as any);
}

/**
 * Sumariza histórico de versões.
 */
export function summarizeHistory(versions: any) {
    const empty = {
        count: 0,
        latest: null,
        majorBumps: 0,
        minorBumps: 0,
        patchBumps: 0,
        branches: [],
    };
    if (!Array.isArray(versions) || versions.length === 0) return empty;

    const sorted = [...versions].sort(compareVersions);
    const branches = new Set();
    let major = 0;
    let minor = 0;
    let patch = 0;

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (curr.major > prev.major) major++;
        else if (curr.minor > prev.minor) minor++;
        else if (curr.patch > prev.patch) patch++;
    }
    for (const v of sorted) {
        if (v.branch) branches.add(v.branch);
    }
    return {
        count: sorted.length,
        latest: sorted[sorted.length - 1],
        majorBumps: major,
        minorBumps: minor,
        patchBumps: patch,
        branches: [...branches].sort(),
    };
}

/**
 * Module identity export.
 */
export const complianceVersioningMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 12,
    deliveredAt: '2026-05-01',
    bumpTypes: BUMP_TYPES,
    changeClasses: Object.keys(CHANGE_CLASSES),
    exports: [
        'BUMP_TYPES',
        'CHANGE_CLASSES',
        'VERSIONING_META',
        'createVersion',
        'parseVersion',
        'formatVersion',
        'compareVersions',
        'bumpVersion',
        'classToBump',
        'isPrerelease',
        'isNewer',
        'createBranch',
        'promoteToMain',
        'detectConflicts',
        'mergeChanges',
        'summarizeHistory',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
