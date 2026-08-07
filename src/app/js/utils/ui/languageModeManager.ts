// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   MODO SIMPLES/TÉCNICO — runtime (FRIEND-SCORE-001 TD-11)
   Conceito trazido da Fundação ecbyts: a mesma tela fala "leigo" por
   padrão e "técnico" sob demanda + um glossário que explica o jargão
   em linguagem comum, alcançável de qualquer tela (resolve TD-11).

   - aplica a classe ecbt-lay/ecbt-tech em <html> (cedo, sem flash)
   - injeta um toggle discoverável na statusbar (CSP-safe: addEventListener)
   - injeta um botão "?" que abre o glossário leigo (popover)
   - decora elementos [data-lay-term] com tooltip leigo (hook de varredura)

   Sem inline on*= (CSP script-src-attr 'none'). Strings próprias pt/en/es
   (autocontido, não depende de translations.ts). Persistência via safeSetItem.
   ================================================================ */

import {
    type LayMode,
    DEFAULT_LAY_MODE,
    LAY_MODE_CLASS,
    LAY_MODE_STORAGE_KEY,
    LAY_MODE_EVENT,
    normalizeLayMode,
    toggleLayMode,
    normalizeLayLocale,
    getLayExplanation,
    LAY_GLOSSARY,
} from './_layModePure.js';
import { safeSetItem } from '../storage/storageMonitor.js';

const UI = {
    pt: { lay: 'Modo: Simples', tech: 'Modo: Técnico', help: 'Glossário em linguagem simples',
        title: 'Glossário — em linguagem simples',
        hint: 'Passe o mouse nos termos sublinhados para ver a explicação. Toque no modo para alternar Simples/Técnico.',
        toggleTitleLay: 'Mostrando explicações em linguagem comum. Clique para o modo técnico.',
        toggleTitleTech: 'Modo técnico (termos científicos). Clique para o modo simples.' },
    en: { lay: 'Mode: Simple', tech: 'Mode: Technical', help: 'Plain-language glossary',
        title: 'Glossary — in plain language',
        hint: 'Hover the underlined terms for the explanation. Tap the mode to switch Simple/Technical.',
        toggleTitleLay: 'Showing plain-language explanations. Click for technical mode.',
        toggleTitleTech: 'Technical mode (scientific terms). Click for simple mode.' },
    es: { lay: 'Modo: Simple', tech: 'Modo: Técnico', help: 'Glosario en lenguaje simple',
        title: 'Glosario — en lenguaje simple',
        hint: 'Pase el mouse sobre los términos subrayados para ver la explicación. Toque el modo para alternar.',
        toggleTitleLay: 'Mostrando explicaciones en lenguaje común. Clic para modo técnico.',
        toggleTitleTech: 'Modo técnico (términos científicos). Clic para modo simple.' },
};

function resolveLocale(): 'pt' | 'en' | 'es' {
    let raw = '';
    try {
        raw = (document.documentElement.getAttribute('lang')
            || localStorage.getItem('ecbyts-language')
            || (navigator && navigator.language)
            || 'pt') as string;
    } catch (e) { console.debug('[laymode:locale]', (e as any)?.message || e); }
    return normalizeLayLocale(raw);
}

function strings() { return UI[resolveLocale()]; }

export function getLayMode(): LayMode {
    try {
        return normalizeLayMode(localStorage.getItem(LAY_MODE_STORAGE_KEY) || DEFAULT_LAY_MODE);
    } catch (e) {
        console.debug('[laymode:getMode]', (e as any)?.message || e);
        return DEFAULT_LAY_MODE;
    }
}

/** Aplica a classe do modo em <html>. Idempotente, seguro fora do browser. */
export function applyLayModeClass(mode: LayMode): void {
    const el = typeof document !== 'undefined' && document.documentElement;
    if (!el) return;
    el.classList.remove(LAY_MODE_CLASS.lay, LAY_MODE_CLASS.tech);
    el.classList.add(LAY_MODE_CLASS[mode]);
}

export function setLayMode(mode: unknown): LayMode {
    const m = normalizeLayMode(mode);
    applyLayModeClass(m);
    try { safeSetItem(LAY_MODE_STORAGE_KEY, m); } catch (e) { console.debug('[laymode:persist]', (e as any)?.message || e); }
    syncToggleLabel(m);
    try {
        window.dispatchEvent(new CustomEvent(LAY_MODE_EVENT, { detail: { mode: m } }));
    } catch (e) { console.debug('[laymode:event]', (e as any)?.message || e); }
    return m;
}

let _toggleBtn: HTMLButtonElement | null = null;

