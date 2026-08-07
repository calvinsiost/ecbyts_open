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
   SISTEMA DE INTERNACIONALIZACAO (i18n) — v2
   ================================================================

   Engine multi-idioma com suporte a 16 locales, interpolacao,
   pluralizacao, formatacao regional e lazy loading.

   MUDANCAS PRINCIPAIS (v2):
   - Lazy loading: carrega apenas idioma atual + fallback (en-US)
   - Codigos de locale completos (pt-BR, en-US, es-LA, ...)
   - Interpolacao automatica: t('key', { count: 5 })
   - Pluralizacao via Intl.PluralRules: tp('items', 3)
   - Formatacao regional: formatNumber(), formatDate()
   - Dropdown de idiomas com 16 opcoes
   - Pseudo-locale xx-XX para QA (localhost only)
   - Backward compat: codigos antigos (en/pt/es) mapeados via alias

   ================================================================ */
import { safeSetItem } from '../storage/storageMonitor.js';
import { formatRegionalDate } from './regionalPreferences.js';
// ----------------------------------------------------------------
// CONFIGURACAO
// ----------------------------------------------------------------
const SUPPORTED_LANGUAGES = [
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
/**
 * Idioma padrao - fallback universal.
 */
const DEFAULT_LANGUAGE = 'en-US';
/**
 * Chave usada para salvar preferencia no navegador.
 */
const STORAGE_KEY = 'ecbyts_lang';
/**
 * Mapeamento de codigos antigos para novos (migracao transparente).
 */
const LOCALE_ALIAS: Record<string, string> = {
    en: 'en-US',
    pt: 'pt-BR',
    es: 'es-LA',
};
/**
 * Idiomas com escrita da direita para a esquerda.
 */
const RTL_LANGUAGES = ['ar-SA'];
/**
 * Metadata dos idiomas para o seletor UI.
 * native: nome do idioma na propria lingua.
 */
const LANGUAGE_META: Record<string, any> = {
    'pt-BR': { native: 'Portugu\u00eas' },
    'en-US': { native: 'English' },
    'es-LA': { native: 'Espa\u00f1ol' },
    'zh-CN': { native: '\u4e2d\u6587' },
    'fr-FR': { native: 'Fran\u00e7ais' },
    'de-DE': { native: 'Deutsch' },
    'ja-JP': { native: '\u65e5\u672c\u8a9e' },
    'it-IT': { native: 'Italiano' },
    'ko-KR': { native: '\ud55c\uad6d\uc5b4' },
    'ru-RU': { native: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439' },
    'id-ID': { native: 'Bahasa Indonesia' },
    'hi-IN': { native: '\u0939\u093f\u0928\u094d\u0926\u0940' },
    'tr-TR': { native: 'T\u00fcrk\u00e7e' },
    'pl-PL': { native: 'Polski' },
    'sv-SE': { native: 'Svenska' },
    'ar-SA': { native: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629' },
};
// ----------------------------------------------------------------
// ESTADO DO MODULO
// ----------------------------------------------------------------
const translations: Record<string, any> = {};
/** Idioma atualmente ativo. */
let currentLanguage = DEFAULT_LANGUAGE;
/** Indica se o sistema ja foi inicializado. */
// eslint-disable-next-line
let isLoaded = false;
// ----------------------------------------------------------------
// FUNCOES PRINCIPAIS
// ----------------------------------------------------------------
/**
 * Resolve um codigo de locale, aplicando alias se necessario.
 * @param {string} code
 * @returns {string}
 */
function resolveLocale(code: any) {
    if (!code) return DEFAULT_LANGUAGE;
    const resolved = LOCALE_ALIAS[code] ?? code;
    return SUPPORTED_LANGUAGES.includes(resolved) ? resolved : DEFAULT_LANGUAGE;
}
/**
 * Carrega um arquivo de locale sob demanda (lazy loading).
 * Resultados ficam cacheados em `translations`.
 *
 * @param {string} code - Codigo do locale (ex: 'pt-BR')
 * @returns {Promise<void>}
 */
async function loadLocale(code: any) {
    if (translations[code]) return; // ja cacheado
    try {
        const response = await fetch(`./js/utils/i18n/locales/${code}.json`);
        if (response.ok) {
            translations[code] = await response.json();
        }
    } catch (error: any) {
        console.warn(`[i18n] Nao foi possivel carregar locale: ${code}`, error);
    }
}
/**
 * Gera pseudo-locale xx-XX a partir de en-US para detectar strings
 * nao externalizadas. Cada string fica envolvida em [[ ]].
 */
function generatePseudoLocale() {
    const en = translations[DEFAULT_LANGUAGE];
    if (!en) return;
    const pseudo: Record<string, any> = {};
    for (const [key, val] of Object.entries(en)) {
        pseudo[key] = `[[ ${val} ]]`;
    }
    translations['xx-XX'] = pseudo;
}
/**
 * Inicializa o sistema de traducoes.
 * Carrega apenas o idioma atual + fallback (en-US) via lazy loading.
 *
 * @returns {Promise<void>}
 */
async function initI18n() {
    // Recupera idioma salvo, aplicando alias de migracao
    const savedLang = localStorage.getItem(STORAGE_KEY) || '';
    // TD-1 (PERSONA_JOURNEY_PAIN_AUDIT, Calvin frente "a" 2026-06-11): sem
    // idioma salvo, detectar pelo BROWSER (navigator.languages) — antes a 1ª
    // visita caía SEMPRE em en-US, mesmo p/ browser pt-BR (invite wall +
    // consent em inglês p/ todo usuário brasileiro novo).
    let initial = savedLang;
    if (!initial && typeof navigator !== 'undefined') {
        const candidates = Array.isArray(navigator.languages) && navigator.languages.length
            ? navigator.languages
            : [navigator.language].filter(Boolean);
        for (const cand of candidates) {
            const exact = resolveLocale(cand);
            if (exact !== DEFAULT_LANGUAGE || /^en\b/i.test(String(cand))) {
                initial = String(cand);
                break;
            }
            // match por prefixo (ex.: 'pt' / 'pt-PT' → pt-BR; 'es-MX' → es-LA)
            const prefix = String(cand).slice(0, 2).toLowerCase();
            const byPrefix = SUPPORTED_LANGUAGES.find((l) => l.toLowerCase().startsWith(prefix));
            if (byPrefix) {
                initial = byPrefix;
                break;
            }
        }
    }
    currentLanguage = resolveLocale(initial || '');
    // Carrega idioma atual + fallback em paralelo (com timeout de 5s)
    const toLoad = [currentLanguage];
    if (currentLanguage !== DEFAULT_LANGUAGE) toLoad.push(DEFAULT_LANGUAGE);
    try {
        const loadTimeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('i18n load timeout (5s)')), 5000),
        );
        await Promise.race([Promise.all(toLoad.map(loadLocale)), loadTimeout]);
    } catch (e: any) {
        console.warn('[i18n] Translation load issue:', e?.message);
    }
    // Pseudo-locale para QA (somente localhost)
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        if (!SUPPORTED_LANGUAGES.includes('xx-XX')) {
            SUPPORTED_LANGUAGES.push('xx-XX');
            LANGUAGE_META['xx-XX'] = { native: 'Pseudo (QA)' };
        }
        generatePseudoLocale();
    }
    // Salva codigo novo (migracao de en→en-US)
    if (savedLang && LOCALE_ALIAS[savedLang]) {
        safeSetItem(STORAGE_KEY, currentLanguage);
    }
    // Atualiza atributos do HTML. Guarda anti-esvaziamento (WCAG html-has-lang,
    // axe-core 2026-06-14): nunca apagar o lang — se currentLanguage vier vazio
    // por algum caminho, preserva o atributo estático do index.html.
    if (currentLanguage) document.documentElement.lang = currentLanguage;
    document.documentElement.dir = RTL_LANGUAGES.includes(currentLanguage) ? 'rtl' : 'ltr';
    isLoaded = true;
    applyTranslations();
}
/**
 * Obtem a traducao de uma chave com interpolacao opcional.
 *
 * @param {string} key - Chave da traducao (ex: 'nav.dashboard')
 * @param {Object<string, string|number>} [params?] - Valores para interpolacao
 * @returns {string} - Texto traduzido ou a propria chave se nao encontrado
 *
 * EXEMPLOS:
 *   t('appName')                         // "ecbyts"
 *   t('save')                            // "Salvar" (em pt-BR)
 *   t('macCoverageMsg', { n: 5 })        // "As 5 primeiras medidas..."
 *   t('invite.expiresIn', { days: 3 })   // "Expira em 3 dias"
 */
