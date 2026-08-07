// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ATTEST-001 / RF-2 — a ATESTAÇÃO genérica (os 7 eixos), para QUALQUER natureza.
 * SPEC: docs/specs/features/SPEC_ATTESTATION_MODEL.md.
 *
 * ─── Definição única ────────────────────────────────────────────────────────
 * Uma ATESTAÇÃO é: _um EMISSOR afirma uma ASSERÇÃO sobre um SUJEITO, contra um
 * ESQUEMA, com uma TEMPORALIDADE, num ESTADO do ciclo de vida, sustentada por um
 * LASTRO, com um grau de INDEPENDÊNCIA._ Sete eixos ortogonais. Nada mais é
 * estrutural; todo o resto é conteúdo.
 *
 * Este módulo é o TROFÉU (a atestação concreta de um sujeito). A RÉGUA (o esquema:
 * ISO 14001, NR-35, ART…) é o catálogo `attestation_schemes` do RF-1, para onde
 * este troféu aponta por {@link Attestation.schemeUri}.
 *
 * ─── Por que este módulo existe: o inventário de 2026-07-18 ─────────────────
 * Varredura exaustiva do repo achou **~30 atestações distintas em 24 mecanismos de
 * armazenamento que não compartilham esquema nenhum** — o mesmo conceito
 * reimplementado do zero dezenas de vezes:
 *
 *   · "emissor" tem **9 nomes**: approver · auditor · validatedBy · published_by ·
 *     reviewed_by · verified_by · actor · auditorAddress · admin_user_id
 *   · "data de emissão" tem **13 nomes**: date · auditDate · validatedAt ·
 *     issued_at · earned_at · published_at · signedAt · consent_at · verified_at ·
 *     reviewed_at · timestamp · registeredAt · checked_at
 *   · "veredito" tem **7 enums incompatíveis**: status · result · outcome ·
 *     moderation_status · allowed · valid · state
 *
 * E lacunas ESTRUTURAIS, não estéticas: `valid_until` existe em **6 de 30**,
 * revogação em **2 de 30**, trilha em **5 de 30**. É por isso que existe
 * certificado de NR-35 imortal e `.ecbt` afirmando assinatura ativa para sempre —
 * o eixo temporal simplesmente não estava lá.
 *
 * As tabelas de alias abaixo ({@link ISSUER_ALIASES} etc.) são a ponte: qualquer
 * um dos 24 mecanismos entra por {@link normalizeAttestation} e sai no shape único,
 * SEM que nenhum deles precise ser reescrito (RF-8 migra sem quebrar nada).
 *
 * ─── O que este módulo NÃO faz ──────────────────────────────────────────────
 *   · NÃO emite atestação própria nem atua como organismo certificador (não-requisito).
 *   · NÃO colapsa `status` em booleano — ver {@link AttestationStatus}.
 *   · NÃO trata ausência como `null` — ausência é estado publicado ADVERSO.
 *   · NÃO decide renderização: o gate anti-alegação-falsa é `_attestationGatePure.ts` (RF-5).
 *
 * Puro — ZERO DOM, ZERO IO, determinístico. Tudo congelado.
 * Tests: `tests/attestation-pure.test.mjs`.
 */

// ────────────────────────────────────────────────────────────────────────
// E1 — SUJEITO: o que é atestado
// ────────────────────────────────────────────────────────────────────────

/**
 * Confundir sujeito é o erro clássico e juridicamente vivo: B Corp certifica a
 * EMPRESA (nunca produto); AQUA MG2 certifica a INCORPORADORA (não a unidade);
 * selos do GHG Protocol são PROIBIDOS em produtos pela própria FGV; ISO/IEC 17067
 * Tipo 1a cobre APENAS as amostras testadas. No gêmeo digital isso vira erro
 * visual: exibir selo de organização sobre um elemento físico afirma algo falso
 * sobre aquele objeto.
 */
export type SubjectType =
    | 'organization'
    | 'site'
    | 'facility'
    | 'product'
    | 'batch'
    | 'person'
    | 'asset'
    | 'land_parcel'
    | 'document'
    | 'dataset'
    | 'measurement'
    | 'process'
    | 'management_system';

const SUBJECT_TYPES: ReadonlyArray<SubjectType> = Object.freeze([
    'organization', 'site', 'facility', 'product', 'batch', 'person', 'asset',
    'land_parcel', 'document', 'dataset', 'measurement', 'process', 'management_system',
] as const);

/** Sujeitos que representam algo FÍSICO no gêmeo — usados pelo gate de escopo (RF-5). */
export const PHYSICAL_SUBJECT_TYPES: ReadonlyArray<SubjectType> = Object.freeze([
    'site', 'facility', 'product', 'batch', 'asset', 'land_parcel',
] as const);

// ────────────────────────────────────────────────────────────────────────
// E2 — EMISSOR e independência
// ────────────────────────────────────────────────────────────────────────

