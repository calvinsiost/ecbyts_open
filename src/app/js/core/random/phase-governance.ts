// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/**
 * Phase Governance - RANDOM-REBUILD-V2 Phase C.3 + C.7.
 *
 * Extracted from app/js/core/elements/randomModel.js:
 *   - seedCorporateIO (C.3)
 *   - _rmCreateFinancials (C.7)
 *   - buildRandomEisGovernancePack (C.7)
 *
 * Pattern: explicit runtime helper injection for the heavy builders,
 * while this module keeps ownership of governance assembly and
 * corporate I/O seeding without importing randomModel.js back.
 */
import { addCorporateInput, addCorporateOutput, importCorporateIO } from '../io/modelLink.js';
import { getAllElements } from '../elements/manager.js';
import { rand, randInt, pick, shuffle } from '../elements/randomHelpers.js';
import { runtimeDate, runtimeNow, runtimeRandom } from './runtime.js';
import { generateDreScenario } from './_dreScenarioGeneratorPure.js';
import { setErpEntries } from '../erp/erpModelState.js';
/**
 * @typedef {Record<string, any>} RandomElement
 * @typedef {Record<string, any> & {id: string, name?: string, date: Date, plannedReadings?: Array<Record<string, any>>, costs?: any}} RandomCampaign
 * @typedef {Record<string, any> & {id?: string}} RandomContract
 * @typedef {Record<string, any> & {campaigns: RandomCampaign[], siteMeteo: Record<string, any>, edges: Array<Record<string, any>>, financial?: Record<string, any>}} FinancialPhaseContext
 * @typedef {Record<string, any> & {includeCosts?: boolean}} FinancialPhaseRuntime
 * @typedef {Record<string, any> & {generateId?: (prefix: string) => string}} GovernancePackRuntime
 */
/**
 * @param {string} name
 * @param {Array<[string, unknown]>} runtimePairs
 */
function assertRuntime(name: any, runtimePairs: any) {
    for (const [label, value] of runtimePairs) {
        if (typeof value !== 'function') {
            throw new Error(`${name} requires explicit runtime helper: ${label}`);
        }
    }
}
/**
 * Seed purchases/supplies and sales/deliveries for Project > Corporate I/O.
 * Gera transacoes corporativas vinculadas a elementos e campanhas do modelo random.
 *
 * @param {RandomCampaign[]} campaigns
 * @param {RandomContract[]} contracts
 */
