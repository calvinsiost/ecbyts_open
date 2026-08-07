// This file is part of ecbyts/ECBT. AGPL-3.0-only.
// Extracted from app/js/utils/handlers/elements.js in ARCH-MONO-001 Phase 5a.
//
// 'Random-model demo seeders' - pure functions that mutate element data
// and/or add governance records to demonstrate capabilities in the random
// model. Called exclusively from handleGenerateRandomModel() after the
// main element + constant generation.
//
// Zero handler state. Zero module-level state. Safe to extract.
// @ts-check
import { generateId } from '../helpers/id.js';
import { runtimeDate, runtimeRandom } from '../../core/random/runtime.js';
import { getAllElements } from '../../core/elements/manager.js';
import { getAllCampaigns } from '../../core/campaigns/manager.js';
import { getUserConstantBySymbol } from '../../core/constants/manager.js';
import { addCostCenter, addAllocation as addCCAllocation, setBudget } from '../governance/costCenterManager.js';
/**
 * @typedef {{ id: string, [key: string]: any }} DemoEntityRef
 */
// ----------------------------------------------------------------
// DERIVATION SHOWCASE (demo data - injeta postProcessing em elementos selecionados)
// Contexto: site de investigacao ambiental com contaminacao BTEX.
//
// Caso A - Poco de Monitoramento (well) com benzeno em ug/L:
//   leitura bruta (ug/L) ÷ FC_mgL_ugL → converte para mg/L
//   (padrao ABNT NBR para relatorio e comparacao CONAMA 420 VP/VI)
//
// Caso B - Ponto de Efluente (effluent_point) com DBO/DQO em mg/L:
//   leitura bruta × blend(0.60 × FC_pass_mod_a + 0.40 × FC_pass_mod_b)
//   → concentracao estimada no efluente tratado (sistema com 2 modulos em paralelo)
//   Modulo A: biologico 85% remocao (fator passagem 0.15), 60% do fluxo
//   Modulo B: carvao ativado 78% remocao (fator passagem 0.22), 40% do fluxo
//
// Caso C - Rio ou Lago com vazao em L/s:
//   Step 1: × FC_Ls_m3d → converte L/s para m3/dia (carga volumetrica diaria)
//   Step 2: blend(0.60 × FC_pass_mod_a + 0.40 × FC_pass_mod_b)
//   → carga diaria estimada apos tratamento
// ----------------------------------------------------------------
/**
 * Inject reading derivation demo steps into specific elements after constants are seeded.
 * Injeta steps de derivacao demonstrativos apos generateRandomConstants() ter rodado.
 *
 * @param {Array<any>} [elements] - If omitted, reads from getAllElements()
 */
