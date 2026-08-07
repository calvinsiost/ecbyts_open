// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   DEMO CASES — 50 pre-defined environmental monitoring scenarios
   50 cenarios pre-definidos para demonstracao interativa

   Distribuicao: ~13 por vertical, cobrindo 3 modulos cada.
   Cada caso define elementos iniciais, camera states e steps.

   VERTICAIS: mining, forestry, contamination, occupational_health, emissions
   MODULOS: neural_net, ai_bot, satellite
   ================================================================ */
// ----------------------------------------------------------------
// HELPERS - Geradores de dados reutilizaveis
// ----------------------------------------------------------------
let caseCounter = 0;
function uid() {
    return `demo-el-${++caseCounter}`;
}
/**
 * Create camera target state.
 * @param {number} x @param {number} y @param {number} z
 * @param {number} zoom @param {number} tx @param {number} ty @param {number} tz
 */
function cam(x: any, y: any, z: any, zoom: any = 1, tx: any = 0, ty: any = -20, tz: any = 0) {
    return { camera: { x, y, z, zoom }, target: { x: tx, y: ty, z: tz } };
}
/** Create a well element definition */
function well(id: any, name: any, x: any, z: any, depth = 50) {
    return {
        family: 'well',
        id,
        name,
        data: {
            coordinates: { easting: x, northing: z, elevation: 0 },
            construction: { totalDepth: depth, diameter: 4 },
        },
    };
}
/** Create a boundary element definition */
function boundary(id: any, name: any, points: any) {
    return {
        family: 'boundary',
        id,
        name,
        data: { vertices: points },
    };
}
// ----------------------------------------------------------------
// TICKER LOG TEMPLATES
// ----------------------------------------------------------------
// eslint-disable-next-line
const NEURAL_NET_LOGS = [
    '[NEURAL_NET] Initializing model architecture...',
    '[NEURAL_NET] Loading training data (1,247 samples)...',
    '[TRAINING] Epoch 1/50 — Loss: 0.8934 | Acc: 0.42',
    '[TRAINING] Epoch 15/50 — Loss: 0.3201 | Acc: 0.78',
    '[TRAINING] Epoch 35/50 — Loss: 0.0891 | Acc: 0.94',
    '[TRAINING] Epoch 50/50 — Loss: 0.0234 | Acc: 0.97',
    '[NEURAL_NET] Model converged. R² = 0.96',
    '[PREDICTION] Generating forecast for next 30 days...',
    '[OK] Prediction complete — confidence: 94.2%',
];
// eslint-disable-next-line
const AI_BOT_LOGS = [
    '[LLM_AGENT] Initializing environmental knowledge base...',
    '[KNOWLEDGE_BASE] Loading CONAMA 420/2009 standards...',
    '[KNOWLEDGE_BASE] Loading CETESB reference values...',
    '[LLM_AGENT] Analyzing contamination vectors...',
    '[LLM_AGENT] Cross-referencing with regulatory thresholds...',
    '[LLM_AGENT] Evaluating remediation alternatives...',
    '[LLM_AGENT] Generating technical recommendations...',
    '[OK] Analysis complete — 3 critical findings',
];
// eslint-disable-next-line
const SATELLITE_LOGS = [
    '[SAT_RECOG] Fetching Sentinel-2 imagery (10m resolution)...',
    '[SAT_RECOG] Radiometric correction applied',
    '[SAT_RECOG] Cloud coverage: 8% — GOOD',
    '[NDVI] Computing vegetation index...',
    '[NDVI] Vegetation index: 0.72 ± 0.04',
    '[SAT_RECOG] Running land use classifier (RandomForest)...',
    '[SAT_RECOG] Detected: forest 62%, water 15%, urban 12%, bare 11%',
    '[OK] Classification complete — 4 land use classes mapped',
];
const MINING_NN_LOGS = [
    '[NEURAL_NET] Loading piezometric time-series (48 wells)...',
    '[NEURAL_NET] Feature engineering: lag, rolling mean, season...',
    '[TRAINING] Epoch 1/80 — Loss: 1.2340 | MAE: 2.1m',
    '[TRAINING] Epoch 40/80 — Loss: 0.1456 | MAE: 0.4m',
    '[TRAINING] Epoch 80/80 — Loss: 0.0312 | MAE: 0.15m',
    '[PREDICTION] Forecasting water table for 90 days...',
    '[ALERT] Well MW-12: predicted drawdown exceeds 5m threshold',
    '[OK] Prediction map generated — 3 risk zones identified',
];
// eslint-disable-next-line
const HEALTH_LOGS = [
    '[VOC_MONITOR] Reading PID sensors (23 stations)...',
    '[VOC_MONITOR] Benzene: 0.8 ppm | Toluene: 2.1 ppm | Xylene: 1.5 ppm',
    '[NR-15] Threshold check: Benzene > 0.5 ppm — WARNING',
    '[EXPOSURE] Calculating TWA (Time Weighted Average)...',
    '[EXPOSURE] Worker Route A: TWA = 1.2 ppm (LIMIT: 1.0)',
    '[ALERT] Route A exceeds NR-15 occupational limit!',
    '[HEATMAP] Generating VOC concentration surface...',
    '[OK] Heatmap generated — 2 exposure hotspots identified',
];
// ----------------------------------------------------------------
// STEP BUILDER HELPERS
// ----------------------------------------------------------------
function stepCamera(title: any, desc: any, target: any, duration = 800) {
    return { title, description: desc, action: 'camera', params: { target, duration } };
}
function stepToast(
    title: any,
    desc: any,
    msg: any,
    type = 'info',
    duration = 4000,
) {
    return { title, description: '', action: 'showToast', params: { message: msg, type, duration } };
}
function stepAI(
    title: any,
    desc: any,
    logs: any,
    duration = 4000,
    glowTarget: any = undefined,
) {
    return { title, description: desc, action: 'simulateAI', params: { logs, duration, glowTarget } };
}
// ================================================================
// SUPABASE FETCH - Busca cases do banco de dados
// ================================================================
/**
 * Fetch demo cases from Supabase.
 * Busca os 50 cases do Supabase com cache em sessionStorage.
 * Se falhar (offline/erro), usa fallback local de 5 cases.
 *
 * @returns {Promise<Array<Object>>} Array of CaseMetadata
 */
