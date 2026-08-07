// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   WORKFLOW: Avaliacao de Risco CETESB
   Pipeline guiado para avaliacao de risco ambiental segundo
   metodologia CETESB para areas contaminadas.

   7 steps: INTRO → SELECT_AREA → CONTAMINANTS → EXPOSURE_PATHS →
   VALIDATION → COMPLIANCE → REVIEW
   ================================================================ */
import { runValidation } from '../orchestrator.js';
export const RISK_ASSESSMENT_CETESB = {
    id: 'risk-assessment-cetesb',
    nameKey: 'workflow.riskAssessment',
    descKey: 'workflow.riskAssessmentDesc',
    icon: 'shield-check',
    regulation: 'CETESB DD-38/2017',
    prerequisites: (appState: any) => {
        const missing = [];
        const elements = appState.elements ?? [];
        const wells = elements.filter((e: any) => e.family === 'well' && e.data?.observations?.length > 0);
        if (wells.length < 2) {
            missing.push('workflow.prereq.minWellsRisk');
        }
        return { met: missing.length === 0, missing };
    },
    steps: [
        {
            id: 'INTRO',
            type: 'info',
            titleKey: 'workflow.riskAssessment.intro.title',
            descKey: 'workflow.riskAssessment.intro.desc',
        },
        {
            id: 'SELECT_AREA',
            type: 'decision',
            titleKey: 'workflow.riskAssessment.selectArea.title',
            descKey: 'workflow.riskAssessment.selectArea.desc',
            options: {
                type: 'radio',
                field: 'landUse',
                choices: [
                    { value: 'residential', labelKey: 'workflow.landUse.residential' },
                    { value: 'commercial', labelKey: 'workflow.landUse.commercial' },
                    { value: 'industrial', labelKey: 'workflow.landUse.industrial' },
                    { value: 'agricultural', labelKey: 'workflow.landUse.agricultural' },
                ],
                defaults: { landUse: 'industrial' },
            },
        },
        {
            id: 'CONTAMINANTS',
            type: 'decision',
            titleKey: 'workflow.riskAssessment.contaminants.title',
            descKey: 'workflow.riskAssessment.contaminants.desc',
            options: {
                type: 'parameter-picker',
                field: 'parameterId',
                filter: [], // Todos os parametros
            },
        },
        {
            id: 'EXPOSURE_PATHS',
            type: 'decision',
            titleKey: 'workflow.riskAssessment.exposure.title',
            descKey: 'workflow.riskAssessment.exposure.desc',
            options: {
                type: 'radio',
                field: 'exposurePath',
                choices: [
                    { value: 'ingestion', labelKey: 'workflow.exposure.ingestion' },
                    { value: 'inhalation', labelKey: 'workflow.exposure.inhalation' },
                    { value: 'dermal', labelKey: 'workflow.exposure.dermal' },
                    { value: 'all', labelKey: 'workflow.exposure.all' },
                ],
                defaults: { exposurePath: 'all' },
            },
        },
        {
            id: 'VALIDATION',
            type: 'execution',
            titleKey: 'workflow.riskAssessment.validation.title',
            descKey: 'workflow.riskAssessment.validation.desc',
            execute: async (state: any, onProgress: any) => {
                return runValidation({
                    parameterId: state.decisions.parameterId ?? null,
                    onProgress,
                });
            },
        },
        {
            id: 'COMPLIANCE',
            type: 'execution',
            titleKey: 'workflow.riskAssessment.compliance.title',
            descKey: 'workflow.riskAssessment.compliance.desc',
            execute: async (state: any, onProgress: any) => {
                // Compila resultado de conformidade com uso do solo
                const validation = state.results.VALIDATION;
                if (onProgress) onProgress(1);
                return {
                    landUse: state.decisions.landUse,
                    exposurePath: state.decisions.exposurePath,
                    exceedanceCount: validation?.exceedances?.length ?? 0,
                    compliantCount: validation?.compliant?.length ?? 0,
                    riskLevel: (validation?.exceedances?.length ?? 0) > 0 ? 'high' : 'low',
                };
            },
        },
        {
            id: 'REVIEW',
            type: 'review',
            titleKey: 'workflow.riskAssessment.review.title',
            descKey: 'workflow.riskAssessment.review.desc',
        },
    ],
};
