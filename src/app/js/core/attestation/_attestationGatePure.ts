// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ATTEST-001 / RF-5 — GATE UNIVERSAL anti-alegação-falsa. **Não-negociável.**
 * SPEC: docs/specs/features/SPEC_ATTESTATION_MODEL.md § "Gate universal".
 *
 * ─── Escopo: QUALQUER natureza, não só ambiental ────────────────────────────
 * Generaliza o gate anti-greenwashing de `core/certification/_antiGreenwashPure.ts`
 * (que é o **perfil ambiental**, e continua válido) para toda atestação: selo
 * ambiental, curso autoatestado, autoavaliação de conformidade, badge de
 * reputação, certificado de NR, laudo de laboratório, licença.
 *
 * Os quatro requisitos, verbatim da spec:
 *   (a) `assessor_level = first_party` (autodeclarado) renderiza **visualmente
 *       distinto** de terceira parte.
 *   (b) O **escopo (E1) aparece sempre junto** da atestação — nunca exibir
 *       atestação de organização sobre um elemento físico como se fosse dele.
 *   (c) `verifiability = unverifiable` é exibido **como tal**.
 *   (d) **Nunca promover no display** (mesmo princípio do `isClaimedTierHonest`
 *       de `core/ods/_odsStampPure.ts`).
 *
 * ─── Isso é regulatório, não estético ───────────────────────────────────────
 * A Diretiva (UE) 2024/825 (EmpCo) torna, **a partir de 27/09/2026**, exibir
 * rótulo de sustentabilidade sem base em esquema de certificação uma prática
 * desleal **per se** — multa até **4% do faturamento**. E já há condenação real:
 * Tribunal de Paris × TotalEnergies (23/10/2025); e o BGH alemão sobre
 * "klimaneutral" (27/06/2024) exigiu o esclarecimento **no próprio anúncio, não
 * atrás de um QR code** — motivo pelo qual {@link GateClassification.disclaimerText}
 * é conteúdo obrigatório inline, jamais um link.
 *
 * ─── O invariante que sobe de `creditVerifier` ──────────────────────────────
 * `core/credits/creditVerifier.ts:39-49` (`verifyAuditorAttestation`) é hoje o
 * **único lugar do app com regra de independência do atestador** — rejeita
 * `auditorAddress === holder` com `auditor_conflict_of_interest`. Parece
 * específico de créditos de carbono, mas é o invariante genérico
 * **`issuer ≠ subject`**, e por isso sobe para cá como
 * {@link checkIssuerIndependence}, aplicável a qualquer natureza.
 *
 * Puro — ZERO DOM, ZERO IO, determinístico. Tudo congelado.
 * Tests: `tests/attestation-gate-pure.test.mjs`.
 */

import type { Attestation, AssessorLevel, SubjectType, Verifiability } from './_attestationPure.js';
import { PHYSICAL_SUBJECT_TYPES, evaluateAttestation } from './_attestationPure.js';

// ────────────────────────────────────────────────────────────────────────
// Tiers de renderização
// ────────────────────────────────────────────────────────────────────────

/**
 * Como a atestação PODE ser renderizada. É um teto, nunca um piso: a UI pode
 * exibir menos, jamais mais.
 *
 *  - `attested`     terceira parte com acreditação verificável. ÚNICO tier que
 *                   pode usar o visual de "selo" (escudo, verde).
 *  - `declared`     declaração de terceira/segunda parte sem acreditação
 *                   comprovada, ou verificável só por documento. Visual neutro
 *                   (azul), sem selo verde.
 *  - `self_declared` autodeclarado (first_party) ou sem esquema. SEMPRE degradado:
 *                   cinza, borda tracejada, rodapé obrigatório.
 *  - `adverse`      estado publicado ADVERSO (revogado/recusado/retirado/vencido).
 *                   Não é ausência de dado — é um fato negativo que DEVE aparecer.
 */
export type RenderTier = 'attested' | 'declared' | 'self_declared' | 'adverse';

