// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * conflictResolver.js - UX-43 Phase 3 SPEC_ERROR_RECOVERY_JOURNEY
 *
 * Pure-logic 3-way merge for reconciling offline mutations with remote server state.
 * Zero DOM, zero side-effects. Inputs are never mutated; outputs are deep-frozen.
 *
 * Estratégia: comparamos cada caminho recursivamente entre base/local/remote.
 *   - Mudou só em local → aplica local.
 *   - Mudou só em remote → aplica remote.
 *   - Mudou nos dois com valores diferentes → conflict, resolvido por strategy.
 * Arrays são tratados como atômicos (não fazemos merge dentro do array).
 */

const VALID_STRATEGIES = new Set(['manual', 'local-wins', 'remote-wins', 'last-write-wins']);

/**
 * Determina se um valor é objeto plain (não array, não null, não Date, etc).
 */
import { isPlainObject as _isPlainObject } from '../../utils/helpers/objectGuards.js';
import { deepClone } from '../../utils/helpers/deepClone.js';
function isPlainObject(v: any): boolean {
    return _isPlainObject(v);
}

/**
 * Igualdade profunda atômica (arrays e primitivos comparados por valor serializado).
 */
function deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (a === undefined || b === undefined) return false;
    if (typeof a !== typeof b) return false;
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
        return true;
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        const ka = Object.keys(a);
        const kb = Object.keys(b);
        if (ka.length !== kb.length) return false;
        for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
        return true;
    }
    return false;
}

function isAbsent(v: any): boolean {
    return v === null || v === undefined;
}

/**
 * Coleta o conjunto de chaves presentes em qualquer um dos três objetos.
 */
function unionKeys(...objs: any[]): string[] {
    const set = new Set<string>();
    for (const o of objs) {
        if (isPlainObject(o)) for (const k of Object.keys(o)) set.add(k);
    }
    return Array.from(set);
}

function joinPath(prefix: any, key: any): string {
    return prefix ? `${prefix}.${key}` : key;
}

/**
 * Tipo de mudança em relação à base.
 */
function classifyType(v: any): string {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (Array.isArray(v)) return 'array';
    return typeof v;
}

function isTypeMismatch(local: any, remote: any): boolean {
    if (isAbsent(local) || isAbsent(remote)) return false;
    return classifyType(local) !== classifyType(remote);
}

/**
 * Detecta conflitos recursivamente. Retorna array de descritores.
 */
export function detectConflicts(
    base: any,
    local: any,
    remote: any,
    prefix: string = '',
): Array<{ path: string; base: any; local: any; remote: any; reason: string }> {
    const out: any[] = [];
    const bothObj =
        isPlainObject(local) && isPlainObject(remote) && (isPlainObject(base) || base === undefined || base === null);

    if (bothObj) {
        const keys = unionKeys(base, local, remote);
        for (const k of keys) {
            const bv = isPlainObject(base) ? base[k] : undefined;
            const lv = local[k];
            const rv = remote[k];
            out.push(...detectConflicts(bv, lv, rv, joinPath(prefix, k)));
        }
        return out;
    }

    const localChanged = !deepEqual(base, local);
    const remoteChanged = !deepEqual(base, remote);
    if (!localChanged || !remoteChanged) return out;
    if (deepEqual(local, remote)) return out; // mesma mudança em ambos

    const reason = isTypeMismatch(local, remote) ? 'type-mismatch' : 'value-divergence';
    out.push({ path: prefix || '$root', base, local, remote, reason });
    return out;
}

/**
 * Aplica a strategy escolhida a um conflito atômico.
 */
