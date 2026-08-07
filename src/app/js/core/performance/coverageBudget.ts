// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   COVERAGE BUDGET — JS bytes parsed/used before First Contentful Paint
   ================================================================
   PERF-MASTER-001 S5 (Decision 2 executed 2026-04-30 — Calvin signaled
   "seguir com a recomendação" → Opção A Coverage API)

   Substitui métrica nominal "Bundle inicial <500KB" (impossível de medir
   sem bundler) por métrica concreta: bytes JavaScript carregados +
   executados antes do FCP.

   Por que Coverage API?
   - ecbyts é vanilla ES modules, sem bundler. "Bundle size" não existe.
   - Chrome DevTools Coverage API (page.coverage.startJSCoverage no
     Playwright) reporta bytes que foram parseados e usados.
   - Métrica reflete o que o usuário REALMENTE paga (bytes baixados +
     parseados antes da primeira tela útil).

   Pure-logic — recebe entries de coverage do consumer Playwright e
   produz aggregate + budget evaluation. Sem dependência de browser.

   Roadmap: §0.2 P1-2 PERF-MASTER S5 (Coverage budget vs nominal bundle)
   ================================================================ */

console.debug('[mod:load]', 'app/js/core/performance/coverageBudget.js');

import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';

export interface CoverageEntry {
    readonly url?: unknown;
    readonly ranges?: unknown;
    readonly text?: unknown;
}

export interface CoverageFileSummary {
    url: string;
    used: number;
    total: number;
    ratio: number;
}

export interface CoverageSummary {
    totalBytes: number;
    usedBytes: number;
    unusedBytes: number;
    usedRatio: number;
    fileCount: number;
    byFile: CoverageFileSummary[];
}

export interface CoverageBudgetThresholds {
    readonly usedBytesAtFCP: number;
    readonly usedBytesHardFail: number;
    readonly minUsedRatio: number;
}

export type CoverageViewport = 'desktop' | 'mobile';
export type CoverageBudgets = Readonly<Partial<Record<CoverageViewport, Readonly<CoverageBudgetThresholds>>>>;

export interface SummarizeCoverageOptions {
    readonly urlFilter?: (url: string) => boolean;
}

export type CoverageViolationSeverity = 'warn' | 'fail';

export interface CoverageViolation {
    metric: 'usedBytes' | 'usedRatio';
    actual: number;
    budget: number;
    severity: CoverageViolationSeverity;
}

export interface EvaluateCoverageOptions {
    readonly viewport?: unknown;
    readonly budgets?: CoverageBudgets | null;
}

export interface EvaluateCoverageResult {
    viewport: CoverageViewport;
    severity: CoverageSeverity;
    violations: CoverageViolation[];
    summary: CoverageSummary;
}

