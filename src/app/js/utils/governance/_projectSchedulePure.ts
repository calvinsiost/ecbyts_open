// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (governance/projectManager).
//
// utils/governance/projectManager.ts (1635L) tem algoritmos de scheduling puros:
// Critical Path Method (CPM, forward+backward pass), topological sort + cycle
// detection (Kahn). Extração libera teste isolado + citação acadêmica
// (PMI CPM standard — doutorado Poli/USP).
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. 14º Module C da campanha.
//
// Spec NOT:
// - NÃO ler module state (projects — caller passa phases array)
// - NÃO chamar getProject (caller resolve)
// - NÃO emoji
//
// Extracted helpers:
//   - PhaseLike (canonical type)
//   - DAY_MS                          (frozen 86400000)
//   - computePhaseDurationDays(phase) pure (milestone=0, date diff)
//   - detectPhaseCycle(phases)        pure Kahn cycle detection
//   - topologicalSortPhases(phases)   pure Kahn topo sort (null se ciclo)
//   - computeCriticalPath(phases)     pure CPM forward+backward+float

export interface PhaseLike {
    id: string;
    dependencies: ReadonlyArray<string>;
    isMilestone?: boolean;
    startDate?: string | null;
    endDate?: string | null;
    [key: string]: unknown;
}

/** Milissegundos em 1 dia. */
export const DAY_MS = 86400000;

/**
 * Compute phase duration in days.
 *   milestone → 0
 *   sem startDate/endDate → 0
 *   senão → ceil((end - start) / DAY_MS), min 0
 *
 * Matches getDuration @ projectManager.ts:454-460.
 */
export function computePhaseDurationDays(phase: PhaseLike): number {
    if (phase.isMilestone) return 0;
    if (!phase.startDate || !phase.endDate) return 0;
    const start = new Date(phase.startDate).getTime();
    const end = new Date(phase.endDate).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    return Math.max(0, Math.ceil((end - start) / DAY_MS));
}

/**
 * Build adjacency + in-degree maps from phases (Kahn prep).
 * Helper interno compartilhado por detectPhaseCycle + topologicalSortPhases.
 */
function _buildGraph(phases: ReadonlyArray<PhaseLike>): {
    inDegree: Map<string, number>;
    adjacency: Map<string, string[]>;
    phaseMap: Map<string, PhaseLike>;
} {
    const ids = new Set(phases.map((p) => p.id));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();
    const phaseMap = new Map<string, PhaseLike>();
    for (const phase of phases) {
        inDegree.set(phase.id, 0);
        adjacency.set(phase.id, []);
        phaseMap.set(phase.id, phase);
    }
    for (const phase of phases) {
        for (const dep of phase.dependencies || []) {
            if (!ids.has(dep)) continue;
            adjacency.get(dep)!.push(phase.id);
            inDegree.set(phase.id, (inDegree.get(phase.id) || 0) + 1);
        }
    }
    return { inDegree, adjacency, phaseMap };
}

/**
 * Detect cycle in phase dependency graph (Kahn — visited < N ⇒ ciclo).
 *
 * Matches _detectCycle @ projectManager.ts:397-432 (mas pure).
 */
export function detectPhaseCycle(phases: ReadonlyArray<PhaseLike>): boolean {
    const { inDegree, adjacency } = _buildGraph(phases);
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
        if (deg === 0) queue.push(id);
    }
    let visited = 0;
    while (queue.length > 0) {
        const node = queue.shift()!;
        visited++;
        for (const neighbor of adjacency.get(node) || []) {
            const newDeg = (inDegree.get(neighbor) || 0) - 1;
            inDegree.set(neighbor, newDeg);
            if (newDeg === 0) queue.push(neighbor);
        }
    }
    return visited < phases.length;
}

/**
 * Topological sort of phases (Kahn). Returns null se ciclo detectado.
 *
 * Matches _topologicalSort @ projectManager.ts:521-558 (mas pure).
 */
export function topologicalSortPhases(phases: ReadonlyArray<PhaseLike>): PhaseLike[] | null {
    const { inDegree, adjacency, phaseMap } = _buildGraph(phases);
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
        if (deg === 0) queue.push(id);
    }
    const sorted: PhaseLike[] = [];
    while (queue.length > 0) {
        const node = queue.shift()!;
        const phase = phaseMap.get(node);
        if (phase) sorted.push(phase);
        for (const neighbor of adjacency.get(node) || []) {
            const newDeg = (inDegree.get(neighbor) || 0) - 1;
            inDegree.set(neighbor, newDeg);
            if (newDeg === 0) queue.push(neighbor);
        }
    }
    return sorted.length === phases.length ? sorted : null;
}

function runForwardPass(sorted: PhaseLike[]): { ES: Map<string, number>; EF: Map<string, number> } {
    const ES = new Map<string, number>();
    const EF = new Map<string, number>();
    for (const phase of sorted) {
        let earlyStart = 0;
        for (const depId of phase.dependencies || []) {
            const depEF = EF.get(depId);
            if (depEF !== undefined && depEF > earlyStart) earlyStart = depEF;
        }
        ES.set(phase.id, earlyStart);
        EF.set(phase.id, earlyStart + computePhaseDurationDays(phase));
    }
    return { ES, EF };
}

function runBackwardPass(
    sorted: PhaseLike[],
    phases: ReadonlyArray<PhaseLike>,
    maxEF: number,
): { LS: Map<string, number>; LF: Map<string, number> } {
    const LS = new Map<string, number>();
    const LF = new Map<string, number>();
    for (let i = sorted.length - 1; i >= 0; i--) {
        const phase = sorted[i];
        if (!phase) continue;
        let lateFinish = maxEF;
        for (const other of phases) {
            if ((other.dependencies || []).includes(phase.id)) {
                const otherLS = LS.get(other.id);
                if (otherLS !== undefined && otherLS < lateFinish) lateFinish = otherLS;
            }
        }
        LF.set(phase.id, lateFinish);
        LS.set(phase.id, lateFinish - computePhaseDurationDays(phase));
    }
    return { LS, LF };
}

function extractCriticalSet(
    phases: ReadonlyArray<PhaseLike>,
    ES: Map<string, number>,
    LS: Map<string, number>,
): Set<string> {
    const critical = new Set<string>();
    for (const phase of phases) {
        const float = (LS.get(phase.id) || 0) - (ES.get(phase.id) || 0);
        if (Math.abs(float) < 0.001) critical.add(phase.id);
    }
    return critical;
}

/**
 * Compute Critical Path Method (CPM) — returns Set de phase IDs no caminho crítico.
 *
 * Algoritmo (PMI CPM standard):
 *   1. Topological sort (null → ciclo → Set vazio)
 *   2. Forward pass: ES (Early Start) / EF (Early Finish)
 *   3. Backward pass: LS (Late Start) / LF (Late Finish)
 *   4. Float = LS − ES; float ≈ 0 → fase crítica
 *
 * Matches calculateCriticalPath @ projectManager.ts:445-514 (mas pure — caller
 * passa phases array já filtrado por projeto).
 */
export function computeCriticalPath(phases: ReadonlyArray<PhaseLike>): Set<string> {
    if (!phases || phases.length === 0) return new Set();
    const sorted = topologicalSortPhases(phases);
    if (!sorted) return new Set(); // ciclo detectado

    const { ES, EF } = runForwardPass(sorted);
    const maxEF = Math.max(...[...EF.values()], 0);
    const { LS } = runBackwardPass(sorted, phases, maxEF);
    return extractCriticalSet(phases, ES, LS);
}
