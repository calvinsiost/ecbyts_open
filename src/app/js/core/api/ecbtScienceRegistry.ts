// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   ECBT UNIVERSAL API — REGISTRO CURADO DE FUNÇÕES CIENTÍFICAS
   (FASE 1, pure-logic / catalog + resolver)

   SPEC alvo: docs/specs/arch/SPEC_ECBT_UNIVERSAL_API.md (RF2 apiPublic).

   ----------------------------------------------------------------
   O QUE É

   O ecbyts contém ~2448 funções puras determinísticas (compute / calc /
   classify prefixes) espalhadas em ~501 arquivos de core/analytics — sem DOM, sem
   IO, sem estado. A API pública `ecbt.<fn>(args)` precisa de um CATÁLOGO
   CURADO de quais dessas funções são expostas, sob qual NOME PÚBLICO ESTÁVEL,
   de qual módulo, e com quais parâmetros.

   Este arquivo é esse catálogo (Fase 1):
     1. ECBT_SCIENCE_FUNCTIONS — manifest tipado de entradas curadas.
     2. resolveScienceFunction(id, manifest) — id público → {module, export}.
     3. listPublicScienceFunctions(manifest) — catálogo p/ descoberta (ecbt.meta).
     4. assertNoIdCollision(manifest) — guard determinístico de unicidade de id.

   ----------------------------------------------------------------
   ESCOPO / NÃO-ESCOPO (honestidade)

   • CURADO, não exaustivo: ~50 funções de ALTO VALOR e SEM COLISÃO de id.
     Cada `id` é único no manifest (decisão de spec, não acidente). Quando duas
     funções de arquivos diferentes têm o MESMO nome de export (ex.: `classifyAQI`
     em airQualityIndex.ts E airQualityIndexCalculator.ts), o `id` público é
     QUALIFICADO (ex.: 'air.aqi.conama491') para eliminar ambiguidade.

   • SÓ FUNÇÕES PURAS: toda entrada é marcada `pure: true`. O manifest é um
     contrato — só aceita funções determinísticas, sem efeito colateral,
     sem DOM/IO/window/CDN. O guard `isPureManifest` rejeita qualquer entrada
     que não declare pure:true.

   • NÃO INVOCA: este arquivo é o CATÁLOGO + RESOLVER. NÃO faz import dinâmico,
     NÃO chama as funções, NÃO valida arity em runtime contra a função real.
     O INVOKER (Fase 2 runtime) fará:
        - import dinâmico do `module`,
        - leitura do `export`,
        - validação de arity (args.length vs entry.params.length / entry.arity),
        - chamada efetiva com os args coeridos.
     Aqui só descrevemos o contrato estático. (Ver nota SEGURANÇA abaixo.)

   • module = caminho do .js BUILDADO (app/js/...), a mesma convenção de output
     usada por scripts/ts-migration-map.json. O source-of-truth é o .ts; o
     invoker da Fase 2 importa o .js emitido. O cheap test verifica o EXPORT no
     .ts REAL (anti-teatro), não confia só nesta string.

   SEGURANÇA (RF2):
   - O manifest é um ALLOWLIST fechado: só funções aqui podem ser chamadas via
     a API pública. Nomes fora do manifest → unknown (resolve → null).
   - Cada entrada é `pure:true`; o invoker NUNCA deve aceitar uma entrada não-pura.
   - O invoker da Fase 2 DEVE validar arity ANTES de chamar (defesa contra
     under/over-application) e coerir/validar tipos de args (Fase 1 é string-args).
   ================================================================ */

// ----------------------------------------------------------------
// TIPOS
// ----------------------------------------------------------------

/**
 * Categoria científica de alto nível para descoberta e agrupamento.
 * Conjunto fechado e versionado — adicionar categoria é decisão de spec.
 */
export type ScienceCategory =
    | 'air'
    | 'water'
    | 'soil'
    | 'risk'
    | 'biodiversity'
    | 'statistics';

/**
 * Uma entrada curada do registro de funções científicas públicas.
 *
 * Invariantes (verificados pelo cheap test + guard):
 *  - `id` é único em todo o manifest (allowlist sem colisão).
 *  - `export` EXISTE e é exportado de `module` (source .ts real — anti-teatro).
 *  - `pure` é sempre `true` (contrato de segurança).
 *  - `params.length === arity` (consistência do descritor).
 */
