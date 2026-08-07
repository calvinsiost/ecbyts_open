// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SPEC_ECBT_KEY_ENCRYPTION_BY_RADAR_PROFILE — F3 pure-logic dos 3 modais UI.
 * (claude - novaspec, 2026-06-03).
 *
 * Pure-logic (sem DOM, sem rede) para os 3 modais §5 da spec:
 *   - Export modal (Type A/C/D picker + recipient list classification)
 *   - Import error modal (recipient não autorizado + actionable hints)
 *   - Radar profile security block (badge ECDH registered/missing)
 *
 * APIs puras: validação de input, classificação de profile keyring status,
 * format de lista, mensagens i18n-key resolution, anti-downgrade hints.
 *
 * Refs:
 *   - SPEC §5 UX/UI
 *   - core/io/_typeDPure.ts (formato Tipo D — display string)
 *   - core/crypto/_envelopePure.ts (envelope schema — listAuthorizedProfileIds)
 */

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

export const KEY_TYPE_OPTIONS = Object.freeze(['A', 'C', 'D'] as const);
export type KeyTypeOption = (typeof KEY_TYPE_OPTIONS)[number];

export const PROFILE_KEYRING_STATUS = Object.freeze(['registered', 'missing', 'expired'] as const);
export type ProfileKeyringStatus = (typeof PROFILE_KEYRING_STATUS)[number];

/** i18n key prefix canônico para todas as strings da feature. */
export const I18N_NAMESPACE = 'ecbtCrypto' as const;

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export interface ProfileForExport {
    readonly profileId: string;
    readonly displayName: string;
    readonly hasEcdhKey: boolean;
    readonly ecdhKeyId?: string;
    readonly ecdhRegisteredAt?: string; // ISO 8601
}

export interface ExportModalState {
    readonly selectedType: KeyTypeOption;
    readonly recipients: ReadonlyArray<ProfileForExport>;
    readonly authorizedCount: number; // hasEcdhKey === true
    readonly missingCount: number; // hasEcdhKey === false
    readonly canExportTypeD: boolean; // ≥1 authorized
    readonly warningKeys: ReadonlyArray<string>; // i18n keys de warnings
}

export interface ImportErrorState {
    readonly errorKind: 'not_authorized' | 'corrupted' | 'no_private_key' | 'unsupported_browser';
    readonly myProfileIdMasked: string; // primeiros 8 chars + '…'
    readonly authorizedCountInKey: number;
    readonly actionKeys: ReadonlyArray<string>; // i18n keys das ações sugeridas
}

export interface RadarProfileSecurityState {
    readonly profileId: string;
    readonly keyringStatus: ProfileKeyringStatus;
    readonly displayKeyId?: string; // versão truncada para UI (8 chars)
    readonly badgeLabelKey: string;
    readonly actionKeys: ReadonlyArray<string>; // 'rotate' / 'register' / 'revoke'
}

// ----------------------------------------------------------------
// VALIDATION
// ----------------------------------------------------------------

export function validateKeyTypeOption(input: unknown): KeyTypeOption {
    if (typeof input !== 'string') {
        throw new Error('[ecbtCrypto] keyType must be string');
    }
    const v = input.toUpperCase();
    if (v !== 'A' && v !== 'C' && v !== 'D') {
        throw new Error(`[ecbtCrypto] keyType inválido: ${input} (esperado A/C/D)`);
    }
    return v;
}

// ----------------------------------------------------------------
// EXPORT MODAL — pure state builder
// ----------------------------------------------------------------

/**
 * Constrói o estado do modal de export a partir do tipo selecionado +
 * lista de profiles do radar.
 *
 * Regras:
 *   - Tipo A/C: warning sobre falta de criptografia real (apenas
 *     compressão/ofuscação).
 *   - Tipo D: warning se nenhum profile tem chave registrada
 *     (canExportTypeD = false).
 *   - Tipo D: warning se ≥1 profile NÃO tem chave (ele NÃO conseguirá
 *     abrir — UX expectation management).
 */
export function buildExportModalState(
    selectedType: unknown,
    profiles: ReadonlyArray<ProfileForExport> | null | undefined,
): ExportModalState {
    const safeType = validateKeyTypeOption(selectedType);
    const safeProfiles = Array.isArray(profiles) ? profiles : [];
    const authorized = safeProfiles.filter((p) => p && p.hasEcdhKey === true);
    const missing = safeProfiles.filter((p) => p && p.hasEcdhKey === false);

    const warnings: string[] = [];
    if (safeType === 'A') {
        warnings.push(`${I18N_NAMESPACE}.export.warning.typeAObfuscationOnly`);
    }
    if (safeType === 'C') {
        warnings.push(`${I18N_NAMESPACE}.export.warning.typeCNotEncrypted`);
    }
    if (safeType === 'D') {
        if (authorized.length === 0) {
            warnings.push(`${I18N_NAMESPACE}.export.warning.typeDNoRecipients`);
        }
        if (missing.length > 0) {
            warnings.push(`${I18N_NAMESPACE}.export.warning.typeDSomeRecipientsMissingKey`);
        }
    }

    return Object.freeze({
        selectedType: safeType,
        recipients: Object.freeze(safeProfiles.slice()),
        authorizedCount: authorized.length,
        missingCount: missing.length,
        canExportTypeD: authorized.length > 0,
        warningKeys: Object.freeze(warnings),
    });
}

// ----------------------------------------------------------------
// IMPORT ERROR MODAL — pure state builder
// ----------------------------------------------------------------

/** Mascara um profileId para display (primeiros 8 chars + '…'). */
export function maskProfileId(profileId: unknown): string {
    if (typeof profileId !== 'string' || profileId.length === 0) return '—';
    if (profileId.length <= 8) return profileId;
    return profileId.slice(0, 8) + '…';
}

