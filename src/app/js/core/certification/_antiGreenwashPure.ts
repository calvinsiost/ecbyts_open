// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * CERT-STAMPS-001 RF-5 — Gate anti-greenwashing (pure logic).
 *
 * Exibir selo de sustentabilidade virou ATO REGULADO. A Diretiva (UE) 2024/825
 * (EmpCo) inclui no Anexo I da UCPD a exibicao de rotulo de sustentabilidade
 * NAO baseado em esquema de certificacao como pratica desleal PER SE, a partir
 * de 27/09/2026, com multa ate 4% do faturamento. Casos reais: Tribunal de
 * Paris x TotalEnergies (23/10/2025); BGH alemao sobre "klimaneutral"
 * (27/06/2024).
 *
 * Se o app deixar o usuario criar selo arbitrario e renderizar ao lado de
 * selo real, o produto vira vetor de greenwashing. Este modulo e o GATE que
 * classifica uma estampa de certificacao para renderizacao DISTINTA.
 *
 * Requisitos (SPEC §8 RF-5):
 *   (a) Selo autodeclarado (label_type ISO 14021 II / assessorLevel first_party
 *       / attestationType sem certificador acreditado) renderiza VISUALMENT
 *       DISTINTO de certificacao de terceira parte.
 *   (b) O ESCOPO (subjectType: organisation x site x product) aparece SEMPRE
 *       junto do selo. Selo de organizacao NUNCA exibido sobre elemento fisico
 *       como se fosse dele (armadilhas reais: B Corp = empresa nao produto;
 *       AQUA MG2 = incorporadora nao unidade; selos PBGHG PROIBIDOS em
 *       produtos pela FGV Q34).
 *   (c) Rodape "este registro nao constitui certificacao" em selos
 *       autodeclarados / self-attested.
 *
 * Decoupling: este modulo e PURA logica — nao importa DOM, nao importa I/O,
 * nao importa o catalogo do RF-1. Recebe o `value` de uma estampa de
 * certificacao (shape definida em `utils/stamps/types.ts` > REPORTING_STAMP_TYPES
 * > certification) e devolve a classificacao de renderizacao. O stampPanel/UI
 * consome o resultado para aplicar classes CSS e inserir o rodape.
 *
 * Alinhacao anti-falso-verde: reusa o principio de `isClaimedTierHonest` do
 * `core/ods/_odsStampPure.ts` — uma alegacao sem lastro NUNCA e promovida na
 * exibicao. Aqui o "lastro" e o assessorLevel: first_party sem certificador
 * acreditado = autodeclarado, sempre degradado visualmente.
 *
 * Tests: `tests/anti-greenwash-pure.test.mjs`.
 */

/**
 * Tipo de rotulo conforme ISO 1402x (RF-1 label_type, mas sem hard-dependencia
 * do catalogo — se o caller souber, passa; se nao, inferimos de assessorLevel).
 *
 *  - `type_I`    (ISO 14024): certificacao de terceira parte, multi-criterio,
 *                programa de licenca. Ex: ENCE/Procel, FSC, EU Ecolabel.
 *  - `type_II`   (ISO 14021): alegacao AUTODECLARADA. Nao exige terceira parte.
 *                Ex: "amigo da natureza", "eco-friendly", "carbon neutral".
 *  - `type_III`  (ISO 14025): declaracao ambiental de terceira parte (EPD),
 *                mas baseada em LCA verificado — e declaracao, nao certificado.
 *  - `untyped`:  nao classificado (dado faltante).
 */
export type LabelType = 'type_I' | 'type_II' | 'type_III' | 'untyped';

/**
 * Nivel do assessor, espelha o enum do schema `certification.assessorLevel`
 * em `utils/stamps/types.ts`.
 */
export type AssessorLevel = 'first_party' | 'second_party' | 'third_party';

/**
 * Tipo de atestacao, espelha o enum do schema `certification.attestationType`.
 */
export type AttestationType =
    | 'certification'
    | 'verification_statement'
    | 'label'
    | 'disclosure_score'
    | 'validation_state'
    | 'due_diligence_statement';

/**
 * Tipo de sujeito da certificacao, espelha `certification.subjectType`.
 * E o ESCOPO do que foi certificado — confundir isso e o erro classico
 * (B Corp = organisation, nunca product).
 */
