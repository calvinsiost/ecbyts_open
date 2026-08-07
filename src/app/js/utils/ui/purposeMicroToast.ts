// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.2.0
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   PURPOSE MICRO-TOAST — Feedback instantaneo (Camada 1)
   Toast contextual discreto para acoes que afetam o EIS.

   Diferente do toast padrao (3s, canto inferior direito, max 3):
   - Menor e mais efemero (2s)
   - Max 1 visivel por vez (substitui anterior)
   - Sem score numerico — apenas eixo + direcao + contexto
   - Fade-out suave (300ms)
   - Cor por eixo EIS (gradiente verde/amarelo/vermelho)
   - Posicionado acima do toast container padrao

   Nao usa emojis — usa HTML entities (&#9650; = ▲, &#9660; = ▼).
   ================================================================ */
import { t } from '../i18n/translations.js';
// ================================================================
// CONSTANTS
// ================================================================
const MICRO_TOAST_DURATION_MS = 2000;
const MICRO_TOAST_FADEOUT_MS = 300;
const CONTAINER_ID = 'purpose-micro-toast-container';
// Cores por eixo - mais sutis que o EIS dashboard, tom profissional
const AXIS_COLORS = {
    T: '#4a9eff', // Azul — transparencia/proveniencia
    A: '#22c55e', // Verde — acuracia/saude do sensor
    Cp: '#8b5cf6', // Roxo — completude/cobertura
    Ty: '#f59e0b', // Ambar — tempestividade/latencia
    Cs: '#06b6d4', // Ciano — consistencia/unidades
    Cm: '#ec4899', // Rosa — comparabilidade/taxonomia
};
// ================================================================
// MODULE STATE
// ================================================================
/** @type {HTMLElement|null} */
let _container: any = null;
/** @type {number|null} Timer do fade-out */
let _fadeTimer: any = null;
/** @type {number|null} Timer da remocao */
let _removeTimer: any = null;
// ================================================================
// DOM SETUP
// ================================================================
/**
 * Ensure micro-toast container exists in the DOM.
 * Garante que o container existe - cria se necessario.
 * @returns {HTMLElement}
 */
function _ensureContainer() {
    if (_container && document.body.contains(_container))
        return _container;
    _container = document.getElementById(CONTAINER_ID);
    if (_container)
        return _container;
    _container = document.createElement('div');
    _container.id = CONTAINER_ID;
    _container.className = 'purpose-micro-toast-container';
    _container.setAttribute('aria-live', 'polite');
    _container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(_container);
    return _container;
}
// ================================================================
// PUBLIC API
// ================================================================
/**
 * Show a purpose micro-toast for an EIS axis impact.
 * Exibe micro-toast contextual para impacto em eixo EIS.
 *
 * @param {string} axis - Eixo afetado ('T'|'A'|'Cp'|'Ty'|'Cs'|'Cm')
 * @param {string} dir - Direcao ('+' ou '-')
 * @param {string} i18nKey - Chave i18n para a mensagem
 * @param {Object} [_meta] - Metadados opcionais (ex: { count: 5 })
 */
export function showPurposeMicroToast(axis: any, dir: any, i18nKey: any, _meta: any = {}) {
    const container = _ensureContainer();
    // Limpa toast anterior (max 1 por vez)
    if (_fadeTimer)
        clearTimeout(_fadeTimer);
    if (_removeTimer)
        clearTimeout(_removeTimer);
    container.innerHTML = '';
    // Resolve texto
    const nameMap = (_axisNameMap) as Record<string,string>;
    const colorMap = (AXIS_COLORS) as Record<string,string>;
    const axisName = t(`eis${nameMap[axis]}`) || nameMap[axis] || axis;
    const message = t(i18nKey) || _fallbackMessage(axis, dir);
    const arrow = dir === '+' ? '&#9650;' : '&#9660;';
    const color = colorMap[axis] || '#888';
    // Cria elemento
    const toast = document.createElement('div');
    toast.className = 'purpose-micro-toast';
    toast.style.borderLeftColor = color;
    toast.innerHTML = `
        <span class="purpose-micro-toast-arrow" style="color: ${color}">${arrow}</span>
        <span class="purpose-micro-toast-axis">${axisName}</span>
        <span class="purpose-micro-toast-sep">&#8212;</span>
        <span class="purpose-micro-toast-msg">${message}</span>
    `;
    container.appendChild(toast);
    // Force reflow para animar entrada
    void toast.offsetHeight;
    toast.classList.add('purpose-micro-toast-visible');
    // Fade-out apos duracao
    _fadeTimer = setTimeout(() => {
        toast.classList.remove('purpose-micro-toast-visible');
        toast.classList.add('purpose-micro-toast-fade');
        _removeTimer = setTimeout(() => {
            if (container.contains(toast))
                container.removeChild(toast);
        }, MICRO_TOAST_FADEOUT_MS);
    }, MICRO_TOAST_DURATION_MS);
}
// ================================================================
// HELPERS
// ================================================================
/** Mapeamento eixo → nome legivel para fallback */
const _axisNameMap = {
    T: 'Transparency',
    A: 'Accuracy',
    Cp: 'Completeness',
    Ty: 'Timeliness',
    Cs: 'Consistency',
    Cm: 'Comparability',
};
/**
 * Fallback message when i18n key is missing.
 * Mensagem padrao quando chave i18n nao encontrada.
 * @param {string} axis
 * @param {string} dir
 * @returns {string}
 */
function _fallbackMessage(axis: any, dir: any) {
    const verb = dir === '+' ? 'improved' : 'decreased';
    const nameMap = (_axisNameMap) as Record<string,string>;
    return `${nameMap[axis] || axis} ${verb}`;
}
