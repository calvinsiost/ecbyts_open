// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// TRUST-010 W11 — Regulatory Framework Registry (non-BR jurisdictions).
//
// Hoje várias constantes operacionais (buffer 500m GAC, setback distances)
// estão hard-coded ao CETESB DD-038/2017. Este registry consolida 4 frameworks
// canônicos para habilitar marketplace global e relatórios multi-jurisdição.
//
// Cada framework declara:
//   - id, country, name, body (agência reguladora)
//   - defaultBufferRadiusM (raio mínimo de avaliação preliminar)
//   - defaultSetbackDistances (residencial, water_body) em metros
//   - sourceCitation (norma + ano)
//   - thresholdCatalogId (link com globalThresholds.ts)
//
// NÃO substitui globalThresholds.ts (que cataloga valores químicos por CAS).
// Este módulo cataloga REGRAS OPERACIONAIS (raios, distâncias, frequência).
//
// Adoção: handlers que hoje hard-codam 500m (radiusBuffer DEFAULT_GAC_RADIUS_M)
// devem consultar `getActiveFramework().defaultBufferRadiusM` quando feature
// flag `regulatory_framework_active` estiver ativa. Sem flag = comportamento
// CETESB atual preservado (backward compat).

export interface RegulatoryFramework {
    readonly id: string;
    readonly country: string;
    readonly countryCode: string; // ISO 3166-1 alpha-2
    readonly name: string;
    readonly body: string;
    readonly defaultBufferRadiusM: number;
    readonly defaultSetbackResidentialM: number;
    readonly defaultSetbackWaterBodyM: number;
    readonly sourceCitation: string;
    readonly thresholdCatalogId: string;
    readonly assessmentPhases: readonly string[];
}

// ──────────────────────────────────────────────────────────────────────
// Registry canônico — 4 frameworks (BR ✅ + 3 internacionais ⏳ adoption)
// ──────────────────────────────────────────────────────────────────────

const _FRAMEWORKS: Record<string, RegulatoryFramework> = {
    'br-cetesb-dd038': {
        id: 'br-cetesb-dd038',
        country: 'Brasil',
        countryCode: 'BR',
        name: 'CETESB Decisão de Diretoria 038/2017',
        body: 'CETESB — Companhia Ambiental do Estado de São Paulo',
        defaultBufferRadiusM: 500, // GAC — Avaliação Preliminar
        defaultSetbackResidentialM: 30, // CONAMA 420 Anexo II indicativo
        defaultSetbackWaterBodyM: 30, // APP fluvial menor (Cód. Florestal Lei 12.651/2012)
        sourceCitation: 'CETESB DD 038/2017-C/E + CONAMA 420/2009 + Decreto SP 59.263/2013',
        thresholdCatalogId: 'BR-CETESB',
        assessmentPhases: ['AP', 'AC', 'AD', 'AR'], // Preliminar, Confirmatória, Detalhada, Risco
    },
    'us-epa-cercla': {
        id: 'us-epa-cercla',
        country: 'United States',
        countryCode: 'US',
        name: 'EPA CERCLA / Brownfields',
        body: 'United States Environmental Protection Agency',
        defaultBufferRadiusM: 1609, // 1 mile (Phase I ESA radius — ASTM E1527-21)
        defaultSetbackResidentialM: 91, // 300 ft typical receptor distance
        defaultSetbackWaterBodyM: 30, // 100 ft Clean Water Act buffer (varies by state)
        sourceCitation: 'CERCLA 42 USC §9601 + ASTM E1527-21 Phase I ESA + EPA RCRA',
        thresholdCatalogId: 'US-EPA',
        assessmentPhases: ['Phase I', 'Phase II', 'Phase III'],
    },
    'eu-inspire-soil': {
        id: 'eu-inspire-soil',
        country: 'European Union',
        countryCode: 'EU',
        name: 'EU INSPIRE Soil Directive + Industrial Emissions Directive',
        body: 'European Commission DG Environment',
        defaultBufferRadiusM: 500, // INSPIRE Data Specifications + IED 2010/75/EU
        defaultSetbackResidentialM: 50, // EU IED indicative
        defaultSetbackWaterBodyM: 50, // Water Framework Directive 2000/60/EC
        sourceCitation: 'Directive 2007/2/EC (INSPIRE) + 2010/75/EU (IED) + 2000/60/EC (WFD)',
        thresholdCatalogId: 'EU-INSPIRE',
        assessmentPhases: ['Screening', 'Site Investigation', 'Risk Assessment'],
    },
    'jp-soca-2002': {
        id: 'jp-soca-2002',
        country: 'Japan',
        countryCode: 'JP',
        name: 'Soil Contamination Countermeasures Act (SCCA)',
        body: 'Ministry of the Environment Japan (MOEJ)',
        defaultBufferRadiusM: 250, // Article 6 designation area typical
        defaultSetbackResidentialM: 20, // SCCA Article 7
        defaultSetbackWaterBodyM: 30, // Basic Environment Act
        sourceCitation: 'Soil Contamination Countermeasures Act (Law No. 53 of 2002) + Cabinet Order',
        thresholdCatalogId: 'JP-MOEJ',
        assessmentPhases: ['Phase 1 Designation', 'Phase 2 Investigation', 'Phase 3 Remediation'],
    },
};

// ──────────────────────────────────────────────────────────────────────
// Pure-logic API
// ──────────────────────────────────────────────────────────────────────

/** Retorna todos os frameworks registrados (read-only). */
export function getAllFrameworks(): readonly RegulatoryFramework[] {
    return Object.freeze(Object.values(_FRAMEWORKS));
}

/** Busca framework por ID; null se não existir. */
export function getFrameworkById(id: string): RegulatoryFramework | null {
    return _FRAMEWORKS[id] || null;
}

/** Frameworks aplicáveis a um país (ISO 3166-1 alpha-2). */
export function getFrameworksByCountry(countryCode: string): readonly RegulatoryFramework[] {
    const cc = (countryCode || '').toUpperCase();
    return getAllFrameworks().filter((f) => f.countryCode === cc);
}

/**
 * Retorna framework ativo para a operação atual. Por padrão, CETESB (backward
 * compat ecbyts). Quando feature flag `regulatory_framework_active` for setada
 * no localStorage (string com ID), retorna o framework correspondente.
 * Adoção: handlers leem `getActiveFramework().defaultBufferRadiusM` em vez de
 * hard-codar 500m.
 */
export function getActiveFramework(): RegulatoryFramework {
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
        try {
            const activeId = (globalThis as any).localStorage.getItem('ecbyts-active-regulatory-framework');
            if (activeId && _FRAMEWORKS[activeId]) return _FRAMEWORKS[activeId];
        } catch (e) {
            console.debug('[regulatoryFrameworks:getActive] localStorage unavailable:', (e as any)?.message || e);
        }
    }
    return _FRAMEWORKS['br-cetesb-dd038']!; // default canônico sempre presente
}

/** Total de frameworks registrados (audit helper). */
export function getFrameworkCount(): number {
    return Object.keys(_FRAMEWORKS).length;
}