function applyStrategy(conflict: any, strategy: any, opts: any): { value: any; resolved: boolean } {
    if (strategy === 'local-wins') return { value: conflict.local, resolved: true };
    if (strategy === 'remote-wins') return { value: conflict.remote, resolved: true };
    if (strategy === 'last-write-wins') {
        const lt = Number(opts.localTimestamp);
        const rt = Number(opts.remoteTimestamp);
        if (!Number.isFinite(lt) || !Number.isFinite(rt)) {
            throw new Error('last-write-wins requires numeric localTimestamp and remoteTimestamp in opts');
        }
        return { value: lt >= rt ? conflict.local : conflict.remote, resolved: true };
    }
    // manual → fica não-resolvido, valor permanece base (ou local se base ausente)
    return { value: isAbsent(conflict.base) ? conflict.local : conflict.base, resolved: false };
}

/**
 * Merge recursivo. Retorna {merged, conflicts} onde conflicts inclui só os
 * conflitos não-resolvidos quando strategy='manual', ou todos os conflitos
 * encontrados (já resolvidos) com `strategy` registrada.
 */
function mergeRecursive(
    base: any,
    local: any,
    remote: any,
    opts: any,
    prefix: string = '',
): { value: any; conflicts: any[]; hadKey: boolean } {
    const bothObj = isPlainObject(local) && isPlainObject(remote) && (isPlainObject(base) || isAbsent(base));

    if (bothObj) {
        const out: Record<string, any> = {};
        const conflicts: any[] = [];
        const keys = unionKeys(base, local, remote);
        for (const k of keys) {
            const bv = isPlainObject(base) ? base[k] : undefined;
            const lv = local[k];
            const rv = remote[k];
            const localPresent = isPlainObject(local) && k in local;
            const remotePresent = isPlainObject(remote) && k in remote;

            // Chave ausente em local mas presente em remote (ou vice-versa) → tratar como atomic
            if (!localPresent && remotePresent) {
                if (isPlainObject(base) && k in base && !deepEqual(bv, rv)) {
                    // base tinha, remote mudou, local removeu → conflict atomic
                    const sub = mergeAtomic(bv, undefined, rv, opts, joinPath(prefix, k));
                    out[k] = sub.value;
                    conflicts.push(...sub.conflicts);
                } else {
                    out[k] = rv;
                }
                continue;
            }
            if (localPresent && !remotePresent) {
                if (isPlainObject(base) && k in base && !deepEqual(bv, lv)) {
                    const sub = mergeAtomic(bv, lv, undefined, opts, joinPath(prefix, k));
                    out[k] = sub.value;
                    conflicts.push(...sub.conflicts);
                } else {
                    out[k] = lv;
                }
                continue;
            }

            const sub = mergeRecursive(bv, lv, rv, opts, joinPath(prefix, k));
            if (sub.value !== undefined || sub.hadKey) out[k] = sub.value;
            conflicts.push(...sub.conflicts);
        }
        return { value: out, conflicts, hadKey: true };
    }

    const atom = mergeAtomic(base, local, remote, opts, prefix || '$root');
    return { value: atom.value, conflicts: atom.conflicts, hadKey: true };
}

function mergeAtomic(
    base: any,
    local: any,
    remote: any,
    opts: any,
    path: any,
): { value: any; conflicts: any[] } {
    const localChanged = !deepEqual(base, local);
    const remoteChanged = !deepEqual(base, remote);

    if (!localChanged && !remoteChanged) return { value: base, conflicts: [] };
    if (localChanged && !remoteChanged) return { value: local, conflicts: [] };
    if (!localChanged && remoteChanged) return { value: remote, conflicts: [] };
    if (deepEqual(local, remote)) return { value: local, conflicts: [] };

    const conflict: Record<string, any> = {
        path,
        base,
        local,
        remote,
        reason: isTypeMismatch(local, remote) ? 'type-mismatch' : 'value-divergence',
        strategy: opts.strategy,
    };
    const { value, resolved } = applyStrategy(conflict, opts.strategy, opts);
    conflict.resolved = resolved;
    return { value, conflicts: [conflict] };
}

/**
 * Congela profundamente um objeto/array (no-op em primitivos).
 */
