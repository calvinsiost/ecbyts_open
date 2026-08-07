// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import {
    FIGURE_CATALOG,
    getFigureType,
    type FigureType,
    type SubsetFilterDim,
} from '../../core/report/_figureCatalog.js';

export type FigureSelectCandidateInput = {
    readonly providerId: string;
    readonly providerLabel?: string;
    readonly candidateId?: string;
    readonly label?: string;
    readonly scope?: unknown;
};

export type FigureSelectCandidateVM = FigureSelectCandidateInput & {
    readonly catalogFigureTypeId: string | null;
    readonly catalogFigureTitle: string | null;
    readonly catalogRegulatoryLabel: string | null;
    readonly catalogSubset: Readonly<Record<string, string>>;
    readonly defaultChecked: boolean;
};

export type CatalogGapRow = {
    readonly figureTypeId: string;
    readonly title: string;
    readonly reason: 'missing-renderer' | 'missing-model-data';
    readonly subset: Readonly<Record<string, string>>;
    readonly label: string;
};

export type FigureSelectCatalogView = {
    readonly candidates: ReadonlyArray<FigureSelectCandidateVM>;
    readonly gaps: ReadonlyArray<CatalogGapRow>;
};

const DEFAULT_CHECKED_FIGURE_IDS = Object.freeze(['A2', 'B1', 'C1', 'D1', 'E2']);
const NON_CONTAMINANT_PARAMETER_IDS = Object.freeze([
    'hydraulic_head',
    'piezometric_head',
    'water_level',
]);

const PROVIDER_TO_FIGURE_ID = Object.freeze({
    'radius-500m': 'A2',
    'sample-locations': 'C1',
    'geo-pedo-maps': 'E1',
    'geological-map-2d': 'E1',
    'potentiometric-map': 'E2',
    'source-plant-layout': 'B3',
    'cross-section': 'E3',
    'scene-3d': 'E4',
}) as Readonly<Record<string, string>>;

function cleanText(value: unknown): string | null {
    const text = String(value ?? '').trim();
    return text ? text : null;
}

function regulatoryLabel(entry: FigureType | null): string | null {
    if (!entry) return null;
    if (entry.obrig === 'DD-038-obrig') return 'DD-038 obrigatorio';
    if (entry.obrig === 'DD-038-sugerido') return 'DD-038 sugerido';
    if (entry.obrig === 'ABNT') return 'ABNT';
    return 'opcional';
}

function deriveCatalogSubset(
    candidate: FigureSelectCandidateInput,
    figureTypeId: string | null,
): Readonly<Record<string, string>> {
    if (!figureTypeId) return Object.freeze({});
    const entry = getFigureType(figureTypeId);
    if (!entry) return Object.freeze({});
    const allowed = new Set<string>([...entry.requiredFilters, ...entry.optionalFilters]);
    const subset: Record<string, string> = {};
    if (figureTypeId === 'A2' && allowed.has('raio')) subset.raio = '500m';
    const scope = candidate.scope && typeof candidate.scope === 'object' ? candidate.scope as Record<string, unknown> : {};
    if (allowed.has('area') && typeof scope.groupId === 'string' && scope.groupId.trim()) {
        subset.area = scope.groupId.trim();
    }
    return Object.freeze(subset);
}

function observationList(element: any): ReadonlyArray<any> {
    if (Array.isArray(element?.observations)) return element.observations;
    if (Array.isArray(element?.data?.observations)) return element.data.observations;
    return [];
}

function isContaminantObservation(obs: any): boolean {
    const id = cleanText(obs?.parameterId) || cleanText(obs?.parameter) || '';
    if (NON_CONTAMINANT_PARAMETER_IDS.includes(id.toLowerCase())) return false;
    return !!(cleanText(obs?.parameterName) || cleanText(obs?.parameterId) || cleanText(obs?.parameter) || cleanText(obs?.cas));
}

