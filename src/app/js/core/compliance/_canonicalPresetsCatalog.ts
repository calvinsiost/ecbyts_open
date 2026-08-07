// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Canonical Compliance Presets — catálogo seedado dos presets memoráveis
 * (claude - novaspec, 2026-06-04).
 *
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET §4.2 — 24 presets memoráveis em
 * 6 categorias. Esta slice (PoC) seeda 6 dos mais memoráveis (1 por categoria),
 * cobrindo o caso de uso de boot offline-first.
 *
 * Categorias (§4.2):
 *   A. Reguladores oficiais
 *   B. Frameworks corporativos internacionais
 *   C. ⭐ Pareto / Envelope conservador (resposta Calvin)
 *   D. Aspiracionais Net Zero / 1.5°C
 *   E. Setoriais especializados
 *   F. Históricos + stress test
 *
 * Cada preset tem `contentHash` placeholder (calculado em F1b via
 * _componentsHashPure quando components manager existir). Naming segue
 * ADR A10 (`PRESET_ID_REGEX`).
 *
 * Out of scope desta slice:
 *   - Os 18 presets restantes (V2 expansion)
 *   - Trust chain `authoritySignature` (D6 / ADR A7 — futura)
 *   - Pareto dinâmico `composePresets` (RF21 — _bannerMarkupPure cobre,
 *     mas catalog Pareto canonical aqui seedado estático)
 *
 * Tests: tests/compliance-canonical-presets-catalog.test.mjs
 */

import { PRESET_ID_REGEX, validatePreset } from './_presetPure.js';
import type { CompliancePreset } from './_presetPure.js';

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

/** placeholder contentHash até cascade hash (B12) ser computado. */
const PH = '0000000000000000000000000000000000000000000000000000000000000000';

// ----------------------------------------------------------------
// CATÁLOGO — 6 presets memoráveis (V1 PoC)
// ----------------------------------------------------------------

/** A. Regulador oficial — default Brasil federal. */
const A_CONAMA_420_AR4: CompliancePreset = Object.freeze({
    id: 'br-conama-420-ar4',
    version: '2009.0',
    nameKey: 'compliance.preset.br-conama-420-ar4.name',
    descriptionKey: 'compliance.preset.br-conama-420-ar4.desc',
    publishedBy: Object.freeze({
        authority: 'CONAMA',
        level: 'federal',
        jurisdiction: 'BR',
    }),
    legalBasis: Object.freeze(['Resolução CONAMA 420/2009', 'Decisão UNFCCC 24/CP.19']),
    effectiveFrom: '2009-12-30',
    validationProfileId: 'br-conama-420-2009',
    ghgFactors: Object.freeze({ gwpVersion: 'AR4' as const, timeHorizon: 100 as const }),
    emissionFactorsRegistry: 'br-ipcc-2006',
    taxonomyId: 'abnt-nbr-soil',
    reportTemplateIds: Object.freeze(['conama-420-soil-template']),
    eisWeights: Object.freeze({ T: 4, A: 3, Cp: 2, Ty: 2, Cs: 1, Cm: 1 }),
    spatialCrs: 'EPSG:31983',
    unitSystem: 'SI' as const,
    auditRetentionDays: 1825,
    currencyCode: 'BRL',
    languagePrimary: 'pt-BR',
    bannerColor: '#10b981',
    bannerIconKey: 'flag.br',
    bannerLabelKey: 'compliance.preset.br-conama-420-ar4.banner',
    contentHash: PH,
}) as CompliancePreset;

/** B. Framework corporativo — base de TUDO em ~95% das empresas globais. */
const B_GHG_PROTOCOL_CORPORATE: CompliancePreset = Object.freeze({
    id: 'global-ghg-protocol-corporate',
    version: '2015.1',
    nameKey: 'compliance.preset.ghg-protocol.name',
    descriptionKey: 'compliance.preset.ghg-protocol.desc',
    publishedBy: Object.freeze({
        authority: 'GHG Protocol',
        level: 'international',
        jurisdiction: 'GLOBAL',
    }),
    legalBasis: Object.freeze(['GHG Protocol Corporate Standard (Revised 2015)']),
    effectiveFrom: '2015-01-01',
    ghgFactors: Object.freeze({ gwpVersion: 'AR5' as const, timeHorizon: 100 as const }),
    emissionFactorsRegistry: 'eu-mrv-2023',
    eisWeights: Object.freeze({ T: 3, A: 4, Cp: 2, Ty: 2, Cs: 1, Cm: 1 }),
    spatialCrs: 'EPSG:4326',
    unitSystem: 'SI' as const,
    auditRetentionDays: 3650,
    currencyCode: 'USD',
    languagePrimary: 'en-US',
    bannerColor: '#3b82f6',
    bannerIconKey: 'icon.globe',
    bannerLabelKey: 'compliance.preset.ghg-protocol.banner',
    contentHash: PH,
}) as CompliancePreset;