/**
 * Grau de independência do atestador.
 * `first_party` = autodeclarado (o próprio sujeito afirma sobre si).
 * `second_party` = parte interessada (cliente, conselho, órgão sobre seu regulado).
 * `third_party` = terceira parte independente.
 */
export type AssessorLevel = 'first_party' | 'second_party' | 'third_party';

/**
 * Estado da acreditação de quem verificou. `unknown` é ausência de dado; os demais
 * são AFIRMAÇÕES. O selo Ouro do GHG Protocol depende exatamente disto:
 * verificador NÃO acreditado pelo INMETRO dá Prata, nunca Ouro. E a acreditação é
 * objeto independentemente mutável — o CGCRE mantém validade indeterminada MAS
 * pode cancelar escopos a qualquer tempo. O papel nunca é autoritativo; o
 * registro vivo é.
 */
export type AccreditationStatus = 'accredited' | 'not_accredited' | 'suspended' | 'withdrawn' | 'unknown';

/**
 * Os **9 nomes** que "emissor" tem hoje no repo, mapeados para o eixo único.
 * Ordem importa: o primeiro campo presente vence (mais específico primeiro).
 */
export const ISSUER_ALIASES: ReadonlyArray<string> = Object.freeze([
    'issuedBy', 'issued_by',
    'auditor', 'auditorAddress',
    'approver',
    'validatedBy', 'validated_by',
    'published_by', 'publishedBy',
    'reviewed_by', 'reviewedBy',
    'verified_by', 'verifiedBy',
    'admin_user_id', 'adminUserId',
    'actor',
] as const);

// ────────────────────────────────────────────────────────────────────────
// E4 — ASSERÇÃO
// ────────────────────────────────────────────────────────────────────────

export type AssertionKind = 'conformity' | 'level' | 'score' | 'state';

/**
 * Os **13 nomes** que "data de emissão" tem hoje no repo.
 * `timestamp` fica por último porque é o mais ambíguo (pode ser data de registro,
 * não de emissão) — qualquer campo mais específico deve vencê-lo.
 */
export const ISSUED_AT_ALIASES: ReadonlyArray<string> = Object.freeze([
    'issuedAt', 'issued_at',
    'validatedAt', 'validated_at',
    'auditDate', 'audit_date',
    'earned_at', 'earnedAt',
    'published_at', 'publishedAt',
    'signedAt', 'signed_at',
    'verified_at', 'verifiedAt',
    'reviewed_at', 'reviewedAt',
    'consent_at', 'consentAt',
    'registeredAt', 'registered_at',
    'checked_at', 'checkedAt',
    'date',
    'timestamp',
] as const);

/** Aliases de fim de vigência — o eixo ausente em 24 dos 30 mecanismos. */
export const VALID_UNTIL_ALIASES: ReadonlyArray<string> = Object.freeze([
    'validUntil', 'valid_until',
    'expiresAt', 'expires_at',
    'expiryDate', 'expiry_date',
    'effective_to', 'effectiveTo',
] as const);

// ────────────────────────────────────────────────────────────────────────
// E5 — TEMPORALIDADE
// ────────────────────────────────────────────────────────────────────────

/**
 * Os 5 arquétipos temporais INCOMPATÍVEIS. Uma tabela única com `validUntil`
 * obrigatório força INVENTAR data para um terço dos casos — e data inventada é
 * indistinguível de data real, o que é pior que ausência.
 *
 *  - `expiring`                   expira (ISO 9001/14001/45001, FSC, NR-35)
 *  - `period_scoped`              NÃO expira — atesta um PERÍODO (ISO 14064, laudo)
 *  - `per_cycle`                  NÃO expira — vale por ciclo (PBGHG, CDP, rating)
 *  - `perpetual_until_superseded` não expira (LEED BD+C, AQUA Execução, ART)
 *  - `auto_extending`             ESPECIAL — licença ambiental CONAMA 237 Art. 18:
 *                                 renovação pedida ≥120 dias antes PRORROGA
 *                                 AUTOMATICAMENTE até o órgão decidir.
 */
export type TemporalModel =
    | 'expiring'
    | 'per_cycle'
    | 'period_scoped'
    | 'perpetual_until_superseded'
    | 'auto_extending';

/**
 * Antecedência (em dias) do pedido de renovação que dispara a prorrogação
 * automática da licença. CONAMA 237/1997 Art. 18 §4º.
 */
export const AUTO_EXTENSION_REQUEST_DAYS = 120;

// ────────────────────────────────────────────────────────────────────────
// E6 — CICLO DE VIDA: estado ≠ atividade
// ────────────────────────────────────────────────────────────────────────