function syncToggleLabel(mode: LayMode): void {
    if (!_toggleBtn) return;
    const s = strings();
    _toggleBtn.textContent = mode === 'lay' ? s.lay : s.tech;
    _toggleBtn.setAttribute('aria-pressed', String(mode === 'lay'));
    _toggleBtn.title = mode === 'lay' ? s.toggleTitleLay : s.toggleTitleTech;
}

function buildGlossaryPopover(): HTMLElement {
    const s = strings();
    const loc = resolveLocale();
    const pop = document.createElement('div');
    pop.className = 'ecbt-lay-glossary';
    pop.id = 'ecbt-lay-glossary';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', s.title);
    pop.hidden = true;

    const h = document.createElement('div');
    h.className = 'ecbt-lay-glossary-head';
    h.textContent = s.title;
    pop.appendChild(h);

    const hint = document.createElement('p');
    hint.className = 'ecbt-lay-glossary-hint';
    hint.textContent = s.hint;
    pop.appendChild(hint);

    const list = document.createElement('dl');
    list.className = 'ecbt-lay-glossary-list';
    for (const key of Object.keys(LAY_GLOSSARY)) {
        const entry = LAY_GLOSSARY[key];
        if (!entry) continue;
        const dt = document.createElement('dt');
        dt.textContent = entry.term;
        const dd = document.createElement('dd');
        dd.textContent = getLayExplanation(key, loc) || '';
        list.appendChild(dt);
        list.appendChild(dd);
    }
    pop.appendChild(list);
    return pop;
}

function injectControls(): void {
    const bar = document.getElementById('statusbar');
    if (!bar || document.getElementById('ecbt-laymode-toggle')) return;
    const host = bar.querySelector('.status-center') || bar;
    const s = strings();

    const wrap = document.createElement('span');
    wrap.className = 'status-item ecbt-laymode';

    // Toggle Simples/Técnico
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'ecbt-laymode-toggle';
    btn.className = 'ecbt-laymode-btn';
    btn.addEventListener('click', () => setLayMode(toggleLayMode(getLayMode())));
    _toggleBtn = btn;

    // Botão "?" abre o glossário leigo
    const help = document.createElement('button');
    help.type = 'button';
    help.id = 'ecbt-laymode-help';
    help.className = 'ecbt-laymode-help';
    help.textContent = '?';
    help.setAttribute('aria-label', s.help);
    help.title = s.help;

    const pop = buildGlossaryPopover();
    help.addEventListener('click', (ev) => {
        ev.stopPropagation();
        pop.hidden = !pop.hidden;
    });
    document.addEventListener('click', (ev) => {
        if (!pop.hidden && ev.target !== help && !pop.contains(ev.target as Node)) pop.hidden = true;
    });
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && !pop.hidden) pop.hidden = true;
    });

    wrap.appendChild(btn);
    wrap.appendChild(help);
    host.appendChild(wrap);
    // popover vai no <body> (não na statusbar): position:fixed precisa do viewport como
    // bloco de contenção — um ancestral com transform/filter/contain quebraria o 92vw.
    document.body.appendChild(pop);
    syncToggleLabel(getLayMode());
}

/**
 * Decora elementos com [data-lay-term="<slug>"] com tooltip leigo + sublinhado
 * pontilhado (hook da varredura — qualquer módulo pode taguear jargão). Idempotente.
 */
export function decorateJargon(root: ParentNode = document): number {
    let n = 0;
    const loc = resolveLocale();
    const nodes = root.querySelectorAll<HTMLElement>('[data-lay-term]');
    nodes.forEach((el) => {
        const term = el.getAttribute('data-lay-term');
        const explain = getLayExplanation(term, loc);
        if (!explain) return;
        el.classList.add('ecbt-jargon');
        el.setAttribute('title', explain);
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
        n += 1;
    });
    return n;
}

let _inited = false;

/** Boot: aplica o modo cedo + injeta os controles + decora o jargão. */
export function initLanguageMode(): void {
    if (_inited) return;
    _inited = true;
    applyLayModeClass(getLayMode());
    const run = () => { injectControls(); decorateJargon(document); };
    if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
    // re-decora e re-rotula ao trocar idioma (a UI já dispara eventos de i18n)
    try {
        window.addEventListener('ecbyts:language-changed', () => {
            syncToggleLabel(getLayMode());
            decorateJargon(document);
        });
    } catch (e) { console.debug('[laymode:i18nwire]', (e as any)?.message || e); }
}

/** Aplica a classe ANTES do DOM pintar (chamável inline no boot p/ evitar flash). */
export function applyLayModeEarly(): void {
    applyLayModeClass(getLayMode());
}
