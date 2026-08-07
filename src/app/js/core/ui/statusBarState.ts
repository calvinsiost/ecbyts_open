// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   STATUS BAR STATE — UX-89 (pure-logic, zero DOM)

   Modelo de status bar (rodapé) com segments fixos posicionados
   (left/center/right) e ephemeral messages com prioridade.
   Imutabilidade total: Maps e arrays são clonados a cada update.
   ================================================================ */

const VALID_POSITIONS = Object.freeze(['left', 'center', 'right']);
const VALID_SEVERITIES = Object.freeze(['info', 'warning', 'error']);

function freezeSegment(seg: any): any {
    return Object.freeze({
        id: seg.id,
        position: seg.position,
        label: seg.label ?? '',
        value: seg.value ?? '',
        icon: seg.icon ?? null,
        tooltip: seg.tooltip ?? null,
        severity: seg.severity ?? null,
        order: seg.order,
        visible: seg.visible !== false,
    });
}

function freezeMessage(msg: any): any {
    return Object.freeze({
        id: msg.id,
        text: msg.text,
        severity: msg.severity,
        expiresAt: msg.expiresAt,
        priority: msg.priority,
    });
}

function freezeState(segmentsMap: any, ephemeralMessages: any, now: any): any {
    const sorted = [...ephemeralMessages].sort((a, b) => b.priority - a.priority);
    return Object.freeze({
        segments: segmentsMap,
        ephemeralMessages: Object.freeze(sorted),
        now,
    });
}

function validatePosition(position: any): void {
    if (!VALID_POSITIONS.includes(position)) {
        throw new Error(`Invalid position: ${position}. Must be one of ${VALID_POSITIONS.join(', ')}`);
    }
}

function validateSeverity(severity: any, allowNull = true): void {
    if (severity === null || severity === undefined) {
        if (allowNull) return;
        throw new Error('Severity is required');
    }
    if (!VALID_SEVERITIES.includes(severity)) {
        throw new Error(`Invalid severity: ${severity}. Must be one of ${VALID_SEVERITIES.join(', ')}`);
    }
}

function validatePriority(priority: any): void {
    if (typeof priority !== 'number' || !Number.isFinite(priority) || priority < 0 || priority > 10) {
        throw new Error(`Invalid priority: ${priority}. Must be number in 0..10`);
    }
}

export function createStatusBar(): any {
    return freezeState(new Map(), [], 0);
}

export function registerSegment(state: any, segment: any): any {
    if (!segment || typeof segment.id !== 'string' || segment.id.length === 0) {
        throw new Error('Segment requires a non-empty id');
    }
    if (state.segments.has(segment.id)) {
        throw new Error(`Segment id already registered: ${segment.id}`);
    }
    validatePosition(segment.position);
    if (typeof segment.order !== 'number' || !Number.isFinite(segment.order)) {
        throw new Error(`Segment order must be a finite number (got ${segment.order})`);
    }
    if (segment.severity !== undefined && segment.severity !== null) {
        validateSeverity(segment.severity);
    }
    const next = new Map(state.segments);
    next.set(segment.id, freezeSegment(segment));
    return freezeState(next, state.ephemeralMessages, state.now);
}

export function unregisterSegment(state: any, segmentId: any): any {
    if (!state.segments.has(segmentId)) {
        throw new Error(`Segment not found: ${segmentId}`);
    }
    const next = new Map(state.segments);
    next.delete(segmentId);
    return freezeState(next, state.ephemeralMessages, state.now);
}

export function updateSegment(state: any, segmentId: any, partial: any): any {
    const current = state.segments.get(segmentId);
    if (!current) {
        throw new Error(`Segment not found: ${segmentId}`);
    }
    if (partial.position !== undefined) validatePosition(partial.position);
    if (partial.severity !== undefined && partial.severity !== null) validateSeverity(partial.severity);
    const merged = {
        ...current,
        ...partial,
        id: current.id,
    };
    const next = new Map(state.segments);
    next.set(segmentId, freezeSegment(merged));
    return freezeState(next, state.ephemeralMessages, state.now);
}

export function setSegmentVisibility(state: any, segmentId: any, visible: any): any {
    return updateSegment(state, segmentId, { visible: !!visible });
}

export function pushEphemeralMessage(state: any, msg: any, now: any): any {
    if (!msg || typeof msg.id !== 'string' || msg.id.length === 0) {
        throw new Error('Ephemeral message requires a non-empty id');
    }
    if (state.ephemeralMessages.some((m: any) => m.id === msg.id)) {
        throw new Error(`Ephemeral message id already exists: ${msg.id}`);
    }
    if (typeof msg.text !== 'string') {
        throw new Error('Ephemeral message requires text');
    }
    validateSeverity(msg.severity, false);
    validatePriority(msg.priority);
    const tickNow = typeof now === 'number' ? now : state.now;
    let expiresAt;
    if (typeof msg.expiresAt === 'number') {
        expiresAt = msg.expiresAt;
    } else if (typeof msg.durationMs === 'number') {
        if (msg.durationMs < 0) throw new Error('durationMs must be >= 0');
        expiresAt = tickNow + msg.durationMs;
    } else {
        throw new Error('Ephemeral message requires expiresAt or durationMs');
    }
    const newMsg = freezeMessage({
        id: msg.id,
        text: msg.text,
        severity: msg.severity,
        expiresAt,
        priority: msg.priority,
    });
    return freezeState(state.segments, [...state.ephemeralMessages, newMsg], tickNow);
}

export function dismissEphemeralMessage(state: any, messageId: any): any {
    const exists = state.ephemeralMessages.some((m: any) => m.id === messageId);
    if (!exists) {
        throw new Error(`Ephemeral message not found: ${messageId}`);
    }
    const next = state.ephemeralMessages.filter((m: any) => m.id !== messageId);
    return freezeState(state.segments, next, state.now);
}

export function tickEphemeralMessages(state: any, now: any): any {
    if (typeof now !== 'number' || !Number.isFinite(now)) {
        throw new Error('tickEphemeralMessages requires a finite number for now');
    }
    const next = state.ephemeralMessages.filter((m: any) => m.expiresAt > now);
    return freezeState(state.segments, next, now);
}

export function getSegmentsByPosition(state: any, position: any): any {
    validatePosition(position);
    const arr = [];
    for (const seg of state.segments.values()) {
        if (seg.position === position && seg.visible) arr.push(seg);
    }
    arr.sort((a, b) => a.order - b.order);
    return Object.freeze(arr);
}

export function getActiveEphemeralMessage(state: any): any {
    for (const m of state.ephemeralMessages) {
        if (m.expiresAt > state.now) return m;
    }
    return null;
}

export function getSegmentValue(state: any, segmentId: any): any {
    const seg = state.segments.get(segmentId);
    if (!seg) throw new Error(`Segment not found: ${segmentId}`);
    return seg.value;
}

export function summarizeStatusBar(state: any): any {
    let visibleCount = 0;
    let hasError = false;
    let hasWarning = false;
    for (const seg of state.segments.values()) {
        if (seg.visible) visibleCount++;
        if (seg.severity === 'error') hasError = true;
        else if (seg.severity === 'warning') hasWarning = true;
    }
    for (const m of state.ephemeralMessages) {
        if (m.expiresAt > state.now) {
            if (m.severity === 'error') hasError = true;
            else if (m.severity === 'warning') hasWarning = true;
        }
    }
    return Object.freeze({
        segmentCount: state.segments.size,
        visibleCount,
        ephemeralCount: state.ephemeralMessages.length,
        hasError,
        hasWarning,
    });
}