function deepFreeze(v: any): any {
    if (v === null || typeof v !== 'object') return v;
    if (Object.isFrozen(v)) return v;
    if (Array.isArray(v)) {
        for (const item of v) deepFreeze(item);
    } else {
        const obj: Record<string, any> = v;
        for (const k of Object.keys(obj)) deepFreeze(obj[k]);
    }
    return Object.freeze(v);
}

/**
 * 3-way merge pure-logic.
 */
export function mergeThreeWay(
    base: object | null | undefined,
    local: object | null | undefined,
    remote: object | null | undefined,
    opts: { strategy?: string; localTimestamp?: number; remoteTimestamp?: number } = {},
): { merged: object; conflicts: Array<any> } {
    const strategy = opts.strategy || 'manual';
    if (!VALID_STRATEGIES.has(strategy)) {
        throw new Error(`Invalid strategy: ${strategy}. Must be one of ${Array.from(VALID_STRATEGIES).join(', ')}`);
    }
    const safeOpts = { ...opts, strategy };
    const safeBase = isAbsent(base) ? {} : base;
    const safeLocal = isAbsent(local) ? {} : local;
    const safeRemote = isAbsent(remote) ? {} : remote;

    const { value, conflicts } = mergeRecursive(safeBase, safeLocal, safeRemote, safeOpts);
    return { merged: deepFreeze(value), conflicts: deepFreeze(conflicts) };
}

/**
 * Resolve um conflito específico em um merged previamente computado.
 * Retorna novo merged frozen com o caminho substituído.
 */
export function resolveConflict(
    merged: any,
    conflictPath: any,
    choice: any,
    customValue: any,
): any {
    if (!conflictPath || typeof conflictPath !== 'string') {
        throw new Error('conflictPath must be a non-empty string');
    }
    if (!['local', 'remote', 'custom'].includes(choice)) {
        throw new Error(`Invalid choice: ${choice}. Must be local|remote|custom`);
    }
    // Clone profundo (estrutural) antes de modificar
    const clone = deepClone(merged ?? {});
    if (conflictPath === '$root') {
        const next = choice === 'custom' ? customValue : clone;
        return deepFreeze(next);
    }
    const parts = conflictPath.split('.');
    let cursor = clone;
    for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i] as string;
        if (!isPlainObject(cursor[k])) cursor[k] = {};
        cursor = cursor[k];
    }
    const leaf = parts[parts.length - 1] as string;
    if (choice === 'custom') {
        cursor[leaf] = customValue;
    } else {
        // local/remote sem conflict descriptor original: usuário deve já ter
        // o valor desejado em customValue. Para 'local'/'remote' sem hint,
        // mantemos o que está no merged.
        // Se quiser explicitar, passar via customValue.
        if (customValue !== undefined) cursor[leaf] = customValue;
    }
    return deepFreeze(clone);
}

/**
 * Sumariza o resultado de um mergeThreeWay para UI/telemetria.
 */
export function summarizeMerge(result: any): {
    totalFields: number;
    autoMerged: number;
    conflicted: number;
    resolution: string;
} {
    const conflicts = Array.isArray(result?.conflicts) ? result.conflicts : [];
    const merged = result?.merged;
    let totalFields = 0;
    function countLeaves(v: any): void {
        if (isPlainObject(v)) {
            const keys = Object.keys(v);
            if (keys.length === 0) {
                totalFields += 1;
                return;
            }
            for (const k of keys) countLeaves(v[k]);
        } else {
            totalFields += 1;
        }
    }
    countLeaves(merged);
    const conflicted = conflicts.length;
    const resolvedCount = conflicts.filter((c: any) => c.resolved).length;
    const autoMerged = Math.max(totalFields - conflicted, 0);
    return {
        totalFields,
        autoMerged,
        conflicted,
        resolution: conflicted === 0 ? 'clean' : resolvedCount === conflicted ? 'auto-resolved' : 'manual-required',
    };
}

export default { detectConflicts, mergeThreeWay, resolveConflict, summarizeMerge };