export function seedCorporateIO(campaigns: any, contracts: any) {
    // Garante idempotencia em re-execucoes do random no mesmo runtime
    importCorporateIO({ inputs: [], outputs: [] });
    const elements = getAllElements();
    const campaignIds = (campaigns || []).map((c: any) => c.id).filter(Boolean);
    const campaignTimes = (campaigns || [])
        .map((c: any) => c?.date instanceof Date ? c.date.getTime() : NaN)
        .filter(Number.isFinite);
    const now = runtimeNow();
    const minTs = campaignTimes.length > 0 ? Math.min(...campaignTimes) : now - 180 * 86400000;
    const maxTs = campaignTimes.length > 0 ? Math.max(...campaignTimes) : now;
    const pickCampaignId = () => (campaignIds.length > 0 ? pick(campaignIds) : null);
    const pickDateISO = () => runtimeDate(rand(minTs, Math.max(minTs + 1, maxTs)))
        .toISOString()
        .slice(0, 10);
    const pickContractId = () => (Array.isArray(contracts) && contracts.length > 0 ? pick(contracts).id : null);
    /**
     * @param {string[]} [families]
     */
    const pickLinkedElementIds = (families = []) => {
        const pool = families.length > 0 ? elements.filter((e: any) => families.includes(e.family as never)) : elements;
        if (pool.length === 0)
            return [];
        const amount = randInt(1, Math.min(3, pool.length));
        return shuffle([...pool])
            .slice(0, amount)
            .map((e: any) => e.id);
    };
    /** @param {string} prefix */
    const mkInvoiceRef = (prefix: any) => `${prefix}-${runtimeDate().getFullYear()}-${randInt(1000, 9999)}`;
    const inputTemplates = [
        {
            category: 'drilling',
            description: 'Sondagem e instalacao de pocos de monitoramento',
            unit: 'm',
            qty: [180, 950],
            unitCost: [95, 260],
            supplier: 'GeoSonda Ltda',
            families: ['well', 'stratum'],
        },
        {
            category: 'lab_services',
            description: 'Analises laboratoriais de BTEX, TPH e metais',
            unit: 'test',
            qty: [40, 420],
            unitCost: [55, 190],
            supplier: 'LabAnalitica S.A.',
            families: ['well', 'sample', 'plume', 'effluent_point'],
        },
        {
            category: 'equipment',
            description: 'Aquisicao e manutencao de sensores de campo',
            unit: 'un',
            qty: [3, 22],
            unitCost: [1800, 12500],
            supplier: 'SensorNet IoT',
            families: ['sensor', 'well', 'river', 'lake'],
        },
        {
            category: 'logistics',
            description: 'Logistica de campanha e transporte de amostras',
            unit: 'visit',
            qty: [8, 60],
            unitCost: [120, 980],
            supplier: 'EcoLog Transporte',
            families: ['sample', 'well', 'river', 'spring'],
        },
        {
            category: 'consulting_in',
            description: 'Consultoria tecnica especializada em remediacao',
            unit: 'hr',
            qty: [40, 320],
            unitCost: [180, 520],
            supplier: 'EcoConsult Amb.',
            families: ['plume', 'tank', 'area', 'incident'],
        },
        {
            category: 'ppe',
            description: 'EPIs para equipe de campo e laboratorio',
            unit: 'un',
            qty: [25, 260],
            unitCost: [35, 210],
            supplier: 'SafeWork Equipamentos',
            families: ['area', 'individual', 'well'],
        },
        {
            category: 'fuel',
            description: 'Combustivel para deslocamento em campanhas',
            unit: 'L',
            qty: [300, 3500],
            unitCost: [4.5, 8.5],
            supplier: 'Posto Integrado',
            families: ['well', 'sample', 'river', 'spring'],
        },
    ];
    const outputTemplates = [
        {
            category: 'monitoring',
            description: 'Servico de monitoramento ambiental recorrente',
            unit: 'month',
            qty: [3, 18],
            unitCost: [3800, 18000],
            client: 'Cliente Industrial Alpha',
            families: ['well', 'plume', 'sensor'],
        },
        {
            category: 'report',
            description: 'Entrega de relatorios tecnicos e compliance',
            unit: 'un',
            qty: [2, 14],
            unitCost: [2500, 14000],
            client: 'Cliente Regulatorio Beta',
            families: ['area', 'incident', 'habitat'],
        },
        {
            category: 'consulting_out',
            description: 'Consultoria EHS para plano de acao corretivo',
            unit: 'hr',
            qty: [30, 280],
            unitCost: [280, 920],
            client: 'Cliente Energia Gamma',
            families: ['tank', 'emission_source', 'waste_stream', 'effluent_point'],
        },
        {
            category: 'remediation',
            description: 'Projeto e acompanhamento de remediacao',
            unit: 'day',
            qty: [10, 120],
            unitCost: [1200, 6200],
            client: 'Cliente Petro Delta',
            families: ['plume', 'well', 'tank'],
        },
        {
            category: 'certificate',
            description: 'Emissao de laudo e certificado ambiental',
            unit: 'un',
            qty: [1, 10],
            unitCost: [1800, 9500],
            client: 'Cliente Publico Omega',
            families: ['habitat', 'area', 'river', 'lake'],
        },
        {
            category: 'training',
            description: 'Treinamento de equipe para protocolos de campo',
            unit: 'day',
            qty: [2, 20],
            unitCost: [1200, 5400],
            client: 'Cliente Mineracao Sigma',
            families: ['individual', 'area', 'incident'],
        },
    ];
    const selectedInputs = shuffle([...inputTemplates]).slice(0, randInt(4, 6));
    selectedInputs.forEach((tpl: any) => {
        addCorporateInput({
            category: tpl.category,
            description: tpl.description,
            quantity: Math.round(rand(tpl.qty[0], tpl.qty[1]) * 10) / 10,
            unit: tpl.unit,
            unitCost: Math.round(rand(tpl.unitCost[0], tpl.unitCost[1]) * 100) / 100,
            currency: 'BRL',
            date: pickDateISO(),
            supplier: tpl.supplier,
            invoiceRef: mkInvoiceRef('NF-IN'),
            status: pick(['completed', 'completed', 'in_progress', 'planned']),
            notes: 'Item gerado automaticamente no random model',
            linkedElementIds: pickLinkedElementIds(tpl.families),
            linkedCampaignId: pickCampaignId() as string | null,
            linkedContractId: pickContractId() as string | null,
        });
    });
    const selectedOutputs = shuffle([...outputTemplates]).slice(0, randInt(3, 5));
    selectedOutputs.forEach((tpl: any) => {
        addCorporateOutput({
            category: tpl.category,
            description: tpl.description,
            quantity: Math.round(rand(tpl.qty[0], tpl.qty[1]) * 10) / 10,
            unit: tpl.unit,
            unitCost: Math.round(rand(tpl.unitCost[0], tpl.unitCost[1]) * 100) / 100,
            currency: 'BRL',
            date: pickDateISO(),
            supplier: tpl.client,
            invoiceRef: mkInvoiceRef('NF-OUT'),
            status: pick(['completed', 'completed', 'in_progress', 'planned']),
            notes: 'Item gerado automaticamente no random model',
            linkedElementIds: pickLinkedElementIds(tpl.families),
            linkedCampaignId: pickCampaignId() as string | null,
            linkedContractId: pickContractId() as string | null,
        });
    });
}
/**
 * @param {FinancialPhaseContext} ctx
 * @param {FinancialPhaseRuntime} [runtime]
 */
