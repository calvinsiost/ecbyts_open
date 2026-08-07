// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation HUD - Performance Optimization Pure Logic
 * Spec: docs/specs/features/SPEC_CONSTELLATION_PERF_001.md
 *
 * Pure helpers extracted from the performance contract. No DOM, Three.js,
 * or Canvas dependencies.
 */

export interface DebouncedFunction<TArgs extends unknown[]> {
    (...args: TArgs): void;
    cancel(): void;
    flush(...args: TArgs): void;
}

export function makeDebounced<TArgs extends unknown[]>(
    fn: (...args: TArgs) => void,
    delay = 50,
): DebouncedFunction<TArgs> {
    if (typeof fn !== 'function') throw new TypeError('fn must be a function');
    if (typeof delay !== 'number' || delay < 0) throw new TypeError('delay must be a non-negative number');

    let timer: ReturnType<typeof setTimeout> | null = null;

    const debounced = ((...args: TArgs): void => {
        clearTimeout(timer ?? undefined);
        timer = setTimeout(() => {
            timer = null;
            fn(...args);
        }, delay);
    }) as DebouncedFunction<TArgs>;

    debounced.cancel = function cancel(): void {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    };

    debounced.flush = function flush(...args: TArgs): void {
        debounced.cancel();
        fn(...args);
    };

    return debounced;
}

export function makeModelSignature(
    elementId: string | number | null | undefined,
    elementCount: number,
    edgeCount: number,
): string {
    const id = elementId == null ? 'null' : String(elementId);
    const ec = Number.isFinite(elementCount) ? Math.max(0, Math.floor(elementCount)) : 0;
    const lc = Number.isFinite(edgeCount) ? Math.max(0, Math.floor(edgeCount)) : 0;
    return `${id}:${ec}:${lc}`;
}

export function shouldRebuildGraph(previousSignature: string | null | undefined, currentSignature: string): boolean {
    if (previousSignature == null) return true;
    if (typeof previousSignature !== 'string') return true;
    return previousSignature !== currentSignature;
}

export interface LevelItem {
    readonly level?: number;
}

export interface LevelMaps<TNode extends LevelItem, TLine extends LevelItem> {
    readonly nodesByLevel: Map<number, TNode[]>;
    readonly linesByLevel: Map<number, TLine[]>;
}

export function buildLevelMaps<TNode extends LevelItem, TLine extends LevelItem>(
    nodes: readonly TNode[] | null | undefined,
    lines: readonly TLine[] | null | undefined,
): LevelMaps<TNode, TLine> {
    const nodesByLevel = new Map<number, TNode[]>();
    const linesByLevel = new Map<number, TLine[]>();
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    const safeLines = Array.isArray(lines) ? lines : [];

    for (let lvl = 1; lvl <= 3; lvl++) {
        nodesByLevel.set(
            lvl,
            safeNodes.filter((node) => Boolean(node) && node.level === lvl),
        );
        linesByLevel.set(
            lvl,
            safeLines.filter((line) => Boolean(line) && line.level === lvl),
        );
    }

    return { nodesByLevel, linesByLevel };
}

export function getLevelArray<T>(levelMap: Map<number, T[]> | null | undefined, level: number): T[] {
    if (!(levelMap instanceof Map)) return [];
    const arr = levelMap.get(level);
    return Array.isArray(arr) ? arr : [];
}

export interface DirtyFlag {
    markDirty(): void;
    consumeIfDirty(): boolean;
    isDirty(): boolean;
}

export function makeDirtyFlag(): DirtyFlag {
    let dirty = true;

    return {
        markDirty() {
            dirty = true;
        },
        consumeIfDirty() {
            if (dirty) {
                dirty = false;
                return true;
            }
            return false;
        },
        isDirty() {
            return dirty;
        },
    };
}

export interface FreezeSimulation {
    stop(): void;
    restart?: () => void;
    alpha?: (value?: number) => number | FreezeSimulation | void;
}

export interface FreezeController {
    freeze(): void;
    resume(): void;
    isFrozen(): boolean;
}

export interface FreezeControllerOptions {
    readonly reheatAlpha?: number;
}

export function makeFreezeController(
    simulation: FreezeSimulation | null | undefined,
    options: FreezeControllerOptions = {},
): FreezeController {
    if (!simulation || typeof simulation.stop !== 'function') {
        throw new TypeError('simulation must have stop() method');
    }

    const reheatAlpha = Number.isFinite(options.reheatAlpha) ? options.reheatAlpha : 0.1;
    let frozen = false;

    return {
        freeze() {
            if (frozen) return;
            simulation.stop();
            frozen = true;
        },
        resume() {
            if (!frozen) return;
            if (typeof simulation.alpha === 'function' && typeof simulation.restart === 'function') {
                const alphaResult = simulation.alpha(reheatAlpha);
                if (alphaResult && typeof alphaResult === 'object' && typeof alphaResult.restart === 'function') {
                    alphaResult.restart();
                } else {
                    simulation.restart();
                }
            } else if (typeof simulation.restart === 'function') {
                simulation.restart();
            }
            frozen = false;
        },
        isFrozen() {
            return frozen;
        },
    };
}

export const constellationPerfMeta = Object.freeze({
    spec: 'SPEC_CONSTELLATION_PERF_001',
    phase: 1,
    deliveredAt: '2026-04-30',
    helpers: Object.freeze([
        'makeDebounced',
        'makeModelSignature',
        'shouldRebuildGraph',
        'buildLevelMaps',
        'getLevelArray',
        'makeDirtyFlag',
        'makeFreezeController',
    ]),
    provenance: Object.freeze({ generatedBy: 'AI', disclaimerAcknowledged: true }),
});
