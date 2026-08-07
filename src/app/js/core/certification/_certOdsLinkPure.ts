// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * CERT-STAMPS-001 / RF-4 — vínculo selo→meta ODS como `contributes_to`.
 * SPEC: docs/specs/features/SPEC_ENVIRONMENTAL_CERTIFICATION_STAMPS.md §5 + RF-4.
 *
 * ─── Por que esta aresta existe como entidade separada (SPEC §5) ───
 * Não existe mapeamento canônico certificação→ODS. O mais próximo (ITC Standards
 * Map) vincula no nível de **meta** (target), não de Goal — goal-level é onde
 * vive o SDG-washing (Heras-Saizarbitoria et al. 2022). Por isso a aresta aqui é
 * `contributes_to` (nunca `achieves`): metas e indicadores ODS foram desenhados
 * para balanço NACIONAL; um certificado de projeto subnacional CONTRIBUI, não
 * cumpre. Afirmar `achieves` seria green-washing estrutural.
 *
 * ─── Discriminador de framework (SPEC §5) ───
 * O Brasil adaptou 124 das 169 metas relevantes (IPEA). `un_global` x `br_ipea`
 * distingue a meta global da nacional adaptada — não são intercambiáveis.
 *
 * ─── PURL, não inteiro (SPEC §5) ───
 * Namespace `http://metadata.un.org/sdg/` + SDGIO. O PURL é resolvível e estável;
 * um inteiro ("6.3") colide entre frameworks e perde a proveniência.
 *
 * ─── Reuso direto (SPEC §5) ───
 * O registry ODS (`data/ods-indicators.json`, 251 indicadores oficiais) é o alvo
 * do vínculo. O `target` do indicador (ex: "6.3") é a meta. O tier de evidência
 * e o gate `isClaimedTierHonest` valem igual aqui: uma contribuição `measured`
 * sem `evidenceRef` é desonestamente声称.
 *
 * Puro — ZERO DOM, ZERO IO, determinístico. Tudo congelado.
 */

/** Tier de evidência, mesmo vocabulário de `_odsStampPure.ts`. */
export type ContributionTier = 'measured' | 'estimated' | 'claimed' | 'absent';

/** Discriminador de framework ODS (SPEC §5). */
export type OdsFramework = 'un_global' | 'br_ipea';

/**
 * A RESTA é SEMPRE `contributes_to`. `achieves` é proibido por design (SPEC §5):
 * metas ODS são de balanço nacional; projeto subnacional contribui, não cumpre.
 * O tipo union com 1 membro força o literal no código — `achieves` não compila.
 */
export type ContributionRelation = 'contributes_to';

/** Força do vínculo: 0..1 (0 = nulo, 1 = contribuição direta e total para a meta). */
export type ContributionStrength = number;

/** Injectable gate de honestidade do tier (espelho de `_odsStampPure.ts`). */
export type TierHonestyValidator = (tier: ContributionTier, evidenceRef: string | null) => boolean;

/** Aresta imutável: certificação → meta ODS. */
export interface CertOdsContribution {
    /** URI do esquema de certificação (liga ao catálogo RF-1). */
    readonly schemeUri: string;
    /** Código da meta ODS (ex: "6.3"), derivado do `target` do indicador. */
    readonly odsTargetCode: string;
    /** PURL resolvível da meta (ex: "http://metadata.un.org/sdg/6.3"). */
    readonly odsTargetPurl: string;
    /** Framework: global x Brasil adaptado (IPEA). */
    readonly framework: OdsFramework;
    /** Sempre `contributes_to`. `achieves` é green-washing (SPEC §5). */
    readonly relation: ContributionRelation;
    /** Força do vínculo (0..1). */
    readonly strength: ContributionStrength;
    /** Tier de evidência congelado no ato do vínculo. */
    readonly tier: ContributionTier;
    /** Referência à prova que sustenta o tier, ou null para claimed/absent. */
    readonly evidenceRef: string | null;
    /** ISO-8601 de quando o vínculo foi criado. */
    readonly linkedAt: string;
    /** Quem criou o vínculo (user/agent id, 'system'). */
    readonly linkedBy: string;
}

