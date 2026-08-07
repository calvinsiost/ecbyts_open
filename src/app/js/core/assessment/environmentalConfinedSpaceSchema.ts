// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Environmental Confined Space Schema — avaliação atmosférica e classificação
 * de risco de entrada em espaços confinados (tanques, poços, galerias, silos,
 * estações de tratamento, escavações de mineração).
 *
 * Classifica a atmosfera contra limites canônicos de O₂, gases inflamáveis
 * (% LEL), e gases tóxicos (CO, H₂S) e determina se a entrada é proibida,
 * requer permissão (PRCS) ou é liberada. Calcula um score de risco composto
 * para priorização e gating de checklists de entrada.
 *
 * Aplicável a digital twins de plantas industriais, mineração subterrânea
 * (atmosferas deficientes em O₂ por oxidação de sulfetos), saneamento
 * (galerias com H₂S de decomposição anaeróbia) e tanques de processo.
 *
 * Referências regulatórias e científicas:
 *  - Brasil — NR-33 (Segurança e Saúde nos Trabalhos em Espaços Confinados),
 *    Portaria SIT 202/2006 e atualizações. (O₂ aceitável 20.9% nominal;
 *    abaixo de 20.5% deficiente, acima de 23% enriquecido; LEL < 10%;
 *    permissão de entrada e trabalho — PET)
 *  - US OSHA 29 CFR 1910.146 (Permit-Required Confined Spaces). (O₂ 19.5–23.5%;
 *    flammable < 10% LEL; classificação permit-required vs non-permit)
 *  - NIOSH Criteria for a Recommended Standard: Working in Confined Spaces
 *    (DHHS/NIOSH 80-106).
 *  - ACGIH TLV 2024: CO TWA 25 ppm; H₂S TWA 1 ppm / STEL 5 ppm. (limites de
 *    alarme operacional CO 35 ppm, H₂S 10 ppm conforme prática de campo)
 *  - Brasil — NR-15 Anexos 11/13 (limites de tolerância agentes químicos).
 *
 * Zero dependências DOM/IDB/Three.js/fetch. Pure-logic.
 * @module environmentalConfinedSpaceSchema
 */

/**
 * Limites atmosféricos canônicos (NR-33 / OSHA / ACGIH).
 * Frozen — fontes citadas no header.
 */
export const ATMOSPHERIC_LIMITS = Object.freeze({
    O2_MIN_SAFE: 20.9 - 0.4, // 20.5% — abaixo = deficiente (NR-33)
    O2_MAX_SAFE: 23.0, // acima = enriquecido (risco incêndio)
    O2_MIN_OSHA: 19.5, // OSHA permit threshold
    O2_MAX_OSHA: 23.5, // OSHA upper
    LEL_MAX_PCT: 10, // % LEL máximo aceitável
    CO_PPM_MAX: 35, // CO alarme operacional (ppm)
    CO_PPM_TWA: 25, // ACGIH TWA
    H2S_PPM_MAX: 10, // H₂S alarme operacional (ppm)
    H2S_PPM_STEL: 5, // ACGIH STEL
});

/** Classificação de entrada (escala ordinal de severidade). */
export const ENTRY_CLASS = Object.freeze({
    PROHIBITED: 'PROHIBITED', // condição IDLH — entrada proibida sem mitigação
    PERMIT_REQUIRED: 'PERMIT_REQUIRED', // PRCS — exige PET + supervisão
    SAFE: 'SAFE', // atmosfera dentro dos limites
});

/** Tipo de hazard atmosférico detectado. */
export const HAZARD_TYPE = Object.freeze({
    O2_DEFICIENT: 'O2_DEFICIENT',
    O2_ENRICHED: 'O2_ENRICHED',
    FLAMMABLE: 'FLAMMABLE',
    TOXIC_CO: 'TOXIC_CO',
    TOXIC_H2S: 'TOXIC_H2S',
});

export interface AtmosphereReading {
    /** Oxigênio (% volume). */
    o2Pct: number;
    /** Gases inflamáveis (% do Lower Explosive Limit). */
    lelPct?: number;
    /** Monóxido de carbono (ppm). */
    coPpm?: number;
    /** Sulfeto de hidrogênio (ppm). */
    h2sPpm?: number;
}

export interface ConfinedSpaceAssessment {
    hazards: string[];
    entryClass: string;
    riskScore: number; // 0..100 (maior = pior)
    o2Pct: number;
    lelPct: number;
    coPpm: number;
    h2sPpm: number;
}

