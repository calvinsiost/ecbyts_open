// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Modelo plugável — pirólise do caroço de açaí (rota FAPESP)
// Item: micro_activity:ECBYTS-ENERGY-SCENARIOS-001#9

/* ================================================================
   MODELO: PIRÓLISE DO CAROÇO DE AÇAÍ → BIOCARVÃO + ENERGIA
   ================================================================

   Primeiro modelo NÃO-ambiental plugado no motor genérico —
   prova de que o simulador Monte Carlo aceita qualquer modelagem.

   Números da rota técnica FAPESP
   (.runtime/fapesp-2026/rota-tecnica-acai-energia.md):
   - Rendimento sólido (biochar): 35,7–52,7% (m/m), triangular
   - PCS do carbonizado: ~33 MJ/kg (HHV 19,4 → 32,97 MJ/kg)
   - Resíduo disponível: 550 kt a >1 Mt/ano no Pará/Amazônia
   - Caroço/semente ≈ 85% da massa do fruto

   Fontes: Bioresource Tech Reports S2589014X20301742;
   Catalysts 16:485 (doi 10.3390/catal16050485); Sustainability
   16:8451 (doi 10.3390/su16198451).
   ================================================================ */

import type { SimModel, SimMetricStats } from '../modelRegistry.js';

const DIAS_OPERACAO_ANO = 330;

export const ACAI_PYROLYSIS_MODEL: SimModel = {
    id: 'acai_pyrolysis',
    name: 'Pirólise do Caroço de Açaí — Biocarvão + Energia',
    description:
        'Conversão termoquímica do caroço de açaí (350–700 °C) em biocarvão energético; métricas de energia, receita, custo e payback (rota FAPESP)',
    icon: 'flame',
    color: '#7c3aed',
    category: 'energetico',
    tags: ['biomassa', 'pirolise', 'acai', 'fapesp', 'energia'],
    params: [
        {
            key: 'solidYield',
            name: 'Rendimento sólido (biochar)',
            unit: 'fração m/m',
            dist: 'triangular',
            distParams: { min: 0.357, mode: 0.43, max: 0.527 },
        },
        {
            key: 'pcsChar',
            name: 'PCS do carbonizado',
            unit: 'MJ/kg',
            dist: 'normal',
            distParams: { mu: 33, sigma: 1.5 },
        },
        {
            key: 'biocharPrice',
            name: 'Preço do biocarvão',
            unit: 'R$/t',
            dist: 'triangular',
            distParams: { min: 600, mode: 1200, max: 2200 },
        },
        {
            key: 'opexPerTon',
            name: 'Custo de operação por t processada',
            unit: 'R$/t',
            dist: 'triangular',
            distParams: { min: 150, mode: 260, max: 420 },
        },
        {
            key: 'feedstock',
            name: 'Oferta de caroço',
            unit: 't/dia',
            dist: 'triangular',
            distParams: { min: 20, mode: 50, max: 120 },
        },
        {
            key: 'capex',
            name: 'CAPEX da planta',
            unit: 'R$',
            dist: 'triangular',
            distParams: { min: 2_000_000, mode: 4_500_000, max: 9_000_000 },
        },
    ],
    metrics: [
        { key: 'energiaMWhDia', name: 'Energia gerada', unit: 'MWh/dia', better: 'higher' },
        { key: 'receitaDia', name: 'Receita', unit: 'R$/dia', better: 'higher' },
        { key: 'custoPorTonBiochar', name: 'Custo por t de biocarvão', unit: 'R$/t', better: 'lower' },
        { key: 'margemDia', name: 'Margem operacional', unit: 'R$/dia', better: 'higher' },
        { key: 'paybackAnos', name: 'Payback', unit: 'anos', better: 'lower' },
    ],
    evaluate(sample: Record<string, number>): Record<string, number> {
        const feedstock = sample.feedstock ?? 0; // t/dia
        const charTons = feedstock * (sample.solidYield ?? 0); // t biochar/dia
        // Energia química do biocarvão produzido: t/dia × 1000 kg/t × MJ/kg
        const energiaMJ = charTons * 1000 * (sample.pcsChar ?? 0);
        const energiaMWhDia = energiaMJ / 3600; // 1 MWh = 3600 MJ
        const receitaDia = charTons * (sample.biocharPrice ?? 0);
        const custoDia = feedstock * (sample.opexPerTon ?? 0);
        const custoPorTonBiochar = charTons > 0 ? custoDia / charTons : 0;
        const margemDia = receitaDia - custoDia;
        const margemAno = margemDia * DIAS_OPERACAO_ANO;
        // Payback truncado em 99 anos (evita Infinity nas stats)
        const paybackAnos = margemAno > 0 ? Math.min((sample.capex ?? 0) / margemAno, 99) : 99;
        return { energiaMWhDia, receitaDia, custoPorTonBiochar, margemDia, paybackAnos };
    },
    scoreOf(stats: Record<string, SimMetricStats>) {
        // Score 0-100 no mesmo espírito do calculateScore legado:
        // viabilidade (payback), margem, e robustez (P10 da margem > 0)
        const payback = stats.paybackAnos?.p50 ?? 99;
        const margemP50 = stats.margemDia?.p50 ?? 0;
        const margemP10 = stats.margemDia?.p10 ?? 0;
        const paybackPts = Math.max(0, Math.min(1, 1 - payback / 15)) * 40; // <15 anos escala
        const margemPts = Math.max(0, Math.min(1, margemP50 / 50000)) * 35; // R$ 50k/dia = teto
        const robustezPts = margemP10 > 0 ? 25 : Math.max(0, Math.min(1, 1 + margemP10 / 20000)) * 12;
        const score = Math.round(Math.max(0, Math.min(100, paybackPts + margemPts + robustezPts)));
        return {
            score,
            label: score >= 70 ? 'Cenário favorável' : score >= 45 ? 'Atenção necessária' : 'Risco elevado',
            breakdown: {
                payback: { value: payback, points: paybackPts },
                margem: { value: margemP50, points: margemPts },
                robustez: { value: margemP10, points: robustezPts },
            },
        };
    },
};
