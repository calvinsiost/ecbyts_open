// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CONSENSUS-MATRIX-001 F2 / RF-5 — Modal "Revisão final" renderer (pure-logic).
//
// Gera o HTML do modal a partir de ConsensusMatrixResult. NÃO muta o DOM —
// retorna string. Wire externo coloca no innerHTML quando criticalCount > 0.
//
// Ordenação canônica por urgência (mais crítico primeiro):
//   split → disagree-3way → low-confidence → majority → single-source → unanimous
//
// XSS-safe: escapeHtml em todos os valores user-supplied.
//
// Pure-logic 100%: sem DOM, sem rede, determinístico.

import type {
    ConsensusCategory,
    ConsensusMatrixResult,
    ConsensusVerdict,
} from './_consensusMatrixBuilderPure';

const URGENCY_ORDER: ReadonlyArray<ConsensusCategory> = Object.freeze([
    'split',
    'disagree-3way',
    'low-confidence',
    'majority',
    'single-source',
    'unanimous',
    'empty',
]);

const CATEGORY_LABELS: Readonly<Record<ConsensusCategory, string>> = Object.freeze({
    unanimous: 'Unânime',
    majority: 'Maioria',
    split: 'Empate',
    'low-confidence': 'Baixa confiança',
    'single-source': 'Fonte única',
    'disagree-3way': '3+ valores distintos',
    empty: 'Sem resposta',
});

const CATEGORY_ICONS: Readonly<Record<ConsensusCategory, string>> = Object.freeze({
    unanimous: '&#10003;', // ✓
    majority: '&#9650;', // ▲
    split: '&#9888;', // ⚠
    'low-confidence': '&#9737;', // ☉
    'single-source': '&#9679;', // ●
    'disagree-3way': '&#10006;', // ✖
    empty: '&#9711;', // ○
});

/**
 * Escapa caracteres HTML perigosos. Não depende de DOM.
 */