/** C. ⭐ Pareto envelope — resposta direta à pergunta Calvin "padrão mais restritivo mundial". */
const C_PARETO_MOST_RESTRICTIVE_WORLDWIDE: CompliancePreset = Object.freeze({
    id: 'global-pareto-most-restrictive-worldwide',
    version: '2026.1',
    nameKey: 'compliance.preset.pareto-worldwide.name',
    descriptionKey: 'compliance.preset.pareto-worldwide.desc',
    publishedBy: Object.freeze({
        authority: 'ecbyts',
        level: 'international',
        jurisdiction: 'GLOBAL',
    }),
    legalBasis: Object.freeze([
        'min(CONAMA 420, CETESB DD256, EPA RCRA, EU CSRD/ESRS, ISSB S2)',
        'Pareto envelope conservador derivado',
    ]),
    effectiveFrom: '2026-01-01',
    ghgFactors: Object.freeze({ gwpVersion: 'AR6' as const, timeHorizon: 100 as const }),
    emissionFactorsRegistry: 'global-ipcc-ar6',
    eisWeights: Object.freeze({ T: 3, A: 4, Cp: 3, Ty: 2, Cs: 1, Cm: 1 }),
    spatialCrs: 'EPSG:4326',
    unitSystem: 'SI' as const,
    auditRetentionDays: 3650,
    currencyCode: 'USD',
    languagePrimary: 'en-US',
    bannerColor: '#7c3aed',
    bannerIconKey: 'icon.shield',
    bannerLabelKey: 'compliance.preset.pareto-worldwide.banner',
    contentHash: PH,
}) as CompliancePreset;

/** D. Aspiracional Net Zero — alinhado Paris Agreement Art. 4.1. */
const D_NET_ZERO_2050: CompliancePreset = Object.freeze({
    id: 'global-aspirational-net-zero-2050',
    version: '2021.1',
    nameKey: 'compliance.preset.net-zero-2050.name',
    descriptionKey: 'compliance.preset.net-zero-2050.desc',
    publishedBy: Object.freeze({
        authority: 'UNFCCC',
        level: 'international',
        jurisdiction: 'GLOBAL',
    }),
    legalBasis: Object.freeze(['Paris Agreement Art. 4.1', 'SBTi 1.5°C pathway']),
    effectiveFrom: '2021-11-01',
    ghgFactors: Object.freeze({ gwpVersion: 'AR6' as const, timeHorizon: 100 as const }),
    emissionFactorsRegistry: 'global-ipcc-ar6',
    eisWeights: Object.freeze({ T: 2, A: 3, Cp: 4, Ty: 2, Cs: 1, Cm: 1 }),
    spatialCrs: 'EPSG:4326',
    unitSystem: 'SI' as const,
    auditRetentionDays: 10950,
    currencyCode: 'EUR',
    languagePrimary: 'en-US',
    bannerColor: '#059669',
    bannerIconKey: 'icon.leaf',
    bannerLabelKey: 'compliance.preset.net-zero-2050.banner',
    contentHash: PH,
}) as CompliancePreset;

/** E. Setorial — Mining (ICMM + IBRAM). */
const E_MINING_ICMM: CompliancePreset = Object.freeze({
    id: 'global-sector-mining-icmm',
    version: '2024.0',
    nameKey: 'compliance.preset.mining-icmm.name',
    descriptionKey: 'compliance.preset.mining-icmm.desc',
    publishedBy: Object.freeze({
        authority: 'ICMM',
        level: 'sectoral',
        jurisdiction: 'GLOBAL',
    }),
    legalBasis: Object.freeze(['ICMM Performance Expectations 2024', 'IBRAM Diretrizes Mineração BR']),
    effectiveFrom: '2024-01-01',
    ghgFactors: Object.freeze({ gwpVersion: 'AR6' as const, timeHorizon: 100 as const }),
    emissionFactorsRegistry: 'global-ipcc-ar6',
    eisWeights: Object.freeze({ T: 3, A: 3, Cp: 2, Ty: 3, Cs: 1, Cm: 1 }),
    spatialCrs: 'EPSG:31983',
    unitSystem: 'SI' as const,
    auditRetentionDays: 3650,
    currencyCode: 'USD',
    languagePrimary: 'en-US',
    bannerColor: '#a16207',
    bannerIconKey: 'icon.pickaxe',
    bannerLabelKey: 'compliance.preset.mining-icmm.banner',
    contentHash: PH,
}) as CompliancePreset;

