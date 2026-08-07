// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   EIS Axis Registry — 10-axis progressive framework
   SPEC_EIS_RADAR_10AXES_PROGRESSIVE_UI.md Fase 1
   ================================================================

   Registra os 10 eixos do EIS Extended (Core-6 + Progressive-4).
   Os 6 eixos core mantêm os mesmos pesos do eisCalculator.js
   (soma 12 para facilitar interpretação percentual).

   Os 4 eixos progressivos (Gc, Bi, Se, Tr) são opcionais —
   default 0 quando ausentes — e não alteram o EIS Core oficial.
   ================================================================ */

export interface AxisDefinition {
    id: string;
    label: string;
    maxScore: number;
    weight: number;
    tier: 'core' | 'progressive';
    description: string;
}

/**
 * Definições canônicas dos 10 eixos EIS.
 * tier 'core' = eixos obrigatórios do framework 3CTA+ (6 eixos).
 * tier 'progressive' = eixos diagnósticos opcionais (4 eixos).
 */
export const AXIS_DEFINITIONS: Record<string, AxisDefinition> = {
    // ── CORE-6 (framework 3CTA+ - pesos idênticos ao EIS_DEFAULT_WEIGHTS) ──
    T: {
        id: 'T',
        label: 'T — Transparência',
        maxScore: 5,
        weight: 3,
        tier: 'core',
        description: 'Evidência de origem dos dados: credencial do autor, rastreabilidade de medições.',
    },
    A: {
        id: 'A',
        label: 'A — Acurácia',
        maxScore: 5,
        weight: 3,
        tier: 'core',
        description: 'Saúde do sensor / conformidade regulatória das observações.',
    },
    Cp: {
        id: 'Cp',
        label: 'Cp — Completude',
        maxScore: 5,
        weight: 2,
        tier: 'core',
        description: 'Cobertura de amostragem executada vs planejada por campanha.',
    },
    Ty: {
        id: 'Ty',
        label: 'Ty — Tempestividade',
        maxScore: 5,
        weight: 2,
        tier: 'core',
        description: 'Latência de entrega dos dados — mediana da idade das observações.',
    },
    Cs: {
        id: 'Cs',
        label: 'Cs — Consistência',
        maxScore: 5,
        weight: 1,
        tier: 'core',
        description: 'Padronização de unidades SI em todas as observações.',
    },
    Cm: {
        id: 'Cm',
        label: 'Cm — Comparabilidade',
        maxScore: 5,
        weight: 1,
        tier: 'core',
        description: 'Alinhamento taxonômico de parâmetros e unidades padrão.',
    },

    // ── PROGRESSIVE-4 (eixos diagnósticos opcionais) ──
    Gc: {
        id: 'Gc',
        label: 'Gc — Governança Corporativa',
        maxScore: 5,
        weight: 2,
        tier: 'progressive',
        description: 'Conformidade regulatória global: taxa de aprovação em jurisdições e margem de segurança.',
    },
    Bi: {
        id: 'Bi',
        label: 'Bi — Biodiversidade',
        maxScore: 5,
        weight: 1,
        tier: 'progressive',
        description: 'Indicadores de impacto em biodiversidade e habitat — cobertura de monitoramento ecológico.',
    },
    Se: {
        id: 'Se',
        label: 'Se — Segurança EHS',
        maxScore: 5,
        weight: 2,
        tier: 'progressive',
        description: 'Conformidade em Environment, Health & Safety: BEI/TLV, incidentes, PPE compliance.',
    },
    Tr: {
        id: 'Tr',
        label: 'Tr — Transparência de Reporte',
        maxScore: 5,
        weight: 1,
        tier: 'progressive',
        description: 'Qualidade do reporte público: relatórios GRI/ISSB, divulgação de passivos, auditabilidade.',
    },
    L: {
        id: 'L',
        label: 'L — Conformidade Legal (multas)',
        maxScore: 5,
        weight: 2,
        tier: 'progressive',
        description:
            'FineImpactScore (FIS) — penalização por autos de infração administrativa. ' +
            '4D não-compensatório (Magnitude relativa × Magnitude absoluta × Severidade × Reincidência). ' +
            'Alinhado IN IBAMA 19/2023, Bloomberg/S&P/LSEG/MSCI ESG. ADR-FINE-IMPACT-SCORE-001.',
    },
    // ── EXTENDED 4 (CCC-001 CC-15b — Calvin 2026-06-10 autorizou implementar) ──
    V: {
        id: 'V',
        label: 'V — Validade (regras de domínio)',
        maxScore: 5,
        weight: 1,
        tier: 'progressive',
        description:
            'Fraction of observations passing domain rules (min/max/unit/required). ' +
            'Aggregate = pass_rate × 5. Pure-logic em _extendedAxesPure.ts.',
    },
    U: {
        id: 'U',
        label: 'U — Unicidade (sem duplicatas)',
        maxScore: 5,
        weight: 1,
        tier: 'progressive',
        description:
            'Penaliza duplicatas por chave natural (parameter, dateIso, elementId). ' +
            'Aggregate = unique_rate × 5. Pure-logic em _extendedAxesPure.ts.',
    },
    Un: {
        id: 'Un',
        label: 'Un — Incerteza (qualidade u_rel GUM)',
        maxScore: 5,
        weight: 1,
        tier: 'progressive',
        description:
            'Qualidade da declaração de incerteza relativa por observação ' +
            '(GUM-aligned: excellent≤5%, good≤10%, fair≤20%, poor≤50%). ' +
            'Pure-logic em _extendedAxesPure.ts.',
    },
    Ex: {
        id: 'Ex',
        label: 'Ex — Contexto de Exceção (QA outliers)',
        maxScore: 5,
        weight: 1,
        tier: 'progressive',
        description:
            'Qualifica eventos excepcionais (storm, lab_qa, equipment). ' +
            'Outliers estatísticos (|z|>3) sem flag são penalizados. ' +
            'Padrão QA ar (IPR/INMET). Pure-logic em _extendedAxesPure.ts.',
    },
};

/**
 * Retorna a definição de um eixo pelo ID.
 *
 * @param id - ID do eixo (ex: 'T', 'Gc')
 * @returns Definição do eixo ou undefined se não encontrado.
 */
export function getAxisById(id: string): AxisDefinition | undefined {
    return AXIS_DEFINITIONS[id];
}

/**
 * Lista os 6 eixos core do framework 3CTA+.
 *
 * @returns Array com os 6 eixos de tier 'core'.
 */
export function listCoreAxes(): AxisDefinition[] {
    return Object.values(AXIS_DEFINITIONS).filter((ax) => ax.tier === 'core');
}

/**
 * Lista os 4 eixos progressivos (diagnósticos opcionais).
 *
 * @returns Array com os 4 eixos de tier 'progressive'.
 */
export function listProgressiveAxes(): AxisDefinition[] {
    return Object.values(AXIS_DEFINITIONS).filter((ax) => ax.tier === 'progressive');
}

/**
 * Retorna a soma de todos os pesos (core + progressive).
 * Core: 3+3+2+2+1+1 = 12
 * Progressive: 2+1+2+1+2+1+1+1+1 = 12 (Gc + Bi + Se + Tr + L + V + U + Un + Ex)
 * Total: 24
 *
 * @returns Soma dos pesos de todos os 15 eixos.
 */
export function getTotalWeight(): number {
    return Object.values(AXIS_DEFINITIONS).reduce((sum, ax) => sum + ax.weight, 0);
}
