// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ORDERING CATALOG (data) — LMS-INTERACTIVE-ASSESS-001 F5 / RF-11+RF-12
   ================================================================
   Exercícios de ORDENAÇÃO (dados declarativos) consumidos por
   _orderingExercisePure. Dois exercícios seed:

   • emergency  — resposta a vazamento de combustível (contenção na ordem
     correta). Semântica alinhada a core/workflows/definitions/emergency-response
     (reúso de domínio; o motor de ordenação não duplica o workflow engine).
   • checklist  — purga e amostragem de poço de monitoramento (procedimento de
     campo, ABNT NBR 15847 / boas práticas de baixa vazão).

   Cronômetro (KQ4 — TBD Calvin): emergency traz `timeLimitS` declarativo; o
   motor NÃO reprova por tempo até Calvin decidir (só sinaliza).

   PURE: sem IO/DOM/THREE.
   ================================================================ */

import type { OrderingExercise } from './_orderingExercisePure.js';

const EMERGENCY_FUEL_SPILL: OrderingExercise = Object.freeze({
    id: 'order-emergency-fuel-spill',
    category: 'emergency' as const,
    title: 'Emergência: vazamento de combustível no posto',
    scenario:
        'Um tanque de um posto rompeu e há produto livre escoando para a canaleta ' +
        'pluvial, com forte odor de combustível. Ordene as ações de resposta na ' +
        'sequência correta — a prioridade é proteger pessoas e conter a fonte antes ' +
        'de qualquer outra coisa.',
    timeLimitS: 180, // declarativo (KQ4 TBD) — não reprova
    steps: Object.freeze([
        {
            id: 'em.isolate',
            label: 'Isolar a área e eliminar fontes de ignição',
            critical: true,
            rationale: 'Segurança de vidas e prevenção de incêndio vêm primeiro.',
        },
        {
            id: 'em.stop-source',
            label: 'Estancar a fonte do vazamento (fechar/transvasar o tanque)',
            critical: true,
            rationale: 'Parar a liberação reduz a magnitude do dano.',
        },
        {
            id: 'em.contain',
            label: 'Conter o produto livre (barreiras, absorventes, diques)',
            critical: true,
            rationale: 'Impede a migração para drenagem/corpo d’água.',
        },
        {
            id: 'em.protect-drain',
            label: 'Proteger bocas de lobo e a drenagem pluvial',
            rationale: 'Evita que o produto alcance o curso d’água.',
        },
        {
            id: 'em.notify',
            label: 'Notificar a CETESB/órgão ambiental e a defesa civil',
            rationale: 'Comunicação obrigatória, mas após conter a emergência imediata.',
        },
        {
            id: 'em.investigate',
            label: 'Iniciar investigação e recuperação do produto/solo',
            rationale: 'Fase pós-emergência: caracterizar e remediar.',
        },
    ]),
});

const CHECKLIST_WELL_PURGE: OrderingExercise = Object.freeze({
    id: 'order-checklist-well-purge',
    category: 'checklist' as const,
    title: 'Procedimento: purga e amostragem de poço de monitoramento',
    scenario:
        'Você vai coletar uma amostra representativa de água subterrânea num poço de ' +
        'monitoramento. Ordene o procedimento de campo para garantir a integridade da ' +
        'amostra (boas práticas de baixa vazão / ABNT NBR 15847).',
    steps: Object.freeze([
        {
            id: 'ck.measure-level',
            label: 'Medir o nível d’água e a profundidade do poço',
            critical: true,
            rationale: 'Base para calcular o volume e operar a baixa vazão.',
        },
        {
            id: 'ck.volume',
            label: 'Calcular o volume de água do poço',
            rationale: 'Define a purga necessária.',
        },
        {
            id: 'ck.purge',
            label: 'Purgar (baixa vazão) monitorando parâmetros de campo',
            rationale: 'Remove a água estagnada antes da coleta.',
        },
        {
            id: 'ck.stabilize',
            label: 'Estabilizar pH, condutividade, OD e turbidez',
            critical: true,
            rationale: 'Amostra só é representativa após estabilização dos parâmetros.',
        },
        {
            id: 'ck.collect',
            label: 'Coletar a amostra nos frascos apropriados',
            rationale: 'Frascaria correta por parâmetro (VOC sem headspace etc.).',
        },
        {
            id: 'ck.preserve',
            label: 'Preservar (gelo/acidificação) e rotular',
            rationale: 'Mantém a integridade físico-química até o laboratório.',
        },
        {
            id: 'ck.custody',
            label: 'Registrar a cadeia de custódia',
            rationale: 'Rastreabilidade e validade legal da amostra.',
        },
    ]),
});

const EXERCISES: readonly OrderingExercise[] = Object.freeze([
    EMERGENCY_FUEL_SPILL,
    CHECKLIST_WELL_PURGE,
]);

/** Retorna o catálogo de exercícios de ordenação. */
export function getOrderingCatalog(): readonly OrderingExercise[] {
    return EXERCISES;
}

/** Busca um exercício pelo id. */
export function getOrderingExerciseById(id: string): OrderingExercise | null {
    return EXERCISES.find((e) => e.id === id) || null;
}
