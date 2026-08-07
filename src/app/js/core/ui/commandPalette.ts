// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-47 - Command Palette state (pure-logic, zero DOM).
 *
 * Cmd+K-style command launcher. Frozen state machine + ranking.
 * Consolidates UX-44 (keyboard shortcuts) and UX-46 (model search) into
 * a unified command launcher surface.
 *
 * @module core/ui/commandPalette
 */

const VALID_CATEGORIES = ['navigation', 'edit', 'view', 'tool', 'help'] as const;
const MAX_RECENT = 10;
const RECENT_BONUS_BASE = 30;

export type CommandCategory = (typeof VALID_CATEGORIES)[number];
export type SelectionDirection = 'up' | 'down';

export interface Command {
    id: string;
    label: string;
    description: string;
    category: CommandCategory;
    keywords: readonly unknown[];
    shortcut: string | null;
    actionId: string;
    recentlyUsed: number | null;
    frequency: number;
}

export interface CommandInput {
    id?: unknown;
    label?: unknown;
    description?: unknown;
    category?: unknown;
    keywords?: unknown;
    shortcut?: unknown;
    actionId?: unknown;
    recentlyUsed?: unknown;
    frequency?: unknown;
}

export interface CommandPaletteState {
    commands: readonly Readonly<Command>[];
    isOpen: boolean;
    query: string;
    selectedIndex: number;
    recentlyUsedIds: readonly string[];
}

export interface CreateCommandPaletteOptions {
    commands?: unknown;
}

export interface ExecuteSelectedResult {
    actionId: string;
    state: Readonly<CommandPaletteState>;
}

export interface PaletteSummary {
    commandCount: number;
    recentCount: number;
    mostUsed: { id: string; frequency: number } | null;
}

interface ValidCommandInput extends CommandInput {
    id: string;
    label: string;
    category: CommandCategory;
    actionId: string;
    keywords?: readonly unknown[];
}

function isCommandCategory(category: unknown): category is CommandCategory {
    return typeof category === 'string' && VALID_CATEGORIES.includes(category as CommandCategory);
}

function validateCommand(cmd: CommandInput): asserts cmd is ValidCommandInput {
    if (!cmd || typeof cmd !== 'object') {
        throw new Error('commandPalette: command must be object');
    }
    if (!cmd.id || typeof cmd.id !== 'string') {
        throw new Error('commandPalette: command.id required');
    }
    if (!cmd.label || typeof cmd.label !== 'string') {
        throw new Error('commandPalette: command.label required');
    }
    if (!isCommandCategory(cmd.category)) {
        throw new Error(`commandPalette: invalid category "${String(cmd.category)}"`);
    }
    if (!cmd.actionId || typeof cmd.actionId !== 'string') {
        throw new Error('commandPalette: command.actionId required');
    }
    if (cmd.keywords && !Array.isArray(cmd.keywords)) {
        throw new Error('commandPalette: command.keywords must be array');
    }
}

function freezeCommand(cmd: ValidCommandInput): Readonly<Command> {
    return Object.freeze({
        id: cmd.id,
        label: cmd.label,
        description: (cmd.description || '') as string,
        category: cmd.category,
        keywords: Object.freeze([...(cmd.keywords || [])]),
        shortcut: (cmd.shortcut || null) as string | null,
        actionId: cmd.actionId,
        recentlyUsed: typeof cmd.recentlyUsed === 'number' ? cmd.recentlyUsed : null,
        frequency: typeof cmd.frequency === 'number' ? cmd.frequency : 0,
    });
}

function freezeState(state: CommandPaletteState): Readonly<CommandPaletteState> {
    return Object.freeze({
        commands: Object.freeze([...state.commands]),
        isOpen: !!state.isOpen,
        query: state.query || '',
        selectedIndex: state.selectedIndex | 0,
        recentlyUsedIds: Object.freeze([...state.recentlyUsedIds]),
    });
}

/**
 * Create a frozen command palette state.
 */