export interface ScienceFunctionEntry {
    /** Nome público estável (ex.: 'computeAQI', 'air.aqi.conama491'). Único. */
    readonly id: string;
    /** Caminho do módulo .js buildado (convenção app/js/..., igual ao migration-map). */
    readonly module: string;
    /** Nome exportado real no módulo de origem. */
    readonly export: string;
    /** Categoria científica para descoberta. */
    readonly category: ScienceCategory;
    /** Número de parâmetros posicionais declarados. */
    readonly arity: number;
    /** Nomes dos parâmetros posicionais, em ordem. params.length === arity. */
    readonly params: readonly string[];
    /** Sempre true — só funções puras entram no allowlist público. */
    readonly pure: true;
    /** Descrição curta (1 linha) para o catálogo de descoberta. */
    readonly description: string;
}

// ----------------------------------------------------------------
// MANIFEST CURADO — ECBT_SCIENCE_FUNCTIONS
// ----------------------------------------------------------------

/**
 * Registro curado de funções científicas públicas (Fase 1).
 *
 * Conjunto INICIAL de alto valor, sem colisão de id. NÃO é exaustivo das ~2448
 * funções — é um allowlist deliberado, expansível por curadoria futura.
 *
 * Cobre: air (AQI, dispersão Gauss/Pasquill, toxicologia do ar/câncer),
 * water (WQI, corrosividade, recarga de aquífero, baseflow), soil (carbono),
 * biodiversity (Shannon/Simpson/Jaccard/Pielou/Margalef), risk (ARD acid mine,
 * eco-toxicologia LC50/BAF/RQ), statistics (regressão, Mann-Kendall, ANOVA,
 * correlações, normalidade, outliers).
 */
