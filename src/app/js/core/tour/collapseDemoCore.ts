// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   TOUR COLLAPSE DEMO CORE — SPEC_TOUR_COLLAPSE_BUTTONS

   Pure helpers para step 5 do tour de boas-vindas:
   - Panel state serialization (save/diff/restore)
   - Collapse sequence builder (timing + order)
   - Demo state machine (idle/playing/paused/done)
   - Pause/advance controls

   DOM manipulation + animation ficam em utils/ui/tour/tourCollapseDemo.js.
   ================================================================ */

type CollapsiblePanelId = 'left-panel' | 'right-panel' | 'toolbar' | 'constellation';

type DemoState = 'idle' | 'playing' | 'paused' | 'done';

type PanelState = 'docked' | 'minimized' | 'floating';

interface PanelStateEntry {
    state: PanelState;
    width?: number | null;
    height?: number | null;
}

interface DemoSequenceStep {
    panel: string;
    action: 'collapse' | 'expand';
    delayMs: number;
}

interface DemoSnapshot {
    state?: DemoState;
    index?: number;
    sequence?: Array<DemoSequenceStep>;
}

interface DemoAdvanceResult {
    state: DemoState;
    index: number;
    done: boolean;
}

// ──────────────────────────────────────────────────────────────────────
// Constants §RF-1/RF-3
// ──────────────────────────────────────────────────────────────────────

// 4 panels canônicos do layout ecbyts
export const COLLAPSIBLE_PANELS: ReadonlyArray<CollapsiblePanelId> = Object.freeze([
    'left-panel', // sidebar esquerda
    'right-panel', // sidebar direita (property inspector)
    'toolbar', // barra superior (ribbon)
    'constellation', // painel inferior (timeline/analytics)
]);

export const DEMO_STATES: ReadonlyArray<DemoState> = Object.freeze(['idle', 'playing', 'paused', 'done']);

export const TIMING = Object.freeze({
    COLLAPSE_MS: 500, // §RF-3.2
    EXPANDED_MS: 800,
    TOOLTIP_MS: 300, // highlight fade
});

export const PANEL_STATES: ReadonlyArray<PanelState> = Object.freeze(['docked', 'minimized', 'floating']);

// ──────────────────────────────────────────────────────────────────────
// Panel state validation + serialization
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} panelId
 * @returns {boolean}
 */
export function isCollapsiblePanel(panelId: string): boolean {
    return COLLAPSIBLE_PANELS.includes(panelId as CollapsiblePanelId);
}

/**
 * @param {Record<string, PanelStateEntry>|null|undefined} state
 * @returns {boolean}
 */
export function isValidPanelStateMap(state: Record<string, PanelStateEntry> | null | undefined): boolean {
    if (!state || typeof state !== 'object') return false;
    for (const panel of COLLAPSIBLE_PANELS) {
        const v = state[panel];
        if (!v || typeof v !== 'object') return false;
        if (!PANEL_STATES.includes(v.state)) return false;
    }
    return true;
}

/**
 * Snapshot do estado atual (pure - input já coletado pelo caller do DOM).
 * @param {Record<string, PanelStateEntry>|null|undefined} panelStates
 * @returns {Record<string, Readonly<{state:PanelState, width:number|null, height:number|null}>>} deep clone frozen
 */
export function serializePanelStates(
    panelStates: Record<string, PanelStateEntry> | null | undefined,
): Record<string, Readonly<{ state: PanelState; width: number | null; height: number | null }>> {
    const out: Record<string, Readonly<{ state: PanelState; width: number | null; height: number | null }>> = {};
    for (const panel of COLLAPSIBLE_PANELS) {
        const s = panelStates?.[panel];
        if (!s) continue;
        out[panel] = Object.freeze({
            state: (s.state || 'docked') as PanelState,
            width: Number.isFinite(s.width) ? (s.width as number) : null,
            height: Number.isFinite(s.height) ? (s.height as number) : null,
        });
    }
    return out;
}

/**
 * Diff entre estado salvo e estado atual.
 * @param {Record<string, PanelStateEntry>|null|undefined} saved
 * @param {Record<string, PanelStateEntry>|null|undefined} PanelStateEntry>
 * @returns {string[]} panelIds que mudaram
 */
export function diffPanelStates(
    saved: Record<string, PanelStateEntry> | null | undefined,
    current: Record<string, PanelStateEntry> | null | undefined,
): string[] {
    const diffs: string[] = [];
    if (!saved || !current) return diffs;
    for (const panel of COLLAPSIBLE_PANELS) {
        const a = saved[panel];
        const b = current[panel];
        if (!a || !b) continue;
        if (a.state !== b.state) diffs.push(panel);
    }
    return diffs;
}

// ──────────────────────────────────────────────────────────────────────
// Demo sequence builder §RF-3.1
// ──────────────────────────────────────────────────────────────────────