export type SubjectType =
    | 'organisation'
    | 'site'
    | 'product'
    | 'building'
    | 'land_parcel'
    | 'shipment';

/**
 * Resultado da classificacao anti-greenwashing de uma estampa de certificacao.
 * O stampPanel/UI consome estes campos para renderizar distintamente.
 */
export interface AntiGreenwashClassification {
    /**
     * `certified`  = certificacao de terceira parte acreditada (label_type I,
     *                assessorLevel third_party, attestationType certification).
     *                Renderiza com icone "selo" (check-verde em escudo).
     * `self_declared` = autodeclarado (ISO 14021 / first_party / sem acreditador).
     *                Renderiza com icone "declaracao" (tag cinza, NUNCA verde),
     *                borda tracejada, e rodape "este registro nao constitui
     *                certificacao".
     * `verified_statement` = declaracao verificada (EPD/ISO 14025, ISO 14064),
     *                terceira parte mas NAO certificacao multi-criterio.
     *                Renderiza com icone "declaracao verificada" (azul), sem
     *                o rodape de autodeclarado mas sem o "selo" verde tambem.
     */
    readonly renderTier: 'certified' | 'self_declared' | 'verified_statement';
    /** Classe CSS raiz para o item de estampa (ex: `stamp-cert--certified`). */
    readonly cssClass: string;
    /** Tipo de rotulo inferido ou fornecido (ISO 1402x). */
    readonly labelType: LabelType;
    /** Rotulo curto humano para o tipo (ex: "Autodeclarado (ISO 14021)"). */
    readonly labelTypeLabel: string;
    /**
     * Se TRUE, o rodape "este registro nao constitui certificacao" DEVE ser
     * exibido abaixo do selo. TRUE para self_declared; FALSE para certified;
     * FALSE para verified_statement (mas este mostra "declaracao verificada,
     * nao certificado" — menos forte que o rodape autodeclarado).
     */
    readonly requiresDisclaimer: boolean;
    /**
     * Texto do rodape a exibir (vazio quando requiresDisclaimer = false).
     */
    readonly disclaimerText: string;
    /**
     * Escopo normalizado do selo (subjectType). DEVE ser exibido junto do
     * selo — nunca oculto. Ex: "Organizacao", "Produto", "Site".
     */
    readonly scopeLabel: string;
    /**
     * TRUE quando o selo certifica ORGANISATION mas esta ancorado num elemento
     * fisico (product/building/land_parcel/shipment/site) — armadilha classica
     * (B Corp em produto, AQUA em unidade). A UI DEVE exibir aviso de mismatch
     * de escopo.
     */
    readonly scopeMismatch: boolean;
    /** Mensagem do aviso de mismatch de escopo (vazio se scopeMismatch=false). */
    readonly scopeMismatchWarning: string;
}

/**
 * Shape minima do `value` de uma estampa de certificacao que este modulo le.
 * Mantida como struct solta (nao importa o schema inteiro de types.ts) para
 * evitar acoplamento — se campos forem adicionados ali, isto continua valido.
 */
export interface CertificationStampValue {
    readonly labelType?: LabelType | string;
    readonly assessorLevel?: AssessorLevel | string;
    readonly attestationType?: AttestationType | string;
    readonly subjectType?: SubjectType | string;
    readonly accreditationStatus?: string;
    readonly verifierAccreditedBy?: string;
    readonly issuedBy?: string;
    readonly schemeUri?: string;
}

/** Subject types que representam elementos FISICOS (ativos do gemeo). */
const PHYSICAL_SUBJECT_TYPES: ReadonlyArray<SubjectType> = [
    'product',
    'building',
    'land_parcel',
    'shipment',
    'site',
];

/** Mapa de labelType -> rotulo curto humano (pt-BR). */
const LABEL_TYPE_LABELS: Readonly<Record<LabelType, string>> = {
    type_I: 'Certificacao (ISO 14024)',
    type_II: 'Autodeclarado (ISO 14021)',
    type_III: 'Declaracao verificada (ISO 14025)',
    untyped: 'Tipo nao classificado',
};