/** Resultado da criação: ou a aresta, ou a razão da rejeição (never throws). */
export type CreateContributionResult =
    | { readonly ok: true; readonly contribution: CertOdsContribution }
    | { readonly ok: false; readonly reason: string };

/** Resultado da validação de shape. */
export interface ValidateContributionResult {
    readonly ok: boolean;
    readonly reason?: string;
}

/** Namespace PURL oficial da ONU para metas ODS (SPEC §5). */
export const UN_SDG_PURL_NAMESPACE = 'http://metadata.un.org/sdg/';

const VALID_TIERS: ReadonlyArray<ContributionTier> = ['measured', 'estimated', 'claimed', 'absent'];
const VALID_FRAMEWORKS: ReadonlyArray<OdsFramework> = ['un_global', 'br_ipea'];
/** Código de meta: "G.T" onde G é goal 1..17 e T é alnum (ex: "6.3", "12.a", "17.16"). */
const TARGET_CODE_RE = /^\d{1,2}\.[a-zA-Z0-9]{1,3}$/;

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Gate conservador de honestidade do tier (espelho de `_odsStampPure.ts`):
 * `measured` ou `estimated` EXIGEM `evidenceRef` não-vazio; `claimed` e
 * `absent` nunca exigem (declaração sem lastro / ausência).
 */
function isClaimedTierHonestDefault(tier: ContributionTier, evidenceRef: string | null): boolean {
    if (tier === 'measured' || tier === 'estimated') {
        return isNonEmptyString(evidenceRef);
    }
    return true;
}

/**
 * Constrói o PURL resolvível da meta ODS.
 * @param targetCode ex: "6.3"
 * @param framework `un_global` usa namespace da ONU; `br_ipea` anota o adaptador nacional.
 */
export function odsTargetPurl(targetCode: string, framework: OdsFramework): string {
    if (framework === 'br_ipea') {
        // O Brasil não tem PURL próprio; o namespace da ONU é a âncora e o
        // framework `br_ipea` distingue a meta ADAPTADA (124 das 169 alteradas).
        return `${UN_SDG_PURL_NAMESPACE}${targetCode}#br_ipea`;
    }
    return `${UN_SDG_PURL_NAMESPACE}${targetCode}`;
}

/** Valida o shape de uma contribuição sem tocar no registry de certificação. */
function validateContributionShape(c: Partial<CertOdsContribution>): ValidateContributionResult {
    if (!isNonEmptyString(c.schemeUri)) {
        return { ok: false, reason: 'schemeUri ausente ou vazio' };
    }
    if (!isNonEmptyString(c.odsTargetCode) || !TARGET_CODE_RE.test(c.odsTargetCode)) {
        return { ok: false, reason: `odsTargetCode fora do padrão G.T: ${String(c.odsTargetCode)}` };
    }
    if (!isNonEmptyString(c.odsTargetPurl)) {
        return { ok: false, reason: 'odsTargetPurl ausente ou vazio' };
    }
    if (typeof c.framework !== 'string' || !VALID_FRAMEWORKS.includes(c.framework as OdsFramework)) {
        return { ok: false, reason: `framework inválido: ${String(c.framework)}` };
    }
    if (c.relation !== 'contributes_to') {
        return { ok: false, reason: `relation deve ser 'contributes_to' (nunca achieves): ${String(c.relation)}` };
    }
    if (typeof c.strength !== 'number' || !Number.isFinite(c.strength) || c.strength < 0 || c.strength > 1) {
        return { ok: false, reason: `strength deve ser número finito em [0,1]: ${String(c.strength)}` };
    }
    if (typeof c.tier !== 'string' || !VALID_TIERS.includes(c.tier as ContributionTier)) {
        return { ok: false, reason: `tier inválido: ${String(c.tier)}` };
    }
    if (c.evidenceRef !== null && c.evidenceRef !== undefined && typeof c.evidenceRef !== 'string') {
        return { ok: false, reason: 'evidenceRef deve ser string ou null' };
    }
    if (!isNonEmptyString(c.linkedAt) || Number.isNaN(Date.parse(c.linkedAt))) {
        return { ok: false, reason: 'linkedAt ausente ou não é data ISO válida' };
    }
    if (!isNonEmptyString(c.linkedBy)) {
        return { ok: false, reason: 'linkedBy ausente ou vazio' };
    }
    return { ok: true };
}

