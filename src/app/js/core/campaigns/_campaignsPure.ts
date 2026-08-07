// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (core/campaigns/manager).
//
// Aplicação direta da recomendação #2 do scripts/refactor-opportunities.mjs:
// core/campaigns/manager.ts tem fan-in 49 no maior SCC (3× maior que qualquer
// extração anterior). Esta é a maior alavanca de Module C remanescente.
//
// DEDUP identificada: shape de plannedReadings normalization duplicada em
// normalizeCampaign (linhas 59-66) e addPlannedReading (linhas 132-139) — 7 fields
// idênticos. Extração resolve dupe + libera 9+ pure helpers para callers.
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. Segue padrão dos commits anteriores
// (22287c10 + ba7cf7ab + f014da01 + 9aeb47b4).
//
// Spec NOT:
// - NÃO ler module state (campaigns[] — caller passa array)
// - NÃO chamar createId/Date.now — caller injeta id e today (DI clock)
// - NÃO chamar requireOwnershipPermission — caller orquestra auth
// - NÃO chamar getCampaignById — operations recebem campaign por ref
// - NÃO emoji
//
// Extracted helpers:
//   - PlannedReading / CampaignLike  (canonical types)
//   - CampaignCompleteness            (return shape)
//   - CAMPAIGN_DEFAULTS               (frozen color/visible)
//   - createCampaignId(counter)        pure ID gen → {id, nextCounter}
//   - normalizePlannedReading(reading) pure factory (DEDUP × 2 call sites)
//   - normalizeCampaignShape(c, fallbackId, fallbackName, today)
//   - addPlannedReadingToCampaign(campaign, reading)  pure mutate (returns campaign ref)
//   - updatePlannedReadingField(campaign, index, field, value)  pure
//   - removePlannedReadingAt(campaign, index)        pure → boolean
//   - computeCampaignCompleteness(campaign, allElements)  pure scoring
//   - serializeCampaignsArray(campaigns)             pure deep copy
//   - importCampaignsArray(imported, nameTemplate)   pure normalize + counter
//   - isValidCampaignShape(value)                    type-guard
//   - getTodayDateIso()                              helper (uses Date — pure-ish)

export interface PlannedReading {
    elementId: string | null;
    parameterId: string | null;
    x: number | null;
    y: number | null;
    z: number | null;
    expectedValue: number | null;
}

export interface CampaignLike {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    color: string;
    visible: boolean;
    plannedReadings: PlannedReading[];
    costs: unknown | null;
    [key: string]: unknown;
}

export interface CampaignCompletenessDetail {
    elementId: string | null;
    parameterId: string | null;
    executed: boolean;
}

export interface CampaignCompleteness {
    planned: number;
    executed: number;
    ratio: number;
    details: CampaignCompletenessDetail[];
}

export type PlannedReadingField = 'elementId' | 'parameterId' | 'x' | 'y' | 'z' | 'expectedValue';

/**
 * Frozen defaults para Campaign (sem id/name/dates — caller injeta).
 * Matches normalizeCampaign defaults @ campaigns/manager.ts:49-69.
 */
export const CAMPAIGN_DEFAULTS: Readonly<{ color: string; visible: boolean }> = Object.freeze({
    color: '#3b6bff',
    visible: true,
});

/**
 * Pure ID generator — returns next id and updated counter.
 * Matches createId @ campaigns/manager.ts:44-47 (mas pure).
 */
export function createCampaignId(counter: number): { id: string; nextCounter: number } {
    const safe = Number.isFinite(counter) && counter >= 0 ? Math.floor(counter) : 0;
    const next = safe + 1;
    return { id: `campaign-${next}`, nextCounter: next };
}

/**
 * Get today's date in ISO date-only (YYYY-MM-DD).
 * Helper para callers que não querem montar Date.toISOString().slice(0,10) repetido.
 */
