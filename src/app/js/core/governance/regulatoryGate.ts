// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   REGULATORY GATE — SPEC-REC-003 Camada 2
   Verificacao de habilitacao para publicacao de documentos regulatorios
   no contexto ambiental e ocupacional brasileiro.

   Verifica se o autor possui credenciais suficientes para assinar
   documentos regulatorios:
   - Nivel de credencial minima (tecnico, graduado, mestre, doutor)
   - Registros profissionais obrigatorios (CREA, CRM, IBAMA_TEC)
   - Declaracao de Responsabilidade Tecnica (RT) quando exigido

   Normas de referencia: CONAMA 001/1986, CETESB DD-156/2022,
   NR-7, NR-9, ABNT NBR ISO/IEC 17025.

   Spec: SPEC-REC-003 Camada 2
   ================================================================ */

// ── Credential level ordering (ascending: lowest → highest) ──────────────────

/**
 * Ordem crescente dos niveis de credencial academica/profissional.
 * Tecnico de nivel medio e o minimo; doutor e o maximo.
 */
export const CREDENTIAL_LEVEL_ORDER: ReadonlyArray<string> = Object.freeze([
    'tecnico',
    'graduado',
    'especializacao',
    'mestre',
    'doutor',
]);

// ── Document requirements catalog ─────────────────────────────────────────────

interface RegulatoryDocumentRequirement {
    requiredRegistrations: ReadonlyArray<string>;
    minCredentialLevel: string;
    requiresTeamLead: boolean;
    referenceNorm: string;
}

/**
 * Mapeamento de tipo de documento regulatorio para requisitos de habilitacao.
 * Cada entrada define nivel minimo de credencial, registros profissionais
 * obrigatorios e necessidade de Responsavel Tecnico (RT) declarado.
 *
 * Fontes normativas:
 * - EIA/RIMA: CONAMA 001/1986 Art. 7 (equipe multidisciplinar + RT)
 * - Avaliacao de Risco e Plano de Remediacao: CETESB DD-156/2022
 * - PPRA (NR-9) + PCMSO (NR-7): MTE, exige Eng. Seguranca ou Medico do Trabalho
 * - Relatorio de Monitoramento: boas praticas ABNT NBR (sem exigencia formal de RT)
 * - Boletim de Coleta: ABNT NBR ISO/IEC 17025 (tecnico pode executar)
 */
export const REGULATORY_DOCUMENT_REQUIREMENTS: Readonly<Record<string, Readonly<RegulatoryDocumentRequirement>>> =
    Object.freeze({
        environmental_impact_assessment: Object.freeze({
            // Estudo de Impacto Ambiental (EIA/RIMA) - CONAMA 001/1986
            requiredRegistrations: Object.freeze(['CREA', 'IBAMA_TEC']),
            minCredentialLevel: 'graduado',
            requiresTeamLead: true,
            referenceNorm: 'CONAMA 001/1986 Art. 7',
        }),
        contamination_assessment: Object.freeze({
            // Avaliacao de Risco - CETESB DD-156/22
            requiredRegistrations: Object.freeze(['CREA']),
            minCredentialLevel: 'graduado',
            requiresTeamLead: false,
            referenceNorm: 'CETESB DD-156/2022',
        }),
        remediation_plan: Object.freeze({
            // Plano de Remediacao - CETESB DD-156/22
            requiredRegistrations: Object.freeze(['CREA']),
            minCredentialLevel: 'graduado',
            requiresTeamLead: true,
            referenceNorm: 'CETESB DD-156/2022',
        }),
        occupational_health_report: Object.freeze({
            // PPRA/PCMSO - NR-7/NR-9
            // CRM para PCMSO (Medico do Trabalho), CREA para PPRA (Eng. Seguranca)
            requiredRegistrations: Object.freeze(['CRM', 'CREA']),
            minCredentialLevel: 'graduado',
            requiresTeamLead: false,
            referenceNorm: 'NR-7 e NR-9 MTE',
        }),
        monitoring_report: Object.freeze({
            // Relatorio de Monitoramento - sem exigencia formal mas recomenda CREA
            requiredRegistrations: Object.freeze([]),
            minCredentialLevel: 'tecnico',
            requiresTeamLead: false,
            referenceNorm: 'Boas Praticas ABNT NBR',
        }),
        field_sampling_log: Object.freeze({
            // Boletim de Coleta - tecnico de nivel medio pode executar
            requiredRegistrations: Object.freeze([]),
            minCredentialLevel: 'tecnico',
            requiresTeamLead: false,
            referenceNorm: 'ABNT NBR ISO/IEC 17025',
        }),
    });

// ── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Retorna o indice do nivel de credencial na ordem crescente.
 * Retorna -1 para nivel desconhecido.
 * @param level
 * @returns
 */
