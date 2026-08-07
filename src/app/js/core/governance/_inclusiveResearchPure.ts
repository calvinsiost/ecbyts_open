// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   INCLUSIVE RESEARCH GOVERNANCE PURE (EA-39)
   ================================================================

   Define o contrato de governança para pesquisa inclusiva com
   participantes do programa early-adopter. Garante:
   - Acessibilidade e acomodações razoáveis
   - Compensação independente de opinião
   - Consentimento separado para gravação
   - Data de retenção, anonimização e acesso restrito

   DoD EA-39:
   - Protocolo cobre consentimento e saída
   - Amostra inclui acessibilidade
   - Dados têm finalidade e retenção
   ================================================================ */

/**
 * Tipos de acomodação suportados no protocolo inclusivo.
 * Qualquer participante pode solicitar um ou mais.
 */
export const ACCOMMODATION_TYPES = [
    'large-print',
    'screen-reader',
    'extra-time',
    'sign-language',
    'simple-language',
    'alternative-input',
] as const;

/**
 * Formatos de saída acessíveis que devem estar disponíveis.
 */
export const ACCESSIBLE_FORMATS = [
    'text',
    'audio',
    'braille',
    'simple-language',
] as const;

/**
 * Valida um protocolo de pesquisa inclusiva.
 * Retorna lista de erros (vazia = válido).
 */
export function validateResearchProtocol(protocol: any): string[] {
    const errors: string[] = [];

    if (!protocol || typeof protocol !== 'object') {
        return ['protocol must be an object'];
    }

    // DoD 1: Protocolo cobre consentimento e saída
    if (!protocol.consent) {
        errors.push('consent section required (DoD: protocol covers consent)');
    } else {
        const c = protocol.consent;
        if (!c.recordingConsentSeparate) {
            errors.push('consent.recordingConsentSeparate must be true — recording consent must be separate from general participation consent');
        }
        if (!c.exitAllowed) {
            errors.push('consent.exitAllowed must be true — participant must be able to exit at any time');
        }
        if (!c.exitDataHandling || typeof c.exitDataHandling !== 'string') {
            errors.push('consent.exitDataHandling required — must describe what happens to data on exit');
        }
    }

    // DoD 2: Amostra inclui acessibilidade
    if (!protocol.accessibility) {
        errors.push('accessibility section required (DoD: sample includes accessibility)');
    } else {
        const a = protocol.accessibility;
        if (!Array.isArray(a.availableAccommodations) || a.availableAccommodations.length === 0) {
            errors.push('accessibility.availableAccommodations must be a non-empty array');
        } else {
            const invalid = a.availableAccommodations.filter(
                (acc: string) => !ACCOMMODATION_TYPES.includes(acc as any),
            );
            if (invalid.length) {
                errors.push(`accessibility.availableAccommodations has invalid types: ${invalid.join(', ')}`);
            }
        }
        if (!Array.isArray(a.accessibleFormats) || a.accessibleFormats.length === 0) {
            errors.push('accessibility.accessibleFormats must be a non-empty array');
        }
    }

    // DoD 3: Dados têm finalidade e retenção
    if (!protocol.dataGovernance) {
        errors.push('dataGovernance section required (DoD: data has purpose and retention)');
    } else {
        const dg = protocol.dataGovernance;
        if (!dg.purpose || typeof dg.purpose !== 'string') {
            errors.push('dataGovernance.purpose required — must state the research purpose');
        }
        if (!dg.retentionDate || typeof dg.retentionDate !== 'string') {
            errors.push('dataGovernance.retentionDate required — must specify retention deadline (ISO date)');
        }
        if (!dg.anonymization && dg.anonymization !== false) {
            errors.push('dataGovernance.anonymization must be explicitly true or false');
        }
        if (dg.restrictedAccess !== true) {
            errors.push('dataGovernance.restrictedAccess must be true — research data must have restricted access');
        }
    }

    // Compensação independente de opinião
    if (!protocol.compensation) {
        errors.push('compensation section required');
    } else {
        const comp = protocol.compensation;
        if (comp.opinionIndependent !== true) {
            errors.push('compensation.opinionIndependent must be true — compensation cannot depend on the opinion given');
        }
        if (!comp.description || typeof comp.description !== 'string') {
            errors.push('compensation.description required — must describe what compensation is offered');
        }
    }

    return errors;
}

/**
 * Cria um protocolo de pesquisa inclusiva válido com defaults.
 * Override individual fields via overrides parameter.
 */
export function createResearchProtocol(overrides: any = {}): any {
    const base = {
        consent: {
            recordingConsentSeparate: true,
            exitAllowed: true,
            exitDataHandling: 'Participant data is retained per governance policy but de-identified upon exit.',
        },
        accessibility: {
            availableAccommodations: [...ACCOMMODATION_TYPES],
            accessibleFormats: [...ACCESSIBLE_FORMATS],
        },
        dataGovernance: {
            purpose: 'Early-adopter program feedback for product improvement.',
            retentionDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            anonymization: true,
            restrictedAccess: true,
        },
        compensation: {
            opinionIndependent: true,
            description: 'Participants receive a fixed benefit (e.g., extended access, feature credit) regardless of feedback content.',
        },
    };

    // Deep merge overrides into base (1 level deep for each section)
    const result = JSON.parse(JSON.stringify(base));
    for (const key of Object.keys(overrides)) {
        if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
            result[key] = { ...result[key], ...overrides[key] };
        } else {
            result[key] = overrides[key];
        }
    }

    return result;
}

/**
 * Verifica se o protocolo atende todos os critérios do DoD EA-39.
 * Retorna { passed: boolean, failures: string[] }.
 */
export function checkResearchProtocolDOD(protocol: any): { passed: boolean; failures: string[] } {
    const failures = validateResearchProtocol(protocol);
    return { passed: failures.length === 0, failures };
}