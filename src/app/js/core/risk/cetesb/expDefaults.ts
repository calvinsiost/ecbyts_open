// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Parâmetros Exposicionais — bases padrão CETESB V 4.00 (março/2026).
// Portados do Manual do Usuário Anexo C (PDF pg 53+), uma linha por
// (cenário receptor × faixa etária aplicável).
//
// IMPORTANTE: valores Object.freeze (ADR-A2). RiskAssessmentInput NÃO permite
// override de EXP — esses parâmetros são fixados pelo regulamento.
//
// SPEC: docs/specs/features/SPEC_CETESB_RISK_ASSESSMENT.md (CETESB-RISK-001) RF-1.2

import type { ScenarioId } from './_riskCatalogPure.js';

/** Faixa etária — Criança (~16 kg) ou Adulto (~69 kg). */
export type AgeGroup = 'child' | 'adult';

/**
 * Parâmetros exposicionais CETESB (Anexo C Manual V 4.00 mar/2026).
 * Subset mínimo para Fase 1 MVP.
 */
export interface ExpParams {
    /** ED — Duração da exposição (anos) */
    ED: number;
    /** ExpVida — Expectativa de vida (anos) */
    ExpVida: number;
    /** ATc — Tempo médio para efeitos carcinogênicos (dias) */
    ATc: number;
    /** ATn — Tempo médio para efeitos não carcinogênicos (dias) */
    ATn: number;
    /** BW — Massa corpórea (kg) */
    BW: number;
    /** ET_inalParticSoloSup — Tempo de exposição inalação partículas/vapores solo superficial (h/dia) */
    ET_inalParticSoloSup: number;
    /** ET_inalVaporAberto — Tempo de exposição inalação vapores ambientes abertos (h/dia) */
    ET_inalVaporAberto: number;
    /** ET_inalVaporFechado — Tempo de exposição inalação vapores ambientes fechados (h/dia) */
    ET_inalVaporFechado: number;
    /** ET_contatoDermalAS — Tempo de exposição contato dérmico com água sub (h/dia) */
    ET_contatoDermalAS: number;
    /** EF_contatoDermalSolo — Frequência exposição contato dérmico solo (dias/ano) */
    EF_contatoDermalSolo: number;
}

/**
 * Defaults por cenário × faixa etária.
 * RES_URB/RES_RUR: ambos child+adult. TRAB_*: somente adult (recortes regulatórios).
 *
 * Referências CETESB Anexo C:
 * - IBGE 2018 (média SP h+m) — ExpVida
 * - USEPA 1989 (pg 6-23 OSWER 9200.1-120 2014) — ATc, ATn
 * - IBGE 2010a — BW
 * - USEPA 1991a — ED residencial, EF contato dérmico solo
 * - USEPA 1991c, 2002 Exhibit 5-1 — ED rural / obra civil
 * - CETESB 2001/2009 — ET_inal* específicos por cenário
 * - Capeleti 2000 — ET fechado
 */
export const EXP_DEFAULTS: Readonly<Record<ScenarioId, Partial<Record<AgeGroup, Readonly<ExpParams>>>>> = Object.freeze({
    RES_URB: Object.freeze({
        child: Object.freeze({
            ED: 6.0,
            ExpVida: 78.4,
            ATc: 28616.0,
            ATn: 2190.0,
            BW: 16.1,
            ET_inalParticSoloSup: 8.0,
            ET_inalVaporAberto: 8.0,
            ET_inalVaporFechado: 16.0,
            ET_contatoDermalAS: 0.54,
            EF_contatoDermalSolo: 350.0,
        }),
        adult: Object.freeze({
            ED: 30.0, // USEPA 1991a residencial — parity verified vs planilha v4.00 ResUrb
            ExpVida: 78.4,
            ATc: 28616.0,
            ATn: 10950.0, // parity verified vs planilha v4.00 ResUrb
            BW: 69.0,
            ET_inalParticSoloSup: 8.0,
            ET_inalVaporAberto: 8.0,
            ET_inalVaporFechado: 16.0,
            ET_contatoDermalAS: 0.71,
            EF_contatoDermalSolo: 350.0,
        }),
    }),
    RES_RUR: Object.freeze({
        child: Object.freeze({
            ED: 6.0,
            ExpVida: 78.4,
            ATc: 28616.0,
            ATn: 2190.0,
            BW: 16.1,
            ET_inalParticSoloSup: 4.0,
            ET_inalVaporAberto: 8.0,
            ET_inalVaporFechado: 16.0,
            ET_contatoDermalAS: 0.54,
            EF_contatoDermalSolo: 350.0,
        }),
        adult: Object.freeze({
            ED: 78.4, // CETESB residencial rural — parity verified vs planilha v4.00 ResRural
            ExpVida: 78.4,
            ATc: 28616.0,
            ATn: 28616.0, // parity verified vs planilha v4.00 ResRural
            BW: 69.0,
            ET_inalParticSoloSup: 2.0,
            ET_inalVaporAberto: 8.0,
            ET_inalVaporFechado: 16.0,
            ET_contatoDermalAS: 0.71,
            EF_contatoDermalSolo: 350.0,
        }),
    }),
    TRAB_COM_IND: Object.freeze({
        adult: Object.freeze({
            ED: 25.0, // USEPA 1991a comercial/industrial
            ExpVida: 78.4,
            ATc: 28616.0,
            ATn: 9125.0,
            BW: 69.0,
            ET_inalParticSoloSup: 8.0,
            ET_inalVaporAberto: 8.0,
            ET_inalVaporFechado: 8.0,
            ET_contatoDermalAS: 2.0,
            EF_contatoDermalSolo: 250.0, // USEPA OSWER directive
        }),
    }),
    TRAB_OBRA_CIV: Object.freeze({
        adult: Object.freeze({
            ED: 1.0, // USEPA 2002 Exhibit 5-1 — duração curta de obra civil
            ExpVida: 78.4,
            ATc: 28616.0,
            ATn: 250.0, // USEPA 2002 Exhibit 5-1
            BW: 69.0,
            ET_inalParticSoloSup: 8.0,
            ET_inalVaporAberto: 8.0,
            ET_inalVaporFechado: 8.0,
            ET_contatoDermalAS: 8.0,
            EF_contatoDermalSolo: 250.0,
        }),
    }),
});

/**
 * Retorna parâmetros exposicionais para um cenário + faixa etária.
 * Cenários trabalhador retornam undefined se age='child' (não aplicável).
 */
export function getExpDefaults(
    scenarioId: ScenarioId,
    ageGroup: AgeGroup = 'adult',
): Readonly<ExpParams> | undefined {
    const scen = EXP_DEFAULTS[scenarioId];
    if (!scen) return undefined;
    return scen[ageGroup];
}

/** Lista as faixas etárias aplicáveis a um cenário. */
export function listAgeGroups(scenarioId: ScenarioId): ReadonlyArray<AgeGroup> {
    const scen = EXP_DEFAULTS[scenarioId];
    if (!scen) return [];
    const groups: AgeGroup[] = [];
    if (scen.child) groups.push('child');
    if (scen.adult) groups.push('adult');
    return Object.freeze(groups);
}

/** Source string para auditoria. */
export const EXP_SOURCE = 'CETESB DD 103/2007/C/E v4.00 — Anexo C (mar/2026)' as const;
