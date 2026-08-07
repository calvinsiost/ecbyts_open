// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ISA S5.1 SYMBOL REGISTRY — SPEC_TECHNICAL_DIAGRAMS

   Pure helpers para diagramas CAD-style:
   - ISA S5.1 P&ID symbol registry §Q2
   - Statechart FSM validator §Journey 3
   - Data Flow Diagram balance check §DFD
   - Tag validator (P-101, T-101 formato ISA)
   - Data sheet row extraction

   Canvas rendering + event handling ficam em handler/ui/.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §Q2 (ISA S5.1)
// ──────────────────────────────────────────────────────────────────────

export const ISA_CATEGORIES = Object.freeze([
    'pump',
    'tank',
    'valve',
    'instrument',
    'heat_exchanger',
    'column',
    'pipe',
]);

// Prefixos canônicos por categoria (tag format: {prefix}-{number})
export const TAG_PREFIXES = Object.freeze({
    pump: 'P',
    tank: 'T',
    valve: 'V',
    instrument: 'I',
    heat_exchanger: 'E',
    column: 'C',
    pipe: 'L',
});

// Tag regex: Letra + hífen + 1-4 dígitos (ISA convention)
const TAG_REGEX = /^([A-Z])-?(\d{1,4})(?:\.(\d{1,3}))?$/;

// Default symbol library §Spec to Green
export const ISA_SYMBOLS = Object.freeze([
    Object.freeze({ id: 'centrifugal_pump', category: 'pump', label: 'Bomba Centrífuga', ports: ['in', 'out'] }),
    Object.freeze({
        id: 'positive_displacement_pump',
        category: 'pump',
        label: 'Bomba Deslocamento Positivo',
        ports: ['in', 'out'],
    }),
    Object.freeze({ id: 'vertical_tank', category: 'tank', label: 'Tanque Vertical', ports: ['top', 'bottom'] }),
    Object.freeze({ id: 'horizontal_tank', category: 'tank', label: 'Tanque Horizontal', ports: ['left', 'right'] }),
    Object.freeze({ id: 'gate_valve', category: 'valve', label: 'Válvula Gaveta', ports: ['in', 'out'] }),
    Object.freeze({ id: 'ball_valve', category: 'valve', label: 'Válvula Esfera', ports: ['in', 'out'] }),
    Object.freeze({ id: 'check_valve', category: 'valve', label: 'Válvula de Retenção', ports: ['in', 'out'] }),
    Object.freeze({ id: 'flow_indicator', category: 'instrument', label: 'Indicador de Vazão (FI)', ports: ['in'] }),
    Object.freeze({
        id: 'pressure_indicator',
        category: 'instrument',
        label: 'Indicador de Pressão (PI)',
        ports: ['in'],
    }),
    Object.freeze({
        id: 'temperature_indicator',
        category: 'instrument',
        label: 'Indicador de Temperatura (TI)',
        ports: ['in'],
    }),
    Object.freeze({
        id: 'shell_tube_exchanger',
        category: 'heat_exchanger',
        label: 'Trocador Casco-Tubo',
        ports: ['hot_in', 'hot_out', 'cold_in', 'cold_out'],
    }),
]);

// ──────────────────────────────────────────────────────────────────────
// Symbol lookup
// ──────────────────────────────────────────────────────────────────────

/**
 * @param symbolId
 */
export function getSymbol(symbolId: string): object | null {
    return ISA_SYMBOLS.find((s) => s.id === symbolId) || null;
}

/**
 * @param category
 */
export function listSymbolsByCategory(category: string): Array<any> {
    if (!ISA_CATEGORIES.includes(category)) return [];
    return ISA_SYMBOLS.filter((s) => s.category === category);
}

/**
 * @param category
 */
export function getTagPrefixForCategory(category: string): string {
    return ((TAG_PREFIXES as Record<string, any>)[category] || 'X') as string;
}

// ──────────────────────────────────────────────────────────────────────
// Tag validation (ISA format: P-101, T-101, V-101.1 sub-tag)
// ──────────────────────────────────────────────────────────────────────

/**
 * @param tag
 */
export function isValidISATag(tag: string): boolean {
    if (typeof tag !== 'string') return false;
    return TAG_REGEX.test(tag.trim().toUpperCase());
}

/**
 * @param tag
 */
export function parseISATag(tag: string): { prefix: any; number: any; subTag?: any } | null {
    if (!isValidISATag(tag)) return null;
    const m = TAG_REGEX.exec(tag.trim().toUpperCase()) as RegExpExecArray;
    return {
        prefix: m[1],
        number: parseInt(m[2] as string, 10),
        subTag: m[3] ? parseInt(m[3], 10) : null,
    };
}

/**
 * Gera próximo tag disponível dado prefix + used tags.
 * @param prefix - 'P', 'T', 'V', ...
 * @param existingTags
 */