export function getTodayDateIso(): string {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Pure factory para PlannedReading.
 * DEDUP: chamado por normalizeCampaign (linhas 59-66) E addPlannedReading
 * (linhas 132-139) — shape idêntico × 2 call sites.
 *
 * Garante: elementId/parameterId default null, x/y/z/expectedValue ?? null.
 */
export function normalizePlannedReading(reading: any): PlannedReading {
    const r = reading || {};
    return {
        elementId: r.elementId || null,
        parameterId: r.parameterId || null,
        x: r.x ?? null,
        y: r.y ?? null,
        z: r.z ?? null,
        expectedValue: r.expectedValue ?? null,
    };
}

/**
 * Normalize campaign shape (DI fallbackId, fallbackName, today).
 * Matches normalizeCampaign @ campaigns/manager.ts:49-69 (mas pure — sem createId
 * side-effect; caller decide id via createCampaignId).
 */
export function normalizeCampaignShape(
    campaign: Partial<CampaignLike> | null | undefined,
    fallbackId: string,
    fallbackName: string,
    today: string = getTodayDateIso(),
): CampaignLike {
    const c = campaign || {};
    return {
        id: typeof c.id === 'string' && c.id.length > 0 ? c.id : fallbackId,
        name: typeof c.name === 'string' && c.name.length > 0 ? c.name : fallbackName,
        startDate: typeof c.startDate === 'string' && c.startDate.length > 0 ? c.startDate : today,
        endDate: typeof c.endDate === 'string' ? c.endDate : '',
        color: typeof c.color === 'string' && c.color.length > 0 ? c.color : CAMPAIGN_DEFAULTS.color,
        visible: c.visible !== false,
        plannedReadings: Array.isArray(c.plannedReadings)
            ? c.plannedReadings.map((r) => normalizePlannedReading(r))
            : [],
        costs: c.costs ?? null,
    };
}

/**
 * Pure-ish mutate: append reading to campaign.plannedReadings.
 * Garante que plannedReadings exista como array. Retorna campaign ref.
 *
 * Matches addPlannedReading body @ campaigns/manager.ts:128-141.
 */
export function addPlannedReadingToCampaign(
    campaign: CampaignLike,
    reading: any,
): CampaignLike {
    if (!Array.isArray(campaign.plannedReadings)) {
        campaign.plannedReadings = [];
    }
    campaign.plannedReadings.push(normalizePlannedReading(reading));
    return campaign;
}

/**
 * Pure-ish mutate: update field of planned reading at index.
 * Returns true se atualizou, false se index inválido.
 *
 * Matches updatePlannedReading body @ campaigns/manager.ts:152-157.
 */
export function updatePlannedReadingField(
    campaign: CampaignLike,
    index: number,
    field: PlannedReadingField,
    value: unknown,
): boolean {
    const reading = campaign?.plannedReadings?.[index];
    if (!reading) return false;
    (reading as any)[field] = value;
    return true;
}

/**
 * Pure-ish mutate: remove planned reading at index.
 * Returns true se removeu, false se index out-of-range.
 *
 * Matches removePlannedReading body @ campaigns/manager.ts:166-172.
 */
export function removePlannedReadingAt(campaign: CampaignLike, index: number): boolean {
    if (!Array.isArray(campaign?.plannedReadings)) return false;
    if (index < 0 || index >= campaign.plannedReadings.length) return false;
    campaign.plannedReadings.splice(index, 1);
    return true;
}

/**
 * Pure compute: campaign completeness (planned vs executed).
 * Caller passa allElements (do getAllElements externo).
 *
 * Matches getCampaignCompleteness @ campaigns/manager.ts:183-207 (já era pure).
 */
export function computeCampaignCompleteness(
    campaign: CampaignLike | null | undefined,
    allElements: ReadonlyArray<any>,
): CampaignCompleteness {
    const empty: CampaignCompleteness = { planned: 0, executed: 0, ratio: 0, details: [] };
    if (!campaign?.plannedReadings?.length) return empty;
    const executedSet = new Set<string>();
    for (const el of allElements) {
        const obs = el?.data?.observations || [];
        for (const o of obs) {
            if (o.campaignId === campaign.id && o.parameterId && o.value != null) {
                executedSet.add(`${el.id}::${o.parameterId}`);
            }
        }
    }
    const details: CampaignCompletenessDetail[] = campaign.plannedReadings.map((pr) => ({
        elementId: pr.elementId,
        parameterId: pr.parameterId,
        executed:
            !!pr.elementId && !!pr.parameterId
                ? executedSet.has(`${pr.elementId}::${pr.parameterId}`)
                : false,
    }));
    const executed = details.filter((d) => d.executed).length;
    const planned = campaign.plannedReadings.length;
    const ratio = planned > 0 ? executed / planned : 0;
    return { planned, executed, ratio, details };
}

/**
 * Pure deep copy for export (cada campaign + plannedReadings clonados).
 * Matches exportCampaigns @ campaigns/manager.ts:211-214 (pure version).
 */
export function serializeCampaignsArray(
    campaigns: ReadonlyArray<CampaignLike>,
): CampaignLike[] {
    return campaigns.map((c) => ({
        ...c,
        plannedReadings: Array.isArray(c.plannedReadings)
            ? c.plannedReadings.map((r) => ({ ...r }))
            : [],
        costs: c.costs ?? null,
    }));
}

/**
 * Pure import: normalize array of imported campaigns.
 * Non-array → {array: [], counter: 0}.
 *
 * Matches importCampaigns @ campaigns/manager.ts:215-223 (pure version).
 */
export function importCampaignsArray(
    imported: unknown,
    nameTemplate: (index: number) => string = (i) => `Campanha ${i + 1}`,
    today: string = getTodayDateIso(),
): { array: CampaignLike[]; counter: number } {
    if (!Array.isArray(imported)) return { array: [], counter: 0 };
    let counter = 0;
    const array = imported.map((raw: any) => {
        counter += 1;
        return normalizeCampaignShape(
            raw,
            `campaign-${counter}`,
            nameTemplate(counter - 1),
            today,
        );
    });
    return { array, counter };
}

/**
 * Type-guard for CampaignLike shape (boundary validation).
 */
export function isValidCampaignShape(value: unknown): value is CampaignLike {
    if (!value || typeof value !== 'object') return false;
    const c = value as CampaignLike;
    if (typeof c.id !== 'string' || c.id.length === 0) return false;
    if (typeof c.name !== 'string') return false;
    return true;
}

/**
 * Validate PlannedReadingField string (allowlist).
 */
export function isValidPlannedReadingField(value: unknown): value is PlannedReadingField {
    return (
        value === 'elementId' ||
        value === 'parameterId' ||
        value === 'x' ||
        value === 'y' ||
        value === 'z' ||
        value === 'expectedValue'
    );
}
