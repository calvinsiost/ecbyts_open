// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Industrial Electrical Area Classification
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Industrial Electrical Area Classification - IEC 60079-10-1 / ABNT NBR IEC 60079-10-1
 *
 * Módulo puro para classificação de áreas com atmosferas explosivas de gás/vapor
 * conforme IEC 60079-10-1:2020 e ABNT NBR IEC 60079-10-1:2021.
 * Calcula o grau de ventilação, zona Ex (0/1/2), score de liberação e classifica
 * a área perigosa. Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - IEC 60079-10-1:2020. "Explosive atmospheres - Part 10-1: Classification
 *     of areas - Explosive gas atmospheres." International Electrotechnical
 *     Commission, Geneva. (Ventilation grades, zone determination)
 *   - ABNT NBR IEC 60079-10-1:2021. "Atmosferas explosivas - Parte 10-1:
 *     Classificação de áreas - Atmosferas explosivas de gás." ABNT, Rio de
 *     Janeiro. (Brazilian adoption of IEC 60079-10-1)
 *   - API RP 505:2018. "Recommended Practice for Classification of Locations
 *     for Electrical Installations at Petroleum Facilities Classified as Class I,
 *     Zone 0, Zone 1, and Zone 2." American Petroleum Institute, Washington.
 *     (Release grade scoring, petroleum industry application)
 */

'use strict';

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

// Graus de ventilação conforme IEC 60079-10-1 Tabela B.1
// Ventilation grades per IEC 60079-10-1 Table B.1
const VENTILATION_GRADES = Object.freeze({
    HIGH: 'HIGH', // Boa ventilação: concentração raramente excede LFL, dispersão rápida
    MEDIUM: 'MEDIUM', // Ventilação média: controla concentração estacionária, não totalmente
    LOW: 'LOW', // Ventilação baixa: não controla em regime estacionário
});

// Graus de disponibilidade de ventilação (IEC 60079-10-1 §6.4.2)
// Ventilation availability degrees
const VENTILATION_AVAILABILITY = Object.freeze({
    GOOD: 'GOOD', // Presente virtualmente o tempo todo
    FAIR: 'FAIR', // Presente na maior parte do tempo
    POOR: 'POOR', // Não é contínua mas esperada na maioria do tempo
});

// Graus de liberação conforme IEC 60079-10-1 §5.3 e API RP 505 §4.2
// Release grades per IEC 60079-10-1 §5.3 and API RP 505 §4.2
const RELEASE_GRADES = Object.freeze({
    CONTINUOUS: 'CONTINUOUS', // Contínua: presente de forma contínua ou por longos períodos
    PRIMARY: 'PRIMARY', // Primária: esperada periodicamente em operação normal
    SECONDARY: 'SECONDARY', // Secundária: não esperada em operação normal
});

/**
 * Calcula o grau de ventilação com base na troca de ar por hora e volume do compartimento.
 * Calculates the ventilation grade based on air changes per hour and compartment volume.
 *
 * Critério IEC 60079-10-1 Anexo B.2:
 *   - HIGH:   ACH ≥ 12 e volume ≤ 500 m³ (ou ACH ≥ 60 qualquer volume)
 *   - MEDIUM: 6 ≤ ACH < 12
 *   - LOW:    ACH < 6
 *
 * @param airChangesPerHour - Renovações de ar por hora (ACH), ≥ 0
 * @param compartmentVolume - Volume do compartimento (m³), > 0
 * @throws {RangeError} se airChangesPerHour < 0 ou compartmentVolume ≤ 0
 */