/** Resultado do gate. A UI consome isto; não reimplementa a decisão. */
export interface GateClassification {
    readonly renderTier: RenderTier;
    /** Classe CSS raiz (ex.: `attestation--self_declared`). */
    readonly cssClass: string;
    /** (a) TRUE quando a atestação é autodeclarada e precisa de tratamento distinto. */
    readonly isSelfDeclared: boolean;
    /** (b) Rótulo do escopo (E1). NUNCA vazio — "não informado" também é informação. */
    readonly scopeLabel: string;
    /** (b) TRUE quando o sujeito atestado não é o objeto sobre o qual se exibe. */
    readonly scopeMismatch: boolean;
    readonly scopeMismatchWarning: string;
    /** (c) TRUE quando `verifiability = unverifiable` e isso precisa ser dito. */
    readonly isUnverifiable: boolean;
    readonly verifiabilityLabel: string;
    /** Rodapé obrigatório INLINE (BGH: não atrás de QR code). Vazio se dispensável. */
    readonly requiresDisclaimer: boolean;
    readonly disclaimerText: string;
    /** Motivos legíveis de cada degradação aplicada — auditável, nunca silenciosa. */
    readonly degradedBecause: ReadonlyArray<string>;
    /** TRUE quando o gate proíbe QUALQUER exibição promocional (selo/verde/3D). */
    readonly blockPromotionalDisplay: boolean;
}

const SCOPE_LABELS: Readonly<Record<SubjectType, string>> = Object.freeze({
    organization: 'Organização',
    site: 'Site',
    facility: 'Instalação',
    product: 'Produto',
    batch: 'Lote',
    person: 'Pessoa',
    asset: 'Ativo',
    land_parcel: 'Parcela de terra',
    document: 'Documento',
    dataset: 'Conjunto de dados',
    measurement: 'Medição',
    process: 'Processo',
    management_system: 'Sistema de gestão',
});

const VERIFIABILITY_LABELS: Readonly<Record<Verifiability, string>> = Object.freeze({
    machine_verifiable: 'Verificável automaticamente',
    public_registry: 'Verificável em registro público',
    document_only: 'Verificável apenas por documento',
    unverifiable: 'Não verificável de forma independente',
});

/**
 * Sujeitos que atestam uma ENTIDADE ABSTRATA (organização, sistema de gestão,
 * processo). Exibi-los sobre um elemento físico é a armadilha clássica — B Corp
 * certifica a empresa e não o produto; AQUA MG2 certifica a incorporadora e não a
 * unidade; selos do GHG Protocol são PROIBIDOS em produtos pela própria FGV.
 */
const ABSTRACT_SUBJECT_TYPES: ReadonlyArray<SubjectType> = Object.freeze([
    'organization', 'management_system', 'process',
] as const);

// ────────────────────────────────────────────────────────────────────────
// (a)+(c)+(d) — classificação
// ────────────────────────────────────────────────────────────────────────

/**
 * Classifica uma atestação para renderização. É a função MAIN do gate RF-5.
 *
 * @param attestation - atestação já normalizada (RF-2)
 * @param options.displayedOnSubjectType - sobre QUE tipo de objeto a UI vai
 *   desenhar isto. Necessário para o requisito (b): sem saber onde o selo será
 *   afixado, não dá para detectar o mismatch de escopo.
 * @param options.at - instante de avaliação (default: agora)
 */
