// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   WORKFLOW: Resposta a Emergencia SAO
   Pipeline guiado para avaliacao de risco ESH em cenarios
   de emergencia usando matrizes SAO.

   6 steps: INTRO → SELECT_SCENARIO → RISK_MATRIX → RESPONSE_PLAN
   → EIS_SCORE → REVIEW
   ================================================================ */
import { runSAOAssessment, runEIS } from '../orchestrator.js';
export const EMERGENCY_RESPONSE_SAO = {
    id: 'emergency-response-sao',
    nameKey: 'workflow.emergencyResponse',
    descKey: 'workflow.emergencyResponseDesc',
    icon: 'alert-triangle',
    regulation: 'SAO/ESH',
    /** @param {any} appState */
    prerequisites: (appState: any) => {
        const missing = [];
        const elements = appState.elements || [];
        if (elements.length < 1) {
            missing.push('workflow.prereq.minElements');
        }
        return { met: missing.length === 0, missing };
    },
    steps: [
        {
            id: 'INTRO',
            type: 'info',
            titleKey: 'workflow.emergencyResponse.intro.title',
            descKey: 'workflow.emergencyResponse.intro.desc',
        },
        {
            id: 'SELECT_SCENARIO',
            type: 'decision',
            titleKey: 'workflow.emergencyResponse.selectScenario.title',
            descKey: 'workflow.emergencyResponse.selectScenario.desc',
            options: {
                type: 'radio',
                field: 'scenarioId',
                choices: [
                    { value: 'chemical_spill', labelKey: 'workflow.scenario.chemicalSpill' },
                    { value: 'tailings_dam', labelKey: 'workflow.scenario.tailingsDam' },
                    { value: 'groundwater_contamination', labelKey: 'workflow.scenario.groundwaterContamination' },
                    { value: 'air_emission', labelKey: 'workflow.scenario.airEmission' },
                ],
                defaults: { scenarioId: 'chemical_spill' },
            },
            /** @param {any} state */
            validate: (state: any) => {
                if (!state.decisions.scenarioId) {
                    return { valid: false, errors: ['workflow.error.selectScenario'] };
                }
                return { valid: true, errors: [] };
            },
        },
        {
            id: 'RISK_MATRIX',
            type: 'execution',
            titleKey: 'workflow.emergencyResponse.riskMatrix.title',
            descKey: 'workflow.emergencyResponse.riskMatrix.desc',
            /** @param {any} state @param {any} onProgress */
            execute: async (state: any, onProgress: any) => {
                return runSAOAssessment({
                    scenarioId: state.decisions.scenarioId,
                    onProgress,
                });
            },
        },
        {
            id: 'RESPONSE_CONFIG',
            type: 'decision',
            titleKey: 'workflow.emergencyResponse.responseConfig.title',
            descKey: 'workflow.emergencyResponse.responseConfig.desc',
            options: {
                type: 'radio',
                field: 'responseLevel',
                choices: [
                    { value: 'immediate', labelKey: 'workflow.response.immediate' },
                    { value: 'short_term', labelKey: 'workflow.response.shortTerm' },
                    { value: 'long_term', labelKey: 'workflow.response.longTerm' },
                ],
                defaults: { responseLevel: 'immediate' },
            },
        },
        {
            id: 'EIS_SCORE',
            type: 'execution',
            titleKey: 'workflow.emergencyResponse.eisScore.title',
            descKey: 'workflow.emergencyResponse.eisScore.desc',
            /** @param {any} state @param {any} onProgress */
            execute: async (state: any, onProgress: any) => {
                return runEIS({ onProgress });
            },
        },
        {
            id: 'REVIEW',
            type: 'review',
            titleKey: 'workflow.emergencyResponse.review.title',
            descKey: 'workflow.emergencyResponse.review.desc',
        },
    ],
};
