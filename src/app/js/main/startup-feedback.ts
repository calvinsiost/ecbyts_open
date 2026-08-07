// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { CONFIG } from '../config.js';
import { getCurrentLanguage, t } from '../utils/i18n/translations.js';
import { getLoadingTips, createLoadingTipPicker, LOADING_TIPS_MIN_COUNT } from '../utils/ui/loadingTips.js';
import {
    DEFAULT_HISTORY_KEY,
    computeSmoothFill,
    createEmptyHistory,
    deserializeHistory,
    formatEtaShort,
    ingestSample,
    serializeHistory,
} from '../core/feedback/bootProgressEstimator.js';
import type { BootHistory, BootProgressState } from '../core/feedback/bootProgressEstimator.js';
// number (não Timeout): window.setInterval/setTimeout em contexto browser
// sempre retornam number — tipagem explícita evita ambiguidade com @types/node.
let loadingTipsTimer: number | null = null;
let saveStatusTimer: number | null = null;
// BOOT-ENTRY-UX-001 RF-A3: gate temporal para visibilidade da barra de progresso.
// A barra começa opacity:0 (CSS .sk-progress-wrap) e só aparece (.bar-shown)
// após BOOT_BAR_THRESHOLD_MS. Em boot rápido (<600ms), o overlay faz cross-fade
// direto sem mostrar a barra — "flash" de barra em boot curto irrita mais que
// ajuda (NN/G Progress Indicators: <500ms não mostrar indicador; 600ms dá margem
// ao splash skeleton que aparece em 250ms via loading-gate.js). Fonte: Cloud Four
// "Truth, Lies and Progress Bars" — barra cosmética que aparece e some rápido
// quebra confiança ("falso-verde de UX", mesmo padrão que o Calvin audita nos scores).
const BOOT_BAR_THRESHOLD_MS = 600;
let _bootBarGateScheduled = false;
let _bootBarGateTimer: number | null = null;

function _showBootBar() {
    const wrap = document.querySelector('.sk-progress-wrap');
    if (wrap instanceof HTMLElement) {
        wrap.classList.add('bar-shown');
    }
}

function _scheduleBootBarGate() {
    if (_bootBarGateScheduled) return;
    _bootBarGateScheduled = true;
    _bootBarGateTimer = window.setTimeout(() => {
        _bootBarGateTimer = null;
        if (!(window as any).__ecbytsBootDone) {
            _showBootBar();
        }
    }, BOOT_BAR_THRESHOLD_MS);
}

/**
 * Cancela o gate da barra de progresso — chamado por _finishLoadingOverlay
 * quando o boot conclui. Se o boot foi rápido (<600ms), a barra nunca aparece.
 * BOOT-ENTRY-UX-001 RF-A3.
 */
export function cancelBootBarGate(): void {
    if (_bootBarGateTimer != null) {
        window.clearTimeout(_bootBarGateTimer);
        _bootBarGateTimer = null;
    }
}
// TRUST-011 (claude - novaspec, 2026-05-30): boot progress state + smooth-fill rAF tick.
// Lógica pura delegada a core/feedback/bootProgressEstimator.ts; aqui só state + DOM.
let _bootHistory: BootHistory = createEmptyHistory();
let _bootHistoryLoaded = false;
let _bootState: BootProgressState | null = null;
let _bootRafHandle: number | null = null;
function _loadBootHistoryOnce() {
    if (_bootHistoryLoaded) return;
    _bootHistoryLoaded = true;
    try {
        const raw = window.localStorage?.getItem(DEFAULT_HISTORY_KEY) || null;
        _bootHistory = deserializeHistory(raw);
    } catch (err: unknown) {
        console.debug('[startup-feedback] boot history load skipped:', (err as Error)?.message || err);
        _bootHistory = createEmptyHistory();
    }
}
function _persistBootHistorySafe() {
    try {
        window.localStorage?.setItem(DEFAULT_HISTORY_KEY, serializeHistory(_bootHistory));
    } catch (err: unknown) {
        console.debug('[startup-feedback] boot history persist skipped:', (err as Error)?.message || err);
    }
}
function _cancelBootRaf() {
    if (_bootRafHandle != null && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(_bootRafHandle);
    }
    _bootRafHandle = null;
}
/**
 * Clamp monotônico da barra de boot: nunca deixa a largura regredir na tela.
 * Lê a largura atual (style.width em %), e devolve max(atual, candidato) em [0,100].
 * Mata o "vai e volta" causado pelos dois escritores concorrentes (pct discreto + RAF).
 */
