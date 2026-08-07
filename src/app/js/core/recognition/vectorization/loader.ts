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
   OPENCV LOADER — Lazy CDN singleton for OpenCV.js (WASM)
   ================================================================

   Carrega OpenCV.js sob demanda via <script> tag. OpenCV.js nao e
   ES module — seta window.cv como global apos compilacao WASM.

   Padrao singleton identico ao segformerDetector.js: carrega uma vez,
   reutiliza entre chamadas. ~8 MB download (cached pelo browser).

   REGRA CRITICA: JavaScript GC NAO limpa memoria C++ do WASM.
   Todo cv.Mat/MatVector/Hierarchy alocado DEVE ser deletado com
   .delete() dentro de try/finally. Zero leaks permitidos.

   ================================================================ */

// ----------------------------------------------------------------
// CDN CONFIGURATION
// ----------------------------------------------------------------

// NOTA: docs.opencv.org nao e CDN com SLA - risco de indisponibilidade.
// Nao existe pacote npm confiavel para OpenCV 4.9.0 WASM (~8 MB).
// TODO: self-host em /vendor/opencv-4.9.0.js no Bluehost para resiliencia.
const OPENCV_CDN = 'https://docs.opencv.org/4.9.0/opencv.js';
const LOAD_TIMEOUT_MS = 30000; // 30s timeout — falls back to BFS if exceeded

// ----------------------------------------------------------------
// SINGLETON STATE
// Carregado uma unica vez; reutilizado entre chamadas
// ----------------------------------------------------------------

let _cv: any = null;
let _loading = false;
let _loadPromise: any = null;

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Load OpenCV.js from CDN and return the cv instance.
 * Carrega OpenCV via script tag injection com callback WASM.
 *
 * @param onProgress? - Callback: { status, message, progress }
 * @returns OpenCV cv instance (window.cv)
 */
export async function getOpenCV(onProgress?: Function): Promise<object> {
    // Already loaded - return immediately
    if (_cv) return _cv;

    // Deduplicate concurrent calls - return existing promise
    if (_loading && _loadPromise) return _loadPromise;

    _loading = true;
    _loadPromise = new Promise((resolve, reject) => {
        _notify(onProgress, 'loading', 'Loading OpenCV.js (~8 MB)...', 0);

        let settled = false; // Guard against double resolve/reject

        // Timeout guard - rejeita e dispara fallback BFS se exceder 30s
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            _loading = false;
            _loadPromise = null;
            reject(new Error(`OpenCV.js load timeout (${LOAD_TIMEOUT_MS / 1000}s) — using fallback`));
        }, LOAD_TIMEOUT_MS);

        // Check if cv is already on window (e.g. loaded by another script)
        if (typeof window !== 'undefined' && (window as any).cv && (window as any).cv.Mat) {
            settled = true;
            clearTimeout(timer);
            _cv = (window as any).cv;
            _loading = false;
            _notify(onProgress, 'ready', 'OpenCV.js ready', 100);
            resolve(_cv);
            return;
        }

        // Inject <script> tag - OpenCV.js sets window.cv on load
        const script = document.createElement('script');
        script.src = OPENCV_CDN;
        script.async = true;

        // OpenCV.js WASM calls Module.onRuntimeInitialized when ready
        // We must set this BEFORE the script loads
        const prevOnReady = (window as any).Module?.onRuntimeInitialized;
        (window as any).Module = (window as any).Module || {};
        (window as any).Module.onRuntimeInitialized = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            // Restore previous callback if any
            if (prevOnReady) prevOnReady();

            if ((window as any).cv && (window as any).cv.Mat) {
                _cv = (window as any).cv;
                _loading = false;
                _notify(onProgress, 'ready', 'OpenCV.js ready', 100);
                resolve(_cv);
            } else {
                _loading = false;
                reject(new Error('OpenCV.js loaded but cv.Mat not available'));
            }
        };

        script.onerror = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            _loading = false;
            _loadPromise = null;
            // Remove broken script tag
            script.remove();
            reject(new Error(`Failed to load OpenCV.js from CDN: ${OPENCV_CDN}`));
        };

        _notify(onProgress, 'downloading', 'Downloading OpenCV.js...', 30);
        document.head.appendChild(script);
    });

    return _loadPromise;
}

/**
 * Check if OpenCV.js is already loaded and ready.
 * Verifica se o modulo WASM ja foi carregado.
 */
export function isOpenCVLoaded(): boolean {
    return _cv !== null;
}

/**
 * Synchronous access to cv instance (after load).
 * Acesso sincrono apos carregamento. Lanca erro se nao carregado.
 *
 * @returns OpenCV cv instance
 * @throws {Error} If OpenCV not loaded yet
 */
export function getCV(): object {
    if (!_cv) {
        throw new Error('OpenCV.js not loaded. Call getOpenCV() first.');
    }
    return _cv;
}

/**
 * Reset singleton state for testing.
 * Permite que testes E2E limpem o estado travado do loader.
 * @private - Somente para testes
 */
export function _resetForTesting(): void {
    _cv = null;
    _loading = false;
    _loadPromise = null;
}

// ----------------------------------------------------------------
// INTERNAL - Progress notification helper
// Mesmo padrao de _notify do segformerDetector.js
// ----------------------------------------------------------------

function _notify(cb: any, status: any, message: any, progress: any): void {
    if (typeof cb === 'function') {
        cb({ status, message, progress });
    }
}
