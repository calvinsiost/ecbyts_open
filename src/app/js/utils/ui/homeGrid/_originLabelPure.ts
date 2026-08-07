// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 — rótulo PURO da "origem" de uma mudança de contexto
 * da home (de onde veio a navegação: árvore, barra, seleção, etc.).
 * claude (refactor) 2026-06-20.
 *
 * EN: Pure resolver that turns a technical context-change origin code
 *     ('init', 'tree', 'toolbar', ...) into a friendly, i18n-aware label.
 *     No DOM, no globals, no module state. The translator `t` is injected (the
 *     barrel passes the real i18n `t`), keeping this deterministic and testable.
 *     Mirrors the legacy inline `_originToLabel(origin)` in homeGrid.ts EXACTLY:
 *       - a known origin resolves to `t(key) || <Portuguese fallback>`;
 *       - an unknown origin returns the origin code itself (safe passthrough for
 *         new origins), NOT the 'unknown' label.
 *
 * PT (leigo): converte o código técnico que diz "de onde o usuário veio" ao
 *     trocar de contexto na tela inicial (árvore, menu lateral, seleção...) num
 *     texto legível. Usa a tradução quando existe, senão um texto-padrão em
 *     português; se a origem for desconhecida, devolve o próprio código (assim
 *     origens novas nunca quebram). Mesma decisão que estava embutida no
 *     homeGrid — agora isolada e testável.
 *
 * Pure: dadas as MESMAS entradas (origin + tradutor), devolve SEMPRE a mesma
 * saída, sem efeitos colaterais. Cheap tests: tests/ui/homeGrid/origin-label.test.mjs.
 */

/** Minimal translator contract: key in → (possibly empty) string out. */
export type Translate = (key: string) => string | undefined | null;

/** A known context-change origin with a dedicated i18n key + fallback. */
interface OriginMeta {
    readonly i18nKey: string;
    readonly fallback: string;
}

/**
 * Fixed origin → {i18nKey, fallback} table. Frozen; keys/fallbacks mirror the
 * legacy inline object literal in homeGrid.ts byte-for-byte.
 */
export const ORIGIN_LABEL_META: Readonly<Record<string, OriginMeta>> = Object.freeze({
    init: { i18nKey: 'context.origin.init', fallback: 'Inicial' },
    tree: { i18nKey: 'context.origin.tree', fallback: 'Árvore' },
    toolbar: { i18nKey: 'context.origin.toolbar', fallback: 'Barra' },
    rail: { i18nKey: 'context.origin.rail', fallback: 'Menu lateral' },
    'grouped-sidebar': { i18nKey: 'context.origin.sidebar', fallback: 'Grupos' },
    selection: { i18nKey: 'context.origin.selection', fallback: 'Seleção' },
    'workspace-local': { i18nKey: 'context.origin.workspaceLocal', fallback: 'Workspace local' },
    'workspace-model': { i18nKey: 'context.origin.workspaceModel', fallback: 'Modelo salvo' },
    'workspace-shared': { i18nKey: 'context.origin.workspaceShared', fallback: 'Modelo compartilhado' },
    'workspace-snapshot': { i18nKey: 'context.origin.workspaceSnapshot', fallback: 'Snapshot' },
    'boot-load': { i18nKey: 'context.origin.boot', fallback: 'Recarregar' },
    unknown: { i18nKey: 'context.origin.unknown', fallback: 'Desconhecida' },
});

/**
 * Resolve a friendly label for a context-change origin code.
 *
 * Behaviour is byte-identical to the legacy inline `_originToLabel`:
 * known origin → `t(key) || fallback`; unknown origin → the origin code itself.
 *
 * @param origin the technical origin code (e.g. 'tree', 'toolbar')
 * @param t      i18n translator; missing/empty translation falls back to the PT label
 * @returns the resolved, human-readable origin label
 */
export function originToLabel(origin: unknown, t: Translate): string {
    const meta = ORIGIN_LABEL_META[origin as string];
    if (!meta) return origin as string;
    return t(meta.i18nKey) || meta.fallback;
}