export interface CoverageHotspot {
    url: string;
    unusedBytes: number;
    ratio: number;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

function stringFromUnknown(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
    return '';
}

/**
 * Severity bands para Coverage budget.
 */
export const COVERAGE_SEVERITY = Object.freeze({
    OK: 'ok',
    WARN: 'warn',
    FAIL: 'fail',
} as const);

export type CoverageSeverity = (typeof COVERAGE_SEVERITY)[keyof typeof COVERAGE_SEVERITY];

/**
 * Budgets canônicos para "JS executado antes de FCP".
 *
 * Justificativa dos thresholds:
 * - Calvin's perspective: total app/js shipped ≈ 3.24 MB. Se TUDO fosse
 *   parseado antes do FCP, mobile com 3G demora ~10s só pra parsear.
 * - Para FCP <2.5s (LCP target via Lighthouse), apenas ~25% do código
 *   pode ser executado pré-FCP.
 * - 800KB é threshold pragmático: cobre core/elements + scene/setup +
 *   handlers/index sem incluir features pesadas (recognition, nn, llm).
 * - 1200KB é warn (degradation visível em mobile mas funcional).
 * - >1.5MB é fail (página perceptivelmente lenta em qualquer dispositivo).
 */
export const COVERAGE_BUDGETS = Object.freeze({
    desktop: Object.freeze({
        usedBytesAtFCP: 1200000, // 1.2MB — threshold warn
        usedBytesHardFail: 1800000, // 1.8MB — fail desktop
        minUsedRatio: 0.4, // <40% usado = muito código baixado mas não usado
    }),
    mobile: Object.freeze({
        usedBytesAtFCP: 800000, // 800KB — mobile mais estrito
        usedBytesHardFail: 1200000, // 1.2MB — fail mobile
        minUsedRatio: 0.5, // mobile precisa eficiência maior
    }),
}) satisfies CoverageBudgets;

/**
 * Soma bytes em ranges de coverage. Pure.
 *
 * @param {Array<{start:number, end:number}>} ranges
 * @returns {number}
 */
export function sumCoverageRanges(ranges: unknown): number {
    if (!Array.isArray(ranges)) return 0;
    let total = 0;
    for (const r of ranges) {
        if (!isObjectRecord(r)) continue;
        const start = toFiniteNumber(r.start, 0);
        const end = toFiniteNumber(r.end, 0);
        if (typeof start === 'number' && typeof end === 'number' && end > start) total += end - start;
    }
    return total;
}

/**
 * Filtra entries irrelevantes para o budget (CDN externo, source maps, etc).
 *
 * @param {string} url
 * @returns {boolean} true se entry deve ser incluída
 */
export function isRelevantCoverageEntry(url: unknown): boolean {
    if (typeof url !== 'string' || !url) return false;
    // Sourcemaps
    if (url.endsWith('.map')) return false;
    // CDN externo (Supabase, jsdelivr) — não é código nosso
    if (url.includes('cdn.jsdelivr.net')) return false;
    if (url.includes('cdnjs.cloudflare.com')) return false;
    if (url.includes('unpkg.com')) return false;
    if (url.includes('supabase.co')) return false;
    // Inline scripts
    if (url.startsWith('about:')) return false;
    if (url.startsWith('chrome-extension://')) return false;
    return true;
}

/**
 * Agrega coverage entries em summary estruturado.
 * Pure function.
 *
 * @param {Array<CoverageEntry>} entries
 * @param {Object} [opts]
 * @param {Function} [opts.urlFilter=isRelevantCoverageEntry] - filter custom
 * @returns {CoverageSummary}
 */
export function summarizeCoverage(entries: unknown, opts: SummarizeCoverageOptions = {}): CoverageSummary {
    const filter = typeof opts.urlFilter === 'function' ? opts.urlFilter : isRelevantCoverageEntry;
    if (!Array.isArray(entries) || entries.length === 0) {
        return { totalBytes: 0, usedBytes: 0, unusedBytes: 0, usedRatio: 0, fileCount: 0, byFile: [] };
    }

    let totalBytes = 0;
    let usedBytes = 0;
    const byFile: CoverageFileSummary[] = [];

    for (const entry of entries) {
        if (!isObjectRecord(entry)) continue;
        const url = stringFromUnknown(entry.url);
        if (!filter(url)) continue;

        const text = typeof entry.text === 'string' ? entry.text : '';
        const total = text.length;
        const used = sumCoverageRanges(entry.ranges);

        totalBytes += total;
        usedBytes += used;
        byFile.push({
            url,
            used,
            total,
            ratio: total > 0 ? Math.round((used / total) * 1000) / 1000 : 0,
        });
    }

    const usedRatio = totalBytes > 0 ? usedBytes / totalBytes : 0;
    return {
        totalBytes,
        usedBytes,
        unusedBytes: totalBytes - usedBytes,
        usedRatio: Math.round(usedRatio * 1000) / 1000,
        fileCount: byFile.length,
        byFile: byFile.sort((a, b) => b.used - a.used),
    };
}

/**
 * Avalia coverage summary contra budget canônico.
 * Pure function.
 *
 * @param {CoverageSummary} summary
 * @param {Object} [opts]
 * @param {'desktop'|'mobile'} [opts.viewport='desktop']
 * @param {Object} [opts.budgets=COVERAGE_BUDGETS]
 * @returns {{viewport:string, severity:string, violations:Array, summary:CoverageSummary}}
 */
export function evaluateCoverage(summary: CoverageSummary, opts: EvaluateCoverageOptions = {}): EvaluateCoverageResult {
    const viewport = opts.viewport === 'mobile' ? 'mobile' : 'desktop';
    const budgets = opts.budgets || COVERAGE_BUDGETS;
    const b = budgets[viewport] || budgets.desktop || COVERAGE_BUDGETS.desktop;

    const violations: CoverageViolation[] = [];

    // Hard fail: usedBytes > hardFail threshold
    if (summary.usedBytes > b.usedBytesHardFail) {
        violations.push({
            metric: 'usedBytes',
            actual: summary.usedBytes,
            budget: b.usedBytesHardFail,
            severity: 'fail',
        });
    } else if (summary.usedBytes > b.usedBytesAtFCP) {
        // Warn: entre soft target e hard fail
        violations.push({
            metric: 'usedBytes',
            actual: summary.usedBytes,
            budget: b.usedBytesAtFCP,
            severity: 'warn',
        });
    }

    // Eficiência: ratio muito baixo significa muito código baixado mas não usado
    if (summary.totalBytes > 0 && summary.usedRatio < b.minUsedRatio) {
        violations.push({
            metric: 'usedRatio',
            actual: summary.usedRatio,
            budget: b.minUsedRatio,
            severity: 'warn',
        });
    }

    let severity: CoverageSeverity = COVERAGE_SEVERITY.OK;
    for (const v of violations) {
        if (v.severity === 'fail') {
            severity = COVERAGE_SEVERITY.FAIL;
            break;
        }
        if (v.severity === 'warn') severity = COVERAGE_SEVERITY.WARN;
    }

    return { viewport, severity, violations, summary };
}

/**
 * Identifica top N arquivos com pior ratio (mais bytes não-usados).
 * Útil para identificar candidatos a lazy load.
 *
 * @param {CoverageSummary} summary
 * @param {number} [topN=10]
 * @returns {Array<{url:string, unusedBytes:number, ratio:number}>}
 */
export function findUnusedHotspots(summary: unknown, topN = 10): CoverageHotspot[] {
    if (!isObjectRecord(summary) || !Array.isArray(summary.byFile)) return [];
    const n = Number.isFinite(topN) && topN > 0 ? Math.floor(topN) : 10;

    const files: CoverageFileSummary[] = [];
    for (const file of summary.byFile) {
        if (!isObjectRecord(file)) continue;
        const used = Number(file.used);
        const total = Number(file.total);
        const ratio = Number(file.ratio);
        if (!Number.isFinite(used) || !Number.isFinite(total)) continue;
        files.push({
            url: stringFromUnknown(file.url),
            used,
            total,
            ratio: toFiniteNumber(ratio, 0),
        });
    }

    return files
        .map((f) => ({ url: f.url, unusedBytes: f.total - f.used, ratio: f.ratio }))
        .filter((f) => f.unusedBytes > 0)
        .sort((a, b) => b.unusedBytes - a.unusedBytes)
        .slice(0, n);
}

console.debug('[mod:end]', 'app/js/core/performance/coverageBudget.js');
