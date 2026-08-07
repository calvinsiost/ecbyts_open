// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   KEYBOARD SHORTCUTS REGISTRY — fonte única de verdade.

   Esta é a ÚNICA lista de atalhos de teclado do app. O modal "Atalhos"
   (Mais → Ajuda → Atalhos) renderiza diretamente deste registry, então
   QUALQUER atalho novo aparece na lista automaticamente — basta adicionar
   uma entrada em SHORTCUTS abaixo (ou chamar registerShortcut() de outro
   módulo). Não há lista duplicada em outro lugar.

   Convenção: ao adicionar/alterar um handler de teclado (em
   main/global-events.ts, editNavigation.ts, commandPalette.ts, etc.),
   registre o atalho aqui no MESMO commit. Um cheap test trava o contrato
   (ids únicos, campos obrigatórios, categorias válidas).
   ================================================================ */

/** @typedef {'general'|'view'|'editing'|'gizmo'|'panels'} ShortcutCategory */

/**
 * @typedef {Object} ShortcutEntry
 * @property {string} id                 Identificador estável (kebab-case).
 * @property {string[][]} keys           Alternativas; cada alternativa é uma sequência
 *                                        de teclas (combo). Ex: [['Ctrl','Z']],
 *                                        [['Ctrl','Y'],['Ctrl','Shift','Z']].
 * @property {string} description         Texto pt-BR (fallback sempre legível).
 * @property {ShortcutCategory} category  Grupo de exibição.
 * @property {string} [descriptionKey]    Chave i18n opcional (sobrepõe description se traduzida).
 * @property {string} [context]           Contexto curto (ex: "em edição", "no gizmo").
 */

/** Ordem canônica das categorias no modal. */
export const SHORTCUT_CATEGORY_ORDER = ['general', 'view', 'panels', 'editing', 'gizmo'];

/** Chave i18n do rótulo de cada categoria (fallback embutido no modal). */
export const SHORTCUT_CATEGORY_LABEL_KEY = {
    general: 'shortcuts.cat.general',
    view: 'shortcuts.cat.view',
    panels: 'shortcuts.cat.panels',
    editing: 'shortcuts.cat.editing',
    gizmo: 'shortcuts.cat.gizmo',
};

/** Seed canônico — espelha os handlers em main/global-events.ts + editNavigation + commandPalette. */
const SEED: any[] = [
    // ---- Geral (sempre disponível) ----
    { id: 'command-palette', keys: [['Ctrl', 'K'], ['Ctrl', 'Shift', 'P']], description: 'Abrir a paleta de comandos', category: 'general' },
    { id: 'undo', keys: [['Ctrl', 'Z']], description: 'Desfazer a última ação', category: 'general' },
    { id: 'redo', keys: [['Ctrl', 'Y'], ['Ctrl', 'Shift', 'Z']], description: 'Refazer a ação desfeita', category: 'general' },
    { id: 'copy-element', keys: [['Ctrl', 'C']], description: 'Copiar o elemento selecionado', category: 'general' },
    { id: 'paste-element', keys: [['Ctrl', 'V']], description: 'Colar o elemento copiado', category: 'general' },
    { id: 'snapshot', keys: [['Ctrl', 'Shift', 'S']], description: 'Capturar um snapshot da cena', category: 'general' },
    { id: 'focus-mode', keys: [['Ctrl', 'Shift', 'F']], description: 'Alternar o modo foco', category: 'general' },
    { id: 'zen-mode', keys: [['F11']], description: 'Alternar o modo zen (tela cheia)', category: 'general' },
    { id: 'escape', keys: [['Esc']], description: 'Fechar tour/demo/diálogo ou sair da edição', category: 'general' },

    // ---- Visualização e seleção (com um elemento selecionado, fora de edição) ----
    { id: 'zoom-element', keys: [['F']], description: 'Enquadrar a câmera no elemento selecionado', category: 'view' },
    { id: 'hide-element', keys: [['H']], description: 'Ocultar o elemento selecionado', category: 'view' },
    { id: 'show-all', keys: [['Shift', 'H']], description: 'Mostrar todos os elementos ocultos', category: 'view' },
    { id: 'delete-element', keys: [['Delete'], ['Backspace']], description: 'Remover o elemento selecionado', category: 'view' },

    // ---- Painéis e ferramentas ----
    { id: 'toggle-inspector', keys: [['Ctrl', 'J']], description: 'Abrir/fechar o painel inspector', category: 'panels' },
    { id: 'toggle-constellation', keys: [['C']], description: 'Alternar o HUD da constelação (foco nele)', category: 'panels' },

    // ---- Edição de forma (com um elemento em edição) ----
    { id: 'edit-prev', keys: [['[']], description: 'Ir para o elemento editável anterior', category: 'editing', context: 'em edição' },
    { id: 'edit-next', keys: [[']']], description: 'Ir para o próximo elemento editável', category: 'editing', context: 'em edição' },
    { id: 'opacity-focus', keys: [['1']], description: 'Opacidade: destacar o elemento em edição', category: 'editing', context: 'em edição' },
    { id: 'opacity-dim', keys: [['2']], description: 'Opacidade: esmaecer os demais', category: 'editing', context: 'em edição' },
    { id: 'opacity-full', keys: [['3']], description: 'Opacidade: cheia (todos visíveis)', category: 'editing', context: 'em edição' },
    { id: 'nudge-x', keys: [['←'], ['→']], description: 'Mover a seleção no eixo X (leste/oeste)', category: 'editing', context: 'em edição' },
    { id: 'nudge-z', keys: [['↑'], ['↓']], description: 'Mover a seleção no eixo Z (norte/sul)', category: 'editing', context: 'em edição' },
    { id: 'nudge-y', keys: [['Shift', '↑'], ['Shift', '↓']], description: 'Mover a seleção no eixo Y (altura)', category: 'editing', context: 'em edição' },
    { id: 'nudge-coarse', keys: [['Alt', '↑↓←→']], description: 'Passo grosso (×10) ao mover pela seta', category: 'editing', context: 'em edição' },
    { id: 'toggle-draw', keys: [['D']], description: 'Alternar o modo desenho (adicionar vértices)', category: 'editing', context: 'em edição (forma)' },
    { id: 'reset-shape', keys: [['R']], description: 'Resetar a forma para o estado inicial', category: 'editing', context: 'em edição (forma)' },
    { id: 'toggle-snap', keys: [['S']], description: 'Alternar o snap (alinhamento)', category: 'editing', context: 'em edição' },
    { id: 'toggle-gizmo-shape', keys: [['G']], description: 'Alternar entre gizmo e edição de forma', category: 'editing', context: 'em edição' },
    { id: 'finish-edit', keys: [['Enter']], description: 'Concluir a edição / finalizar o desenho', category: 'editing', context: 'em edição' },
    { id: 'delete-vertex', keys: [['Delete'], ['Backspace']], description: 'Excluir o vértice selecionado (ou o elemento)', category: 'editing', context: 'em edição' },

    // ---- Transformar (modo gizmo) ----
    { id: 'gizmo-move', keys: [['W']], description: 'Mover (translação)', category: 'gizmo', context: 'no gizmo' },
    { id: 'gizmo-rotate', keys: [['E']], description: 'Rotacionar', category: 'gizmo', context: 'no gizmo' },
    { id: 'gizmo-scale', keys: [['R']], description: 'Escalar', category: 'gizmo', context: 'no gizmo' },
    { id: 'gizmo-space', keys: [['X']], description: 'Alternar o espaço mundo/local', category: 'gizmo', context: 'no gizmo' },
];

