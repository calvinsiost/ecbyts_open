// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Natural Assets — extrai ativos ambientais (capital natural) dos elementos
 * do modelo e monetiza por família, gerando FinancialEntry[] consumível por
 * `computeEcbtScore({ assets, liabilities, ... })`.
 *
 * Calvin 2026-06-07 (F13 deixou aberto): "modelo random tem ativos e passivos,
 * pq não estão sendo computados?" — passivos via buildCostRollup (OPEX+CAPEX),
 * ativos via este módulo (área protegida + corpos d'água + habitat + área verde).
 *
 * Convenção AGPL/ECBT:
 *  - Defaults = 0 (não inventa valor): Calvin configura via NaturalAssetCatalog
 *  - Referências acadêmicas citadas para cada família (TEEB 2010, WWF, ANA)
 *  - Pure-logic: zero side-effects, frozen output, deterministic
 *
 * Referências (defaults editáveis pelo usuário via UI futura):
 *  - TEEB 2010 (UNEP) — ecosystem services 5k-50k USD/ha/ano (~R$ 5–50/m² capital natural)
 *  - WWF Living Planet Report — habitat value baseline
 *  - ANA Resolução 1.245/2024 — outorga uso água ~R$ 0.10/m³
 *  - Lei 9.985/2000 + Decreto 6.848/2009 — SNUC compensação ambiental
 *  - SEEA EA 2021 (UN) — System of Environmental-Economic Accounting
 */

export interface NaturalAssetCatalog {
    /** R$/m² capital natural por família. Default 0 = não monetiza até config. */
    readonly boundary?: number;
    readonly habitat?: number;
    readonly site_area?: number;
    readonly area?: number;
    readonly river?: number;
    readonly lake?: number;
    readonly spring?: number;
    readonly individual?: number;
    /** Override fino: valor BRL fixo por elemento específico (ex: por ID). */
    readonly perElement?: Readonly<Record<string, number>>;
    /** Moeda default — fallback BRL se elemento não declarar. */
    readonly defaultCurrency?: string;
    /** Incerteza fracional default ±X (ex: 0.30 = ±30%). */
    readonly defaultUncertaintyFraction?: number;
}

export interface NaturalAssetEntry {
    readonly value: number;
    readonly currency: string;
    readonly uncertaintyFraction: number;
    readonly label: string;
    readonly elementId?: string | undefined;
    readonly family?: string;
    readonly source: string;
}

interface Vertex2DOr3D {
    readonly x?: number;
    readonly y?: number;
    readonly z?: number;
}

interface ElementShape {
    readonly id?: string;
    readonly family?: string;
    readonly familyId?: string;
    readonly data?: {
        readonly area_m2?: number;
        readonly area?: number;
        readonly volume_m3?: number;
        readonly volume?: number;
        readonly footprint?: { readonly area?: number };
        readonly vertices?: ReadonlyArray<Vertex2DOr3D>;
        readonly path?: ReadonlyArray<Vertex2DOr3D>;
        readonly width?: number;
        readonly naturalAssetValue?: number;     // override BRL direto
        readonly naturalAssetCurrency?: string;
    };
}

const DEFAULT_CATALOG: Required<Omit<NaturalAssetCatalog, 'perElement'>> = Object.freeze({
    boundary: 0,
    habitat: 0,
    site_area: 0,
    area: 0,
    river: 0,
    lake: 0,
    spring: 0,
    individual: 0,
    defaultCurrency: 'BRL',
    defaultUncertaintyFraction: 0.30,
});

const FAMILY_SOURCE_HINTS: Readonly<Record<string, string>> = Object.freeze({
    boundary: 'SNUC Lei 9.985/2000 + Decreto 6.848/2009 — área de preservação',
    habitat: 'WWF Living Planet — habitat biodiversidade',
    site_area: 'TEEB 2010 (UNEP) — ecosystem services do site',
    area: 'TEEB 2010 — área verde/recuperada',
    river: 'ANA Res. 1.245/2024 — outorga hídrica',
    lake: 'ANA Res. 1.245/2024 — outorga hídrica',
    spring: 'ANA Res. 1.245/2024 + Lei 12.651/2012 (APP)',
    individual: 'Lei 12.651/2012 — fauna/flora (capital biótico)',
});

function _elementArea(el: ElementShape): number {
    const d = el.data || {};
    return Number(d.area_m2 || d.area || d.footprint?.area || 0);
}

function _elementVolume(el: ElementShape): number {
    const d = el.data || {};
    return Number(d.volume_m3 || d.volume || 0);
}

function _resolveFamily(el: ElementShape): string {
    return String(el.family || el.familyId || '').toLowerCase();
}

/**
 * Shoelace formula — área de polígono fechado em XZ plane (y=elevation).
 * Aceita vértices 2D ({x,y}) ou 3D ({x,y,z}) — usa x,z se z presente, senão x,y.
 * Retorna valor absoluto (sinal independe de orientação CW/CCW).
 */
function _polygonAreaXZ(vertices: ReadonlyArray<Vertex2DOr3D>): number {
    if (!Array.isArray(vertices) || vertices.length < 3) return 0;
    const useZ = vertices[0]?.z !== undefined;
    let s = 0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % n];
        const ax = Number(a?.x || 0);
        const ay = useZ ? Number(a?.z || 0) : Number(a?.y || 0);
        const bx = Number(b?.x || 0);
        const by = useZ ? Number(b?.z || 0) : Number(b?.y || 0);
        s += ax * by - bx * ay;
    }
    return Math.abs(s) / 2;
}

/**
 * Comprimento total de polyline 2D/3D (sum de distâncias euclidianas entre pontos).
 */