/** Mapa de subjectType -> rotulo de escopo humano (pt-BR). */
const SCOPE_LABELS: Readonly<Record<SubjectType, string>> = {
    organisation: 'Organizacao',
    site: 'Site',
    product: 'Produto',
    building: 'Edificacao',
    land_parcel: 'Parcela de terra',
    shipment: 'Embarque',
};

/**
 * Normaliza um labelType fornecido ou infere a partir de assessorLevel +
 * attestationType. Preferencia: valor explicito > inferencia.
 *
 * Regras de inferencia (quando labelType ausente/invalido):
 *  - third_party + attestationType `certification` => type_I
 *  - third_party + attestationType `verification_statement`/`label` (com EPD)
 *    => type_III
 *  - first_party OU sem certificador => type_II (autodeclarado)
 */
export function inferLabelType(value: CertificationStampValue): LabelType {
    const explicit = normalizeLabelType(value.labelType);
    if (explicit !== 'untyped') return explicit;

    const assessor = normalizeAssessorLevel(value.assessorLevel);
    const attestation = normalizeAttestationType(value.attestationType);

    // Sem assessor de terceira parte => autodeclarado.
    if (assessor !== 'third_party') {
        return 'type_II';
    }
    // Terceira parte: certificacao multi-criterio = type_I; declaracao/EPD = type_III.
    if (attestation === 'certification') {
        return 'type_I';
    }
    if (attestation === 'verification_statement' || attestation === 'label') {
        return 'type_III';
    }
    // Terceira parte mas attestation ambigua: conservador = type_III (declaracao),
    // nunca promoção para type_I sem atestacao explicita de certificacao.
    return 'type_III';
}

function normalizeLabelType(raw: unknown): LabelType {
    if (typeof raw !== 'string') return 'untyped';
    const trimmed = raw.trim();
    if (trimmed === 'type_I' || trimmed === 'type_1' || trimmed === 'I' || trimmed === 'ISO 14024') {
        return 'type_I';
    }
    if (trimmed === 'type_II' || trimmed === 'type_2' || trimmed === 'II' || trimmed === 'ISO 14021') {
        return 'type_II';
    }
    if (trimmed === 'type_III' || trimmed === 'type_3' || trimmed === 'III' || trimmed === 'ISO 14025') {
        return 'type_III';
    }
    return 'untyped';
}

function normalizeAssessorLevel(raw: unknown): AssessorLevel | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (trimmed === 'first_party' || trimmed === 'second_party' || trimmed === 'third_party') {
        return trimmed;
    }
    return null;
}

function normalizeAttestationType(raw: unknown): AttestationType | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    const valid: ReadonlyArray<AttestationType> = [
        'certification',
        'verification_statement',
        'label',
        'disclosure_score',
        'validation_state',
        'due_diligence_statement',
    ];
    if ((valid as ReadonlyArray<string>).includes(trimmed)) {
        return trimmed as AttestationType;
    }
    return null;
}

function normalizeSubjectType(raw: unknown): SubjectType | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    const valid: ReadonlyArray<SubjectType> = [
        'organisation',
        'site',
        'product',
        'building',
        'land_parcel',
        'shipment',
    ];
    if ((valid as ReadonlyArray<string>).includes(trimmed)) {
        return trimmed as SubjectType;
    }
    return null;
}

/**
 * Verifica se o verificador foi acreditado. Considera NAO acreditado quando:
 *  - accreditationStatus explicitamente 'not_accredited' / 'withdrawn' / 'suspended'
 *  - OU assessorLevel e first_party (auto-avaliacao, por definicao sem acreditador)
 *  - OU assessorLevel ausente E verifierAccreditedBy ausente.
 */
function isVerifierAccredited(value: CertificationStampValue): boolean {
    const status = typeof value.accreditationStatus === 'string' ? value.accreditationStatus.trim() : '';
    if (status === 'not_accredited' || status === 'withdrawn' || status === 'suspended') {
        return false;
    }
    if (status === 'accredited') {
        return true;
    }
    const assessor = normalizeAssessorLevel(value.assessorLevel);
    if (assessor === 'first_party') {
        return false;
    }
    // status 'unknown' ou ausente: so confiamos se houver acreditador nomeado.
    const hasAccreditor = typeof value.verifierAccreditedBy === 'string' && value.verifierAccreditedBy.trim().length > 0;
    return hasAccreditor;
}

