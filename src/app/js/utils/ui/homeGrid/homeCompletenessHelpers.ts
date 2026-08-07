// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * homeCompletenessHelpers.ts - Pure helpers for the Home completeness checker.
 *
 * Extracted per SPLIT-HOMEGRID-001 from app/js/utils/ui/homeGrid.js.
 * PURE LOGIC: no DOM, no network, no module state. The previous
 * computeCompleteness() closure read elements/campaigns via closure helpers
 * and t() from the i18n module; this version receives those as injected
 * dependencies, mirroring the homeQuickAccess DI pattern.
 *
 * Logica pura de completude do modelo: dados os elementos, campanhas e um
 * tradutor, calcula o score e a lista de lacunas (gaps). Sem efeitos
 * colaterais — facil de testar isoladamente. Comportamento byte-identico
 * a versao monolitica.
 */

export type CompletenessSeverity = 'info' | 'warning';

export interface CompletenessGap {
    id: string;
    msg: string;
    handler: string;
    severity: CompletenessSeverity;
}

export interface CompletenessResult {
    score: number;
    total: number;
    gaps: CompletenessGap[];
}

interface ModelElement {
    family?: unknown;
    data?: {
        observations?: unknown[];
        coordinates?: { easting?: unknown; northing?: unknown } | null;
        position?: { x?: unknown; z?: unknown } | null;
        // VISION-UX-001 RF-1: geometrias alternativas reconhecidas pelo
        // check de coordenadas (plume/boundary/river/stratum).
        center?: { x?: unknown; z?: unknown } | null;
        vertices?: unknown[] | null;
        path?: unknown[] | null;
        extent?: unknown;
    } | null;
}

interface CompletenessDeps {
    getElements?: () => ModelElement[];
    getCampaigns?: () => unknown[];
    t?: (key: string) => string;
}

const _identityTranslate = (key: string): string => key;

/**
 * D20: Completeness Checker - analisa o modelo e retorna gaps.
 * Usado pelo home grid (sugestao) e pelo toast pos-import.
 *
 * Avalia 6 criterios (elementos, campanhas, observacoes, coordenadas,
 * boundary, serie temporal) e retorna o score mais as lacunas sugeridas.
 *
 * @param deps Injected dependencies (elements/campaigns getters + translator).
 */
export function computeCompleteness(deps: CompletenessDeps = {}): CompletenessResult {
    const getElements = typeof deps.getElements === 'function' ? deps.getElements : (): ModelElement[] => [];
    const getCampaigns = typeof deps.getCampaigns === 'function' ? deps.getCampaigns : (): unknown[] => [];
    const t = typeof deps.t === 'function' ? deps.t : _identityTranslate;

    const els = getElements();
    const camps = getCampaigns();
    const gaps: CompletenessGap[] = [];
    let score = 0;
    const total = 6; // criterios avaliados

    // 1. Tem elementos?
    if (els.length === 0) {
        gaps.push({
            id: 'no-elements',
            msg: t('homeSuggestCreate') || 'Get started by creating your first model',
            handler: 'handleOpenIngestionModal',
            severity: 'warning',
        });
    } else {
        score++;
    }

    // 2. Tem campanhas?
    if (els.length > 0 && camps.length === 0) {
        gaps.push({
            id: 'no-campaigns',
            msg: t('homeSuggestCampaign') || 'Add a monitoring campaign to your model',
            handler: 'handleAddCampaign',
            severity: 'warning',
        });
    } else if (camps.length > 0) {
        score++;
    }

    // 3. Elementos tem observacoes?
    const withObs = els.filter((e) => {
        const obs = e?.data?.observations;
        return Array.isArray(obs) && obs.length > 0;
    }).length;
    if (els.length > 0 && withObs === 0) {
        gaps.push({
            id: 'no-observations',
            msg: (t('gapNoObs') || '{count} elements without observations. Import monitoring data.').replace(
                '{count}',
                String(els.length),
            ),
            handler: 'handleOpenIngestionModal',
            severity: 'warning',
        });
    } else if (withObs > 0) {
        score++;
    }

    // 4. Elementos tem coordenadas?
    // VISION-UX-001 RF-1 (claude - adm 2026-06-11): o check antigo só
    // reconhecia coordinates/position PONTUAIS e contava como pendência
    // famílias com geometria própria (plume.center, boundary/area.vertices,
    // river/route_flow.path, stratum.extent) e famílias não-espaciais
    // (containers site_*, incident, intangible, generic, post) — modelo
    // random recém-gerado acusava "29 elementos sem coordenadas" falsos
    // (diagnóstico empírico: 23/26 eram legítimos). Evidência:
    // tests/screenshots/journey/01c-pos-termos.png.
    const NON_SPATIAL_FAMILIES = new Set([
        'site_project', 'site_area', 'site_zone',
        'incident', 'intangible', 'generic', 'post',
    ]);
    const spatialEls = els.filter((e) => !NON_SPATIAL_FAMILIES.has(String(e?.family ?? '')));
    const withCoords = spatialEls.filter((e) => {
        const d = e?.data || {};
        const c = d.coordinates;
        const p = d.position;
        return (
            (c && (c.easting || c.northing)) ||
            (p && (p.x || p.z)) ||
            (d.center && (d.center.x || d.center.z)) ||
            (Array.isArray(d.vertices) && d.vertices.length > 0) ||
            (Array.isArray(d.path) && d.path.length > 0) ||
            d.extent != null
        );
    }).length;
    const noCoords = spatialEls.length - withCoords;
    if (els.length > 0 && noCoords > 0) {
        gaps.push({
            id: 'missing-coords',
            msg: (t('gapMissingCoords') || '{count} elements without coordinates').replace('{count}', String(noCoords)),
            handler: 'handleOpenIngestionModal',
            severity: 'info',
        });
    } else if (els.length > 0) {
        score++;
    }

    // 5. Tem boundary definido?
    const hasBoundary = els.some((e) => e?.family === 'boundary');
    if (els.length >= 3 && !hasBoundary) {
        gaps.push({
            id: 'no-boundary',
            msg: t('gapNoBoundary') || 'No site boundary defined. Import a shapefile or create manually.',
            handler: 'handleOpenSpatialModal',
            severity: 'info',
        });
    } else if (hasBoundary) {
        score++;
    }

    // 6. Mais de 1 campanha (serie temporal)?
    if (camps.length >= 2) {
        score++;
    } else if (camps.length === 1 && els.length > 0) {
        gaps.push({
            id: 'single-campaign',
            msg: t('gapSingleCampaign') || 'Only 1 campaign. Import more for trend analysis (Mann-Kendall).',
            handler: 'handleOpenIngestionModal',
            severity: 'info',
        });
    }

    return { score, total, gaps };
}