export function createFinancialsPhase(ctx: any, runtime: any = {}) {
    const { buildElementCostEntry, buildCampaignCost, addCampaign, clearCampaigns, generateWBS, generateContracts, generateProjectRegistry, varyCampaignMeteo, includeCosts = true, } = runtime;
    assertRuntime('createFinancialsPhase', [
        ['buildElementCostEntry', buildElementCostEntry],
        ['buildCampaignCost', buildCampaignCost],
        ['addCampaign', addCampaign],
        ['clearCampaigns', clearCampaigns],
        ['generateWBS', generateWBS],
        ['generateContracts', generateContracts],
        ['generateProjectRegistry', generateProjectRegistry],
        ['varyCampaignMeteo', varyCampaignMeteo],
    ]);
    const { campaigns, siteMeteo, edges } = ctx;
    const elements = getAllElements();
    const incidentElements = elements.filter((element: any) => element.family === 'incident');
    const areaElements = elements.filter((element: any) => element.family === 'area');
    const personElements = elements.filter((element: any) => element.family === 'individual' && element.data.individualType === 'person');
    /**
     * @param {string} sourceId
     * @param {string} targetId
     * @param {string} type
     */
    function mkEdge(sourceId: string, targetId: string, type: string) {
        edges.push({
            id: `edge-${edges.length + 1}`,
            sourceId,
            targetId,
            type,
            createdAt: runtimeDate().toISOString(),
        });
    }
    incidentElements.forEach((incident: any) => {
        if (areaElements.length > 0) {
            mkEdge(incident.id, pick(areaElements).id, 'occurred_in');
        }
        if (personElements.length > 0 && runtimeRandom('model') > 0.5) {
            mkEdge(pick(personElements).id, incident.id, 'involved_in');
        }
    });
    const faunaFloraElements = elements.filter((element: any) => element.family === 'individual' && ['animal', 'tree'].includes(element.data.individualType));
    const habitatElements = elements.filter((element: any) => element.family === 'habitat');
    faunaFloraElements.forEach((individual: any) => {
        if (habitatElements.length > 0) {
            mkEdge(individual.id, pick(habitatElements).id, 'inhabits');
        }
    });
    const plumeElements = elements.filter((element: any) => element.family === 'plume');
    const wellElements = elements.filter((element: any) => element.family === 'well');
    plumeElements.forEach((plume: any) => {
        const numMonitors = randInt(1, Math.min(3, wellElements.length));
        const monitors = shuffle([...wellElements]).slice(0, numMonitors);
        monitors.forEach((well: any) => {
            mkEdge(well.id, plume.id, 'monitors');
        });
    });
    const stratumElements = elements.filter((element: any) => element.family === 'stratum');
    const sortedStrata = [...stratumElements].sort((left: any, right: any) => (right.data?.layer?.top || 0) - (left.data?.layer?.top || 0));
    for (let i = 0; i < sortedStrata.length - 1; i++) {
        mkEdge(sortedStrata[i]?.id, sortedStrata[i + 1]?.id, 'adjacent_to');
    }
    if (areaElements.length > 0 && wellElements.length > 0) {
        areaElements.forEach((area: any) => {
            const numWells = randInt(1, Math.min(3, wellElements.length));
            shuffle([...wellElements])
                .slice(0, numWells)
                .forEach((well: any) => {
                mkEdge(area.id, well.id, 'contains');
            });
        });
    }
    const tankElements = elements.filter((element: any) => element.family === 'tank');
    tankElements.forEach((tank: any) => {
        if (areaElements.length > 0) {
            mkEdge(tank.id, pick(areaElements).id, 'impacts');
        }
    });
    const emissionElements = elements.filter((element: any) => element.family === 'emission_source');
    const riverElements = elements.filter((element: any) => element.family === 'river');
    const impactTargets = [...habitatElements, ...riverElements];
    emissionElements.forEach((emission: any) => {
        if (impactTargets.length > 0) {
            mkEdge(emission.id, pick(impactTargets).id, 'impacts');
        }
    });
    const springElements = elements.filter((element: any) => element.family === 'spring');
    const lakeElements = elements.filter((element: any) => element.family === 'lake');
    const downstreamTargets = [...riverElements, ...lakeElements];
    springElements.forEach((spring: any) => {
        if (downstreamTargets.length > 0) {
            mkEdge(spring.id, pick(downstreamTargets).id, 'upstream_of');
        }
    });
    const effluentElements = elements.filter((element: any) => element.family === 'effluent_point');
    effluentElements.forEach((effluent: any) => {
        if (downstreamTargets.length > 0) {
            mkEdge(effluent.id, pick(downstreamTargets).id, 'impacts');
        }
    });
    const responsibilityTargets = [...wellElements, ...areaElements];
    personElements.forEach((person: any) => {
        if (runtimeRandom('model') > 0.5 && responsibilityTargets.length > 0) {
            mkEdge(person.id, pick(responsibilityTargets).id, 'responsible_for');
        }
    });
    campaigns.forEach((campaign: any) => {
        campaign.plannedReadings = [];
    });
    elements.forEach((element: any) => {
        const observations = element?.data?.observations;
        if (!Array.isArray(observations))
            return;
        observations.forEach((observation: any) => {
            if (!observation.showPlanning || !observation.campaignId || !observation.parameterId)
                return;
            const campaign = campaigns.find((entry: any) => entry.id === observation.campaignId);
            if (!campaign)
                return;
            const plannedReadings = campaign.plannedReadings || (campaign.plannedReadings = []);
            plannedReadings.push({
                elementId: element.id,
                parameterId: observation.parameterId,
                x: observation.x,
                y: observation.y,
                z: observation.z,
                expectedValue: null,
            });
        });
    });
    if (includeCosts) {
        const currentYear = runtimeDate().getFullYear();
        elements.forEach((element: any) => {
            const observations = element?.data?.observations;
            if (!Array.isArray(observations) || observations.length === 0)
                return;
            /** @type {Record<string, Array<Record<string, any>>>} */
            const obsByYear: Record<string, Array<Record<string, any>>> = {};
            observations.forEach((observation: any) => {
                const year = observation.date ? parseInt(observation.date.slice(0, 4), 10) : currentYear;
                if (!(obsByYear as any)[year])
                    (obsByYear as any)[year] = [];
                (obsByYear as any)[year].push(observation);
            });
            const observationsWithCost = observations.filter((observation: any) => observation.cost && observation.cost.total > 0);
            const avgAnalyticalCost = observationsWithCost.length > 0
                ? observationsWithCost.reduce((sum: any, observation: any) => sum + observation.cost.total, 0) /
                    observationsWithCost.length
                : 0;
            const depth = element.data?.construction?.totalDepth || 0;
            element.data.costs = Object.keys(obsByYear)
                .sort()
                .map((year: any, index: any) => buildElementCostEntry(element.family, parseInt(year, 10), {
                depth: index === 0 ? depth : 0,
                numReadings: obsByYear[year]?.length || 0,
                avgAnalyticalCost,
                basis: 'estimate',
                includeCapex: index === 0,
            }));
        });
        campaigns.forEach((campaign: any) => {
            /** @type {Array<Record<string, any>>} */
            const campaignObservations: Array<Record<string, any>> = [];
            const campaignElements = new Set<string>();
            elements.forEach((element: any) => {
                const observations = element?.data?.observations;
                if (!Array.isArray(observations))
                    return;
                observations.forEach((observation: any) => {
                    if (observation.campaignId !== campaign.id)
                        return;
                    campaignObservations.push(observation);
                    campaignElements.add(element.id);
                });
            });
            const observationsWithCost = campaignObservations.filter((observation: any) => observation.cost?.total > 0);
            const avgCost = observationsWithCost.length > 0
                ? observationsWithCost.reduce((sum: any, observation: any) => sum + (observation.cost?.total || 0), 0) /
                    observationsWithCost.length
                : 0;
            campaign.costs = buildCampaignCost(campaignElements.size, campaignObservations.length, avgCost);
        });
    }
    const campaignColors = ['#3b6bff', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];
    clearCampaigns();
    campaigns.forEach((campaign: any, index: any) => {
        addCampaign({
            id: campaign.id,
            name: campaign.name,
            startDate: campaign.date.toISOString().slice(0, 10),
            color: campaignColors[index % campaignColors.length],
            visible: true,
            plannedReadings: campaign.plannedReadings,
            costs: campaign.costs || null,
        });
    });
    const wbs = generateWBS();
    const contracts = generateContracts();
    const campaignIds = campaigns.map((campaign: any) => campaign.id);
    // DRE-COMPLETA (Calvin 2026-06-21): além dos CUSTOS (despesas) acima, gerar o
    // lado da RECEITA + tributos/financeiro/depreciação para a DRE consolidada
    // (ERP-DRE-001) fechar completa (receita bruta → líquida → lucro líquido), e
    // não só com prejuízo. Sai em ctx.financial.dreScenario (NOVO campo — ver
    // _dreScenarioGeneratorPure.ts) com os lançamentos a serem mesclados aos
    // lançamentos de custo antes de buildLedger/buildIncomeStatement.
    const dreScenario = includeCosts ? buildRandomDreScenario(elements) : null;
    ctx.financial = {
        wbs,
        contracts,
        projectRegistry: generateProjectRegistry(wbs, contracts, campaignIds),
        meteorology: siteMeteo,
        campaignMeteo: campaigns.map((campaign: any) => ({
            campaignId: campaign.id,
            date: campaign.date.toISOString().slice(0, 10),
            ...varyCampaignMeteo(siteMeteo)
        })),
        ...(dreScenario ? { dreScenario } : {}),
    };
    if (dreScenario) {
        // PERSISTÊNCIA (Calvin 2026-06-21 "guardar na chave .ecbt sempre"): grava
        // os lançamentos no STORE persistível do ERP (erpModelState) — daqui eles
        // viajam dentro da chave .ecbt (export.financial) e voltam ao abrir.
        try {
            setErpEntries(dreScenario.entries as any);
        } catch (err: any) {
            console.debug('[random:dre] store dre entries skipped:', err?.message || err);
        }
        // Publica TAMBÉM no lugar global (compat: cadeia ERP do Score lê o store
        // primeiro e cai p/ window se vazio; o summary segue só em window).
        try {
            const root: any = typeof window !== 'undefined' ? window : globalThis;
            root.__ecbtRandomDreEntries = dreScenario.entries;
            root.__ecbtRandomDreSummary = dreScenario.summary;
        } catch (err: any) {
            console.debug('[random:dre] publish dre entries skipped:', err?.message || err);
        }
    }
    seedCorporateIO(campaigns, contracts);
}
/**
 * Calcula o custo/CAPEX base a partir dos `element.data.costs[]` já gerados e
 * produz o cenário de DRE completo (receita bruta, deduções, depreciação,
 * resultado financeiro). Tier é escolhido pela ESCALA do custo total para que a
 * receita gerada seja coerente com o porte do empreendimento. Determinístico:
 * usa o runtime seedeado do random (Date congelado → fiscalYear estável).
 *
 * @param {RandomElement[]} elements
 * @returns {ReturnType<typeof generateDreScenario> | null}
 */