/** F. Histórico — Kyoto 1997 baseline (GWP SAR) para auditoria retroativa pré-2013. */
const F_KYOTO_SAR_1997: CompliancePreset = Object.freeze({
    id: 'global-legacy-kyoto-sar-1997',
    version: '1997.0',
    nameKey: 'compliance.preset.kyoto-sar-1997.name',
    descriptionKey: 'compliance.preset.kyoto-sar-1997.desc',
    publishedBy: Object.freeze({
        authority: 'UNFCCC',
        level: 'international',
        jurisdiction: 'GLOBAL',
    }),
    legalBasis: Object.freeze(['Kyoto Protocol Art. 3 (1997)', 'IPCC SAR Working Group I']),
    effectiveFrom: '1997-12-11',
    effectiveTo: '2012-12-31',
    ghgFactors: Object.freeze({ gwpVersion: 'SAR' as const, timeHorizon: 100 as const }),
    emissionFactorsRegistry: 'br-ipcc-2006',
    eisWeights: Object.freeze({ T: 3, A: 3, Cp: 2, Ty: 2, Cs: 1, Cm: 1 }),
    spatialCrs: 'EPSG:4326',
    unitSystem: 'SI' as const,
    auditRetentionDays: 10950,
    currencyCode: 'USD',
    languagePrimary: 'en-US',
    bannerColor: '#6b7280',
    bannerIconKey: 'icon.archive',
    bannerLabelKey: 'compliance.preset.kyoto-sar-1997.banner',
    contentHash: PH,
}) as CompliancePreset;

// ----------------------------------------------------------------
// G. SAÚDE OCUPACIONAL — Calvin: "normas de saúde e segurança?"
// ACGIH é a referência global de TLV/BEI. NR-7 PCMSO é obrigatório no Brasil.
// ----------------------------------------------------------------

/** G. ACGIH TLV-TWA + BEI 2024 — referência global limites exposição ocupacional. */
const G_ACGIH_TLV_BEI_2024: CompliancePreset = Object.freeze({
    id: 'global-acgih-tlv-bei-2024',
    version: '2024.0',
    nameKey: 'compliance.preset.acgih-tlv-bei-2024.name',
    descriptionKey: 'compliance.preset.acgih-tlv-bei-2024.desc',
    publishedBy: Object.freeze({
        authority: 'ACGIH',
        level: 'international',
        jurisdiction: 'GLOBAL',
    }),
    legalBasis: Object.freeze([
        'ACGIH TLVs and BEIs 2024 — Threshold Limit Values and Biological Exposure Indices',
        'NIOSH REL (Recommended Exposure Limits)',
        'OSHA PEL (Permissible Exposure Limits) — fallback US',
    ]),
    effectiveFrom: '2024-01-01',
    validationProfileId: 'global-acgih-tlv-bei-2024',
    ghgFactors: Object.freeze({ gwpVersion: 'AR6' as const, timeHorizon: 100 as const }),
    emissionFactorsRegistry: 'acgih-bei-2024',
    taxonomyId: 'acgih-cas-categorized',
    reportTemplateIds: Object.freeze(['acgih-exposure-monitoring-report']),
    eisWeights: Object.freeze({ T: 5, A: 2, Cp: 2, Ty: 1, Cs: 1, Cm: 1 }),
    spatialCrs: 'EPSG:4326',
    unitSystem: 'SI' as const,
    auditRetentionDays: 10950, // 30 anos — exigência ATSDR/ACGIH
    currencyCode: 'USD',
    languagePrimary: 'en-US',
    bannerColor: '#dc2626',
    bannerIconKey: 'icon.shield-health',
    bannerLabelKey: 'compliance.preset.acgih-tlv-bei-2024.banner',
    contentHash: PH,
}) as CompliancePreset;

