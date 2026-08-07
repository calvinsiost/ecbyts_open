// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S6 — contrato PURO do scaffold do shell de Ações.
 * claude - ui 2026-06-15.
 *
 * EN: Pure, frozen DOM contract for the 6 shell elements of the home "actions
 *     shell" (root + left sidebar + left splitter + main + right splitter +
 *     right context panel). No DOM, no globals — the runtime in homeGrid.ts
 *     (_buildInteractionShell) iterates this spec to create + append the
 *     elements, instead of 6 repetitive createElement blocks. Making the
 *     contract data testable lets a cheap test assert the a11y attributes
 *     (role=separator, aria-orientation, tabindex on splitters) — a DoD gate.
 *
 * PT (leigo): descreve, como simples dados, a "moldura" da tela inicial — as
 *     três colunas (esquerda, centro, direita) e os dois divisores que se
 *     arrastam entre elas. Quem cria de fato na tela é o homeGrid; aqui só
 *     listamos cada peça com seu nome, classe e atributos de acessibilidade.
 *
 * Pure: dados congelados, determinístico. Cheap tests:
 * tests/home-shell-scaffold-pure.test.mjs.
 */

/** Chave canônica de cada slot do shell (ordem = ordem de inserção no DOM). */
export type ShellSlotKey = 'root' | 'left' | 'leftSplitter' | 'main' | 'rightSplitter' | 'right';

/** Onde o elemento é anexado: no container da home, ou dentro do root do shell. */
export type ShellParent = 'home' | 'root';

/** Especificação imutável de um elemento do scaffold. */
export interface ShellElementSpec {
    readonly key: ShellSlotKey;
    readonly tag: string;
    readonly id?: string;
    readonly className: string;
    readonly attributes: Readonly<Record<string, string>>;
    readonly parent: ShellParent;
}

/**
 * Contrato canônico do scaffold (ordem de inserção). Espelha exatamente o que
 * _buildInteractionShell criava inline — mudar aqui muda o DOM, então qualquer
 * alteração deve vir com screenshot + revisão.
 */
export const SHELL_SCAFFOLD_SPEC: readonly ShellElementSpec[] = Object.freeze([
    Object.freeze({
        key: 'root' as const,
        tag: 'div',
        id: 'actions-shell-root',
        className: 'actions-shell',
        attributes: Object.freeze({ 'data-testid': 'actions-shell-root' }),
        parent: 'home' as const,
    }),
    Object.freeze({
        key: 'left' as const,
        tag: 'aside',
        className: 'actions-shell-left',
        attributes: Object.freeze({ 'data-testid': 'actions-sidebar' }),
        parent: 'root' as const,
    }),
    Object.freeze({
        key: 'leftSplitter' as const,
        tag: 'div',
        className: 'actions-shell-splitter actions-shell-splitter-left',
        attributes: Object.freeze({
            'data-actions-splitter': 'left',
            'data-testid': 'actions-splitter-left',
            role: 'separator',
            'aria-orientation': 'vertical',
            tabindex: '0',
        }),
        parent: 'root' as const,
    }),
    Object.freeze({
        key: 'main' as const,
        tag: 'section',
        className: 'actions-shell-main',
        attributes: Object.freeze({ 'data-testid': 'actions-main' }),
        parent: 'root' as const,
    }),
    Object.freeze({
        key: 'rightSplitter' as const,
        tag: 'div',
        className: 'actions-shell-splitter actions-shell-splitter-right',
        attributes: Object.freeze({
            'data-actions-splitter': 'right',
            'data-testid': 'actions-splitter-right',
            role: 'separator',
            'aria-orientation': 'vertical',
            tabindex: '0',
        }),
        parent: 'root' as const,
    }),
    Object.freeze({
        key: 'right' as const,
        tag: 'aside',
        className: 'actions-shell-right',
        attributes: Object.freeze({ 'data-testid': 'actions-context-panel' }),
        parent: 'root' as const,
    }),
]);

/** Os dois divisores devem ser separadores acessíveis (WCAG): checagem usada em teste. */
export function getSplitterSpecs(): readonly ShellElementSpec[] {
    return SHELL_SCAFFOLD_SPEC.filter((s) => s.key === 'leftSplitter' || s.key === 'rightSplitter');
}

/** Verdadeiro se um spec satisfaz o contrato a11y de separador (role+orientation+tabindex). */
export function isAccessibleSeparator(spec: ShellElementSpec | null | undefined): boolean {
    if (!spec) return false;
    const a = spec.attributes || {};
    return a.role === 'separator' && a['aria-orientation'] === 'vertical' && a.tabindex === '0';
}
