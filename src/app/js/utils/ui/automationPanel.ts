// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Generated from src/app/js/utils/ui/automationPanel.ts by TS-MIGRATION-001. Do not edit manually.
/**
 * Automation Panel - Modal UI for managing automation bots.
 *
 * Shows bot list with toggle switches, configuration forms,
 * and activity log. Opened via handleOpenAutomationPanel().
 *
 * @module utils/ui/automationPanel
 */
import {
    listBots,
    getBotStatus,
    setBotActive,
    setBotConfig,
    getActivityLog,
} from '../../core/automation/botManager.js';
import { escapeHtml } from '../helpers/html.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
let _panelEl: any = null;
// UI-EVAL-COVERAGE-001 #sessao-longa (2026-08-06): o escHandler abaixo era
// registrado em `document` a CADA abertura e só se auto-removia quando o
// usuário apertava Escape. Fechar pelo X, pelo backdrop ou reabrindo o painel
// deixava um keydown preso em `document` por ciclo (crescimento LINEAR com N).
// Referência de módulo + remoção no close = cleanup determinístico.
let _escHandler: ((e: any) => void) | null = null;
/**
 * Open the automation panel modal.
 */
export function openAutomationPanel() {
    // reabrir passa pelo close real (remove o keydown anterior de `document`)
    if (_panelEl) closeAutomationPanel();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9000;display:flex;align-items:center;justify-content:center';
    overlay.addEventListener('click', (e: any) => {
        if (e.target === overlay) closeAutomationPanel();
    });
    const modal = document.createElement('div');
    modal.className = 'modal-content';
    modal.style.cssText =
        'background:var(--bg1);border-radius:12px;width:520px;max-height:80vh;overflow-y:auto;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,0.3)';
    modal.innerHTML = _buildPanelHTML();
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    _panelEl = overlay;
    // Wire up toggle handlers
    /** @type {any} */ (modal.querySelectorAll('[data-bot-toggle]')).forEach((btn: any) => {
        btn.addEventListener('click', () => {
            const botId = btn.getAttribute('data-bot-toggle');
            const status = (getBotStatus(botId)) as any;
            setBotActive(botId, !(status && status.isActive));
            refreshAutomationPanel();
        });
    });
    // Wire up config forms
    /** @type {any} */ (modal.querySelectorAll('[data-bot-config-form]')).forEach((form: any) => {
        form.addEventListener('change', (e: any) => {
            const botId = form.getAttribute('data-bot-config-form');
            const input = e.target;
            if (!input.name) return;
            const val =
                input.type === 'checkbox'
                    ? input.checked
                    : input.type === 'number'
                      ? parseFloat(input.value)
                      : input.value;
            setBotConfig(botId, { [input.name]: val });
        });
    });
    // ESC to close
    /**
     * @param {any} e
     */
    _escHandler = (e: any) => {
        if (e.key === 'Escape') closeAutomationPanel();
    };
    document.addEventListener('keydown', _escHandler);
    // Sprint 3 Tier-B (Calvin 2026-06-03): URL = estado painel aberto
    syncDeepLinkUrl('automation');
}
/**
 * Close the automation panel.
 */
export function closeAutomationPanel() {
    // cleanup do listener global ANTES do DOM — vale mesmo se _panelEl já sumiu
    if (_escHandler) {
        document.removeEventListener('keydown', _escHandler);
        _escHandler = null;
    }
    if (_panelEl) {
        _panelEl.remove();
        _panelEl = null;
        clearDeepLinkUrl();
    }
}
/**
 * Refresh panel content (after toggle/config change).
 */
