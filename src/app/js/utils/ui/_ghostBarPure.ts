// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   GHOST BAR PURE — decisão de "barra fantasma" (HUD-UX G14)
   Origem: print Calvin 2026-06-11 — linha branca fina (~300×2px,
   assinatura de --left-panel-width) flutuando sobre o canvas 3D,
   resto de painel/cabeçalho vazio de layout persistido. O estado
   vive no localStorage do usuário — irreproduzível remotamente —
   então o produto se autodiagnostica: "Reorganizar HUDs" varre,
   loga a identidade do elemento e o esconde.

   Esta é a lógica de decisão PURA (sem DOM) para ser testável
   cheap. O wire DOM vive em hudRefresh.ts (_sweepGhostBars).
   ================================================================ */

export interface GhostRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface GhostCandidateMeta {
    /** Retângulo do elemento na tela. */
    rect: GhostRect;
    /** Retângulo do canvas-container (área 3D). */
    canvasRect: GhostRect;
    /** Elemento (ou descendente) tem texto visível não-vazio? */
    hasText: boolean;
    /** Tem descendente visual (canvas/img/svg/video) visível? */
    hasVisualContent: boolean;
    /** Casa com a whitelist de elementos finos legítimos? */
    whitelisted: boolean;
}

export interface GhostVerdict {
    ghost: boolean;
    reason:
        | 'ghost_bar'
        | 'whitelisted'
        | 'has_text'
        | 'has_visual_content'
        | 'not_thin'
        | 'too_narrow'
        | 'too_wide'
        | 'outside_canvas';
}

/** Altura máxima (px) para algo contar como "linha/barra fina". */
export const GHOST_MAX_HEIGHT = 10;
/** Largura mínima — risco menor que isso é ruído (ticks, carets). */
export const GHOST_MIN_WIDTH = 100;
/** Largura máxima — acima disso é borda de layout legítima (full-width). */
export const GHOST_MAX_WIDTH = 700;

/**
 * Seletores de elementos finos LEGÍTIMOS que nunca devem ser varridos.
 * Fonte: CLAUDE.md z-index map + handles documentados do panelManager.
 */
export const GHOST_WHITELIST_SELECTORS = Object.freeze([
    '#resize-handle-left',
    '#resize-handle-right',
    '.constellation-resize-top',
    '.float-resize',
    '.time-slider-track',
    '.progress-overlay-bar',
]);

/** Interseção de retângulos (área > 0). */
export function rectsIntersect(a: GhostRect, b: GhostRect): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Decide se um elemento fino sobre o canvas é uma barra-fantasma
 * (resto de painel vazio) ou algo legítimo. Conservador: qualquer
 * texto, conteúdo visual ou whitelist → NÃO é fantasma.
 */
export function decideGhostBar(meta: GhostCandidateMeta): GhostVerdict {
    const { rect, canvasRect } = meta;
    if (meta.whitelisted) return Object.freeze({ ghost: false, reason: 'whitelisted' });
    if (rect.height <= 0 || rect.height > GHOST_MAX_HEIGHT) {
        return Object.freeze({ ghost: false, reason: 'not_thin' });
    }
    if (rect.width < GHOST_MIN_WIDTH) return Object.freeze({ ghost: false, reason: 'too_narrow' });
    if (rect.width > GHOST_MAX_WIDTH) return Object.freeze({ ghost: false, reason: 'too_wide' });
    if (!rectsIntersect(rect, canvasRect)) return Object.freeze({ ghost: false, reason: 'outside_canvas' });
    if (meta.hasText) return Object.freeze({ ghost: false, reason: 'has_text' });
    if (meta.hasVisualContent) return Object.freeze({ ghost: false, reason: 'has_visual_content' });
    return Object.freeze({ ghost: true, reason: 'ghost_bar' });
}
