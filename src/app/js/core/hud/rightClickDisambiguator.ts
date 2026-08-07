// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   RIGHT-CLICK DISAMBIGUATOR — SPEC_CONTEXT_MENU_BEHAVIOR_FIX_9_73

   Pure helpers para distinguir click vs pan no botão direito:
   - Q1: threshold 5px distância OU 200ms tempo (o que vier primeiro)
   - Q2: áreas elegíveis (canvas 3D / map) vs bloqueadas (panels/forms)
   - Q3: Ctrl/Cmd + right-click força menu nativo
   - Q4: cursor state machine (default → grabbing → grab)
   - Q6: user preference override via settings

   Sem dependência de DOM — recebe eventos já normalizados.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §Q1/Q2/Q6
// ──────────────────────────────────────────────────────────────────────

export const DRAG_THRESHOLD_PX = 5;
export const DRAG_THRESHOLD_MS = 200;

export const ELIGIBLE_AREAS = Object.freeze(['canvas-3d', 'map-view', 'minimap']);
export const BLOCKED_AREAS = Object.freeze(['panel', 'form', 'input', 'textarea', 'modal']);

export const PAN_MODES = Object.freeze(['pan', 'context_menu', 'native']);

export const CURSOR_STATES = Object.freeze({
    IDLE: 'default',
    PRESSED: 'grab',
    DRAGGING: 'grabbing',
});

export const USER_PREFERENCE_MODES = Object.freeze(['pan_default', 'context_default', 'hybrid']);

// ──────────────────────────────────────────────────────────────────────
// Area classification §Q2
// ──────────────────────────────────────────────────────────────────────

export function isEligibleArea(areaType: string): boolean {
    return typeof areaType === 'string' && ELIGIBLE_AREAS.includes(areaType);
}

export function isBlockedArea(areaType: string): boolean {
    return typeof areaType === 'string' && BLOCKED_AREAS.includes(areaType);
}

// ──────────────────────────────────────────────────────────────────────
// Distance calculation §Q1
// ──────────────────────────────────────────────────────────────────────

/**
 * Distância euclidiana entre dois pontos.
 */
import { distance2D as _distance2D } from '../../utils/helpers/geometry.js';
export function distance(p1: any, p2: any): number {
    return _distance2D(p1, p2);
}

// ──────────────────────────────────────────────────────────────────────
// Disambiguation decision §Q1
// ──────────────────────────────────────────────────────────────────────

/**
 * Avalia se o input atual classifica como click ou pan.
 */
export function classifyMovement(input: any, opts: any = {}): 'click' | 'pan' {
    if (!input || typeof input !== 'object') return 'click';
    const thresholdPx = Number.isFinite(opts?.thresholdPx) ? opts.thresholdPx : DRAG_THRESHOLD_PX;
    const thresholdMs = Number.isFinite(opts?.thresholdMs) ? opts.thresholdMs : DRAG_THRESHOLD_MS;

    const dist = distance(input.startPos, input.currentPos);
    const elapsed = Number(input.nowMs) - Number(input.startMs);

    if (dist >= thresholdPx) return 'pan';
    if (Number.isFinite(elapsed) && elapsed >= thresholdMs) return 'pan';
    return 'click';
}

// ──────────────────────────────────────────────────────────────────────
// Native menu override §Q3
// ──────────────────────────────────────────────────────────────────────

/**
 * Ctrl/Cmd + right-click força menu nativo do navegador.
 */
export function shouldShowNativeMenu(event: any): boolean {
    if (!event || typeof event !== 'object') return false;
    return Boolean(event.ctrlKey || event.metaKey);
}

// ──────────────────────────────────────────────────────────────────────
// Action dispatcher
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide ação final baseada em area + modifiers + movement classification.
 */
export function resolveRightClickAction(input: any): { action: string; reason: string } {
    if (!input || typeof input !== 'object') {
        return { action: 'context_menu', reason: 'invalid_input' };
    }

    // 1. Native override (Ctrl/Cmd + right-click)
    if (shouldShowNativeMenu(input.event)) {
        return { action: 'native', reason: 'modifier_key' };
    }

    // 2. Blocked area (form/panel/input) → context menu nativo
    if (isBlockedArea(input.areaType)) {
        return { action: 'native', reason: 'blocked_area' };
    }

    // 3. Área não-elegível → context menu customizado
    if (!isEligibleArea(input.areaType)) {
        return { action: 'context_menu', reason: 'non_eligible_area' };
    }

    // 4. User preference force override
    if (input.userPreference === 'context_default') {
        return { action: 'context_menu', reason: 'user_pref_context' };
    }
    if (input.userPreference === 'pan_default' && input.movement === 'pan') {
        return { action: 'pan', reason: 'user_pref_pan' };
    }

    // 5. Default hybrid: movement classification decides
    if (input.movement === 'pan') return { action: 'pan', reason: 'drag_detected' };
    return { action: 'context_menu', reason: 'click_detected' };
}

// ──────────────────────────────────────────────────────────────────────
// Cursor state machine §Q4
// ──────────────────────────────────────────────────────────────────────

/**
 * FSM transitions para cursor feedback:
 * IDLE → PRESSED (mousedown)
 * PRESSED → DRAGGING (movement >= threshold)
 * PRESSED → IDLE (mouseup, no pan)
 * DRAGGING → IDLE (mouseup)
 */
export function transitionCursorState(currentState: string, event: string): string {
    const state = typeof currentState === 'string' ? currentState : CURSOR_STATES.IDLE;
    if (event === 'mousedown' && state === CURSOR_STATES.IDLE) return CURSOR_STATES.PRESSED;
    if (event === 'drag_started' && state === CURSOR_STATES.PRESSED) return CURSOR_STATES.DRAGGING;
    if (event === 'mouseup') return CURSOR_STATES.IDLE;
    return state;
}

// ──────────────────────────────────────────────────────────────────────
// Ghost origin marker §Q4
// ──────────────────────────────────────────────────────────────────────

/**
 * Build ghost origin marker para feedback visual.
 * Só aparece quando movement = 'pan' e action = 'pan'.
 */
export function buildGhostOrigin(input: any): { visible: boolean; x: number; y: number; opacity: number } | null {
    if (!input || input.action !== 'pan') return null;
    const pos = input.startPos;
    if (!pos || !Number.isFinite(Number(pos.x)) || !Number.isFinite(Number(pos.y))) return null;
    return {
        visible: true,
        x: Number(pos.x),
        y: Number(pos.y),
        opacity: 0.5,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Telemetry event builder
// ──────────────────────────────────────────────────────────────────────

export function buildTelemetryEvent(input: any): any {
    if (!input || typeof input !== 'object') return null;
    return {
        event: 'right_click_disambiguated',
        action: input.action || 'unknown',
        area_type: input.areaType || 'unknown',
        duration_ms: Number.isFinite(Number(input.durationMs)) ? Number(input.durationMs) : 0,
        distance_px: Number.isFinite(Number(input.distancePx)) ? Number(input.distancePx) : 0,
        timestamp: new Date().toISOString(),
    };
}
