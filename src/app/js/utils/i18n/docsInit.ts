// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// Standalone i18n bootstrap for docs.html - no dependency on main app modules.
// Loads locale JSONs, applies data-i18n attributes, and manages language switcher.

/* ================================================================
   DOCS I18N — STANDALONE ENGINE
   ================================================================

   Engine minimalista de i18n para paginas standalone (docs.html).
   Compartilha os mesmos arquivos JSON de locale da app principal,
   mas nao depende de translations.js nem de storageMonitor.js.

   ================================================================ */

const STORAGE_KEY = 'ecbyts_lang';
const DEFAULT_LANG = 'en-US';
const SUPPORTED = [
    'pt-BR',
    'en-US',
    'es-LA',
    'zh-CN',
    'fr-FR',
    'de-DE',
    'ja-JP',
    'it-IT',
    'ko-KR',
    'ru-RU',
    'id-ID',
    'hi-IN',
    'tr-TR',
    'pl-PL',
    'sv-SE',
    'ar-SA',
];
const RTL = ['ar-SA'];
const META: Record<string, { native: string }> = {
    'pt-BR': { native: 'Português' },
    'en-US': { native: 'English' },
    'es-LA': { native: 'Español' },
    'zh-CN': { native: '中文' },
    'fr-FR': { native: 'Français' },
    'de-DE': { native: 'Deutsch' },
    'ja-JP': { native: '日本語' },
    'it-IT': { native: 'Italiano' },
    'ko-KR': { native: '한국어' },
    'ru-RU': { native: 'Русский' },
    'id-ID': { native: 'Bahasa' },
    'hi-IN': { native: 'हिन्दी' },
    'tr-TR': { native: 'Türkçe' },
    'pl-PL': { native: 'Polski' },
    'sv-SE': { native: 'Svenska' },
    'ar-SA': { native: 'العربية' },
};
const ALIAS: Record<string, string> = { en: 'en-US', pt: 'pt-BR', es: 'es-LA' };

// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------

const cache: Record<string, Record<string, string>> = {};
let currentLang = DEFAULT_LANG;

// ----------------------------------------------------------------
// CORE
// ----------------------------------------------------------------

function resolve(code: any) {
    if (!code) return DEFAULT_LANG;
    if (ALIAS[code]) return ALIAS[code];
    return SUPPORTED.includes(code) ? code : DEFAULT_LANG;
}

async function loadLocale(code: any) {
    if (cache[code]) return;
    try {
        const resp = await fetch(`./js/utils/i18n/locales/${code}.json`);
        if (resp.ok) cache[code] = await resp.json();
    } catch (e: any) {
        console.debug('[docs-i18n] loadLocale fallback:', code, e?.message || e);
    }
}

function t(key: any) {
    return (cache[currentLang] && cache[currentLang]![key]) || (cache[DEFAULT_LANG] && cache[DEFAULT_LANG]![key]) || '';
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const val = t(el.getAttribute('data-i18n'));
        if (val) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el: any) => {
        const val = t(el.getAttribute('data-i18n-title'));
        if (val) el.title = val;
    });
    if (currentLang) document.documentElement.lang = currentLang; // guarda WCAG html-has-lang
    document.documentElement.dir = RTL.includes(currentLang) ? 'rtl' : 'ltr';
}

async function setLanguage(code: any) {
    const lang = resolve(code);
    await loadLocale(lang);
    if (!cache[lang]) return;
    currentLang = lang;
    try {
        localStorage.setItem(STORAGE_KEY, lang);
    } catch (e: any) {
        console.debug('[docs-i18n] persist lang:', e?.message || e);
    }
    applyTranslations();
    buildSelector();
}

// ----------------------------------------------------------------
// LANGUAGE SWITCHER
// ----------------------------------------------------------------

function selectors(): any[] {
    return Array.from(document.querySelectorAll('[data-doc-lang-selector]'));
}

function closeDropdowns() {
    selectors().forEach((root: any) => {
        const dropdown = root.querySelector('[data-doc-lang-dropdown]');
        if (dropdown) dropdown.style.display = 'none';
        root.dataset.open = 'false';
    });
}

function buildSelector() {
    selectors().forEach((root: any) => {
        const dropdown = root.querySelector('[data-doc-lang-dropdown]');
        const trigger = root.querySelector('[data-doc-lang-trigger]');
        if (!dropdown || !trigger) return;

        const codeEl = trigger.querySelector('.lang-current-code');
        if (codeEl) codeEl.textContent = currentLang.split('-')[0]!.toUpperCase();

        dropdown.innerHTML = '';
        for (const code of SUPPORTED) {
            const meta = META[code];
            if (!meta) continue;
            const opt = document.createElement('button');
            opt.type = 'button';
            opt.className = 'lang-option' + (code === currentLang ? ' active' : '');
            opt.setAttribute('role', 'option');
            opt.setAttribute('aria-selected', code === currentLang ? 'true' : 'false');
            const shortCode = code.split('-')[0]!.toUpperCase();
            opt.innerHTML =
                `<span class="lang-option-code">${shortCode}</span>` +
                `<span class="lang-option-name">${meta.native}</span>`;
            opt.onclick = async () => {
                await setLanguage(code);
                closeDropdowns();
            };
            dropdown.appendChild(opt);
        }
    });
}

function toggleDropdown(ref = 'doc-lang-trigger') {
    const trigger = document.getElementById(ref);
    const root: any = trigger ? trigger.closest('[data-doc-lang-selector]') : selectors()[0];
    if (!root) return;

    const dropdown = root.querySelector('[data-doc-lang-dropdown]');
    if (!dropdown) return;

    const willOpen = root.dataset.open !== 'true';
    closeDropdowns();
    root.dataset.open = willOpen ? 'true' : 'false';
    dropdown.style.display = willOpen ? 'flex' : 'none';
}

document.addEventListener('click', (e) => {
    selectors().forEach((root: any) => {
        if (root.dataset.open === 'true' && !root.contains(e.target as any)) {
            const dropdown = root.querySelector('[data-doc-lang-dropdown]');
            root.dataset.open = 'false';
            if (dropdown) dropdown.style.display = 'none';
        }
    });
});

// ----------------------------------------------------------------
// INIT
// ----------------------------------------------------------------

(window as any).toggleDocLangDropdown = toggleDropdown;

const saved = localStorage.getItem(STORAGE_KEY) || '';
currentLang = resolve(saved);

const toLoad = [currentLang];
if (currentLang !== DEFAULT_LANG) toLoad.push(DEFAULT_LANG);

try {
    await Promise.all(toLoad.map(loadLocale));
} catch (e: any) {
    console.debug('[docs-i18n] bootstrap locale load:', e?.message || e);
}

applyTranslations();
buildSelector();

export {};
