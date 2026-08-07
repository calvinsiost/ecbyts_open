/**
 * legalPageRenderer.ts — Renderer dinâmico para páginas legais (terms/privacy).
 *
 * Monta o switcher de 16 idiomas e gerencia fallback transparente: se um locale
 * não tem tradução completa do corpo, mostra pt-BR (idioma oficial) com banner.
 *
 * COMMERCIAL-READINESS-DOD T8.3.
 */

import { LEGAL_LOCALES, type LegalDocumentType } from './legalTranslations.js';

/** Locales com tradução COMPLETA do corpo legal (os 3 originais). */
const FULLY_TRANSLATED_LOCALES = new Set(['pt-BR', 'en-US', 'es-LA']);

/** UI chrome strings (título, back link, meta labels) para todos os 16 idiomas. */
const UI_STRINGS: Record<string, {
    backLink: string;
    termsTitle: string;
    privacyTitle: string;
    metaVersion: string;
    metaDate: string;
    metaOfficialLanguage: string;
    fallbackNotice: string;
    footerCopyright: string;
    footerPrivacyLink: string;
    footerTermsLink: string;
    footerBackLink: string;
}> = {
    'pt-BR': {
        backLink: '\u2192 Voltar ao ecbyts',
        termsTitle: 'Termos de Uso',
        privacyTitle: 'Pol\u00edtica de Privacidade',
        metaVersion: 'Vers\u00e3o',
        metaDate: 'Data',
        metaOfficialLanguage: 'Idioma oficial',
        fallbackNotice: 'Esta p\u00e1gina ainda n\u00e3o foi traduzida para seu idioma. Exibindo a vers\u00e3o oficial em portugu\u00eas (Brasil).',
        footerCopyright: '2026 ecbyts. Todos os direitos reservados.',
        footerPrivacyLink: 'Pol\u00edtica de Privacidade',
        footerTermsLink: 'Termos de Uso',
        footerBackLink: 'Voltar ao ecbyts',
    },
    'en-US': {
        backLink: '\u2192 Back to ecbyts',
        termsTitle: 'Terms of Service',
        privacyTitle: 'Privacy Policy',
        metaVersion: 'Version',
        metaDate: 'Date',
        metaOfficialLanguage: 'Official language',
        fallbackNotice: 'This page has not yet been translated to your language. Showing the official Portuguese (Brazil) version.',
        footerCopyright: '2026 ecbyts. All rights reserved.',
        footerPrivacyLink: 'Privacy Policy',
        footerTermsLink: 'Terms of Service',
        footerBackLink: 'Back to ecbyts',
    },
    'es-LA': {
        backLink: '\u2192 Volver a ecbyts',
        termsTitle: 'T\u00e9rminos de Servicio',
        privacyTitle: 'Pol\u00edtica de Privacidad',
        metaVersion: 'Versi\u00f3n',
        metaDate: 'Fecha',
        metaOfficialLanguage: 'Idioma oficial',
        fallbackNotice: 'Esta p\u00e1gina a\u00fan no se ha traducido a su idioma. Mostrando la versi\u00f3n oficial en portugu\u00e9s (Brasil).',
        footerCopyright: '2026 ecbyts. Todos los derechos reservados.',
        footerPrivacyLink: 'Pol\u00edtica de Privacidad',
        footerTermsLink: 'T\u00e9rminos de Servicio',
        footerBackLink: 'Volver a ecbyts',
    },
    'de-DE': {
        backLink: '\u2192 Zur\u00fcck zu ecbyts',
        termsTitle: 'Nutzungsbedingungen',
        privacyTitle: 'Datenschutzerkl\u00e4rung',
        metaVersion: 'Version',
        metaDate: 'Datum',
        metaOfficialLanguage: 'Offizielle Sprache',
        fallbackNotice: 'Diese Seite wurde noch nicht in Ihre Sprache \u00fcbersetzt. Die offizielle portugiesische (Brasilien) Version wird angezeigt.',
        footerCopyright: '2026 ecbyts. Alle Rechte vorbehalten.',
        footerPrivacyLink: 'Datenschutzerkl\u00e4rung',
        footerTermsLink: 'Nutzungsbedingungen',
        footerBackLink: 'Zur\u00fcck zu ecbyts',
    },
    'fr-FR': {
        backLink: '\u2192 Retour \u00e0 ecbyts',
        termsTitle: "Conditions d'Utilisation",
        privacyTitle: 'Politique de Confidentialit\u00e9',
        metaVersion: 'Version',
        metaDate: 'Date',
        metaOfficialLanguage: 'Langue officielle',
        fallbackNotice: "Cette page n'a pas encore \u00e9t\u00e9 traduite dans votre langue. La version officielle en portugais (Br\u00e9sil) est affich\u00e9e.",
        footerCopyright: '2026 ecbyts. Tous droits r\u00e9serv\u00e9s.',
        footerPrivacyLink: 'Politique de Confidentialit\u00e9',
        footerTermsLink: "Conditions d'Utilisation",
        footerBackLink: 'Retour \u00e0 ecbyts',
    },
    'it-IT': {
        backLink: '\u2192 Torna a ecbyts',
        termsTitle: 'Termini di Servizio',
        privacyTitle: 'Informativa sulla Privacy',
        metaVersion: 'Versione',
        metaDate: 'Data',
        metaOfficialLanguage: 'Lingua ufficiale',
        fallbackNotice: 'Questa pagina non \u00e8 ancora stata tradotta nella tua lingua. Viene mostrata la versione ufficiale in portoghese (Brasile).',
        footerCopyright: '2026 ecbyts. Tutti i diritti riservati.',
        footerPrivacyLink: 'Informativa sulla Privacy',
        footerTermsLink: 'Termini di Servizio',
        footerBackLink: 'Torna a ecbyts',
    },
    'ja-JP': {
        backLink: '\u2192 ecbyts\u3078\u623b\u308b',
        termsTitle: '\u5229\u7528\u898f\u7d04',
        privacyTitle: '\u30d7\u30e9\u30a4\u30d0\u30b7\u30fc\u30dd\u30ea\u30b7\u30fc',
        metaVersion: '\u30d0\u30fc\u30b8\u30e7\u30f3',
        metaDate: '\u65e5\u4ed8',
        metaOfficialLanguage: '\u516c\u7528\u8a9e',
        fallbackNotice: '\u3053\u306e\u30da\u30fc\u30b8\u306f\u307e\u3060\u3042\u306a\u305f\u306e\u8a00\u8a9e\u306b\u7ffb\u8a33\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002\u30dd\u30eb\u30c8\u30ac\u30eb\u8a9e\uff08\u30d6\u30e9\u30b8\u30eb\uff09\u306e\u516c\u5f0f\u30d0\u30fc\u30b8\u30e7\u30f3\u3092\u8868\u793a\u3057\u3066\u3044\u307e\u3059\u3002',
        footerCopyright: '2026 ecbyts. All rights reserved.',
        footerPrivacyLink: '\u30d7\u30e9\u30a4\u30d0\u30b7\u30fc\u30dd\u30ea\u30b7\u30fc',
        footerTermsLink: '\u5229\u7528\u898f\u7d04',
        footerBackLink: 'ecbyts\u3078\u623b\u308b',
    },
    'ko-KR': {
        backLink: '\u2192 ecbyts\ub85c \ub3cc\uc544\uac00\uae30',
        termsTitle: '\uc774\uc6a9 \uc57d\uad00',
        privacyTitle: '\uac1c\uc778\uc815\ubcf4 \ucc98\ub9ac\ubc29\uce68',
        metaVersion: '\ubc84\uc804',
        metaDate: '\ub0a0\uc9dc',
        metaOfficialLanguage: '\uacf5\uc6a9 \uc5b8\uc5b4',
        fallbackNotice: '\uc774 \ud398\uc774\uc9c0\ub294 \uc544\uc9c1 \uadc0\ud558\uc758 \uc5b8\uc5b4\ub85c \ubc88\uc5ed\ub418\uc9c0 \uc54a\uc558\uc2b5\ub2c8\ub2e4. \ud3ec\ub974\ud22c\uac08\uc5b4(\ube0c\ub77c\uc9c8) \uacf5\uc2dd \ubc84\uc804\uc744 \ud45c\uc2dc\ud558\uace0 \uc788\uc2b5\ub2c8\ub2e4.',
        footerCopyright: '2026 ecbyts. All rights reserved.',
        footerPrivacyLink: '\uac1c\uc778\uc815\ubcf4 \ucc98\ub9ac\ubc29\uce68',
        footerTermsLink: '\uc774\uc6a9 \uc57d\uad00',
        footerBackLink: 'ecbyts\ub85c \ub3cc\uc544\uac00\uae30',
    },
    'zh-CN': {
        backLink: '\u2192 \u8fd4\u56de ecbyts',
        termsTitle: '\u670d\u52a1\u6761\u6b3e',
        privacyTitle: '\u9690\u79c1\u653f\u7b56',
        metaVersion: '\u7248\u672c',
        metaDate: '\u65e5\u671f',
        metaOfficialLanguage: '\u5b98\u65b9\u8bed\u8a00',
        fallbackNotice: '\u6b64\u9875\u9762\u5c1a\u672a\u7ecf\u7ffb\u8bd1\u4e3a\u60a8\u7684\u8bed\u8a00\u3002\u6b63\u5728\u663e\u793a\u8461\u8404\u7259\u8bed\uff08\u5df4\u897f\uff09\u5b98\u65b9\u7248\u672c\u3002',
        footerCopyright: '2026 ecbyts. All rights reserved.',
        footerPrivacyLink: '\u9690\u79c1\u653f\u7b56',
        footerTermsLink: '\u670d\u52a1\u6761\u6b3e',
        footerBackLink: '\u8fd4\u56de ecbyts',
    },
    'ar-SA': {
        backLink: '\u2192 \u0627\u0644\u0639\u0648\u062f\u0629 \u0625\u0644\u0649 ecbyts',
        termsTitle: '\u0634\u0631\u0648\u0637 \u0627\u0644\u062e\u062f\u0645\u0629',
        privacyTitle: '\u0633\u064a\u0627\u0633\u0629 \u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629',
        metaVersion: '\u0627\u0644\u0625\u0635\u062f\u0627\u0631',
        metaDate: '\u0627\u0644\u062a\u0627\u0631\u064a\u062e',
        metaOfficialLanguage: '\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0631\u0633\u0645\u064a\u0629',
        fallbackNotice: '\u0644\u0645 \u064a\u062a\u0645 \u0628\u0639\u062f \u062a\u0631\u062c\u0645\u0629 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062d\u0629 \u0625\u0644\u0649 \u0644\u063a\u062a\u0643. \u064a\u062a\u0645 \u0639\u0631\u0636 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0631\u0633\u0645\u064a\u0629 \u0628\u0627\u0644\u0628\u0631\u062a\u063a\u0627\u0644\u064a\u0629 (\u0627\u0644\u0628\u0631\u0627\u0632\u064a\u0644).',
        footerCopyright: '2026 ecbyts. \u062c\u0645\u064a\u0639 \u0627\u0644\u062d\u0642\u0648\u0642 \u0645\u062d\u0641\u0648\u0638\u0629.',
        footerPrivacyLink: '\u0633\u064a\u0627\u0633\u0629 \u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629',
        footerTermsLink: '\u0634\u0631\u0648\u0637 \u0627\u0644\u062e\u062f\u0645\u0629',
        footerBackLink: '\u0627\u0644\u0639\u0648\u062f\u0629 \u0625\u0644\u0649 ecbyts',
    },
    'hi-IN': {
        backLink: '\u2192 ecbyts \u092a\u0930 \u0935\u093e\u092a\u0938 \u091c\u093e\u090f\u0902',
        termsTitle: '\u0938\u0947\u0935\u093e \u0936\u0930\u094d\u0924\u0947\u0902',
        privacyTitle: '\u0917\u094b\u092a\u0928\u0940\u092f\u0924\u093e \u0928\u0940\u0924\u093f',
        metaVersion: '\u0938\u0902\u0938\u094d\u0915\u0930\u0923',
        metaDate: '\u0924\u093e\u0930\u0940\u0916',
        metaOfficialLanguage: '\u0906\u0927\u093f\u0915\u093e\u0930\u093f\u0915 \u092d\u093e\u0937\u093e',
        fallbackNotice: '\u0907\u0938 \u092a\u0943\u0937\u094d\u0920 \u0915\u093e \u0905\u0928\u0941\u0935\u093e\u0926 \u0905\u092d\u0940 \u0924\u0915 \u0906\u092a\u0915\u0940 \u092d\u093e\u0937\u093e \u092e\u0947\u0902 \u0928\u0939\u0940\u0902 \u0915\u093f\u092f\u093e \u0917\u092f\u093e \u0939\u0948\u0964 \u0906\u0927\u093f\u0915\u093e\u0930\u093f\u0915 \u092a\u0941\u0930\u094d\u0924\u0917\u093e\u0932\u0940 (\u092c\u094d\u0930\u093e\u091c\u093c\u0940\u0932) \u0938\u0902\u0938\u094d\u0915\u0930\u0923 \u0926\u093f\u0916\u093e\u092f\u093e \u091c\u093e \u0930\u0939\u093e \u0939\u0948\u0964',
        footerCopyright: '2026 ecbyts. \u0938\u0930\u094d\u0935\u093e\u0927\u093f\u0915\u093e\u0930 \u0938\u0941\u0930\u0915\u094d\u0937\u093f\u0924\u0964',
        footerPrivacyLink: '\u0917\u094b\u092a\u0928\u0940\u092f\u0924\u093e \u0928\u0940\u0924\u093f',
        footerTermsLink: '\u0938\u0947\u0935\u093e \u0936\u0930\u094d\u0924\u0947\u0902',
        footerBackLink: 'ecbyts \u092a\u0930 \u0935\u093e\u092a\u0938 \u091c\u093e\u090f\u0902',
    },
    'ru-RU': {
        backLink: '\u2192 \u041d\u0430\u0437\u0430\u0434 \u043a ecbyts',
        termsTitle: '\u0423\u0441\u043b\u043e\u0432\u0438\u044f \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u044f',
        privacyTitle: '\u041f\u043e\u043b\u0438\u0442\u0438\u043a\u0430 \u043a\u043e\u043d\u0444\u0438\u0434\u0435\u043d\u0446\u0438\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u0438',
        metaVersion: '\u0412\u0435\u0440\u0441\u0438\u044f',
        metaDate: '\u0414\u0430\u0442\u0430',
        metaOfficialLanguage: '\u041e\u0444\u0438\u0446\u0438\u0430\u043b\u044c\u043d\u044b\u0439 \u044f\u0437\u044b\u043a',
        fallbackNotice: '\u042d\u0442\u0430 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0430 \u0435\u0449\u0435 \u043d\u0435 \u043f\u0435\u0440\u0435\u0432\u0435\u0434\u0435\u043d\u0430 \u043d\u0430 \u0432\u0430\u0448 \u044f\u0437\u044b\u043a. \u041e\u0442\u043e\u0431\u0440\u0430\u0436\u0430\u0435\u0442\u0441\u044f \u043e\u0444\u0438\u0446\u0438\u0430\u043b\u044c\u043d\u0430\u044f \u0432\u0435\u0440\u0441\u0438\u044f \u043d\u0430 \u043f\u043e\u0440\u0442\u0443\u0433\u0430\u043b\u044c\u0441\u043a\u043e\u043c (\u0411\u0440\u0430\u0437\u0438\u043b\u0438\u044f).',
        footerCopyright: '2026 ecbyts. \u0412\u0441\u0435 \u043f\u0440\u0430\u0432\u0430 \u0437\u0430\u0449\u0438\u0449\u0435\u043d\u044b.',
        footerPrivacyLink: '\u041f\u043e\u043b\u0438\u0442\u0438\u043a\u0430 \u043a\u043e\u043d\u0444\u0438\u0434\u0435\u043d\u0446\u0438\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u0438',
        footerTermsLink: '\u0423\u0441\u043b\u043e\u0432\u0438\u044f \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u044f',
        footerBackLink: '\u041d\u0430\u0437\u0430\u0434 \u043a ecbyts',
    },
    'tr-TR': {
        backLink: '\u2192 ecbyts\'e d\u00f6n',
        termsTitle: 'Kullan\u0131m Ko\u015fullar\u0131',
        privacyTitle: 'Gizlilik Politikas\u0131',
        metaVersion: 'S\u00fcr\u00fcm',
        metaDate: 'Tarih',
        metaOfficialLanguage: 'Resmi dil',
        fallbackNotice: 'Bu sayfa hen\u00fcz dilinize \u00e7evrilmedi. Resmi Portekizce (Brezilya) s\u00fcr\u00fcm\u00fc g\u00f6steriliyor.',
        footerCopyright: '2026 ecbyts. T\u00fcm haklar\u0131 sakl\u0131d\u0131r.',
        footerPrivacyLink: 'Gizlilik Politikas\u0131',
        footerTermsLink: 'Kullan\u0131m Ko\u015fullar\u0131',
        footerBackLink: "ecbyts'e d\u00f6n",
    },
    'pl-PL': {
        backLink: '\u2192 Wr\u00f3\u0107 do ecbyts',
        termsTitle: 'Warunki Us\u0142ug',
        privacyTitle: 'Polityka Prywatno\u015bci',
        metaVersion: 'Wersja',
        metaDate: 'Data',
        metaOfficialLanguage: 'J\u0119zyk urz\u0119dowy',
        fallbackNotice: 'Ta strona nie zosta\u0142a jeszcze przet\u0142umaczona na Tw\u00f3j j\u0119zyk. Wy\u015bwietlana jest oficjalna wersja portugalska (Brazylia).',
        footerCopyright: '2026 ecbyts. Wszelkie prawa zastrze\u017cone.',
        footerPrivacyLink: 'Polityka Prywatno\u015bci',
        footerTermsLink: 'Warunki Us\u0142ug',
        footerBackLink: 'Wr\u00f3\u0107 do ecbyts',
    },
    'sv-SE': {
        backLink: '\u2192 Tillbaka till ecbyts',
        termsTitle: 'Anv\u00e4ndarvillkor',
        privacyTitle: 'Integritetspolicy',
        metaVersion: 'Version',
        metaDate: 'Datum',
        metaOfficialLanguage: 'Officiellt spr\u00e5k',
        fallbackNotice: 'Denna sida har \u00e4nnu inte \u00f6versatts till ditt spr\u00e5k. Den officiella portugisiska (Brasilien) versionen visas.',
        footerCopyright: '2026 ecbyts. Alla r\u00e4ttigheter f\u00f6rbeh\u00e5llna.',
        footerPrivacyLink: 'Integritetspolicy',
        footerTermsLink: 'Anv\u00e4ndarvillkor',
        footerBackLink: 'Tillbaka till ecbyts',
    },
    'id-ID': {
        backLink: '\u2192 Kembali ke ecbyts',
        termsTitle: 'Ketentuan Layanan',
        privacyTitle: 'Kebijakan Privasi',
        metaVersion: 'Versi',
        metaDate: 'Tanggal',
        metaOfficialLanguage: 'Bahasa resmi',
        fallbackNotice: 'Halaman ini belum diterjemahkan ke bahasa Anda. Menampilkan versi resmi dalam bahasa Portugis (Brasil).',
        footerCopyright: '2026 ecbyts. Semua hak dilindungi.',
        footerPrivacyLink: 'Kebijakan Privasi',
        footerTermsLink: 'Ketentuan Layanan',
        footerBackLink: 'Kembali ke ecbyts',
    },
};

