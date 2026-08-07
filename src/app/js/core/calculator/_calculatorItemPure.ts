// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (calculator/manager).
//
// Aplicação direta da recomendação #7 do scripts/refactor-opportunities.mjs:
// core/calculator/manager.ts (514L) tem fan-in 15 no maior SCC. Extração de
// item-shape + pure CRUD operations + uncertainty math reduz acoplamento
// entre callers (engine.js, addCalculatorItem, duplicateCalculatorItem,
// reorderCalculatorItem, exportCalculator, importCalculator).
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. Mantém compatibilidade com ECBT import legacy.
//
// Spec NOT:
// - NÃO ler module state (calculatorConfig — caller passa items[])
// - NÃO chamar generateId() — caller injeta id ou ID generator
// - NÃO persistir (_persist é side-effect — caller chama após mutação)
// - NÃO chamar convertQualitativeUncertainty/evaluateRules — caller injeta
// - NÃO emoji
//
// Extracted helpers:
//   - CalculatorFilter / CalculatorRatio / CalculatorConditions (types canonical)
//   - CalculatorItem / CalculatorItemPartial (canonical shapes)
//   - UncertaintyGateAction / UncertaintyGate (canonical)
//   - ReorderDirection
//   - DEFAULT_ITEM_TEMPLATE                (frozen shape sem id)
//   - VALID_CALCULATIONS                   (frozen list)
//   - VALID_REORDER_DIRECTIONS             (frozen list)
//   - createItemFromPartial(id, partial)   pure factory (caller passa id)
//   - cloneCalculatorItem(item, newId)     pure deep clone (filters/cond/ratio)
//   - reorderItemsArray(items, id, dir)    pure swap, returns new array
//   - serializeItemForExport(item)         pure deep copy (export shape)
//   - computeExceedanceProbability(...)    pure math formula
//   - isValidCalculatorItem(value)         type-guard

export type ReorderDirection = 'up' | 'down';

export type UncertaintyGateAction = 'allow' | 'block' | 'review' | string;

export interface CalculatorFilter {
    dimension?: string;
    operator?: string;
    value?: unknown;
    [key: string]: unknown;
}

export interface CalculatorRatio {
    numerator?: unknown;
    denominator?: unknown;
    [key: string]: unknown;
}

export interface CalculatorConditions {
    conditions?: ReadonlyArray<CalculatorFilter>;
    [key: string]: unknown;
}

export interface CalculatorItem {
    id: string;
    label: string;
    suffix: string;
    type: 'metric' | 'ratio' | string;
    filters: CalculatorFilter[];
    calculation: string;
    campaignA: string | null;
    campaignB: string | null;
    unitId: string | null;
    precision: number;
    color: string;
    enabled: boolean;
    conditions: CalculatorConditions | null;
    ratio: CalculatorRatio | null;
    readonly?: boolean;
    _templateType?: string;
    [key: string]: unknown;
}

export type CalculatorItemPartial = Partial<CalculatorItem>;

export interface UncertaintyGate {
    action: UncertaintyGateAction;
    exceedanceProb: number;
    source: 'q2q_map' | 'q2q_fallback' | string;
}

/**
 * Frozen item default template (sem id — caller injeta).
 * Matches addCalculatorItem default shape @ manager.ts:101-117.
 */
export const DEFAULT_ITEM_TEMPLATE: Readonly<Omit<CalculatorItem, 'id'>> = Object.freeze({
    label: '',
    suffix: '',
    type: 'metric',
    filters: [] as CalculatorFilter[],
    calculation: 'average',
    campaignA: null,
    campaignB: null,
    unitId: null,
    precision: 2,
    color: '',
    enabled: true,
    conditions: null,
    ratio: null,
});

/**
 * Frozen list of valid calculation kinds usados em engine.
 * Caller pode validar 'calculation' field antes de aceitar item.
 */
export const VALID_CALCULATIONS: ReadonlyArray<string> = Object.freeze([
    'average',
    'sum',
    'min',
    'max',
    'count',
    'median',
    'stddev',
    'percentile',
    'ratio',
    'custom',
]);

export const VALID_REORDER_DIRECTIONS: ReadonlyArray<ReorderDirection> = Object.freeze(['up', 'down']);

/**
 * Create new calculator item from partial + caller-injected id.
 * Padrão DI: caller passa id (via generateId('calc')) → pure factory.
 *
 * Matches addCalculatorItem body @ manager.ts:101-117 sem persist/push.
 */