export function injectDerivationShowcase(elements?: any[]) {
    const els = elements || getAllElements();
    // Busca constantes pelo symbol (criadas por generateRandomConstants())
    const cConv = (getUserConstantBySymbol('FC_Ls_m3d')); // L/s -> m3/d
    const cUnit = (getUserConstantBySymbol('FC_mgL_ugL')); // ug/L -> mg/L (divisor)
    const cModA = (getUserConstantBySymbol('FC_pass_mod_a')); // fator passagem modulo A (0.15)
    const cModB = (getUserConstantBySymbol('FC_pass_mod_b')); // fator passagem modulo B (0.22)
    if (!cConv || !cUnit || !cModA || !cModB)
        return;
    // -- Caso A: poco de monitoramento com contaminante BTEX em ug/L --
    // Demonstra: conversao de unidade por divisao (ug/L -> mg/L)
    // Aceita qualquer BTEX (benzene, toluene, ethylbenzene, xylenes, naphthalene, btex, voc)
    // pois todos usam unitId ug_L e a conversao x1000 se aplica igualmente
    const BTEX_PARAMS = new Set(['benzene', 'toluene', 'ethylbenzene', 'xylenes', 'naphthalene', 'btex', 'voc']);
    // Aceita postProcessing === undefined (obs antigas) ou [] (obs novas)
    const hasNoSteps = (o: any) => !o.postProcessing || o.postProcessing.length === 0;
    const wellWithBTEX = els.find((e: any) => e.family === 'well' && e.data?.observations?.some((o: any) => BTEX_PARAMS.has(o.parameterId) && hasNoSteps(o)));
    if (wellWithBTEX) {
        const obs = wellWithBTEX.data.observations.find((o: any) => BTEX_PARAMS.has(o.parameterId) && hasNoSteps(o));
        if (obs) {
            // ug/L ÷ 1000 = mg/L - referencia CONAMA 420 usa mg/L como unidade de comparacao
            obs.postProcessing = [
                {
                    op: 'divide',
                    constantId: cUnit.id, // FC_mgL_ugL = 1000
                    mode: 'live',
                    snapshot: null,
                },
            ];
        }
    }
    // -- Caso B: ponto de efluente com DBO ou DQO --
    // Demonstra: blend de dois modulos de tratamento em paralelo
    const efluente = els.find((e: any) => e.family === 'effluent_point' &&
        e.data?.observations?.some((o: any) => (o.parameterId === 'bod' || o.parameterId === 'cod') && hasNoSteps(o)));
    if (efluente) {
        const obs = efluente.data.observations.find((o: any) => (o.parameterId === 'bod' || o.parameterId === 'cod') && hasNoSteps(o));
        if (obs) {
            // C_saida = C_entrada × (0.60 × 0.15 + 0.40 × 0.22) = C × 0.178
            // Interpreta: 60% do fluxo trata pelo modulo A (biologico, 85% remocao)
            //             40% do fluxo trata pelo modulo B (carvao ativado, 78% remocao)
            obs.postProcessing = [
                {
                    op: 'blend',
                    constantId: cModA.id,
                    fraction: 0.6,
                    constantId2: cModB.id,
                    fraction2: 0.4,
                    mode: 'live',
                    snapshot: null,
                },
            ];
        }
    }
    // -- Caso C: rio ou lago com vazao em L/s -
    // Demonstra: cadeia de dois steps (conversao de unidade + blend de eficiencia)
    const hidro = els.find((e: any) => (e.family === 'lake' || e.family === 'river') &&
        e.data?.observations?.some((o: any) => o.parameterId === 'flow_rate' && hasNoSteps(o)));
    if (hidro) {
        const obs = hidro.data.observations.find((o: any) => o.parameterId === 'flow_rate' && hasNoSteps(o));
        if (obs) {
            // Step 1: Q (L/s) × 86.4 = Q (m3/dia) - carga volumetrica diaria
            // Step 2: blend eficiencia de remocao do sistema de tratamento montante
            obs.postProcessing = [
                {
                    op: 'multiply',
                    constantId: cConv.id,
                    mode: 'live',
                    snapshot: null,
                },
                {
                    op: 'blend',
                    constantId: cModA.id,
                    fraction: 0.6,
                    constantId2: cModB.id,
                    fraction2: 0.4,
                    mode: 'live',
                    snapshot: null,
                },
            ];
        }
    }
}
// ----------------------------------------------------------------
// GEE SHOWCASE (demo data - inventário de Gases de Efeito Estufa)
// Injeta observacoes de dados de atividade (consumo combustivel / energia)
// com cadeia de derivacao que calcula tCO2e usando fatores GHG Protocol BR.
//
// Metodologia: GHG Protocol Brasil - MCTI/SEPED 2023
//   Escopo 1 - Combustao estacionaria e movel (caldeiras, frota)
//   Escopo 2 - Energia eletrica consumida (grid BR)
//
// Casos implementados:
//   Case GEE-1 (combustion): Diesel B14 → blend(0.86×EF_fossil + 0.14×EF_bio) ÷ 1000 → tCO2e
//   Case GEE-2 (flare):      Gasolina C27 → blend(0.73×EF_fossil + 0.27×EF_etanol) ÷ 1000 → tCO2e
//   Case GEE-3 (process):    Gas Natural → ×EF_gas_natural → tCO2e (EF ja em tCO2e/m3)
//   Case GEE-4 (any):        Energia Eletrica → ×EF_CO2_grid_br ÷ 1000 → tCO2e (Escopo 2)
// ----------------------------------------------------------------
/**
 * Build a minimal observation object for GEE activity data injection.
 * Cria objeto de observacao para dados de atividade do inventario GEE.
 *
 * @param {string} parameterId - e.g. 'consumo_diesel_b14_L'
 * @param {number} value       - valor de consumo mensal
 * @param {string} campaignId  - ID da campanha de referencia
 * @param {Array<any>}  postProcessing - cadeia de derivacao pre-configurada
 */
