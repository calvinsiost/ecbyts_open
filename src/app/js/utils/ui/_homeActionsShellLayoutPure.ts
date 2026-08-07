// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic extraction (Wave JJJ1 Q5 PoC playbook applied to homeGrid).
// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Phase 1 Q5=1 Calvin 2026-05-22.
//
// Strategy: extract DOM-free math + constants of actions shell layout from
// homeGrid.js (4739 LOC, lone WARN em ui-responsibility-gate) para sibling
// puro testável. homeGrid mantém glue DOM (refs to elements, splitter dragging,
// localStorage) e delega cálculo aqui.
//
// Pure-logic = no document/window references, no module-level let mutations.
// Tudo via args + return values determinísticos.
//
// Spec NOT:
// - NÃO referenciar document/window/localStorage aqui
// - NÃO importar nada de homeGrid (one-way dependency)
// - NÃO emoji

/** @typedef {{
 *   MIN_VIEWPORT:number, SPLITTER_SIZE:number,
 *   DEFAULT_LEFT_RATIO:number, DEFAULT_RIGHT_RATIO:number,
 *   DEFAULT_COMPACT_LEFT_RATIO:number, DEFAULT_COMPACT_RIGHT_RATIO:number,
 *   LEFT_MIN_RATIO:number, LEFT_MAX_RATIO:number,
 *   RIGHT_MIN_RATIO:number, RIGHT_MAX_RATIO:number, MAIN_MIN_RATIO:number,
 *   LEFT_MIN_PX:number, LEFT_MAX_PX:number, RIGHT_MIN_PX:number,
 *   RIGHT_MAX_VIEWPORT_RATIO:number, MAIN_MIN_PX:number,
 *   COMPACT_LEFT_MIN_RATIO:number, COMPACT_LEFT_MAX_RATIO:number,
 *   COMPACT_RIGHT_MIN_RATIO:number, COMPACT_RIGHT_MAX_RATIO:number,
 *   COMPACT_MAIN_MIN_RATIO:number,
 *   KEYBOARD_STEP_RATIO:number, GRID_GAP_COUNT:number,
 * }} ActionsShellLayoutSpec
 */

/** @type {ActionsShellLayoutSpec} */
export const ACTIONS_SHELL_LAYOUT = Object.freeze({
    MIN_VIEWPORT: 1280,
    SPLITTER_SIZE: 12,
    DEFAULT_LEFT_RATIO: 0.22,
    DEFAULT_RIGHT_RATIO: 0.35,
    DEFAULT_COMPACT_LEFT_RATIO: 0.26,
    DEFAULT_COMPACT_RIGHT_RATIO: 0.34,
    LEFT_MIN_RATIO: 0.18,
    LEFT_MAX_RATIO: 0.32,
    RIGHT_MIN_RATIO: 0.24,
    RIGHT_MAX_RATIO: 0.48,
    MAIN_MIN_RATIO: 0.3,
    LEFT_MIN_PX: 260,
    LEFT_MAX_PX: 420,
    RIGHT_MIN_PX: 420,
    RIGHT_MAX_VIEWPORT_RATIO: 0.48,
    MAIN_MIN_PX: 380,
    COMPACT_LEFT_MIN_RATIO: 0.22,
    COMPACT_LEFT_MAX_RATIO: 0.34,
    COMPACT_RIGHT_MIN_RATIO: 0.26,
    COMPACT_RIGHT_MAX_RATIO: 0.38,
    COMPACT_MAIN_MIN_RATIO: 0.32,
    KEYBOARD_STEP_RATIO: 0.02,
    GRID_GAP_COUNT: 4,
});

/**
 * Constraints (px) calculados a partir de rootWidth + gap + resizable.
 * Pure: zero DOM access. Recebe gapWidth (já lido do CSS pelo caller).
 *
 * @param {number} rootWidth
 * @param {number} gapWidth
 * @param {{resizable?:boolean}} [opts]
 * @returns {{budget:number, splitterTrackSize:number, leftMin:number, leftMax:number, rightMin:number, rightMax:number, mainMin:number, targetLeft:number, targetRight:number}}
 */
