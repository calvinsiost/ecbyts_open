/**
 * _bootClsPure.ts — BOOT-ENTRY-UX-001 RF-E6
 *
 * Pure-logic do gate anti-CLS (Cumulative Layout Shift) na revelação.
 * Determina se o layout está estável o suficiente para o overlay começar
 * o fade-out sem causar shift visível (>0.1 CLS).
 *
 * Princípio (web.dev Optimize CLS):
 * - O canvas three.js deve ter dimensões finais (width > 0, height ≥ minHeight)
 * - Os HUD cards (#geo-hud) devem ter min-height reservado
 * - O app grid deve estar montado (não colapsado)
 *
 * Sem DOM/i18n/state — testável sem browser.
 */

/** Dimensões medidas de um container (canvas, HUD, etc). */
export interface ContainerMetrics {
    width: number;
    height: number;
}

/** Estado de estabilidade do layout para decisão de fade. */
export interface ClsStabilityInput {
    canvas: ContainerMetrics;
    geoHud: ContainerMetrics;
    appGridReady: boolean;
    rendererReady: boolean;
}

/** Resultado da avaliação de estabilidade CLS. */
export interface ClsStabilityResult {
    stable: boolean;
    reasons: string[];
}

/** Altura mínima do canvas para considerar layout estável (px). */
export const CANVAS_MIN_HEIGHT = 180;

/** Altura mínima do geo-hud para considerar layout estável (px). */
export const GEO_HUD_MIN_HEIGHT = 200;

/** Largura mínima de qualquer container visível (px). */
export const CONTAINER_MIN_WIDTH = 100;

/**
 * Decide se o layout está estável para iniciar o fade do overlay.
 *
 * @param input métricas dos containers críticos
 * @returns `{ stable: true }` se pode fade-out; caso contrário `{ stable: false, reasons }`
 */
export function evaluateClsStability(input: ClsStabilityInput): ClsStabilityResult {
    const reasons: string[] = [];

    if (!input.appGridReady) {
        reasons.push('app-grid-not-ready');
    }

    if (!input.rendererReady) {
        reasons.push('renderer-not-ready');
    }

    if (input.canvas.width < CONTAINER_MIN_WIDTH) {
        reasons.push(`canvas-width-${input.canvas.width}-below-${CONTAINER_MIN_WIDTH}`);
    }

    if (input.canvas.height < CANVAS_MIN_HEIGHT) {
        reasons.push(`canvas-height-${input.canvas.height}-below-${CANVAS_MIN_HEIGHT}`);
    }

    if (input.geoHud.width < CONTAINER_MIN_WIDTH) {
        reasons.push(`geo-hud-width-${input.geoHud.width}-below-${CONTAINER_MIN_WIDTH}`);
    }

    if (input.geoHud.height < GEO_HUD_MIN_HEIGHT) {
        reasons.push(`geo-hud-height-${input.geoHud.height}-below-${GEO_HUD_MIN_HEIGHT}`);
    }

    return {
        stable: reasons.length === 0,
        reasons,
    };
}

/**
 * Calcula um score aproximado de CLS baseado na mudança de dimensões.
 * Útil para logging/diagnóstico (não substitui PerformanceObserver).
 *
 * @param before dimensões antes do fade
 * @param after dimensões após o fade
 * @returns score CLS aproximado (0 = sem shift)
 */
export function estimateClsScore(
    before: ContainerMetrics,
    after: ContainerMetrics,
): number {
    const widthDelta = Math.abs(after.width - before.width);
    const heightDelta = Math.abs(after.height - before.height);
    const viewportArea = before.width * before.height;
    if (viewportArea === 0) return 0;
    const shiftArea = widthDelta * before.height + heightDelta * before.width;
    return Math.min(shiftArea / viewportArea, 1);
}