export function calcVentilationGrade(
    airChangesPerHour: number,
    compartmentVolume: number,
): { grade: string; acHour: number; description: string } {
    if (!isFinite(airChangesPerHour) || airChangesPerHour < 0) {
        throw new RangeError('Renovações de ar por hora (ACH) deve ser ≥ 0.');
    }
    if (!isFinite(compartmentVolume) || compartmentVolume <= 0) {
        throw new RangeError('Volume do compartimento deve ser positivo (m³).');
    }

    let grade, description;
    if (airChangesPerHour >= 60 || (airChangesPerHour >= 12 && compartmentVolume <= 500)) {
        grade = VENTILATION_GRADES.HIGH;
        description = 'Boa ventilação — concentração raramente excede LFL; dispersão rápida.';
    } else if (airChangesPerHour >= 6) {
        grade = VENTILATION_GRADES.MEDIUM;
        description = 'Ventilação média — controla concentração estacionária parcialmente.';
    } else {
        grade = VENTILATION_GRADES.LOW;
        description = 'Ventilação baixa — não controla concentração em regime estacionário.';
    }

    return { grade, acHour: airChangesPerHour, description };
}

/**
 * Determina a zona de atmosfera explosiva (Zone 0/1/2) conforme IEC 60079-10-1 Tabela 2.
 * Determines explosive atmosphere zone (Zone 0/1/2) per IEC 60079-10-1 Table 2.
 *
 * Lógica: zona depende do grau de liberação (release grade) e do grau de ventilação.
 * Com ventilação ALTA: zona reduz em um nível; com ventilação BAIXA: zona aumenta.
 * A disponibilidade de ventilação também influencia (IEC 60079-10-1 §6.4.2).
 *
 * @param releaseGrade - Grau de liberação: 'CONTINUOUS'|'PRIMARY'|'SECONDARY'
 * @param ventilationGrade - Grau de ventilação: 'HIGH'|'MEDIUM'|'LOW'
 * @param ventilationAvailability - Disponibilidade: 'GOOD'|'FAIR'|'POOR'
 * @returns zone = 0, 1, ou 2 (null = não classificada como área perigosa)
 * @throws {TypeError} se os parâmetros de entrada forem inválidos
 */
export function calcExplosiveAtmosphereZone(
    releaseGrade: string,
    ventilationGrade: string,
    ventilationAvailability: string,
): { zone: number | null; zoneLabel: string; rationale: string } {
    const validReleaseGrades = Object.values(RELEASE_GRADES);
    const validVentGrades = Object.values(VENTILATION_GRADES);
    const validAvailabilities = Object.values(VENTILATION_AVAILABILITY);

    if (!validReleaseGrades.includes(releaseGrade as any)) {
        throw new TypeError(`Grau de liberação inválido: ${releaseGrade}. Use: ${validReleaseGrades.join(', ')}`);
    }
    if (!validVentGrades.includes(ventilationGrade as any)) {
        throw new TypeError(`Grau de ventilação inválido: ${ventilationGrade}. Use: ${validVentGrades.join(', ')}`);
    }
    if (!validAvailabilities.includes(ventilationAvailability as any)) {
        throw new TypeError(`Disponibilidade de ventilação inválida: ${ventilationAvailability}.`);
    }

    // Matriz de zona base por grau de liberação (IEC 60079-10-1 Tabela 2, coluna MEDIUM/GOOD)
    // Base zone matrix per release grade (IEC 60079-10-1 Table 2, column MEDIUM/GOOD)
    const baseZoneMap: Record<string, number> = {
        [RELEASE_GRADES.CONTINUOUS]: 0,
        [RELEASE_GRADES.PRIMARY]: 1,
        [RELEASE_GRADES.SECONDARY]: 2,
    };
    const baseZone = baseZoneMap[releaseGrade]!;

    // Ajuste por grau de ventilação - IEC 60079-10-1 §6.4.1
    let zoneAdjustment = 0;
    if (ventilationGrade === VENTILATION_GRADES.HIGH) {
        zoneAdjustment = +1; // Ventilação alta reduz severidade (zona aumenta numericamente)
    } else if (ventilationGrade === VENTILATION_GRADES.LOW) {
        zoneAdjustment = -1; // Ventilação baixa aumenta severidade (zona diminui numericamente)
    }

    // Ajuste por disponibilidade de ventilação - IEC 60079-10-1 §6.4.2
    if (ventilationAvailability === VENTILATION_AVAILABILITY.POOR) {
        zoneAdjustment -= 1; // Ventilação não confiável aumenta severidade
    }

    const adjustedZone = baseZone + zoneAdjustment;

    let zone, zoneLabel, rationale;
    if (adjustedZone <= 0) {
        zone = 0;
        zoneLabel = 'Zone 0';
        rationale = 'Atmosfera explosiva presente de forma contínua ou por longos períodos.';
    } else if (adjustedZone === 1) {
        zone = 1;
        zoneLabel = 'Zone 1';
        rationale = 'Atmosfera explosiva provável em operação normal.';
    } else {
        zone = 2;
        zoneLabel = 'Zone 2';
        rationale = 'Atmosfera explosiva improvável; se ocorrer, é por curto período.';
    }

    return { zone, zoneLabel, rationale };
}

