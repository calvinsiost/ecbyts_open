// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Loading Overlay - Indicador universal de carregamento
 *
 * Overlay fullscreen reutilizavel para operacoes async longas:
 * processamento de arquivos, carregamento de IA, etc.
 *
 * API:
 *   showLoading(message?)         - mostra overlay com spinner
 *   hideLoading()                 - esconde overlay
 *   setLoadingMessage(msg)        - atualiza mensagem sem piscar
 *   setLoadingProgress(pct, msg?) - modo progress bar (0-100)
 *   withLoading(promise, msg?)    - auto show/hide em torno de promise
 */

// ── Estado ──────────────────────────────────────────────────
let _overlay: any = null;
let _messageEl: any = null;
let _progressBar: any = null;
let _progressTrack: any = null;
let _percentEl: any = null;
let _visible = false;
let _refCount = 0; // permite chamadas aninhadas
let _startTime = 0;
let _timerInterval: any = null;
let _stuckTimer: any = null;
const LOADING_MAX_MS = 180000; // failsafe: evita loading infinito

// ── CSS agora em app/css/loading-overlay.css (link tag em index.html) ───

// ── Inicializacao lazy ──────────────────────────────────────
function _ensureDOM(): void {
    if (_overlay) return;

    // CSS carregado via <link> em index.html (loading-overlay.css)

    // Criar overlay
    _overlay = document.createElement('div');
    _overlay.className = 'ecbt-loading-overlay';
    _overlay.innerHTML = `
        <div class="ecbt-loading-card">
            <div class="ecbt-loading-spinner"></div>
            <div class="ecbt-loading-message"></div>
            <div class="ecbt-loading-percent"></div>
            <div class="ecbt-loading-progress-track">
                <div class="ecbt-loading-progress-bar"></div>
            </div>
            <button class="ecbt-loading-cancel" data-cc-action="cc-ed2364e7" title="Cancel">&#10005;</button>
        </div>
    `;
    _messageEl = _overlay.querySelector('.ecbt-loading-message');
    _percentEl = _overlay.querySelector('.ecbt-loading-percent');
    _progressTrack = _overlay.querySelector('.ecbt-loading-progress-track');
    _progressBar = _overlay.querySelector('.ecbt-loading-progress-bar');
    document.body.appendChild(_overlay);
}

// ── API Publica ─────────────────────────────────────────────

/**
 * Mostra overlay de carregamento.
 * Chamadas aninhadas sao seguras (ref-counted).
 * @param message - Mensagem exibida abaixo do spinner
 */
export function showLoading(message: string = ''): void {
    _ensureDOM();
    _refCount++;
    _messageEl.textContent = message;
    _progressTrack.style.display = 'none';
    _progressBar.style.width = '0%';
    if (_percentEl) {
        _percentEl.style.display = 'none';
        _percentEl.textContent = '';
    }
    if (!_visible) {
        _visible = true;
        _startTime = Date.now();
        _startElapsedTimer();
        _startStuckTimer();
        _overlay.offsetHeight;
        _overlay.classList.add('visible');
    }
}

/**
 * Timer que atualiza tempo decorrido a cada segundo (quando sem progress bar).
 */
function _startElapsedTimer(): void {
    _stopElapsedTimer();
    _timerInterval = setInterval(() => {
        if (!_visible || !_percentEl) return;
        // So mostrar elapsed se nao estiver em modo progress (que ja mostra %)
        if (_progressTrack && _progressTrack.style.display === 'block') return;
        const elapsed = Math.floor((Date.now() - _startTime) / 1000);
        if (elapsed >= 2) {
            _percentEl.style.display = 'block';
            _percentEl.textContent = _formatElapsed(elapsed);
        }
    }, 1000);
}

function _stopElapsedTimer(): void {
    if (_timerInterval) {
        clearInterval(_timerInterval);
        _timerInterval = null;
    }
}

function _startStuckTimer(): void {
    _stopStuckTimer();
    _stuckTimer = setTimeout(() => {
        if (!_visible) return;
        const elapsedMs = Date.now() - _startTime;
        console.warn(`[loadingOverlay] force hide after ${elapsedMs}ms`);
        forceHideLoading();
        try {
            window.dispatchEvent(new CustomEvent('ecbyts:loading-stuck', { detail: { elapsedMs } }));
        } catch (e) {
            console.debug('[loadingOverlay] dispatchStuck:', (e as any)?.message || e);
            // noop
        }
    }, LOADING_MAX_MS);
}

function _stopStuckTimer(): void {
    if (_stuckTimer) {
        clearTimeout(_stuckTimer);
        _stuckTimer = null;
    }
}

function _formatElapsed(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
}

/**
 * Esconde overlay. Se houve chamadas aninhadas, so esconde quando
 * todas terminarem.
 */
export function hideLoading(): void {
    if (_refCount > 0) _refCount--;
    if (_refCount <= 0) {
        _refCount = 0;
        _visible = false;
        _stopElapsedTimer();
        _stopStuckTimer();
        if (_overlay) _overlay.classList.remove('visible');
    }
}

/**
 * Atualiza mensagem sem piscar o overlay.
 */
export function setLoadingMessage(message: string): void {
    if (_messageEl) _messageEl.textContent = message;
}

/**
 * Ativa modo progress bar e atualiza percentual.
 * @param percent - 0 a 100
 * @param message? - Mensagem opcional (atualiza se fornecida)
 */
export function setLoadingProgress(percent: number, message?: string): void {
    _ensureDOM();
    const pct = Math.min(100, Math.max(0, percent));
    if (_progressTrack) _progressTrack.style.display = 'block';
    if (_progressBar) _progressBar.style.width = pct + '%';
    if (message !== undefined && _messageEl) _messageEl.textContent = message;

    // Mostrar percentual + ETA
    if (_percentEl && pct > 0) {
        _percentEl.style.display = 'block';
        const elapsed = (Date.now() - _startTime) / 1000;
        let etaText = '';
        if (pct > 5 && elapsed > 2) {
            const totalEstimated = elapsed / (pct / 100);
            const remaining = Math.max(0, Math.ceil(totalEstimated - elapsed));
            etaText = remaining > 0 ? ` &#8212; ~${_formatElapsed(remaining)} restante` : '';
        }
        _percentEl.innerHTML = `${Math.round(pct)}%${etaText}`;
    }
}

/**
 * Wrapper: mostra loading durante execucao de uma Promise.
 * @param promise - Promise a executar
 * @param message - Mensagem
 * @returns Resultado da promise original
 */
export async function withLoading(promise: Promise<any>, message: string = 'Processing...'): Promise<any> {
    showLoading(message);
    try {
        return await promise;
    } finally {
        hideLoading();
    }
}

/**
 * Forca reset do loading (limpa ref count).
 * Usar apenas em error boundaries.
 */
export function forceHideLoading(): void {
    _refCount = 0;
    _visible = false;
    _stopElapsedTimer();
    _stopStuckTimer();
    if (_overlay) _overlay.classList.remove('visible');
}