export async function fetchDemoCases() {
    // Check sessionStorage cache first
    const cached = sessionStorage.getItem('ecbyts-demo-cases') || '';
    if (cached) {
        try {
            return JSON.parse(cached);
        } catch (e: any) {
            console.debug('[demo/cases] cacheParse:', e?.message || e);
            /* fallthrough */
        }
    }
    // Try Supabase with hard timeout (sem isso, fetch pode hangar quando RLS
    // está mal-configurado ou rede está caindo — bug 2026-05-14 demo nunca abria)
    try {
        const { getSupabaseClient } = await import('../auth/session.js' as string);
        const client = getSupabaseClient();
        if (client) {
            // OPT-1: explicit columns - case_data is the JSONB blob spread into output
            const queryPromise = client
                .from('demo_cases')
                .select('id, vertical, module, title, description, risk_level, case_data, active, sort_order')
                .eq('active', true)
                .order('sort_order');
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('demo_cases query timeout 2.5s')), 2500),
            );
            const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
            if (!error && data && data.length > 0) {
                const cases = data.map((row: any) => ({
                    id: row.id,
                    vertical: row.vertical,
                    module: row.module,
                    title: row.title,
                    description: row.description || '',
                    riskLevel: row.risk_level || 'med',
                    ...row.case_data,
                }));
                sessionStorage.setItem('ecbyts-demo-cases', JSON.stringify(cases));
                console.debug(`[Demo] Loaded ${cases.length} cases from Supabase`);
                return cases;
            }
        }
    } catch (e: any) {
        console.warn('[Demo] Supabase fetch failed, using fallback:', e?.message);
    }
    // Fallback: 5 representative local cases
    console.debug('[Demo] Using fallback cases (offline mode)');
    return generateFallbackCases();
}
/**
 * Backward-compatible sync version.
 * Retorna fallback imediato; chamadores devem migrar para fetchDemoCases().
 * @returns {Array<Object>}
 */