/** H. NR-7 PCMSO + NR-15 LT — saúde ocupacional Brasil (obrigatório CLT). */
const H_BR_NR7_PCMSO: CompliancePreset = Object.freeze({
    id: 'br-nr7-pcmso-nr15-lt',
    version: '2022.1',
    nameKey: 'compliance.preset.br-nr7-pcmso.name',
    descriptionKey: 'compliance.preset.br-nr7-pcmso.desc',
    publishedBy: Object.freeze({
        authority: 'MTE/SEPRT',
        level: 'federal',
        jurisdiction: 'BR',
    }),
    legalBasis: Object.freeze([
        'NR-7 PCMSO — Programa de Controle Médico de Saúde Ocupacional (Portaria 6.734/2020)',
        'NR-15 — Atividades e Operações Insalubres (Limites de Tolerância LT)',
        'NR-9 PGR — Programa de Gerenciamento de Riscos (substituto PPRA, 2022)',
        'INSS PPP — Perfil Profissiográfico Previdenciário',
    ]),
    effectiveFrom: '2022-01-03',
    validationProfileId: 'br-nr7-nr15-2022',
    ghgFactors: Object.freeze({ gwpVersion: 'AR6' as const, timeHorizon: 100 as const }),
    emissionFactorsRegistry: 'br-nr15-anexos-1-13',
    taxonomyId: 'br-abnt-nr7-aso',
    reportTemplateIds: Object.freeze([
        'br-aso-admissional',
        'br-aso-periodico',
        'br-aso-demissional',
        'br-ppp-inss',
        'br-ltcat-laudo-tecnico',
    ]),
    eisWeights: Object.freeze({ T: 5, A: 2, Cp: 2, Ty: 1, Cs: 1, Cm: 1 }),
    spatialCrs: 'EPSG:31983',
    unitSystem: 'SI' as const,
    auditRetentionDays: 7300, // 20 anos — exigência INSS PPP
    currencyCode: 'BRL',
    languagePrimary: 'pt-BR',
    bannerColor: '#dc2626',
    bannerIconKey: 'icon.shield-health',
    bannerLabelKey: 'compliance.preset.br-nr7-pcmso.banner',
    contentHash: PH,
}) as CompliancePreset;

// ----------------------------------------------------------------
// EXPORTS — catalog frozen
// ----------------------------------------------------------------

/**
 * 8 presets memoráveis canônicos seedados (6 ambientais + 2 saúde ocupacional).
 *
 * Boot offline-first: app pode operar com este catálogo sem rede.
 * Registry pública Supabase (RS1) adiciona presets além destes em runtime.
 */
export const CANONICAL_PRESETS: ReadonlyArray<CompliancePreset> = Object.freeze([
    A_CONAMA_420_AR4,
    B_GHG_PROTOCOL_CORPORATE,
    C_PARETO_MOST_RESTRICTIVE_WORLDWIDE,
    D_NET_ZERO_2050,
    E_MINING_ICMM,
    F_KYOTO_SAR_1997,
    G_ACGIH_TLV_BEI_2024,
    H_BR_NR7_PCMSO,
]);

/** Categorias com 1 preset memorável seedado cada. */
export const CANONICAL_PRESET_CATEGORIES = Object.freeze({
    A_regulators: A_CONAMA_420_AR4,
    B_corporate_frameworks: B_GHG_PROTOCOL_CORPORATE,
    C_pareto_envelope: C_PARETO_MOST_RESTRICTIVE_WORLDWIDE,
    D_aspirational_net_zero: D_NET_ZERO_2050,
    E_sectoral: E_MINING_ICMM,
    F_historical: F_KYOTO_SAR_1997,
} as const);

/** Lookup O(N) por id (N=6 ⇒ trivial). */
export function findCanonicalPreset(id: string | null | undefined): CompliancePreset | null {
    if (typeof id !== 'string' || id.length === 0) return null;
    for (const p of CANONICAL_PRESETS) {
        if (p.id === id) return p;
    }
    return null;
}

/**
 * Valida que todos os presets do catálogo passam pelo `validatePreset()`.
 * Esta função NÃO é chamada em runtime — usada apenas em test boot para
 * provar invariante "catálogo seedado é estruturalmente válido".
 */
export function validateAllCanonical(): ReadonlyArray<{ id: string; errors: ReadonlyArray<string> }> {
    const result: Array<{ id: string; errors: ReadonlyArray<string> }> = [];
    for (const p of CANONICAL_PRESETS) {
        const v = validatePreset(p);
        if (!v.valid) result.push({ id: p.id, errors: v.errors });
    }
    return Object.freeze(result);
}

/** Sanity: cada id do catálogo respeita PRESET_ID_REGEX. */
export function allIdsMatchRegex(): boolean {
    for (const p of CANONICAL_PRESETS) {
        if (!PRESET_ID_REGEX.test(p.id)) return false;
    }
    return true;
}