function t(key: any, params?: any) {
    let text = translations[currentLanguage]?.[key] ?? translations[DEFAULT_LANGUAGE]?.[key] ?? key;
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            text = text.replaceAll(`{{${k}}}`, String(v));
        }
    }
    return text;
}
/**
 * Traducao com pluralizacao via Intl.PluralRules.
 * Busca chaves com sufixo _zero, _one, _two, _few, _many, _other.
 *
 * @param {string} key - Chave base (sem sufixo)
 * @param {number} count - Quantidade para determinar forma plural
 * @param {Object<string, string|number>} [params] - Valores adicionais
 * @returns {string}
 *
 * EXEMPLO:
 *   JSON: { "items_one": "{{count}} item", "items_other": "{{count}} itens" }
 *   tp('items', 1)  // "1 item"
 *   tp('items', 5)  // "5 itens"
 */
function tp(key: any, count: any, params: any = {}) {
    const locale = currentLanguage.split('-')[0]; // pt-BR → pt
    const rules = new Intl.PluralRules(locale);
    const category = rules.select(count); // 'zero', 'one', 'two', 'few', 'many', 'other'
    const suffixedKey = `${key}_${category}`;
    // Tenta a forma exata, fallback para _other
    const finalKey =
        translations[currentLanguage]?.[suffixedKey] || translations[DEFAULT_LANGUAGE]?.[suffixedKey]
            ? suffixedKey
            : `${key}_other`;
    return t(finalKey, { ...params, count });
}
/**
 * Altera o idioma da aplicacao.
 * Carrega o locale sob demanda, salva preferencia e atualiza a interface.
 *
 * @param {string} lang - Codigo do idioma ('pt-BR', 'en-US', etc.)
 * @returns {Promise<void>}
 */
