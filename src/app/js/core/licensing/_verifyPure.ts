// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   VERIFY ENGINE — pure logic (MKT-OWNER-VERIFY-001 F2, RF-3 + RF-9)

   Motor de veredito dos DOIS lados da verificação de modelos pagos:

   OWNER (RF-3, painel "Minhas Obras") — produtor avalia uma cópia em
   circulação contra os releases das próprias obras:
     authentic_licensed | authentic_unlicensed | tampered | not_derived

   BUYER (RF-9, seção "Obras Adquiridas") — comprador consulta a
   conformidade da PRÓPRIA cópia contra as próprias licenças:
     compliant | differs_from_licensed | license_revoked | not_licensed
   (differs é INFORMATIVO, não acusatório — customização local é uso
   legítimo; só não é coberta pela verificação de origem.)

   Pure: todos os inputs injetados (decode/integridade feitos pelo
   caller via core/io + core/crypto). Sem IO, sem clock implícito.
   ================================================================ */

export interface WorkRelease {
    /** uuid do asset (libraries.id) */
    readonly assetId: string;
    readonly version: string;
    /** fingerprint sha256 hex64 do manifest canônico do release */
    readonly fingerprint: string;
}

export interface LicenseRow {
    readonly license_id: string;
    readonly asset_id: string;
    readonly buyer_pseudonym: string;
    readonly key_fingerprint: string;
    readonly fingerprint_scope: 'work_version' | 'copy';
    readonly issued_at: string;
    readonly revoked_at?: string | null;
}

const FP_RE = /^[a-f0-9]{64}$/;

// ----------------------------------------------------------------
// OWNER SIDE (RF-3)
// ----------------------------------------------------------------

export type OwnerVerdictKind = 'authentic_licensed' | 'authentic_unlicensed' | 'tampered' | 'not_derived';

export interface OwnerVerdict {
    readonly kind: OwnerVerdictKind;
    readonly assetId: string | null;
    readonly version: string | null;
    /** presentes apenas em authentic_licensed */
    readonly licensedTo: string | null;
    readonly issuedAt: string | null;
    readonly reason: string;
}

/**
 * Veredito do produtor sobre uma cópia em circulação.
 *
 * @param input.copyFingerprint  sha256 do manifest canônico da cópia colada
 * @param input.integrityOk      assinatura/cadeia íntegra? (false quando o
 *                               decode/verify do caller detectou adulteração;
 *                               true para conteúdo sem assinatura própria em
 *                               F1 — o fingerprint é a âncora de origem)
 * @param input.ownerReleases    releases das obras DO AUTOR LOGADO
 * @param input.licenses         licenças das obras do autor (RLS já filtrou)
 */
export function buildOwnerVerdict(input: {
    copyFingerprint: string;
    integrityOk: boolean;
    ownerReleases: readonly WorkRelease[];
    licenses: readonly LicenseRow[];
}): OwnerVerdict {
    const fp = String(input.copyFingerprint || '').toLowerCase();
    if (!FP_RE.test(fp)) {
        return Object.freeze({
            kind: 'not_derived' as const,
            assetId: null, version: null, licensedTo: null, issuedAt: null,
            reason: 'fingerprint inválido (esperado sha256 hex64)',
        });
    }
    const release = (input.ownerReleases || []).find((r) => r.fingerprint === fp);
    if (!release) {
        // Cópia não casa com nenhum release do autor. Se a integridade
        // quebrou, é adulteração de ALGO — mas sem casar com obra do
        // autor o veredito honesto é not_derived (pode ser obra alheia).
        return Object.freeze({
            kind: 'not_derived' as const,
            assetId: null, version: null, licensedTo: null, issuedAt: null,
            reason: 'não corresponde a nenhum release das suas obras',
        });
    }
    if (!input.integrityOk) {
        return Object.freeze({
            kind: 'tampered' as const,
            assetId: release.assetId, version: release.version,
            licensedTo: null, issuedAt: null,
            reason: 'corresponde à obra mas a verificação de integridade falhou (assinatura/cadeia quebrada)',
        });
    }
    const lic = (input.licenses || []).find(
        (l) => l.asset_id === release.assetId && l.key_fingerprint === fp && !l.revoked_at,
    );
    if (lic) {
        return Object.freeze({
            kind: 'authentic_licensed' as const,
            assetId: release.assetId, version: release.version,
            licensedTo: lic.buyer_pseudonym, issuedAt: lic.issued_at,
            reason: 'cópia autêntica com licença ativa',
        });
    }
    return Object.freeze({
        kind: 'authentic_unlicensed' as const,
        assetId: release.assetId, version: release.version,
        licensedTo: null, issuedAt: null,
        reason: 'deriva da sua obra mas nenhuma licença ativa cobre esta cópia',
    });
}

// ----------------------------------------------------------------
// BUYER SIDE (RF-9 — "Obras Adquiridas")
// ----------------------------------------------------------------

export type BuyerVerdictKind = 'compliant' | 'differs_from_licensed' | 'license_revoked' | 'not_licensed';

export interface BuyerVerdict {
    readonly kind: BuyerVerdictKind;
    readonly licenseId: string | null;
    readonly assetId: string | null;
    readonly reason: string;
    /** differs é informativo — UI NÃO deve tratar como infração */
    readonly accusatory: false;
}

/**
 * Conformidade da PRÓPRIA cópia do comprador contra as PRÓPRIAS licenças.
 *
 * @param input.localFingerprint sha256 do manifest canônico da cópia local
 * @param input.assetId          obra que o comprador quer conferir
 * @param input.myLicenses       licenças DO COMPRADOR (RLS pml_buyer_read)
 */
export function buildBuyerVerdict(input: {
    localFingerprint: string;
    assetId: string;
    myLicenses: readonly LicenseRow[];
}): BuyerVerdict {
    const fp = String(input.localFingerprint || '').toLowerCase();
    const forAsset = (input.myLicenses || []).filter((l) => l.asset_id === input.assetId);
    if (forAsset.length === 0) {
        return Object.freeze({
            kind: 'not_licensed' as const,
            licenseId: null, assetId: input.assetId,
            reason: 'nenhuma licença sua cobre esta obra',
            accusatory: false as const,
        });
    }
    const active = forAsset.filter((l) => !l.revoked_at);
    if (active.length === 0) {
        return Object.freeze({
            kind: 'license_revoked' as const,
            licenseId: forAsset[0]!.license_id, assetId: input.assetId, // forAsset não-vazio (guard acima)
            reason: 'sua licença desta obra foi revogada — contate o suporte/produtor',
            accusatory: false as const,
        });
    }
    const matching = active.find((l) => l.key_fingerprint === fp);
    if (matching) {
        return Object.freeze({
            kind: 'compliant' as const,
            licenseId: matching.license_id, assetId: input.assetId,
            reason: 'cópia em conformidade: licença ativa e conteúdo idêntico ao licenciado',
            accusatory: false as const,
        });
    }
    return Object.freeze({
        kind: 'differs_from_licensed' as const,
        licenseId: active[0]!.license_id, assetId: input.assetId, // active não-vazio (return em 164)
        reason: 'sua cópia difere do conteúdo licenciado (customização local é legítima; ' +
            'a versão modificada apenas não é coberta pela verificação de origem)',
        accusatory: false as const,
    });
}