export const ECBT_SCIENCE_FUNCTIONS: readonly ScienceFunctionEntry[] = Object.freeze([
    // ===================== AIR — Air Quality Index =====================
    {
        id: 'computeAQI',
        module: 'app/js/core/analytics/airQualityIndex.js',
        export: 'computeAQI',
        category: 'air',
        arity: 1,
        params: ['pollutantReadings'],
        pure: true,
        description: 'Composite Air Quality Index from multiple pollutant readings (dominant pollutant + category).',
    },
    {
        id: 'air.aqi.subIndex',
        module: 'app/js/core/analytics/airQualityIndex.js',
        export: 'computeSubIndex',
        category: 'air',
        arity: 2,
        params: ['pollutant', 'concentration'],
        pure: true,
        description: 'AQI sub-index for a single pollutant at a given concentration.',
    },
    {
        id: 'air.aqi.exposureRisk',
        module: 'app/js/core/analytics/airQualityIndex.js',
        export: 'computeExposureRisk',
        category: 'air',
        arity: 3,
        params: ['aqi', 'exposureHours', 'sensitiveGroup'],
        pure: true,
        description: 'Exposure risk score from AQI, exposure hours and sensitive-group flag.',
    },
    {
        id: 'air.aqi.conama491',
        module: 'app/js/core/analytics/airQualityIndexCalculator.js',
        export: 'calcCONAMA491Index',
        category: 'air',
        arity: 2,
        params: ['concentration', 'pollutant'],
        pure: true,
        description: 'CONAMA 491/2018 air quality classification for a pollutant concentration.',
    },
    {
        id: 'air.aqi.composite',
        module: 'app/js/core/analytics/airQualityIndexCalculator.js',
        export: 'calcCompositeAQI',
        category: 'air',
        arity: 1,
        params: ['pollutantMap'],
        pure: true,
        description: 'Composite AQI from a pollutant→concentration map (PM2.5/PM10/O3/NO2/SO2/CO).',
    },

    // ===================== AIR — Atmospheric Dispersion (Pasquill/Gauss) =====================
    {
        id: 'air.dispersion.pasquillClass',
        module: 'app/js/core/analytics/atmosphericStabilityPasquill.js',
        export: 'classifyPasquillStability',
        category: 'air',
        arity: 3,
        params: ['windSpeed_ms', 'solarRadiation_Wm2', 'cloudCover_oktas'],
        pure: true,
        description: 'Pasquill-Gifford atmospheric stability class (A-F) from meteorology.',
    },
    {
        id: 'air.dispersion.sigmaY',
        module: 'app/js/core/analytics/atmosphericStabilityPasquill.js',
        export: 'calcSigmaY',
        category: 'air',
        arity: 2,
        params: ['x_m', 'stabilityClass'],
        pure: true,
        description: 'Lateral dispersion coefficient sigma-y at downwind distance for a stability class.',
    },
    {
        id: 'air.dispersion.sigmaZ',
        module: 'app/js/core/analytics/atmosphericStabilityPasquill.js',
        export: 'calcSigmaZ',
        category: 'air',
        arity: 2,
        params: ['x_m', 'stabilityClass'],
        pure: true,
        description: 'Vertical dispersion coefficient sigma-z at downwind distance for a stability class.',
    },
    {
        id: 'air.dispersion.gaussianConcentration',
        module: 'app/js/core/analytics/atmosphericStabilityPasquill.js',
        export: 'calcGaussianConcentration',
        category: 'air',
        arity: 7,
        params: ['Q', 'u', 'x', 'y', 'z', 'H', 'stabilityClass'],
        pure: true,
        description: 'Gaussian plume ground/elevated concentration from a continuous point source.',
    },

    // ===================== AIR — Toxics / Cancer Risk =====================
    {
        id: 'air.toxics.inhalationUnitRisk',
        module: 'app/js/core/analytics/airToxicsRisk.js',
        export: 'computeInhalationUnitRisk',
        category: 'risk',
        arity: 3,
        params: ['CSF_per_mg_kg_day', 'inhalation_rate_m3_day', 'body_weight_kg'],
        pure: true,
        description: 'Inhalation unit risk (IUR) from cancer slope factor, breathing rate and body weight.',
    },
    {
        id: 'air.toxics.cancerRisk',
        module: 'app/js/core/analytics/airToxicsRisk.js',
        export: 'computeCancerRisk',
        category: 'risk',
        arity: 2,
        params: ['LAEC_ug_m3', 'IUR_per_ug_m3'],
        pure: true,
        description: 'Lifetime excess cancer risk from lifetime average exposure concentration and IUR.',
    },
    {
        id: 'air.toxics.hazardClass',
        module: 'app/js/core/analytics/airToxicsRisk.js',
        export: 'classifyAirToxicsHazard',
        category: 'risk',
        arity: 2,
        params: ['cancer_risk', 'HQ_non_carcinogenic'],
        pure: true,
        description: 'Classify air toxics hazard from cancer risk and non-carcinogenic hazard quotient (HQ).',
    },

    // ===================== WATER — Water Quality Index =====================
    {
        id: 'computeWQI',
        module: 'app/js/core/analytics/waterQualityIndex.js',
        export: 'computeWQI',
        category: 'water',
        arity: 2,
        params: ['subindices', 'weights'],
        pure: true,
        description: 'Weighted Water Quality Index (WQI) from sub-indices and weights.',
    },
    {
        id: 'water.wqi.classify',
        module: 'app/js/core/analytics/waterQualityIndex.js',
        export: 'classifyWaterQuality',
        category: 'water',
        arity: 1,
        params: ['wqi'],
        pure: true,
        description: 'Classify a WQI value into a quality category (excellent..very_bad).',
    },
    {
        id: 'water.wqi.nsf',
        module: 'app/js/core/analytics/waterQualityIndex.js',
        export: 'computeNSFWQI',
        category: 'water',
        arity: 1,
        params: ['measurements'],
        pure: true,
        description: 'NSF Water Quality Index from a map of parameter measurements.',
    },
    {
        id: 'water.groundwater.corrosivityIndex',
        module: 'app/js/core/analytics/groundwaterQualityIndex.js',
        export: 'computeCorrosivityIndex',
        category: 'water',
        arity: 4,
        params: ['chloride_mg_L', 'sulfate_mg_L', 'TDS_mg_L', 'pH'],
        pure: true,
        description: 'Groundwater corrosivity index from chloride, sulfate, TDS and pH.',
    },

    // ===================== WATER — Aquifer Recharge =====================
    {
        id: 'water.aquifer.waterTableFluctuation',
        module: 'app/js/core/analytics/aquiferRecharge.js',
        export: 'computeWaterTableFluctuation',
        category: 'water',
        arity: 3,
        params: ['recharge_mm', 'specificYield', 'deltaH_m'],
        pure: true,
        description: 'Aquifer recharge via the water-table fluctuation (WTF) method.',
    },
    {
        id: 'water.aquifer.baseflowSeparation',
        module: 'app/js/core/analytics/aquiferRecharge.js',
        export: 'computeBaseflowSeparation',
        category: 'water',
        arity: 1,
        params: ['streamflowData'],
        pure: true,
        description: 'Baseflow separation (Lyne-Hollick filter) and baseflow index (BFI) from streamflow.',
    },
    {
        id: 'water.aquifer.rechargeZone',
        module: 'app/js/core/analytics/aquiferRecharge.js',
        export: 'classifyAquiferRechargeZone',
        category: 'water',
        arity: 4,
        params: ['soilType', 'slope_pct', 'landUse', 'rainfallIntensity_mm_h'],
        pure: true,
        description: 'Classify aquifer recharge potential of a zone from soil, slope, land use and rainfall.',
    },

    // ===================== SOIL — Carbon Sequestration =====================
    {
        id: 'soil.carbon.organicChange',
        module: 'app/js/core/analytics/soilCarbonSequestrationRate.js',
        export: 'calcSoilOrganicCarbonChange',
        category: 'soil',
        arity: 3,
        params: ['C_input_tC_ha_yr', 'k_decomp', 'C_initial_tC_ha'],
        pure: true,
        description: 'Soil organic carbon change over time (first-order decay model).',
    },
    {
        id: 'soil.carbon.classifyRate',
        module: 'app/js/core/analytics/soilCarbonSequestrationRate.js',
        export: 'classifySequestrationRate',
        category: 'soil',
        arity: 1,
        params: ['rate_tC_ha_yr'],
        pure: true,
        description: 'Classify a soil carbon sequestration rate (negative..very_high).',
    },

    // ===================== BIODIVERSITY — Diversity Indices =====================
    {
        id: 'computeShannonIndex',
        module: 'app/js/core/analytics/biodiversityIndex.js',
        export: 'computeShannonIndex',
        category: 'biodiversity',
        arity: 1,
        params: ['speciesCounts'],
        pure: true,
        description: "Shannon-Wiener diversity index (H') and Pielou evenness from species counts.",
    },
    {
        id: 'computeSimpsonIndex',
        module: 'app/js/core/analytics/biodiversityIndex.js',
        export: 'computeSimpsonIndex',
        category: 'biodiversity',
        arity: 1,
        params: ['speciesCounts'],
        pure: true,
        description: 'Simpson diversity index (D) and dominance from species counts.',
    },
    {
        id: 'computeJaccardSimilarity',
        module: 'app/js/core/analytics/biodiversityIndex.js',
        export: 'computeJaccardSimilarity',
        category: 'biodiversity',
        arity: 2,
        params: ['setA', 'setB'],
        pure: true,
        description: 'Jaccard similarity (shared/total) between two species sets.',
    },
    {
        id: 'biodiversity.pielouEvenness',
        module: 'app/js/core/analytics/aquaticBiodiversityIndex.js',
        export: 'calcPielouEvenness',
        category: 'biodiversity',
        arity: 1,
        params: ['abundances'],
        pure: true,
        description: 'Pielou evenness (J) from species abundances.',
    },
    {
        id: 'biodiversity.margalefIndex',
        module: 'app/js/core/analytics/aquaticBiodiversityIndex.js',
        export: 'calcMargalefIndex',
        category: 'biodiversity',
        arity: 1,
        params: ['abundances'],
        pure: true,
        description: 'Margalef species richness index from species abundances.',
    },

    // ===================== RISK — Acid Mine Drainage (ARD) =====================
    {
        id: 'risk.ard.acidGenerationPotential',
        module: 'app/js/core/analytics/acidMineDrainage.js',
        export: 'computeAcidGenerationPotential',
        category: 'risk',
        arity: 2,
        params: ['sulfurContent_pct', 'rockMass_t'],
        pure: true,
        description: 'Acid generation potential (AP) of mine waste from sulfur content and rock mass.',
    },
    {
        id: 'risk.ard.neutralizationPotential',
        module: 'app/js/core/analytics/acidMineDrainage.js',
        export: 'computeNeutralizationPotential',
        category: 'risk',
        arity: 1,
        params: ['carbonateContent_pct'],
        pure: true,
        description: 'Neutralization potential (NP) of mine waste from carbonate content.',
    },
    {
        id: 'risk.ard.netNeutralizationPotential',
        module: 'app/js/core/analytics/acidMineDrainage.js',
        export: 'computeNetNeutralizationPotential',
        category: 'risk',
        arity: 2,
        params: ['np', 'ap'],
        pure: true,
        description: 'Net neutralization potential (NNP = NP - AP) and acid-generating classification.',
    },

    // ===================== RISK — Eco-toxicology =====================
    {
        id: 'risk.ecotox.lc50Estimate',
        module: 'app/js/core/analytics/ecoToxicologyModel.js',
        export: 'computeLC50Estimate',
        category: 'risk',
        arity: 2,
        params: ['doses', 'mortalities'],
        pure: true,
        description: 'LC50 estimate (log-probit slope) from dose-response mortality data.',
    },
    {
        id: 'risk.ecotox.bioaccumulationFactor',
        module: 'app/js/core/analytics/ecoToxicologyModel.js',
        export: 'computeBioaccumulationFactor',
        category: 'risk',
        arity: 2,
        params: ['tissue_concentration_mg_kg', 'water_concentration_mg_L'],
        pure: true,
        description: 'Bioaccumulation factor (BAF) from tissue vs water concentration.',
    },
    {
        id: 'risk.ecotox.classifyRisk',
        module: 'app/js/core/analytics/ecoToxicologyModel.js',
        export: 'classifyEcotoxicologicalRisk',
        category: 'risk',
        arity: 2,
        params: ['concentration_mg_L', 'HC5_mg_L'],
        pure: true,
        description: 'Classify ecotoxicological risk from exposure concentration vs species-sensitivity HC5.',
    },
    {
        id: 'risk.aquatic.bioconcentrationFactor',
        module: 'app/js/core/analytics/aquaticToxicology.js',
        export: 'bioconcentrationFactor',
        category: 'risk',
        arity: 2,
        params: ['kow', 'lipidFraction'],
        pure: true,
        description: 'Bioconcentration factor (BCF) from octanol-water partition coefficient and lipid fraction.',
    },
    {
        id: 'risk.aquatic.acuteChronicRatio',
        module: 'app/js/core/analytics/aquaticToxicology.js',
        export: 'acuteChronicRatio',
        category: 'risk',
        arity: 2,
        params: ['lc50', 'noec'],
        pure: true,
        description: 'Acute-to-chronic ratio (ACR) and predicted NOEC/CCC from LC50.',
    },
    {
        id: 'risk.aquatic.pec',
        module: 'app/js/core/analytics/aquaticToxicology.js',
        export: 'predictedEnvironmentalConcentration',
        category: 'risk',
        arity: 3,
        params: ['emissionRate_kg_yr', 'streamflow_m3_s', 'degradationRate_per_day'],
        pure: true,
        description: 'Predicted environmental concentration (PEC) in a stream with first-order degradation.',
    },
    {
        id: 'risk.aquatic.riskQuotient',
        module: 'app/js/core/analytics/aquaticToxicology.js',
        export: 'riskQuotientAquatic',
        category: 'risk',
        arity: 3,
        params: ['pec', 'pnec', 'assessmentFactor'],
        pure: true,
        description: 'Aquatic risk quotient (RQ = PEC/PNEC) and risk level.',
    },

    // ===================== STATISTICS =====================
    {
        id: 'stats.linearRegression',
        module: 'app/js/core/analytics/statistics.js',
        export: 'linearRegression',
        category: 'statistics',
        arity: 2,
        params: ['x', 'y'],
        pure: true,
        description: 'Ordinary least-squares linear regression (slope, intercept, r2).',
    },
    {
        id: 'stats.calculateR2',
        module: 'app/js/core/analytics/statistics.js',
        export: 'calculateR2',
        category: 'statistics',
        arity: 2,
        params: ['observed', 'predicted'],
        pure: true,
        description: 'Coefficient of determination (R2) of observed vs predicted values.',
    },
    {
        id: 'stats.descriptiveStats',
        module: 'app/js/core/analytics/statistics.js',
        export: 'descriptiveStats',
        category: 'statistics',
        arity: 1,
        params: ['values'],
        pure: true,
        description: 'Descriptive statistics (mean, std, min, max, median, quartiles).',
    },
    {
        id: 'stats.mannKendall',
        module: 'app/js/core/analytics/statistics.js',
        export: 'mannKendall',
        category: 'statistics',
        arity: 1,
        params: ['values'],
        pure: true,
        description: 'Mann-Kendall non-parametric trend test (S, tau, Z, p-value, trend).',
    },
    {
        id: 'stats.sensSlope',
        module: 'app/js/core/analytics/statistics.js',
        export: 'sensSlope',
        category: 'statistics',
        arity: 2,
        params: ['x', 'y'],
        pure: true,
        description: "Sen's (Theil-Sen) robust slope estimator with confidence interval.",
    },
    {
        id: 'stats.normalCDF',
        module: 'app/js/core/analytics/statistics.js',
        export: 'normalCDF',
        category: 'statistics',
        arity: 1,
        params: ['x'],
        pure: true,
        description: 'Standard normal cumulative distribution function (CDF).',
    },
    {
        id: 'stats.pearsonCorrelation',
        module: 'app/js/core/analytics/statistics.js',
        export: 'pearsonCorrelation',
        category: 'statistics',
        arity: 3,
        params: ['x', 'y', 'alpha'],
        pure: true,
        description: "Pearson product-moment correlation (r) with significance test.",
    },
    {
        id: 'stats.spearmanCorrelation',
        module: 'app/js/core/analytics/statistics.js',
        export: 'spearmanCorrelation',
        category: 'statistics',
        arity: 3,
        params: ['x', 'y', 'alpha'],
        pure: true,
        description: "Spearman rank correlation (rs) with significance test.",
    },
    {
        id: 'stats.anovaOneWay',
        module: 'app/js/core/analytics/statistics.js',
        export: 'anovaOneWay',
        category: 'statistics',
        arity: 2,
        params: ['groups', 'alpha'],
        pure: true,
        description: 'One-way ANOVA (F statistic, degrees of freedom, p-value).',
    },
    {
        id: 'stats.kruskalWallis',
        module: 'app/js/core/analytics/statistics.js',
        export: 'kruskalWallis',
        category: 'statistics',
        arity: 2,
        params: ['groups', 'alpha'],
        pure: true,
        description: 'Kruskal-Wallis non-parametric test for several independent groups.',
    },
    {
        id: 'stats.shapiroWilk',
        module: 'app/js/core/analytics/statistics.js',
        export: 'shapiroWilk',
        category: 'statistics',
        arity: 2,
        params: ['values', 'alpha'],
        pure: true,
        description: 'Shapiro-Wilk normality test (W statistic, p-value).',
    },
    {
        id: 'stats.grubbsTest',
        module: 'app/js/core/analytics/statistics.js',
        export: 'grubbsTest',
        category: 'statistics',
        arity: 2,
        params: ['values', 'alpha'],
        pure: true,
        description: "Grubbs' test for a single outlier in a univariate sample.",
    },
    {
        id: 'stats.pettittTest',
        module: 'app/js/core/analytics/statistics.js',
        export: 'pettittTest',
        category: 'statistics',
        arity: 2,
        params: ['values', 'alpha'],
        pure: true,
        description: 'Pettitt change-point test for an abrupt shift in a time series.',
    },
]);