/**
 * Constrói sequência de ações [collapse panelA → expand panelA → collapse panelB → ...]
 * para demonstrar cada panel.
 *
 * @param {ReadonlyArray<string>} [panels]
 * @returns {Array<DemoSequenceStep>}
 */
export function buildDemoSequence(panels: ReadonlyArray<string> = COLLAPSIBLE_PANELS): Array<DemoSequenceStep> {
    const list = Array.isArray(panels) ? panels.filter((p: string) => isCollapsiblePanel(p)) : [];
    const out: Array<DemoSequenceStep> = [];
    for (const panel of list) {
        out.push({ panel, action: 'collapse', delayMs: TIMING.COLLAPSE_MS });
        out.push({ panel, action: 'expand', delayMs: TIMING.EXPANDED_MS });
    }
    return out;
}

/**
 * Duração total da sequência em ms.
 * @param {ReadonlyArray<{delayMs?:number}>|null|undefined} sequence
 * @returns {number}
 */
export function totalDemoDurationMs(sequence: ReadonlyArray<{ delayMs?: number }> | null | undefined): number {
    if (!Array.isArray(sequence)) return 0;
    return sequence.reduce((acc: number, s: { delayMs?: number }) => acc + (Number(s.delayMs) || 0), 0);
}

// ──────────────────────────────────────────────────────────────────────
// State machine §Demo FSM
// ──────────────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Readonly<Record<DemoState, ReadonlyArray<DemoState>>> = Object.freeze({
    idle: Object.freeze(['playing']) as ReadonlyArray<DemoState>,
    playing: Object.freeze(['paused', 'done']) as ReadonlyArray<DemoState>,
    paused: Object.freeze(['playing', 'done']) as ReadonlyArray<DemoState>,
    done: Object.freeze(['idle']) as ReadonlyArray<DemoState>,
});

/**
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function canTransitionDemo(from: string, to: string): boolean {
    if (!DEMO_STATES.includes(from as DemoState)) return false;
    if (!DEMO_STATES.includes(to as DemoState)) return false;
    const transitions = VALID_TRANSITIONS[from as DemoState];
    return (transitions || []).includes(to as DemoState);
}

function advanceStart(state: DemoState, index: number): DemoAdvanceResult {
    if (!canTransitionDemo(state, 'playing')) return { state, index, done: false };
    return { state: 'playing', index: 0, done: false };
}

function advancePause(state: DemoState, index: number): DemoAdvanceResult {
    if (!canTransitionDemo(state, 'paused')) return { state, index, done: false };
    return { state: 'paused', index, done: false };
}

function advanceResume(state: DemoState, index: number): DemoAdvanceResult {
    if (!canTransitionDemo(state, 'playing')) return { state, index, done: false };
    return { state: 'playing', index, done: false };
}

function advanceSkipOrTick(state: DemoState, index: number, seq: DemoSequenceStep[]): DemoAdvanceResult {
    if (state !== 'playing') return { state, index, done: false };
    const nextIdx = index + 1;
    if (nextIdx >= seq.length) {
        return { state: 'done', index: seq.length, done: true };
    }
    return { state: 'playing', index: nextIdx, done: false };
}

function advanceReset(): DemoAdvanceResult {
    return { state: 'idle', index: 0, done: false };
}

/**
 * Avança o índice da sequência. Retorna next state + índice.
 *
 * @param {DemoSnapshot|null|undefined} demo
 * @param {'tick'|'pause'|'resume'|'skip'|'start'|'reset'} event
 * @returns {DemoAdvanceResult}
 */
export function advanceDemo(
    demo: DemoSnapshot | null | undefined,
    event: 'tick' | 'pause' | 'resume' | 'skip' | 'start' | 'reset',
): DemoAdvanceResult {
    const state: DemoState = demo?.state || 'idle';
    const index = Number.isFinite(demo?.index) ? (demo?.index as number) : 0;
    const seq = Array.isArray(demo?.sequence) ? demo!.sequence! : [];

    switch (event) {
        case 'start':
            return advanceStart(state, index);
        case 'pause':
            return advancePause(state, index);
        case 'resume':
            return advanceResume(state, index);
        case 'skip':
        case 'tick':
            return advanceSkipOrTick(state, index, seq);
        case 'reset':
            return advanceReset();
        default:
            return { state, index, done: false };
    }
}

// ──────────────────────────────────────────────────────────────────────
// i18n tooltip keys (apenas identificadores - traduções no json)
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} panelId
 * @returns {{titleKey:string|null, descKey:string|null}}
 */
export function getPanelTooltipKeys(panelId: string): { titleKey: string | null; descKey: string | null } {
    if (!isCollapsiblePanel(panelId)) return { titleKey: null, descKey: null };
    return {
        titleKey: `tour.collapse.${panelId}.title`,
        descKey: `tour.collapse.${panelId}.desc`,
    };
}