export function classifyAttestation(
    attestation: Attestation,
    options: {
        readonly displayedOnSubjectType?: SubjectType | null;
        readonly at?: string | Date;
    } = {},
): GateClassification {
    const degraded: string[] = [];
    const evaluation = evaluateAttestation(attestation, options.at ?? new Date());

    // ── (a) autodeclaração ───────────────────────────────────────────────────
    // Ausência de `assessorLevel` NÃO pode ser tratada como terceira parte: sem
    // declaração explícita de independência, o conservador é autodeclarado.
    // Presumir terceira parte por omissão é exatamente como o falso-verde entra.
    const assessor: AssessorLevel | null = attestation.assessorLevel;
    const isSelfDeclared = assessor === 'first_party' || assessor === null;
    if (assessor === 'first_party') {
        degraded.push('assessor_level=first_party (autodeclarado)');
    } else if (assessor === null) {
        degraded.push('assessor_level ausente — tratado como autodeclarado (conservador)');
    }

    // Sem esquema não há certificação — é exatamente o ilícito per se da EmpCo.
    const hasScheme = typeof attestation.schemeUri === 'string' && attestation.schemeUri.length > 0;
    if (!hasScheme) {
        degraded.push('sem scheme_uri — não há esquema de certificação por trás da alegação');
    }

    const accredited = attestation.accreditationStatus === 'accredited';
    if (attestation.accreditationStatus === 'suspended' || attestation.accreditationStatus === 'withdrawn') {
        degraded.push(`acreditação do verificador ${attestation.accreditationStatus}`);
    }

    // ── (c) verificabilidade ─────────────────────────────────────────────────
    const isUnverifiable = attestation.verifiability === 'unverifiable';
    if (isUnverifiable) {
        degraded.push('verifiability=unverifiable');
    }

    // ── E6 — estado adverso é FATO, não ausência ─────────────────────────────
    const adverse =
        attestation.status === 'revoked'
        || attestation.status === 'refused'
        || attestation.status === 'withdrawn'
        || attestation.status === 'expired'
        || evaluation.isExpired;

    // ── renderTier: nunca promove (d) ────────────────────────────────────────
    let renderTier: RenderTier;
    if (adverse) {
        // Estado adverso domina tudo. Um objeto revogado ainda "verde" é o PIOR
        // modo de falha deste produto (não-requisito explícito da spec).
        renderTier = 'adverse';
        degraded.push(`estado adverso: ${attestation.status}`);
    } else if (isSelfDeclared || !hasScheme) {
        renderTier = 'self_declared';
    } else if (assessor === 'third_party' && accredited && !isUnverifiable) {
        renderTier = 'attested';
    } else {
        // Terceira/segunda parte sem acreditação comprovada, ou não verificável:
        // degrada para declaração. NUNCA promove a `attested`.
        renderTier = 'declared';
        if (assessor === 'third_party' && !accredited) {
            degraded.push('terceira parte sem acreditação comprovada — degradado a declaração');
        }
    }

    // Suspensão: válido mas NÃO ativo (FSC verbatim). Nunca renderiza como selo.
    if (attestation.status === 'suspended' && renderTier === 'attested') {
        renderTier = 'declared';
        degraded.push('suspenso — válido, mas não ativo (FSC)');
    }

    // ── (b) escopo ───────────────────────────────────────────────────────────
    const scopeLabel = attestation.subjectType !== null
        ? SCOPE_LABELS[attestation.subjectType]
        : 'Escopo não informado';

    const displayedOn = options.displayedOnSubjectType ?? null;
    let scopeMismatch = false;
    let scopeMismatchWarning = '';

    if (attestation.subjectType !== null && displayedOn !== null && attestation.subjectType !== displayedOn) {
        const subjectIsAbstract = (ABSTRACT_SUBJECT_TYPES as ReadonlyArray<string>).includes(attestation.subjectType);
        const targetIsPhysical = (PHYSICAL_SUBJECT_TYPES as ReadonlyArray<string>).includes(displayedOn);
        if (subjectIsAbstract && targetIsPhysical) {
            scopeMismatch = true;
            scopeMismatchWarning =
                `Esta atestação é sobre ${SCOPE_LABELS[attestation.subjectType].toUpperCase()}, `
                + `não sobre ${SCOPE_LABELS[displayedOn].toLowerCase()}. `
                + 'Exibi-la como se fosse do objeto físico pode configurar prática desleal '
                + '(Diretiva (UE) 2024/825).';
            degraded.push('escopo do sujeito ≠ objeto de exibição');
        }
    } else if (attestation.subjectType === null) {
        // Escopo desconhecido não pode ser omitido: (b) exige o escopo SEMPRE junto.
        degraded.push('subject_type ausente — escopo não pode ser afirmado');
    }

    // ── Rodapé obrigatório, INLINE ───────────────────────────────────────────
    const requiresDisclaimer = renderTier === 'self_declared' || isUnverifiable || renderTier === 'adverse';
    let disclaimerText = '';
    if (renderTier === 'adverse') {
        disclaimerText = 'Esta atestação não está vigente.';
    } else if (renderTier === 'self_declared') {
        disclaimerText = isUnverifiable
            ? 'Registro autodeclarado, não verificável de forma independente. Não constitui certificação.'
            : 'Registro autodeclarado. Não constitui certificação.';
    } else if (isUnverifiable) {
        disclaimerText = 'Esta atestação não é verificável de forma independente.';
    }

    return Object.freeze({
        renderTier,
        cssClass: `attestation--${renderTier}`,
        isSelfDeclared,
        scopeLabel,
        scopeMismatch,
        scopeMismatchWarning,
        isUnverifiable,
        verifiabilityLabel: VERIFIABILITY_LABELS[attestation.verifiability],
        requiresDisclaimer,
        disclaimerText,
        degradedBecause: Object.freeze(degraded.slice()),
        // Só `attested` pode aparecer promocionalmente. Todo o resto é bloqueado.
        blockPromotionalDisplay: renderTier !== 'attested',
    });
}