function collectDomainValues(ctx: any, dim: SubsetFilterDim): ReadonlyArray<string> {
    const out = new Set<string>();
    const elements = Array.isArray(ctx?.elements) ? ctx.elements : [];
    if (dim === 'campanha' && Array.isArray(ctx?.campaigns)) {
        for (const campaign of ctx.campaigns) {
            const value = cleanText(campaign?.name) || cleanText(campaign?.id);
            if (value) out.add(value);
        }
    }
    if (dim === 'area' && Array.isArray(ctx?.groups)) {
        for (const group of ctx.groups) {
            const value = cleanText(group?.name) || cleanText(group?.id);
            if (value) out.add(value);
        }
    }
    for (const element of elements) {
        if (dim === 'matriz') {
            const value = cleanText(element?.data?.matrix) || cleanText(element?.matrix);
            if (value) out.add(value);
        }
        for (const obs of observationList(element)) {
            if (dim === 'contaminante' && !isContaminantObservation(obs)) continue;
            const value =
                dim === 'contaminante'
                    ? cleanText(obs?.parameterName) || cleanText(obs?.parameterId) || cleanText(obs?.parameter) || cleanText(obs?.cas)
                    : dim === 'campanha'
                      ? cleanText(obs?.campaignName) || cleanText(obs?.campaignId) || cleanText(obs?.campaign)
                      : dim === 'matriz'
                        ? cleanText(obs?.matrix)
                        : null;
            if (value) out.add(value);
        }
    }
    return Object.freeze(Array.from(out).sort((a, b) => a.localeCompare(b, 'pt-BR')));
}

function subsetVariants(entry: FigureType, ctx: any): ReadonlyArray<Readonly<Record<string, string>>> {
    if (entry.requiredFilters.length === 0) return Object.freeze([Object.freeze({})]);
    const firstRequired = entry.requiredFilters[0] as SubsetFilterDim | undefined;
    if (!firstRequired) return Object.freeze([Object.freeze({})]);
    const values = collectDomainValues(ctx, firstRequired);
    if (values.length === 0) return Object.freeze([Object.freeze({})]);
    return Object.freeze(values.slice(0, 12).map((value) => Object.freeze({ [firstRequired]: value })));
}

function buildGapRows(availableFigureIds: ReadonlySet<string>, ctx: any): ReadonlyArray<CatalogGapRow> {
    const rows: CatalogGapRow[] = [];
    for (const figureId of DEFAULT_CHECKED_FIGURE_IDS) {
        if (availableFigureIds.has(figureId)) continue;
        const entry = getFigureType(figureId);
        if (!entry) continue;
        const hasMappedProvider = Object.values(PROVIDER_TO_FIGURE_ID).includes(figureId);
        for (const subset of subsetVariants(entry, ctx)) {
            const missingData = entry.requiredFilters.length > 0 && Object.keys(subset).length === 0;
            const suffix = Object.values(subset).filter(Boolean).join(' - ');
            rows.push(
                Object.freeze({
                    figureTypeId: entry.id,
                    title: entry.title,
                    reason: hasMappedProvider || missingData ? 'missing-model-data' : 'missing-renderer',
                    subset,
                    label: suffix ? `${entry.id} - ${entry.title} - ${suffix}` : `${entry.id} - ${entry.title}`,
                }),
            );
        }
    }
    return Object.freeze(rows);
}

export function buildFigureSelectCatalogView(
    candidates: ReadonlyArray<FigureSelectCandidateInput>,
    ctx: any = {},
): FigureSelectCatalogView {
    const availableFigureIds = new Set<string>();
    const defaultCheckedSeen = new Set<string>();
    const enriched = (Array.isArray(candidates) ? candidates : []).map((candidate) => {
        const figureTypeId = PROVIDER_TO_FIGURE_ID[candidate.providerId] ?? null;
        if (figureTypeId) availableFigureIds.add(figureTypeId);
        const entry = figureTypeId ? getFigureType(figureTypeId) : null;
        const shouldDefaultCheck =
            !!figureTypeId &&
            DEFAULT_CHECKED_FIGURE_IDS.includes(figureTypeId) &&
            !defaultCheckedSeen.has(figureTypeId);
        if (figureTypeId && shouldDefaultCheck) defaultCheckedSeen.add(figureTypeId);
        return Object.freeze({
            ...candidate,
            catalogFigureTypeId: figureTypeId,
            catalogFigureTitle: entry?.title ?? null,
            catalogRegulatoryLabel: regulatoryLabel(entry),
            catalogSubset: deriveCatalogSubset(candidate, figureTypeId),
            defaultChecked: shouldDefaultCheck,
        });
    });
    return Object.freeze({
        candidates: Object.freeze(enriched),
        gaps: buildGapRows(availableFigureIds, ctx),
    });
}

export const FIGURE_SELECT_CATALOG_META = Object.freeze({
    catalogSize: FIGURE_CATALOG.length,
    defaultCheckedFigureIds: DEFAULT_CHECKED_FIGURE_IDS,
    mappedProviderCount: Object.keys(PROVIDER_TO_FIGURE_ID).length,
});
