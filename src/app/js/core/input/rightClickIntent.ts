// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   RIGHT-CLICK INTENT DETECTION — SPEC_CONTEXT_MENU_BEHAVIOR_FIX_9_73

   Pure state machine que distingue 4 intenções do botão direito:

   | Intent                | Critério                                      |
   |-----------------------|-----------------------------------------------|
   | 'pan'                 | movement > 5px E duration < threshold        |
   | 'context_menu'        | movement ≤ 5px E duration < 200ms E !Ctrl    |
   | 'native_menu'         | Ctrl/Cmd + right-click                       |
   | 'accessibility_menu'  | long press ≥500ms sem movimento              |

   Node-testable. Sem DOM, sem event listeners — apenas matemática
   de decisão a partir dos dados do evento.
   ================================================================ */

// Thresholds canônicos (§Q1)
export const MOVEMENT_THRESHOLD_PX = 5;
export const CLICK_DURATION_THRESHOLD_MS = 200;
export const LONG_PRESS_THRESHOLD_MS = 500;

// Estados da state machine (§2.2 item 1)
export const RC_STATE = Object.freeze({
    IDLE: 'idle',
    TRACKING: 'tracking', // mousedown right registrado, aguardando
    PANNING: 'panning', // movimento excedeu threshold
    COMPLETED: 'completed', // mouseup ou resolve final
});

type Point2D = { x: number; y: number };
type Modifiers = { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean };
type RightClickEvent = {
    downPos?: Point2D;
    upPos?: Point2D;
    downTime?: number;
    upTime?: number;
    maxMoveDistance?: number;
    modifiers?: Modifiers;
};
type ClassifyOpts = {
    movementThreshold?: number;
    clickDuration?: number;
    longPressDuration?: number;
};
type RCIntent = 'pan' | 'context_menu' | 'native_menu' | 'accessibility_menu' | 'invalid';
type TransitionKind = 'mousedown' | 'mousemove' | 'mouseup' | 'timeout';
type StateTransition = {
    kind: TransitionKind;
    data?: {
        modifiers?: Modifiers;
        distanceFromDown?: number;
        duration?: number;
    };
};

/**
 * Calcula distância euclidiana entre dois pontos.
 * @param a
 * @param b
 * @returns
 */
import { distance2D as _distance2D } from '../../utils/helpers/geometry.js';
export function distance(a: Point2D | null | undefined, b: Point2D | null | undefined): number {
    return _distance2D(a, b);
}

/**
 * Decide intenção com base nos dados coletados entre mousedown e mouseup.
 *
 * @param evt
 * @param opts
 * @returns
 */
export function classifyRightClickIntent(
    evt: RightClickEvent | null | undefined,
    opts: ClassifyOpts = {},
): RCIntent {
    if (!evt || typeof evt !== 'object') return 'invalid';
    if (!evt.downPos || !Number.isFinite(evt.downTime)) return 'invalid';

    const mv = Number.isFinite(opts.movementThreshold)
        ? (opts.movementThreshold as number)
        : MOVEMENT_THRESHOLD_PX;
    const click = Number.isFinite(opts.clickDuration)
        ? (opts.clickDuration as number)
        : CLICK_DURATION_THRESHOLD_MS;
    const longPress = Number.isFinite(opts.longPressDuration)
        ? (opts.longPressDuration as number)
        : LONG_PRESS_THRESHOLD_MS;

    const modifiers = evt.modifiers || {};
    // Ctrl/Cmd sempre vence - usuário pediu menu nativo (§Q3)
    if (modifiers.ctrl || modifiers.meta) return 'native_menu';

    const downTime = evt.downTime as number;
    const endTime = Number.isFinite(evt.upTime) ? (evt.upTime as number) : downTime;
    const duration = endTime - downTime;
    const moveDistance = Number.isFinite(evt.maxMoveDistance)
        ? (evt.maxMoveDistance as number)
        : evt.upPos
          ? distance(evt.downPos, evt.upPos)
          : 0;

    // Pan - movimento significativo
    if (moveDistance > mv) return 'pan';

    // Long press sem mover - acessibilidade (§2.2 item 2)
    if (duration >= longPress) return 'accessibility_menu';

    // Clique simples (<200ms, sem mover) - menu custom
    if (duration < click) return 'context_menu';

    // Entre click e long press sem mover - também menu custom (default safe)
    return 'context_menu';
}

/**
 * Transição da state machine. Retorna novo estado + intent parcial (se
 * já dá para decidir sem esperar mouseup).
 *
 * @param currentState - um de RC_STATE
 * @param transition
 * @param opts
 * @returns
 */
export function reduceState(
    currentState: string,
    transition: StateTransition | null | undefined,
    opts: ClassifyOpts = {},
): { state: string; intent: string | null; shouldActivatePan: boolean } {
    const mv = Number.isFinite(opts.movementThreshold)
        ? (opts.movementThreshold as number)
        : MOVEMENT_THRESHOLD_PX;
    const longPress = Number.isFinite(opts.longPressDuration)
        ? (opts.longPressDuration as number)
        : LONG_PRESS_THRESHOLD_MS;

    if (!transition || typeof transition !== 'object') {
        return { state: currentState, intent: null, shouldActivatePan: false };
    }

    switch (transition.kind) {
        case 'mousedown': {
            if (transition.data?.modifiers?.ctrl || transition.data?.modifiers?.meta) {
                return { state: RC_STATE.COMPLETED, intent: 'native_menu', shouldActivatePan: false };
            }
            return { state: RC_STATE.TRACKING, intent: null, shouldActivatePan: false };
        }
        case 'mousemove': {
            if (currentState !== RC_STATE.TRACKING) {
                return { state: currentState, intent: null, shouldActivatePan: false };
            }
            const dist = transition.data?.distanceFromDown || 0;
            if (dist > mv) {
                return { state: RC_STATE.PANNING, intent: 'pan', shouldActivatePan: true };
            }
            return { state: RC_STATE.TRACKING, intent: null, shouldActivatePan: false };
        }
        case 'mouseup': {
            if (currentState === RC_STATE.PANNING) {
                return { state: RC_STATE.COMPLETED, intent: 'pan', shouldActivatePan: false };
            }
            if (currentState === RC_STATE.TRACKING) {
                const duration = transition.data?.duration || 0;
                const intent = duration >= longPress ? 'accessibility_menu' : 'context_menu';
                return { state: RC_STATE.COMPLETED, intent, shouldActivatePan: false };
            }
            return { state: RC_STATE.COMPLETED, intent: null, shouldActivatePan: false };
        }
        case 'timeout': {
            // Long press detection enquanto ainda em TRACKING → accessibility menu
            if (currentState === RC_STATE.TRACKING) {
                return { state: RC_STATE.COMPLETED, intent: 'accessibility_menu', shouldActivatePan: false };
            }
            return { state: currentState, intent: null, shouldActivatePan: false };
        }
        default:
            return { state: currentState, intent: null, shouldActivatePan: false };
    }
}

/**
 * Helper: valida se target HTML deve ter navegação custom habilitada (§Q2).
 * Aceita apenas canvas 3D e mapas; desabilita em forms/inputs.
 *
 * @param targetRole - role inferida do elemento
 * @returns
 */
export function isNavigableTarget(targetRole: string): boolean {
    if (!targetRole || typeof targetRole !== 'string') return false;
    const role = targetRole.toLowerCase();
    // Canvas 3D, mapa 2D, terreno - pan habilitado
    if (role === 'canvas-3d' || role === 'map' || role === 'terrain') return true;
    // Forms, inputs, textareas - menu nativo sempre
    return false;
}