export function generateNextTag(prefix: string, existingTags: Array<string>): string {
    if (typeof prefix !== 'string' || prefix.length !== 1) return '';
    const p = prefix.toUpperCase();
    const usedNumbers = new Set<any>();
    if (Array.isArray(existingTags)) {
        for (const t of existingTags) {
            const parsed = parseISATag(t);
            if (parsed && parsed.prefix === p && parsed.subTag == null) {
                usedNumbers.add(parsed.number);
            }
        }
    }
    // Start at 101 (ISA convention) e procurar próximo disponível
    let n = 101;
    while (usedNumbers.has(n)) n++;
    return `${p}-${n}`;
}

/**
 * Detecta tags duplicados em um diagrama.
 * @param elements
 */
export function findDuplicateTags(elements: Array<any>): Array<string> {
    const seen = new Set<any>();
    const dupes = new Set<any>();
    if (!Array.isArray(elements)) return [];
    for (const el of elements) {
        if (!el || !el.tag) continue;
        const t = String(el.tag).toUpperCase();
        if (seen.has(t)) dupes.add(t);
        else seen.add(t);
    }
    return [...dupes];
}

// ──────────────────────────────────────────────────────────────────────
// Statechart FSM validator §Journey 3
// ──────────────────────────────────────────────────────────────────────

export const PSEUDO_STATES = Object.freeze(['initial', 'final', 'choice', 'junction', 'history']);

/**
 * @param chart
 */
export function validateStatechart(chart: any): { valid: any; errors: any } {
    const errors = [];
    if (!chart || typeof chart !== 'object') return { valid: false, errors: ['not object'] };
    if (!Array.isArray(chart.states) || chart.states.length === 0) {
        errors.push('at least 1 state required');
    }
    if (!Array.isArray(chart.transitions)) chart.transitions = [];

    const stateIds = new Set<any>();
    let hasInitial = false;
    for (const s of chart.states || []) {
        if (!s || !s.id) {
            errors.push('state missing id');
            continue;
        }
        if (stateIds.has(s.id)) {
            errors.push(`duplicate state id: ${s.id}`);
        }
        stateIds.add(s.id);
        if (s.type === 'initial') hasInitial = true;
        if (s.type && s.type !== 'simple' && s.type !== 'composite' && !PSEUDO_STATES.includes(s.type)) {
            errors.push(`invalid state type: ${s.type}`);
        }
    }
    if ((chart.states || []).length > 0 && !hasInitial) {
        errors.push('no initial state');
    }

    for (const t of chart.transitions) {
        if (!t || !t.from || !t.to) {
            errors.push('transition missing from/to');
            continue;
        }
        if (!stateIds.has(t.from)) errors.push(`transition from unknown state: ${t.from}`);
        if (!stateIds.has(t.to)) errors.push(`transition to unknown state: ${t.to}`);
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Estados alcançáveis a partir do estado inicial (BFS).
 * @param chart
 */
export function reachableStates(chart: Record<string, any>): Set<string> {
    const result = new Set<any>();
    if (!chart || !Array.isArray(chart.states)) return result;
    const initial = chart.states.find((s: any) => s && s.type === 'initial');
    if (!initial) return result;
    const adj = new Map<any, any[]>();
    for (const t of chart.transitions || []) {
        if (!t || !t.from) continue;
        if (!adj.has(t.from)) adj.set(t.from, []);
        (adj.get(t.from) as any[]).push(t.to);
    }
    const queue = [initial.id];
    while (queue.length > 0) {
        const curr = queue.shift();
        if (result.has(curr)) continue;
        result.add(curr);
        const neighbors = adj.get(curr) || [];
        for (const n of neighbors) queue.push(n);
    }
    return result;
}

// ──────────────────────────────────────────────────────────────────────
// Data Flow Diagram balance check §DFD
// ──────────────────────────────────────────────────────────────────────

/**
 * Verifica balanceamento: cada process deve ter ≥1 input + ≥1 output.
 * @param dfd
 */
export function checkDfdBalance(dfd: any): { balanced: any; issues: any } {
    const issues = [];
    if (!dfd || !Array.isArray(dfd.nodes) || !Array.isArray(dfd.flows)) {
        return { balanced: false, issues: ['invalid dfd'] };
    }
    const inbound = new Map<any, any>();
    const outbound = new Map<any, any>();
    for (const f of dfd.flows) {
        if (!f || !f.from || !f.to) continue;
        outbound.set(f.from, (outbound.get(f.from) || 0) + 1);
        inbound.set(f.to, (inbound.get(f.to) || 0) + 1);
    }
    for (const n of dfd.nodes) {
        if (!n || !n.id) continue;
        if (n.type === 'process') {
            if (!inbound.has(n.id)) issues.push(`process ${n.id}: no input`);
            if (!outbound.has(n.id)) issues.push(`process ${n.id}: no output`);
        }
    }
    return { balanced: issues.length === 0, issues };
}

// ──────────────────────────────────────────────────────────────────────
// Data Sheet extraction
// ──────────────────────────────────────────────────────────────────────

/**
 * Extrai data sheet (rows) a partir de elementos do diagrama.
 * @param elements
 */
export function extractDataSheet(elements: Array<any>): Array<object> {
    if (!Array.isArray(elements)) return [];
    return elements
        .filter((el) => el && el.tag)
        .map((el) => ({
            tag: el.tag,
            category: el.category || 'unknown',
            ...(el.attributes || {}),
        }));
}
