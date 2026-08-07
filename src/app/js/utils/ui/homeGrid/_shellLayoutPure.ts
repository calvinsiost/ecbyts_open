// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S6 (shellRoot slice) — PURE shell layout logic.
 * claude (refactor) 2026-06-18.
 *
 * EN: DOM-free decision logic for the home "actions shell" root: the named
 *     layout-mode resolver (mode -> {left,right} widths), the 1D splitter
 *     clamp primitive (position against {min,max} bounds), and the persisted
 *     shell-state serialize/parse round-trip (the localStorage store shape,
 *     keyed by breakpoint). homeGrid.ts / homeActionsShellLayout.ts keep all
 *     DOM glue (element refs, pointer drag, requestAnimationFrame,
 *     localStorage I/O) and delegate these decisions here — behaviour identical.
 *
 * PT (leigo): a "regra" da moldura da tela inicial, sem mexer em tela nenhuma.
 *     Três coisas: (1) dado um MODO de layout ("padrão"/"largo"/"compacto"),
 *     qual a largura das colunas esquerda e direita; (2) ao arrastar um
 *     divisor, prender a posição dentro do mínimo/máximo permitido; (3) gravar
 *     e ler de volta o estado salvo das larguras, por tamanho de tela. Quem
 *     desenha de fato é o homeGrid; aqui só decidimos os números.
 *
 * Pure: zero document/window/localStorage, zero module-level mutável.
 * Tudo via args + return determinístico. Cheap tests:
 * tests/ui/homeGrid/shell-root.test.mjs.
 *
 * Spec NOT:
 * - NÃO referenciar document/window/localStorage aqui
 * - NÃO importar nada de homeGrid.ts (one-way dependency)
 * - NÃO duplicar _gridStatsPure / _gridCardsPure (escopo de outros agentes)
 * - NÃO emoji
 */

import { computeDefaultActionsShellLayout } from '../_homeActionsShellLayoutPure.js';

/** Larguras das colunas laterais do shell, em px (a coluna central é o resto). */
export interface ShellWidths {
    readonly left: number;
    readonly right: number;
}

/** Limites 1D para o clamp de um divisor (splitter). */
export interface SplitterBounds {
    readonly min: number;
    readonly max: number;
}

/** Modos de layout nomeados que o `setShellLayout(mode)` aceita. */
export type ShellLayoutMode = 'default' | 'wide' | 'compact';

/** Conjunto canônico de modos válidos (frozen — usado por testes e validação). */
export const SHELL_LAYOUT_MODES: readonly ShellLayoutMode[] = Object.freeze(['default', 'wide', 'compact']);

/**
 * Multiplicadores por modo aplicados sobre o layout padrão (clamped) do shell.
 * - default: padrão exato.
 * - wide:    painel direito mais largo (mais contexto/relações).
 * - compact: laterais mais estreitas (mais espaço para o centro).
 * Mantém-se determinístico e independente de DOM: recebe rootWidth + gap.
 */
const SHELL_MODE_FACTORS: Readonly<Record<ShellLayoutMode, ShellWidths>> = Object.freeze({
    default: Object.freeze({ left: 1, right: 1 }),
    wide: Object.freeze({ left: 1, right: 1.18 }),
    compact: Object.freeze({ left: 0.85, right: 0.82 }),
});

/** Verdadeiro se `mode` é um modo de layout reconhecido. */
export function isValidShellLayoutMode(mode: unknown): mode is ShellLayoutMode {
    return typeof mode === 'string' && (SHELL_LAYOUT_MODES as readonly string[]).includes(mode);
}

/**
 * Resolve um MODO de layout nomeado para larguras concretas {left,right} em px.
 *
 * A base é o layout padrão já clamped (reusa a math canônica do actions-shell);
 * o modo apenas escala as laterais por um fator fixo. O resultado é arredondado
 * e nunca negativo. Modo inválido cai em 'default' (fail-safe, sem throw) — o
 * mesmo comportamento defensivo do resto do shell.
 *
 * @param mode      modo de layout ('default' | 'wide' | 'compact')
 * @param rootWidth largura total do shell, em px
 * @param gapWidth  largura do gap entre colunas, em px (lida do CSS pelo caller)
 * @param opts      { resizable } — abaixo do MIN_VIEWPORT o shell não redimensiona
 * @returns larguras {left,right} em px
 */
export function resolveShellLayout(
    mode: unknown,
    rootWidth: number,
    gapWidth: number,
    opts: { resizable?: boolean } = {},
): ShellWidths {
    const safeMode: ShellLayoutMode = isValidShellLayoutMode(mode) ? mode : 'default';
    const base = computeDefaultActionsShellLayout(rootWidth, gapWidth, opts);
    const factor = SHELL_MODE_FACTORS[safeMode];
    return {
        left: Math.max(0, Math.round(base.left * factor.left)),
        right: Math.max(0, Math.round(base.right * factor.right)),
    };
}

