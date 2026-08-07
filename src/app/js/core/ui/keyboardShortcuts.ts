// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Keyboard Shortcuts Manager - pure-logic, zero DOM.
 * UX-44: cross-cutting shortcut registry with context awareness.
 *
 * Registry imutável de atalhos. Resolução context-aware: atalho do contexto
 * atual prevalece sobre 'global'. Sem efeitos colaterais; integração DOM
 * acontece em utils/ ao consumir matchShortcut() em listeners de keydown.
 */

const VALID_CONTEXTS = Object.freeze(['global', 'modal', 'editor', 'viewport']);
const MODIFIER_ORDER = Object.freeze(['Ctrl', 'Alt', 'Shift']);

/**
 * Frozen wrapper that preserves Map identity in immutable state objects.
 * @param {Map<any, any>} map
 */
function freezeState(map: Map<any, any>): { shortcuts: Map<any, any> } {
    return Object.freeze({ shortcuts: map });
}

/**
 * Create empty frozen registry.
 * @returns {{shortcuts: Map<any, any>}}
 */
export function createShortcutRegistry(): { shortcuts: Map<any, any> } {
    return freezeState(new Map());
}

/**
 * Parse 'Ctrl+Shift+P' → {ctrl, alt, shift, key}.
 * Key is lowercased for letters; arrow/special keys preserved (ArrowLeft, Enter, Escape, etc).
 * @param {string} comboStr
 */
export function parseKeyCombo(
    comboStr: string,
): { ctrl: boolean; alt: boolean; shift: boolean; key: string } {
    if (typeof comboStr !== 'string' || comboStr.trim() === '') {
        throw new Error('parseKeyCombo: empty combo');
    }
    const parts = comboStr.split('+').map((p) => p.trim());
    if (parts.some((p) => p === '')) {
        throw new Error(`parseKeyCombo: malformed combo "${comboStr}"`);
    }
    let ctrl = false;
    let alt = false;
    let shift = false;
    let key: string | null = null;
    for (const part of parts) {
        const lower = part.toLowerCase();
        if (lower === 'ctrl' || lower === 'control') ctrl = true;
        else if (lower === 'alt') alt = true;
        else if (lower === 'shift') shift = true;
        else {
            if (key !== null) {
                throw new Error(`parseKeyCombo: multiple non-modifier keys in "${comboStr}"`);
            }
            key = part.length === 1 ? part.toLowerCase() : part;
        }
    }
    if (key === null) {
        throw new Error(`parseKeyCombo: no key in "${comboStr}"`);
    }
    return { ctrl, alt, shift, key };
}

/**
 * Format {ctrl, alt, shift, key} → 'Ctrl+Alt+Shift+key' canonical.
 * @param {{ctrl?:boolean, alt?:boolean, shift?:boolean, key:string}} combo
 */
export function formatKeyCombo(combo: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    key: string;
}): string {
    if (!combo || typeof combo.key !== 'string' || combo.key === '') {
        throw new Error('formatKeyCombo: missing key');
    }
    const segs: string[] = [];
    if (combo.ctrl) segs.push('Ctrl');
    if (combo.alt) segs.push('Alt');
    if (combo.shift) segs.push('Shift');
    segs.push(combo.key);
    return segs.join('+');
}

function normalizeKeys(keysStr: any): string {
    return formatKeyCombo(parseKeyCombo(keysStr));
}

function validateShortcut(shortcut: any): string {
    if (!shortcut || typeof shortcut !== 'object') {
        throw new Error('registerShortcut: shortcut must be object');
    }
    const { id, keys, description, context, handler } = shortcut;
    if (typeof id !== 'string' || id === '') throw new Error('registerShortcut: invalid id');
    if (typeof keys !== 'string' || keys === '') throw new Error('registerShortcut: invalid keys');
    if (typeof description !== 'string') throw new Error('registerShortcut: invalid description');
    if (!VALID_CONTEXTS.includes(context)) {
        throw new Error(`registerShortcut: invalid context "${context}"`);
    }
    if (typeof handler !== 'string' || handler === '') {
        throw new Error('registerShortcut: invalid handler');
    }
    // Normalize keys (throws on malformed).
    return normalizeKeys(keys);
}

/**
 * Register shortcut. Throws on duplicate id, malformed keys, or
 * conflict (same normalized keys + context already exists & enabled).
 */