function _credentialIndex(level: string): number {
    return CREDENTIAL_LEVEL_ORDER.indexOf(level);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Verifica se um autor possui habilitacao para publicar um tipo de documento
 * regulatorio. Retorna objeto detalhado com requisitos pendentes.
 *
 * @param documentType - Chave em REGULATORY_DOCUMENT_REQUIREMENTS
 * @param author
 * @returns
 */
export function checkRegulatoryRequirement(
    documentType: string,
    author: { credentialLevel: string; registrations: string[]; isTeamLead: boolean },
): Readonly<{
    allowed: boolean;
    reason: string;
    missing: ReadonlyArray<string>;
    requirements: object | null;
}> {
    const docReq = REGULATORY_DOCUMENT_REQUIREMENTS[documentType];
    if (!docReq) {
        return Object.freeze({
            allowed: false,
            reason: 'unknown_document_type',
            missing: Object.freeze([]),
            requirements: null,
        });
    }

    const missing: string[] = [];

    // Verificar nivel de credencial minimo
    const authorIdx = _credentialIndex(author.credentialLevel);
    const requiredIdx = _credentialIndex(docReq.minCredentialLevel);
    if (authorIdx < requiredIdx) {
        missing.push('credential_level');
    }

    // Verificar registros profissionais obrigatorios
    const authorRegs = Array.isArray(author.registrations) ? author.registrations : [];
    for (const reg of docReq.requiredRegistrations) {
        if (!authorRegs.includes(reg)) {
            missing.push(reg);
        }
    }

    // Verificar declaracao de Responsavel Tecnico
    if (docReq.requiresTeamLead && !author.isTeamLead) {
        missing.push('team_lead');
    }

    if (missing.length === 0) {
        return Object.freeze({
            allowed: true,
            reason: 'requirements_met',
            missing: Object.freeze([]),
            requirements: docReq,
        });
    }

    return Object.freeze({
        allowed: false,
        reason: 'missing_requirements',
        missing: Object.freeze([...missing]),
        requirements: docReq,
    });
}

/**
 * Lista os requisitos de habilitacao para um tipo de documento em linguagem
 * humana (portugues). Util para exibicao em UI ou relatorios.
 *
 * @param documentType - Chave em REGULATORY_DOCUMENT_REQUIREMENTS
 * @returns
 */
export function listRequirementsForDocumentType(documentType: string): ReadonlyArray<string> {
    const docReq = REGULATORY_DOCUMENT_REQUIREMENTS[documentType];
    if (!docReq) {
        return Object.freeze([]);
    }

    const items: string[] = [];

    // Nivel de credencial minimo
    const levelLabels: Record<string, string> = {
        tecnico: 'Formacao tecnica minima',
        graduado: 'Graduacao minima',
        especializacao: 'Especializacao minima',
        mestre: 'Mestrado minimo',
        doutor: 'Doutorado minimo',
    };
    items.push(levelLabels[docReq.minCredentialLevel] || `Credencial: ${docReq.minCredentialLevel}`);

    // Registros profissionais
    for (const reg of docReq.requiredRegistrations) {
        items.push(`Registro ${reg} ativo`);
    }

    // Responsabilidade tecnica
    if (docReq.requiresTeamLead) {
        items.push('Responsavel Tecnico declarado');
    }

    return Object.freeze(items);
}

/**
 * Valida o objeto autor antes de usar em checkRegulatoryRequirement.
 * Verifica tipos e valores aceitos - nao valida contra dominio de documentos.
 *
 * @param author
 * @returns
 */
export function validateAuthorCredential(author: {
    credentialLevel?: unknown;
    registrations?: unknown;
    isTeamLead?: unknown;
}): Readonly<{ valid: boolean; errors: ReadonlyArray<string> }> {
    const errors: string[] = [];

    if (!author || typeof author !== 'object') {
        return Object.freeze({ valid: false, errors: Object.freeze(['author must be an object']) });
    }

    // credentialLevel deve ser string conhecida
    if (typeof author.credentialLevel !== 'string' || _credentialIndex(author.credentialLevel) === -1) {
        errors.push(
            `credentialLevel must be one of: ${CREDENTIAL_LEVEL_ORDER.join(', ')} — got: ${JSON.stringify(author.credentialLevel)}`,
        );
    }

    // registrations deve ser array (pode ser vazio)
    if (!Array.isArray(author.registrations)) {
        errors.push(`registrations must be an array — got: ${typeof author.registrations}`);
    }

    // isTeamLead deve ser boolean
    if (typeof author.isTeamLead !== 'boolean') {
        errors.push(`isTeamLead must be a boolean — got: ${typeof author.isTeamLead}`);
    }

    return Object.freeze({
        valid: errors.length === 0,
        errors: Object.freeze([...errors]),
    });
}

/**
 * Atalho para verificar se o autor pode publicar o documento sem co-assinatura.
 * Retorna true apenas se todos os requisitos individuais sao atendidos.
 *
 * @param documentType
 * @param author
 * @returns
 */
export function canPublishWithoutCoSigning(
    documentType: string,
    author: { credentialLevel: string; registrations: string[]; isTeamLead: boolean },
): boolean {
    const result = checkRegulatoryRequirement(documentType, author);
    return result.allowed === true;
}