/**
 * Calcula o score de liberação para priorização de risco conforme API RP 505 §4.2.
 * Calculates release grade score for risk prioritization per API RP 505 §4.2.
 *
 * Score numérico normalizado [0, 1] baseado em:
 *   - Grau de liberação (peso 0.5): CONTINUOUS=1.0, PRIMARY=0.6, SECONDARY=0.3
 *   - Pressão operacional relativa à pressão de vapor (peso 0.3): min(p/pv, 1.0)
 *   - Fração molar do componente inflamável no fluido de processo (peso 0.2)
 *
 * @param releaseGrade - Grau de liberação: 'CONTINUOUS'|'PRIMARY'|'SECONDARY'
 * @param operatingPressureKPa - Pressão operacional (kPa), ≥ 0
 * @param vaporPressureKPa - Pressão de vapor do componente a T_op (kPa), > 0
 * @param flammableMoleFraction - Fração molar do componente inflamável [0, 1]
 * @throws {RangeError} se os valores numéricos estiverem fora de faixa
 */
export function calcReleaseGradeScore(
    releaseGrade: string,
    operatingPressureKPa: number,
    vaporPressureKPa: number,
    flammableMoleFraction: number,
): { score: number; releaseWeight: number; pressureWeight: number; fractionWeight: number } {
    const validReleaseGrades = Object.values(RELEASE_GRADES);
    if (!validReleaseGrades.includes(releaseGrade as any)) {
        throw new TypeError(`Grau de liberação inválido: ${releaseGrade}.`);
    }
    if (!isFinite(operatingPressureKPa) || operatingPressureKPa < 0) {
        throw new RangeError('Pressão operacional deve ser ≥ 0 kPa.');
    }
    if (!isFinite(vaporPressureKPa) || vaporPressureKPa <= 0) {
        throw new RangeError('Pressão de vapor deve ser > 0 kPa.');
    }
    if (!isFinite(flammableMoleFraction) || flammableMoleFraction < 0 || flammableMoleFraction > 1) {
        throw new RangeError('Fração molar do componente inflamável deve estar em [0, 1].');
    }

    // Peso do grau de liberação - API RP 505 §4.2 Tabela 4-1
    const releaseWeightMap: Record<string, number> = {
        [RELEASE_GRADES.CONTINUOUS]: 1.0,
        [RELEASE_GRADES.PRIMARY]: 0.6,
        [RELEASE_GRADES.SECONDARY]: 0.3,
    };
    const releaseWeight = releaseWeightMap[releaseGrade]!;

    // Pressão relativa normalizada (capeada em 1.0)
    const pressureRatio = Math.min(operatingPressureKPa / vaporPressureKPa, 1.0);
    const pressureWeight = pressureRatio;

    const fractionWeight = flammableMoleFraction;

    // Score ponderado - API RP 505 §4.2.3
    const score = 0.5 * releaseWeight + 0.3 * pressureWeight + 0.2 * fractionWeight;

    return { score, releaseWeight, pressureWeight, fractionWeight };
}

