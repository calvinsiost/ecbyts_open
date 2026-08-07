// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S7 — registro PURO de hospedagem de slots do shell.
 * claude - ui 2026-06-15.
 *
 * EN: Pure, immutable slot registry for the home "actions shell". A slot
 *     (constellation 3D host, workspace tree, action cards, context panel) is
 *     registered against exactly ONE scaffold container (left | main | right —
 *     the containers from _homeShellScaffoldPure), and activation is exclusive.
 *     No DOM, no globals — the runtime in homeGrid.ts consults this to decide
 *     WHICH slot owns WHICH container and which is active, instead of ad-hoc
 *     hosting calls. Contract documented in homeGrid/ADR.md.
 *
 * PT (leigo): controla, como dados, QUAL conteúdo mora em QUAL coluna da tela
 *     inicial (o grafo 3D, a árvore de trabalho, os cards de ação, o painel de
 *     contexto) e qual está ativo no momento. Cada conteúdo só pode morar numa
 *     coluna designada — não vaza para outra. Quem desenha é o homeGrid.
 *
 * Pure: estado congelado, transições imutáveis, determinístico. Cheap tests:
 * tests/home-shell-hosting-pure.test.mjs.
 */

/** Colunas do scaffold onde um slot pode morar (espelha _homeShellScaffoldPure). */
export type ShellContainer = 'left' | 'main' | 'right';

/** Nome canônico de cada slot hospedável. */
export type ShellSlotName = 'workspace' | 'actions' | 'context' | 'constellation';

/** Registro imutável de um slot → container designado. */
export interface SlotRegistration {
    readonly name: ShellSlotName;
    readonly container: ShellContainer;
}

/** Estado imutável do registro de slots. */
export interface SlotRegistryState {
    readonly slots: readonly SlotRegistration[];
    readonly activeName: ShellSlotName | null;
}

const VALID_CONTAINERS: ReadonlySet<string> = new Set(['left', 'main', 'right']);

/** Os 4 slots canônicos da home + sua coluna designada (contrato S7). */
export const SHELL_SLOTS: readonly SlotRegistration[] = Object.freeze([
    Object.freeze({ name: 'workspace' as const, container: 'left' as const }),
    Object.freeze({ name: 'actions' as const, container: 'main' as const }),
    Object.freeze({ name: 'context' as const, container: 'right' as const }),
    Object.freeze({ name: 'constellation' as const, container: 'right' as const }),
]);

/** Cria um registro vazio (sem slots, nada ativo). */
export function createSlotRegistry(): SlotRegistryState {
    return Object.freeze({ slots: Object.freeze([]), activeName: null });
}

/** True se um slot com esse nome já está registrado. */
export function isSlotRegistered(state: SlotRegistryState, name: string): boolean {
    if (!state || !Array.isArray(state.slots)) return false;
    return state.slots.some((s) => s.name === name);
}

/**
 * Registra um slot → container. Imutável: devolve NOVO estado. Rejeita (devolve
 * o estado inalterado) se: nome/container inválido, container desconhecido, ou
 * nome já registrado (contrato: 1 registro por nome).
 */
export function registerSlot(state: SlotRegistryState, reg: SlotRegistration): SlotRegistryState {
    if (!state) return createSlotRegistry();
    if (!reg || typeof reg.name !== 'string' || !VALID_CONTAINERS.has(reg.container)) return state;
    if (isSlotRegistered(state, reg.name)) return state; // duplicado: no-op
    const frozen = Object.freeze({ name: reg.name, container: reg.container });
    return Object.freeze({
        slots: Object.freeze([...state.slots, frozen]),
        activeName: state.activeName,
    });
}

/** Registra os 4 slots canônicos de uma vez (a partir de um estado vazio). */
export function registerCanonicalSlots(state: SlotRegistryState = createSlotRegistry()): SlotRegistryState {
    let next = state;
    for (const slot of SHELL_SLOTS) next = registerSlot(next, slot);
    return next;
}

/**
 * Ativa um slot (exclusivo: só um ativo por vez). Rejeita ativar um slot não
 * registrado (devolve estado inalterado — contrato fail-safe).
 */
export function activateSlot(state: SlotRegistryState, name: string): SlotRegistryState {
    if (!state) return createSlotRegistry();
    if (!isSlotRegistered(state, name)) return state;
    if (state.activeName === name) return state;
    return Object.freeze({ slots: state.slots, activeName: name as ShellSlotName });
}

/** Devolve o registro do slot ativo, ou null. */
export function getActiveSlot(state: SlotRegistryState): SlotRegistration | null {
    if (!state || !state.activeName) return null;
    return state.slots.find((s) => s.name === state.activeName) || null;
}

/** Container designado de um slot, ou null se não registrado. */
export function getSlotContainer(state: SlotRegistryState, name: string): ShellContainer | null {
    if (!state || !Array.isArray(state.slots)) return null;
    const slot = state.slots.find((s) => s.name === name);
    return slot ? slot.container : null;
}
