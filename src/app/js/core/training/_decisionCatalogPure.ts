// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   DECISION CATALOG (data) — LMS-INTERACTIVE-ASSESS-001 F4 / RF-9+RF-10
   ================================================================
   Cenários declarativos para as lições de DECISÃO (drills curtos):
   • order-investigation  → lacunas (gaps) + opções de investigação;
   • remediation-decision → perfil do sítio + técnicas de remediação.

   A "resposta certa" NÃO está embutida por opção — é DERIVADA pelos motores
   puros (_orderInvestigationPure / _remediationDecisionPure) a partir das
   prioridades/aplicabilidade. Cenários novos entram aqui (ou via marketplace)
   sem mudar os motores. Tema alinhado ao caso seed BTEX.

   PURE: sem IO/DOM/THREE.
   ================================================================ */

import type { KnowledgeGap, InvestigationOption } from './_orderInvestigationPure.js';
import type { SiteProfile, RemediationTechnique } from './_remediationDecisionPure.js';

export interface OrderInvestigationScenario {
    readonly id: string;
    readonly title: string;
    readonly scenario: string;
    readonly gaps: readonly KnowledgeGap[];
    readonly options: readonly InvestigationOption[];
}

export interface RemediationScenario {
    readonly id: string;
    readonly title: string;
    readonly profile: SiteProfile;
    readonly techniques: readonly RemediationTechnique[];
}

const INVEST_BTEX: OrderInvestigationScenario = Object.freeze({
    id: 'dec-invest-btex',
    title: 'Estratégia de investigação — posto com BTEX',
    scenario:
        'Há suspeita de vazamento de BTEX num posto. A fonte já foi localizada, mas ainda ' +
        'não se conhece a EXTENSÃO da pluma nem a DIREÇÃO do fluxo subterrâneo.',
    gaps: Object.freeze([
        { id: 'g-extent', label: 'Extensão/concentração da pluma dissolvida', priority: 1 },
        { id: 'g-flow', label: 'Direção e gradiente do fluxo', priority: 2 },
        { id: 'g-source', label: 'Localização da fonte', priority: 3, filled: true },
    ]),
    options: Object.freeze([
        {
            id: 'oi.gw',
            label: 'Instalar poços e amostrar água subterrânea (BTEX)',
            fillsGapId: 'g-extent',
            costCents: 1_500_000,
            infoValue: 90,
            result: 'Pluma dissolvida delineada; Benzeno = 320 µg/L (VI = 5 µg/L).',
        },
        {
            id: 'oi.piezo',
            label: 'Medir níveis piezométricos (direção de fluxo)',
            fillsGapId: 'g-flow',
            costCents: 200_000,
            infoValue: 70,
            result: 'Gradiente definido; fluxo aponta para o poço de abastecimento vizinho.',
        },
        {
            id: 'oi.resurvey',
            label: 'Re-sondar a fonte já caracterizada',
            fillsGapId: 'g-source',
            costCents: 500_000,
            infoValue: 30,
            result: 'Confirma o que já se sabia — pouco valor agregado agora.',
        },
    ]),
});

const REMEDIATE_BTEX: RemediationScenario = Object.freeze({
    id: 'dec-remediate-btex',
    title: 'Decisão de remediação — pluma dissolvida de BTEX',
    profile: Object.freeze({
        contaminant: 'BTEX',
        phase: 'dissolved' as const,
        matrix: 'groundwater' as const,
        exceedanceRatio: 64,
        receptorRisk: 'high' as const,
    }),
    techniques: Object.freeze([
        {
            id: 'rt.pt',
            label: 'Bombeamento e tratamento (Pump & Treat)',
            suitableFor: Object.freeze(['dissolved' as const]),
            costCents: 2_000_000,
            durationDays: 120,
            efficacy: 85,
            rationale: 'Captura hidráulica contém a pluma e protege o receptor com mais rapidez.',
        },
        {
            id: 'rt.mna',
            label: 'Bioestimulação / Atenuação Natural Monitorada (MNA)',
            suitableFor: Object.freeze(['dissolved' as const]),
            costCents: 900_000,
            durationDays: 180,
            efficacy: 75,
            rationale: 'BTEX é biodegradável; menor custo, mas mais lento — exige risco controlado.',
        },
        {
            id: 'rt.sve',
            label: 'Extração de vapor do solo (SVE)',
            suitableFor: Object.freeze(['vadose_volatile' as const]),
            costCents: 1_200_000,
            durationDays: 90,
            efficacy: 80,
            rationale: 'SVE trata zona NÃO saturada — inadequada para pluma dissolvida.',
        },
        {
            id: 'rt.dig',
            label: 'Escavação total da pluma',
            suitableFor: Object.freeze(['soil_shallow' as const]),
            costCents: 4_500_000,
            durationDays: 30,
            efficacy: 70,
            rationale: 'Não se "escava" água dissolvida — inadequada e cara.',
        },
    ]),
});

const INVEST_SCENARIOS: readonly OrderInvestigationScenario[] = Object.freeze([INVEST_BTEX]);
const REMEDIATE_SCENARIOS: readonly RemediationScenario[] = Object.freeze([REMEDIATE_BTEX]);

/** Busca um cenário de estratégia de investigação pelo id. */
export function getOrderInvestigationScenario(id: string): OrderInvestigationScenario | null {
    return INVEST_SCENARIOS.find((s) => s.id === id) || null;
}

/** Busca um cenário de decisão de remediação pelo id. */
export function getRemediationScenario(id: string): RemediationScenario | null {
    return REMEDIATE_SCENARIOS.find((s) => s.id === id) || null;
}
