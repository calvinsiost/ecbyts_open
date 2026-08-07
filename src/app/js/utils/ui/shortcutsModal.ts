// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   SHORTCUTS MODAL — referência consultável de todos os atalhos de
   teclado. Aberto via Mais → Ajuda → Atalhos.

   Renderiza DIRETAMENTE do registry (config/shortcuts.ts) — fonte
   única de verdade. Qualquer atalho novo lá aparece aqui sem mudar
   este arquivo. Agrupado por categoria + busca por texto/tecla.
   Usa .ecbt-* design tokens + namespace .shortcuts-*.
   ================================================================ */
import { getShortcutsByCategory, SHORTCUT_CATEGORY_LABEL_KEY } from '../../config/shortcuts.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';

const MODAL_ID = 'shortcuts-modal';
let _search = '';

/** t() retorna a própria chave quando ausente → cai no fallback legível. */
function tt(key: string, fallback: string) {
    const v = t(key);
    return v && v !== key ? v : fallback;
}

const CATEGORY_FALLBACK: Record<string, string> = {
    general: 'Geral',
    view: 'Visualização e seleção',
    panels: 'Painéis e ferramentas',
    editing: 'Edição de forma',
    gizmo: 'Transformar (gizmo)',
};

/** Renderiza as teclas de um atalho como <kbd> (alternativas separadas por "/"). */
function _keysHtml(keys: string[][]) {
    return keys
        .map((combo) => combo.map((k) => `<kbd class="shortcuts-key">${escapeHtml(k)}</kbd>`).join('<span class="shortcuts-plus">+</span>'))
        .join('<span class="shortcuts-or">/</span>');
}

function _matches(s: any, q: string) {
    if (!q) return true;
    const hay = (s.description + ' ' + (s.context || '') + ' ' + s.keys.flat().join(' ')).toLowerCase();
    return hay.includes(q);
}

function _bodyHtml() {
    const q = _search.trim().toLowerCase();
    const groups = getShortcutsByCategory();
    let total = 0;
    const sections = groups
        .map((g: any) => {
            const items = g.items.filter((s: any) => _matches(s, q));
            if (!items.length) return '';
            total += items.length;
            const label = tt(
                SHORTCUT_CATEGORY_LABEL_KEY[g.category as keyof typeof SHORTCUT_CATEGORY_LABEL_KEY] || '',
                CATEGORY_FALLBACK[g.category] || g.category,
            );
            const rows = items
                .map((s: any) => {
                    const desc = s.descriptionKey ? tt(s.descriptionKey, s.description) : s.description;
                    const ctx = s.context ? `<span class="shortcuts-ctx">${escapeHtml(s.context)}</span>` : '';
                    return `
                    <div class="shortcuts-row">
                        <div class="shortcuts-keys">${_keysHtml(s.keys)}</div>
                        <div class="shortcuts-desc">${escapeHtml(desc)}${ctx}</div>
                    </div>`;
                })
                .join('');
            return `<section class="shortcuts-section"><h3 class="shortcuts-cat">${escapeHtml(label)}</h3>${rows}</section>`;
        })
        .join('');
    if (!total) {
        return `<div class="shortcuts-empty">${escapeHtml(tt('shortcuts.empty', 'Nenhum atalho corresponde à busca.'))}</div>`;
    }
    return sections;
}

function _renderBody() {
    const body = document.getElementById('shortcuts-modal-list');
    if (body) body.innerHTML = _bodyHtml();
}

export function openShortcutsModal() {
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'ecbt-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = `
            <div class="ecbt-dialog ecbt-dialog--lg shortcuts-dialog">
                <div class="shortcuts-header">
                    <h2>${escapeHtml(tt('shortcuts.title', 'Atalhos de teclado'))}</h2>
                    <button class="shortcuts-close ecbt-btn" type="button" aria-label="Close">&times;</button>
                </div>
                <p class="shortcuts-hint">${escapeHtml(tt('shortcuts.hint', 'Todos os atalhos do sistema. A lista é preenchida automaticamente — novos atalhos aparecem aqui.'))}</p>
                <input type="search" class="shortcuts-search" id="shortcuts-modal-search"
                    placeholder="${escapeHtml(tt('shortcuts.search', 'Buscar atalho ou tecla...'))}"
                    aria-label="${escapeHtml(tt('shortcuts.search', 'Buscar atalho ou tecla...'))}">
                <div class="shortcuts-list" id="shortcuts-modal-list"></div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.shortcuts-close')?.addEventListener('click', closeShortcutsModal);
        modal.addEventListener('click', (e: any) => {
            if (e.target === modal) closeShortcutsModal();
        });
        const searchEl = modal.querySelector('#shortcuts-modal-search') as HTMLInputElement | null;
        searchEl?.addEventListener('input', () => {
            _search = searchEl.value || '';
            _renderBody();
        });
        // Esc fecha (apenas quando este modal está aberto).
        modal.addEventListener('keydown', (e: any) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                closeShortcutsModal();
            }
        });
    }
    (modal as HTMLElement).style.display = 'flex';
    _renderBody();
    (document.getElementById('shortcuts-modal-search') as HTMLInputElement | null)?.focus();
}

export function closeShortcutsModal() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) (modal as HTMLElement).style.display = 'none';
}
