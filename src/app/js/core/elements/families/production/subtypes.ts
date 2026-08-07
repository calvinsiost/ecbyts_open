// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PRODUCTION-AREA-001 — Catálogo data-driven de subtipos (Fase 1).
   O CORAÇÃO AMPLIÁVEL da família: adicionar um subtipo novo (cimento,
   papel/celulose, siderurgia…) é só acrescentar um objeto neste mapa
   — nenhuma lógica nem tipo muda (ver productionSchema.ts).

   Subtipos iniciais (RF-3): 'mining' (mineração) e 'petroleum' (petróleo).
   Cada subtipo declara suas etapas típicas (RF-4) com portas de
   entrada/saída e as três taxas universais (RF-5). Toda label é uma
   chave i18n (RF-10) — zero string hardcoded.

   Catálogo ampliado (SCENARIOS-PROCESS-IMPACT CFG-05, guard-rail §2.4.0):
   6 subtipos CURADOS — 'rsu', 'cement', 'pulp-paper', 'steel',
   'renewable-energy', 'construction' — cada um com etapas plausíveis,
   rotas de saída e defaults de taxas validados (recoveryRate/yield em
   [0,1] e yield ≤ recoveryRate por etapa, coerente com a regra cruzada
   CFG-40 do motor de cenários). Defaults citam a fonte de referência
   quando aplicável (faixas validadas — §2.4.0). Convenção de yield:
   `{ value, unit: '%' }` = valor em PORCENTAGEM (0–100); recoveryRate é
   fração 0–1 (padrão do schema productionSchema.ts). Chaves i18n sem
   tradução ainda nos locales caem no fallback da casa (t() devolve a
   própria chave) — não editamos locale JSON aqui.

   Spec: docs/specs/features/SPEC_PRODUCTION_AREA_FAMILY.md (§4, §7)
         docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2.4 CFG-05)
   ================================================================ */

import type { ProductionSubtype } from './productionSchema.js';

/**
 * Registry canônico de subtipos. Indexado por id do subtipo.
 * Congelado para evitar mutação acidental — ampliar = adicionar
 * uma nova chave aqui (data-driven, zero lógica).
 */