/**
 * Os estados NÃO colapsam, e colapsá-los perde diferença juridicamente relevante:
 *
 *   · W3C Bitstring Status List formaliza **revogação como IRREVERSÍVEL** e
 *     **suspensão como REVERSÍVEL** — por isso `revoked` e `suspended` são estados
 *     distintos e `restored` só é alcançável a partir de `suspended`.
 *   · SBTi separa `Expired` (lapso) de `Withdrawn` (voluntário) de `Removed`
 *     (**sanção por alegação enganosa**). Colapsar perde a diferença entre
 *     vencimento e FRAUDE.
 *   · ISO/IEC 17021-1 nomeia ainda ampliação e redução de escopo como transições.
 *
 * **Ausência é estado publicado ADVERSO, não `null`:** CDP "Failure to respond",
 * SBTi "Commitment Removed", Inmetro "cancelado" são o OPOSTO de "não temos dado".
 * Por isso `refused` existe como estado, e por isso {@link normalizeAttestation}
 * jamais transforma um estado adverso conhecido em `null`.
 */
export type AttestationStatus =
    | 'granted'
    | 'maintained'
    | 'renewed'
    | 'suspended'
    | 'restored'
    | 'withdrawn'
    | 'expired'
    | 'revoked'
    | 'refused';

const ATTESTATION_STATUSES: ReadonlyArray<AttestationStatus> = Object.freeze([
    'granted', 'maintained', 'renewed', 'suspended', 'restored',
    'withdrawn', 'expired', 'revoked', 'refused',
] as const);

/** Estados terminais — irreversíveis, jamais voltam a ativo. */
const TERMINAL_STATUSES: ReadonlyArray<AttestationStatus> = Object.freeze([
    'revoked', 'withdrawn', 'refused', 'expired',
] as const);

/** Escopo do estado: FSC verbatim — a suspensão pode atingir "all or part of". */
export type StatusScope = 'full' | 'partial';

/**
 * Os **7 enums de veredito incompatíveis** achados no repo, traduzidos para o eixo
 * único E6. Chaves em minúsculas.
 *
 * Nota de honestidade: booleanos (`allowed`, `valid`) NÃO carregam a diferença
 * entre vencimento e fraude — `false` vira `withdrawn` (o estado adverso mais
 * conservador que não afirma fraude), nunca `revoked`. Promover `false` a
 * `revoked` seria fabricar uma acusação que o dado de origem não sustenta.
 */
const STATUS_SYNONYMS: Readonly<Record<string, AttestationStatus>> = Object.freeze({
    // status / state
    granted: 'granted', active: 'granted', valid: 'granted', approved: 'granted',
    issued: 'granted', certified: 'granted', ok: 'granted', pass: 'granted', passed: 'granted',
    maintained: 'maintained', surveillance: 'maintained',
    renewed: 'renewed', recertified: 'renewed',
    suspended: 'suspended', paused: 'suspended', on_hold: 'suspended',
    restored: 'restored', reinstated: 'restored',
    withdrawn: 'withdrawn', cancelled: 'withdrawn', canceled: 'withdrawn',
    inactive: 'withdrawn', removed: 'withdrawn', deleted: 'withdrawn',
    expired: 'expired', lapsed: 'expired', overdue: 'expired',
    revoked: 'revoked',
    // moderation_status / outcome / result
    rejected: 'refused', refused: 'refused', denied: 'refused', failed: 'refused',
    fail: 'refused', blocked: 'refused', not_approved: 'refused',
});

// ────────────────────────────────────────────────────────────────────────
// E7 — LASTRO e proveniência
// ────────────────────────────────────────────────────────────────────────

/**
 * `verifiability` é DADO sobre o esquema, não falha do nosso registro: os registros
 * públicos são heterogêneos, migrando ou inexistentes (FSC em migração; EDGE e
 * AQUA-HQE NÃO têm registro público completo). "Não verificável por máquina"
 * precisa ser EXIBIDO como tal (gate RF-5 item c).
 */
export type Verifiability = 'machine_verifiable' | 'public_registry' | 'document_only' | 'unverifiable';

/** Tier de evidência — mesmo vocabulário do OdsStamp (`core/ods/_odsStampPure.ts`). */
export type EvidenceTier = 'measured' | 'estimated' | 'claimed' | 'absent';

/**
 * Tradução dos **10 vocabulários de confiança mutuamente intraduzíveis** do repo
 * para o tier único de E7.
 *
 * ─── Por que a tradução é DEGRADANTE por construção ───
 * Traduzir para cima é greenwashing por conversão: se `CourseTrustTier` diz
 * `self_attested`, mapear para `measured` fabricaria lastro inexistente. Toda
 * incerteza de mapeamento resolve para o tier MENOR — a mesma regra do
 * `isClaimedTierHonest` (`core/ods/_odsStampPure.ts`): uma alegação sem lastro
 * NUNCA é promovida.
 *
 * Vocabulários cobertos: EIS_CREDENTIAL_MULTIPLIERS · CREDENTIAL_LEVEL_ORDER ·
 * credential_type (SQL) · OdsStampTier · Q2Q_LEVELS · CourseTrustTier ·
 * T_AXIS_VARIABLES · EIS_VERDICTS · validatedByHuman · credentialLevel.
 */