export function createCommandPalette({ commands }: CreateCommandPaletteOptions = {}): Readonly<CommandPaletteState> {
    if (!Array.isArray(commands)) {
        throw new Error('commandPalette: commands must be array');
    }
    const seen = new Set<string>();
    const frozen: Readonly<Command>[] = [];
    for (const cmd of commands) {
        validateCommand(cmd as CommandInput);
        if (seen.has(cmd.id)) {
            throw new Error(`commandPalette: duplicate command id "${cmd.id}"`);
        }
        seen.add(cmd.id);
        frozen.push(freezeCommand(cmd));
    }
    return freezeState({
        commands: frozen,
        isOpen: false,
        query: '',
        selectedIndex: 0,
        recentlyUsedIds: [],
    });
}

export function openPalette(state: Readonly<CommandPaletteState>): Readonly<CommandPaletteState> {
    return freezeState({
        commands: state.commands,
        isOpen: true,
        query: '',
        selectedIndex: 0,
        recentlyUsedIds: state.recentlyUsedIds,
    });
}

export function closePalette(state: Readonly<CommandPaletteState>): Readonly<CommandPaletteState> {
    return freezeState({
        commands: state.commands,
        isOpen: false,
        query: '',
        selectedIndex: 0,
        recentlyUsedIds: state.recentlyUsedIds,
    });
}

export function setQuery(state: Readonly<CommandPaletteState>, query: unknown): Readonly<CommandPaletteState> {
    const q = query == null ? '' : String(query);
    return freezeState({
        commands: state.commands,
        isOpen: state.isOpen,
        query: q,
        selectedIndex: 0,
        recentlyUsedIds: state.recentlyUsedIds,
    });
}