/** @type {Map<string, ShortcutEntry>} Registry vivo (idempotente por id). */
const _registry = new Map<string, any>();

/**
 * Valida e normaliza uma entrada; lança em entrada inválida (falha cedo, ruidoso).
 * @param {any} e
 * @returns {ShortcutEntry}
 */
function _normalize(e: any) {
    if (!e || typeof e !== 'object') throw new Error('[shortcuts] entrada inválida');
    const id = typeof e.id === 'string' ? e.id.trim() : '';
    if (!id) throw new Error('[shortcuts] id obrigatório');
    const keys = Array.isArray(e.keys) ? e.keys.filter((k: any) => Array.isArray(k) && k.length) : [];
    if (!keys.length) throw new Error(`[shortcuts] ${id}: keys obrigatórias`);
    const category = SHORTCUT_CATEGORY_LABEL_KEY[e.category as keyof typeof SHORTCUT_CATEGORY_LABEL_KEY]
        ? e.category
        : 'general';
    return {
        id,
        keys,
        description: typeof e.description === 'string' ? e.description : id,
        category,
        descriptionKey: typeof e.descriptionKey === 'string' ? e.descriptionKey : undefined,
        context: typeof e.context === 'string' ? e.context : undefined,
    };
}

/**
 * Registra (ou atualiza, por id) um atalho. Outros módulos podem chamar isto para
 * que seu atalho apareça no modal "Atalhos" sem editar este arquivo.
 * @param {ShortcutEntry} entry
 * @returns {boolean} true se registrado
 */
export function registerShortcut(entry: any) {
    try {
        const norm = _normalize(entry);
        _registry.set(norm.id, norm);
        return true;
    } catch (err: any) {
        console.debug('[shortcuts:registerShortcut]', err?.message || err);
        return false;
    }
}

/** Semeia o registry com os atalhos canônicos (idempotente). */
function _ensureSeeded() {
    if (_registry.size > 0) return;
    for (const e of SEED) registerShortcut(e);
}

/**
 * Todos os atalhos registrados (ordenados por categoria canônica e depois por id).
 * @returns {ShortcutEntry[]}
 */
export function getShortcuts() {
    _ensureSeeded();
    const order = (c: string) => {
        const i = SHORTCUT_CATEGORY_ORDER.indexOf(c);
        return i < 0 ? SHORTCUT_CATEGORY_ORDER.length : i;
    };
    return Array.from(_registry.values()).sort((a: any, b: any) =>
        order(a.category) - order(b.category) || a.id.localeCompare(b.id),
    );
}

/**
 * Atalhos agrupados por categoria, na ordem canônica (categorias vazias omitidas).
 * @returns {Array<{ category: ShortcutCategory, items: ShortcutEntry[] }>}
 */
export function getShortcutsByCategory() {
    const all = getShortcuts();
    return SHORTCUT_CATEGORY_ORDER
        .map((category) => ({ category: category as any, items: all.filter((s: any) => s.category === category) }))
        .filter((g) => g.items.length > 0);
}