// ----------------------------------------------------------------
// SEGURANÇA / GUARDS (puros)
// ----------------------------------------------------------------

/**
 * Verifica que TODA entrada do manifest é pura (`pure === true`).
 * O invoker da Fase 2 NUNCA deve aceitar uma entrada não-pura — esta é a
 * primeira linha do contrato de segurança (allowlist de funções sem efeito).
 *
 * @returns true se todas as entradas são pure:true; false caso contrário.
 */
export function isPureManifest(manifest: readonly ScienceFunctionEntry[]): boolean {
    if (!Array.isArray(manifest)) return false;
    return manifest.every((e) => e !== null && typeof e === 'object' && e.pure === true);
}

/**
 * Verifica que não há colisão de `id` no manifest (allowlist sem ambiguidade).
 *
 * @returns { ok:true } se todos os ids são únicos, ou { ok:false, duplicates }
 *          com a lista de ids repetidos (determinístico, ordenado).
 */
export function assertNoIdCollision(
    manifest: readonly ScienceFunctionEntry[],
): { ok: true } | { ok: false; duplicates: readonly string[] } {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const entry of manifest) {
        const id = entry?.id;
        if (typeof id !== 'string' || id.length === 0) continue;
        if (seen.has(id)) {
            dups.add(id);
        } else {
            seen.add(id);
        }
    }
    if (dups.size === 0) {
        return { ok: true };
    }
    return { ok: false, duplicates: Object.freeze([...dups].sort()) };
}

