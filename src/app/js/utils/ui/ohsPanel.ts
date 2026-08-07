// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   OHS PANEL — read-only SST coordinator view (SPEC-005 §UI Spec)

   Mostra a matriz de risco 5×5 (probabilidade × severidade) com a
   contagem de perigos por célula e o resumo de conformidade TWA dos
   elementos `worker` carregados. Read-only no MVP (edição é v0.6).

   Public API:
     openOhsPanel()                 - abre o modal
     closeOhsPanel()                - fecha o modal (idempotente)
     buildOhsMatrixModel(hazards)   - PURE helper testável (sem DOM)

   Padrão visual: .ecbt-overlay + .ecbt-dialog--lg (design tokens).
   ================================================================ */
import { escapeHtml } from '../helpers/html.js';
import { attachModalA11y } from './modalA11y.js';
import { createLogger } from '../helpers/logger.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import { riskScore, classifyRisk, summarizeRiskInventory, computeTWA, classifyTWACompliance, } from '../../core/ohs/index.js';
const log = createLogger('OhsPanel');
const MODAL_ID = 'ohs-panel';
/** @type {(() => void)|null} */
let _a11yCleanup: any = null;
// ----------------------------------------------------------------
// PURE HELPER — testável sem DOM
// ----------------------------------------------------------------
/**
 * Constrói o modelo da matriz 5×5: para cada (probabilidade, severidade)
 * a contagem de perigos e a classe de risco daquela célula.
 *
 * @param {Array<{probability?:number, severity?:number}>} hazards
 * @returns {{ cells: Array<Array<{count:number, score:number, cls:string}>>,
 *   summary: {low:number, moderate:number, high:number, critical:number, total:number} }}
 */
export function buildOhsMatrixModel(hazards: any) {
    const list = Array.isArray(hazards) ? hazards : [];
    // cells[sevIndex][probIndex]; sev 5 no topo (linha 0).
    const cells = [];
    for (let s = 5; s >= 1; s--) {
        const row = [];
        for (let p = 1; p <= 5; p++) {
            const score = riskScore(p, s);
            const count = list.filter((h: any) => h && Number(h.probability) === p && Number(h.severity) === s).length;
            row.push({ count, score, cls: classifyRisk(score) });
        }
        cells.push(row);
    }
    return { cells, summary: summarizeRiskInventory(list) };
}
/**
 * Resumo de conformidade TWA de uma lista de elementos worker que
 * carregam exposições e limite ocupacional.
 *
 * @param {Array<{exposures?:Array<{concentration?:number,durationHours?:number}>, limit?:number}>} workers
 * @returns {{ aboveLimit:number, actionLevel:number, total:number }}
 */
export function summarizeTwaCompliance(workers: any) {
    const list = Array.isArray(workers) ? workers : [];
    let aboveLimit = 0;
    let actionLevel = 0;
    let total = 0;
    for (const w of list) {
        if (!w || !Array.isArray(w.exposures) || w.exposures.length === 0)
            continue;
        const { twa, ok } = computeTWA(w.exposures);
        if (!ok)
            continue;
        total++;
        const { classification } = classifyTWACompliance(twa, Number(w.limit));
        if (classification === 'exceeds_limit')
            aboveLimit++;
        else if (classification === 'action_level')
            actionLevel++;
    }
    return { aboveLimit, actionLevel, total };
}
// ----------------------------------------------------------------
// Data collection from the live model (best-effort, read-only)
// ----------------------------------------------------------------
/**
 * Coleta perigos OHS dos elementos carregados. Procura `metadata.ohsHazards`
 * em qualquer elemento; tolerante a ausência (retorna []).
 * @returns {Array<{probability?:number, severity?:number, agent?:string}>}
 */
