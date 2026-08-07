// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ATTEST-001 — GATE DE CREDENCIAL: quem pode assinar como responsável técnico.
 * SPEC: docs/specs/features/SPEC_ATTESTATION_MODEL.md (eixo E2 — independência
 * e cadeia de confiança do atestador).
 *
 * ─── O bug que este módulo fecha ────────────────────────────────────────────
 * `utils/stamps/manager.ts` > `addStamp` não fazia **nenhuma** verificação de
 * credencial ao aplicar a estampa `responsible_technical` — `validateStampValue`
 * (`utils/stamps/types.ts`) só checa TIPO e OBRIGATORIEDADE do campo. Resultado:
 * qualquer usuário carimbava a si mesmo como responsável técnico de um ativo
 * informando um número de CREA arbitrário, e isso viajava dentro do modelo
 * exportado. Assinar como RT é ato regulado (Lei 6.496/1977); o app estava
 * emitindo a afirmação sem nenhum lastro.
 *
 * ─── Por que existe UM gate e não dois ──────────────────────────────────────
 * Havia **dois gates regulatórios rivais, ambos código morto com zero chamadores**:
 *
 *   · `core/governance/regulatoryGate.ts` — exige **TODOS** os registros da lista,
 *     chaveado por TIPO DE DOCUMENTO, shape `{requiredRegistrations, minCredentialLevel,
 *     requiresTeamLead, referenceNorm}`.
 *   · `core/eis/credentialSeparation.ts` — aceita **QUALQUER UM** da lista,
 *     chaveado por TIPO DE RELATÓRIO, shape `Record<string, string[]>`.
 *
 * Duas chaves e dois shapes para o mesmo conceito, com regras opostas.
 *
 * **Decisão de projeto (registrada explicitamente):** este módulo unifica CHAVE e
 * SHAPE num só — mas NÃO escolhe arbitrariamente entre "todos" e "qualquer um",
 * porque a divergência entre os dois não era um bug de implementação: era um fato
 * do mundo. A ART ambiental aceita **CREA _ou_ CAU** (qualquer um — são conselhos
 * concorrentes para o mesmo ato); o EIA/RIMA exige **CREA _e_ IBAMA_TEC**
 * (todos — são registros de naturezas distintas, conselho profissional + cadastro
 * técnico federal). Fixar um único modo em código tornaria a regra falsa para
 * metade dos atos.
 *
 * Então o modo vira **DADO de cada requisito** (`match: 'all' | 'any'`), seguindo a
 * regra de ouro da própria spec: ato novo = 1 LINHA no catálogo, zero código. Se um
 * ato futuro precisar de código, o eixo que faltou vira campo aqui.
 *
 * ─── O que este gate NÃO faz ────────────────────────────────────────────────
 * NÃO valida o número do registro contra a base do conselho (CREA/CAU/CRQ/CRM) —
 * isso exige I/O e verificação server-side (RF-7). O gate impede a fabricação
 * ÓBVIA (registro ausente, malformado, conselho errado para o ato, credencial
 * vencida) e marca o resultado com {@link CredentialCheck.verifiedAgainstRegistry}
 * = false, para que a UI jamais exiba como "verificado" aquilo que só foi
 * verificado quanto à FORMA. Afirmar verificação que não houve seria o mesmo
 * defeito, uma camada acima.
 *
 * Puro — ZERO DOM, ZERO IO, determinístico. Tudo congelado.
 * Tests: `tests/attestation-credential-gate-pure.test.mjs`.
 */

// ────────────────────────────────────────────────────────────────────────
// Catálogo de atos regulados
// ────────────────────────────────────────────────────────────────────────

/** Como a lista de registros exigidos deve ser satisfeita. */
export type CredentialMatch = 'all' | 'any';

export interface RegulatedActRequirement {
    /** Registros profissionais aceitos/exigidos para o ato. */
    readonly registrations: ReadonlyArray<string>;
    /** `any` = basta um (conselhos concorrentes); `all` = exige todos (naturezas distintas). */
    readonly match: CredentialMatch;
    /** Norma que sustenta a exigência. Nunca vazia — a regra tem de ser contestável. */
    readonly referenceNorm: string;
    /** `true` quando o ato exige Responsável Técnico declarado (não só autor). */
    readonly requiresTeamLead: boolean;
}

/**
 * Formatos de registro por conselho. Deliberadamente TOLERANTES: o objetivo é
 * barrar lixo evidente ("123", "meu crea"), não reprovar registro legítimo por
 * variação de formatação — falso negativo aqui bloqueia trabalho real.
 */