// ----------------------------------------------------------------
// RESOLVER — resolveScienceFunction
// ----------------------------------------------------------------

/** Resultado da resolução de um id público de função científica. */
export interface ScienceResolution {
    readonly found: true;
    readonly module: string;
    readonly export: string;
    readonly category: ScienceCategory;
    readonly arity: number;
    readonly params: readonly string[];
}

/**
 * Resolve um id público para sua localização de módulo/export.
 *
 * PURE / determinístico: mesma entrada → mesma saída. Não faz import dinâmico,
 * não toca o filesystem, não invoca a função.
 *
 * @param id       Nome público estável (ex.: 'computeAQI', 'stats.mannKendall').
 * @param manifest Manifest a consultar (default: ECBT_SCIENCE_FUNCTIONS).
 * @returns ScienceResolution (found:true) quando o id existe E é puro; `null`
 *          quando desconhecido OU (defensivamente) não-puro. Nunca lança.
 */
export function resolveScienceFunction(
    id: string,
    manifest: readonly ScienceFunctionEntry[] = ECBT_SCIENCE_FUNCTIONS,
): ScienceResolution | null {
    const trimmed = typeof id === 'string' ? id.trim() : '';
    if (trimmed.length === 0) {
        return null;
    }

    const entry = manifest.find((e) => e.id === trimmed);
    if (entry === undefined) {
        return null;
    }
    // Defesa: jamais resolver uma entrada não-pura via a API pública.
    if (entry.pure !== true) {
        return null;
    }

    return Object.freeze({
        found: true,
        module: entry.module,
        export: entry.export,
        category: entry.category,
        arity: entry.arity,
        params: entry.params,
    });
}