function makeGEEObs(parameterId: string, value: number, campaignId: string, postProcessing: any[]) {
    const today = runtimeDate().toISOString().slice(0, 10);
    return {
        id: generateId('obs'),
        showPlanning: false,
        plannedDate: null,
        plannedParameterId: null,
        plannedUnitId: null,
        plannedX: null,
        plannedY: null,
        plannedZ: null,
        expectedValue: null,
        x: 0,
        y: 0,
        z: 0,
        date: today,
        campaignId: campaignId || null,
        parameterId,
        value,
        unitId: '',
        autoConvert: false,
        qualFields: [],
        additionalReadings: [],
        postProcessing,
        variables: {},
        credentialLevel: 'common',
        createdBy: null,
        cost: null,
    };
}
/**
 * Inject GEE inventory derivation chains into emission_source elements.
 * Injeta derivacoes de inventario GEE apos generateRandomConstants() ter criado os EFs.
 */
export function injectGEEShowcase() {
    const elements = getAllElements();
    const campaigns = getAllCampaigns();
    // Usa o ID da primeira campanha disponivel como referencia temporal
    const refCampaignId = campaigns.length > 0 ? campaigns[0].id : null;
    // Constantes GEE (criadas por generateRandomConstants())
    const cDieselFossil = (getUserConstantBySymbol('EF_CO2_diesel_fossil'));
    const cBiodiesel = (getUserConstantBySymbol('EF_CO2_biodiesel'));
    const cGasolinaFoss = (getUserConstantBySymbol('EF_CO2_gasolina_fossil'));
    const cEtanol = (getUserConstantBySymbol('EF_CO2_etanol'));
    const cGasNatural = (getUserConstantBySymbol('EF_CO2_gas_natural'));
    const cEFGrid = (getUserConstantBySymbol('EF_CO2_grid_br'));
    const cKgToTon = (getUserConstantBySymbol('FC_kg_tCO2e'));
    if (!cDieselFossil || !cBiodiesel || !cGasNatural || !cEFGrid || !cKgToTon)
        return;
    const emissionSources = elements.filter((e) => e.family === 'emission_source');
    if (emissionSources.length === 0)
        return;
    // Rastrea quais cases ja foram injetados (um de cada por modelo)
    let injectedDiesel = false;
    let injectedGasolina = false;
    let injectedGas = false;
    let injectedGrid = false;
    for (const el of emissionSources) {
        if (!el.data.observations)
            el.data.observations = [];
        const cat = el.data.sourceCategory || 'combustion';
        // Case GEE-1 - Diesel B14 (fonte de combustao: caldeira, bomba diesel, compressor)
        // blend: 0.86 × EF_CO2_diesel_fossil + 0.14 × EF_CO2_biodiesel
        // Mistura obrigatoria B14 conforme Resolucao ANP n.8/2023
        if (!injectedDiesel && (cat === 'combustion' || cat === 'flare')) {
            const consumo = Math.round(2000 + runtimeRandom('gee') * 18000); // 2000-20000 L/mes
            el.data.observations.push(makeGEEObs('consumo_diesel_b14_L', consumo, refCampaignId, [
                {
                    op: 'blend',
                    constantId: cDieselFossil.id,
                    fraction: 0.86,
                    constantId2: cBiodiesel.id,
                    fraction2: 0.14,
                    mode: 'live',
                    snapshot: null,
                },
                {
                    op: 'divide',
                    constantId: cKgToTon.id,
                    mode: 'live',
                    snapshot: null,
                },
            ]));
            injectedDiesel = true;
        }
        // Case GEE-2 - Gasolina C27 (frota leve / geradores gasolina)
        // blend: 0.73 × EF_CO2_gasolina_fossil + 0.27 × EF_CO2_etanol
        // 27% etanol anidro obrigatorio conforme Portaria MAPA
        if (!injectedGasolina && cGasolinaFoss && cEtanol && cat === 'flare') {
            const consumo = Math.round(300 + runtimeRandom('gee') * 7700); // 300-8000 L/mes
            el.data.observations.push(makeGEEObs('consumo_gasolina_c27_L', consumo, refCampaignId, [
                {
                    op: 'blend',
                    constantId: cGasolinaFoss.id,
                    fraction: 0.73,
                    constantId2: cEtanol.id,
                    fraction2: 0.27,
                    mode: 'live',
                    snapshot: null,
                },
                {
                    op: 'divide',
                    constantId: cKgToTon.id,
                    mode: 'live',
                    snapshot: null,
                },
            ]));
            injectedGasolina = true;
        }
        // Case GEE-3 - Gas Natural (processo industrial, caldeira a gas)
        // EF_CO2_gas_natural ja esta em tCO2e/m3 → multiplicacao direta
        if (!injectedGas && cat === 'process') {
            const consumo = Math.round(500 + runtimeRandom('gee') * 14500); // 500-15000 m3/mes
            el.data.observations.push(makeGEEObs('consumo_gas_natural_m3', consumo, refCampaignId, [
                {
                    op: 'multiply',
                    constantId: cGasNatural.id,
                    mode: 'live',
                    snapshot: null,
                },
            ]));
            injectedGas = true;
        }
        // Case GEE-4 - Energia Eletrica Escopo 2 (qualquer fonte - grid BR)
        // EF_CO2_grid_br em kg/kWh → resultado em kg CO2 → ÷ 1000 → tCO2e
        if (!injectedGrid) {
            const consumo = Math.round(5000 + runtimeRandom('gee') * 145000); // 5000-150000 kWh/mes
            el.data.observations.push(makeGEEObs('consumo_eletricidade_kWh', consumo, refCampaignId, [
                {
                    op: 'multiply',
                    constantId: cEFGrid.id,
                    mode: 'live',
                    snapshot: null,
                },
                {
                    op: 'divide',
                    constantId: cKgToTon.id,
                    mode: 'live',
                    snapshot: null,
                },
            ]));
            injectedGrid = true;
        }
        // Para quando todos os cases foram injetados
        if (injectedDiesel && injectedGas && injectedGrid)
            break;
    }
}
// ----------------------------------------------------------------
// RANDOM COST CENTERS (demo data)
// ----------------------------------------------------------------
/** @param {Array<any>} [elements] */
export function generateRandomCostCenters(elements?: any[]) {
    const fy = runtimeDate().getFullYear();
    const fieldOps = (addCostCenter({ code: 'CC-FIELD', name: 'Field Operations', type: 'production' }));
    const lab = (addCostCenter({ code: 'CC-LAB', name: 'Laboratory Analysis', type: 'production' }));
    const mgmt = (addCostCenter({ code: 'CC-MGMT', name: 'Project Management', type: 'administrative' }));
    const compliance = (addCostCenter({ code: 'CC-COMP', name: 'Regulatory Compliance', type: 'support' }));
    setBudget(fieldOps.id, fy, { budgetCapex: 80000, budgetOpex: 30000, budgetTotal: 110000 });
    setBudget(lab.id, fy, { budgetCapex: 10000, budgetOpex: 60000, budgetTotal: 70000 });
    setBudget(mgmt.id, fy, { budgetCapex: 5000, budgetOpex: 40000, budgetTotal: 45000 });
    setBudget(compliance.id, fy, { budgetCapex: 0, budgetOpex: 20000, budgetTotal: 20000 });
    // Aloca ~60% dos elementos aleatoriamente
    const ccIds = [fieldOps.id, lab.id, mgmt.id, compliance.id];
    const weights = [0.4, 0.3, 0.15, 0.15]; // probabilidades
    for (const el of (elements || [])) {
        if (runtimeRandom('cost-centers') > 0.6)
            continue; // 40% sem alocacao (unassigned)
        const r = runtimeRandom('cost-centers');
        let cumWeight = 0;
        for (let i = 0; i < ccIds.length; i++) {
            cumWeight += weights[i] || 0;
            if (r < cumWeight) {
                addCCAllocation({
                    sourceType: 'element',
                    sourceId: el.id,
                    costCenterId: ccIds[i],
                    percentage: 100,
                });
                break;
            }
        }
    }
}
//# sourceMappingURL=elementsDemoSeeders.js.map
//# sourceMappingURL=elementsDemoSeeders.js.map
//# sourceMappingURL=elementsDemoSeeders.js.map
