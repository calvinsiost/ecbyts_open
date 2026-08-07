// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ATTEST-001 RF-5 wire — adapter da estampa `certification` (CERT-STAMPS-001) para
 * a `Attestation` universal (ATTEST-001 RF-2), de forma que o gate universal
 * `classifyAttestation` possa classificá-la.
 *
 * ─── Por que este adapter existe ─────────────────────────────────────────────
 * A estampa `certification` (em `utils/stamps/types.ts > REPORTING_STAMP_TYPES`)
 * é o PERFIL AMBIENTAL histórico: tem shape próprio, com campos como
 * `subjectType: 'organisation' | 'site' | 'product' | ...` (britânico) e
 * `assessorLevel: 'first_party' | 'second_party' | 'third_party'`.
 *
 * A `Attestation` universal (RF-2) reconcilia os ~30 shapes de atestação do repo
 * num único modelo de 7 eixos. O gate universal `classifyAttestation` opera sobre
 * `Attestation` — não sobre o shape da estampa `certification`.
 *
 * Este adapter é a PONTE: lê o `value` da estampa `certification` e devolve uma
 * `Attestation` normalizada pronta para o gate. É PURA lógica — zero DOM, zero IO.
 *
 * ─── Mapeamento de campos ────────────────────────────────────────────────────
 * O shape da estampa `certification` (types.ts) já cobre a maioria dos eixos:
 *   - subjectType → E1 (sujeito) — alias 'organisation' → 'organization'
 *   - issuedBy → E2 (emissor)
 *   - verifiedBy, verifierAccreditedBy, accreditationStatus → E2 (independência)
 *   - assessorLevel → E2 (grau de independência)
 *   - schemeUri, schemeVersion → E3 (esquema)
 *   - attestationType → E4 (asserção) — mapeado para assertionKind
 *   - validFrom, validUntil, issuedAt → E5 (temporalidade)
 *   - status → E6 (ciclo de vida) — normalizado via normalizeStatus
 *   - isActive → E6 (ortogonal a status, ver evaluateAttestation)
 *   - evidenceUrl, evidenceHash, verifyUrl → E7 (lastro)
 *
 * Campos que não existem na estampa mas têm default seguro:
 *   - temporalModel: inferido de validUntil presente/ausente
 *   - verifiability: default 'unverifiable' (conservador — sem registro público)
 *   - evidenceTier: default 'claimed' (a estampa é uma alegação, não uma medida)
 *
 * Tests: `tests/stamp-certification-adapter.test.mjs`.
 */

import type { Attestation } from './_attestationPure.js';
import {
    normalizeAttestation,
    type SubjectType,
} from './_attestationPure.js';

/**
 * Shape do `value` de uma estampa `certification` (espelha
 * `REPORTING_STAMP_TYPES.certification.schema` em `utils/stamps/types.ts`).
 * Mantido solto para evitar acoplamento — se campos forem adicionados ali,
 * isto continua válido (camços extra vão para `unmapped`).
 */
export interface CertificationStampValue {
    readonly schemeUri?: string;
    readonly schemeVersion?: string;
    readonly certificateId?: string;
    readonly licenceId?: string;
    readonly issuedBy?: string;
    readonly verifiedBy?: string;
    readonly verifierAccreditedBy?: string;
    readonly accreditationStatus?: string;
    readonly assessorLevel?: string;
    readonly attestationType?: string;
    readonly subjectType?: string;
    readonly subjectId?: string;
    readonly scopeStatement?: string;
    readonly scopeSites?: unknown;
    readonly validFrom?: string;
    readonly validUntil?: string;
    readonly subjectPeriodStart?: string;
    readonly subjectPeriodEnd?: string;
    readonly issuedAt?: string;
    readonly publishedAt?: string;
    readonly auditDate?: string;
    readonly status?: string;
    readonly isActive?: boolean;
    readonly statusScope?: string;
    readonly levelCode?: string;
    readonly levelRank?: number;
    readonly levelVector?: unknown;
    readonly cocModel?: string;
    readonly evidenceUrl?: string;
    readonly evidenceHash?: string;
    readonly verifyUrl?: string;
    readonly supersedes?: string;
    readonly supersededBy?: string;
    readonly recordValidFrom?: string;
    readonly recordValidTo?: string;
    readonly [key: string]: unknown;
}

/**
 * Traduz o `subjectType` britânico da estampa `certification` ('organisation')
 * para o vocabulário americano da `Attestation` ('organization').
 */
function normalizeCertSubjectType(raw: string | undefined): SubjectType | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim().toLowerCase();
    // Alias específico da estampa: 'organisation' (britânico) → 'organization'
    if (trimmed === 'organisation') return 'organization';
    // Demais valores: deixa o normalizador universal tratar
    const alias: Readonly<Record<string, SubjectType>> = Object.freeze({
        building: 'facility',
        shipment: 'batch',
    });
    if (alias[trimmed] !== undefined) return alias[trimmed];
    // Tipos que já batem 1:1 com SubjectType
    const direct: ReadonlyArray<SubjectType> = [
        'organization', 'site', 'facility', 'product', 'batch', 'person',
        'asset', 'land_parcel', 'document', 'dataset', 'measurement',
        'process', 'management_system',
    ];
    return (direct as ReadonlyArray<string>).includes(trimmed)
        ? (trimmed as SubjectType)
        : null;
}

/**
 * Infere o modelo temporal a partir da presença de `validUntil`.
 * - Com `validUntil`: `expiring` (a regra default).
 * - Sem `validUntil`: `perpetual_until_superseded` (não expira — LEED BD+C, AQUA).
 */
function inferTemporalModel(value: CertificationStampValue): 'expiring' | 'perpetual_until_superseded' {
    const hasUntil = typeof value.validUntil === 'string' && value.validUntil.trim().length > 0;
    return hasUntil ? 'expiring' : 'perpetual_until_superseded';
}

/**
 * Converte o `value` de uma estampa `certification` para uma `Attestation`
 * normalizada, pronta para `classifyAttestation`.
 *
 * @param value - O `stamp.value` de uma estampa tipo `certification`.
 * @returns `Attestation` normalizada (congelada, determinística).
 */
export function stampCertificationValueToAttestation(value: CertificationStampValue): Attestation {
    const subjectType = normalizeCertSubjectType(value.subjectType);
    const temporalModel = inferTemporalModel(value);

    // O normalizador universal já lida com aliases de emissor, data e status.
    // Passamos defaults derivados da estampa para garantir coerência.
    return normalizeAttestation(value, {
        profile: 'certification-stamp',
        defaults: {
            temporalModel,
            // Conservador: sem registro público conhecido, a estampa é não verificável.
            verifiability: 'unverifiable',
            // exactOptionalPropertyTypes: omite a chave (em vez de `undefined`) quando ausente.
            ...(subjectType !== null ? { subjectType } : {}),
            assessorLevel: value.assessorLevel as never,
            // A estampa é uma alegação de conformidade (não uma medição).
            assertionKind: 'conformity',
        },
    });
}