// ----------------------------------------------------------------
// CATÁLOGO DE DESCOBERTA — listPublicScienceFunctions
// ----------------------------------------------------------------

/** Item de catálogo p/ descoberta (ecbt.meta de funções). Sem caminho interno. */
export interface ScienceCatalogItem {
    readonly id: string;
    readonly category: ScienceCategory;
    readonly params: readonly string[];
    readonly arity: number;
    readonly description: string;
}

/**
 * Lista o catálogo público de funções científicas para descoberta.
 *
 * Expõe apenas o que o consumidor precisa para chamar (id, category, params,
 * arity, description) — NÃO vaza o caminho do módulo (`module`) nem o nome do
 * export interno, mantendo o acoplamento mínimo com a árvore de arquivos.
 *
 * PURE / determinístico. Ordem preservada do manifest.
 *
 * @param manifest Manifest a catalogar (default: ECBT_SCIENCE_FUNCTIONS).
 */
export function listPublicScienceFunctions(
    manifest: readonly ScienceFunctionEntry[] = ECBT_SCIENCE_FUNCTIONS,
): readonly ScienceCatalogItem[] {
    return Object.freeze(
        manifest.map((e) =>
            Object.freeze({
                id: e.id,
                category: e.category,
                params: e.params,
                arity: e.arity,
                description: e.description,
            }),
        ),
    );
}