async function setLanguage(lang: any) {
    const resolved = resolveLocale(lang);
    // Carrega o locale se ainda nao esta em cache
    await loadLocale(resolved);
    if (!translations[resolved]) {
        console.warn(`[i18n] Traducoes nao disponiveis para: ${resolved}`);
        return;
    }
    // Gera pseudo-locale quando muda de idioma (precisa de en-US fresco)
    if (resolved === 'xx-XX') {
        generatePseudoLocale();
    }
    currentLanguage = resolved;
    safeSetItem(STORAGE_KEY, resolved);
    // Atualiza atributos do HTML (guarda anti-esvaziamento — WCAG html-has-lang).
    if (resolved) document.documentElement.lang = resolved;
    document.documentElement.dir = RTL_LANGUAGES.includes(resolved) ? 'rtl' : 'ltr';
    applyTranslations();
    updateLanguageSelector();
    // Dispara evento para outros modulos saberem da mudanca
    window.dispatchEvent(
        new CustomEvent('languageChanged', {
            detail: { lang: currentLanguage },
        }),
    );
}
/**
 * Retorna o idioma atual.
 * @returns {string}
 */
function getCurrentLanguage() {
    return currentLanguage;
}
/**
 * Retorna lista de idiomas disponiveis.
 * @returns {string[]}
 */
function getAvailableLanguages() {
    return [...SUPPORTED_LANGUAGES];
}
// ----------------------------------------------------------------
// FORMATACAO REGIONAL (Intl API)
// ----------------------------------------------------------------
/**
 * Formata um numero conforme o locale atual.
 * @param {number} value
 * @param {Intl.NumberFormatOptions} [opts]
 * @returns {string}
 */
function formatNumber(value: any, opts: any = {}) {
    return new Intl.NumberFormat(currentLanguage, opts).format(value);
}
/**
 * Formata uma data conforme o locale atual.
 * @param {Date|string|number} date
 * @param {Intl.DateTimeFormatOptions} [opts]
 * @returns {string}
 */