export function refreshAutomationPanel() {
    if (!_panelEl) return;
    const modal = (_panelEl.querySelector('.modal-content')) as any;
    if (!modal) return;
    modal.innerHTML = _buildPanelHTML();
    // Re-wire handlers
    /** @type {any} */ (modal.querySelectorAll('[data-bot-toggle]')).forEach((btn: any) => {
        btn.addEventListener('click', () => {
            const botId = btn.getAttribute('data-bot-toggle');
            const status = (getBotStatus(botId)) as any;
            setBotActive(botId, !(status && status.isActive));
            refreshAutomationPanel();
        });
    });
    /** @type {any} */ (modal.querySelectorAll('[data-bot-config-form]')).forEach((form: any) => {
        form.addEventListener('change', (e: any) => {
            const botId = form.getAttribute('data-bot-config-form');
            const input = e.target;
            if (!input.name) return;
            const val =
                input.type === 'checkbox'
                    ? input.checked
                    : input.type === 'number'
                      ? parseFloat(input.value)
                      : input.value;
            setBotConfig(botId, { [input.name]: val });
        });
    });
}
// ── HTML Builders ─────────────────────────────────────────────────────────────
function _buildPanelHTML() {
    const bots = (listBots()) as any[];
    const log = (getActivityLog(20)) as any[];
    let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;font-size:1.1rem">Automacoes</h3>
            <button data-cc-action="cc-b462e06d"
                    style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text2)"
                    aria-label="Fechar">&#10005;</button>
        </div>
    `;
    // Bot cards
    for (const bot of bots) {
        const status = (getBotStatus(bot.id)) as any;
        const isActive = status?.isActive ?? false;
        const config = status?.config || {};
        html += `
            <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <span style="font-weight:600;font-size:0.9rem">${escapeHtml(bot.name)}</span>
                    <button data-bot-toggle="${escapeHtml(bot.id)}"
                            style="padding:4px 12px;border-radius:4px;border:1px solid var(--border);cursor:pointer;font-size:0.78rem;
                                   background:${isActive ? 'var(--green)' : 'var(--bg3)'};color:${isActive ? '#fff' : 'var(--text2)'}">
                        ${isActive ? 'Ativo' : 'Inativo'}
                    </button>
                </div>
                <div style="font-size:0.78rem;color:var(--text3);margin-bottom:8px">${escapeHtml(bot.description)}</div>
                ${_buildConfigForm(bot.id, config)}
            </div>
        `;
    }
    // Activity log
    html += `
        <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
            <div style="font-size:0.8rem;font-weight:600;color:var(--text2);margin-bottom:8px">Log de Atividades</div>
    `;
    if (log.length === 0) {
        html += '<div style="font-size:0.75rem;color:var(--text3)">Nenhuma atividade registrada.</div>';
    } else {
        for (const entry of log.slice(0, 10)) {
            const time = new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const icon = entry.action === 'error' ? '&#9888;' : '&#9679;';
            html += `
                <div style="font-size:0.72rem;color:var(--text3);padding:2px 0">
                    ${icon} ${time} &#8212; ${escapeHtml(entry.botId)}: ${escapeHtml(entry.action)}
                </div>
            `;
        }
    }
    html += '</div>';
    return html;
}
/**
 * @param {any} botId
 * @param {any} config
 */
function _buildConfigForm( botId: any, config: any) {
    const fields = _getConfigFields(botId);
    if (fields.length === 0) return '';
    let html = `<form data-bot-config-form="${escapeHtml(botId)}" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">`;
    for (const field of fields) {
        const val = config[field.name];
        if (field.type === 'checkbox') {
            html += `
                <label style="font-size:0.72rem;color:var(--text2);display:flex;align-items:center;gap:4px;cursor:pointer">
                    <input data-field-meta="true" data-field-meta-key="auto-pos:automationPanel:input:L204" type="checkbox" name="${field.name}" ${val ? 'checked' : ''}> ${escapeHtml(field.label)}
                </label>
            `;
        } else if (field.type === 'number') {
            html += `
                <label style="font-size:0.72rem;color:var(--text2);display:flex;align-items:center;gap:4px">
                    ${escapeHtml(field.label)}:
                    <input data-field-meta="true" data-field-meta-key="auto-pos:automationPanel:input:L211" type="number" name="${field.name}" value="${val ?? field.default}" step="${field.step || 0.05}"
                           min="${field.min || 0}" max="${field.max || 1}"
                           style="width:60px;padding:2px 4px;font-size:0.72rem;border:1px solid var(--border);border-radius:4px;background:var(--bg1);color:var(--text1)">
                </label>
            `;
        }
    }
    html += '</form>';
    return html;
}
/**
 * @param {any} botId
 */
function _getConfigFields( botId: any) {
    const configs: any = {
        edd_reader: [
            {
                name: 'minConfidence',
                label: 'Confianca min.',
                type: 'number',
                default: 0.9,
                step: 0.05,
                min: 0.5,
                max: 1,
            },
            { name: 'autoCreateCampaign', label: 'Criar campanha', type: 'checkbox' },
            { name: 'stagingMode', label: 'Modo staging', type: 'checkbox' },
        ],
        photo_tagger: [
            {
                name: 'minConfidence',
                label: 'Confianca min.',
                type: 'number',
                default: 0.8,
                step: 0.05,
                min: 0.5,
                max: 1,
            },
            { name: 'autoLinkElements', label: 'Auto-vincular', type: 'checkbox' },
            { name: 'batchMode', label: 'Batch (10s)', type: 'checkbox' },
        ],
        map_auto_gen: [
            { name: 'autoGenPotentiometric', label: 'Potenciometrico', type: 'checkbox' },
            { name: 'autoGenContamination', label: 'Contaminacao', type: 'checkbox' },
            { name: 'addHiddenLayer', label: 'Layer oculto', type: 'checkbox' },
            { name: 'minPoints', label: 'Min. pontos', type: 'number', default: 4, step: 1, min: 3, max: 20 },
        ],
    };
    return configs[botId] || [];
}