function collectHazards() {
    try {
        const w = window;
        const els = typeof w.getAllElements === 'function' ? w.getAllElements() : [];
        const out = [];
        for (const e of els || []) {
            const hz = e && e.metadata && e.metadata.ohsHazards;
            if (Array.isArray(hz))
                out.push(...hz);
        }
        return out;
    }
    catch (err: any) {
        log.debug('collectHazards', err && err.message ? err.message : err);
        return [];
    }
}
// ----------------------------------------------------------------
// Render
// ----------------------------------------------------------------
const CLS_COLOR = Object.freeze({
    low: '#2e7d32',
    moderate: '#f9a825',
    high: '#ef6c00',
    critical: '#c62828',
    invalid: '#9e9e9e',
});
function renderMatrix(model: any) {
    const sevLabels = ['S5', 'S4', 'S3', 'S2', 'S1'];
    let rows = '';
    model.cells.forEach((row: any, i: any) => {
        let tds = `<th scope="row" style="padding:4px 8px;text-align:right;">${escapeHtml(sevLabels[i])}</th>`;
        for (const c of row) {
            const bg = (CLS_COLOR as any)[c.cls] || CLS_COLOR.invalid;
            tds += `<td style="background:${bg};color:#fff;text-align:center;padding:8px;border-radius:3px;" title="score ${c.score} (${escapeHtml(c.cls)})">${c.count || ''}</td>`;
        }
        rows += `<tr>${tds}</tr>`;
    });
    return `
        <table style="border-collapse:separate;border-spacing:3px;margin:8px 0;">
            <tbody>${rows}
                <tr><th></th><th style="padding:4px;">P1</th><th>P2</th><th>P3</th><th>P4</th><th>P5</th></tr>
            </tbody>
        </table>`;
}
/**
 * Abre o painel SST (read-only).
 * @returns {void}
 */
export function openOhsPanel() {
    try {
        const hazards = collectHazards();
        const model = buildOhsMatrixModel(hazards);
        let modal = document.getElementById(MODAL_ID);
        if (modal)
            modal.remove();
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'ecbt-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'ohs-panel-title');
        const s = model.summary;
        modal.innerHTML = `
            <div class="ecbt-dialog ecbt-dialog--lg" data-testid="ohs-dialog">
                <header class="ecbt-dialog__header">
                    <h2 id="ohs-panel-title" style="margin:0;">${escapeHtml('SST · Visão do coordenador')}</h2>
                    <button type="button" class="ecbt-dialog__close" aria-label="Fechar"
                        data-cc-action="cc-f3002c86">&times;</button>
                </header>
                <div class="ecbt-dialog__body" style="padding:16px;">
                    <p style="margin:0 0 8px;">Riscos ativos: <strong>${s.total}</strong> ·
                        Críticos: <strong style="color:${CLS_COLOR.critical}">${s.critical}</strong> ·
                        Altos: <strong style="color:${CLS_COLOR.high}">${s.high}</strong></p>
                    <h3 style="margin:12px 0 0;">Matriz de risco 5&times;5</h3>
                    ${renderMatrix(model)}
                    ${s.total === 0
            ? '<p style="opacity:.7;">Nenhum perigo OHS no modelo. Adicione <code>metadata.ohsHazards</code> aos elementos para popular a matriz.</p>'
            : ''}
                    <p style="font-size:12px;opacity:.7;margin-top:12px;">
                        Read-only (MVP). Provenance: NR-01/PGR, NIOSH STOP, ACGIH TLV-TWA — ver ADR-OHS-001.</p>
                </div>
            </div>`;
        document.body.appendChild(modal);
        _a11yCleanup = attachModalA11y(modal, closeOhsPanel);
        // Sprint 3 Tier-B (Calvin 2026-06-03): URL = estado painel aberto
        syncDeepLinkUrl('ohs');
    }
    catch (err: any) {
        log.error('openOhsPanel failed', err);
    }
}
/**
 * Fecha o painel SST. Idempotente.
 * @returns {void}
 */
export function closeOhsPanel() {
    try {
        if (typeof _a11yCleanup === 'function') {
            _a11yCleanup();
            _a11yCleanup = null;
        }
        const modal = document.getElementById(MODAL_ID);
        if (modal) {
            modal.remove();
            clearDeepLinkUrl();
        }
    }
    catch (err: any) {
        log.debug('closeOhsPanel', err && err.message ? err.message : err);
    }
}
