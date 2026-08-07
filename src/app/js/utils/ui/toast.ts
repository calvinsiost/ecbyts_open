// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   SISTEMA DE NOTIFICACOES (TOAST)
   ================================================================

   Este modulo gerencia as notificacoes temporarias.

   O QUE E UM TOAST?
   Uma pequena mensagem que aparece temporariamente na tela.
   Chamada "toast" por parecer uma torrada saindo da torradeira.

   TIPOS DE TOAST:
   - success (verde): Acao bem sucedida
   - error (vermelho): Algo deu errado
   - warning (amarelo): Atencao necessaria
   - info (azul): Informacao geral

   COMPORTAMENTO:
   - Aparece no canto inferior direito
   - Desaparece automaticamente apos alguns segundos
   - Pode ser fechado manualmente clicando no X
   - Maximo de 3 toasts visiveis simultaneamente

   ================================================================ */

import { getIcon } from './icons.js';
import { escapeHtml } from '../helpers/html.js';
import { recordMessage } from '../helpers/messageLog.js';
// ----------------------------------------------------------------
// CONFIGURACAO
// ----------------------------------------------------------------

/**
 * Configuracoes do sistema de toast.
 */
const TOAST_CONFIG = {
    /**
     * Duracao padrao em milissegundos (fallback quando tipo nao tem TTL especifico).
     * 3000ms = 3 segundos
     */
    duration: 3000,

    /**
     * Maximo de toasts visiveis simultaneamente.
     */
    maxVisible: 3,

    /**
     * ID do container onde toasts sao adicionados.
     */
    containerId: 'toast-container',

    /**
     * Icones para cada tipo de toast.
     */
    icons: {
        success: 'check',
        error: 'x',
        warning: 'alert-triangle',
        info: 'info',
        // 'refresh-cw' eh icone existente (icons.js linha 89). CSS classe
        // `.toast.loading .toast-icon` pode aplicar @keyframes spin para
        // animar como spinner.
        loading: 'refresh-cw',
    },
};

/**
 * TTL (time-to-live) padrao por tipo de toast, em milissegundos.
 *
 * Calibrado para que:
 *  - success: feedback rapido apos acao bem-sucedida (3s)
 *  - info: progresso/loading curtos devem desaparecer sozinhos (4s) — evita "toast
 *    pendurado" como o pain report 2026-05-14 (ghgRmspDemoLoader)
 *  - warning: visivel o suficiente para o usuario ler sem stress (5s)
 *  - error: deve ficar mais tempo para usuario copiar codigo de erro (8s)
 *
 * SPEC: docs/specs/features/SPEC_TOAST_AUTO_DISMISS_AUDIT.md §4
 */
export const TTL_BY_TYPE = Object.freeze({
    success: 3000,
    info: 4000,
    warning: 5000,
    error: 8000,
});

// ----------------------------------------------------------------
// FUNCAO PRINCIPAL
// ----------------------------------------------------------------

/**
 * Exibe uma notificacao toast.
 *
 * @param {string} message - Mensagem a exibir
 * @param {string} type - Tipo: 'success', 'error', 'warning', 'info'
 * @param {number} [duration] - Duracao em ms (opcional, padrao: 3000; 0 = persistente)
 * @param {{ action?: { label: string, onClick: () => void } }} [options] - Opcoes opcionais
 *   options.action - botao de acao (CTA) dentro do toast; ao clicar fecha o toast e executa onClick
 *
 * EXEMPLO:
 *   showToast('Arquivo salvo!', 'success');
 *   showToast('Erro ao conectar', 'error');
 *   showToast('Verificar configuracao', 'warning');
 *   showToast('Falha ao enviar. [ECB-FILE-001]', 'error', 0, {
 *     action: { label: 'Reportar', onClick: () => openReportBugModal() }
 *   });
 */
