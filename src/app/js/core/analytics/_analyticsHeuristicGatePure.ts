// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// AUDIT-HEURISTIC-001 — Gate genérico para detectar módulos analytics heurísticos.
//
// Premissa: 488/517 módulos analytics têm inputSchema/outputSchema vazios
// (auditoria 2026-06-02). Em vez de marcar 488 arquivos manualmente, este
// gate detecta heurística via meta-shape e produz badge HTML pronto para
// qualquer consumer (painéis, runner, registry catalog).
//
// Pure-logic 100%: sem DOM, sem rede. Funções determinísticas.

export interface AnalyticsModuleMeta {
    readonly id?: string;
    readonly version?: string;
    readonly validatedByHuman?: boolean;
    readonly disclaimerAcknowledged?: boolean;
    readonly specRef?: string;
    readonly inputSchema?: {
        readonly type?: string;
        readonly properties?: Readonly<Record<string, unknown>>;
        readonly required?: ReadonlyArray<string>;
    };
    readonly outputSchema?: {
        readonly type?: string;
        readonly properties?: Readonly<Record<string, unknown>>;
        readonly required?: ReadonlyArray<string>;
    };
    readonly isHeuristic?: boolean;
    readonly tier?: 'connected' | 'declared-only' | 'dormant' | 'unknown';
}

export interface HeuristicVerdict {
    readonly isHeuristic: boolean;
    readonly tier: 'connected' | 'declared-only' | 'dormant' | 'unknown';
    readonly reasons: ReadonlyArray<string>;
    readonly riskLevel: 'low' | 'medium' | 'high';
}

const EMPTY_PROPS_THRESHOLD = 0;

/**
 * Conta properties de um schema. null/undefined → 0.
 */
function countProps(schema: unknown): number {
    if (!schema || typeof schema !== 'object') return 0;
    const props = (schema as any).properties;
    if (!props || typeof props !== 'object') return 0;
    return Object.keys(props).length;
}

/**
 * Classifica um módulo analytics como heurístico ou conectado.
 * Defensive: meta inválida → unknown tier + heurística pessimista (true).
 */
export function classifyHeuristic(meta: unknown): HeuristicVerdict {
    if (!meta || typeof meta !== 'object') {
        return Object.freeze({
            isHeuristic: true,
            tier: 'unknown' as const,
            reasons: Object.freeze(['meta inválida ou ausente']),
            riskLevel: 'high' as const,
        });
    }
    const m = meta as AnalyticsModuleMeta;
    const reasons: string[] = [];

    // Override explícito tem prioridade
    if (m.isHeuristic === true) {
        reasons.push('flag isHeuristic=true explícita');
    }
    if (m.tier === 'connected') {
        return Object.freeze({
            isHeuristic: false,
            tier: 'connected' as const,
            reasons: Object.freeze(['tier="connected" explícito']),
            riskLevel: 'low' as const,
        });
    }

    const inputProps = countProps(m.inputSchema);
    const outputProps = countProps(m.outputSchema);
    const validated = m.validatedByHuman === true;

    if (inputProps === EMPTY_PROPS_THRESHOLD) reasons.push('inputSchema sem properties');
    if (outputProps === EMPTY_PROPS_THRESHOLD) reasons.push('outputSchema sem properties');
    if (!validated) reasons.push('validatedByHuman != true');

    const isEmpty = inputProps === EMPTY_PROPS_THRESHOLD && outputProps === EMPTY_PROPS_THRESHOLD;
    const isHeuristic = isEmpty || !validated || m.isHeuristic === true;

    let tier: HeuristicVerdict['tier'];
    if (!isHeuristic) tier = 'connected';
    else if (m.tier === 'dormant') tier = 'dormant';
    else if (m.tier === 'declared-only') tier = 'declared-only';
    else tier = isEmpty ? 'dormant' : 'declared-only';

    let riskLevel: HeuristicVerdict['riskLevel'];
    if (tier === 'connected') riskLevel = 'low';
    else if (tier === 'dormant') riskLevel = 'low'; // dormente não chega ao usuário
    else if (tier === 'declared-only') riskLevel = 'medium';
    else riskLevel = 'high';

    return Object.freeze({
        isHeuristic,
        tier,
        reasons: Object.freeze(reasons),
        riskLevel,
    });
}

/**
 * Escape HTML perigoso. Pure (sem DOM).
 */