export function computeActionsShellConstraints(rootWidth: number, gapWidth: number, opts: { resizable?: boolean } = {}) {
    const resizable = opts.resizable !== false;
    const L = ACTIONS_SHELL_LAYOUT;
    const gapBudget = gapWidth * L.GRID_GAP_COUNT;
    const splitterTrackSize = resizable ? L.SPLITTER_SIZE : 0;
    const splitterBudget = splitterTrackSize * 2;
    const budget = Math.max(rootWidth - gapBudget - splitterBudget, 0);
    const defaultLeftRatio = resizable ? L.DEFAULT_LEFT_RATIO : L.DEFAULT_COMPACT_LEFT_RATIO;
    const defaultRightRatio = resizable ? L.DEFAULT_RIGHT_RATIO : L.DEFAULT_COMPACT_RIGHT_RATIO;
    const leftMin = resizable ? L.LEFT_MIN_PX : Math.round(budget * L.COMPACT_LEFT_MIN_RATIO);
    const leftMax = resizable ? L.LEFT_MAX_PX : Math.round(budget * L.COMPACT_LEFT_MAX_RATIO);
    const rightMin = resizable ? L.RIGHT_MIN_PX : Math.round(budget * L.COMPACT_RIGHT_MIN_RATIO);
    const rightMax = resizable
        ? Math.round(rootWidth * L.RIGHT_MAX_VIEWPORT_RATIO)
        : Math.round(budget * L.COMPACT_RIGHT_MAX_RATIO);
    const mainMin = resizable ? L.MAIN_MIN_PX : Math.round(budget * L.COMPACT_MAIN_MIN_RATIO);
    return {
        budget,
        splitterTrackSize,
        leftMin,
        leftMax,
        rightMin,
        rightMax,
        mainMin,
        targetLeft: Math.round(budget * defaultLeftRatio),
        targetRight: Math.round(budget * defaultRightRatio),
    };
}

/**
 * Clamp layout {left, right} contra constraints calculados.
 * Pure: deterministic given inputs.
 *
 * @param {{left?:number, right?:number}|null|undefined} layout
 * @param {number} rootWidth
 * @param {number} gapWidth
 * @param {{resizable?:boolean}} [opts]
 * @returns {{left:number, right:number}}
 */
export function clampActionsShellLayout(layout: any, rootWidth: any, gapWidth: any, opts: any = {}) {
    const constraints = computeActionsShellConstraints(rootWidth, gapWidth, opts);
    const maxCombined = Math.max(constraints.budget - constraints.mainMin, 0);
    const leftFloor = Math.max(0, Math.min(constraints.leftMin, maxCombined));
    const rightFloor = Math.max(0, Math.min(constraints.rightMin, Math.max(maxCombined - leftFloor, 0)));
    const maxLeft = Math.max(leftFloor, Math.min(constraints.leftMax, maxCombined - rightFloor));
    const maxRight = Math.max(rightFloor, Math.min(constraints.rightMax, maxCombined - leftFloor));

    let leftRequested = Math.round(Number(layout?.left) || constraints.targetLeft);
    let rightRequested = Math.round(Number(layout?.right) || constraints.targetRight);

    leftRequested = Math.min(maxLeft, Math.max(leftFloor, leftRequested));
    rightRequested = Math.min(maxRight, Math.max(rightFloor, rightRequested));

    const spare = Math.max(maxCombined - leftFloor - rightFloor, 0);
    const leftExtra = Math.max(leftRequested - leftFloor, 0);
    const rightExtra = Math.max(rightRequested - rightFloor, 0);
    const desiredExtra = leftExtra + rightExtra;

    let left = leftFloor;
    let right = rightFloor;

    if (desiredExtra > 0 && spare > 0) {
        const scale = Math.min(1, spare / desiredExtra);
        left += Math.round(leftExtra * scale);
        right += Math.round(rightExtra * scale);
    }

    return { left, right };
}

/**
 * Default layout (clamped) for given rootWidth.
 *
 * @param {number} rootWidth
 * @param {number} gapWidth
 * @param {{resizable?:boolean}} [opts]
 * @returns {{left:number, right:number}}
 */
export function computeDefaultActionsShellLayout(rootWidth: number, gapWidth: number, opts: { resizable?: boolean } = {}) {
    const constraints = computeActionsShellConstraints(rootWidth, gapWidth, opts);
    return clampActionsShellLayout(
        { left: constraints.targetLeft, right: constraints.targetRight },
        rootWidth,
        gapWidth,
        opts
    );
}

/**
 * Keyboard step (px) — pure based on shellWidth + boost flag.
 *
 * @param {number} shellWidth
 * @param {{boost?:boolean}} [opts]
 * @returns {number}
 */
export function computeActionsShellKeyboardStep(shellWidth: number, opts: { boost?: boolean } = {}) {
    const boost = !!opts.boost;
    if (shellWidth <= 0) return boost ? 32 : 12;
    const baseStep = Math.max(8, Math.round(shellWidth * ACTIONS_SHELL_LAYOUT.KEYBOARD_STEP_RATIO));
    return boost ? baseStep * 2 : baseStep;
}

/**
 * Determine if viewport is "resizable" (above MIN_VIEWPORT threshold).
 *
 * @param {number} viewportWidth
 * @returns {boolean}
 */
export function isActionsLayoutResizable(viewportWidth: number) {
    return viewportWidth >= ACTIONS_SHELL_LAYOUT.MIN_VIEWPORT;
}

/**
 * Breakpoint label (pure) from viewport width.
 *
 * @param {number} viewportWidth
 * @returns {'wide'|'desktop'}
 */
export function getActionsLayoutBreakpoint(viewportWidth: number) {
    return viewportWidth >= 1440 ? 'wide' : 'desktop';
}