export function escapeHtml(s: unknown): string {
    const str = String(s ?? '');
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Ordena verdicts por urgência (mais crítico primeiro).
 */
export function sortByUrgency(
    verdicts: ReadonlyArray<ConsensusVerdict>,
): ReadonlyArray<ConsensusVerdict> {
    if (!Array.isArray(verdicts) || verdicts.length === 0) return Object.freeze([]);
    const indexOf = (c: ConsensusCategory) => {
        const i = URGENCY_ORDER.indexOf(c);
        return i < 0 ? 99 : i;
    };
    const sorted = [...verdicts].sort((a, b) => {
        const ua = indexOf(a.category);
        const ub = indexOf(b.category);
        if (ua !== ub) return ua - ub;
        // Empate: maior entropy primeiro (mais crítico)
        return (b.disagreementEntropy || 0) - (a.disagreementEntropy || 0);
    });
    return Object.freeze(sorted);
}

/**
 * Renderiza cabeçalho com contagem por categoria.
 */
function renderHeader(result: ConsensusMatrixResult): string {
    const s = result.summary;
    const total = result.verdicts.length;
    const assertivePct = Math.round((s.assertiveness || 0) * 100);
    return `
        <div class="consensus-modal-header" style="padding:12px 16px;border-bottom:1px solid var(--neutral-200);">
            <h2 style="margin:0 0 6px;font-size:14px;color:var(--neutral-900);">
                Revisão final &mdash; ${total} campo(s), ${assertivePct}% assertividade
            </h2>
            <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--neutral-700);">
                <span title="${CATEGORY_LABELS.unanimous}">${CATEGORY_ICONS.unanimous} ${s.unanimousCount} unânime(s)</span>
                <span title="${CATEGORY_LABELS.majority}">${CATEGORY_ICONS.majority} ${s.majorityCount} maioria(s)</span>
                <span title="${s.criticalCount} crítica(s) precisam decisão humana"
                      style="color:${s.criticalCount > 0 ? 'var(--error-700,#b91c1c)' : 'var(--neutral-600)'};font-weight:${s.criticalCount > 0 ? '600' : '400'};">
                    ${CATEGORY_ICONS.split} ${s.criticalCount} crítica(s)
                </span>
            </div>
        </div>
    `;
}

/**
 * Renderiza uma linha de verdict — cada categoria com UI apropriada.
 */
function renderVerdictRow(v: ConsensusVerdict, idx: number): string {
    const fieldIdEsc = escapeHtml(v.fieldId);
    const catLabel = CATEGORY_LABELS[v.category] || v.category;
    const catIcon = CATEGORY_ICONS[v.category] || '?';
    const confPct = Math.round((v.weightedConfidence || 0) * 100);
    const isCritical = v.requiresHumanReview;
    const borderColor = isCritical
        ? 'var(--error-300,#fca5a5)'
        : v.category === 'majority' || v.category === 'single-source'
            ? 'var(--warning-200,#fde68a)'
            : 'var(--success-200,#a7f3d0)';

    let inputHtml = '';
    if (v.category === 'split' || v.category === 'disagree-3way') {
        // Radio buttons por TierOutput (alternativas)
        inputHtml = '<div class="consensus-options" style="display:flex;flex-direction:column;gap:4px;margin-top:6px;">';
        const seen = new Set<string>();
        v.evidenceTrail.forEach((o, i) => {
            const valKey = JSON.stringify(o.value);
            if (seen.has(valKey)) return;
            seen.add(valKey);
            const valDisp = escapeHtml(String(o.value ?? '(vazio)')).slice(0, 80);
            const tierDisp = escapeHtml(String(o.tier));
            const cPct = Math.round((o.confidence || 0) * 100);
            const checked = i === 0 ? 'checked' : '';
            inputHtml += `
                <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;">
                    <input type="radio" name="consensus-fld-${idx}" value="${escapeHtml(valKey)}" ${checked}
                           data-field="${fieldIdEsc}">
                    <span style="font-weight:500;">${valDisp}</span>
                    <span style="color:var(--neutral-500);font-size:10px;">${tierDisp} &middot; ${cPct}%</span>
                </label>
            `;
        });
        inputHtml += '</div>';
    } else if (v.category === 'majority' || v.category === 'low-confidence') {
        const valDisp = escapeHtml(String(v.chosenValue ?? '(vazio)')).slice(0, 80);
        inputHtml = `
            <div style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;">
                <input type="checkbox" data-field="${fieldIdEsc}" data-action="accept" checked>
                <span>Aceitar: <strong>${valDisp}</strong></span>
            </div>
        `;
    } else if (v.category === 'single-source' || v.category === 'unanimous') {
        const valDisp = escapeHtml(String(v.chosenValue ?? '(vazio)')).slice(0, 80);
        inputHtml = `
            <div style="margin-top:4px;font-size:11px;color:var(--neutral-700);">
                Valor: <strong>${valDisp}</strong>
            </div>
        `;
    } else {
        inputHtml = `
            <div style="margin-top:4px;font-size:11px;color:var(--neutral-500);font-style:italic;">
                Nenhum tier respondeu &mdash; preencher manualmente.
            </div>
        `;
    }

    return `
        <div class="consensus-row" data-category="${v.category}" data-field-id="${fieldIdEsc}"
             style="border-left:3px solid ${borderColor};padding:8px 12px;margin:0;background:var(--neutral-50);border-bottom:1px solid var(--neutral-200);">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
                <strong style="font-size:12px;color:var(--neutral-900);">${fieldIdEsc}</strong>
                <span style="font-size:10px;color:var(--neutral-600);">
                    ${catIcon} ${escapeHtml(catLabel)} &middot; ${confPct}%
                </span>
            </div>
            ${inputHtml}
        </div>
    `;
}

/**
 * Renderiza CTA "Aplicar todos" — desabilitado se há críticas pendentes.
 */
function renderActions(result: ConsensusMatrixResult): string {
    const critical = result.summary.criticalCount;
    const disabled = critical > 0 ? 'disabled' : '';
    const hint =
        critical > 0
            ? `<span style="font-size:11px;color:var(--warning-700);">Resolva as ${critical} crítica(s) antes de aplicar.</span>`
            : `<span style="font-size:11px;color:var(--success-700);">Pronto para aplicar.</span>`;
    return `
        <div class="consensus-modal-actions" style="padding:12px 16px;border-top:1px solid var(--neutral-200);display:flex;align-items:center;justify-content:space-between;gap:12px;">
            ${hint}
            <div style="display:flex;gap:8px;">
                <button class="btn btn-secondary" data-action="consensus-cancel" style="font-size:11px;padding:4px 12px;">
                    Cancelar
                </button>
                <button class="btn btn-primary" data-action="consensus-apply-all" ${disabled}
                        style="font-size:11px;padding:4px 12px;${disabled ? 'opacity:0.5;cursor:not-allowed;' : ''}">
                    Aplicar todos
                </button>
            </div>
        </div>
    `;
}

/**
 * Renderiza o modal completo. Retorna string HTML pronta para innerHTML.
 * Defensive: input nulo → string vazia (não renderiza nada).
 */
export function renderConsensusModal(result: unknown): string {
    if (!result || typeof result !== 'object') return '';
    const r = result as ConsensusMatrixResult;
    if (!Array.isArray(r.verdicts) || r.verdicts.length === 0) return '';

    const sorted = sortByUrgency(r.verdicts);
    let body = '<div class="consensus-modal-body" style="max-height:60vh;overflow-y:auto;">';
    sorted.forEach((v, i) => {
        body += renderVerdictRow(v, i);
    });
    body += '</div>';

    return `
        <div class="consensus-modal-overlay" role="dialog" aria-modal="true"
             aria-labelledby="consensus-modal-title"
             style="position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:24px;">
            <div class="consensus-modal" id="consensus-modal-title"
                 style="background:var(--neutral-50,#fff);border-radius:8px;max-width:720px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 12px 36px rgba(0,0,0,0.25);">
                ${renderHeader(r)}
                ${body}
                ${renderActions(r)}
            </div>
        </div>
    `;
}

/**
 * Decide se o modal DEVE ser renderizado em vez do badge simples.
 * Regra: criticalCount > 0 OU (verdicts.length > 0 E há ≥1 majority com conf<0.7).
 */
export function shouldRenderModal(result: unknown): boolean {
    if (!result || typeof result !== 'object') return false;
    const r = result as ConsensusMatrixResult;
    if (!Array.isArray(r.verdicts) || r.verdicts.length === 0) return false;
    if ((r.summary?.criticalCount || 0) > 0) return true;
    return r.verdicts.some(
        (v) => v.category === 'majority' && (v.weightedConfidence || 0) < 0.7,
    );
}

export const CONSENSUS_MODAL_RENDERER_META = Object.freeze({
    moduleId: 'consensus-matrix.modal-renderer',
    version: 1,
    urgencyOrderLen: URGENCY_ORDER.length,
});
