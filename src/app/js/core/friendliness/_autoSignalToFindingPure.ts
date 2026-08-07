// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   AUTO SIGNAL → FINDING — alimentação automática do friendliness score
   FRIEND-SCORE-001 (Calvin 2026-06-14 "avaliar itens opcionais").

   Insight da avaliação (docs/reports/FRIENDLINESS_OPTIONAL_DIMENSIONS_
   EVAL_2026_06_14.md): além das dimensões SUBJETIVAS (findings catalogados
   à mão), há SINAIS OBJETIVOS que ferramentas geram sozinhas — axe-core
   (a11y/WCAG), Core Web Vitals (LCP/INP/CLS), i18n raw-keys. Estes são o
   futuro do score: automatizam o dataset, alinhando ao North Star (agentic).

   Este módulo é ADITIVO — mapeia um sinal medido → FrictionFinding que o
   _friendlinessScorePure JÁ consome. NÃO toca o core do score (zero
   conflito de merge). Pure, sem DOM, sem rede.

   Refs: axe-core (dequelabs); web.dev Core Web Vitals; arXiv 2507.21504
   (agent eval). Mapeamento de severidade calibrado aos thresholds canônicos
   das próprias ferramentas (Lighthouse/CWV good/needs-improvement/poor).
   ================================================================ */

// Tipo espelhado de _friendlinessScorePure (sem importar — desacoplado).
type FriendlinessDimension =
    | 'learnability'
    | 'efficiency'
    | 'error'
    | 'cognitive'
    | 'delight'
    | 'configurability'
    | 'accessibility'
    | 'agent_experience';
type FrictionSeverity = 'blocker' | 'slows' | 'annoys';

export interface AutoFinding {
    readonly id: string;
    readonly dimension: FriendlinessDimension;
    readonly severity: FrictionSeverity;
    readonly reach: number;
    readonly resolved: boolean;
    readonly section: string;
    readonly note: string;
    /** Marca de proveniência: finding gerado automaticamente, não catalogado. */
    readonly auto: true;
    readonly signal: string;
}

/** axe-core impact → severidade canônica do friendliness. */
const AXE_IMPACT_SEVERITY: Readonly<Record<string, FrictionSeverity>> = Object.freeze({
    critical: 'blocker',
    serious: 'blocker',
    moderate: 'slows',
    minor: 'annoys',
});

export interface AxeViolation {
    readonly id: string;
    readonly impact?: string;
    /** Quantos nós da página afetados. */
    readonly nodes?: number;
    readonly help?: string;
    readonly section?: string;
}

/**
 * axe-core violation → AutoFinding na dimensão `accessibility` (C1).
 * Cada regra WCAG violada vira um finding; impact mapeia a severidade.
 */
export function axeViolationToFinding(v: AxeViolation): AutoFinding {
    const severity = AXE_IMPACT_SEVERITY[String(v?.impact || '').toLowerCase()] ?? 'slows';
    const nodes = typeof v?.nodes === 'number' && v.nodes > 0 ? v.nodes : 1;
    return Object.freeze({
        id: `a11y:${v.id}`,
        dimension: 'accessibility',
        severity,
        // Alcance proxy: mais nós afetados → mais pessoas (cap 4 = todos os tipos).
        reach: Math.min(4, Math.max(1, Math.ceil(nodes / 5))),
        resolved: false,
        section: v.section || 'ui/a11y',
        note: `WCAG: ${v.help || v.id} (${nodes} nó${nodes > 1 ? 's' : ''})`,
        auto: true,
        signal: 'axe-core',
    });
}

/** Métricas Core Web Vitals e seus limiares canônicos (web.dev). */
export type WebVitalMetric = 'LCP' | 'INP' | 'CLS';
interface VitalThreshold {
    good: number;
    poor: number;
    unit: string;
}
export const WEB_VITAL_THRESHOLDS: Readonly<Record<WebVitalMetric, VitalThreshold>> = Object.freeze({
    LCP: { good: 2500, poor: 4000, unit: 'ms' },
    INP: { good: 200, poor: 500, unit: 'ms' },
    CLS: { good: 0.1, poor: 0.25, unit: '' },
});

/**
 * Core Web Vital medido → AutoFinding na dimensão `efficiency` (C3).
 * good → null (sem finding); needs-improvement → slows; poor → blocker.
 * Limiares canônicos web.dev — o "value" decide a severidade objetivamente.
 */
export function webVitalToFinding(metric: WebVitalMetric, value: number): AutoFinding | null {
    const th = WEB_VITAL_THRESHOLDS[metric];
    if (!th || typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (value <= th.good) return null; // bom → sem fricção
    const severity: FrictionSeverity = value > th.poor ? 'blocker' : 'slows';
    const band = value > th.poor ? 'poor' : 'needs-improvement';
    return Object.freeze({
        id: `cwv:${metric}`,
        dimension: 'efficiency',
        severity,
        reach: 4, // performance afeta todos os tipos de usuário
        resolved: false,
        section: 'perf/web-vitals',
        note: `${metric}=${value}${th.unit} (${band}; bom ≤${th.good}${th.unit})`,
        auto: true,
        signal: 'web-vitals',
    });
}

/**
 * Chaves i18n cruas vazando (raw keys) → AutoFinding em `learnability` (C5).
 * count = nº de strings não-traduzidas detectadas. 0 → sem finding.
 */
export function i18nRawKeysToFinding(locale: string, rawKeyCount: number): AutoFinding | null {
    if (typeof rawKeyCount !== 'number' || rawKeyCount <= 0) return null;
    // Muitas chaves cruas = aprendizado quebrado (texto técnico vazando).
    const severity: FrictionSeverity = rawKeyCount >= 20 ? 'blocker' : rawKeyCount >= 5 ? 'slows' : 'annoys';
    return Object.freeze({
        id: `i18n:${locale}`,
        dimension: 'learnability',
        severity,
        reach: 1,
        resolved: false,
        section: 'i18n/translations',
        note: `${rawKeyCount} chave(s) i18n crua(s) vazando em ${locale}`,
        auto: true,
        signal: 'i18n-scan',
    });
}

export interface AutoSignalsInput {
    readonly axeViolations?: ReadonlyArray<AxeViolation>;
    readonly webVitals?: Partial<Record<WebVitalMetric, number>>;
    readonly i18nRawKeys?: Readonly<Record<string, number>>;
}

/**
 * Coletor: agrega todos os sinais objetivos disponíveis em AutoFindings,
 * prontos para concatenar ao dataset manual antes de computeFriendlinessScore.
 * Determinístico; ignora sinais ausentes/bons (degradação graciosa).
 */
export function collectAutoFindings(input: AutoSignalsInput = {}): ReadonlyArray<AutoFinding> {
    const out: AutoFinding[] = [];
    for (const v of input.axeViolations || []) {
        if (v && typeof v.id === 'string') out.push(axeViolationToFinding(v));
    }
    const vitals = input.webVitals || {};
    for (const m of ['LCP', 'INP', 'CLS'] as WebVitalMetric[]) {
        if (m in vitals) {
            const f = webVitalToFinding(m, vitals[m] as number);
            if (f) out.push(f);
        }
    }
    for (const [locale, count] of Object.entries(input.i18nRawKeys || {})) {
        const f = i18nRawKeysToFinding(locale, count);
        if (f) out.push(f);
    }
    // Ordem determinística por id.
    out.sort((a, b) => a.id.localeCompare(b.id));
    return Object.freeze(out);
}
