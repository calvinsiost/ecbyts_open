// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance i18n - Phase 6 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S9
 *
 * Phase 6 (2026-05-01) - pure-logic helpers para localizar mensagens,
 * estados FSM, event types e source labels. Suporta PT-BR / EN-US / ES-LA
 * (3 locais canônicos do ecbyts) com fallback determinístico.
 *
 * Estratégia:
 *   - Catálogo frozen de strings indexado por (key, locale)
 *   - Fallback chain: requested → en-US → key literal
 *   - Pluralização básica (count 0/1/N)
 *   - Format placeholders: {key} → value (sem dependência de Intl.MessageFormat)
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Locais suportados. */
export const SUPPORTED_LOCALES = Object.freeze(['pt-BR', 'en-US', 'es-LA']);
export const FALLBACK_LOCALE = 'en-US';

/** Identidade do módulo. */
export const COMPLIANCE_I18N_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 6,
    deliveredAt: '2026-05-01',
    locales: SUPPORTED_LOCALES,
    fallback: FALLBACK_LOCALE,
});

/** Catálogo de strings — provenance sources. */
const PROVENANCE_STRINGS = Object.freeze({
    human: Object.freeze({
        'pt-BR': 'Humano',
        'en-US': 'Human',
        'es-LA': 'Humano',
    }),
    ai_ecbyts: Object.freeze({
        'pt-BR': 'IA (ecbyts)',
        'en-US': 'AI (ecbyts)',
        'es-LA': 'IA (ecbyts)',
    }),
    ai_external: Object.freeze({
        'pt-BR': 'IA (externa)',
        'en-US': 'AI (external)',
        'es-LA': 'IA (externa)',
    }),
    imported: Object.freeze({
        'pt-BR': 'Importado',
        'en-US': 'Imported',
        'es-LA': 'Importado',
    }),
    unknown: Object.freeze({
        'pt-BR': 'Desconhecido',
        'en-US': 'Unknown',
        'es-LA': 'Desconocido',
    }),
});

/** Catálogo — revision states. */
const REVISION_STATE_STRINGS = Object.freeze({
    draft: Object.freeze({
        'pt-BR': 'Rascunho',
        'en-US': 'Draft',
        'es-LA': 'Borrador',
    }),
    under_review: Object.freeze({
        'pt-BR': 'Em revisão',
        'en-US': 'Under review',
        'es-LA': 'En revisión',
    }),
    approved: Object.freeze({
        'pt-BR': 'Aprovado',
        'en-US': 'Approved',
        'es-LA': 'Aprobado',
    }),
    rejected: Object.freeze({
        'pt-BR': 'Rejeitado',
        'en-US': 'Rejected',
        'es-LA': 'Rechazado',
    }),
    deprecated: Object.freeze({
        'pt-BR': 'Descontinuado',
        'en-US': 'Deprecated',
        'es-LA': 'Descontinuado',
    }),
});

/** Catálogo — audit event types. */
const AUDIT_EVENT_STRINGS = Object.freeze({
    created: Object.freeze({
        'pt-BR': 'Criado',
        'en-US': 'Created',
        'es-LA': 'Creado',
    }),
    updated: Object.freeze({
        'pt-BR': 'Atualizado',
        'en-US': 'Updated',
        'es-LA': 'Actualizado',
    }),
    reviewed: Object.freeze({
        'pt-BR': 'Revisado',
        'en-US': 'Reviewed',
        'es-LA': 'Revisado',
    }),
    approved: Object.freeze({
        'pt-BR': 'Aprovado',
        'en-US': 'Approved',
        'es-LA': 'Aprobado',
    }),
    rejected: Object.freeze({
        'pt-BR': 'Rejeitado',
        'en-US': 'Rejected',
        'es-LA': 'Rechazado',
    }),
    archived: Object.freeze({
        'pt-BR': 'Arquivado',
        'en-US': 'Archived',
        'es-LA': 'Archivado',
    }),
    deprecated: Object.freeze({
        'pt-BR': 'Descontinuado',
        'en-US': 'Deprecated',
        'es-LA': 'Descontinuado',
    }),
    restored: Object.freeze({
        'pt-BR': 'Restaurado',
        'en-US': 'Restored',
        'es-LA': 'Restaurado',
    }),
    commented: Object.freeze({
        'pt-BR': 'Comentado',
        'en-US': 'Commented',
        'es-LA': 'Comentado',
    }),
    compliance_check: Object.freeze({
        'pt-BR': 'Verificação de conformidade',
        'en-US': 'Compliance check',
        'es-LA': 'Verificación de cumplimiento',
    }),
    compliance_violation: Object.freeze({
        'pt-BR': 'Violação de conformidade',
        'en-US': 'Compliance violation',
        'es-LA': 'Violación de cumplimiento',
    }),
    export: Object.freeze({
        'pt-BR': 'Exportado',
        'en-US': 'Exported',
        'es-LA': 'Exportado',
    }),
    import: Object.freeze({
        'pt-BR': 'Importado',
        'en-US': 'Imported',
        'es-LA': 'Importado',
    }),
});