export function createItemFromPartial(id: string, partial: CalculatorItemPartial = {}): CalculatorItem {
    return {
        ...DEFAULT_ITEM_TEMPLATE,
        ...partial,
        id,
        // Preserva arrays/objetos próprios do partial (evita aliasing do template frozen)
        filters: Array.isArray(partial.filters)
            ? partial.filters.map((f) => ({ ...f }))
            : [],
    } as CalculatorItem;
}

/**
 * Deep clone calculator item with new id.
 *   filters[] cloned (shallow per filter)
 *   conditions.conditions[] cloned se presente
 *   ratio cloned se presente
 *
 * Matches duplicateCalculatorItem body @ manager.ts:163-184 sem push/persist.
 */
export function cloneCalculatorItem(item: CalculatorItem, newId: string): CalculatorItem {
    return {
        ...item,
        id: newId,
        filters: Array.isArray(item.filters) ? item.filters.map((f) => ({ ...f })) : [],
        conditions: item.conditions
            ? {
                  ...item.conditions,
                  conditions: Array.isArray(item.conditions.conditions)
                      ? item.conditions.conditions.map((c) => ({ ...c }))
                      : [],
              }
            : null,
        ratio: item.ratio ? { ...item.ratio } : null,
    };
}

/**
 * Reorder items by id in 'up' or 'down' direction (pure — returns NEW array).
 *   Out of bounds → returns input array unchanged
 *   ID not found  → returns input array unchanged
 *
 * Matches reorderCalculatorItem swap logic @ manager.ts:191-200, mas retorna
 * novo array em vez de mutar (caller decide se substitui state).
 */
export function reorderItemsArray<T extends { id: string }>(
    items: ReadonlyArray<T>,
    id: string,
    direction: ReorderDirection,
): T[] {
    const arr = items.slice();
    const idx = arr.findIndex((i) => i.id === id);
    if (idx === -1) return arr;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= arr.length) return arr;
    const tmp = arr[idx] as T;
    arr[idx] = arr[target] as T;
    arr[target] = tmp;
    return arr;
}

/**
 * Serialize calculator item for export (deep copy, sem state refs).
 * Matches exportCalculator map body @ manager.ts:396-411.
 *
 * Garante que filters/conditions/ratio sejam clones, não aliases.
 */
export function serializeItemForExport(item: CalculatorItem): CalculatorItem {
    return {
        ...item,
        filters: Array.isArray(item.filters) ? item.filters.map((f) => ({ ...f })) : [],
        conditions: item.conditions
            ? {
                  ...item.conditions,
                  conditions: Array.isArray(item.conditions.conditions)
                      ? item.conditions.conditions.map((c) => ({ ...c }))
                      : [],
              }
            : null,
        ratio: item.ratio ? { ...item.ratio } : null,
    };
}

/**
 * Compute uncertainty exceedance probability (pure math).
 *   rel = |uncertainty| / |value|  (0 se valueAbs ≤ 0 ou não-finito)
 *   exceedance = max(rel, mappedPMax) se mappedPMax finito, senão rel
 *
 * Matches _classifyCalculatorUncertainty math @ manager.ts:276-280.
 */
export function computeExceedanceProbability(
    uncertainty: unknown,
    value: unknown,
    mappedPMax: unknown,
): number {
    const uncertaintyAbs = Math.abs(Number(uncertainty));
    const valueAbs = Math.abs(Number(value));
    const rel =
        Number.isFinite(uncertaintyAbs) && Number.isFinite(valueAbs) && valueAbs > 0
            ? uncertaintyAbs / valueAbs
            : 0;
    const pMaxNum = Number(mappedPMax);
    return Number.isFinite(pMaxNum) ? Math.max(rel, pMaxNum) : rel;
}

/**
 * Type-guard for CalculatorItem shape.
 * Aceita itens vindos de ECBT import / API / localStorage.
 */
export function isValidCalculatorItem(value: unknown): value is CalculatorItem {
    if (!value || typeof value !== 'object') return false;
    const v = value as CalculatorItem;
    if (typeof v.id !== 'string' || v.id.length === 0) return false;
    if (typeof v.label !== 'string') return false;
    if (typeof v.calculation !== 'string') return false;
    if (!Array.isArray(v.filters)) return false;
    return true;
}

/**
 * Validate ReorderDirection input from external source.
 */
export function isValidReorderDirection(value: unknown): value is ReorderDirection {
    return value === 'up' || value === 'down';
}