/**
 * Clamp 1D de uma posição de divisor contra {min,max}.
 *
 * Primitiva pura usada pelo drag/keyboard do splitter: garante que a posição
 * arrastada nunca saia do intervalo permitido. Robusta a bounds invertidos
 * (min>max → colapsa em min) e a entrada suja (NaN → min).
 *
 * @param pos    posição candidata, em px
 * @param bounds { min, max } em px
 * @returns posição presa em [min, max]
 */
export function clampSplitter(pos: number, bounds: SplitterBounds): number {
    const min = Number(bounds?.min) || 0;
    const rawMax = Number(bounds?.max);
    const max = Number.isFinite(rawMax) ? rawMax : min;
    const hi = Math.max(min, max);
    const n = Number(pos);
    if (!Number.isFinite(n)) return min;
    return Math.min(hi, Math.max(min, n));
}

/**
 * Estado serializável do shell: um mapa breakpoint -> larguras.
 * Espelha exatamente a forma persistida em localStorage 'ecbyts-actions-layout-v1'
 * (store keyed por breakpoint 'wide'|'desktop'), só que como dado puro.
 */
export type ShellState = Record<string, ShellWidths>;

/**
 * Serializa o estado do shell para string JSON estável (para persistência).
 * Entrada inválida/null vira store vazio `{}` (fail-safe, nunca throw). Cada
 * entrada é normalizada para `{left,right}` numéricos arredondados; entradas
 * malformadas são descartadas — round-trip limpo com parseShellState.
 *
 * @param state mapa breakpoint -> {left,right}
 * @returns JSON string do store saneado
 */
export function serializeShellState(state: unknown): string {
    return JSON.stringify(sanitizeShellState(state));
}

/**
 * Faz o parse de um estado de shell persistido (string JSON ou objeto já
 * decodificado) de volta para um ShellState saneado. Qualquer coisa inválida
 * (JSON quebrado, não-objeto, null) vira `{}` — defensivo, sem throw.
 *
 * @param raw JSON string OU objeto já parseado
 * @returns ShellState saneado (mapa breakpoint -> {left,right})
 */
export function parseShellState(raw: unknown): ShellState {
    if (raw == null) return {};
    if (typeof raw === 'string') {
        try {
            return sanitizeShellState(JSON.parse(raw));
        } catch {
            return {};
        }
    }
    return sanitizeShellState(raw);
}

/**
 * Lê as larguras salvas para um breakpoint específico de um ShellState.
 * Retorna null se ausente — o caller então cai no default computado (mesma
 * precedência do _refreshActionsShellLayout legado).
 *
 * @param state ShellState (já parseado)
 * @param breakpoint chave do breakpoint (ex.: 'wide' | 'desktop')
 * @returns larguras {left,right} ou null
 */
export function getShellWidthsForBreakpoint(state: unknown, breakpoint: string): ShellWidths | null {
    const sane = sanitizeShellState(state);
    const entry = sane[breakpoint];
    return entry ? { left: entry.left, right: entry.right } : null;
}

/**
 * Grava (imutável) as larguras de um breakpoint dentro de um ShellState,
 * retornando um NOVO store saneado. Espelha `store[breakpoint] = layout` do
 * legado, mas sem mutar a entrada — adequado a uso puro.
 *
 * @param state      ShellState atual (parseado)
 * @param breakpoint chave do breakpoint
 * @param widths     larguras a gravar
 * @returns novo ShellState saneado com a entrada atualizada
 */
export function withShellWidthsForBreakpoint(state: unknown, breakpoint: string, widths: ShellWidths): ShellState {
    const next = sanitizeShellState(state);
    const w = sanitizeWidths(widths);
    if (w && typeof breakpoint === 'string' && breakpoint.length > 0) {
        next[breakpoint] = w;
    }
    return next;
}

// --- helpers internos (puros) ---

/** Normaliza um valor para {left,right} numéricos arredondados, ou null se inválido. */
function sanitizeWidths(value: unknown): ShellWidths | null {
    if (!value || typeof value !== 'object') return null;
    const v = value as { left?: unknown; right?: unknown };
    const left = Number(v.left);
    const right = Number(v.right);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    return { left: Math.round(left), right: Math.round(right) };
}

/** Sanea um store inteiro: descarta entradas malformadas, mantém só {left,right} válidos. */
function sanitizeShellState(value: unknown): ShellState {
    if (!value || typeof value !== 'object') return {};
    const out: ShellState = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        const w = sanitizeWidths(raw);
        if (w) out[key] = w;
    }
    return out;
}
