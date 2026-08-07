/**
 * INSTANT-SHELL-001 — Application Shell / progressive boot helpers.
 *
 * F1 stub: exposes the feature flag and records when the non-blocking shell
 * is revealed. The actual re-ordering of main.ts (F2) and background model
 * generation (F3/F4) are implemented by the feature owner.
 *
 * Calving decision 2026-06-29: build F1-F4 with INSTANT_SHELL_BOOT default OFF;
 * flip to ON only after Calvin validates before/after screenshots.
 */
import { CONFIG } from '../config.js';

/**
 * Returns true when the instant-shell boot path is enabled.
 * Defensive: missing/undefined config falls back to legacy blocking boot.
 */
export function isInstantShellBootEnabled(): boolean {
    return CONFIG?.FEATURES?.INSTANT_SHELL_BOOT === true;
}

/**
 * Records the moment the empty 3D shell + menus become visible and interactive.
 * Writes to the existing global telemetry object so dashboards can compare
 * `shell-revealed` vs `model-ready` without adding new instrumentation.
 */
export function recordShellRevealed(timestampMs?: number): void {
    const ts = timestampMs ?? performance.now();
    if (typeof window !== 'undefined') {
        const w = window as unknown as Record<string, unknown>;
        w.__ecbyts_appReadyMs = w.__ecbyts_appReadyMs || {};
        (w.__ecbyts_appReadyMs as Record<string, number>)['shell-revealed'] = Math.round(ts);
    }
    console.log(`[ecbyts:boot] shell-revealed in ${Math.round(ts)}ms`);
}

/**
 * Records when the background-generated demo model finishes populating the scene.
 * Companion metric to `recordShellRevealed`.
 */
export function recordModelReady(timestampMs?: number): void {
    const ts = timestampMs ?? performance.now();
    if (typeof window !== 'undefined') {
        const w = window as unknown as Record<string, unknown>;
        w.__ecbyts_appReadyMs = w.__ecbyts_appReadyMs || {};
        (w.__ecbyts_appReadyMs as Record<string, number>)['model-ready'] = Math.round(ts);
    }
    console.log(`[ecbyts:boot] model-ready in ${Math.round(ts)}ms`);
}