function formatDate(date: any, opts: any = { dateStyle: "medium" }) {
    return formatRegionalDate(date, opts);
}
// ----------------------------------------------------------------
// FUNCOES DE APLICACAO NA INTERFACE
// ----------------------------------------------------------------
/**
 * Aplica traducoes em todos os elementos da pagina.
 * Suporta: data-i18n, data-i18n-placeholder, data-i18n-title, data-i18n-label, data-i18n-aria.
 */
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((element: any) => {
        const key = element.getAttribute('data-i18n') || '';
        element.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((element: any) => {
        const key = element.getAttribute('data-i18n-placeholder') || '';
        element.placeholder = t(key);
    });
    document.querySelectorAll('[data-i18n-label]').forEach((element: any) => {
        const key = element.getAttribute('data-i18n-label') || '';
        element.label = t(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((element: any) => {
        const key = element.getAttribute('data-i18n-title') || '';
        element.title = t(key);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((element: any) => {
        const key = element.getAttribute('data-i18n-aria') || '';
        element.setAttribute('aria-label', t(key));
    });
    document.title = t('appName') || 'ecbyts';
}
/**
 * Atualiza o seletor de idioma (dropdown).
 * Popula a lista de opcoes e marca o idioma ativo.
 */
function updateLanguageSelector() {
    const dropdown = document.getElementById('lang-dropdown');
    const trigger = document.getElementById('lang-dropdown-trigger');
    const openRegionalPreferences = () => {
        import('../ui/regionalPreferencesModal.js' as string)
            .then(({ openRegionalPreferencesModal }) => openRegionalPreferencesModal())
            .catch((err: any) => console.warn('[i18n] Regional preferences unavailable:', err?.message || err));
    };
    const regionalPreferencesTitle = () => {
        const value = t('regionalPreferences.title');
        return value === 'regionalPreferences.title' ? 'Idioma e regiao' : value;
    };
    if (dropdown) {
        dropdown.innerHTML = '';
        for (const code of SUPPORTED_LANGUAGES) {
            const meta = LANGUAGE_META[code];
            if (!meta) continue;
            const opt = document.createElement('button');
            opt.type = 'button';
            opt.className = 'lang-option' + (code === currentLanguage ? ' active' : '');
            opt.setAttribute('role', 'option');
            opt.setAttribute('aria-selected', code === currentLanguage ? 'true' : 'false');
            const shortCode = code.split("-")[0]!.toUpperCase();
            opt.innerHTML =
                `<span class="lang-option-code">${shortCode}</span>` +
                `<span class="lang-option-name">${meta.native}</span>`;
            opt.onclick = () => {
                setLanguage(code);
                toggleLanguageDropdown();
            };
            dropdown.appendChild(opt);
        }
        const divider = document.createElement('div');
        divider.className = 'lang-dropdown-divider';
        dropdown.appendChild(divider);
        const regionalBtn = document.createElement('button');
        regionalBtn.type = 'button';
        regionalBtn.className = 'lang-option lang-option-settings';
        regionalBtn.setAttribute('role', 'option');
        regionalBtn.innerHTML =
            `<span class="lang-option-code">REG</span>` +
            `<span class="lang-option-name">${regionalPreferencesTitle()}</span>`;
        regionalBtn.onclick = () => {
            toggleLanguageDropdown();
            openRegionalPreferences();
        };
        dropdown.appendChild(regionalBtn);
    }
    // Atualiza label do trigger
    if (trigger) {
        const short = currentLanguage.split("-")[0]!.toUpperCase();
        const codeEl = trigger.querySelector('.lang-current-code');
        if (codeEl) codeEl.textContent = short;
    }
    // Mobile: popula grid de idiomas no menu mobile
    const mobileGrid = document.getElementById('mobile-lang-grid');
    if (mobileGrid) {
        mobileGrid.innerHTML = '';
        for (const code of SUPPORTED_LANGUAGES) {
            const meta = LANGUAGE_META[code];
            if (!meta) continue;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lang-mobile-btn' + (code === currentLanguage ? ' active' : '');
            const shortCode = code.split("-")[0]!.toUpperCase();
            btn.innerHTML =
                `<span class="lang-option-code">${shortCode}</span>` +
                `<span class="lang-option-name">${meta.native}</span>`;
            btn.onclick = () => {
                setLanguage(code);
                const w = window;
                if (typeof w.closeMobileMenu === 'function') w.closeMobileMenu();
            };
            mobileGrid.appendChild(btn);
        }
        const regionalBtn = document.createElement('button');
        regionalBtn.type = 'button';
        regionalBtn.className = 'lang-mobile-btn';
        regionalBtn.innerHTML =
            `<span class="lang-option-code">REG</span>` +
            `<span class="lang-option-name">${regionalPreferencesTitle()}</span>`;
        regionalBtn.onclick = () => {
            openRegionalPreferences();
            const w = window;
            if (typeof w.closeMobileMenu === 'function') w.closeMobileMenu();
        };
        mobileGrid.appendChild(regionalBtn);
    }
}
/**
 * Abre/fecha o dropdown de idiomas.
 *
 * Header V2 (Home Redesign, ver homeHeader.ts): o #titlebar legado (onde
 * #lang-dropdown fisicamente mora) fica com display:none, entao o dropdown
 * ficava preso invisivel mesmo com a classe .open aplicada — falha SILENCIOSA.
 * Mesmo padrao de reparenting ja validado em producao para #auth-menu em
 * auth.ts (handleToggleAuthMenu): quando o V2 esta ativo, move (nao clona) o
 * elemento original para document.body e reposiciona sob o trigger real do
 * V2 (botao com data-cc-action="cc-bd78ab5a", span filho #ah-lang-code).
 * Move (nao clone) porque updateLanguageSelector() reconstroi o innerHTML de
 * #lang-dropdown (por id, via getElementById) a cada languageChanged — um
 * clone ficaria orfao e desatualizado apos a 1a troca de idioma.
 */
function toggleLanguageDropdown() {
    const dd = document.getElementById('lang-dropdown');
    if (!dd) return;
    const legacyTrigger = document.getElementById('lang-dropdown-trigger');
    const titlebar = document.getElementById('titlebar');
    const v2Btn = document.getElementById('ah-lang-btn');
    const isV2Active = !!(v2Btn && titlebar && titlebar.style.display === 'none');
    if (isV2Active) {
        // Header V2 ativo: #titlebar (e o trigger legado dentro dele) esta
        // escondido. Move o dropdown para fora, sob o botao "EN" novo.
        if (dd.parentElement !== document.body) {
            document.body.appendChild(dd);
        }
        dd.classList.toggle('open');
        const isOpen = dd.classList.contains('open');
        if (isOpen) {
            const rect = v2Btn.getBoundingClientRect();
            dd.style.position = 'fixed';
            dd.style.top = rect.bottom + 4 + 'px';
            dd.style.right = window.innerWidth - rect.right + 'px';
            dd.style.left = 'auto';
        }
        v2Btn.setAttribute('aria-expanded', String(isOpen));
    } else {
        // Modo legado: garante que o dropdown esteja de volta dentro do
        // .language-selector original (caso tenha sido movido antes).
        const legacyParent = legacyTrigger?.parentElement;
        if (legacyParent && dd.parentElement !== legacyParent) {
            legacyParent.appendChild(dd);
        }
        dd.style.position = '';
        dd.style.top = '';
        dd.style.right = '';
        dd.style.left = '';
        dd.classList.toggle('open');
        if (legacyTrigger) {
            legacyTrigger.setAttribute('aria-expanded', String(dd.classList.contains('open')));
        }
    }
}
// Click-outside para fechar dropdown. Cobre os dois modos: legado
// (#lang-dropdown-trigger dentro do #titlebar) e header V2 (#ah-lang-btn,
// dropdown reparentado em document.body — mesmo padrao de
// handleToggleAuthMenu em auth.ts).
if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
        const dd = document.getElementById('lang-dropdown');
        if (!dd?.classList.contains('open')) return;
        const target = e.target as any;
        const isV2 = dd.parentElement === document.body;
        const trigger = isV2
            ? document.getElementById('ah-lang-btn')
            : document.getElementById('lang-dropdown-trigger');
        if (trigger && !trigger.contains(target) && !dd.contains(target)) {
            dd.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
        }
    });
}
// ----------------------------------------------------------------
// EXPORTACOES
// ----------------------------------------------------------------
export {
    initI18n,
    t,
    tp,
    setLanguage,
    getCurrentLanguage,
    getAvailableLanguages,
    applyTranslations,
    updateLanguageSelector,
    toggleLanguageDropdown,
    formatNumber,
    formatDate,
    LANGUAGE_META,
};