function _pathLength(path: ReadonlyArray<Vertex2DOr3D>): number {
    if (!Array.isArray(path) || path.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        const dx = Number(b?.x || 0) - Number(a?.x || 0);
        const dy = Number(b?.y || 0) - Number(a?.y || 0);
        const dz = Number(b?.z || 0) - Number(a?.z || 0);
        total += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return total;
}

/**
 * Resolve área efetiva por família com fallbacks geométricos:
 *  - boundary/site_area/area/lake/spring: tenta polygon shoelace via data.vertices
 *  - river: comprimento × largura (default 5m) via data.path + data.width
 *  - habitat: usa só area_m2/area/footprint (não tenta inferir)
 *
 * Retorna 0 se nenhum fallback aplicável — caller skip.
 */
function _resolveAreaWithFallback(el: ElementShape, family: string): number {
    const direct = _elementArea(el);
    if (direct > 0) return direct;
    const d = el.data || {};
    if (['boundary', 'site_area', 'area', 'lake', 'spring'].includes(family)) {
        if (Array.isArray(d.vertices) && d.vertices.length >= 3) {
            return _polygonAreaXZ(d.vertices);
        }
    }
    if (family === 'river') {
        if (Array.isArray(d.path) && d.path.length >= 2) {
            const len = _pathLength(d.path);
            const width = Number(d.width || 5); // default 5m
            return len * width;
        }
    }
    return 0;
}

/**
 * Builder principal — itera elementos, monetiza por família via catálogo,
 * retorna FinancialEntry[] direto consumível por computeEcbtScore({ assets }).
 *
 * Logic:
 *  1. Override `data.naturalAssetValue` (BRL fixo) sempre prevalece
 *  2. Override `catalog.perElement[id]` segundo prioridade
 *  3. Família × área (m²) × `catalog[family]` (R$/m²)
 *  4. Volume para corpos d'água (river/lake/spring) se area=0
 *  5. Skip se valor calculado <= 0 (não polui assets[] com zeros)
 */
export function extractNaturalAssets(
    elements: ReadonlyArray<ElementShape>,
    catalog: NaturalAssetCatalog = {},
): NaturalAssetEntry[] {
    if (!Array.isArray(elements) || elements.length === 0) return [];
    const cfg = { ...DEFAULT_CATALOG, ...catalog };
    const perElement = catalog.perElement || {};
    const out: NaturalAssetEntry[] = [];

    for (const el of elements) {
        if (!el || typeof el !== 'object') continue;
        const id = String(el.id || '');
        const family = _resolveFamily(el);
        const data = el.data || {};
        let value = 0;
        let label = '';

        // (1) override BRL direto data.naturalAssetValue
        const dataOverride = Number(data.naturalAssetValue || 0);
        if (dataOverride > 0) {
            value = dataOverride;
            label = `Override direto (${family})`;
        }
        // (2) override perElement
        else if (id && Number(perElement[id] || 0) > 0) {
            value = Number(perElement[id]);
            label = `Override catálogo perElement[${id}]`;
        }
        // (3) família × área × R$/m² (com fallbacks geométricos polygon/path+width)
        else if (family in DEFAULT_CATALOG) {
            const valuePerUnit = Number((cfg as any)[family] || 0);
            if (valuePerUnit > 0) {
                // (3a) individual: per-element (R$/unidade, não R$/m²)
                if (family === 'individual') {
                    value = valuePerUnit;
                    label = `${family} unitário × R$ ${valuePerUnit}/elemento`;
                } else {
                    // (3b) outras famílias: área (direta ou inferida via geometry)
                    const area = _resolveAreaWithFallback(el, family);
                    if (area > 0) {
                        value = area * valuePerUnit;
                        const directLabel = _elementArea(el) > 0 ? '' : ' (inferida via geometry)';
                        label = `${family} × ${area.toFixed(1)} m²${directLabel} × R$ ${valuePerUnit}/m²`;
                    }
                    // (3c) fallback volume p/ corpos d'água quando sem área nem geometry
                    else if (['river', 'lake', 'spring'].includes(family)) {
                        const vol = _elementVolume(el);
                        if (vol > 0) {
                            value = vol * valuePerUnit;
                            label = `${family} volume ${vol.toFixed(1)} m³ × R$ ${valuePerUnit}`;
                        }
                    }
                }
            }
        }

        if (value <= 0) continue;

        const currency = String(data.naturalAssetCurrency || cfg.defaultCurrency);
        const sourceHint = FAMILY_SOURCE_HINTS[family] || 'Capital natural (catálogo customizado)';
        out.push(Object.freeze({
            value,
            currency,
            uncertaintyFraction: cfg.defaultUncertaintyFraction,
            label,
            elementId: id || undefined,
            family,
            source: sourceHint,
        }));
    }

    return out;
}

/**
 * Agregação simples — soma total + breakdown por família.
 * Útil para banner KPI ou export.
 */
export interface NaturalAssetSummary {
    readonly totalValue: number;
    readonly currency: string;
    readonly elementCount: number;
    readonly byFamily: Readonly<Record<string, number>>;
}

export function summarizeNaturalAssets(
    entries: ReadonlyArray<NaturalAssetEntry>,
): NaturalAssetSummary {
    if (!Array.isArray(entries) || entries.length === 0) {
        return Object.freeze({
            totalValue: 0,
            currency: 'BRL',
            elementCount: 0,
            byFamily: Object.freeze({}),
        });
    }
    let totalValue = 0;
    const byFamily: Record<string, number> = {};
    const currency = entries[0].currency || 'BRL';
    for (const e of entries) {
        totalValue += e.value;
        const fam = e.family || 'unknown';
        byFamily[fam] = (byFamily[fam] || 0) + e.value;
    }
    return Object.freeze({
        totalValue,
        currency,
        elementCount: entries.length,
        byFamily: Object.freeze(byFamily),
    });
}