export const PRODUCTION_SUBTYPES: Readonly<Record<string, ProductionSubtype>> = Object.freeze({
    /**
     * Mineração — lavra → britagem/moagem → concentração → rejeito.
     * Referência: balanço de massa metalúrgico (entra minério, sai
     * concentrado + rejeito), três taxas (throughput, recovery, grade).
     */
    mining: {
        id: 'mining',
        nameKey: 'productionSubtype.mining',
        icon: 'mountain',
        categories: [
            {
                id: 'extraction',
                nameKey: 'productionCategory.extraction',
                order: 1,
                inputs: [{ id: 'reserve', nameKey: 'productionPort.reserve', unit: 't' }],
                outputs: [{ id: 'runOfMine', nameKey: 'productionPort.runOfMine', unit: 't/h' }],
                rates: { throughput: { value: 0, unit: 't/h' } },
            },
            {
                id: 'comminution',
                nameKey: 'productionCategory.comminution',
                order: 2,
                inputs: [{ id: 'runOfMine', nameKey: 'productionPort.runOfMine', unit: 't/h' }],
                outputs: [{ id: 'groundOre', nameKey: 'productionPort.groundOre', unit: 't/h' }],
                rates: { throughput: { value: 0, unit: 't/h' } },
            },
            {
                id: 'beneficiation',
                nameKey: 'productionCategory.beneficiation',
                order: 3,
                inputs: [
                    { id: 'ore', nameKey: 'productionPort.ore', unit: 't/h' },
                    { id: 'water', nameKey: 'productionPort.water', unit: 'm3/h' },
                ],
                outputs: [
                    { id: 'concentrate', nameKey: 'productionPort.concentrate', unit: 't/h' },
                    { id: 'tailings', nameKey: 'productionPort.tailings', unit: 't/h' },
                ],
                rates: {
                    throughput: { value: 0, unit: 't/h' },
                    recoveryRate: 0,
                    yield: { value: 0, unit: '%' },
                },
            },
            {
                id: 'tailings',
                nameKey: 'productionCategory.tailings',
                order: 4,
                inputs: [{ id: 'tailings', nameKey: 'productionPort.tailings', unit: 't/h' }],
                outputs: [{ id: 'disposedTailings', nameKey: 'productionPort.disposedTailings', unit: 't/h' }],
                rates: { throughput: { value: 0, unit: 't/h' } },
            },
        ],
    },

    /**
     * Petróleo — extração → separação primária → refino → subprodutos.
     * Referência: refino modela a mesma coisa (rendimentos por corrente).
     */
    petroleum: {
        id: 'petroleum',
        nameKey: 'productionSubtype.petroleum',
        icon: 'droplet',
        categories: [
            {
                id: 'extraction',
                nameKey: 'productionCategory.extraction',
                order: 1,
                inputs: [{ id: 'reservoir', nameKey: 'productionPort.reservoir', unit: 'bbl' }],
                outputs: [{ id: 'wellFluid', nameKey: 'productionPort.wellFluid', unit: 'bbl/d' }],
                rates: { throughput: { value: 0, unit: 'bbl/d' } },
            },
            {
                id: 'separation',
                nameKey: 'productionCategory.separation',
                order: 2,
                inputs: [{ id: 'wellFluid', nameKey: 'productionPort.wellFluid', unit: 'bbl/d' }],
                outputs: [
                    { id: 'crudeOil', nameKey: 'productionPort.crudeOil', unit: 'bbl/d' },
                    { id: 'producedWater', nameKey: 'productionPort.producedWater', unit: 'bbl/d' },
                    { id: 'associatedGas', nameKey: 'productionPort.associatedGas', unit: 'm3/d' },
                ],
                rates: { throughput: { value: 0, unit: 'bbl/d' }, recoveryRate: 0 },
            },
            {
                id: 'refining',
                nameKey: 'productionCategory.refining',
                order: 3,
                inputs: [{ id: 'crudeOil', nameKey: 'productionPort.crudeOil', unit: 'bbl/d' }],
                outputs: [
                    { id: 'fuels', nameKey: 'productionPort.fuels', unit: 'bbl/d' },
                    { id: 'residues', nameKey: 'productionPort.residues', unit: 'bbl/d' },
                ],
                rates: {
                    throughput: { value: 0, unit: 'bbl/d' },
                    yield: { value: 0, unit: '%' },
                },
            },
            {
                id: 'byproducts',
                nameKey: 'productionCategory.byproducts',
                order: 4,
                inputs: [{ id: 'residues', nameKey: 'productionPort.residues', unit: 'bbl/d' }],
                outputs: [{ id: 'byproducts', nameKey: 'productionPort.byproducts', unit: 't/d' }],
                rates: { throughput: { value: 0, unit: 't/d' } },
            },
        ],
    },

    /* ------------------------------------------------------------------
       CFG-05 — Catálogo curado ampliado (6 subtipos, Fase P4/H1).
       Defaults validados com fonte citável (guard-rail §2.4.0):
       faixas de literatura técnica; recoveryRate/yield em [0,1] e
       yield ≤ recoveryRate por etapa (regra cruzada CFG-40 do motor).
       ------------------------------------------------------------------ */

    /**
     * RSU — Resíduos Sólidos Urbanos (aterro sanitário com captação de
     * biogás/metano — domínio do TG do Calvin: comparador de rotas RSU).
     * recebimento/aterro → captação de biogás → valorização energética →
     * tratamento de chorume.
     * Referências: IPCC 2006 Guidelines Vol.5 (resíduos); US EPA LMOP —
     * eficiência típica de coleta de gás de aterro 60–85% (default 0.75);
     * eficiência elétrica de motogerador a biogás 30–40% (default 33%).
     */
    rsu: {
        id: 'rsu',
        nameKey: 'productionSubtype.rsu',
        icon: 'recycle',
        categories: [
            {
                id: 'reception',
                nameKey: 'productionCategory.reception',
                order: 1,
                inputs: [{ id: 'msw', nameKey: 'productionPort.msw', unit: 't/d' }],
                outputs: [{ id: 'landfilledWaste', nameKey: 'productionPort.landfilledWaste', unit: 't/d' }],
                rates: { throughput: { value: 500, unit: 't/d' } },
            },
            {
                id: 'biogasCollection',
                nameKey: 'productionCategory.biogasCollection',
                order: 2,
                inputs: [{ id: 'landfilledWaste', nameKey: 'productionPort.landfilledWaste', unit: 't/d' }],
                outputs: [
                    { id: 'biogas', nameKey: 'productionPort.biogas', unit: 'm3/d' },
                    { id: 'leachate', nameKey: 'productionPort.leachate', unit: 'm3/d' },
                ],
                rates: {
                    throughput: { value: 500, unit: 't/d' },
                    // Fração do biogás gerado efetivamente captada (EPA LMOP: 60–85%).
                    recoveryRate: 0.75,
                },
            },
            {
                id: 'energyRecovery',
                nameKey: 'productionCategory.energyRecovery',
                order: 3,
                inputs: [{ id: 'biogas', nameKey: 'productionPort.biogas', unit: 'm3/d' }],
                outputs: [
                    { id: 'electricity', nameKey: 'productionPort.electricity', unit: 'MWh/d' },
                    { id: 'flareGas', nameKey: 'productionPort.flareGas', unit: 'm3/d' },
                ],
                rates: {
                    throughput: { value: 6000, unit: 'm3/d' },
                    // Fração do biogás captado aproveitada (resto vai ao flare).
                    recoveryRate: 0.85,
                    // Eficiência elétrica do motogerador (IPCC/fabricantes: 30–40%).
                    yield: { value: 33, unit: '%' },
                },
            },
            {
                id: 'leachateTreatment',
                nameKey: 'productionCategory.leachateTreatment',
                order: 4,
                inputs: [{ id: 'leachate', nameKey: 'productionPort.leachate', unit: 'm3/d' }],
                outputs: [
                    { id: 'treatedEffluent', nameKey: 'productionPort.treatedEffluent', unit: 'm3/d' },
                    { id: 'sludge', nameKey: 'productionPort.sludge', unit: 't/d' },
                ],
                rates: { throughput: { value: 150, unit: 'm3/d' } },
            },
        ],
    },

    /**
     * Cimento — moagem de cru → clinquerização (forno) → moagem final.
     * Referências: balanço de massa do forno (perda de ignição do
     * carbonato ~35% → rendimento cru→clínquer ~0.65); fator clínquer
     * típico de cimento Portland comum ~95% (SNIC/European Cement
     * Research Academy).
     */
    cement: {
        id: 'cement',
        nameKey: 'productionSubtype.cement',
        icon: 'box',
        categories: [
            {
                id: 'rawGrinding',
                nameKey: 'productionCategory.rawGrinding',
                order: 1,
                inputs: [
                    { id: 'limestone', nameKey: 'productionPort.limestone', unit: 't/h' },
                    { id: 'clay', nameKey: 'productionPort.clay', unit: 't/h' },
                ],
                outputs: [{ id: 'rawMeal', nameKey: 'productionPort.rawMeal', unit: 't/h' }],
                rates: { throughput: { value: 250, unit: 't/h' } },
            },
            {
                id: 'clinkerization',
                nameKey: 'productionCategory.clinkerization',
                order: 2,
                inputs: [
                    { id: 'rawMeal', nameKey: 'productionPort.rawMeal', unit: 't/h' },
                    { id: 'kilnFuel', nameKey: 'productionPort.kilnFuel', unit: 't/h' },
                ],
                outputs: [
                    { id: 'clinker', nameKey: 'productionPort.clinker', unit: 't/h' },
                    { id: 'kilnDust', nameKey: 'productionPort.kilnDust', unit: 't/h' },
                ],
                rates: {
                    throughput: { value: 160, unit: 't/h' },
                    // Rendimento mássico cru→clínquer (perda de ignição ~35%).
                    recoveryRate: 0.65,
                },
            },
            {
                id: 'cementGrinding',
                nameKey: 'productionCategory.cementGrinding',
                order: 3,
                inputs: [
                    { id: 'clinker', nameKey: 'productionPort.clinker', unit: 't/h' },
                    { id: 'gypsum', nameKey: 'productionPort.gypsum', unit: 't/h' },
                ],
                outputs: [
                    { id: 'cementProduct', nameKey: 'productionPort.cementProduct', unit: 't/h' },
                    { id: 'baghouseDust', nameKey: 'productionPort.baghouseDust', unit: 't/h' },
                ],
                rates: {
                    throughput: { value: 180, unit: 't/h' },
                    recoveryRate: 0.99,
                    // Fator clínquer (clínquer/cimento) típico ~95%.
                    yield: { value: 95, unit: '%' },
                },
            },
        ],
    },

    /**
     * Papel e celulose — preparo da madeira → polpação kraft → máquina
     * de papel. Referências: rendimento kraft 42–46% sobre madeira seca
     * (Gullichsen & Fogelholm, Chemical Pulping); eficiência de máquina
     * de papel ~90% (retenção/formação).
     */
    'pulp-paper': {
        id: 'pulp-paper',
        nameKey: 'productionSubtype.pulpPaper',
        icon: 'scroll',
        categories: [
            {
                id: 'woodPreparation',
                nameKey: 'productionCategory.woodPreparation',
                order: 1,
                inputs: [{ id: 'wood', nameKey: 'productionPort.wood', unit: 'm3/d' }],
                outputs: [
                    { id: 'chips', nameKey: 'productionPort.chips', unit: 'm3/d' },
                    { id: 'bark', nameKey: 'productionPort.bark', unit: 'm3/d' },
                ],
                rates: { throughput: { value: 8000, unit: 'm3/d' } },
            },
            {
                id: 'kraftPulping',
                nameKey: 'productionCategory.kraftPulping',
                order: 2,
                inputs: [
                    { id: 'chips', nameKey: 'productionPort.chips', unit: 'm3/d' },
                    { id: 'whiteLiquor', nameKey: 'productionPort.whiteLiquor', unit: 'm3/d' },
                ],
                outputs: [
                    { id: 'pulp', nameKey: 'productionPort.pulp', unit: 't/d' },
                    { id: 'blackLiquor', nameKey: 'productionPort.blackLiquor', unit: 'm3/d' },
                ],
                rates: {
                    throughput: { value: 8000, unit: 'm3/d' },
                    // Rendimento kraft madeira→celulose (42–46%).
                    recoveryRate: 0.45,
                },
            },
            {
                id: 'paperMachine',
                nameKey: 'productionCategory.paperMachine',
                order: 3,
                inputs: [
                    { id: 'pulp', nameKey: 'productionPort.pulp', unit: 't/d' },
                    { id: 'processWater', nameKey: 'productionPort.processWater', unit: 'm3/d' },
                ],
                outputs: [
                    { id: 'paper', nameKey: 'productionPort.paper', unit: 't/d' },
                    { id: 'wastewater', nameKey: 'productionPort.wastewater', unit: 'm3/d' },
                ],
                rates: {
                    throughput: { value: 2200, unit: 't/d' },
                    recoveryRate: 0.98,
                    // Eficiência de formação/retenção da máquina (~90%).
                    yield: { value: 90, unit: '%' },
                },
            },
        ],
    },

    /**
     * Siderurgia — alto-forno (ferro-gusa) → aciaria BOF → laminação.
     * Referências: recuperação metalúrgica de Fe no alto-forno 94–97%
     * (balanço metalúrgico clássico); rendimento metálico BOF ~89–91%;
     * rendimento de laminação ~97% (perdas em carepa/refile).
     */
    steel: {
        id: 'steel',
        nameKey: 'productionSubtype.steel',
        icon: 'flame',
        categories: [
            {
                id: 'ironmaking',
                nameKey: 'productionCategory.ironmaking',
                order: 1,
                inputs: [
                    { id: 'ironOre', nameKey: 'productionPort.ironOre', unit: 't/h' },
                    { id: 'coke', nameKey: 'productionPort.coke', unit: 't/h' },
                ],
                outputs: [
                    { id: 'pigIron', nameKey: 'productionPort.pigIron', unit: 't/h' },
                    { id: 'blastFurnaceSlag', nameKey: 'productionPort.blastFurnaceSlag', unit: 't/h' },
                ],
                rates: {
                    throughput: { value: 500, unit: 't/h' },
                    // Recuperação de Fe no alto-forno (94–97%).
                    recoveryRate: 0.95,
                },
            },
            {
                id: 'steelmaking',
                nameKey: 'productionCategory.steelmaking',
                order: 2,
                inputs: [
                    { id: 'pigIron', nameKey: 'productionPort.pigIron', unit: 't/h' },
                    { id: 'scrap', nameKey: 'productionPort.scrap', unit: 't/h' },
                ],
                outputs: [
                    { id: 'liquidSteel', nameKey: 'productionPort.liquidSteel', unit: 't/h' },
                    { id: 'steelSlag', nameKey: 'productionPort.steelSlag', unit: 't/h' },
                ],
                rates: {
                    throughput: { value: 450, unit: 't/h' },
                    recoveryRate: 0.95,
                    // Rendimento metálico da aciaria BOF (~89–91%).
                    yield: { value: 90, unit: '%' },
                },
            },
            {
                id: 'rolling',
                nameKey: 'productionCategory.rolling',
                order: 3,
                inputs: [{ id: 'liquidSteel', nameKey: 'productionPort.liquidSteel', unit: 't/h' }],
                outputs: [
                    { id: 'rolledProducts', nameKey: 'productionPort.rolledProducts', unit: 't/h' },
                    { id: 'millScale', nameKey: 'productionPort.millScale', unit: 't/h' },
                ],
                rates: {
                    throughput: { value: 400, unit: 't/h' },
                    // Rendimento de laminação (~97%).
                    yield: { value: 97, unit: '%' },
                },
            },
        ],
    },

    /**
     * Energia renovável — captação do recurso → conversão → entrega à
     * rede. Referências: eficiência de módulo FV ~20% (NREL); energia
     * líquida após perdas do sistema (performance ratio ~0.80 → ~16%).
     */
    'renewable-energy': {
        id: 'renewable-energy',
        nameKey: 'productionSubtype.renewableEnergy',
        icon: 'zap',
        categories: [
            {
                id: 'resourceCapture',
                nameKey: 'productionCategory.resourceCapture',
                order: 1,
                inputs: [{ id: 'solarIrradiance', nameKey: 'productionPort.solarIrradiance', unit: 'kWh/m2/d' }],
                outputs: [{ id: 'grossEnergy', nameKey: 'productionPort.grossEnergy', unit: 'MWh/d' }],
                rates: { throughput: { value: 120, unit: 'MWh/d' } },
            },
            {
                id: 'conversion',
                nameKey: 'productionCategory.conversion',
                order: 2,
                inputs: [{ id: 'grossEnergy', nameKey: 'productionPort.grossEnergy', unit: 'MWh/d' }],
                outputs: [
                    { id: 'electricity', nameKey: 'productionPort.electricity', unit: 'MWh/d' },
                    { id: 'systemLosses', nameKey: 'productionPort.systemLosses', unit: 'MWh/d' },
                ],
                rates: {
                    throughput: { value: 120, unit: 'MWh/d' },
                    // Eficiência de conversão do módulo FV (NREL ~20%).
                    recoveryRate: 0.2,
                    // Energia líquida após perdas (PR ~0.80 × 20% ≈ 16%).
                    yield: { value: 16, unit: '%' },
                },
            },
            {
                id: 'gridDelivery',
                nameKey: 'productionCategory.gridDelivery',
                order: 3,
                inputs: [{ id: 'electricity', nameKey: 'productionPort.electricity', unit: 'MWh/d' }],
                outputs: [
                    { id: 'gridEnergy', nameKey: 'productionPort.gridEnergy', unit: 'MWh/d' },
                    { id: 'curtailment', nameKey: 'productionPort.curtailment', unit: 'MWh/d' },
                ],
                rates: { throughput: { value: 96, unit: 'MWh/d' } },
            },
        ],
    },

    /**
     * Construção civil — terraplenagem → estrutura → gestão de RCD.
     * Referências: taxa de reciclagem de resíduos de construção e
     * demolição (RCD) ~70% (CONAMA 307 / ABRECON — potencial de
     * reciclagem de entulho classe A).
     */
    construction: {
        id: 'construction',
        nameKey: 'productionSubtype.construction',
        icon: 'hard-hat',
        categories: [
            {
                id: 'earthworks',
                nameKey: 'productionCategory.earthworks',
                order: 1,
                inputs: [{ id: 'site', nameKey: 'productionPort.site', unit: 'm3' }],
                outputs: [
                    { id: 'excavatedSoil', nameKey: 'productionPort.excavatedSoil', unit: 'm3/d' },
                    { id: 'earthworkDebris', nameKey: 'productionPort.earthworkDebris', unit: 'm3/d' },
                ],
                rates: { throughput: { value: 2000, unit: 'm3/d' } },
            },
            {
                id: 'structure',
                nameKey: 'productionCategory.structure',
                order: 2,
                inputs: [
                    { id: 'concrete', nameKey: 'productionPort.concrete', unit: 't/d' },
                    { id: 'structuralSteel', nameKey: 'productionPort.structuralSteel', unit: 't/d' },
                ],
                outputs: [
                    { id: 'builtStructure', nameKey: 'productionPort.builtStructure', unit: 't/d' },
                    { id: 'constructionWaste', nameKey: 'productionPort.constructionWaste', unit: 't/d' },
                ],
                rates: {
                    throughput: { value: 300, unit: 't/d' },
                    // Aproveitamento de materiais na estrutura (perdas ~5%).
                    yield: { value: 95, unit: '%' },
                },
            },
            {
                id: 'wasteManagement',
                nameKey: 'productionCategory.wasteManagement',
                order: 3,
                inputs: [{ id: 'constructionWaste', nameKey: 'productionPort.constructionWaste', unit: 't/d' }],
                outputs: [
                    { id: 'recycledRCD', nameKey: 'productionPort.recycledRCD', unit: 't/d' },
                    { id: 'disposedRCD', nameKey: 'productionPort.disposedRCD', unit: 't/d' },
                ],
                rates: {
                    throughput: { value: 15, unit: 't/d' },
                    // Reciclagem de RCD (CONAMA 307/ABRECON ~70%).
                    recoveryRate: 0.7,
                },
            },
        ],
    },

    /* ------------------------------------------------------------------
       ENERGY-SCENARIOS-001 #2 — Conversão termoquímica de biomassa.
       Cadeia: secagem → pirólise → co-queima → caldeira. Portas de
       ENERGIA (GJ/d, MWh/d) além de massa (t/d). Rendimentos POR PRODUTO
       via `yieldFraction` nas portas de saída (co-produtos da pirólise:
       sólido/líquido/gás/cinza). Defaults do caso biomassa lignocelulósica (resíduo de várzea):
       sólido/biochar 50% (faixa 35,7–52,7%), bio-óleo 6% (3–7%), gás 34%
       (30–34%), cinza 6% (3,6–7%) — Σ = 0,96 ≤ 1 (balanço fecha, 4% perdas).
       Ligação com energyFactors.ts via `energyFactorId` (biochar → PCS ~33
       MJ/kg → energia calculada no painel). Regra CFG-40 (yield ≤ recovery)
       preservada usando recoveryRate de etapa e yieldFraction por porta.
       ------------------------------------------------------------------ */
    thermochemical: {
        id: 'thermochemical',
        nameKey: 'productionSubtype.thermochemical',
        icon: 'flame',
        categories: [
            {
                // Secagem — remove umidade da biomassa úmida (resíduo lignocelulósico).
                id: 'drying',
                nameKey: 'productionCategory.drying',
                order: 1,
                inputs: [{ id: 'biomassWet', nameKey: 'productionPort.biomassWet', unit: 't/d', defaultValue: 100 }],
                outputs: [
                    { id: 'biomassDry', nameKey: 'productionPort.biomassDry', unit: 't/d', yieldFraction: 0.85 },
                    { id: 'waterVapor', nameKey: 'productionPort.waterVapor', unit: 't/d', yieldFraction: 0.15 },
                ],
                rates: {
                    throughput: { value: 100, unit: 't/d' },
                    // Fração de matéria seca após secagem (umidade removida ~15%).
                    recoveryRate: 0.85,
                },
            },
            {
                // Pirólise — decomposição térmica sem oxigênio: sólido (biochar),
                // líquido (bio-óleo), gás (gás de pirólise) e cinza.
                id: 'pyrolysis',
                nameKey: 'productionCategory.pyrolysis',
                order: 2,
                inputs: [{ id: 'biomassDry', nameKey: 'productionPort.biomassDry', unit: 't/d' }],
                outputs: [
                    // Biochar (sólido) — carbonizado, ligado ao fator PCS ~33 MJ/kg.
                    {
                        id: 'biochar',
                        nameKey: 'productionPort.biochar',
                        unit: 't/d',
                        yieldFraction: 0.5,
                        energyFactorId: 'acai-seed-carbonized',
                    },
                    { id: 'bioOil', nameKey: 'productionPort.bioOil', unit: 't/d', yieldFraction: 0.06 },
                    { id: 'pyroGas', nameKey: 'productionPort.pyroGas', unit: 't/d', yieldFraction: 0.34 },
                    { id: 'ash', nameKey: 'productionPort.ash', unit: 't/d', yieldFraction: 0.06 },
                ],
                rates: {
                    throughput: { value: 85, unit: 't/d' },
                    // Recuperação total dos co-produtos sólido+líquido+gás+cinza (0,96).
                    recoveryRate: 0.96,
                },
            },
            {
                // Co-queima — biochar + carvão mineral → energia térmica (GJ/d).
                id: 'coFiring',
                nameKey: 'productionCategory.coFiring',
                order: 3,
                inputs: [
                    { id: 'biochar', nameKey: 'productionPort.biochar', unit: 't/d' },
                    { id: 'coalMineral', nameKey: 'productionPort.coalMineral', unit: 't/d', defaultValue: 0 },
                ],
                outputs: [
                    { id: 'thermalEnergy', nameKey: 'productionPort.thermalEnergy', unit: 'GJ/d', yieldFraction: 0.9 },
                    { id: 'combustionAsh', nameKey: 'productionPort.combustionAsh', unit: 't/d', yieldFraction: 0.05 },
                ],
                rates: {
                    throughput: { value: 50, unit: 't/d' },
                    // Eficiência de combustão (fração da energia do combustível aproveitada).
                    recoveryRate: 0.9,
                },
            },
            {
                // Caldeira — energia térmica → eletricidade (MWh/d) + perdas.
                id: 'boiler',
                nameKey: 'productionCategory.boiler',
                order: 4,
                inputs: [{ id: 'thermalEnergy', nameKey: 'productionPort.thermalEnergy', unit: 'GJ/d' }],
                outputs: [
                    { id: 'electricity', nameKey: 'productionPort.electricity', unit: 'MWh/d', yieldFraction: 0.3 },
                    { id: 'boilerLosses', nameKey: 'productionPort.boilerLosses', unit: 'GJ/d', yieldFraction: 0.7 },
                ],
                rates: {
                    throughput: { value: 400, unit: 'GJ/d' },
                    recoveryRate: 0.85,
                    // Eficiência elétrica global caldeira+turbina (~30% ≤ recoveryRate 85%).
                    yield: { value: 30, unit: '%' },
                },
            },
        ],
    },
});

/**
 * Retorna a lista de subtipos do catálogo (cópia rasa para iteração
 * segura na UI). Ordem de inserção do registry.
 */
export function listProductionSubtypes(): ProductionSubtype[] {
    return Object.values(PRODUCTION_SUBTYPES);
}

/**
 * Retorna o subtipo pelo id, ou null se desconhecido (fallback seguro
 * para subtype ausente/inválido — RNF Robustez).
 */
export function getProductionSubtype(id: string | null | undefined): ProductionSubtype | null {
    if (!id || typeof id !== 'string') return null;
    return PRODUCTION_SUBTYPES[id] ?? null;
}

/**
 * Verifica se um id de subtipo é válido (existe no catálogo).
 */
export function isValidSubtype(id: string | null | undefined): boolean {
    return getProductionSubtype(id) !== null;
}

/**
 * Retorna as etapas (categorias) ordenadas de um subtipo, ou [] se
 * o subtipo for desconhecido. Cópia ordenada por `order`.
 */
export function getCategoriesForSubtype(id: string | null | undefined): ProductionSubtype['categories'] {
    const subtype = getProductionSubtype(id);
    if (!subtype) return [];
    return subtype.categories.slice().sort((a, b) => a.order - b.order);
}