// ────────────────────────────────────────────────────────────────────────
// issuer ≠ subject — o invariante que sobe de creditVerifier
// ────────────────────────────────────────────────────────────────────────

export interface IndependenceResult {
    readonly independent: boolean;
    /** Código estável de erro. `null` quando independente. */
    readonly error: string | null;
    readonly detail: string;
}

/**
 * Invariante genérico **`issuer ≠ subject`** — quem atesta não pode ser quem é
 * atestado.
 *
 * Generaliza `verifyAuditorAttestation` (`core/credits/creditVerifier.ts:39-49`),
 * que hoje é o único lugar do app com esta regra e a aplica só a créditos de
 * carbono (rejeita `auditorAddress === holder` com `auditor_conflict_of_interest`).
 * A regra não tem nada de específico de crédito: vale para o engenheiro que se
 * carimba como responsável técnico do próprio ativo, para o laboratório que
 * assina o próprio laudo, para a empresa que se autocertifica.
 *
 * Autodeclaração (`first_party`) é o caso em que emissor = sujeito **por
 * definição** — aí não é conflito, é a natureza da coisa, e quem trata disso é o
 * requisito (a) do gate (degradação visual), não este invariante. Por isso
 * `first_party` NÃO é reprovado aqui; ele é reprovado apenas se se apresentar
 * como terceira parte.
 */
export function checkIssuerIndependence(attestation: Attestation): IndependenceResult {
    const issuer = (attestation.issuedBy ?? '').trim().toLowerCase();
    const verifier = (attestation.verifiedBy ?? '').trim().toLowerCase();
    const subject = (attestation.subjectId ?? '').trim().toLowerCase();

    if (issuer.length === 0) {
        return Object.freeze({
            independent: false,
            error: 'issuer_required',
            detail: 'Atestação sem emissor identificado — não é possível avaliar independência.',
        });
    }

    // Autodeclaração assumida: emissor = sujeito é a definição, não o defeito.
    if (attestation.assessorLevel === 'first_party') {
        return Object.freeze({
            independent: false,
            error: null,
            detail: 'Autodeclaração — emissor e sujeito coincidem por definição (first_party).',
        });
    }

    if (subject.length > 0 && issuer === subject) {
        return Object.freeze({
            independent: false,
            error: 'issuer_conflict_of_interest',
            detail: 'O emissor é o próprio sujeito da atestação, mas ela não se declara autodeclarada (first_party).',
        });
    }

    if (subject.length > 0 && verifier.length > 0 && verifier === subject) {
        return Object.freeze({
            independent: false,
            error: 'verifier_conflict_of_interest',
            detail: 'O verificador é o próprio sujeito da atestação.',
        });
    }

    // Terceira parte declarada exige verificador DISTINTO do emissor (E2: são
    // três campos e não um justamente porque os papéis não colapsam).
    if (attestation.assessorLevel === 'third_party' && verifier.length > 0 && verifier === issuer) {
        return Object.freeze({
            independent: false,
            error: 'verifier_equals_issuer',
            detail: 'Declarada terceira parte, mas emissor e verificador são a mesma entidade.',
        });
    }

    return Object.freeze({
        independent: true,
        error: null,
        detail: 'Emissor, verificador e sujeito são entidades distintas.',
    });
}