export function showToast(message: any, type = 'info', duration?: any, options = {}) {
    // Obtem container
    const container = document.getElementById(TOAST_CONFIG.containerId);
    if (!container) {
        console.warn('Container de toast nao encontrado');
        return null;
    }

    // Garante aria-live para acessibilidade (uma vez por sessao)
    _ensureAriaLive(container);

    // TTL per-type: se duration nao foi passado explicitamente, escolhe pelo tipo
    const ttlMap = /** @type {Record<string, number>} */ (TTL_BY_TYPE);
    const effectiveDuration = typeof duration === 'number' ? duration : (ttlMap[(type as keyof typeof ttlMap)] ?? TOAST_CONFIG.duration);

    // ANTI-FLOOD (Calvin 2026-06-11 "toasts pulando sem parar"): mensagem
    // idêntica (texto+tipo) ainda visível NÃO empilha — incrementa contador
    // "×N" no toast existente e reinicia o TTL. Medido no probe: 8 pares
    // "Interpolating..."/"complete!" + 6× "Fetching elevation data..." em
    // segundos — metralhadora de toasts de operações em lote/background.
    const dup = _findVisibleDuplicate(container, message, type);
    if (dup) {
        _bumpDuplicateCount(dup);
        if (effectiveDuration > 0) {
            const stash = /** @type {any} */ (dup as any);
            if (stash._ecbtTimerId) clearTimeout(stash._ecbtTimerId);
            stash._ecbtTimerId = setTimeout(() => removeToast(dup), effectiveDuration);
        }
        return dup;
    }

    // Registra no message log (Mais → Logs) para o usuário inspecionar depois.
    recordMessage(type, message, 'toast');

    // Limita numero de toasts visiveis (remove os mais antigos)
    while (container.children.length >= TOAST_CONFIG.maxVisible) {
        const oldest = container.firstChild;
        if (oldest) {
            oldest.remove();
        }
    }

    // Cria elemento toast
    const toast = createToastElement(message, type, options);

    // Adiciona ao container
    container.appendChild(toast);

    // Remove automaticamente apos duracao (0 = persistente, usuario fecha manualmente)
    if (effectiveDuration > 0) {
        const timerId = setTimeout(() => {
            removeToast(toast);
        }, effectiveDuration);
        // Stash timer para que showLoadingToast / handle.success possa cancela-lo
        // antes de programar um novo TTL ao trocar de tipo.
        /** @type {any} */ ((toast) as any)._ecbtTimerId = timerId;
    }

    // Mirror toast to AI chat panel as a tip (se proactive AI ativa)
    _mirrorToChat(message, type);

    return toast;
}

// ----------------------------------------------------------------
// FUNCOES AUXILIARES
// ----------------------------------------------------------------

/**
 * Procura toast visível com a MESMA mensagem e tipo (anti-flood).
 * @param {HTMLElement} container
 * @param {string} message
 * @param {string} type
 * @returns {HTMLElement|null}
 */
function _findVisibleDuplicate(container: any, message: any, type: any) {
    const msg = String(message);
    for (const child of container.children) {
        if (!child.classList?.contains('toast') || !child.classList.contains(type)) continue;
        const base = /** @type {any} */ (child as any)._ecbtBaseMessage ?? child.querySelector('.toast-message')?.textContent;
        if (base === msg) return child;
    }
    return null;
}

/**
 * Incrementa o contador "×N" de um toast duplicado.
 * @param {HTMLElement} toast
 */
function _bumpDuplicateCount(toast: any) {
    const stash = /** @type {any} */ (toast);
    if (!stash._ecbtBaseMessage) {
        stash._ecbtBaseMessage = toast.querySelector('.toast-message')?.textContent || '';
    }
    stash._ecbtDupCount = (stash._ecbtDupCount || 1) + 1;
    const msgEl = toast.querySelector('.toast-message');
    if (msgEl) msgEl.textContent = `${stash._ecbtBaseMessage} (×${stash._ecbtDupCount})`;
}

/**
 * Cria elemento HTML do toast.
 *
 * @param {string} message - Mensagem
 * @param {string} type - Tipo
 * @param {{ action?: { label: string, onClick: () => void } }} [options] - Opcoes
 * @returns {HTMLElement} - Elemento toast
 */
function createToastElement(message: any, type: any, options = {}) {
    // Cria div principal
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    // Acessibilidade: erros usam role="alert" (assertivo, interrompe screen reader)
    if (type === 'error') toast.setAttribute('role', 'alert');

    // Define icone baseado no tipo
    const iconMap = /** @type {Record<string, string>} */ (TOAST_CONFIG.icons);
    const iconName = iconMap[(type as keyof typeof iconMap)] || iconMap.info;

    // Monta HTML interno (action button opcional entre mensagem e close)
    toast.innerHTML = `
        <span class="toast-icon">${getIcon(iconName, { size: '14px' })}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
        ${(options as any).action ? `<button class="toast-action" type="button">${escapeHtml((options as any).action.label)}</button>` : ''}
        <button class="toast-close" type="button" aria-label="Fechar">${getIcon('x', { size: '12px' })}</button>
    `;

    // Bind do botao de acao (fecha toast e executa callback)
    if ((options as any).action) {
        const actionBtn = toast.querySelector('.toast-action');
        const action = (options as any).action;
        if (actionBtn) {
            actionBtn.addEventListener('click', () => {
                removeToast(toast);
                action.onClick();
            });
        }
    }

    // Adiciona evento de fechar
    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            removeToast(toast);
        });
    }

    return toast;
}

