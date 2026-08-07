// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   P&ID UX HELPERS — SPEC_PID_DIAGRAM_UX_IMPROVEMENTS (9.43)

   Pure helpers para UX avançada de P&ID:
   - Auto-connect port matching (in/out compatibility)
   - Process rules validator (isolation before maintenance)
   - Template macros (pump station, heat exchanger assembly)
   - Routing styles (orthogonal, curved)
   - Tag compatibility matrix

   UI (drag/drop, SVG render) fica em handler.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §UX benchmarks
// ──────────────────────────────────────────────────────────────────────

export const PORT_TYPES = Object.freeze(['in', 'out', 'bidirectional', 'top', 'bottom', 'left', 'right']);

export const ROUTING_STYLES = Object.freeze(['orthogonal', 'curved', 'straight']);

export const VALIDATION_STATES = Object.freeze(['ok', 'warning', 'error']);

// Port compatibility matrix (in pode conectar a out)
export const PORT_COMPATIBILITY = Object.freeze({
    in: Object.freeze(['out', 'bidirectional', 'right', 'bottom']),
    out: Object.freeze(['in', 'bidirectional', 'left', 'top']),
    bidirectional: Object.freeze(['in', 'out', 'bidirectional']),
    top: Object.freeze(['bottom', 'bidirectional', 'out']),
    bottom: Object.freeze(['top', 'bidirectional', 'in']),
    left: Object.freeze(['right', 'bidirectional', 'out']),
    right: Object.freeze(['left', 'bidirectional', 'in']),
});

// Templates / macros canônicos §TEMPLATES
export const MACRO_TEMPLATES = Object.freeze({
    pump_station: Object.freeze({
        label: 'Estação de Bombeamento',
        elements: Object.freeze([
            Object.freeze({ type: 'pump', label: 'P-101' }),
            Object.freeze({ type: 'valve', label: 'V-101' }), // isolation
            Object.freeze({ type: 'instrument', label: 'PI-101' }), // pressure
            Object.freeze({ type: 'valve', label: 'V-102' }), // check valve
        ]),
        connections: Object.freeze([
            Object.freeze({ from: 0, to: 1 }),
            Object.freeze({ from: 1, to: 2 }),
            Object.freeze({ from: 2, to: 3 }),
        ]),
    }),
    heat_exchanger_assembly: Object.freeze({
        label: 'Trocador de Calor',
        elements: Object.freeze([
            Object.freeze({ type: 'heat_exchanger', label: 'E-101' }),
            Object.freeze({ type: 'instrument', label: 'TI-101' }),
            Object.freeze({ type: 'instrument', label: 'TI-102' }),
            Object.freeze({ type: 'valve', label: 'V-201' }),
        ]),
        connections: Object.freeze([Object.freeze({ from: 0, to: 1 }), Object.freeze({ from: 0, to: 2 })]),
    }),
    control_loop: Object.freeze({
        label: 'Malha de Controle',
        elements: Object.freeze([
            Object.freeze({ type: 'instrument', label: 'FT-301' }), // flow transmitter
            Object.freeze({ type: 'instrument', label: 'FIC-301' }), // indicator controller
            Object.freeze({ type: 'valve', label: 'FV-301' }), // flow valve
        ]),
        connections: Object.freeze([Object.freeze({ from: 0, to: 1 }), Object.freeze({ from: 1, to: 2 })]),
    }),
});

// ──────────────────────────────────────────────────────────────────────
// Port compatibility
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} portA
 * @param {string} portB
 * @returns {boolean}
 */
export function arePortsCompatible(portA: string, portB: string): boolean {
    if (!PORT_TYPES.includes(portA) || !PORT_TYPES.includes(portB)) return false;
    return ((PORT_COMPATIBILITY as Record<string, ReadonlyArray<string>>)[portA] || []).includes(portB);
}

/**
 * Encontra porta compatível de um elemento target dado uma porta source.
 * @param {string} sourcePort
 * @param {Array<string>} targetPorts
 * @returns {string|null}
 */
export function findCompatiblePort(sourcePort: string, targetPorts: Array<string>): string|null {
    if (!Array.isArray(targetPorts)) return null;
    for (const p of targetPorts) {
        if (arePortsCompatible(sourcePort, p)) return p;
    }
    return null;
}

// ──────────────────────────────────────────────────────────────────────
// Auto-connect suggestion §AUTO-CONNECT
// ──────────────────────────────────────────────────────────────────────

const SNAP_RADIUS_PX = 20;

/**
 * Dado posição 2D de porta arrastada + portas de elementos candidatos,
 * sugere melhor porta para snap.
 *
 * @param {{x:any, y:any, portType:any}} draggedPort
 * @param {Array<{elementId:any, portId:any, portType:any, x:any, y:any}>} availablePorts
 * @param {number} [snapRadius]
 * @returns {{ elementId:any, portId:any, distance?:number } | null}
 */
export function suggestAutoConnect(draggedPort: {x:any, y:any, portType:any}, availablePorts: Array<{elementId:any, portId:any, portType:any, x:any, y:any}>, snapRadius: number = SNAP_RADIUS_PX): { elementId:any, portId:any, distance?:number } | null {
    if (!draggedPort || !Array.isArray(availablePorts)) return null;
    let best = null;
    let bestDist = Infinity;
    for (const p of availablePorts) {
        if (!p) continue;
        if (!arePortsCompatible(draggedPort.portType, p.portType)) continue;
        const dx = (p.x || 0) - (draggedPort.x || 0);
        const dy = (p.y || 0) - (draggedPort.y || 0);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= snapRadius && dist < bestDist) {
            bestDist = dist;
            best = { elementId: p.elementId, portId: p.portId, distance: dist };
        }
    }
    return best;
}