const REGISTRATION_PATTERNS: Readonly<Record<string, RegExp>> = Object.freeze({
    // CREA: UF + dígitos (ex.: "CREA-SP 5069123456", "SP 060123456/D")
    CREA: /^(CREA[-\s]?)?[A-Z]{2}[-\s]?\d{6,12}(\s?\/?\s?[A-Z])?$/i,
    // CAU: A + 6-7 dígitos (ex.: "CAU A123456-7", "A1234567")
    CAU: /^(CAU[-\s]?)?A?\d{6,8}[-\s]?\d?$/i,
    // CRQ: região romana/numérica + dígitos (ex.: "CRQ IV 04123456")
    CRQ: /^(CRQ[-\s]?)?([IVX]{1,4}|\d{1,2})[-\s]?\d{6,10}$/i,
    // CRM: UF + dígitos (ex.: "CRM-SP 123456")
    CRM: /^(CRM[-\s]?)?[A-Z]{2}[-\s]?\d{4,8}$/i,
    // Cadastro Técnico Federal do IBAMA: 7-8 dígitos
    IBAMA_TEC: /^(CTF[-\s]?)?\d{6,9}$/i,
});

/**
 * Catálogo dos atos regulados. **Ato novo = 1 linha aqui, zero código.**
 *
 * Fontes normativas de cada linha declaradas em `referenceNorm` — a regra precisa
 * ser auditável e contestável num único lugar, não espalhada pelo código.
 */
export const REGULATED_ACTS: Readonly<Record<string, RegulatedActRequirement>> = Object.freeze({
    /** A estampa `responsible_technical` — o ato que originou este gate. */
    responsible_technical: Object.freeze({
        // Assumir RT de ativo ambiental/industrial: conselhos concorrentes conforme
        // a formação (engenharia, arquitetura, química). Basta UM registro válido.
        registrations: Object.freeze(['CREA', 'CAU', 'CRQ']),
        match: 'any' as CredentialMatch,
        referenceNorm: 'Lei 6.496/1977 (ART) · Resolução CONFEA 1.137/2023',
        requiresTeamLead: false,
    }),
    environmental_impact_assessment: Object.freeze({
        // EIA/RIMA: conselho profissional E cadastro técnico federal — naturezas
        // distintas, cumulativas. Aqui `all` é o correto.
        registrations: Object.freeze(['CREA', 'IBAMA_TEC']),
        match: 'all' as CredentialMatch,
        referenceNorm: 'CONAMA 001/1986 Art. 7',
        requiresTeamLead: true,
    }),
    contamination_assessment: Object.freeze({
        registrations: Object.freeze(['CREA', 'CRQ']),
        match: 'any' as CredentialMatch,
        referenceNorm: 'CETESB DD-156/2022',
        requiresTeamLead: false,
    }),
    remediation_plan: Object.freeze({
        registrations: Object.freeze(['CREA', 'CRQ']),
        match: 'any' as CredentialMatch,
        referenceNorm: 'CETESB DD-156/2022',
        requiresTeamLead: true,
    }),
    occupational_health_report: Object.freeze({
        // PCMSO é ato médico (CRM); PGR/PPRA é de engenharia de segurança (CREA).
        // Conselhos distintos para atos distintos dentro do mesmo documento → `any`,
        // com a competência específica conferida no ato de assinar cada seção.
        registrations: Object.freeze(['CRM', 'CREA']),
        match: 'any' as CredentialMatch,
        referenceNorm: 'NR-7 e NR-9 (MTE)',
        requiresTeamLead: false,
    }),
    art_quimica: Object.freeze({
        registrations: Object.freeze(['CRQ']),
        match: 'all' as CredentialMatch,
        referenceNorm: 'Lei 2.800/1956 (CRQ)',
        requiresTeamLead: false,
    }),
});

// ────────────────────────────────────────────────────────────────────────
// Verificação
// ────────────────────────────────────────────────────────────────────────

export interface CredentialCheck {
    readonly allowed: boolean;
    /** Código estável do motivo. `null` quando permitido. */
    readonly error: string | null;
    readonly detail: string;
    /** Registros que faltaram (vazio quando permitido ou quando o ato não é regulado). */
    readonly missing: ReadonlyArray<string>;
    /**
     * SEMPRE `false` enquanto não houver verificação server-side (RF-7).
     * A UI NUNCA pode exibir "verificado" com base neste gate: aqui só se
     * confere FORMA, não existência na base do conselho.
     */
    readonly verifiedAgainstRegistry: boolean;
}

/** Credencial declarada por quem assina. */
export interface DeclaredCredential {
    /** Conselho: 'CREA' | 'CAU' | 'CRQ' | 'CRM' | 'IBAMA_TEC'. */
    readonly council?: string;
    /** Número do registro como informado. */
    readonly registration?: string;
    /** Fim de vigência da credencial (ISO), quando conhecido. */
    readonly validUntil?: string | null;
}

