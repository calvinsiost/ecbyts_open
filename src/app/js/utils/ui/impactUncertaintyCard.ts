// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   IMPACT UNCERTAINTY CARD — Phase 3 parte 2/2 (P1-2)
   Subscreve evento `impact:uncertainty-result` emitido por
   `utils/handlers/impact.js` e renderiza card HUD minimalista com
   IC95 + probExceedance + percentis.

   Design: componente stateless. Re-render completo a cada evento.
   Cada kind (soil/groundwater/occupational) gera um card separado
   no container. Pure render helpers separados para serem cheap-
   testáveis em Node sem DOM.

   Uso:
     import { mountImpactUncertaintyCard } from '.../impactUncertaintyCard.js';
     mountImpactUncertaintyCard({ containerId: 'impact-uncertainty-host' });
     // → a partir de agora, qualquer `impact:uncertainty-result` event
     //   rende no container.

   Roadmap: §0.2 P1-2 Phase 3 parte 2 (Claude-owner)
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────────
// Pure formatters - cheap-testable em Node
// ──────────────────────────────────────────────────────────────────────────

/**
 * Formata valor BRL compacto (ex: 1.2M, 450k, 5.00).
 * Sem Intl.NumberFormat para manter estável cross-locale em test.
 */
export function formatBRL(value: number): string {
    if (value === null || value === undefined) return '—';
    const v = Number(value);
    if (!Number.isFinite(v)) return '—';
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}k`;
    return `${sign}${abs.toFixed(2)}`;
}

/**
 * Formata IC95 como "[p2.5, p97.5]" em BRL compacto.
 */
export function formatIC95(ic95: [number, number]): string {
    if (!Array.isArray(ic95) || ic95.length !== 2) return '—';
    return `[${formatBRL(ic95[0])}, ${formatBRL(ic95[1])}]`;
}

/**
 * Formata probabilidade como percentil (0.234 → "23.4%").
 * @param p - 0..1
 */
export function formatProbability(p: number): string {
    if (p === null || p === undefined) return '—';
    const v = Number(p);
    if (!Number.isFinite(v)) return '—';
    return `${(v * 100).toFixed(1)}%`;
}

/**
 * Retorna classe de risco baseada em probExceedance:
 * - green (<5%), yellow (5-20%), red (>20%).
 */
export function probabilityToRiskClass(probExceedance: number): 'green' | 'yellow' | 'red' | 'gray' {
    if (probExceedance === null || probExceedance === undefined) return 'gray';
    const v = Number(probExceedance);
    if (!Number.isFinite(v)) return 'gray';
    if (v < 0.05) return 'green';
    if (v < 0.2) return 'yellow';
    return 'red';
}

/**
 * Escape HTML para injeção segura em template string.
 */
export function escapeHtml(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Label amigável por kind.
 */
export function kindLabel(kind: string): string {
    switch (kind) {
        case 'soil':
            return 'Solo';
        case 'groundwater':
            return 'Água subterrânea';
        case 'occupational':
            return 'Ocupacional';
        default:
            return kind || 'Desconhecido';
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Pure HTML builder - cheap-testable em Node
// ──────────────────────────────────────────────────────────────────────────

/**
 * Constrói o HTML do card dada uma MCResult. Não toca DOM. Pure function.
 *
 * @param payload - { kind, result, params?, mcOpts? }
 * @returns HTML seguro (pré-escapado)
 */
export function buildUncertaintyCardHtml(payload: Record<string, any>): string {
    const { kind, result } = payload || {};
    if (!result || result.ok === false) {
        return `<div class="impact-unc-card impact-unc-card--error" data-kind="${escapeHtml(kind || '')}">
    <div class="impact-unc-card__header">
        <span class="impact-unc-card__label">${escapeHtml(kindLabel(kind))}</span>
        <span class="impact-unc-card__badge impact-unc-card__badge--error">erro</span>
    </div>
    <div class="impact-unc-card__body">
        ${escapeHtml(result?.reason || result?.error || 'Sem dados')}
    </div>
</div>`;
    }

    const mean = formatBRL(result.mean);
    const sd = formatBRL(result.sd);
    const ic95 = formatIC95(result.ic95);
    const p50 = formatBRL(result.p50);
    const hasExceedance = Number.isFinite(result.probExceedance);
    const exceedanceStr = hasExceedance ? formatProbability(result.probExceedance) : null;
    const risk = hasExceedance ? probabilityToRiskClass(result.probExceedance) : 'gray';
    const threshold = hasExceedance ? formatBRL(result.threshold) : null;

    return `<div class="impact-unc-card" data-kind="${escapeHtml(kind || '')}" data-risk="${risk}">
    <div class="impact-unc-card__header">
        <span class="impact-unc-card__label">${escapeHtml(kindLabel(kind))}</span>
        <span class="impact-unc-card__meta">n=${escapeHtml(String(result.n_iter || '—'))} · seed=${escapeHtml(String(result.seed ?? '—'))}</span>
    </div>
    <div class="impact-unc-card__body">
        <div class="impact-unc-card__metric">
            <span class="impact-unc-card__metric-label">Mediana</span>
            <span class="impact-unc-card__metric-value">${escapeHtml(p50)}</span>
        </div>
        <div class="impact-unc-card__metric">
            <span class="impact-unc-card__metric-label">IC95</span>
            <span class="impact-unc-card__metric-value">${escapeHtml(ic95)}</span>
        </div>
        <div class="impact-unc-card__metric">
            <span class="impact-unc-card__metric-label">Média ± σ</span>
            <span class="impact-unc-card__metric-value">${escapeHtml(mean)} ± ${escapeHtml(sd)}</span>
        </div>
        ${
            hasExceedance
                ? `<div class="impact-unc-card__exceedance impact-unc-card__exceedance--${risk}">
            <span class="impact-unc-card__metric-label">P(X > ${escapeHtml(threshold || '')})</span>
            <span class="impact-unc-card__metric-value impact-unc-card__prob">${escapeHtml(exceedanceStr || '')}</span>
        </div>`
                : ''
        }
    </div>
</div>`;
}

// ──────────────────────────────────────────────────────────────────────────
// DOM wire - não testado em Node puro (requer jsdom)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Monta o subscriber do evento impact:uncertainty-result no container
 * indicado. Cada kind é renderizado como card separado indexado por data-kind.
 *
 * Retorna função de cleanup para desmount.
 *
 * @param options.containerId - ID do elemento host
 * @returns cleanup - chama para remover listener
 */
export function mountImpactUncertaintyCard({ containerId }: any): Function {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return () => {};
    }
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('[impact-unc-card] container not found:', containerId);
        return () => {};
    }

    const handler = (ev: any) => {
        const payload = ev.detail || {};
        const html = buildUncertaintyCardHtml(payload);
        // Upsert por data-kind: substitui card existente do mesmo kind
        const kindSelector = `[data-kind="${payload.kind || ''}"]`;
        const existing = container.querySelector(kindSelector);
        if (existing) {
            existing.outerHTML = html;
        } else {
            container.insertAdjacentHTML('beforeend', html);
        }
    };

    window.addEventListener('impact:uncertainty-result', handler);
    return () => {
        window.removeEventListener('impact:uncertainty-result', handler);
    };
}