// ──────────────────────────────────────────────────────────────────────
// Process rules validator §VALIDAÇÃO
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida regras de processo - ex: pump deve ter isolation valve upstream.
 *
 * @param {{ elements:any, connections:any }} diagram
 * @returns {Array<{ elementId:any, severity:any, message:any }>}
 */
export function validateProcessRules(diagram: { elements:any, connections:any }): Array<{ elementId:any, severity:any, message:any }> {
        const issues: any[]= [];
    if (!diagram || !Array.isArray(diagram.elements) || !Array.isArray(diagram.connections)) {
        return issues;
    }

    // Build adjacency (inbound)
    const inbound = new Map();
    for (const c of diagram.connections) {
        if (!c || !c.fromId || !c.toId) continue;
        if (!inbound.has(c.toId)) inbound.set(c.toId, []);
        inbound.get(c.toId).push(c.fromId);
    }
    const byId = new Map(diagram.elements.filter((e) => e && e.id).map((e) => [e.id, e]));

    // Rule 1: Pump requer isolation valve upstream
    for (const el of diagram.elements) {
        if (!el || el.category !== 'pump') continue;
        const upstream = inbound.get(el.id) || [];
        const hasIsolationValve = upstream.some((id: any) => {
            const up = byId.get(id);
            return up && up.category === 'valve' && up.subtype !== 'check';
        });
        if (!hasIsolationValve) {
            issues.push({
                elementId: el.id,
                severity: 'warning',
                message: `Pump ${el.tag || el.id} sem isolation valve upstream (manutenção)`,
            });
        }
    }

    // Rule 2: Instrument (PI/TI/FI) deve estar conectado (não órfão)
    for (const el of diagram.elements) {
        if (!el || el.category !== 'instrument') continue;
        const hasInbound = (inbound.get(el.id) || []).length > 0;
        const hasOutbound = diagram.connections.some((c) => c && c.fromId === el.id);
        if (!hasInbound && !hasOutbound) {
            issues.push({
                elementId: el.id,
                severity: 'warning',
                message: `Instrumento ${el.tag || el.id} sem conexão`,
            });
        }
    }

    // Rule 3: Tank sem overflow protection (warning)
    for (const el of diagram.elements) {
        if (!el || el.category !== 'tank') continue;
        const downstream = diagram.connections.filter((c) => c && c.fromId === el.id).map((c) => byId.get(c.toId));
        const hasReliefValve = downstream.some((d) => d && d.category === 'valve' && d.subtype === 'relief');
        if (!hasReliefValve) {
            issues.push({
                elementId: el.id,
                severity: 'info',
                message: `Tank ${el.tag || el.id} sem relief valve — verificar overflow`,
            });
        }
    }

    return issues;
}

// ──────────────────────────────────────────────────────────────────────
// Macro template lookup + instantiation
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} templateId
 * @returns {Object|null}
 */
export function getMacroTemplate(templateId: string): Object|null {
    return (((MACRO_TEMPLATES as Record<string, any>))[templateId] || null as any);
}

/**
 * Instancia macro em posição X,Y com ID prefix.
 * @param {string} templateId
 * @param {{x:any, y:any}} basePosition
 * @param {string} idPrefix
 * @returns {{ elements:any, connections:any } | null}
 */
export function instantiateMacro(templateId: string, basePosition: {x:any, y:any}, idPrefix: string): { elements:any, connections:any } | null {
    const tpl = (getMacroTemplate(templateId) as any);
    if (!tpl) return null;
    const prefix = typeof idPrefix === 'string' ? idPrefix : `macro-${Date.now()}`;
    const bx = Number(basePosition?.x) || 0;
    const by = Number(basePosition?.y) || 0;

    const elements = tpl.elements.map((el: any, i: any) => ({
        id: `${prefix}-el-${i}`,
        type: el.type,
        tag: el.label,
        x: bx + i * 100,
        y: by,
    }));
    const connections = tpl.connections.map((c: any, i: any) => ({
        id: `${prefix}-conn-${i}`,
        fromId: elements[c.from].id,
        toId: elements[c.to].id,
    }));
    return { elements, connections };
}

// ──────────────────────────────────────────────────────────────────────
// Routing helpers §UX ROUTING
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {{x:any, y:any}} from
 * @param {{x:any, y:any}} to
 * @param {string} style
 * @returns {Array<{x:any, y:any}>} waypoints
 */
export function computeRoute(from: {x:any, y:any}, to: {x:any, y:any}, style: string = 'orthogonal'): Array<{x:any, y:any}> {
    if (!from || !to) return [];
    if (!ROUTING_STYLES.includes(style)) style = 'orthogonal';
    if (style === 'straight') return [from, to];
    if (style === 'orthogonal') {
        // L-shape: middle point com mesma y do "from"
        const mid = { x: to.x, y: from.y };
        return [from, mid, to];
    }
    if (style === 'curved') {
        // 2 control points para Bezier (simplificado: retorna 2 midpoints)
        const dx = to.x - from.x;
        const c1 = { x: from.x + dx * 0.5, y: from.y };
        const c2 = { x: to.x - dx * 0.5, y: to.y };
        return [from, c1, c2, to];
    }
    return [from, to];
}