/**
 * Remove um toast com animacao.
 *
 * @param {HTMLElement} toast - Elemento a remover
 */
function removeToast(toast: any) {
    if (!toast || !toast.parentNode) return;

    // Adiciona classe de saida para animacao
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';

    // Remove do DOM apos animacao
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300); // Duracao da animacao CSS
}
// ----------------------------------------------------------------
// FUNCOES DE CONVENIENCIA
// ----------------------------------------------------------------

/**
 * Exibe toast de sucesso.
 *
 * @param {string} message - Mensagem
 */
export function showSuccess(message: any) {
    (showToast as any)(message, 'success');
}

/**
 * Exibe toast de erro.
 *
 * @param {string} message - Mensagem
 */
export function showError(message: any) {
    (showToast as any)(message, 'error');
}

/**
 * Exibe toast de aviso.
 *
 * @param {string} message - Mensagem
 */
export function showWarning(message: any) {
    (showToast as any)(message, 'warning');
}

/**
 * Exibe toast informativo.
 *
 * @param {string} message - Mensagem
 */
export function showInfo(message: any) {
    (showToast as any)(message, 'info');
}

// ----------------------------------------------------------------
// FUNCOES DE GERENCIAMENTO
// ----------------------------------------------------------------

/**
 * Remove todos os toasts ativos.
 * Util para limpar antes de uma operacao importante.
 */
export function clearAllToasts() {
    const container = document.getElementById(TOAST_CONFIG.containerId);
    if (container) {
        container.innerHTML = '';
    }
}

/**
 * Retorna quantidade de toasts ativos.
 *
 * @returns {number} - Numero de toasts visiveis
 */
export function getActiveToastCount() {
    const container = document.getElementById(TOAST_CONFIG.containerId);
    return container ? container.children.length : 0;
}

// ----------------------------------------------------------------
// LOADING TOAST HANDLE — SPEC_TOAST_AUTO_DISMISS_AUDIT (2026-05-14)
// ----------------------------------------------------------------

/**
 * @typedef {Object} ToastHandle
 * @property {HTMLElement|null} element - elemento DOM do toast (null se container ausente)
 * @property {() => void} dismiss - remove o toast imediatamente
 * @property {(msg?: string) => void} success - troca para tipo 'success' + reinicia TTL
 * @property {(msg?: string) => void} error - troca para tipo 'error' + reinicia TTL
 * @property {(msg: string) => void} updateMessage - troca apenas o texto, mantem tipo
 */

/**
 * Exibe um toast de "loading" persistente que retorna um handle controlavel.
 *
 * Resolve o anti-pattern fire-and-forget onde `showToast(msg, 'info')` ficava
 * pendurado na tela mesmo depois do load terminar (pain report Calvin 2026-05-14
 * com ghgRmspDemoLoader). O caller agora invoca `handle.success(...)` ou
 * `handle.error(...)` no final, que reaproveita o mesmo slot, troca classe CSS
 * e icone, e agenda o TTL do tipo final.
 *
 * @param {string} message - Mensagem inicial (ex: "Carregando dados...")
 * @param {{ action?: { label: string, onClick: () => void } }} [options] - Opcoes adicionais
 * @returns {ToastHandle} - Handle para controlar o toast
 *
 * @example
 *   const handle = showLoadingToast('Carregando RMSP...');
 *   try {
 *     const result = await heavyLoad();
 *     handle.success(`Carregado ${result.count} municipios`);
 *   } catch (err) {
 *     handle.error(err.message);
 *   }
 */
export function showLoadingToast(message: any, options = {}) {
    // duration=0 (persistente) — somente o handle remove
    const toast = showToast(message, 'loading', 0, options);

    return (
        /** @type {ToastHandle} */ {
            element: toast,
            dismiss: () => {
                if (toast) removeToast(toast);
            },
            success: (msg: any) => _transitionToast(toast, 'success', msg),
            error: (msg: any) => _transitionToast(toast, 'error', msg),
            updateMessage: (msg: any) => {
                if (!toast) return;
                const msgEl = toast.querySelector('.toast-message');
                if (msgEl) msgEl.textContent = String(msg);
            },
        }
    );
}

/**
 * Transiciona um toast existente para outro tipo, trocando classe CSS, icone,
 * mensagem (opcional) e reiniciando o TTL com base no novo tipo.
 *
 * @param {HTMLElement|null} toast - Elemento toast (pode ser null se DOM nao disponivel)
 * @param {string} newType - Novo tipo ('success', 'error', 'warning', 'info')
 * @param {string} [newMessage] - Mensagem opcional (mantem a atual se ausente)
 */