/** UI message templates (com placeholders {key}). */
const UI_MESSAGES = Object.freeze({
    documents_count: Object.freeze({
        'pt-BR': '{count} documento(s)',
        'en-US': '{count} document(s)',
        'es-LA': '{count} documento(s)',
    }),
    revisions_count: Object.freeze({
        'pt-BR': '{count} revisão/revisões',
        'en-US': '{count} revision(s)',
        'es-LA': '{count} revisión/revisiones',
    }),
    audit_entries_count: Object.freeze({
        'pt-BR': '{count} entrada(s) de auditoria',
        'en-US': '{count} audit entry/entries',
        'es-LA': '{count} entrada(s) de auditoría',
    }),
    compliance_passed: Object.freeze({
        'pt-BR': 'Conformidade aprovada',
        'en-US': 'Compliance passed',
        'es-LA': 'Cumplimiento aprobado',
    }),
    compliance_failed: Object.freeze({
        'pt-BR': 'Conformidade falhou',
        'en-US': 'Compliance failed',
        'es-LA': 'Cumplimiento falló',
    }),
    no_changes: Object.freeze({
        'pt-BR': 'Sem alterações',
        'en-US': 'No changes',
        'es-LA': 'Sin cambios',
    }),
});

/**
 * Normaliza locale (case-insensitive) e retorna SUPPORTED_LOCALES match.
 *
 * @param locale
 */
export function normalizeLocale(locale: string): string {
    if (typeof locale !== 'string' || !locale) return FALLBACK_LOCALE;
    const normalized = locale.trim();
    // Direct match
    for (const supp of SUPPORTED_LOCALES) {
        if (supp.toLowerCase() === normalized.toLowerCase()) return supp;
    }
    // Match by language prefix (en, pt, es)
    const lang = (normalized.split('-')[0] ?? '').toLowerCase();
    for (const supp of SUPPORTED_LOCALES) {
        if ((supp.split('-')[0] ?? '').toLowerCase() === lang) return supp;
    }
    return FALLBACK_LOCALE;
}

/**
 * Resolve string em catálogo com fallback.
 *
 * @param catalog - frozen catalog object
 * @param any>
 * @param key
 */
function _resolveFromCatalog(catalog: Record<string, any>, key: string, locale: string): string {
    const norm = normalizeLocale(locale);
    const entry = catalog[key];
    if (!entry) return key; // sem entry, retorna key literal (debugging-friendly)
    if (entry[norm]) return entry[norm];
    if (entry[FALLBACK_LOCALE]) return entry[FALLBACK_LOCALE];
    return key;
}

/**
 * Obtém label localizada para provenance source.
 *
 * @param source - uma de PROVENANCE_SOURCES (Phase 1)
 * @param locale
 */
export function getProvenanceLabel(source: string, locale = FALLBACK_LOCALE): string {
    return _resolveFromCatalog(PROVENANCE_STRINGS, String(source || ''), locale);
}

/**
 * Obtém label localizada para revision state.
 *
 * @param state
 * @param locale
 */
export function getRevisionStateLabel(state: string, locale = FALLBACK_LOCALE): string {
    return _resolveFromCatalog(REVISION_STATE_STRINGS, String(state || ''), locale);
}

/**
 * Obtém label localizada para audit event type.
 *
 * @param eventType
 * @param locale
 */
export function getAuditEventLabel(eventType: string, locale = FALLBACK_LOCALE): string {
    return _resolveFromCatalog(AUDIT_EVENT_STRINGS, String(eventType || ''), locale);
}

/**
 * Aplica placeholders {key} em template usando params.
 *
 * @param template
 * @param params
 */
export function formatMessage(template: string, params: Record<string, any> = {}): string {
    if (typeof template !== 'string') return '';
    if (!params || typeof params !== 'object') return template;
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        if (key in params && params[key] != null) return String(params[key]);
        return match;
    });
}

/**
 * Obtém UI message localizada com placeholders aplicados.
 *
 * @param key
 * @param locale
 * @param params
 */
export function getMessage(key: string, locale = FALLBACK_LOCALE, params: object = {}): string {
    const template = _resolveFromCatalog(UI_MESSAGES, key, locale);
    return formatMessage(template, params);
}

/**
 * Lista todas as keys disponíveis em um catálogo.
 *
 * @param category - 'provenance' | 'revisionState' | 'auditEvent' | 'message'
 */
export function listKeys(category: string): Array<string> {
    switch (category) {
        case 'provenance':
            return Object.keys(PROVENANCE_STRINGS);
        case 'revisionState':
            return Object.keys(REVISION_STATE_STRINGS);
        case 'auditEvent':
            return Object.keys(AUDIT_EVENT_STRINGS);
        case 'message':
            return Object.keys(UI_MESSAGES);
        default:
            return [];
    }
}

/**
 * Module identity export.
 */
export const complianceI18nMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 6,
    deliveredAt: '2026-05-01',
    locales: SUPPORTED_LOCALES,
    fallback: FALLBACK_LOCALE,
    catalogs: {
        provenance: Object.keys(PROVENANCE_STRINGS).length,
        revisionState: Object.keys(REVISION_STATE_STRINGS).length,
        auditEvent: Object.keys(AUDIT_EVENT_STRINGS).length,
        message: Object.keys(UI_MESSAGES).length,
    },
    exports: [
        'SUPPORTED_LOCALES',
        'FALLBACK_LOCALE',
        'COMPLIANCE_I18N_META',
        'normalizeLocale',
        'getProvenanceLabel',
        'getRevisionStateLabel',
        'getAuditEventLabel',
        'formatMessage',
        'getMessage',
        'listKeys',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