function escapeHtml(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export interface BadgeOptions {
    readonly variant?: 'inline' | 'block';
    readonly showReasons?: boolean;
    readonly compact?: boolean;
}

/**
 * Renderiza badge HTML "⚠ valor heurístico" pronto para innerHTML.
 * Variants:
 *   inline (default) — <span> compact com tooltip
 *   block — <div> com texto explicativo + reasons opcional
 * Retorna '' se módulo é conectado (sem badge necessário).
 */
export function renderHeuristicBadge(verdict: unknown, options?: BadgeOptions): string {
    if (!verdict || typeof verdict !== 'object') return '';
    const v = verdict as HeuristicVerdict;
    if (!v.isHeuristic || v.tier === 'connected') return '';

    const variant = options?.variant === 'block' ? 'block' : 'inline';
    const showReasons = options?.showReasons === true;
    const compact = options?.compact === true;

    const colorMap = {
        high: { bg: 'var(--error-50,#fee2e2)', border: 'var(--error-300,#fca5a5)', fg: 'var(--error-700,#b91c1c)' },
        medium: { bg: 'var(--warning-50,#fef3c7)', border: 'var(--warning-300,#fcd34d)', fg: 'var(--warning-700,#a16207)' },
        low: { bg: 'var(--neutral-100,#f3f4f6)', border: 'var(--neutral-300,#d1d5db)', fg: 'var(--neutral-700,#374151)' },
    } as const;
    const c = colorMap[v.riskLevel];
    const icon = v.riskLevel === 'high' ? '&#9888;' : v.riskLevel === 'medium' ? '&#9888;' : '&#9432;';
    const tierLabel = {
        connected: 'conectado',
        'declared-only': 'declarado',
        dormant: 'dormente',
        unknown: 'desconhecido',
    }[v.tier];

    if (variant === 'inline') {
        const reasonsText = showReasons && v.reasons.length > 0 ? ` (${v.reasons.join('; ')})` : '';
        const tooltip = `Heurístico (${tierLabel})${reasonsText}`;
        return `<span class="analytics-heuristic-badge analytics-heuristic-badge--${v.riskLevel}"
            role="img"
            aria-label="${escapeHtml(tooltip)}"
            title="${escapeHtml(tooltip)}"
            style="display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:999px;background:${c.bg};border:1px solid ${c.border};color:${c.fg};font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.02em;${compact ? '' : 'margin-left:6px;'}">${icon} heurístico</span>`;
    }

    // block variant
    const reasonsHtml = showReasons && v.reasons.length > 0
        ? `<ul style="margin:4px 0 0 16px;padding:0;font-size:9px;color:${c.fg};">${v.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`
        : '';
    return `<div class="analytics-heuristic-block analytics-heuristic-block--${v.riskLevel}"
        role="status" aria-live="polite"
        style="margin:6px 0;padding:6px 10px;border-radius:6px;background:${c.bg};border:1px solid ${c.border};color:${c.fg};font-size:11px;">
        <strong>${icon} Valor heurístico (${escapeHtml(tierLabel)})</strong>
        <div style="font-size:10px;margin-top:2px;">Este resultado usa fórmula matemática sem fonte de dados verificada. Trate como estimativa.</div>
        ${reasonsHtml}
    </div>`;
}

/**
 * Resume uma coleção de verdicts (útil para painéis de auditoria).
 */
export interface HeuristicSummary {
    readonly total: number;
    readonly connected: number;
    readonly declaredOnly: number;
    readonly dormant: number;
    readonly unknown: number;
    readonly highRisk: number;
    readonly connectedPct: number; // 0..100
}

export function summarizeHeuristicVerdicts(verdicts: unknown): HeuristicSummary {
    const empty: HeuristicSummary = Object.freeze({
        total: 0,
        connected: 0,
        declaredOnly: 0,
        dormant: 0,
        unknown: 0,
        highRisk: 0,
        connectedPct: 100,
    });
    if (!Array.isArray(verdicts) || verdicts.length === 0) return empty;

    let connected = 0;
    let declaredOnly = 0;
    let dormant = 0;
    let unknown = 0;
    let highRisk = 0;
    let total = 0;

    for (const v of verdicts) {
        if (!v || typeof v !== 'object') continue;
        const ver = v as HeuristicVerdict;
        total += 1;
        if (ver.tier === 'connected') connected += 1;
        else if (ver.tier === 'declared-only') declaredOnly += 1;
        else if (ver.tier === 'dormant') dormant += 1;
        else unknown += 1;
        if (ver.riskLevel === 'high') highRisk += 1;
    }

    return Object.freeze({
        total,
        connected,
        declaredOnly,
        dormant,
        unknown,
        highRisk,
        connectedPct: total > 0 ? Math.round((connected / total) * 100) : 100,
    });
}

export const ANALYTICS_HEURISTIC_GATE_META = Object.freeze({
    moduleId: 'analytics.heuristic-gate',
    version: 1,
    auditRef: 'docs/reports/AUDIT_HEURISTIC_VS_CONNECTED_2026_06_02.md',
    tierLevels: Object.freeze(['connected', 'declared-only', 'dormant', 'unknown']),
});
