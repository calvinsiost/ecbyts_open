// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Provenance Mask View-Model — F2 pure helpers
// (SPEC_REPORT_AI_HUMAN_PROVENANCE_MASK)
//
// View-model puro consumido pela integração F3 com `utils/report/overlay.js`.
// NÃO duplica o motor de proveniência: CONSOME a saída de
// `getReportProvenance(store)` (regions+summary). Apenas organiza para
// renderização do overlay máscara + badge resumo + filtro de visibilidade.
//
// Princípios:
// - Sem DOM, sem rede, determinístico.
// - Não-só-cor: cada autoria tem `icon` + `pattern` distintos (A11y).
// - Filtro materiality-aware: incidental NÃO entra na máscara (BP4).
// - Privacy-aware: nunca consome `aiPromptInformation` no view-model
//   (consumer pode usar `toDisclosureMetadata` p/ export — separado).

/** Padrões CSS de hachura/contorno por autoria (não-só-cor). */
const MASK_PATTERNS = Object.freeze({
    human: { icon: '·', pattern: 'solid', tone: 'neutral' },
    ai: { icon: '◆', pattern: 'outlined', tone: 'ai' },
    mixed: { icon: '◉', pattern: 'hatched', tone: 'mixed' },
});

/** Filtros de visibilidade suportados pelo painel. */
const VISIBILITY_FILTERS = Object.freeze(['all', 'ai', 'human', 'mixed']);

/**
 * Resolve padrão de máscara (não-só-cor) p/ uma autoria.
 *
 * @param {string|null} authorship  'human'|'ai'|'mixed'
 * @returns {{icon:string, pattern:string, tone:string, labelKey:string}}
 */
export function resolveMaskPattern(authorship: any) {
    const p = (MASK_PATTERNS as Record<string,any>)[authorship] || MASK_PATTERNS.human;
    return {
        icon: p.icon,
        pattern: p.pattern,
        tone: p.tone,
        labelKey: `report.prov.mask.${(MASK_PATTERNS as Record<string,any>)[authorship] ? authorship : 'human'}`,
    };
}

/**
 * Constrói o view-model das regiões mascaradas a partir do output de
 * `getReportProvenance(store)`. Confia inteiramente no motor (BP4): se a
 * IA contribuiu de forma incidental, o motor já classifica a região como
 * 'human' — não há necessidade de re-julgar materialidade aqui.
 *
 * @param {{regions: Array, summary?: Object}} reportProvenance
 *   Saída de provenanceModel.getReportProvenance.
 * @param {{filter?: 'all'|'ai'|'human'|'mixed'}} [opts]
 * @returns {{regions: Array<{id:string, authorship:string, material:boolean,
 *   included:boolean, mask:Object}>, total:number, visibleCount:number}}
 */
export function buildMaskRegions(reportProvenance: any, opts: any) {
    if (!reportProvenance || typeof reportProvenance !== 'object') {
        throw new TypeError('buildMaskRegions: reportProvenance must be object');
    }
    const regions = Array.isArray(reportProvenance.regions) ? reportProvenance.regions : [];
    const filter = (opts && opts.filter) || 'all';
    if (!VISIBILITY_FILTERS.includes(filter)) {
        throw new TypeError(`buildMaskRegions: filter must be one of ${VISIBILITY_FILTERS.join(',')}`);
    }
    let visibleCount = 0;
    const out = regions.map((r: any) => {
        const authorship = r.authorship || 'human';
        const material = r.material !== false;
        const included = filter === 'all' || filter === authorship;
        if (included) visibleCount += 1;
        return {
            id: r.id,
            authorship,
            material,
            included,
            mask: resolveMaskPattern(authorship),
        };
    });
    return { regions: out, total: regions.length, visibleCount };
}

/**
 * View-model do badge resumo (X% IA / Y% humano / Z% mixed).
 *
 * Consome diretamente `summary` de `getReportProvenance`. NÃO recalcula
 * percentuais (delegação total ao motor). Arredonda para 1 decimal apenas
 * na camada de view (motor permanece float).
 *
 * @param {{summary?: {aiPct:number, humanPct:number, mixedPct:number}}} reportProvenance
 * @returns {{ai:{pct:number, labelKey:string, mask:Object},
 *   human:{pct:number, labelKey:string, mask:Object},
 *   mixed:{pct:number, labelKey:string, mask:Object}}}
 */
export function buildProvenanceSummaryBadge(reportProvenance: any) {
    if (!reportProvenance || typeof reportProvenance !== 'object') {
        throw new TypeError('buildProvenanceSummaryBadge: reportProvenance must be object');
    }
    const s = reportProvenance.summary || { aiPct: 0, humanPct: 0, mixedPct: 0 };
    const round1 = (n: any) => Math.round((Number(n) || 0) * 10) / 10;
    return {
        ai: {
            pct: round1(s.aiPct),
            labelKey: 'report.prov.summary.ai',
            mask: resolveMaskPattern('ai'),
        },
        human: {
            pct: round1(s.humanPct),
            labelKey: 'report.prov.summary.human',
            mask: resolveMaskPattern('human'),
        },
        mixed: {
            pct: round1(s.mixedPct),
            labelKey: 'report.prov.summary.mixed',
            mask: resolveMaskPattern('mixed'),
        },
    };
}

/**
 * Aplica filtro de visibilidade a uma lista de regiões previamente
 * construída por `buildMaskRegions`. Útil quando o consumer quer
 * re-filtrar sem reconstruir o view-model inteiro (ex.: toggle no UI).
 *
 * @param {Array<{authorship:string, material:boolean, included:boolean}>} regions
 * @param {'all'|'ai'|'human'|'mixed'} regions
 * @returns {Array}
 */
export function applyVisibilityFilter(regions: any, filter: any) {
    if (!Array.isArray(regions)) {
        throw new TypeError('applyVisibilityFilter: regions must be array');
    }
    if (!VISIBILITY_FILTERS.includes(filter)) {
        throw new TypeError(`applyVisibilityFilter: filter must be one of ${VISIBILITY_FILTERS.join(',')}`);
    }
    return regions.map((r: any) => ({ ...r, included: filter === 'all' || filter === r.authorship }));
}

/** Públicos: padrões + filtros suportados (úteis em testes/consumer). */
export const MASK_PATTERN_TABLE = MASK_PATTERNS;
export const MASK_FILTERS = VISIBILITY_FILTERS;