/** Opções de `createCertOdsContribution`. */
export interface CreateContributionOptions {
    readonly linkedBy?: string;
    readonly at?: string;
    readonly isTierHonest?: TierHonestyValidator;
}

/**
 * Cria uma aresta imutável certificação→meta ODS. Rejeita (never throws) quando:
 *   - `relation` é `achieves` (PROIBIDO — green-washing, SPEC §5);
 *   - `targetCode` não bate no padrão "G.T" (meta, não indicador);
 *   - `strength` está fora de [0,1];
 *   - o `tier` declarado não é honesto dado o `evidenceRef` (gate conservador).
 *
 * `odsTargetPurl` é derivado automaticamente se omitido (usa `framework`).
 */
export function createCertOdsContribution(
    input: {
        readonly schemeUri: string;
        readonly odsTargetCode: string;
        readonly framework: OdsFramework;
        readonly relation: ContributionRelation;
        readonly strength: ContributionStrength;
        readonly tier: ContributionTier;
        readonly evidenceRef?: string | null;
        readonly odsTargetPurl?: string;
    },
    options?: CreateContributionOptions,
): CreateContributionResult {
    const evidenceRef = isNonEmptyString(input.evidenceRef) ? (input.evidenceRef as string).trim() : null;

    const honestyGate = options?.isTierHonest ?? isClaimedTierHonestDefault;
    if (!honestyGate(input.tier, evidenceRef)) {
        return {
            ok: false,
            reason: `tier '${input.tier}' não é sustentado pela evidência (evidenceRef: ${evidenceRef ?? 'null'})`,
        };
    }

    const linkedAt = isNonEmptyString(options?.at) ? (options!.at as string) : new Date().toISOString();
    if (Number.isNaN(Date.parse(linkedAt))) {
        return { ok: false, reason: `at não é uma data ISO válida: ${options?.at}` };
    }
    const linkedBy = isNonEmptyString(options?.linkedBy) ? (options!.linkedBy as string) : 'system';

    const resolvedPurl = isNonEmptyString(input.odsTargetPurl)
        ? (input.odsTargetPurl as string)
        : odsTargetPurl(input.odsTargetCode, input.framework);

    const candidate: CertOdsContribution = Object.freeze({
        schemeUri: input.schemeUri,
        odsTargetCode: input.odsTargetCode,
        odsTargetPurl: resolvedPurl,
        framework: input.framework,
        relation: input.relation,
        strength: input.strength,
        tier: input.tier,
        evidenceRef,
        linkedAt,
        linkedBy,
    });

    const shape = validateContributionShape(candidate);
    if (!shape.ok) return { ok: false, reason: shape.reason ?? 'shape inválido' };

    return { ok: true, contribution: candidate };
}

/**
 * Valida uma contribuição existente (deserializada/legacy). Shape sempre;
 * honestidade do tier só quando `isTierHonest` é fornecido.
 */
export function validateContribution(
    c: Partial<CertOdsContribution>,
    options?: { readonly isTierHonest?: TierHonestyValidator },
): ValidateContributionResult {
    const shape = validateContributionShape(c);
    if (!shape.ok) return shape;

    const honestyGate = options?.isTierHonest ?? isClaimedTierHonestDefault;
    if (!honestyGate(c.tier as ContributionTier, (c.evidenceRef ?? null) as string | null)) {
        return {
            ok: false,
            reason: `tier '${c.tier}' não é sustentado pela evidência (evidenceRef: ${c.evidenceRef ?? 'null'})`,
        };
    }
    return { ok: true };
}

/** Exportado para testes e callers que querem o gate padrão. */
export const defaultTierHonestyGate = isClaimedTierHonestDefault;