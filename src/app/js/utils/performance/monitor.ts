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
   PERFORMANCE MONITOR — Lightweight metrics collection
   Monitor de performance leve para medir FPS, renders, RAM e UI updates.

   Coleta metricas em tempo real sem impacto significativo.
   Expoe window.__perfMonitor para acesso via API de testes.
   ================================================================ */

// ----------------------------------------------------------------
// PERF MONITOR CLASS
// ----------------------------------------------------------------

/**
 * Lightweight performance metrics collector.
 * Coletor de metricas de performance: FPS, renders/s, RAM, UI updates.
 */
export class PerfMonitor {
    _frameCount: number;
    _renderCount: number;
    _uiUpdateCount: number;
    _fps: number;
    _rendersPerSec: number;
    _uiUpdatesPerSec: number;
    _memoryMB: number;
    _idleFrames: number;
    _loopRunning: boolean;
    _lastSampleTime: number;
    _sampleInterval: number;

    constructor() {
        // Frame counting
        this._frameCount = 0;
        this._renderCount = 0;
        this._uiUpdateCount = 0;

        // Computed metrics (updated every second)
        this._fps = 0;
        this._rendersPerSec = 0;
        this._uiUpdatesPerSec = 0;
        this._memoryMB = 0;

        // Idle tracking
        this._idleFrames = 0;
        this._loopRunning = true;

        // Timing
        this._lastSampleTime = performance.now();
        this._sampleInterval = 1000; // 1s
    }

    /**
     * Called every animation frame (in animate loop).
     * Incrementa contador de frames e atualiza metricas a cada segundo.
     */
    tickFrame(): void {
        this._frameCount++;
        this._maybeUpdateMetrics();
    }

    /**
     * Called when renderer.render() actually executes.
     * Conta renders efetivos (dirty flag was true).
     */
    tickRender(): void {
        this._renderCount++;
    }

    /**
     * Called when _runUIUpdates() executes in main.js.
     * Conta quantas vezes o refresh global rodou por segundo.
     */
    tickUIUpdate(): void {
        this._uiUpdateCount++;
    }

    /**
     * Update idle frame counter (from setup.js animate loop).
     * @param count - Current idle frame count
     */
    setIdleFrames(count: number): void {
        this._idleFrames = count;
    }

    /**
     * Update loop running state (from setup.js).
     */
    setLoopRunning(running: boolean): void {
        this._loopRunning = running;
    }

    /**
     * Get current computed metrics.
     * Retorna metricas calculadas (atualizadas a cada 1s).
     */
    getMetrics(): { fps: number; renderCount: number; uiUpdateCount: number; memoryMB: number; idleFrames: number; loopRunning: boolean } {
        // Force a fresh sample if stale (e.g. loop is paused)
        this._maybeUpdateMetrics();

        return {
            fps: this._fps,
            renderCount: this._rendersPerSec,
            uiUpdateCount: this._uiUpdatesPerSec,
            memoryMB: this._memoryMB,
            idleFrames: this._idleFrames,
            loopRunning: this._loopRunning,
        };
    }

    /**
     * Update computed metrics if sample interval has elapsed.
     * Calcula FPS, renders/s e RAM a cada 1 segundo.
     */
    _maybeUpdateMetrics(): void {
        const now = performance.now();
        const elapsed = now - this._lastSampleTime;

        if (elapsed < this._sampleInterval) return;

        const scale = 1000 / elapsed; // normalize to 1s

        this._fps = Math.round(this._frameCount * scale);
        this._rendersPerSec = Math.round(this._renderCount * scale);
        this._uiUpdatesPerSec = Math.round(this._uiUpdateCount * scale);

        // Memory (Chrome only - performance.memory is non-standard)
        const perf = performance as any;
        if (perf.memory) {
            this._memoryMB = Math.round(perf.memory.usedJSHeapSize / (1024 * 1024));
        }

        // Reset counters
        this._frameCount = 0;
        this._renderCount = 0;
        this._uiUpdateCount = 0;
        this._lastSampleTime = now;
    }
}

// ----------------------------------------------------------------
// SINGLETON & GLOBAL EXPOSURE
// ----------------------------------------------------------------

let _instance: any = null;

/**
 * Get or create the singleton PerfMonitor instance.
 * Expoe automaticamente em window.__perfMonitor para testes via API.
 */
export function getPerfMonitor(): PerfMonitor {
    if (!_instance) {
        _instance = new PerfMonitor();
        (window as any).__perfMonitor = _instance;
    }
    return _instance;
}