export function registerShortcut(state: any, shortcut: any): { shortcuts: Map<any, any> } {
    const normalizedKeys = validateShortcut(shortcut);
    if (state.shortcuts.has(shortcut.id)) {
        throw new Error(`registerShortcut: duplicate id "${shortcut.id}"`);
    }
    for (const existing of state.shortcuts.values()) {
        if (existing.context === shortcut.context && existing.normalizedKeys === normalizedKeys) {
            throw new Error(
                `registerShortcut: conflict — "${normalizedKeys}" already bound in context "${shortcut.context}" (id="${existing.id}")`,
            );
        }
    }
    const enabled = shortcut.enabled !== false;
    const next = new Map(state.shortcuts);
    next.set(
        shortcut.id,
        Object.freeze({
            id: shortcut.id,
            keys: shortcut.keys,
            normalizedKeys,
            description: shortcut.description,
            context: shortcut.context,
            handler: shortcut.handler,
            enabled,
        }),
    );
    return freezeState(next);
}

export function unregisterShortcut(state: any, id: any): { shortcuts: Map<any, any> } {
    if (!state.shortcuts.has(id)) return state;
    const next = new Map(state.shortcuts);
    next.delete(id);
    return freezeState(next);
}

function setEnabled(state: any, id: any, enabled: any): { shortcuts: Map<any, any> } {
    const cur = state.shortcuts.get(id);
    if (!cur) throw new Error(`setEnabled: unknown id "${id}"`);
    if (cur.enabled === enabled) return state;
    const next = new Map(state.shortcuts);
    next.set(id, Object.freeze({ ...cur, enabled }));
    return freezeState(next);
}

export function enableShortcut(state: any, id: any): { shortcuts: Map<any, any> } {
    return setEnabled(state, id, true);
}

export function disableShortcut(state: any, id: any): { shortcuts: Map<any, any> } {
    return setEnabled(state, id, false);
}

/**
 * Match a key event against the registry.
 * Context-specific matches outrank 'global'. Disabled shortcuts ignored.
 * @param {{shortcuts:Map<any, any>}} state
 * @param {{ctrlKey:boolean, altKey:boolean, shiftKey:boolean, key:string}} ev
 * @param {string} currentContext
 */
export function matchShortcut(
    state: { shortcuts: Map<any, any> },
    ev: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; key: string },
    currentContext: string,
): any {
    if (!ev || typeof ev.key !== 'string') return null;
    if (!VALID_CONTEXTS.includes(currentContext)) {
        throw new Error(`matchShortcut: invalid context "${currentContext}"`);
    }
    const normalizedEvent = formatKeyCombo({
        ctrl: !!ev.ctrlKey,
        alt: !!ev.altKey,
        shift: !!ev.shiftKey,
        key: ev.key.length === 1 ? ev.key.toLowerCase() : ev.key,
    });
    let globalMatch = null;
    for (const sc of state.shortcuts.values()) {
        if (!sc.enabled) continue;
        if (sc.normalizedKeys !== normalizedEvent) continue;
        if (sc.context === currentContext) return sc;
        if (sc.context === 'global') globalMatch = sc;
    }
    return globalMatch;
}

export function getShortcutsForContext(state: any, context: any): any[] {
    if (!VALID_CONTEXTS.includes(context)) {
        throw new Error(`getShortcutsForContext: invalid context "${context}"`);
    }
    const out: any[] = [];
    for (const sc of state.shortcuts.values()) {
        if (sc.context === context) out.push(sc);
    }
    return out;
}

export function hasConflict(state: any, keys: any, context: any): boolean {
    if (!VALID_CONTEXTS.includes(context)) return false;
    let normalized;
    try {
        normalized = normalizeKeys(keys);
    } catch {
        return false;
    }
    for (const sc of state.shortcuts.values()) {
        if (sc.context === context && sc.normalizedKeys === normalized) return true;
    }
    return false;
}

export function summarizeShortcuts(
    state: any,
): { total: number; byContext: { global: number; modal: number; editor: number; viewport: number }; enabled: number; disabled: number } {
    const byContext = { global: 0, modal: 0, editor: 0, viewport: 0 };
    let enabled = 0;
    let disabled = 0;
    for (const sc of state.shortcuts.values()) {
        (byContext as any)[sc.context] += 1;
        if (sc.enabled) enabled += 1;
        else disabled += 1;
    }
    return { total: state.shortcuts.size, byContext, enabled, disabled };
}

export const __INTERNAL__ = Object.freeze({ VALID_CONTEXTS, MODIFIER_ORDER });