const TIER_SYNONYMS: Readonly<Record<string, EvidenceTier>> = Object.freeze({
    // OdsStampTier (canônico)
    measured: 'measured', estimated: 'estimated', claimed: 'claimed', absent: 'absent',
    // Q2Q_LEVELS
    very_high: 'measured', high: 'measured', medium: 'estimated',
    low: 'claimed', very_low: 'claimed',
    // CourseTrustTier
    verified_first_party: 'estimated', self_attested: 'claimed',
    // credentialLevel (docs/ecbyts-model.schema.json:584 — sem enum, nada valida)
    lab: 'measured', field: 'estimated', certified: 'measured', regulatory: 'measured',
    // EIS_VERDICTS / genéricos
    verified: 'measured', declared: 'claimed', unknown: 'absent', none: 'absent',
});

// ────────────────────────────────────────────────────────────────────────
// A atestação
// ────────────────────────────────────────────────────────────────────────

/** Uma atestação normalizada. Congelada. Os 7 eixos, nada mais. */
export interface Attestation {
    // E1 — SUJEITO
    readonly subjectType: SubjectType | null;
    readonly subjectId: string | null;
    readonly subjectScopeNote: string | null;

    // E2 — EMISSOR e independência
    readonly issuedBy: string | null;
    /** DISTINTO do emissor: quem verificou pode não ser quem emitiu. */
    readonly verifiedBy: string | null;
    readonly verifierAccreditedBy: string | null;
    readonly accreditationStatus: AccreditationStatus;
    readonly assessorLevel: AssessorLevel | null;

    // E3 — ESQUEMA (aponta para o catálogo RF-1)
    readonly schemeUri: string | null;
    readonly schemeVersion: string | null;

    // E4 — ASSERÇÃO
    readonly assertionKind: AssertionKind;
    readonly levelCode: string | null;
    readonly levelRank: number | null;

    // E5 — TEMPORALIDADE
    readonly temporalModel: TemporalModel;
    readonly issuedAt: string | null;
    readonly validFrom: string | null;
    /** NULLABLE por desenho — ver {@link TemporalModel}. */
    readonly validUntil: string | null;
    readonly nextObligationDue: string | null;
    /** Data do pedido de renovação — só faz sentido em `auto_extending`. */
    readonly renewalRequestedAt: string | null;

    // E6 — CICLO DE VIDA
    readonly status: AttestationStatus;
    readonly statusScope: StatusScope;
    readonly statusReason: string | null;

    // E7 — LASTRO
    readonly evidenceTier: EvidenceTier;
    readonly evidenceUrl: string | null;
    readonly evidenceHash: string | null;
    readonly verifyUrl: string | null;
    readonly verifiability: Verifiability;

    /** Bitemporal: tempo de TRANSAÇÃO, para responder "o que exibíamos em março?". */
    readonly recordValidFrom: string | null;