/**
 * Constrói o estado do modal de erro de import baseado no tipo de erro
 * e contexto (meu profileId + número de profiles autorizados na chave).
 */
export function buildImportErrorState(
    errorKind: unknown,
    myProfileId: unknown,
    authorizedCountInKey: unknown,
): ImportErrorState {
    const validKinds = ['not_authorized', 'corrupted', 'no_private_key', 'unsupported_browser'] as const;
    if (typeof errorKind !== 'string' || !validKinds.includes(errorKind as any)) {
        throw new Error(`[ecbtCrypto] errorKind inválido: ${errorKind}`);
    }
    const kind = errorKind as ImportErrorState['errorKind'];
    const count = typeof authorizedCountInKey === 'number' && authorizedCountInKey >= 0
        ? authorizedCountInKey
        : 0;

    const actions: string[] = [];
    if (kind === 'not_authorized') {
        actions.push(`${I18N_NAMESPACE}.import.action.askOwnerForAccess`);
        actions.push(`${I18N_NAMESPACE}.import.action.checkLogin`);
    } else if (kind === 'corrupted') {
        actions.push(`${I18N_NAMESPACE}.import.action.askForFreshKey`);
        actions.push(`${I18N_NAMESPACE}.import.action.reportCorruption`);
    } else if (kind === 'no_private_key') {
        actions.push(`${I18N_NAMESPACE}.import.action.registerKeyring`);
    } else if (kind === 'unsupported_browser') {
        actions.push(`${I18N_NAMESPACE}.import.action.updateBrowser`);
    }

    return Object.freeze({
        errorKind: kind,
        myProfileIdMasked: maskProfileId(myProfileId),
        authorizedCountInKey: count,
        actionKeys: Object.freeze(actions),
    });
}

// ----------------------------------------------------------------
// RADAR PROFILE SECURITY BLOCK — pure state builder
// ----------------------------------------------------------------

/**
 * Classifica o status do keyring ECDH de um profile baseado em colunas
 * radar_profiles.ecdh_public_key_jwk + ecdh_registered_at.
 *
 * Regras:
 *   - publicJwk nulo/ausente → 'missing'
 *   - registeredAt > 365 dias → 'expired' (recomenda rotate)
 *   - caso contrário → 'registered'
 */
export function classifyProfileKeyringStatus(
    publicJwk: unknown,
    registeredAt: unknown,
    nowMs?: number,
): ProfileKeyringStatus {
    if (!publicJwk || typeof publicJwk !== 'object') return 'missing';
    if (typeof registeredAt !== 'string' || !registeredAt) return 'missing';
    const ts = Date.parse(registeredAt);
    if (!Number.isFinite(ts)) return 'missing';
    const now = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
    const ageMs = now - ts;
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    if (ageMs > oneYearMs) return 'expired';
    return 'registered';
}

/** Trunca um keyId para 8 chars + '…' para display compacto. */
export function truncateKeyId(keyId: unknown): string {
    if (typeof keyId !== 'string' || keyId.length === 0) return '';
    if (keyId.length <= 8) return keyId;
    return keyId.slice(0, 8) + '…';
}

/**
 * Constrói o estado do bloco "Segurança" no painel de cada radar profile.
 */
export function buildRadarProfileSecurityState(opts: {
    profileId: string;
    publicJwk?: unknown;
    keyId?: unknown;
    registeredAt?: unknown;
    nowMs?: number;
}): RadarProfileSecurityState {
    if (!opts || typeof opts.profileId !== 'string' || !opts.profileId) {
        throw new Error('[ecbtCrypto] profileId required');
    }
    const status = classifyProfileKeyringStatus(opts.publicJwk, opts.registeredAt, opts.nowMs);
    const actions: string[] = [];
    let badgeKey: string;

    if (status === 'registered') {
        badgeKey = `${I18N_NAMESPACE}.profile.badge.registered`;
        actions.push(`${I18N_NAMESPACE}.profile.action.rotate`);
        actions.push(`${I18N_NAMESPACE}.profile.action.revoke`);
    } else if (status === 'expired') {
        badgeKey = `${I18N_NAMESPACE}.profile.badge.expired`;
        actions.push(`${I18N_NAMESPACE}.profile.action.rotate`);
    } else {
        badgeKey = `${I18N_NAMESPACE}.profile.badge.missing`;
        actions.push(`${I18N_NAMESPACE}.profile.action.inviteToRegister`);
    }

    const result: any = {
        profileId: opts.profileId,
        keyringStatus: status,
        badgeLabelKey: badgeKey,
        actionKeys: Object.freeze(actions),
    };
    const truncated = truncateKeyId(opts.keyId);
    if (truncated) result.displayKeyId = truncated;
    return Object.freeze(result);
}

// ----------------------------------------------------------------
// COUNT HELPERS — para hub entry countLabel + status badge global
// ----------------------------------------------------------------

/**
 * Conta profiles por status keyring (para badge global no Status do Modelo).
 *
 * @returns { registered, missing, expired, total }
 */
export function countProfilesByKeyringStatus(
    profiles: ReadonlyArray<{ publicJwk?: unknown; registeredAt?: unknown }> | null | undefined,
    nowMs?: number,
): { registered: number; missing: number; expired: number; total: number } {
    const safe = Array.isArray(profiles) ? profiles : [];
    let registered = 0;
    let missing = 0;
    let expired = 0;
    for (const p of safe) {
        const s = classifyProfileKeyringStatus(p?.publicJwk, p?.registeredAt, nowMs);
        if (s === 'registered') registered++;
        else if (s === 'expired') expired++;
        else missing++;
    }
    return { registered, missing, expired, total: safe.length };
}