function clamp(n: number, min: number, max: number): number {
    if (max < min) return min;
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

export function moveSelection(
    state: Readonly<CommandPaletteState>,
    direction: SelectionDirection,
): Readonly<CommandPaletteState> {
    if (direction !== 'up' && direction !== 'down') {
        throw new Error('commandPalette: direction must be "up" or "down"');
    }
    const filtered = getFilteredCommands(state);
    if (filtered.length === 0) {
        return freezeState({ ...state, selectedIndex: 0 });
    }
    const max = filtered.length - 1;
    const cur = clamp(state.selectedIndex, 0, max);
    const next = direction === 'down' ? cur + 1 : cur - 1;
    const wrapped = next < 0 ? max : next > max ? 0 : next;
    return freezeState({
        commands: state.commands,
        isOpen: state.isOpen,
        query: state.query,
        selectedIndex: wrapped,
        recentlyUsedIds: state.recentlyUsedIds,
    });
}

function scoreCommand(
    cmd: Readonly<Command>,
    query: string,
    recentlyUsedIds: readonly string[],
): number {
    const labelLc = cmd.label.toLowerCase();
    const descLc = (cmd.description || '').toLowerCase();
    const q = query.toLowerCase().trim();
    let score = 0;

    if (q) {
        if (labelLc === q) score += 100;
        else if (labelLc.startsWith(q)) score += 50;
        else if (labelLc.includes(q)) score += 20;

        for (const kw of cmd.keywords) {
            if (String(kw).toLowerCase().includes(q)) {
                score += 15;
                break;
            }
        }
        if (descLc.includes(q)) score += 5;
    } else {
        // No query: base score so all commands are visible
        score += 1;
    }

    const recentIdx = recentlyUsedIds.indexOf(cmd.id);
    if (recentIdx >= 0) {
        score += Math.max(1, RECENT_BONUS_BASE - recentIdx * 3);
    }
    score += (cmd.frequency || 0) * 2;
    return score;
}

/**
 * Filter + rank commands. Returns ordered array.
 */
export function getFilteredCommands(state: Readonly<CommandPaletteState>): Readonly<Command>[] {
    const q = (state.query || '').trim();
    const scored: { cmd: Readonly<Command>; score: number }[] = [];
    for (const cmd of state.commands) {
        const score = scoreCommand(cmd, state.query || '', state.recentlyUsedIds);
        if (q) {
            // require some real match when query is present
            const labelLc = cmd.label.toLowerCase();
            const descLc = (cmd.description || '').toLowerCase();
            const qLc = q.toLowerCase();
            const kwHit = cmd.keywords.some((k) => String(k).toLowerCase().includes(qLc));
            if (!labelLc.includes(qLc) && !descLc.includes(qLc) && !kwHit) continue;
        }
        if (score <= 0) continue;
        scored.push({ cmd, score });
    }
    scored.sort((a, b) => b.score - a.score || a.cmd.label.localeCompare(b.cmd.label));
    return scored.map((s) => s.cmd);
}

/**
 * Execute the currently selected command. Returns {actionId, state}.
 */
export function executeSelected(state: Readonly<CommandPaletteState>, now?: unknown): ExecuteSelectedResult {
    const filtered = getFilteredCommands(state);
    if (filtered.length === 0) {
        throw new Error('commandPalette: no command to execute');
    }
    const idx = clamp(state.selectedIndex, 0, filtered.length - 1);
    const target = filtered[idx];
    if (!target) {
        throw new Error('commandPalette: no command to execute');
    }
    const ts = typeof now === 'number' ? now : Date.now();

    const newCommands = state.commands.map((c) => {
        if (c.id !== target.id) return c;
        return Object.freeze({
            ...c,
            keywords: c.keywords,
            recentlyUsed: ts,
            frequency: (c.frequency || 0) + 1,
        });
    });

    const filteredRecent = state.recentlyUsedIds.filter((id) => id !== target.id);
    const newRecent = [target.id, ...filteredRecent].slice(0, MAX_RECENT);

    const newState = freezeState({
        commands: newCommands,
        isOpen: state.isOpen,
        query: state.query,
        selectedIndex: 0,
        recentlyUsedIds: newRecent,
    });
    return { actionId: target.actionId, state: newState };
}

export function registerCommand(
    state: Readonly<CommandPaletteState>,
    command: CommandInput,
): Readonly<CommandPaletteState> {
    validateCommand(command);
    if (state.commands.some((c) => c.id === command.id)) {
        throw new Error(`commandPalette: duplicate command id "${command.id}"`);
    }
    const newCommands = [...state.commands, freezeCommand(command)];
    return freezeState({
        commands: newCommands,
        isOpen: state.isOpen,
        query: state.query,
        selectedIndex: state.selectedIndex,
        recentlyUsedIds: state.recentlyUsedIds,
    });
}

export function unregisterCommand(state: Readonly<CommandPaletteState>, id: string): Readonly<CommandPaletteState> {
    if (!state.commands.some((c) => c.id === id)) return state;
    const newCommands = state.commands.filter((c) => c.id !== id);
    const newRecent = state.recentlyUsedIds.filter((r) => r !== id);
    return freezeState({
        commands: newCommands,
        isOpen: state.isOpen,
        query: state.query,
        selectedIndex: 0,
        recentlyUsedIds: newRecent,
    });
}

export function clearRecentlyUsed(state: Readonly<CommandPaletteState>): Readonly<CommandPaletteState> {
    return freezeState({
        commands: state.commands,
        isOpen: state.isOpen,
        query: state.query,
        selectedIndex: state.selectedIndex,
        recentlyUsedIds: [],
    });
}

export function summarizePalette(state: Readonly<CommandPaletteState>): PaletteSummary {
    const commandCount = state.commands.length;
    const recentCount = state.recentlyUsedIds.length;
    let mostUsed: { id: string; frequency: number } | null = null;
    for (const c of state.commands) {
        if (!mostUsed || (c.frequency || 0) > (mostUsed.frequency || 0)) {
            if ((c.frequency || 0) > 0) mostUsed = { id: c.id, frequency: c.frequency || 0 };
        }
    }
    return { commandCount, recentCount, mostUsed };
}
