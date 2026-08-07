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

/* ================================================================
   DEMO TICKER — Tech log integration with existing ticker bar
   Integracao de logs tecnicos com a barra de ticker existente

   Cria um overlay dedicado dentro do ticker-bar que exibe logs
   em tempo real sem ser sobrescrito pelo renderTicker regular.
   O overlay é removido quando a demo termina.

   ================================================================ */

// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------

/** Demo overlay inside ticker bar */
let demoOverlay: HTMLElement | null = null;

/** Active simulation interval */
let activeInterval: ReturnType<typeof setInterval> | null = null;

/** Resolve function for current simulation promise */
let simulationResolve: (() => void) | null = null;

// ----------------------------------------------------------------
// OVERLAY MANAGEMENT
// Cria/remove um div overlay dentro do ticker-bar
// ----------------------------------------------------------------

function ensureOverlay(): HTMLElement | null {
    if (demoOverlay && demoOverlay.parentElement) return demoOverlay;

    const bar = document.getElementById('ticker-bar');
    if (!bar) return null;

    // Garante ticker visivel
    bar.style.display = '';

    // Cria overlay que cobre o ticker-track
    demoOverlay = document.createElement('div');
    demoOverlay.id = 'demo-ticker-overlay';
    demoOverlay.style.cssText = `
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        display: flex;
        align-items: center;
        overflow: hidden;
        background: var(--surface, #1e1e2e);
        z-index: 5;
        padding: 0 12px;
    `;

    // O ticker-bar precisa ser position:relative para o overlay funcionar
    const computed = window.getComputedStyle(bar);
    if (computed.position === 'static') {
        bar.style.position = 'relative';
    }

    bar.appendChild(demoOverlay);
    return demoOverlay;
}

function removeOverlay(): void {
    if (demoOverlay && demoOverlay.parentElement) {
        demoOverlay.parentElement.removeChild(demoOverlay);
    }
    demoOverlay = null;
}

// ----------------------------------------------------------------
// DEMO TICKER LOG MANAGEMENT
// ----------------------------------------------------------------

/**
 * Add demo-specific ticker items (tech logs).
 * Renderiza logs no overlay dedicado.
 */
export function addDemoTickerLogs(logs: Array<{ label: string; value: string; color?: string }>): void {
    if (!logs || logs.length === 0) return;
    renderDemoTicker(logs);
}

/**
 * Clear all demo ticker items.
 * Para simulacao e remove overlay.
 */
export function clearDemoTickerLogs(): void {
    // Para simulacao em andamento
    if (activeInterval) {
        clearInterval(activeInterval);
        activeInterval = null;
    }
    if (simulationResolve) {
        simulationResolve();
        simulationResolve = null;
    }

    // Remove overlay
    removeOverlay();
}

/**
 * Simulate sequential ticker logs with delay between each.
 * Exibe logs um a um no overlay com intervalo entre eles.
 *
 * @param logs - Array of log messages
 * @param intervalMs - Delay between each log (ms)
 * @returns Resolves when all logs have been displayed
 */
export function simulateTickerSequence(logs: string[], intervalMs: number = 500): Promise<void> {
    return new Promise((resolve) => {
        if (!logs || logs.length === 0) {
            resolve();
            return;
        }

        // Para simulacao anterior se existir
        if (activeInterval) {
            clearInterval(activeInterval);
        }
        if (simulationResolve) {
            simulationResolve();
        }

        simulationResolve = resolve;

        let idx = 0;
        const displayedLogs: Array<{ label: string; value: string; color?: string }> = [];

        // Mostra primeiro log imediatamente
        displayedLogs.push({ label: logs[0] as string, value: '', color: '#00ff88' });
        renderDemoTicker(displayedLogs);
        idx = 1;

        if (logs.length === 1) {
            simulationResolve = null;
            resolve();
            return;
        }

        activeInterval = setInterval(() => {
            if (idx >= logs.length) {
                if (activeInterval) clearInterval(activeInterval);
                activeInterval = null;
                simulationResolve = null;
                resolve();
                return;
            }

            displayedLogs.push({
                label: logs[idx] as string,
                value: '',
                color: getLogColor(logs[idx] as string),
            });

            // Manter apenas ultimos 5 logs visiveis
            const visible = displayedLogs.slice(-5);
            renderDemoTicker(visible);
            idx++;
        }, intervalMs);
    });
}

// ----------------------------------------------------------------
// INTERNAL RENDERING
// ----------------------------------------------------------------

/**
 * Render demo logs into the dedicated overlay.
 * Nao afeta o ticker-content regular.
 */
function renderDemoTicker(logs: Array<{ label: string; value?: string; color?: string }>): void {
    const overlay = ensureOverlay();
    if (!overlay) return;

    const sep = '<span class="ticker-separator" style="color:#555;margin:0 8px;"> \u2022 </span>';
    const html = logs
        .map((log) => {
            const color = log.color || '#00ff88';
            const text = escapeHtml(log.label + (log.value ? ` ${log.value}` : ''));
            return `<span class="demo-ticker-item" style="color:${color};font-family:'JetBrains Mono','Fira Code',monospace;font-size:11px;white-space:nowrap;">${text}</span>`;
        })
        .join(sep);

    overlay.innerHTML = html;
}

/**
 * Determine log color based on prefix/content.
 */
function getLogColor(log: string): string {
    if (log.includes('[NEURAL_NET]') || log.includes('[TRAINING]')) return '#ff6b9d';
    if (log.includes('[LLM_AGENT]') || log.includes('[KNOWLEDGE_BASE]')) return '#6baaff';
    if (log.includes('[SAT_RECOG]') || log.includes('[NDVI]')) return '#ffd700';
    if (log.includes('[ALERT]') || log.includes('[WARNING]')) return '#ff4444';
    if (log.includes('[OK]') || log.includes('[SUCCESS]')) return '#44ff44';
    return '#00ff88';
}

/**
 * Basic HTML escaping.
 */
function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