function frozen(
    allowed: boolean,
    error: string | null,
    detail: string,
    missing: ReadonlyArray<string> = [],
): CredentialCheck {
    return Object.freeze({
        allowed,
        error,
        detail,
        missing: Object.freeze(missing.slice()),
        verifiedAgainstRegistry: false,
    });
}

/**
 * Infere o conselho a partir do próprio número informado, quando não declarado.
 * Devolve `null` se não der para inferir — jamais chuta CREA por ser o mais comum.
 */
function inferCouncil(registration: string): string | null {
    const upper = registration.trim().toUpperCase();
    for (const council of ['CREA', 'CAU', 'CRQ', 'CRM']) {
        if (upper.startsWith(council)) return council;
    }
    return null;
}

/**
 * Verifica se a credencial declarada habilita a prática do ato.
 *
 * @param actId - chave em {@link REGULATED_ACTS}. Ato desconhecido é PERMITIDO
 *   (não é papel deste gate barrar o que não é regulado), mas o resultado diz isso.
 * @param credential - credencial declarada por quem assina
 * @param at - instante da avaliação (para vigência). Default: agora.
 */
export function checkCredentialForAct(
    actId: string,
    credential: DeclaredCredential | null | undefined,
    at: string | Date = new Date(),
): CredentialCheck {
    const requirement = REGULATED_ACTS[actId];
    if (requirement === undefined) {
        return frozen(true, null, `Ato "${actId}" não é regulado por este catálogo.`);
    }

    const cred = credential ?? {};
    const registration = typeof cred.registration === 'string' ? cred.registration.trim() : '';

    if (registration.length === 0) {
        return frozen(
            false,
            'registration_required',
            `O ato "${actId}" exige registro profissional (${requirement.referenceNorm}).`,
            requirement.registrations,
        );
    }

    const declaredCouncil = typeof cred.council === 'string' ? cred.council.trim().toUpperCase() : '';
    const council = declaredCouncil.length > 0 ? declaredCouncil : inferCouncil(registration);

    if (council === null) {
        return frozen(
            false,
            'council_undetermined',
            'Não foi possível determinar o conselho profissional a partir do registro informado.',
            requirement.registrations,
        );
    }

    // O conselho serve para ESTE ato?
    if (!requirement.registrations.includes(council)) {
        return frozen(
            false,
            'council_not_accepted',
            `O conselho ${council} não habilita o ato "${actId}". `
            + `Aceitos: ${requirement.registrations.join(requirement.match === 'any' ? ' ou ' : ' e ')} `
            + `(${requirement.referenceNorm}).`,
            requirement.registrations,
        );
    }

    // Forma do número plausível?
    const pattern = REGISTRATION_PATTERNS[council];
    if (pattern !== undefined && !pattern.test(registration)) {
        return frozen(
            false,
            'registration_malformed',
            `O número informado não tem forma de registro ${council} válido.`,
            [council],
        );
    }

    // Vigência da própria credencial (E5 aplicado ao atestador).
    if (typeof cred.validUntil === 'string' && cred.validUntil.trim().length > 0) {
        const untilMs = new Date(cred.validUntil).getTime();
        const nowMs = at instanceof Date ? at.getTime() : new Date(at).getTime();
        if (Number.isFinite(untilMs) && Number.isFinite(nowMs) && nowMs > untilMs) {
            return frozen(
                false,
                'credential_expired',
                `A credencial ${council} informada venceu em ${cred.validUntil.slice(0, 10)}.`,
                [council],
            );
        }
    }

    // `match: 'all'` exige registros de MAIS DE UM conselho. Uma credencial única
    // não satisfaz — e mentir aqui seria pior que bloquear.
    if (requirement.match === 'all' && requirement.registrations.length > 1) {
        const missing = requirement.registrations.filter((c) => c !== council);
        return frozen(
            false,
            'additional_registrations_required',
            `O ato "${actId}" exige TODOS os registros: ${requirement.registrations.join(', ')} `
            + `(${requirement.referenceNorm}). Informado apenas ${council}.`,
            missing,
        );
    }

    return frozen(
        true,
        null,
        `Registro ${council} aceito para o ato "${actId}" quanto à forma. `
        + 'NÃO verificado contra a base do conselho (requer verificação server-side).',
    );
}

/**
 * Adaptador para a estampa `responsible_technical` de `utils/stamps/types.ts`,
 * cujo `value` traz `{ name, role, registration, validUntil }` — sem campo de
 * conselho, daí a inferência pelo número.
 */
export function checkResponsibleTechnicalStamp(
    value: { readonly registration?: unknown; readonly validUntil?: unknown } | null | undefined,
    at: string | Date = new Date(),
): CredentialCheck {
    const v = value ?? {};
    return checkCredentialForAct(
        'responsible_technical',
        {
            registration: typeof v.registration === 'string' ? v.registration : '',
            validUntil: typeof v.validUntil === 'string' ? v.validUntil : null,
        },
        at,
    );
}