/**
 * Detecta hazards atmosféricos a partir de uma leitura.
 * Retorna lista de HAZARD_TYPE (vazia = atmosfera segura).
 */
export function detectAtmosphericHazards(reading: AtmosphereReading): string[] {
    const L = ATMOSPHERIC_LIMITS;
    const hazards: string[] = [];
    const o2 = Number(reading?.o2Pct);
    const lel = Number(reading?.lelPct) || 0;
    const co = Number(reading?.coPpm) || 0;
    const h2s = Number(reading?.h2sPpm) || 0;

    if (Number.isFinite(o2)) {
        if (o2 < L.O2_MIN_SAFE) hazards.push(HAZARD_TYPE.O2_DEFICIENT);
        else if (o2 > L.O2_MAX_SAFE) hazards.push(HAZARD_TYPE.O2_ENRICHED);
    }
    if (lel >= L.LEL_MAX_PCT) hazards.push(HAZARD_TYPE.FLAMMABLE);
    if (co >= L.CO_PPM_MAX) hazards.push(HAZARD_TYPE.TOXIC_CO);
    if (h2s >= L.H2S_PPM_MAX) hazards.push(HAZARD_TYPE.TOXIC_H2S);
    return hazards;
}

/**
 * Classifica a entrada com base nos hazards detectados.
 *   O₂ < OSHA min (19.5) ou > OSHA max (23.5) → PROHIBITED (IDLH)
 *   LEL ≥ 10% → PROHIBITED (risco explosão)
 *   qualquer hazard tóxico/atmosférico moderado → PERMIT_REQUIRED
 *   sem hazards → SAFE
 */
export function classifyEntry(reading: AtmosphereReading): string {
    const L = ATMOSPHERIC_LIMITS;
    const o2 = Number(reading?.o2Pct);
    const lel = Number(reading?.lelPct) || 0;
    // Condições IDLH → proibido
    if (Number.isFinite(o2) && (o2 < L.O2_MIN_OSHA || o2 > L.O2_MAX_OSHA)) {
        return ENTRY_CLASS.PROHIBITED;
    }
    if (lel >= L.LEL_MAX_PCT) return ENTRY_CLASS.PROHIBITED;
    const hazards = detectAtmosphericHazards(reading);
    if (hazards.length > 0) return ENTRY_CLASS.PERMIT_REQUIRED;
    return ENTRY_CLASS.SAFE;
}

/**
 * Score de risco composto 0..100 (maior = pior).
 * Combina desvio de O₂ do ideal (20.9%), proximidade do LEL, e
 * frações de CO/H₂S sobre os limites de alarme. Saturado em 100.
 */
export function computeRiskScore(reading: AtmosphereReading): number {
    const L = ATMOSPHERIC_LIMITS;
    const o2 = Number(reading?.o2Pct);
    const lel = Number(reading?.lelPct) || 0;
    const co = Number(reading?.coPpm) || 0;
    const h2s = Number(reading?.h2sPpm) || 0;

    let score = 0;
    // O₂: desvio absoluto de 20.9% escalado (cada 1% de desvio ~ 20 pts)
    if (Number.isFinite(o2)) {
        score += Math.min(40, Math.abs(20.9 - o2) * 20);
    }
    // LEL: fração do limite × 40
    score += Math.min(40, (lel / L.LEL_MAX_PCT) * 40);
    // CO: fração do alarme × 20
    score += Math.min(20, (co / L.CO_PPM_MAX) * 20);
    // H₂S: fração do alarme × 20
    score += Math.min(20, (h2s / L.H2S_PPM_MAX) * 20);
    return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Avaliação completa (frozen): hazards + classe + score + leituras normalizadas.
 */
export function assessConfinedSpace(reading: AtmosphereReading): Readonly<ConfinedSpaceAssessment> {
    return Object.freeze({
        hazards: detectAtmosphericHazards(reading),
        entryClass: classifyEntry(reading),
        riskScore: computeRiskScore(reading),
        o2Pct: Number(reading?.o2Pct) || 0,
        lelPct: Number(reading?.lelPct) || 0,
        coPpm: Number(reading?.coPpm) || 0,
        h2sPpm: Number(reading?.h2sPpm) || 0,
    });
}

/**
 * Type-guard for AtmosphereReading (exige O₂ numérico finito).
 */
export function isValidAtmosphereReading(value: unknown): value is AtmosphereReading {
    if (!value || typeof value !== 'object') return false;
    return Number.isFinite(Number((value as AtmosphereReading).o2Pct));
}
