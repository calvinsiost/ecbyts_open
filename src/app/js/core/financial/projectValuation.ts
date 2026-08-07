// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ENV-VAL-001 — Project Valuation Engine

   Motor financeiro canônico extraído de utils/handlers/macCurve.js
   (_recalcProject + _recalcProjectVariable). Consumidores:
   - MAC Curve (legado, via wrapper em macCurve.js)
   - Environmental Valuation panel (ENV-VAL-001)
   - Impact Estimator (P1-2, usa como driver de cenário com incerteza)

   Fórmulas:
     VPL   = CAPEX + Σ (annual cashflow / (1+r)^t)   para t=1..n
     CRF   = r(1+r)^n / ((1+r)^n - 1)
     VPLA  = VPL × CRF

   Unidade: BRL (ou qualquer moeda consistente). `r` é taxa anual decimal
   (0.10 = 10%). `n` é número de períodos.
   ================================================================ */

/**
 * Capital Recovery Factor - CRF = r(1+r)^n / ((1+r)^n - 1).
 * Retorna 1/n quando r=0 (fluxos constantes sem desconto).
 * @param r taxa anual decimal (0.10 = 10%)
 * @param n número de períodos
 */
export function crf(r: number, n: number): number {
    const rate = Number(r);
    const periods = Number(n);
    if (!Number.isFinite(rate) || !Number.isFinite(periods) || periods <= 0) return 1;
    if (rate <= 0) return 1 / periods;
    const factor = Math.pow(1 + rate, periods);
    return (rate * factor) / (factor - 1);
}

/**
 * Computa VPL + VPLA de projeto com fluxos constantes (CAPEX + OPEX + receita anual).
 *
 * Convenção de sinal:
 * - CAPEX: normalmente negativo (saída inicial) ou positivo se representa
 *   saída financeira já absoluta. Cliente define.
 * - OPEX: negativo (saída)
 * - Revenue: positivo (entrada)
 */
export function computeProjectValuation({
    capex = 0,
    opex = 0,
    revenue = 0,
    periods = 1,
    discountRate = 0,
}: { capex?: number; opex?: number; revenue?: number; periods?: number; discountRate?: number } = {}): {
    vpl: number;
    vpla: number;
    crf: number;
    annualFlow: number;
} {
    const r = Number(discountRate) || 0;
    const n = Number(periods) || 1;
    const cx = Number(capex) || 0;
    const annual = (Number(opex) || 0) + (Number(revenue) || 0);

    let vpl = cx;
    for (let t = 1; t <= n; t++) {
        vpl += annual / Math.pow(1 + r, t);
    }

    const c = crf(r, n);
    const vpla = vpl * c;

    return { vpl, vpla, crf: c, annualFlow: annual };
}

/**
 * Computa VPL + VPLA com fluxos variáveis por período.
 * Convenção Excel NPV: primeiro fluxo descontado em t=1.
 */
export function computeProjectValuationVariable({
    cashflows = [],
    discountRate = 0,
}: { cashflows?: Array<number | { flow: number; reduction?: number }>; discountRate?: number } = {}): {
    vpl: number;
    vpla: number;
    crf: number;
    periods: number;
    totalReduction: number;
    avgReduction: number;
} {
    const r = Number(discountRate) || 0;
    const flows = Array.isArray(cashflows) ? cashflows : [];
    const n = flows.length;

    let vpl = 0;
    let totalReduction = 0;
    let periodsWithReduction = 0;

    for (let ti = 0; ti < flows.length; ti++) {
        const entry = flows[ti];
        const flow = typeof entry === 'number' ? entry : Number(entry?.flow) || 0;
        const reduction = typeof entry === 'number' ? 0 : Number(entry?.reduction) || 0;
        vpl += flow / Math.pow(1 + r, ti + 1);
        if (reduction > 0) {
            totalReduction += reduction;
            periodsWithReduction++;
        }
    }

    const c = crf(r, n);
    const vpla = vpl * c;
    const avgReduction = periodsWithReduction > 0 ? totalReduction / periodsWithReduction : 0;

    return { vpl, vpla, crf: c, periods: n, totalReduction, avgReduction };
}

/**
 * Agrega valuation de N projetos (para card HUD do painel ENV-VAL).
 */
export function aggregateProjectValuations(
    projects: Array<{ vpl: number; name?: string; category?: string }> = [],
): { totalVpl: number; count: number; byCategory: Record<string, number> } {
    const safe = Array.isArray(projects) ? projects : [];
    let totalVpl = 0;
    const byCategory: Record<string, number> = {};
    for (const p of safe) {
        const v = Number(p?.vpl) || 0;
        totalVpl += v;
        const cat = p?.category || 'uncategorized';
        byCategory[cat] = (byCategory[cat] || 0) + v;
    }
    return { totalVpl, count: safe.length, byCategory };
}