function buildRandomDreScenario(elements: any) {
    let costBase = 0;
    let capexBase = 0;
    let latestFiscalYear = runtimeDate().getFullYear();
    for (const element of elements || []) {
        const costs = element?.data?.costs;
        if (!Array.isArray(costs)) continue;
        for (const row of costs) {
            const opex = Number(row?.opexTotal) || 0;
            const capex = Number(row?.capexTotal) || 0;
            costBase += opex + capex;
            capexBase += capex;
            const fy = Number(row?.fiscalYear);
            if (Number.isFinite(fy) && fy > latestFiscalYear) latestFiscalYear = fy;
        }
    }
    // Tier pela escala do custo total (faixas alinhadas a _fineScenarioGeneratorPure).
    const tier: 'gigante' | 'media' | 'pme' | 'catastrofe' =
        costBase >= 1_000_000_000 ? 'gigante' : costBase >= 10_000_000 ? 'media' : 'pme';
    // Seed estável derivada do seed ativo do random (mesmo run → mesma DRE).
    const root: any = typeof window !== 'undefined' ? window : globalThis;
    const activeSeed = root?.__ecbtsRandomActiveSeed ?? 0;
    return generateDreScenario({
        tier,
        seed: `${String(activeSeed)}::governance-dre`,
        costBase,
        capexBase,
        fiscalYear: latestFiscalYear,
    });
}
/**
 * @param {{campaigns?: RandomCampaign[], areas?: Array<Record<string, any>>}} [input]
 * @param {GovernancePackRuntime} [runtime]
 */
