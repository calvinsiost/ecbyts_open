// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CASE CATALOG (data) — LMS-INTERACTIVE-ASSESS-001 F3 / RF-4/RF-5
   ================================================================
   Catálogo de Casos Ambientais Interativos (dados declarativos). Cada caso é
   um CaseDefinition consumido por _caseEnginePure/_caseRubricPure. Casos novos
   entram aqui (ou via marketplace) sem mudar o motor.

   Caso seed: "Posto de combustível — vazamento de BTEX no aquífero", o análogo
   ambiental do "Play case #X" do Full Code Medical. Provenance: CONAMA 420,
   CETESB (DD 256/2016, risco J&E), Decreto SP 59.263/2013 (AP/AS/ACI art. 28).
   ================================================================ */

import type { CaseDefinition } from './_caseEnginePure.js';

const POSTO_BTEX: CaseDefinition = Object.freeze({
    id: 'case-posto-btex',
    title: 'Posto de combustível — BTEX no aquífero',
    scenario:
        'Um posto de combustível notificou odor de gasolina num poço de abastecimento ' +
        'vizinho. Suspeita-se de vazamento de BTEX (benzeno, tolueno, etilbenzeno, xilenos) ' +
        'atingindo a água subterrânea. Conduza o caso na sequência técnica correta: ' +
        'caracterize a área, classifique conforme o Decreto 59.263, avalie o risco e ' +
        'só então decida a remediação. Notifique a CETESB. Finalize quando concluir.',
    budgetCents: 6_000_000, // R$ 60.000 de orçamento
    actions: Object.freeze([
        // INVESTIGAÇÃO
        Object.freeze({
            id: 'inv.wells',
            category: 'investigation' as const,
            label: 'Instalar poços de monitoramento',
            costCents: 1_500_000,
            durationDays: 10,
            setsFlags: Object.freeze(['wells_installed']),
            result: 'Poços de monitoramento instalados a jusante e a montante da fonte suspeita.',
        }),
        Object.freeze({
            id: 'inv.gw',
            category: 'investigation' as const,
            label: 'Coletar e analisar amostras de água subterrânea (BTEX)',
            costCents: 800_000,
            durationDays: 7,
            setsFlags: Object.freeze(['characterized']),
            result: 'Resultados: Benzeno = 320 µg/L (VI CONAMA 420 = 5 µg/L). Pluma dissolvida delineada.',
        }),
        Object.freeze({
            id: 'inv.piezo',
            category: 'investigation' as const,
            label: 'Medir níveis piezométricos (direção de fluxo)',
            costCents: 200_000,
            durationDays: 3,
            setsFlags: Object.freeze(['flow_known']),
            result: 'Gradiente hidráulico definido; fluxo aponta para o poço de abastecimento.',
        }),
        // CLASSIFICAÇÃO
        Object.freeze({
            id: 'cls.classify',
            category: 'classification' as const,
            label: 'Classificar a área (Decreto SP 59.263 — AP/AS/ACI)',
            costCents: 100_000,
            durationDays: 2,
            requiresFlags: Object.freeze(['characterized']),
            setsFlags: Object.freeze(['classified']),
            hint: 'Classifique só APÓS caracterizar — a classe depende dos dados de campo.',
            result: 'Benzeno > VI e produto em fase dissolvida → Área Contaminada sob Investigação (ACI, art. 28).',
        }),
        // RISCO
        Object.freeze({
            id: 'risk.je',
            category: 'risk' as const,
            label: 'Avaliação de risco à saúde (CETESB — Johnson & Ettinger)',
            costCents: 700_000,
            durationDays: 14,
            requiresFlags: Object.freeze(['characterized']),
            setsFlags: Object.freeze(['risk_assessed']),
            hint: 'A avaliação de risco precisa dos dados de caracterização.',
            result: 'Risco por ingestão de água acima do aceitável; vapores intrusivos avaliados. CMA derivada.',
        }),
        // REMEDIAÇÃO (correta requer caracterização; técnica adequada à pluma dissolvida)
        Object.freeze({
            id: 'rem.pump',
            category: 'remediation' as const,
            label: 'Bombeamento e tratamento (pump & treat) da pluma',
            costCents: 2_000_000,
            durationDays: 120,
            requiresFlags: Object.freeze(['characterized', 'risk_assessed']),
            setsFlags: Object.freeze(['remediated']),
            hint: 'Só remediar após caracterizar e avaliar o risco.',
            result: 'P&T instalado; captura hidráulica contém a pluma e reduz a concentração.',
        }),
        Object.freeze({
            id: 'rem.bio',
            category: 'remediation' as const,
            label: 'Bioestimulação / Atenuação Natural Monitorada (MNA)',
            costCents: 900_000,
            durationDays: 180,
            requiresFlags: Object.freeze(['characterized', 'risk_assessed']),
            setsFlags: Object.freeze(['remediated']),
            hint: 'Só remediar após caracterizar e avaliar o risco.',
            result: 'Bioestimulação + MNA: BTEX é biodegradável; monitoramento confirma declínio.',
        }),
        Object.freeze({
            id: 'rem.excavate',
            category: 'remediation' as const,
            label: 'Escavação total da pluma dissolvida',
            costCents: 4_500_000,
            durationDays: 30,
            requiresFlags: Object.freeze(['characterized']),
            setsFlags: Object.freeze(['remediated']),
            appropriate: false, // pluma DISSOLVIDA não se "escava" — técnica inadequada
            hint: 'Escavação não trata pluma dissolvida em água — técnica inadequada (e cara).',
            result: 'Escavação executada, mas a pluma dissolvida permanece no aquífero.',
        }),
        // REGULATÓRIO
        Object.freeze({
            id: 'reg.notify',
            category: 'regulatory' as const,
            label: 'Notificar a CETESB e protocolar relatório',
            costCents: 0,
            durationDays: 1,
            setsFlags: Object.freeze(['reported']),
            result: 'CETESB notificada; relatório de investigação protocolado conforme DD 038/2017.',
        }),
        // FINALIZAR
        Object.freeze({
            id: 'finalize',
            category: 'finalize' as const,
            label: 'Finalizar o caso e ver a avaliação',
            result: 'Caso finalizado.',
        }),
    ]),
    rubric: Object.freeze({
        dimensions: Object.freeze([
            { id: 'characterization', label: 'Caracterização', weight: 3, successFlag: 'characterized' },
            { id: 'classification', label: 'Classificação', weight: 2, successFlag: 'classified' },
            { id: 'risk', label: 'Avaliação de risco', weight: 2, successFlag: 'risk_assessed' },
            { id: 'remediation', label: 'Remediação', weight: 3, successFlag: 'remediated' },
            { id: 'regulatory', label: 'Regulatório', weight: 1, successFlag: 'reported' },
            { id: 'cost', label: 'Custo (orçamento)', weight: 1, successFlag: '__cost__' },
        ]),
        vetoes: Object.freeze([
            {
                id: 'blind-remediation',
                whenFlag: 'remediated',
                message:
                    'Remediação iniciada fora de ordem (sem caracterização/risco) ou com técnica inadequada.',
            },
        ]),
    }),
});

const CASES: readonly CaseDefinition[] = Object.freeze([POSTO_BTEX]);

/** Retorna o catálogo de casos (cópia rasa segura). */
export function getCaseCatalog(): readonly CaseDefinition[] {
    return CASES;
}

/** Busca um caso pelo id. */
export function getCaseById(id: string): CaseDefinition | null {
    return CASES.find((c) => c.id === id) || null;
}