function _transitionToast(toast: any, newType: any, newMessage: any) {
    if (!toast) return;

    // Cancela TTL anterior se existia (loading era persistente, mas defensivo)
    const stash = /** @type {any} */ (toast);
    if (stash._ecbtTimerId) {
        clearTimeout(stash._ecbtTimerId);
        stash._ecbtTimerId = null;
    }

    // Troca classe CSS — remove qualquer tipo conhecido, adiciona o novo
    toast.classList.remove('loading', 'info', 'success', 'error', 'warning');
    toast.classList.add(newType);

    // Atualiza role para acessibilidade (error = assertive)
    if (newType === 'error') {
        toast.setAttribute('role', 'alert');
    } else {
        toast.removeAttribute('role');
    }

    // Troca icone
    const iconMap = /** @type {Record<string, string>} */ (TOAST_CONFIG.icons);
    const iconName = iconMap[(newType as keyof typeof iconMap)] || iconMap.info;
    const iconEl = toast.querySelector('.toast-icon');
    if (iconEl) iconEl.innerHTML = getIcon(iconName, { size: '14px' });

    // Troca mensagem se fornecida
    if (typeof newMessage === 'string' && newMessage.length > 0) {
        const msgEl = toast.querySelector('.toast-message');
        if (msgEl) msgEl.textContent = newMessage;
        // Mirror final state to AI chat (mantem comportamento de showToast)
        _mirrorToChat(newMessage, newType);
    }

    // Agenda novo TTL baseado no tipo final
    const ttlMap = /** @type {Record<string, number>} */ (TTL_BY_TYPE);
    const ttl = ttlMap[(newType as keyof typeof ttlMap)] ?? TOAST_CONFIG.duration;
    if (ttl > 0) {
        stash._ecbtTimerId = setTimeout(() => removeToast(toast), ttl);
    }
}

/**
 * Garante atributos aria-live no container de toasts (uma vez por sessao).
 * Politeness 'polite' nao interrompe screen reader; erros individuais usam
 * `role="alert"` (assertivo) via createToastElement.
 *
 * @param {HTMLElement} container - Container de toasts
 */
function _ensureAriaLive(container: any) {
    if (container.hasAttribute('aria-live')) return;
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
}

// ----------------------------------------------------------------
// AI CHAT MIRROR - espelha toasts no painel do bot de IA
// ----------------------------------------------------------------

/** Mapa de tipo toast → severidade de tip */
const _TOAST_SEVERITY = { success: 'info', error: 'critical', warning: 'warning', info: 'info' };

/** Mapa de tipo toast → categoria de tip */
const _TOAST_CATEGORY = { success: 'OK', error: 'ERROR', warning: 'ALERT', info: 'SYSTEM' };

/**
 * Mirror a toast message into the AI chat panel as a proactive tip.
 * Se o chat esta fechado, acumula como pending (FAB pulsa 1x).
 * Ignora toasts internos de baixo valor (e.g. "Saved!").
 *
 * @param {string} message - Toast message text
 * @param {string} type - Toast type (success, error, warning, info)
 */
function _mirrorToChat(message: any, type: any) {
    // Filtrar toasts triviais que nao agregam valor no chat
    if (!message || message.length < 10) return;
    const trivial = /^(saved|salvo|ok|done|pronto|ready|copied|copiado)/i;
    if (trivial.test(message.trim())) return;

    // Respeitar filtro de categorias do usuario (localStorage)
    try {
        const stored = localStorage.getItem('ecbyts-llm-toast-categories') || '';
        if (stored) {
            const cats = JSON.parse(stored);
            if (cats[type] === false) return; // Categoria desabilitada
        } else {
            // Default: error+warning ON, success+info OFF
            if (type === 'success' || type === 'info') return;
        }
    } catch (e) {
        console.debug('[toast] proactiveTipFilter:', /** @type {any} */ ((e) as any)?.message || e);
        /* fallback: mostrar */
    }

    // Despachar como tip proativo via evento
    const cats = /** @type {Record<string, string>} */ (_TOAST_CATEGORY);
    const sevs = /** @type {Record<string, string>} */ (_TOAST_SEVERITY);
    window.dispatchEvent(
        new CustomEvent('ecbt:proactiveTip', {
            detail: {
                elementId: null,
                tips: [
                    {
                        category: cats[(type as keyof typeof cats)] || 'SYSTEM',
                        severity: sevs[(type as keyof typeof sevs)] || 'info',
                        message: message,
                        action: null,
                    },
                ],
            },
        }),
    );
}
