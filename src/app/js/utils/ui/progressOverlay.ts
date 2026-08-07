// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.1.5
/**
 * progressOverlay.js - Modal overlay de progresso para operacoes longas.
 *
 * Exibe progress bar, fase atual, e log de warnings/erros em tempo real.
 * Valor principal: surfacea warnings que hoje ficam escondidos no console.
 *
 * @module utils/ui/progressOverlay
 */
import { t } from '../i18n/translations.js';
// ---------------------------------------------------------------------------
// Singleton guard - apenas 1 overlay por vez
// ---------------------------------------------------------------------------
/** @type {any} */
let _activeOverlay: any = null;

// IMPORT-UX-001 RF-5: mapa de tradução das mensagens do documentWorker.
// O Worker roda em thread separada e não tem acesso a t(); envia strings
// em inglês. Aqui no主thread traduzimos os padrões conhecidos.
const WORKER_MSG_I18N_MAP: Array<{ pattern: RegExp; key: string; params?: (m: RegExpMatchArray) => Record<string, string> }> = [
    { pattern: /^Loading PDF parser/, key: 'import.loadingPdfParser' },
    { pattern: /^Loading DOCX parser/, key: 'import.loadingDocxParser' },
    {
        pattern: /^Extracting page (\d+)\/(\d+)/,
        key: 'import.extractingPage',
        params: (m) => ({ current: m[1] || '0', total: m[2] || '0' }),
    },
    {
        pattern: /^Extracting images page (\d+)\/(\d+)/,
        key: 'import.extractingImagesPage',
        params: (m) => ({ current: m[1] || '0', total: m[2] || '0' }),
    },
    { pattern: /^Converting DOCX to HTML/, key: 'import.convertingDocx' },
    {
        pattern: /^Rendering page (\d+)\/(\d+) for OCR/,
        key: 'import.renderingPageOcr',
        params: (m) => ({ current: m[1] || '0', total: m[2] || '0' }),
    },
    { pattern: /^Found \d+ table/, key: 'import.foundTables' },
];

/**
 * IMPORT-UX-001 RF-5: tenta traduzir mensagem do Worker para pt-BR.
 * Retorna a string original se não houver mapeamento.
 */
