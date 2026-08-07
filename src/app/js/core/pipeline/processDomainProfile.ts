// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

export type ProcessDomainId = 'gac-dd38' | 'mineral-processing' | 'generic';

export interface ProcessDomainProfile {
    domain: ProcessDomainId;
    regulations: readonly string[];
    requiredFields: readonly string[];
    validationRules: readonly string[];
}

export const GAC_DD38: ProcessDomainProfile = Object.freeze({
    domain: 'gac-dd38',
    regulations: Object.freeze([
        'CETESB DD-38/2017 - Gerenciamento de Areas Contaminadas',
        'CONAMA 420/2009 - Qualidade do solo e valores de referencia',
        'Decreto Estadual SP 59.263/2013 - Regulamentacao de areas contaminadas',
    ]),
    requiredFields: Object.freeze([
        'phase',
        'stakeholder',
        'data-nature',
        'technical-responsible',
        'evidence',
        'technical-classification',
    ]),
    validationRules: Object.freeze([
        'Toda atividade publicada deve ter fase, parte interessada e natureza de dados preenchidas.',
        'Toda decisao tecnica deve citar a evidencia que sustenta a classificacao DD-38.',
        'Conectores obrigatorios precisam declarar dado transportado ou justificativa.',
        'Gate condicional com mais de uma saida deve ter criterio por rota e fallback explicito.',
    ]),
});

export const MINERAL_PROCESSING: ProcessDomainProfile = Object.freeze({
    domain: 'mineral-processing',
    regulations: Object.freeze([
        'NR-22 - Seguranca e Saude Ocupacional na Mineracao',
        'ANM Resolucao 95/2022 - Seguranca de barragens de mineracao',
        'ABNT NBR 13028 - Elaboracao e apresentacao de projeto de barragens',
    ]),
    requiredFields: Object.freeze([
        'phase',
        'stakeholder',
        'data-nature',
        'ore-type',
        'granulometry-p80',
        'recovery',
        'mass-balance',
        'tailings-route',
        'water-energy',
    ]),
    validationRules: Object.freeze([
        'Balanco de massa deve fechar dentro da tolerancia antes de publicar KPI.',
        'Rota de rejeitos e agua recuperada devem estar definidas antes de liberar o ciclo.',
        'Granulometria/P80 alvo deve estar calibrada por minerio antes da concentracao.',
        'Gate condicional com mais de uma saida deve ter criterio por rota e fallback explicito.',
    ]),
});

export const GENERIC: ProcessDomainProfile = Object.freeze({
    domain: 'generic',
    regulations: Object.freeze([]),
    requiredFields: Object.freeze([
        'phase',
        'stakeholder',
        'data-nature',
    ]),
    validationRules: Object.freeze([
        'Grafo do processo deve ter conectores com origem e destino validos.',
        'Toda decisao deve ter fallback explicito.',
        'Pack sem perfil escolhido deve ser marcado como generico e confirmado pelo usuario antes de publicar.',
    ]),
});

export const PROCESS_DOMAIN_PROFILES: Readonly<Record<'GAC_DD38' | 'MINERAL_PROCESSING' | 'GENERIC', ProcessDomainProfile>> = Object.freeze({
    GAC_DD38,
    MINERAL_PROCESSING,
    GENERIC,
});

const PROFILE_BY_DOMAIN: Readonly<Record<ProcessDomainId, ProcessDomainProfile>> = Object.freeze({
    'gac-dd38': GAC_DD38,
    'mineral-processing': MINERAL_PROCESSING,
    generic: GENERIC,
});

const DOMAIN_ALIASES: ReadonlyArray<readonly [ProcessDomainId, readonly string[]]> = Object.freeze([
    Object.freeze([
        'gac-dd38',
        Object.freeze([
            'gac-dd38',
            'gac_dd38',
            'gac dd38',
            'gac/dd38',
            'gac',
            'dd38',
            'dd-38',
            'cetesb dd38',
            'cetesb dd-38',
            'areas contaminadas',
            'gestao de areas contaminadas',
        ]),
    ]),
    Object.freeze([
        'mineral-processing',
        Object.freeze([
            'mineral-processing',
            'mineral_processing',
            'mineral processing',
            'beneficiamento',
            'beneficiamento mineral',
            'mine-beneficiation',
            'mine beneficiation',
            'mineracao',
            'planta de beneficiamento',
            'rom-to-product',
        ]),
    ]),
    Object.freeze([
        'generic',
        Object.freeze([
            'generic',
            'generico',
            'generic-process',
            'generic process',
            'processo generico',
            'default',
        ]),
    ]),
]) as ReadonlyArray<readonly [ProcessDomainId, readonly string[]]>;

function normalizeDomainKey(value: unknown): string {
    return String(value ?? '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

export function getDomainProfile(domain?: string | null): ProcessDomainProfile {
    const normalized = normalizeDomainKey(domain);
    for (const [domainId, aliases] of DOMAIN_ALIASES) {
        if (aliases.some((alias) => normalizeDomainKey(alias) === normalized)) {
            return PROFILE_BY_DOMAIN[domainId];
        }
    }
    return GENERIC;
}