export interface LegalPageConfig {
    type: LegalDocumentType;
    /** Query selector for the container holding lang-section divs */
    containerSelector: string;
    /** Query selector for the lang-switcher container */
    switcherSelector: string;
    /** Query selector for the h1 title */
    titleSelector: string;
    /** Query selector for the back link */
    backLinkSelector: string;
}

/**
 * Initializes a legal page (terms.html or privacy.html) with 16-locale support.
 *
 * - Builds the language switcher dynamically from LEGAL_LOCALES (16 buttons)
 * - For locales with full translation (pt-BR, en-US, es-LA): shows native content
 * - For other locales: shows pt-BR content with a transparent fallback notice banner
 * - Persists choice in localStorage('ecbyts-language')
 */
export function initLegalPageI18n(config: LegalPageConfig): void {
    const container = document.querySelector(config.containerSelector);
    const switcher = document.querySelector(config.switcherSelector);
    const titleEl = document.querySelector<HTMLElement>(config.titleSelector);
    const backLink = document.querySelector<HTMLElement>(config.backLinkSelector);

    if (!container || !switcher || !titleEl || !backLink) return;

    // Build 16-button switcher
    switcher.innerHTML = '';
    for (const locale of LEGAL_LOCALES) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.lang = locale.code;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', 'false');
        btn.textContent = locale.displayName;
        btn.addEventListener('click', () => setLang(locale.code));
        switcher.appendChild(btn);
    }

    // Create fallback notice element (initially hidden)
    const notice = document.createElement('div');
    notice.className = 'lang-fallback-notice';
    notice.style.cssText = 'display:none;padding:12px 16px;margin-bottom:24px;background:var(--bg-card);border:1px solid var(--accent);border-radius:var(--radius);color:var(--text-secondary);font-size:0.85rem;';
    container.insertBefore(notice, container.querySelector('.lang-section'));

    const buttons = switcher.querySelectorAll('button');
    const sections = container.querySelectorAll<HTMLElement>('.lang-section');

    function setLang(lang: string): void {
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'ar-SA' ? 'rtl' : 'ltr';

        // Check if this locale has full content
        const hasFull = FULLY_TRANSLATED_LOCALES.has(lang);
        const displayLang = hasFull ? lang : 'pt-BR';

        // Show/hide sections
        sections.forEach((s) => {
            s.classList.toggle('active', s.dataset.lang === displayLang);
        });

        // Update buttons
        buttons.forEach((b) => {
            const isActive = b.dataset.lang === lang;
            b.classList.toggle('active', isActive);
            b.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        // Update UI chrome from strings
        const strings = UI_STRINGS[lang] ?? UI_STRINGS['pt-BR']!;
        if (titleEl) titleEl.textContent = config.type === 'terms' ? strings.termsTitle : strings.privacyTitle;
        if (backLink) backLink.textContent = strings.backLink;

        // Show/hide fallback notice
        if (!hasFull) {
            notice.textContent = strings.fallbackNotice;
            notice.style.display = 'block';
        } else {
            notice.style.display = 'none';
        }

        try {
            localStorage.setItem('ecbyts-language', lang);
        } catch (e) {
            console.debug('[boot:lang-storage]', e instanceof Error ? e.message : e);
        }
    }

    // Restore from localStorage
    let stored = '';
    try {
        stored = localStorage.getItem('ecbyts-language') || '';
    } catch (e) {
        console.debug('[boot:lang-storage]', e instanceof Error ? e.message : e);
    }

    const validCodes = LEGAL_LOCALES.map((l) => l.code);
    const initial = stored && validCodes.includes(stored) ? stored : 'pt-BR';
    setLang(initial);
}