// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// backgroundLoadingBadge — wire DOM do badge de loading DISCRETO (não-bloqueante)
// no statusbar (Calvin 2026-06-19: "incluir loading onde precisar de loading").
//
// Para TRABALHO EM SEGUNDO PLANO com a UI já usável (geração do modelo no boot
// instantâneo SPEC INSTANT-SHELL-001, fetch de terreno, etc). NÃO é o showLoading()
// bloqueante de tela cheia — o usuário continua navegando; só vê um chip discreto
// "Gerando exemplo…" no statusbar (com spinner) que some quando a tarefa acaba.
//
// API:
//   startBgLoading('model', 'Gerando exemplo…')   → mostra/atualiza o chip
//   stopBgLoading('model')                         → remove a tarefa; some se vazio
//   isBgLoading(id?)                               → consulta
//
// Lógica de estado é pura/testada em _backgroundLoadingBadgePure.ts.
import { addBgTask, removeBgTask, deriveBadgeVM, type BgTask } from './_backgroundLoadingBadgePure.js';

const BADGE_ID = 'bg-loading-badge';
let _tasks: readonly BgTask[] = [];
// Callbacks de clique por id — fora do estado puro (DOM/comportamento, não
// dado). Usado por tarefas que reabrem uma UI ao clicar no chip (ex.:
// RF-6 IMPORT-UX-001: reabrir o modal de ingestão minimizado).
const _onClickById = new Map<string, () => void>();

/** Garante o elemento do badge no statusbar (cria sob demanda se faltar). */
function _ensureBadgeEl(): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    let el = document.getElementById(BADGE_ID);
    if (el) return el;
    const statusbar = document.getElementById('statusbar');
    // âncora preferida: ao lado do geo-status-beacon; senão, fim do statusbar.
    const anchor = document.getElementById('geo-status-beacon');
    el = document.createElement('span');
    el.id = BADGE_ID;
    el.className = 'status-item bg-loading-badge';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
    else if (statusbar) statusbar.appendChild(el);
    return el;
}

/** Re-renderiza o chip a partir do estado atual (idempotente). */
function _render(): void {
    const el = _ensureBadgeEl();
    if (!el) return;
    const vm = deriveBadgeVM(_tasks);
    if (!vm.visible) {
        el.hidden = true;
        el.textContent = '';
        return;
    }
    el.hidden = false;
    // spinner (refresh-cw já existe em icons) + texto. Sem innerHTML de input do
    // usuário — o label vem de chamadas internas (i18n), mas usamos textContent
    // no nó de texto por segurança.
    el.textContent = '';
    const spin = document.createElement('span');
    spin.className = 'bg-loading-spinner';
    spin.setAttribute('aria-hidden', 'true');
    const txt = document.createElement('span');
    txt.className = 'bg-loading-text';
    txt.textContent = vm.text;
    el.appendChild(spin);
    el.appendChild(txt);
    // Clicável só se a tarefa MAIS RECENTE (a exibida no chip) tiver onClick —
    // com múltiplas tarefas o chip sempre representa a primeira da lista.
    const firstTask = _tasks[0];
    const onClick = firstTask ? _onClickById.get(firstTask.id) : undefined;
    el.classList.toggle('bg-loading-badge--clickable', !!onClick);
    el.tabIndex = onClick ? 0 : -1;
    el.onclick = onClick || null;
}

/**
 * Inicia/atualiza uma tarefa de loading em background (mostra o chip discreto).
 * @param {string} id     identificador único (ex.: 'boot-model', 'terrain')
 * @param {string} label  texto curto p/ humano (já traduzido)
 * @param {() => void} [onClick]  opcional — clicar no chip chama isto (ex.:
 *   reabrir um modal minimizado). Sem onClick o chip fica só informativo,
 *   como sempre foi.
 */
export function startBgLoading(id: string, label: string, onClick?: () => void): void {
    _tasks = addBgTask(_tasks, { id, label });
    if (onClick) _onClickById.set(id, onClick);
    else _onClickById.delete(id);
    _render();
}

/**
 * Encerra uma tarefa de loading em background; o chip some se não houver mais.
 * @param {string} id
 */
export function stopBgLoading(id: string): void {
    _tasks = removeBgTask(_tasks, id);
    _onClickById.delete(id);
    _render();
}

/**
 * Consulta se há loading de background ativo (todos, ou um id específico).
 * @param {string} [id?]
 * @returns {boolean}
 */
export function isBgLoading(id?: string): boolean {
    if (id == null) return _tasks.length > 0;
    return _tasks.some((t) => t.id === id);
}

/** Limpa tudo (ex.: reset/dispose). */
export function clearBgLoading(): void {
    _tasks = [];
    _render();
}