    /** Campos do shape de origem que não couberam em nenhum eixo. Nunca descartados. */
    readonly unmapped: Readonly<Record<string, unknown>>;
    /** Qual perfil/mecanismo originou este registro (rastreabilidade da migração RF-8). */
    readonly sourceProfile: string | null;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers de leitura tolerante
// ────────────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readString(raw: Record<string, unknown>, key: string): string | null {
    const v = raw[key];
    if (typeof v === 'string') {
        const t = v.trim();
        return t.length > 0 ? t : null;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

/** Primeiro alias presente vence. Devolve `null` quando nenhum está presente. */
function pickAlias(raw: Record<string, unknown>, aliases: ReadonlyArray<string>): string | null {
    for (const key of aliases) {
        const found = readString(raw, key);
        if (found !== null) return found;
    }
    return null;
}

/**
 * Normaliza data para ISO-8601. Aceita ISO string, epoch ms (number) e Date.
 * Data inválida resolve para `null` — NUNCA para "agora", que fabricaria um fato.
 */
function normalizeDate(value: unknown): string | null {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (typeof value === 'string') {
        const t = value.trim();
        if (t.length === 0) return null;
        const d = new Date(t);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    return null;
}

function pickDate(raw: Record<string, unknown>, aliases: ReadonlyArray<string>): string | null {
    for (const key of aliases) {
        if (!(key in raw)) continue;
        const normalized = normalizeDate(raw[key]);
        if (normalized !== null) return normalized;
    }
    return null;
}

// ────────────────────────────────────────────────────────────────────────
// Normalizadores públicos dos vocabulários
// ────────────────────────────────────────────────────────────────────────

/**
 * Traduz qualquer um dos 7 enums de veredito para {@link AttestationStatus}.
 *
 * Booleanos entram aqui também (`allowed`/`valid`, os dois enums booleanos do
 * inventário): `true` → `granted`, `false` → `withdrawn`. Nunca `revoked`, porque
 * um booleano não sustenta a acusação de fraude que `revoked` carrega.
 *
 * Valor desconhecido resolve para `refused` quando reconhecidamente adverso, e
 * para o `fallback` (default `granted`) apenas quando o campo está AUSENTE.
 * Ausência de estado é diferente de estado desconhecido — ver `unknownIsAdverse`.
 */
export function normalizeStatus(
    raw: unknown,
    fallback: AttestationStatus = 'granted',
): AttestationStatus {
    if (raw === true) return 'granted';
    if (raw === false) return 'withdrawn';
    if (typeof raw !== 'string') return fallback;
    const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (key.length === 0) return fallback;
    const mapped = STATUS_SYNONYMS[key];
    if (mapped !== undefined) return mapped;
    // String presente mas não reconhecida: NÃO promover a `granted`. Um veredito
    // ilegível é um veredito que não podemos afirmar — degrada para `refused`.
    return 'refused';
}

/** Traduz qualquer um dos 10 vocabulários de confiança para {@link EvidenceTier}. */
export function normalizeEvidenceTier(raw: unknown, fallback: EvidenceTier = 'absent'): EvidenceTier {
    if (raw === true) return 'claimed';   // validatedByHuman: humano confirmou, sem medida
    if (raw === false) return 'absent';
    if (typeof raw !== 'string') return fallback;
    const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (key.length === 0) return fallback;
    const mapped = TIER_SYNONYMS[key];
    // Desconhecido degrada — nunca promove (regra do isClaimedTierHonest).
    return mapped !== undefined ? mapped : fallback;
}

export function normalizeSubjectType(raw: unknown): SubjectType | null {
    if (typeof raw !== 'string') return null;
    const key = raw.trim().toLowerCase();
    // Sinônimos do inventário (element/asset_id/target/document_id/user_id…).
    const alias: Readonly<Record<string, SubjectType>> = Object.freeze({
        organisation: 'organization', company: 'organization', org: 'organization',
        element: 'asset', asset_id: 'asset', target: 'asset',
        document_id: 'document', doc: 'document',
        user_id: 'person', user: 'person', worker: 'person', professional: 'person',
        building: 'facility', lab: 'facility', laboratory: 'facility',
        parcel: 'land_parcel', shipment: 'batch',
        sample: 'measurement', reading: 'measurement',
    });
    if (alias[key] !== undefined) return alias[key];
    return (SUBJECT_TYPES as ReadonlyArray<string>).includes(key) ? (key as SubjectType) : null;
}

export function normalizeAssessorLevel(raw: unknown): AssessorLevel | null {
    if (typeof raw !== 'string') return null;
    const key = raw.trim().toLowerCase();
    if (key === 'first_party' || key === 'self' || key === 'self_declared') return 'first_party';
    if (key === 'second_party') return 'second_party';
    if (key === 'third_party' || key === 'independent') return 'third_party';
    return null;
}

export function normalizeTemporalModel(raw: unknown, fallback: TemporalModel = 'expiring'): TemporalModel {
    if (typeof raw !== 'string') return fallback;
    const key = raw.trim().toLowerCase();
    const valid: ReadonlyArray<TemporalModel> = [
        'expiring', 'per_cycle', 'period_scoped', 'perpetual_until_superseded', 'auto_extending',
    ];
    return (valid as ReadonlyArray<string>).includes(key) ? (key as TemporalModel) : fallback;
}

export function normalizeVerifiability(raw: unknown, fallback: Verifiability = 'unverifiable'): Verifiability {
    if (typeof raw !== 'string') return fallback;
    const key = raw.trim().toLowerCase();
    const alias: Readonly<Record<string, Verifiability>> = Object.freeze({
        machine_verifiable: 'machine_verifiable', machine_readable_registry: 'machine_verifiable',
        public_registry: 'public_registry', registry_partial: 'public_registry',
        document_only: 'document_only', document: 'document_only',
        unverifiable: 'unverifiable', no_public_registry: 'unverifiable',
    });
    return alias[key] !== undefined ? alias[key] : fallback;
}

function normalizeAccreditationStatus(raw: unknown): AccreditationStatus {
    if (typeof raw !== 'string') return 'unknown';
    const key = raw.trim().toLowerCase();
    if (key === 'accredited' || key === 'not_accredited' || key === 'suspended' || key === 'withdrawn') {
        return key as AccreditationStatus;
    }
    return 'unknown';
}

// ────────────────────────────────────────────────────────────────────────
// normalizeAttestation — a ponte dos 24 mecanismos
// ────────────────────────────────────────────────────────────────────────

/** Todo campo que a normalização consome, para saber o que sobrou em `unmapped`. */
const CONSUMED_KEYS: ReadonlySet<string> = new Set<string>([
    ...ISSUER_ALIASES, ...ISSUED_AT_ALIASES, ...VALID_UNTIL_ALIASES,
    'subjectType', 'subject_type', 'subjectId', 'subject_id', 'element', 'elementId',
    'asset_id', 'assetId', 'document_id', 'documentId', 'user_id', 'userId', 'target',
    'subjectScopeNote', 'subject_scope_note', 'scope',
    'verifiedBy', 'verifierAccreditedBy', 'verifier_accredited_by',
    'accreditationStatus', 'accreditation_status', 'assessorLevel', 'assessor_level',
    'schemeUri', 'scheme_uri', 'schemeVersion', 'scheme_version',
    'assertionKind', 'assertion_kind', 'levelCode', 'level_code', 'level',
    'levelRank', 'level_rank',
    'temporalModel', 'temporal_model',
    'validFrom', 'valid_from', 'effective_from', 'effectiveFrom',
    'nextObligationDue', 'next_obligation_due', 'renewalRequestedAt', 'renewal_requested_at',
    'status', 'state', 'result', 'outcome', 'moderation_status', 'allowed', 'valid',
    'statusScope', 'status_scope', 'statusReason', 'status_reason', 'revoke_reason', 'revoked_at',
    'evidenceTier', 'evidence_tier', 'tier', 'credentialLevel', 'credential_level',
    'validatedByHuman', 'evidenceUrl', 'evidence_url', 'evidenceHash', 'evidence_hash',
    'verifyUrl', 'verify_url', 'registryUrl', 'registry_url',
    'verifiability', 'recordValidFrom', 'record_valid_from',
]);

/**
 * Normaliza QUALQUER um dos 24 shapes de atestação do repo para {@link Attestation}.
 *
 * Contrato de honestidade (não-negociável):
 *   · Dado ausente vira `null` — NUNCA zero, NUNCA "agora", NUNCA valor default
 *     que pareça um fato. Data inventada é indistinguível de data real.
 *   · Nada é descartado: o que não mapeia vai para {@link Attestation.unmapped}.
 *   · Nenhuma promoção: veredito ilegível degrada, tier desconhecido degrada.
 *
 * @param raw - o registro no shape de origem (qualquer um dos 24)
 * @param options.profile - nome do mecanismo de origem, para rastreabilidade RF-8
 * @param options.defaults - defaults do ESQUEMA (RF-1) quando o troféu não os traz
 */
export function normalizeAttestation(
    raw: unknown,
    options: {
        readonly profile?: string;
        readonly defaults?: {
            readonly temporalModel?: TemporalModel;
            readonly verifiability?: Verifiability;
            readonly subjectType?: SubjectType;
            readonly assessorLevel?: AssessorLevel;
            readonly assertionKind?: AssertionKind;
        };
    } = {},
): Attestation {
    const r: Record<string, unknown> = isRecord(raw) ? raw : {};
    const d = options.defaults ?? {};

    const subjectType =
        normalizeSubjectType(r['subjectType'] ?? r['subject_type']) ?? d.subjectType ?? null;

    const subjectId =
        pickAlias(r, ['subjectId', 'subject_id', 'elementId', 'element', 'asset_id', 'assetId',
            'document_id', 'documentId', 'user_id', 'userId', 'target']);

    const assertionKindRaw = readString(r, 'assertionKind') ?? readString(r, 'assertion_kind');
    const assertionKind: AssertionKind =
        assertionKindRaw === 'conformity' || assertionKindRaw === 'level'
            || assertionKindRaw === 'score' || assertionKindRaw === 'state'
            ? assertionKindRaw
            : (d.assertionKind ?? 'conformity');

    // E6 — o veredito pode vir em qualquer dos 7 campos. Primeiro presente vence.
    let statusRaw: unknown;
    for (const key of ['status', 'state', 'result', 'outcome', 'moderation_status', 'allowed', 'valid']) {
        if (key in r && r[key] !== null && r[key] !== undefined && r[key] !== '') {
            statusRaw = r[key];
            break;
        }
    }
    // Revogação explícita vence qualquer veredito: é o estado irreversível (W3C).
    const revokedAt = normalizeDate(r['revoked_at'] ?? r['revokedAt']);
    const status: AttestationStatus = revokedAt !== null ? 'revoked' : normalizeStatus(statusRaw);

    const statusScopeRaw = readString(r, 'statusScope') ?? readString(r, 'status_scope');
    const statusScope: StatusScope = statusScopeRaw === 'partial' ? 'partial' : 'full';

    // E7 — tier pode vir de qualquer dos 10 vocabulários.
    let tierRaw: unknown;
    for (const key of ['evidenceTier', 'evidence_tier', 'tier', 'credentialLevel', 'credential_level', 'validatedByHuman']) {
        if (key in r && r[key] !== null && r[key] !== undefined && r[key] !== '') {
            tierRaw = r[key];
            break;
        }
    }

    const unmapped: Record<string, unknown> = {};
    for (const key of Object.keys(r)) {
        if (!CONSUMED_KEYS.has(key)) unmapped[key] = r[key];
    }

    return Object.freeze({
        subjectType,
        subjectId,
        subjectScopeNote: pickAlias(r, ['subjectScopeNote', 'subject_scope_note', 'scope']),

        issuedBy: pickAlias(r, ISSUER_ALIASES),
        verifiedBy: pickAlias(r, ['verifiedBy', 'verified_by']),
        verifierAccreditedBy: pickAlias(r, ['verifierAccreditedBy', 'verifier_accredited_by']),
        accreditationStatus: normalizeAccreditationStatus(r['accreditationStatus'] ?? r['accreditation_status']),
        assessorLevel: normalizeAssessorLevel(r['assessorLevel'] ?? r['assessor_level']) ?? d.assessorLevel ?? null,

        schemeUri: pickAlias(r, ['schemeUri', 'scheme_uri']),
        schemeVersion: pickAlias(r, ['schemeVersion', 'scheme_version']),

        assertionKind,
        levelCode: pickAlias(r, ['levelCode', 'level_code', 'level']),
        levelRank: typeof r['levelRank'] === 'number' && Number.isFinite(r['levelRank'])
            ? (r['levelRank'] as number)
            : null,

        temporalModel: normalizeTemporalModel(r['temporalModel'] ?? r['temporal_model'], d.temporalModel ?? 'expiring'),
        issuedAt: pickDate(r, ISSUED_AT_ALIASES),
        validFrom: pickDate(r, ['validFrom', 'valid_from', 'effective_from', 'effectiveFrom']),
        validUntil: pickDate(r, VALID_UNTIL_ALIASES),
        nextObligationDue: pickDate(r, ['nextObligationDue', 'next_obligation_due']),
        renewalRequestedAt: pickDate(r, ['renewalRequestedAt', 'renewal_requested_at']),

        status,
        statusScope,
        statusReason: pickAlias(r, ['statusReason', 'status_reason', 'revoke_reason']),

        evidenceTier: normalizeEvidenceTier(tierRaw),
        evidenceUrl: pickAlias(r, ['evidenceUrl', 'evidence_url']),
        evidenceHash: pickAlias(r, ['evidenceHash', 'evidence_hash']),
        verifyUrl: pickAlias(r, ['verifyUrl', 'verify_url', 'registryUrl', 'registry_url']),
        verifiability: normalizeVerifiability(r['verifiability'], d.verifiability ?? 'unverifiable'),

        recordValidFrom: pickDate(r, ['recordValidFrom', 'record_valid_from']),

        unmapped: Object.freeze(unmapped),
        sourceProfile: options.profile ?? null,
    });
}

// ────────────────────────────────────────────────────────────────────────
// Derivação temporal — E5 × E6 ortogonais
// ────────────────────────────────────────────────────────────────────────

/** Resultado de {@link evaluateAttestation}. */
export interface AttestationEvaluation {
    /**
     * FSC verbatim: _"um certificado suspenso também é considerado **válido, mas
     * não ativo**"_. Por isso `isValid` e `isActive` são campos SEPARADOS — um
     * booleano único não expressa suspensão.
     */
    readonly isValid: boolean;
    readonly isActive: boolean;
    /** `true` só quando o arquétipo temporal admite expiração E a data passou. */
    readonly isExpired: boolean;
    /** Dias até `validUntil`; `null` quando o arquétipo não expira (não é gap). */
    readonly daysUntilExpiry: number | null;
    /** `true` quando a licença está prorrogada por CONAMA 237 Art. 18 §4º. */
    readonly isAutoExtended: boolean;
    /**
     * Por que não pôde ser avaliado, quando aplicável. `null` = avaliação
     * conclusiva. Nunca inventamos veredito por falta de dado.
     */
    readonly undeterminedReason: string | null;
}

const MS_PER_DAY = 86_400_000;

/**
 * Deriva o estado temporal REAL de uma atestação — nunca confia num booleano
 * congelado no ato da emissão.
 *
 * Este é o antídoto direto ao bug `professionalValidation`
 * (`utils/cloud/validation.ts`): gravar `subscriptionActive: true` num campo
 * booleano faz o `.ecbt` exportado afirmar assinatura ativa PARA SEMPRE, mesmo
 * depois de ela expirar. O arquivo passa a afirmar um fato que deixou de ser
 * verdade, e não há como corrigir sem reexportar. A vigência tem de ser
 * DERIVADA na leitura, a partir de datas — jamais lida de um booleano.
 *
 * @param at - instante de avaliação (ISO ou Date). Default: agora.
 */
export function evaluateAttestation(
    attestation: Attestation,
    at: string | Date = new Date(),
): AttestationEvaluation {
    const nowIso = normalizeDate(at);
    const now = nowIso !== null ? new Date(nowIso).getTime() : Number.NaN;

    const terminal = (TERMINAL_STATUSES as ReadonlyArray<string>).includes(attestation.status);
    const suspended = attestation.status === 'suspended';

    // Arquétipos que NÃO expiram (`period_scoped`, `per_cycle`,
    // `perpetual_until_superseded`): perguntar "expirou?" a eles é a pergunta errada.
    //
    // `auto_extending` EXPIRA — a licença ambiental tem data de fim como qualquer
    // outra. O que a CONAMA 237 Art. 18 §4º faz é PRORROGAR essa data quando a
    // renovação foi pedida a tempo; sem pedido tempestivo a licença vence
    // normalmente. Excluí-la daqui tornaria toda licença imortal, que é o mesmo
    // defeito do certificado de NR sem `expires_at`.
    const expires = attestation.temporalModel === 'expiring' || attestation.temporalModel === 'auto_extending';

    const untilMs = attestation.validUntil !== null ? new Date(attestation.validUntil).getTime() : Number.NaN;
    const hasUntil = Number.isFinite(untilMs);

    // auto_extending (CONAMA 237 Art. 18 §4º): pedido de renovação protocolado com
    // ≥120 dias de antecedência PRORROGA a licença até decisão do órgão. Tratar
    // como vencida seria afirmar irregularidade que a lei não sustenta.
    let isAutoExtended = false;
    if (attestation.temporalModel === 'auto_extending' && hasUntil && attestation.renewalRequestedAt !== null) {
        const requestedMs = new Date(attestation.renewalRequestedAt).getTime();
        if (Number.isFinite(requestedMs) && (untilMs - requestedMs) >= AUTO_EXTENSION_REQUEST_DAYS * MS_PER_DAY) {
            isAutoExtended = true;
        }
    }

    let undeterminedReason: string | null = null;
    if (!Number.isFinite(now)) {
        undeterminedReason = 'invalid_evaluation_instant';
    } else if (expires && !hasUntil) {
        // Arquétipo `expiring` SEM data de fim é exatamente a lacuna estrutural do
        // inventário (valid_until em 6 de 30). Não inventamos data: declaramos que
        // a vigência é indeterminada.
        undeterminedReason = 'expiring_without_valid_until';
    }

    const isExpired = expires && hasUntil && Number.isFinite(now)
        ? now > untilMs && !isAutoExtended
        : false;

    // `revoked`/`withdrawn`/`refused` são terminais. `expired` também é terminal
    // como STATUS declarado, mas a expiração por data é derivada aqui.
    const isValid = !terminal && !isExpired;
    // Ortogonal: suspenso continua VÁLIDO mas não ATIVO (FSC).
    const isActive = isValid && !suspended && undeterminedReason === null;

    const daysUntilExpiry = expires && hasUntil && Number.isFinite(now)
        ? Math.floor((untilMs - now) / MS_PER_DAY)
        : null;

    return Object.freeze({
        isValid,
        isActive,
        isExpired,
        daysUntilExpiry,
        isAutoExtended,
        undeterminedReason,
    });
}

/**
 * Rótulo honesto de vigência para exibição, quando não há verificação server-side.
 *
 * Enquanto a persistência verificável (RF-7) não existir, a UI NÃO pode afirmar
 * "ativo" — só pode afirmar o que foi constatado NA DATA da constatação. É a
 * diferença entre "válido em 18/07/2026" (verdade permanente) e "ativo" (afirmação
 * sobre o presente que o dado congelado não sustenta).
 */
export function describeValidity(attestation: Attestation, at: string | Date = new Date()): string {
    const evalResult = evaluateAttestation(attestation, at);
    if (attestation.status === 'revoked') return 'Revogado';
    if (attestation.status === 'suspended') return 'Suspenso (válido, não ativo)';
    if (attestation.status === 'withdrawn') return 'Retirado';
    if (attestation.status === 'refused') return 'Recusado';
    if (evalResult.isExpired) return 'Vencido';
    if (evalResult.isAutoExtended) return 'Prorrogado automaticamente (CONAMA 237 Art. 18)';
    if (attestation.temporalModel === 'period_scoped') return 'Atesta um período determinado';
    if (attestation.temporalModel === 'per_cycle') return 'Válido para o ciclo de divulgação';
    if (attestation.temporalModel === 'perpetual_until_superseded') return 'Vigente até ser substituído';
    if (evalResult.undeterminedReason === 'expiring_without_valid_until') {
        const when = attestation.issuedAt !== null ? attestation.issuedAt.slice(0, 10) : 'data não informada';
        return `Constatado em ${when} — vigência não informada`;
    }
    if (evalResult.daysUntilExpiry !== null && attestation.validUntil !== null) {
        return `Válido até ${attestation.validUntil.slice(0, 10)}`;
    }
    return 'Vigência não informada';
}

/** Todos os estados do ciclo de vida (E6), para validação e UI. */
export const ATTESTATION_STATUSES_ALL: ReadonlyArray<AttestationStatus> = ATTESTATION_STATUSES;