// ──────────────────────────────────────────────────────────────────────────
// ENV-VAL-001 Phase 3 - Schema de entidade "projeto ambiental"
//
// Add `category` field ao schema de medida do MAC Curve sem quebrar snapshots
// antigos (backward compat). Categorias correspondem aos tipos de valoração
// ambiental identificados no roadmap §4.11 (solar/REDD+/groundwater/carbon/custom).
// ──────────────────────────────────────────────────────────────────────────

/**
 * Registry canônico de categorias de projeto ambiental.
 * Cada categoria mapeia para um domínio de valoração e label i18n.
 */
// SVG icon names - resolvidos via core/ui/icons.js (sem emoji/glyph textual).
// Calvin 2026-04-20: "sem icons, com svg" - PROJECT_CATEGORIES passa a declarar
// svgIcon (nome canônico do catálogo), não string visual. UI layer renderiza.
export const PROJECT_CATEGORIES: Readonly<Record<string, { label: string; svgIcon: string; i18nKey: string }>> =
    Object.freeze({
        solar: { label: 'Solar PV', svgIcon: 'solar-panel', i18nKey: 'envVal.category.solar' },
        wind: { label: 'Wind Energy', svgIcon: 'wind', i18nKey: 'envVal.category.wind' },
        carbon_credit: { label: 'Carbon Credit', svgIcon: 'carbon', i18nKey: 'envVal.category.carbonCredit' },
        redd: { label: 'REDD+', svgIcon: 'forest', i18nKey: 'envVal.category.redd' },
        groundwater: { label: 'Aquifer Exploitation', svgIcon: 'water-drop', i18nKey: 'envVal.category.groundwater' },
        reforestation: { label: 'Reforestation', svgIcon: 'tree', i18nKey: 'envVal.category.reforestation' },
        waste_diversion: { label: 'Waste Diverted', svgIcon: 'recycle', i18nKey: 'envVal.category.wasteDiversion' },
        remediation: { label: 'Remediation', svgIcon: 'wrench', i18nKey: 'envVal.category.remediation' },
        custom: { label: 'Custom', svgIcon: 'tag', i18nKey: 'envVal.category.custom' },
    });

/**
 * Categoria default quando medida não tem `category` explícita.
 * Snapshots antigos (pré-ENV-VAL-001 Phase 3) são tratados como `custom`.
 */
export const DEFAULT_PROJECT_CATEGORY: string = 'custom';

/**
 * Valida se categoria está no registry canônico.
 */
export function isValidCategory(category: string): boolean {
    if (!category || typeof category !== 'string') return false;
    return Object.prototype.hasOwnProperty.call(PROJECT_CATEGORIES, category);
}

/**
 * Normaliza medida (measure) do MAC Curve para schema de projeto ambiental.
 *
 * Backward-compat: snapshots antigos sem `category` ganham default `custom`.
 * Campos desconhecidos são preservados (shallow copy com defaults aplicados
 * apenas em `category` e metadata).
 *
 * @param measure - Measure do MAC Curve (pode ser parcial / legado)
 * @returns Measure normalizada com shape canônico ENV-VAL-001
 */
export function normalizeEnvironmentalProject(measure: Record<string, any>): Record<string, any> {
    if (!measure || typeof measure !== 'object') {
        return {
            category: DEFAULT_PROJECT_CATEGORY,
            included: false,
            envValuation: null,
        };
    }

    const rawCategory = measure.category;
    const category = isValidCategory(rawCategory) ? rawCategory : DEFAULT_PROJECT_CATEGORY;

    return {
        ...measure,
        category,
        included: measure.included !== false,
        envValuation: measure.envValuation || null,
    };
}

/**
 * Filtra medidas que são "projetos ambientais" (category declarada e !== custom,
 * ou flagged explicitamente via `measure.isEnvironmentalProject === true`).
 * Usado pelo subgrupo Project > Valoração Ambiental para exibir apenas o subset.
 *
 * @param measures - Lista de measures do MAC Curve
 */
export function filterEnvironmentalProjects(measures: Array<Record<string, any>>): Array<Record<string, any>> {
    if (!Array.isArray(measures)) return [];
    return measures.filter((m) => {
        if (!m) return false;
        if (m.isEnvironmentalProject === true) return true;
        const cat = m.category;
        return isValidCategory(cat) && cat !== DEFAULT_PROJECT_CATEGORY;
    });
}

/**
 * Agrega VPL por categoria para narrativa executiva no HUD.
 * Usa `aggregateProjectValuations` internamente + normaliza measures antes.
 *
 * @param measures - Lista de measures (precisa ter `vpl` e `category`)
 */
export function aggregateEnvironmentalProjects(measures: Array<Record<string, any>>): {
    totalVpl: number;
    count: number;
    byCategory: Record<string, number>;
    activeCategories: string[];
} {
    const projects = filterEnvironmentalProjects(measures).map(normalizeEnvironmentalProject) as Array<{
        vpl: number;
        category?: string;
    }>;
    const agg = aggregateProjectValuations(projects);
    return {
        ...agg,
        activeCategories: Object.keys(agg.byCategory).filter((c) => c !== DEFAULT_PROJECT_CATEGORY),
    };
}
