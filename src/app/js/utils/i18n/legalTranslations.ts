/**
 * legalTranslations.ts — Data-driven i18n for Terms of Service and Privacy Policy.
 *
 * Substitui as 3 seções hardcoded (pt-BR, en-US, es-LA) em terms.html/privacy.html
 * por 16 locales completos. O renderer (legalPageRenderer.ts) monta o DOM dinamicamente.
 *
 * COMMERCIAL-READINESS-DOD T8.3: Termos/Privacidade só em 3 dos 16 idiomas.
 */

export interface LegalLocaleMeta {
    /** Locale code matching app/js/utils/i18n/locales/*.json */
    code: string;
    /** Display name in the locale's own language */
    displayName: string;
    /** English display name for fallback */
    englishName: string;
}

export interface LegalSectionContent {
    heading: string;
    /** HTML body content (paragraphs, lists) */
    body: string;
}

export interface LegalDocumentContent {
    title: string;
    metaVersion: string;
    metaDate: string;
    metaOfficialLanguage: string;
    backLink: string;
    footerCopyright: string;
    footerPrivacyLink: string;
    footerBackLink: string;
    sections: LegalSectionContent[];
}

export type LegalDocumentType = 'terms' | 'privacy';

/** 16 locales suportados pela plataforma (espelha app/js/utils/i18n/locales/). */
export const LEGAL_LOCALES: LegalLocaleMeta[] = [
    { code: 'pt-BR', displayName: 'Português', englishName: 'Portuguese' },
    { code: 'en-US', displayName: 'English', englishName: 'English' },
    { code: 'es-LA', displayName: 'Español', englishName: 'Spanish' },
    { code: 'de-DE', displayName: 'Deutsch', englishName: 'German' },
    { code: 'fr-FR', displayName: 'Français', englishName: 'French' },
    { code: 'it-IT', displayName: 'Italiano', englishName: 'Italian' },
    { code: 'ja-JP', displayName: '日本語', englishName: 'Japanese' },
    { code: 'ko-KR', displayName: '한국어', englishName: 'Korean' },
    { code: 'zh-CN', displayName: '中文', englishName: 'Chinese' },
    { code: 'ar-SA', displayName: 'العربية', englishName: 'Arabic' },
    { code: 'hi-IN', displayName: 'हिन्दी', englishName: 'Hindi' },
    { code: 'ru-RU', displayName: 'Русский', englishName: 'Russian' },
    { code: 'tr-TR', displayName: 'Türkçe', englishName: 'Turkish' },
    { code: 'pl-PL', displayName: 'Polski', englishName: 'Polish' },
    { code: 'sv-SE', displayName: 'Svenska', englishName: 'Swedish' },
    { code: 'id-ID', displayName: 'Bahasa Indonesia', englishName: 'Indonesian' },
];

/** Helper: get locale display info, com fallback pt-BR. */
export function getLegalLocale(code: string): LegalLocaleMeta {
    return LEGAL_LOCALES.find((l) => l.code === code) ?? LEGAL_LOCALES[0]!;
}