function _maxBarWidthPct(bar: HTMLElement | null, candidatePct: number): number {
    const cand = Number.isFinite(Number(candidatePct)) ? Math.max(0, Math.min(100, Number(candidatePct))) : 0;
    const cur = parseFloat((bar && bar.style && bar.style.width) || '0') || 0;
    return Math.max(cur, cand);
}
// Roteiro canônico das marcas de boot (pct → chave de fase ESTÁVEL p/ EMA do histórico).
// Fix 2026-06-25 (ETA morto, GAP-1 do estudo de loading): startup-feedback passava []
// como phasesRemainingTargets a computeSmoothFill/estimateEtaMs → o ETA NUNCA aparecia,
// apesar de toda a lógica existir em bootProgressEstimator. Aqui declaramos as marcas
// reais (boot-preflight 5/15/25/35/45 · post-shell 80/90 · random-postboot 94/97/100) com
// chaves estáveis (NÃO o phaseLabel traduzido, que varia por idioma), e abaixo derivamos
// "fases que ainda faltam" = marcas com pct > targetPct atual, para o ETA estimar o restante.
const BOOT_MARKS: ReadonlyArray<{ pct: number; phase: string }> = Object.freeze([
    { pct: 5, phase: 'i18n' },
    { pct: 15, phase: 'modules' },
    { pct: 25, phase: 'libraries' },
    { pct: 35, phase: 'neural' },
    { pct: 45, phase: 'auth' },
    { pct: 80, phase: 'handlers' },
    { pct: 90, phase: 'interface' },
    { pct: 94, phase: 'terrain' },
    { pct: 97, phase: 'scene' },
    { pct: 100, phase: 'ready' },
]);
/** Marcas que ainda vão ocorrer (pct estritamente acima do alvo atual) — alimenta o ETA. */
function _phasesRemaining(currentTargetPct: number): Array<{ pct: number; phase: string }> {
    const cur = Number(currentTargetPct) || 0;
    return BOOT_MARKS.filter((m) => m.pct > cur);
}
function _scheduleBootRaf() {
    if (typeof window.requestAnimationFrame !== 'function') return;
    _cancelBootRaf();
    const tick = () => {
        _bootRafHandle = null;
        if (!_bootState) return;
        const bar = document.getElementById('loading-bar-fill');
        const etaEl = document.getElementById('loading-eta');
        const txt = document.getElementById('loading-status');
        if (!bar) return;
        const r = computeSmoothFill(_bootState, _bootHistory, _phasesRemaining(_bootState.targetPct), Date.now());
        // MONOTÔNICO: idem updateLoading — o smooth-fill nunca recua a barra na tela.
        bar.style.width = _maxBarWidthPct(bar, r.renderedPct).toFixed(2) + '%';
        if (etaEl && Number.isFinite(r.etaToCompletionMs)) {
            etaEl.textContent = formatEtaShort(r.etaToCompletionMs);
        }
        if (r.stuck && txt && _bootState.currentPhase) {
            // Mensagem dual: status original + indicador stuck (anti-spinner-feel).
            // TRUST-011 i18n: chave boot.stuck.message (en-US/pt-BR/es-LA) com var {{phase}}.
            const base = txt.dataset.bootMsg || txt.textContent || '';
            const stuckMsg = t('boot.stuck.message', { phase: _bootState.currentPhase });
            txt.textContent = `${base} — ${stuckMsg}`;
        }
        if (r.renderedPct < _bootState.targetPct - 0.05) {
            _bootRafHandle = window.requestAnimationFrame(tick);
        }
    };
    _bootRafHandle = window.requestAnimationFrame(tick);
}
export function updateLoading(msg: string, pct: number): void {
    const bar = document.getElementById('loading-bar-fill');
    const txt = document.getElementById('loading-status');
    if (bar)
        // MONOTÔNICO (fix 2026-06-25 — "vai e volta" do boot): a barra é escrita por DOIS
        // caminhos concorrentes — este pct discreto e o RAF de smooth-fill interpolado. Se o
        // pct discreto chega ABAIXO da largura já interpolada na tela (fase terminou antes do
        // ETA estimado), a barra RECUA e depois sobe = sensação de "indo e voltando". Barra de
        // progresso NUNCA deve regredir (NN/g): só avança. clamp = max(largura atual, novo).
        bar.style.width = _maxBarWidthPct(bar, Number(pct)) + '%';
    if (txt) {
        txt.textContent = msg;
        txt.dataset.bootMsg = String(msg || '');
    }
    // TRUST-011: agregar sample no histórico + agendar smooth tick.
    _loadBootHistoryOnce();
    const now = Date.now();
    if (_bootState && Number.isFinite(_bootState.targetSetAt) && _bootState.currentPhase) {
        const duration = now - _bootState.targetSetAt;
        if (duration >= 0 && duration < 5 * 60 * 1000) {
            _bootHistory = ingestSample(_bootHistory, {
                phase: _bootState.currentPhase,
                targetPct: _bootState.targetPct,
                durationMs: duration,
                recordedAt: now,
            });
            _persistBootHistorySafe();
        }
    }
    // Chave de fase ESTÁVEL p/ o EMA do histórico: mapeia o pct às marcas canônicas
    // (BOOT_MARKS) — invariante entre idiomas. Só cai no label traduzido se o pct não
    // bater nenhuma marca (ex: random-boot dinâmico). Isso faz o ETA casar o histórico.
    const canonicalMark = BOOT_MARKS.find((m) => m.pct === (Number(pct) || 0));
    const phaseLabel = canonicalMark
        ? canonicalMark.phase
        : (typeof msg === 'string' ? msg.replace(/[.…]+$/, '').trim().toLowerCase() : `pct-${pct}`);
    _bootState = {
        targetPct: Number(pct) || 0,
        targetSetAt: now,
        previousPct: _bootState ? _bootState.targetPct : 0,
        previousSetAt: _bootState ? _bootState.targetSetAt : now,
        currentPhase: phaseLabel,
    };
    if (Number(pct) >= 100) {
        _cancelBootRaf();
    } else {
        _scheduleBootRaf();
    }
}
export function startLoadingTips() {
    // BOOT-ENTRY-UX-001 RF-A3: agenda gate temporal da barra de progresso.
    // Se o boot concluír antes de 600ms, a barra nunca aparece (cancelBootBarGate
    // é chamado por _finishLoadingOverlay em random-postboot.ts).
    _scheduleBootBarGate();
    if (!CONFIG.FEATURES.FIRST_JOURNEY_LOADING_TIPS)
        return;
    const tipEl = document.getElementById('loading-subtitle-tip');
    if (!tipEl)
        return;
    stopLoadingTips();
    const locale = getCurrentLanguage?.() || 'pt-BR';
    const tips = getLoadingTips(locale);
    if (!Array.isArray(tips) || tips.length < LOADING_TIPS_MIN_COUNT)
        return;
    const pickTip = createLoadingTipPicker(tips, 10);
    const renderTip = () => {
        const next = pickTip();
        tipEl.style.opacity = '0';
        window.setTimeout(() => {
            tipEl.textContent = next;
            tipEl.style.opacity = '1';
        }, 160);
    };
    renderTip();
    loadingTipsTimer = window.setInterval(renderTip, 2600);
}
export function stopLoadingTips() {
    if (loadingTipsTimer) {
        window.clearInterval(loadingTipsTimer);
        loadingTipsTimer = null;
    }
}
export function forceDismissWelcomeOverlays(): void {
    const overlays = document.querySelectorAll('.welcome-overlay');
    if (!overlays.length)
        return;
    overlays.forEach((overlay: Element) => {
        if (!(overlay instanceof HTMLElement))
            return;
        overlay.classList.remove('active');
        overlay.style.pointerEvents = 'none';
        overlay.style.opacity = '0';
        window.setTimeout(() => {
            if (overlay.isConnected)
                overlay.remove();
        }, 0);
    });
    // Sinal real de "welcome saiu" para quem aguarda o fim dos portões de 1ª
    // visita (privacyNotice._waitForWelcomeGone). Ao remover o overlay à força —
    // sem passar pelo close() do welcomeScreen, que emite 'welcome:complete' — é
    // este evento que evita a espera pelo timer cego de 15s, cujo disparo montava
    // o consent por cima de uma interação em curso (UI-EVAL-COVERAGE-001).
    try {
        window.dispatchEvent(new CustomEvent('welcome:dismissed'));
    } catch (err: unknown) {
        console.debug('[startup-feedback] welcome:dismissed dispatch skipped:', (err as Error)?.message || err);
    }
}
export function setSaveStatus(state: string, detail: string = ''): void {
    if (!CONFIG.FEATURES.FIRST_JOURNEY_SAVE_STATUS)
        return;
    const el = document.getElementById('status-save-state');
    if (!el)
        return;
    el.dataset.state = state;
    if (state === 'saving') {
        el.textContent = detail || 'Salvando...';
        return;
    }
    if (state === 'saved') {
        el.textContent = detail || 'Salvo';
        if (saveStatusTimer)
            window.clearTimeout(saveStatusTimer);
        saveStatusTimer = window.setTimeout(() => {
            const nowEl = document.getElementById('status-save-state');
            if (nowEl && nowEl.dataset.state === 'saved')
                nowEl.textContent = 'Pronto';
        }, 3500);
        return;
    }
    if (state === 'failed') {
        el.textContent = detail || 'Falha ao salvar';
        return;
    }
    el.textContent = detail || 'Pronto';
}
export function bindSaveStatusRetry(onRetry?: () => void): void {
    if (!CONFIG.FEATURES.FIRST_JOURNEY_SAVE_STATUS)
        return;
    const el = document.getElementById('status-save-state');
    if (!el || el.dataset.retryBound === '1')
        return;
    el.dataset.retryBound = '1';
    el.title = 'Falha: clique para tentar salvar. Sucesso: clique para abrir os 5 ultimos autosaves.';
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
        if (el.dataset.state === 'failed') {
            setSaveStatus('saving', 'Tentando novamente...');
            if (typeof onRetry === 'function')
                onRetry();
            return;
        }
        if (typeof window.handleOpenAutosaveHistory === 'function') {
            window.handleOpenAutosaveHistory();
        }
    });
}