export function buildRandomEisGovernancePack(
    { campaigns = [], areas = [] }: { campaigns?: any[]; areas?: Array<Record<string, any>> } = {},
    runtime: { generateId?: (prefix: string) => string } = {},
) {
    const { generateId } = runtime;
    assertRuntime('buildRandomEisGovernancePack', [['generateId', generateId]]);
    const makeId = (generateId) as (prefix: string) => string;
    const safeCampaigns = Array.isArray(campaigns) ? campaigns : [];
    const safeAreas = Array.isArray(areas) ? areas : [];
    const uniqueAreas = [...new Set(safeAreas.map((area: any) => area?.area).filter(Boolean))];
    const primaryArea = uniqueAreas[0] || 'Area 1';
    const secondaryArea = uniqueAreas[1] || 'Area B';
    const documents: Array<Record<string, any>> = [
        {
            id: makeId('doc'),
            type: 'environmental_license',
            code: `LA-${randInt(1000, 9999)}`,
            title: `Licenca Ambiental Prioritaria - ${primaryArea}`,
            authority: pick(['CETESB', 'IBAMA', 'SEMA']),
            linkedArea: primaryArea,
            priorityWeightRatio: '2:1',
        },
        {
            id: makeId('doc'),
            type: 'monitoring_report',
            code: `RMON-${randInt(1000, 9999)}`,
            title: `Relatorio de Monitoramento - ${secondaryArea}`,
            authority: 'Operador',
            linkedArea: secondaryArea,
            priorityWeightRatio: '1:1',
        },
    ];
    /** @type {Array<Record<string, any>>} */
    const datasetCollections: Array<Record<string, any>> = [];
    /** @type {Array<Record<string, any>>} */
    const campaignGroups: Array<Record<string, any>> = [];
    safeCampaigns.forEach((campaign: any) => {
        const collectionA = {
            id: makeId('dset'),
            campaignId: campaign.id,
            name: `Colecao ${primaryArea} • ${campaign.name}`,
            scope: { type: 'area', value: primaryArea },
            weight: { numerator: 2, denominator: 1, normalized: 2.0 },
            linkedDocumentId: documents[0]?.id as any,
            rationale: 'Area prioritaria por condicionante de licenca ambiental',
        };
        const collectionB = {
            id: makeId('dset'),
            campaignId: campaign.id,
            name: `Colecao ${secondaryArea} • ${campaign.name}`,
            scope: { type: 'area', value: secondaryArea },
            weight: { numerator: 1, denominator: 1, normalized: 1.0 },
            linkedDocumentId: documents[1]?.id as any,
            rationale: 'Area comparativa padrao',
        };
        datasetCollections.push(collectionA, collectionB);
        campaignGroups.push({
            id: makeId('cg'),
            type: 'campaign_super_group',
            campaignId: campaign.id,
            campaignName: campaign.name,
            campaignDate: campaign.date?.toISOString?.().slice(0, 10) || null,
            collectionIds: [collectionA.id, collectionB.id],
            weightedPrioritySummary: `${primaryArea}=2x, ${secondaryArea}=1x`,
        });
    });
    return {
        schemaVersion: 'eis-governance-pack.v1',
        groupingMode: 'campaign',
        weightingModel: 'collection_weighted_by_document_priority',
        documents,
        datasetCollections,
        campaignGroups,
        guidance: [
            'Agrupar datasets por campanha (grupo superior) antes do calculo de eixos.',
            'Aplicar peso 2:1 para colecoes de area condicionada por licenca.',
            'Registrar vinculo dataset-documento para rastreabilidade regulatoria.',
        ],
    };
}