function _translateWorkerMessage(raw: string): string {
    for (const entry of WORKER_MSG_I18N_MAP) {
        const m = raw.match(entry.pattern);
        if (m) {
            const translated = t(entry.key);
            if (translated && translated !== entry.key) {
                if (entry.params) {
                    const p = entry.params(m);
                    return translated.replace(/\{(\w+)\}/g, (_match: string, k: string) => p[k] || '');
                }
                return translated;
            }
        }
    }
    return raw;
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Mostra overlay de progresso para operacao longa.
 *
 * @param {string} title - titulo do overlay (ex: 'Importando dados...')
 * @returns {any} - controller para atualizar/fechar
 */
export function showProgressOverlay(title: any) {
    // Dismiss overlay anterior se existir
    if (_activeOverlay) {
        _activeOverlay.dismiss();
    }
    const overlay = document.createElement('div');
    overlay.className = 'progress-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', title);
    overlay.innerHTML = `
        <div class="progress-overlay-content">
            <h3 class="progress-overlay-title">${_escapeHtml(title)}</h3>
            <progress class="progress-overlay-bar" value="0" max="100"></progress>
            <div class="progress-overlay-phase"></div>
            <div class="progress-overlay-log" aria-live="polite"></div>
            <div class="progress-overlay-footer" style="display:none;">
                <div class="progress-overlay-summary"></div>
                <button class="btn btn-primary progress-overlay-close">${t('close') || 'Close'}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    const bar = (overlay.querySelector('.progress-overlay-bar')) as any;
    const phaseEl = (overlay.querySelector('.progress-overlay-phase')) as any;
    const logEl = (overlay.querySelector('.progress-overlay-log')) as any;
    const footerEl = (overlay.querySelector('.progress-overlay-footer')) as any;
    const summaryEl = (overlay.querySelector('.progress-overlay-summary')) as any;
    const closeBtn = (overlay.querySelector('.progress-overlay-close')) as any;
    let logCount = 0;
    const MAX_LOG_LINES = 500;

    // IMPORT-UX-001 RF-5: heartbeat visual quando etapa demora >30s.
    // Pisca o texto "..." na fase para sinalizar que o processo está vivo.
    let _lastProgressTime = Date.now();
    let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let _heartbeatDots = 0;

    function _startHeartbeat() {
        if (_heartbeatTimer) return;
        _heartbeatTimer = setInterval(() => {
            const elapsed = Date.now() - _lastProgressTime;
            if (elapsed > 30000) {
                // Heartbeat: adiciona pontos animados à fase
                _heartbeatDots = (_heartbeatDots + 1) % 4;
                const dots = '.'.repeat(_heartbeatDots);
                const base = phaseEl.textContent?.replace(/\.+$/, '') || '';
                phaseEl.textContent = base + dots;
            }
        }, 5000);
    }

    function _stopHeartbeat() {
        if (_heartbeatTimer) {
            clearInterval(_heartbeatTimer);
            _heartbeatTimer = null;
        }
    }

    function _onProgressReceived() {
        _lastProgressTime = Date.now();
        _stopHeartbeat();
        _startHeartbeat();
    }

    closeBtn.addEventListener('click', () => dismiss());

    function dismiss() {
        _stopHeartbeat();
        if (overlay.parentNode)
            overlay.remove();
        _activeOverlay = null;
    }
    function _appendLog(msg: string, cls: string) {
        if (logCount >= MAX_LOG_LINES) {
            if (logEl.firstChild)
                logEl.removeChild(logEl.firstChild);
        }
        const line = document.createElement('div');
        line.className = `progress-log-line ${cls}`;
        line.textContent = msg;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
        logCount++;
    }
    const controller = {
        /**
         * Atualiza progresso.
         * @param {string} phase - nome da fase atual
         * @param {number} current - item atual
         * @param {number} total - total de items
         */
        update(phase: any, current: any, total: any) {
            const pct = total > 0 ? Math.round((current / total) * 100) : 0;
            bar.value = pct;
            phaseEl.textContent = `${phase}... ${current}/${total}`;
            _onProgressReceived();
        },
        /**
         * IMPORT-UX-001 RF-5: atualiza mensagem do Worker com i18n + heartbeat.
         * Traduz mensagens em inglês do documentWorker para o locale ativo.
         * Contador honesto: só avança quando há progresso real recebido.
         * @param {number} percent - 0-100
         * @param {string} rawMessage - mensagem bruta do Worker (em inglês)
         */
        setMessage(percent: number, rawMessage: string) {
            const translated = _translateWorkerMessage(rawMessage);
            bar.value = percent;
            phaseEl.textContent = translated;
            _onProgressReceived();
        },
        /** Adiciona warning ao log (amarelo). */
        addWarning(msg: string) {
            _appendLog(msg, 'progress-log-warning');
        },
        /** Adiciona erro ao log (vermelho). */
        addError(msg: string) {
            _appendLog(msg, 'progress-log-error');
        },
        /** Adiciona info ao log. */
        addInfo(msg: string) {
            _appendLog(msg, 'progress-log-info');
        },
        /**
         * Finaliza overlay com resumo.
         * @param {{elements?: number, campaigns?: number, observations?: number, warnings?: number, errors?: number}} stats
         */
        finish(stats: any) {
            bar.value = 100;
            phaseEl.textContent = t('completed') || 'Completed';
            if (stats) {
                const parts = [];
                if (stats.elements != null)
                    parts.push(`${stats.elements} ${t('elements') || 'elements'}`);
                if (stats.campaigns != null)
                    parts.push(`${stats.campaigns} ${t('campaigns') || 'campaigns'}`);
                if (stats.observations != null)
                    parts.push(`${stats.observations} obs`);
                if (stats.warnings)
                    parts.push(`${stats.warnings} warnings`);
                if (stats.errors)
                    parts.push(`${stats.errors} ${t('errors') || 'errors'}`);
                summaryEl.textContent = parts.join(' | ');
            }
            footerEl.style.display = '';
            closeBtn.focus();
        },
        /** Remove overlay do DOM. */
        dismiss,
    };
    _activeOverlay = controller;
    return controller;
}
// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function _escapeHtml(str: string) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
