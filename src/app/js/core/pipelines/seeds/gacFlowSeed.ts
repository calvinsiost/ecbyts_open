// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   GAC FLOW SEED (pure) — LMS-PPTX-BRIDGE-001 (botão de fluxo no slide)

   Constrói o FLUXO DE CLASSIFICAÇÃO DE ÁREA (GAC) como um pipeline nativo
   { nodes, edges, startNodeId } — o MESMO formato que o render fiel de pipelines
   já desenha (core/pipelines/_diagramSvgPure). Assim o "fluxo do GAC" mostrado
   num slide de aula vira um fluxograma interativo abrível com um clique.

   Base regulatória: Decreto Estadual SP 59.263/2013 + CETESB DD 038/2017/C —
   o mesmo árbitro de classes usado em core/validation/gacClassification.ts.
   Ordem das fases (mais avançada → menos): AP → AS → ACI → ACRi → ACRe →
   AME → AR. É um diagrama de VISUALIZAÇÃO (não executável no motor de pipelines).

   Tipos de nó (reaproveita as cores do render nativo):
     trigger   (verde)  = início do processo
     action    (azul)   = uma classe GAC atingida
     condition (âmbar)   = uma decisão (gatilho de avanço de fase)

   PURE: sem DOM/IO. Cheap-testável em tests/gac-flow-seed.test.mjs.
   ================================================================ */

/** Id estável do pipeline-semente (NUNCA renomear — chaveia o registry/localStorage). */
export const GAC_FLOW_PIPELINE_ID = 'ecbyts-seed-gac-flow';

/** Nome exibido do fluxo. */
export const GAC_FLOW_PIPELINE_NAME = 'Fluxo de Classificação de Área (GAC)';

export interface GacFlowNode {
    readonly id: string;
    readonly type: 'trigger' | 'action' | 'condition';
    readonly label: string;
}
export interface GacFlowEdge {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly label?: string;
}
export interface GacFlowModel {
    readonly nodes: ReadonlyArray<GacFlowNode>;
    readonly edges: ReadonlyArray<GacFlowEdge>;
    readonly startNodeId: string;
}

// Rótulos curtos (≤ 24 chars) — o render auto-layout trunca em ~22; mantê-los
// concisos garante que a classe e a sigla apareçam por inteiro no nó.
const NODES: ReadonlyArray<GacFlowNode> = Object.freeze([
    { id: 'start', type: 'trigger', label: 'Identificação da área' },
    { id: 'ap', type: 'action', label: 'AP — Potencial' },
    { id: 'q_ap', type: 'condition', label: 'Há indícios? (AP)' },
    { id: 'as', type: 'action', label: 'AS — Suspeita' },
    { id: 'q_art28', type: 'condition', label: 'Art. 28? VI/fase/perigo' },
    { id: 'aci', type: 'action', label: 'ACI — Investigação' },
    { id: 'q_risk', type: 'condition', label: 'Risco confirmado?' },
    { id: 'acri', type: 'action', label: 'ACRi — Risco' },
    { id: 'acre', type: 'action', label: 'ACRe — Remediação' },
    { id: 'q_metas', type: 'condition', label: 'Metas atingidas?' },
    { id: 'ame', type: 'action', label: 'AME — Monitoramento' },
    { id: 'ar', type: 'action', label: 'AR — Reabilitada' },
]);

// Fluxo principal (DAG, sem ciclos — o layout em camadas fica legível da esquerda
// p/ direita). As decisões "Sim" avançam de fase; o "Não" do encerramento é o
// próprio retorno didático ao monitoramento, omitido p/ manter o DAG limpo.
const EDGES: ReadonlyArray<GacFlowEdge> = Object.freeze([
    { id: 'e1', from: 'start', to: 'ap' },
    { id: 'e2', from: 'ap', to: 'q_ap' },
    { id: 'e3', from: 'q_ap', to: 'as', label: 'Sim' },
    { id: 'e4', from: 'as', to: 'q_art28' },
    { id: 'e5', from: 'q_art28', to: 'aci', label: 'Sim' },
    { id: 'e6', from: 'aci', to: 'q_risk' },
    { id: 'e7', from: 'q_risk', to: 'acri', label: 'Sim' },
    { id: 'e8', from: 'acri', to: 'acre' },
    { id: 'e9', from: 'acre', to: 'q_metas' },
    { id: 'e10', from: 'q_metas', to: 'ame', label: 'Sim' },
    { id: 'e11', from: 'ame', to: 'ar' },
]);

/**
 * Modelo nativo do fluxo do GAC (cópia nova a cada chamada — imutável para o
 * chamador; o registry de pipelines persiste a sua própria cópia).
 */
export function buildGacFlowModel(): GacFlowModel {
    return {
        nodes: NODES.map((n) => ({ ...n })),
        edges: EDGES.map((e) => ({ ...e })),
        startNodeId: 'start',
    };
}