/**
 * Classifica uma estampa de certificacao para renderizacao anti-greenwashing.
 *
 * Esta e a funcao MAIN do gate RF-5. O stampPanel/UI chama-a para cada estampa
 * `certification` e usa o resultado para aplicar classes CSS, inserir rodape e
 * avisar de mismatch de escopo.
 *
 * @param value - O `stamp.value` da estampa de certificacao (shape de
 *                `REPORTING_STAMP_TYPES.certification.schema`).
 * @returns Classificacao de renderizacao (renderTier, cssClass, labelType,
 *          requiresDisclaimer, scopeMismatch, etc.).
 */
export function classifyCertificationStamp(value: CertificationStampValue): AntiGreenwashClassification {
    const labelType = inferLabelType(value);
    const accredited = isVerifierAccredited(value);
    const subject = normalizeSubjectType(value.subjectType);

    // --- renderTier: o coracao do gate anti-greenwashing ---
    //
    // certified: type_I (ISO 14024) com verificador acreditado por terceira
    //   parte. E o UNICO tier que pode renderizar como "selo" (verde, escudo).
    //
    // verified_statement: type_III (EPD/ISO 14025) ou type_I sem acreditacao
    //   valida. E uma declaracao, nao um selo — azul, sem o selo verde, sem o
    //   rodape autodeclarado mas tambem sem promocao visual.
    //
    // self_declared: type_II (ISO 14021) OU qualquer selo sem verificador
    //   acreditado E sem labelType type_I/III. Sempre degradado: cinza,
    //   borda tracejada, rodape "este registro nao constitui certificacao".
    let renderTier: AntiGreenwashClassification['renderTier'];
    if (labelType === 'type_I' && accredited) {
        renderTier = 'certified';
    } else if (labelType === 'type_III') {
        renderTier = 'verified_statement';
    } else if (labelType === 'type_I' && !accredited) {
        // type_I reivindicado mas SEM acreditacao — nao e certificado valido.
        // Conservador: degrada para declaracao verificada, nao para selo.
        renderTier = 'verified_statement';
    } else {
        // type_II ou untyped => autodeclarado.
        renderTier = 'self_declared';
    }

    // --- CSS class ---
    const cssClass = `stamp-cert--${renderTier}`;

    // --- Disclaimer (rodape autodeclarado) ---
    // So selos self_declared levam o rodape forte. verified_statement tem
    // tratamento proprio na UI (azul, "declaracao verificada") mas nao o
    // rodape "nao constitui certificacao" porque uma EPD e mais que isso.
    const requiresDisclaimer = renderTier === 'self_declared';
    const disclaimerText = requiresDisclaimer ? 'Este registro nao constitui certificacao.' : '';

    // --- Scope label ---
    const scopeLabel = subject ? SCOPE_LABELS[subject] : 'Escopo nao informado';

    // --- Scope mismatch (armadilha classica) ---
    // Selo de ORGANISATION ancorado em elemento FISICO (product/building/...)
    // e o vetor classico de greenwashing por confusao de escopo.
    let scopeMismatch = false;
    let scopeMismatchWarning = '';
    if (subject === 'organisation') {
        scopeMismatch = true;
        scopeMismatchWarning =
            'Este selo certifica a ORGANIZACAO, nao o ativo fisico. ' +
            'Exibi-lo sobre um produto/edificacao pode configurar pratica desleal ' +
            '(EmpCo Dir. (UE) 2024/825).';
    }

    return Object.freeze({
        renderTier,
        cssClass,
        labelType,
        labelTypeLabel: LABEL_TYPE_LABELS[labelType],
        requiresDisclaimer,
        disclaimerText,
        scopeLabel,
        scopeMismatch,
        scopeMismatchWarning,
    });
}

/**
 * Const helper para o caller saber, ANTES de renderizar, se uma estampa e de
 * certificacao (tipo `certification`) e portanto sujeita ao gate RF-5.
 */
export function isCertificationStamp(stamp: { readonly type?: string }): boolean {
    return stamp?.type === 'certification';
}