/**
 * Classifica a área perigosa completa integrando zona Ex, grau de ventilação e score.
 * Classifies the complete hazardous area integrating Ex zone, ventilation grade and score.
 *
 * Produz uma classificação consolidada com recomendações de equipamento elétrico
 * conforme IEC 60079-0:2017 (categorias de equipamento Ex) e ABNT NBR IEC 60079-0.
 *
 * @param zone - Zona Ex: 0, 1 ou 2
 * @param ventilationGrade - Grau de ventilação: 'HIGH'|'MEDIUM'|'LOW'
 * @param releaseScore - Score de liberação [0, 1]
 * @throws {RangeError} se zone não for 0, 1 ou 2
 */
function _validateHazardousArea(zone: number, ventilationGrade: string, releaseScore: number): void {
    if (![0, 1, 2].includes(zone)) {
        throw new RangeError('Zona Ex deve ser 0, 1 ou 2.');
    }
    const validVentGrades = Object.values(VENTILATION_GRADES);
    if (!validVentGrades.includes(ventilationGrade as any)) {
        throw new TypeError(`Grau de ventilação inválido: ${ventilationGrade}.`);
    }
    if (!isFinite(releaseScore) || releaseScore < 0 || releaseScore > 1) {
        throw new RangeError('Score de liberação deve estar em [0, 1].');
    }
}

function _riskLevelFromZoneAndScore(zone: number, releaseScore: number): string {
    if (zone === 0 || releaseScore >= 0.8) return 'CRÍTICO';
    if (zone === 1 || releaseScore >= 0.5) return 'ALTO';
    if (zone === 2 || releaseScore >= 0.3) return 'MODERADO';
    return 'BAIXO';
}

function _recommendationsForHazardousArea(
    zone: number,
    ventilationGrade: string,
    releaseScore: number,
): string[] {
    const recommendations: string[] = [];
    if (zone === 0) {
        recommendations.push('Usar somente equipamentos categoria 1G (proteção muito alta).');
        recommendations.push('Monitoramento contínuo de gás obrigatório.');
    } else if (zone === 1) {
        recommendations.push('Usar equipamentos categoria 1G ou 2G.');
        recommendations.push('Inspeção periódica de estanqueidade e sistemas de ignição.');
    } else {
        recommendations.push('Equipamentos categoria 1G, 2G ou 3G são adequados.');
        recommendations.push('Procedimentos de hot-work com permissão e monitoramento de gás.');
    }
    if (ventilationGrade === VENTILATION_GRADES.LOW) {
        recommendations.push('Melhorar ventilação para reduzir a zona Ex classificada.');
    }
    if (releaseScore >= 0.7) {
        recommendations.push(
            'Reduzir frequência ou magnitude das liberações — intertravamento ou manutenção preditiva.',
        );
    }
    return recommendations;
}

export function classifyHazardousArea(
    zone: number,
    ventilationGrade: string,
    releaseScore: number,
): { areaClass: string; equipmentCategory: string; riskLevel: string; recommendations: string[] } {
    _validateHazardousArea(zone, ventilationGrade, releaseScore);

    // Categoria de equipamento Ex por zona (IEC 60079-0:2017 §4)
    const equipmentCategoryMap: Record<number, string> = { 0: '1G', 1: '1G ou 2G', 2: '1G, 2G ou 3G' };
    const equipmentCategory = equipmentCategoryMap[zone]!;
    const riskLevel = _riskLevelFromZoneAndScore(zone, releaseScore);
    const areaClass = `Zone ${zone} — ${riskLevel}`;
    const recommendations = _recommendationsForHazardousArea(zone, ventilationGrade, releaseScore);

    return { areaClass, equipmentCategory, riskLevel, recommendations };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialElectricalAreaClassificationMeta: AnalyticsModuleMeta = {
    name: 'industrialElectricalAreaClassification',
    description: 'Industrial Electrical Area Classification',
    category: 'analytics',
    familyTags: ['industrial', 'energy'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
