// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   CALCULATOR TEMPLATES PURE (Module C extraction — refactor-opportunities pick)
   ================================================================

   Helpers pure-logic extraídos de core/calculator/manager.ts (fan-in 15).
   Constroem configs de template metrics SEM mutação — manager apenas itera
   e chama addCalculatorItem para cada config retornado. Testáveis sem
   mock de CONFIG/state.

   Pattern Module C campaign (commits 22287c10..ec26c3dc).
   ================================================================ */

type AnyRecord = Record<string, any>;

/**
 * Constrói configs de template para análise de hipótese (2 campaigns).
 * Retorna [] se contaminant ausente ou < 2 campaigns. Determinístico.
 *
 * Cada item:
 *   - label com nome do contaminant + campaign index/total
 *   - filters por family=well + parameter=contaminant + campaign id
 *   - calculation='average', readonly, _templateType='hypothesis'
 */
export function buildHypothesisTemplates(
    contaminant: AnyRecord | null | undefined,
    campaigns: AnyRecord[],
): AnyRecord[] {
    if (!contaminant || !Array.isArray(campaigns) || campaigns.length < 2) return [];
    const name = contaminant.name || contaminant.id;
    const unit = contaminant.defaultUnitId || 'ug_L';
    return [
        {
            label: `[Template] Avg ${name} — Campaign 1`,
            type: 'metric',
            filters: [
                { dimension: 'family', operator: 'is', value: 'well' },
                { dimension: 'parameter', operator: 'is', value: contaminant.id },
                { dimension: 'campaign', operator: 'is', value: campaigns[0]!.id },
            ],
            calculation: 'average',
            unitId: unit,
            color: '#8e44ad',
            readonly: true,
            _templateType: 'hypothesis',
        },
        {
            label: `[Template] Avg ${name} — Campaign ${campaigns.length}`,
            type: 'metric',
            filters: [
                { dimension: 'family', operator: 'is', value: 'well' },
                { dimension: 'parameter', operator: 'is', value: contaminant.id },
                { dimension: 'campaign', operator: 'is', value: campaigns[campaigns.length - 1]!.id },
            ],
            calculation: 'average',
            unitId: unit,
            color: '#8e44ad',
            readonly: true,
            _templateType: 'hypothesis',
        },
    ];
}

/**
 * Constrói configs de template para análise de background vs compliance
 * (4+ wells). Particiona wells na metade — primeira metade vira background,
 * segunda vira compliance.
 *
 * Retorna [] se contaminant ausente ou < 4 wells. Determinístico.
 */
export function buildBackgroundTemplates(
    contaminant: AnyRecord | null | undefined,
    elements: AnyRecord[],
): AnyRecord[] {
    if (!contaminant || !Array.isArray(elements)) return [];
    const wells = elements.filter((e) => e?.family === 'well');
    if (wells.length < 4) return [];
    const half = Math.floor(wells.length / 2);
    const bgWellIds = wells.slice(0, half).map((w) => w.id);
    const cpWellIds = wells.slice(half).map((w) => w.id);
    const name = contaminant.name || contaminant.id;
    const unit = contaminant.defaultUnitId || 'ug_L';
    return [
        {
            label: `[Template] Avg ${name} — Background Wells`,
            type: 'metric',
            filters: [
                { dimension: 'element', operator: 'in', value: bgWellIds },
                { dimension: 'parameter', operator: 'is', value: contaminant.id },
            ],
            calculation: 'average',
            unitId: unit,
            color: '#16a085',
            readonly: true,
            _templateType: 'background',
        },
        {
            label: `[Template] Avg ${name} — Compliance Wells`,
            type: 'metric',
            filters: [
                { dimension: 'element', operator: 'in', value: cpWellIds },
                { dimension: 'parameter', operator: 'is', value: contaminant.id },
            ],
            calculation: 'average',
            unitId: unit,
            color: '#d35400',
            readonly: true,
            _templateType: 'background',
        },
    ];
}

/**
 * Resolve o contaminant default para templates: prefere 'benzene', fallback
 * para primeiro parameter. Retorna null se lista vazia.
 */
export function resolveTemplateContaminant(parameters: AnyRecord[]): AnyRecord | null {
    if (!Array.isArray(parameters) || parameters.length === 0) return null;
    return parameters.find((p) => p?.id === 'benzene') || parameters[0] || null;
}

/**
 * Filtra items removendo templates de um tipo específico. Pure — usada
 * antes de re-adicionar templates atualizados.
 */
export function filterOutTemplatesByType(items: AnyRecord[], templateType: string): AnyRecord[] {
    if (!Array.isArray(items)) return [];
    return items.filter((i) => !(i?.readonly && i?._templateType === templateType));
}
