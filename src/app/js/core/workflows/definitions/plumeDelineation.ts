// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
import { runValidation, runInterpolation, runDelineation } from '../orchestrator.js';
/**
 * Parametros regulados pela CONAMA 420/2009 para agua subterranea.
 * Benzeno, Tolueno, Etilbenzeno, Xilenos (BTEX) + metais pesados.
 */
const CONAMA420_PARAMS = [
    'benzene',
    'toluene',
    'ethylbenzene',
    'xylenes',
    'arsenic',
    'lead',
    'cadmium',
    'chromium_vi',
    'mercury',
    'naphthalene',
    'benzo_a_pyrene',
];
export const PLUME_DELINEATION_CONAMA420 = {
    id: 'plume-delineation-conama420',
    nameKey: 'workflow.plumeDelineation',
    descKey: 'workflow.plumeDelineationDesc',
    icon: 'droplet',
    regulation: 'CONAMA 420/2009',
    /**
     * Verifica se o modelo tem dados suficientes para rodar o workflow.
     * @param {AppState} appState - { elements, campaigns }
     * @returns {PrereqResult}
     */
    prerequisites: (appState: any) => {
        const missing = [];
        const elements = appState.elements || [];
        const campaigns = appState.campaigns || [];
        // Minimo 3 pocos com observacoes
        const wells = elements.filter((e: any) => e.family === 'well' && e.data?.observations?.length > 0);
        if (wells.length < 3) {
            missing.push('workflow.prereq.minWells');
        }
        // Pelo menos 1 campanha
        if (campaigns.length === 0) {
            missing.push('workflow.prereq.minCampaigns');
        }
        // Pelo menos 1 observacao com parametro regulado CONAMA 420
        const hasRegulated = elements.some((e: any) =>
            e.data?.observations?.some((o: any) => CONAMA420_PARAMS.includes(o.parameterId)),
        );
        if (!hasRegulated) {
            missing.push('workflow.prereq.regulatedParam');
        }
        return { met: missing.length === 0, missing };
    },
    steps: [
        // ────────────────────────────────────────────────────────────
        // STEP 1: Introducao
        // ────────────────────────────────────────────────────────────
        {
            id: 'INTRO',
            type: 'info',
            titleKey: 'workflow.plumeDelineation.intro.title',
            descKey: 'workflow.plumeDelineation.intro.desc',
        },
        // ────────────────────────────────────────────────────────────
        // STEP 2: Selecionar parametro contaminante
        // ────────────────────────────────────────────────────────────
        {
            id: 'SELECT_PARAMETER',
            type: 'decision',
            titleKey: 'workflow.plumeDelineation.selectParam.title',
            descKey: 'workflow.plumeDelineation.selectParam.desc',
            options: {
                type: 'parameter-picker',
                field: 'parameterId',
                filter: CONAMA420_PARAMS,
            },
            validate: (state: any) => {
                if (!state.decisions.parameterId) {
                    return { valid: false, errors: ['workflow.error.selectParameter'] };
                }
                return { valid: true, errors: [] };
            },
        },
        // ────────────────────────────────────────────────────────────
        // STEP 3: Selecionar campanha (ou dados mais recentes)
        // ────────────────────────────────────────────────────────────
        {
            id: 'SELECT_CAMPAIGN',
            type: 'decision',
            titleKey: 'workflow.plumeDelineation.selectCampaign.title',
            descKey: 'workflow.plumeDelineation.selectCampaign.desc',
            options: {
                type: 'campaign-picker',
                field: 'campaignId',
                allowLatest: true, // Opcao "dados mais recentes"
            },
        },
        // ────────────────────────────────────────────────────────────
        // STEP 4: Validacao regulatoria (execucao automatica)
        // ────────────────────────────────────────────────────────────
        {
            id: 'VALIDATION',
            type: 'execution',
            titleKey: 'workflow.plumeDelineation.validation.title',
            descKey: 'workflow.plumeDelineation.validation.desc',
            execute: async (state: any, onProgress: any) => {
                return runValidation({
                    parameterId: state.decisions.parameterId,
                    campaignId: state.decisions.campaignId || null,
                    onProgress,
                });
            },
        },
        // ────────────────────────────────────────────────────────────
        // STEP 5: Configurar metodo de interpolacao
        // ────────────────────────────────────────────────────────────
        {
            id: 'INTERPOLATION_CONFIG',
            type: 'decision',
            titleKey: 'workflow.plumeDelineation.interpConfig.title',
            descKey: 'workflow.plumeDelineation.interpConfig.desc',
            options: {
                type: 'radio',
                field: 'interpolationMethod',
                choices: [
                    { value: 'kriging', labelKey: 'workflow.method.kriging' },
                    { value: 'idw', labelKey: 'workflow.method.idw' },
                    { value: 'rbf', labelKey: 'workflow.method.rbf' },
                ],
                defaults: {
                    interpolationMethod: 'kriging',
                    gridSize: 64,
                },
            },
        },
        // ────────────────────────────────────────────────────────────
        // STEP 6: Executar interpolacao
        // ────────────────────────────────────────────────────────────
        {
            id: 'INTERPOLATE',
            type: 'execution',
            titleKey: 'workflow.plumeDelineation.interpolate.title',
            descKey: 'workflow.plumeDelineation.interpolate.desc',
            execute: async (state: any, onProgress: any) => {
                // Coleta pontos de dados das excedencias + conformes
                const validation = state.results.VALIDATION;
                if (!validation) throw new Error('Validation step not completed');
                const _isFiniteCoord = (v: any) => {
                    if (v == null || v === '') return false;
                    return Number.isFinite(Number(v));
                };
                const hasValidGeometry = (p: any) =>
                    _isFiniteCoord(p?.x) && _isFiniteCoord(p?.z) && _isFiniteCoord(p?.value);
                const dataPoints = [
                    ...validation.exceedances.map((e: any) => ({
                        x: Number(e.x),
                        y: Number(e.y),
                        z: Number(e.z),
                        value: Number(e.value),
                        complianceStatus: e.complianceStatus || 'exceedance',
                    })),
                    ...validation.compliant.map((c: any) => {
                        return {
                            x: Number(c.x),
                            y: Number(c.y),
                            z: Number(c.z),
                            value: Number(c.value),
                            complianceStatus: c.complianceStatus || 'compliant',
                        };
                    }),
                ].filter(hasValidGeometry);
                if (dataPoints.length < 2) {
                    throw new Error('Insufficient spatial points with valid geometry for interpolation');
                }
                return runInterpolation({
                    parameterId: state.decisions.parameterId,
                    method: state.decisions.interpolationMethod || 'kriging',
                    gridSize: state.decisions.gridSize || 64,
                    dataPoints,
                    onProgress,
                });
            },
        },
        // ────────────────────────────────────────────────────────────
        // STEP 7: Delimitar pluma (isosuperficie no threshold)
        // ────────────────────────────────────────────────────────────
        {
            id: 'DELINEATE_PLUME',
            type: 'execution',
            titleKey: 'workflow.plumeDelineation.delineate.title',
            descKey: 'workflow.plumeDelineation.delineate.desc',
            execute: async (state: any, onProgress: any) => {
                const interpolation = state.results.INTERPOLATE;
                const validation = state.results.VALIDATION;
                if (!interpolation) throw new Error('Interpolation step not completed');
                const threshold = validation?.limit?.max ?? 5; // fallback benzeno
                return runDelineation({
                    grid: interpolation.grid ?? interpolation,
                    threshold,
                    parameterId: state.decisions.parameterId,
                    onProgress,
                });
            },
        },
        // ────────────────────────────────────────────────────────────
        // STEP 8: Revisao - aceitar ou voltar
        // ────────────────────────────────────────────────────────────
        {
            id: 'REVIEW',
            type: 'review',
            titleKey: 'workflow.plumeDelineation.review.title',
            descKey: 'workflow.plumeDelineation.review.desc',
        },
    ],
};
