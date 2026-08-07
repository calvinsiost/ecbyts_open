// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   SENSOR AUTO-REFRESH — Per-sensor polling with exponential backoff
   Polling configurável por sensor com backoff em falhas de rede

   Intervalos mínimos de 5 min (Open-Meteo atualiza a cada ~15 min).
   Respeita visibilidade da tab e detecta estado offline.
   ================================================================ */

import { getElementById, updateElement } from '../elements/manager.js';

// ----------------------------------------------------------------
// STATE
// Estado do módulo em closure (padrão do projeto)
// ----------------------------------------------------------------

/** @type {Map<string, {intervalId: number, intervalMs: number, failCount: number, fetchFn: Function}>} */
const _activePolls = new Map();

/** Intervalos disponíveis (mínimo 5 min — Open-Meteo atualiza ~15 min) */
export const REFRESH_INTERVALS = {
    '5min': 300000,
    '15min': 900000,
    '30min': 1800000,
};

const DEFAULT_INTERVAL = '15min';
const _MAX_BACKOFF_MS = 600000; // 10 min
const MAX_CONSECUTIVE_FAILURES = 5;

// ----------------------------------------------------------------
// CORE API
// Interface pública do módulo de auto-refresh
// ----------------------------------------------------------------

/**
 * Start auto-refresh polling for a sensor element.
 * Faz um fetch imediato e depois agenda intervalo regular.
 * Idempotente - se já está ativo, para e reinicia com novo intervalo.
 *
 * @param {string} elementId - ID do elemento sensor
 * @param {string} intervalKey - Chave do intervalo ('5min', '15min', '30min')
 * @param {Function} fetchFn - Callback async para buscar dados (handleFetchSensorDataSilent)
 */
export function startAutoRefresh(elementId: any, intervalKey: any, fetchFn: any) {
    // Para polling anterior se existir (idempotente)
    stopAutoRefresh(elementId);

    const intervalMs =
        (REFRESH_INTERVALS as Record<string, number>)[intervalKey] ||
        (REFRESH_INTERVALS as Record<string, number>)[DEFAULT_INTERVAL];

    // Marca elemento como ativo
    const el = getElementById(elementId);
    if (el) {
        updateElement(elementId, {
            data: { ...el.data, _autoRefreshActive: true, _autoRefreshInterval: intervalKey || DEFAULT_INTERVAL },
        });
    }

    // Fetch imediato ao iniciar
    fetchFn(elementId);

    // Agenda polling regular
    const intervalId = setInterval(() => {
        _onTick(elementId);
    }, intervalMs);

    _activePolls.set(elementId, {
        intervalId,
        intervalMs,
        failCount: 0,
        fetchFn,
    });
}

/**
 * Stop auto-refresh polling for a sensor element.
 * Limpa intervalo e atualiza estado do elemento.
 *
 * @param {string} elementId - ID do elemento sensor
 */
export function stopAutoRefresh(elementId: any) {
    const poll = _activePolls.get(elementId);
    if (!poll) return;

    clearInterval(poll.intervalId);
    _activePolls.delete(elementId);

    // Atualiza estado no elemento
    const el = getElementById(elementId);
    if (el) {
        updateElement(elementId, {
            data: { ...el.data, _autoRefreshActive: false, _autoRefreshInterval: null },
        });
    }
}

/**
 * Stop all active auto-refresh polls.
 * Chamado ao limpar modelo ou importar novo.
 */
export function stopAllAutoRefresh() {
    for (const [elementId] of _activePolls) {
        stopAutoRefresh(elementId);
    }
}

/**
 * Get auto-refresh status for a sensor.
 *
 * @param {string} elementId
 * @returns {{ active: boolean, intervalKey: string, failCount: number } | null}
 */
export function getAutoRefreshStatus(elementId: any) {
    const poll = _activePolls.get(elementId);
    if (!poll) return null;
    const intervalKey =
        Object.entries(REFRESH_INTERVALS).find(([, ms]) => ms === poll.intervalMs)?.[0] || DEFAULT_INTERVAL;
    return { active: true, intervalKey, failCount: poll.failCount };
}

// ----------------------------------------------------------------
// INTERNAL
// Lógica de tick, backoff e visibilidade
// ----------------------------------------------------------------

/**
 * Tick handler - executa fetch respeitando tab visibility e backoff.
 * @param {string} elementId
 */
async function _onTick(elementId: any) {
    // Skip se tab não está visível (economia de rede/bateria)
    if (document.hidden) return;

    // Skip se offline
    if (!navigator.onLine) return;

    const poll = _activePolls.get(elementId);
    if (!poll) return;

    try {
        await poll.fetchFn(elementId);
        // Sucesso - reset backoff
        poll.failCount = 0;
    } catch (err) {
        console.warn(`[ecbyts:autoRefresh] Fetch failed for ${elementId}:`, (err as Error)?.message);
        poll.failCount++;

        if (poll.failCount >= MAX_CONSECUTIVE_FAILURES) {
            _pauseWithNotification(elementId);
        }
    }
}

/**
 * Pause auto-refresh after consecutive failures.
 * Mostra toast único e para o polling.
 *
 * @param {string} elementId
 */
function _pauseWithNotification(elementId: any) {
    stopAutoRefresh(elementId);

    // Toast notification (dynamic import para evitar dependência circular)
    import('../../utils/ui/toast.js')
        .then(({ showToast }) => {
            import('../../utils/i18n/translations.js').then(({ t }) => {
                showToast((t as any)('sensorAutoRefreshPaused') || 'Auto-refresh paused (network)', 'warning');
            });
        })
        .catch((_e) => console.debug('[core/sensor/autoRefresh:silent-catch]', _e?.message || _e));
}

// ----------------------------------------------------------------
// ONLINE/OFFLINE EVENT LISTENERS
// Detecta reconexão de rede para retomar polling
// ----------------------------------------------------------------

/** Listener registrado uma vez no carregamento do módulo */
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        // Reset failCount de todos os polls ativos
        for (const [, poll] of _activePolls) {
            poll.failCount = 0;
        }
    });
}