export function generateMockCases() {
    caseCounter = 0;
    return generateFallbackCases();
}
// ================================================================
// FALLBACK CASES - 5 cases representativos para modo offline
// ================================================================
function generateFallbackCases() {
    caseCounter = 0;
    return [
        // ============================================================
        // MINING - Mineração (13 cases)
        // ============================================================
        {
            id: 'mining-001',
            vertical: 'mining',
            module: 'neural_net',
            title: 'Pit Dewatering Prediction',
            description: 'Neural network predicts water table drawdown around an open-pit mine over 90 days.',
            riskLevel: 'high',
            initialCamera: cam(60, 80, 60, 1.2, 0, -15, 0),
            elements: [
                well(uid(), 'MW-01', -20, -15, 80),
                well(uid(), 'MW-02', 15, -20, 75),
                well(uid(), 'MW-03', 25, 10, 65),
                well(uid(), 'MW-04', -10, 20, 70),
                well(uid(), 'MW-05', 0, -30, 85),
                boundary(uid(), 'Pit Boundary', [
                    { x: -30, z: -25 },
                    { x: 30, z: -25 },
                    { x: 35, z: 20 },
                    { x: -25, z: 20 },
                ]),
            ],
            steps: [
                stepCamera(
                    'Overview',
                    'Isometric view of the open-pit mine with 5 monitoring wells.',
                    cam(60, 80, 60, 1.2, 0, -15, 0),
                ),
                stepToast(
                    'Problem',
                    '',
                    'Challenge: Predict water table behavior during pit expansion to prevent slope instability.',
                    'warning',
                    5000,
                ),
                stepAI(
                    'Neural Network Training',
                    'Training LSTM model on 2 years of piezometric data from 5 wells.',
                    MINING_NN_LOGS,
                    5000,
                ),
                stepCamera(
                    'Risk Zone',
                    'Zooming to the critical drawdown area near MW-05.',
                    cam(20, 40, -20, 2, 0, -15, -30),
                ),
                stepToast(
                    'Result',
                    '',
                    'Prediction: MW-05 will reach critical level (-5m) in 47 days. Recommended: install additional dewatering well.',
                    'success',
                    6000,
                ),
            ],
        },
        // ============================================================
        // GEE RMSP — Inventario GHG Protocol 2024 (39 municipios)
        // Loader: app/js/utils/demo/ghgRmspDemoLoader.js
        // ============================================================
        {
            id: 'gee-rmsp-2024',
            vertical: 'emissions',
            module: 'ai_bot',
            title: 'Inventário GEE — RMSP 2024',
            description:
                '39 municípios da Região Metropolitana de São Paulo com emissões sintéticas plausíveis nas 8 tabelas do GHG Protocol Brasil v2026.',
            riskLevel: 'med',
            // Sem elements/initialCamera: loader cuida do bootstrap (boundaries + emission_sources)
            elements: [],
            initialCamera: cam(60, 80, 60, 1.2, 0, -15, 0),
            steps: [
                stepToast(
                    'Importar shapefile RMSP',
                    '',
                    'Carregando subset GeoJSON dos 39 municipios IBGE 2025...',
                    'info',
                    3000,
                ),
                stepToast(
                    'Gerar 234 fontes de emissão',
                    '',
                    '6 sub-categorias x 39 municipios — Escopos 1, 2-loc e 3.',
                    'info',
                    4000,
                ),
                stepToast(
                    'Calcular GWP-100 AR6',
                    '',
                    'CO2/CH4/N2O agregados com fatores per-capita por setor.',
                    'info',
                    3000,
                ),
                stepToast('Renderizar 8 tabelas', '', 'GHG Protocol Brasil — T1..T8 + Capa.', 'success', 4000),
            ],
            // Identificador para o engine despachar para o loader dedicado
            // (wiring em engine.js fica para outra etapa — entry registrada).
            customLoader: 'ghgRmspDemoLoader',
        },
        // ============================================================
        // HEALTH — Individual Health Showcase (HEALTH-MON-001)
        // Loader: app/js/utils/demo/individualHealthDemoLoader.js
        // Posiciona 1 sujeito em [0,0,0] com 6 EPIs + 3 leituras de biomarcadores.
        // ============================================================
        {
            id: 'individual-health',
            vertical: 'health',
            module: 'ai_bot',
            title: 'Individual Health — PPE & Biomarkers',
            description:
                'Sujeito (humano/cão/gato/planta) em [0,0,0] com 6 EPIs e 3 leituras (benzeno, chumbo, mercúrio) ACGIH BEI 2024.',
            riskLevel: 'med',
            elements: [],
            initialCamera: cam(5, 4, 5, 1, 0, 1, 0),
            steps: [
                stepToast(
                    'Carregando sujeito',
                    '',
                    'Posicionando indivíduo + EPIs em torno da origem (0,0,0)...',
                    'info',
                    3000,
                ),
                stepToast(
                    'Registro de biomarcadores',
                    '',
                    'Benzeno (urina), Chumbo (sangue) e Mercúrio (urina) com confounders PPE.',
                    'info',
                    4000,
                ),
                stepToast(
                    'EPI completo',
                    '',
                    'Capacete, óculos, máscara, luvas, botas e protetor auricular adicionados.',
                    'success',
                    4000,
                ),
            ],
            // Identificador para o engine despachar para o loader dedicado.
            // Default subjectType=human; override via loaderOptions futuramente.
            customLoader: 'individualHealthDemoLoader',
        },
    ];
}
/**
 * Helper exposed for callers that want to invoke the Individual Health demo
 * directly without going through the engine.customLoader dispatch.
 *
 * @param {'human'|'dog'|'cat'|'plant'} [subjectType]
 * @returns {Promise<unknown>}
 */
export async function loadIndividualHealthCase(subjectType = 'human') {
    const mod = await import('./individualHealthDemoLoader.js' as string);
    return mod.loadIndividualHealthDemo({ subjectType });
}
// 49 additional cases migrated to Supabase table `demo_cases`.
// Para adicionar/editar cases, use o Supabase Dashboard.
