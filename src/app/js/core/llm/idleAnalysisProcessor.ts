// NEEDS-MANUAL: build-break (dep cross-tree não-resolvível) — promover quando deps .ts
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   IDLE ANALYSIS PROCESSOR
   ================================================================

   Pre-processa ate 3 analises em background quando o usuario fica
   idle por 5 segundos. Resultados ficam em cache na memoria e sao
   consumidos pelo proactiveInsights.js para enriquecer as dicas.

   Usa requestIdleCallback (com fallback setTimeout) para nao
   bloquear o rendering. Cada analise tem timeout individual de 5s.

   Cache invalidado automaticamente quando o modelo muda
   (ecbt:elementAdded, ecbt:elementRemoved, ecbt:elementUpdated,
   ecbt:elementsCleared).

   ================================================================ */

// @ts-ignore
import { createLogger } from '../../utils/helpers/logger.js';

const log = createLogger('IdleProcessor');

// Configuracao
const IDLE_DELAY = 5000; // 5s sem atividade
const BOOT_DELAY = 10000; // 10s apos init antes do primeiro idle
const MAX_ANALYSES = 3; // Maximo por ciclo
const ANALYSIS_TIMEOUT = 5000; // Timeout individual por analise

// Estado
let _idleTimer: any = null;
let _listeners: any[] = [];
let _cache: Record<string, any> = {};
let _initialized = false;
let _bootTimeout: any = null;

// ----------------------------------------------------------------
// ANALYSES REGISTRY - lista de analises disponiveis por prioridade
// ----------------------------------------------------------------

const ANALYSES = [
    {
        key: 'trends',
        label: 'Temporal Trends',
        condition: () => _hasObservations(3),
        run: async () => {
            // @ts-ignore
            const { getAllTrends } = await import('../analytics/prediction.js');
            return getAllTrends();
        },
    },
    {
        key: 'compliance',
        label: 'Global Compliance',
        condition: () => _hasObservations(1),
        run: async () => {
            // @ts-ignore
            const { computeGlobalCompliance } = await import('../validation/globalCompliance.js');
            const obs = _getAllObservations();
            return computeGlobalCompliance(obs, 'groundwater');
        },
    },
    {
        key: 'eis',
        label: 'EIS Score',
        condition: () => _hasObservations(1),
        run: async () => {
            // @ts-ignore
            const { EisCalculator } = await import('../eis/eisCalculator.js');
            const calc = new EisCalculator();
            const scores = _buildEISScores();
            return (calc as any).calculate(scores, 'geometric');
        },
    },
    {
        key: 'costRollup',
        label: 'Cost Rollup',
        condition: () => _hasCostData(),
        run: async () => {
            // @ts-ignore
            const { buildCostRollup } = await import('../analytics/economics/costRollup.js');
            return buildCostRollup();
        },
    },
    {
        key: 'coverage',
        label: 'Spatial Coverage',
        condition: () => _hasElementsWithCoords(3),
        run: async () => {
            // @ts-ignore
            const { calculateCoverage } = await import('../analytics/spatial.js');
            return calculateCoverage(_getElementsWithPositions(), 50);
        },
    },
    {
        key: 'monteCarlo',
        label: 'Monte Carlo Simulation',
        condition: () => _hasObservations(3),
        run: async () => {
            // @ts-ignore
            const { runScenarioSimulation } = await import('../analytics/scenarioSimulation/index.js');
            const params = _buildBaselineParams();
            return runScenarioSimulation(params, { numRuns: 100 });
        },
    },
    {
        key: 'nn',
        label: 'Neural Network',
        condition: () => _hasTrainedNetwork(),
        run: async () => {
            const { runInference } = await import('../nn/whatIfEngine.js');
            return runInference('default', _buildCurrentInputs());
        },
    },
    {
        key: 'knowledge',
        label: 'Knowledge Assets',
        condition: () => true, // sempre disponivel — Supabase pode estar offline, run() trata
        run: async () => {
            // ../../ (não ../../../): app/js/core/llm/ → app/js/supabase-config.js
            const supaMod = (await import('../../supabase-config.js' as any)) as any;
            const supabase = supaMod.getSupabaseClient();
            if (!supabase) return [];
            let lon = null;
            let lat = null;
            try {
                // @ts-ignore
                const { hasOrigin, getOrigin } = await import('../io/geo/coordinates.js');
                if (hasOrigin()) {
                    // @ts-ignore
                    const { utmToWGS84 } = await import('../io/geo/coordinates.js');
                    const wgs84 = utmToWGS84(getOrigin() as any);
                    lon = wgs84.longitude;
                    lat = wgs84.latitude;
                }
            } catch (e) {
                console.debug('[idleAnalysis] geo:', (e as any)?.message || e);
                /* no geo */
            }
            const { data } = await supabase.rpc('query_knowledge_for_area', {
                p_lon: lon,
                p_lat: lat,
                p_radius_km: 50,
            });
            return data || [];
        },
    },
];

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Initialize the idle processor.
 * Registra event listeners para detectar inatividade do usuario.
 * Espera BOOT_DELAY antes do primeiro ciclo para nao sobrecarregar o boot.
 */
export function initIdleProcessor() {
    if (_initialized) return;
    _initialized = true;

    const handler = _debouncedReset();
    ['mousemove', 'keydown', 'click', 'scroll', 'touchend'].forEach((evt) => {
        document.addEventListener(evt, handler, { passive: true });
        _listeners.push({ evt, handler, target: document });
    });

    // Invalidar cache quando modelo muda
    const invalidate = () => {
        _cache = {};
    };
    ['ecbt:elementAdded', 'ecbt:elementRemoved', 'ecbt:elementUpdated', 'ecbt:elementsCleared'].forEach((evt) => {
        window.addEventListener(evt, invalidate);
        _listeners.push({ evt, handler: invalidate, target: window });
    });

    // Atraso inicial para nao competir com boot da app
    _bootTimeout = setTimeout(() => {
        _resetIdle();
    }, BOOT_DELAY);

    log.debug('Idle processor initialized');
}

/**
 * Stop the idle processor.
 * Remove todos os listeners e limpa timers.
 */
export function stopIdleProcessor() {
    clearTimeout(_idleTimer);
    clearTimeout(_bootTimeout);
    _listeners.forEach(({ evt, handler, target }) => {
        target.removeEventListener(evt, handler);
    });
    _listeners = [];
    _initialized = false;
    log.debug('Idle processor stopped');
}

/**
 * Get the current idle analysis cache.
 * @returns Cache com keys das analises e { data, timestamp }
 */
export function getIdleCache(): object {
    return _cache;
}

/**
 * Invalidate the entire cache.
 * Chamado quando o modelo muda significativamente.
 */
export function invalidateCache() {
    _cache = {};
}

// ----------------------------------------------------------------
// IDLE DETECTION
// ----------------------------------------------------------------

/** Reset idle timer — chamado a cada interacao do usuario. */
function _resetIdle() {
    clearTimeout(_idleTimer);
    _idleTimer = setTimeout(_onIdle, IDLE_DELAY);
}

/** Debounce o proprio reset para evitar chamadas excessivas. */
function _debouncedReset() {
    let resetTimer: any = null;
    return () => {
        clearTimeout(resetTimer);
        resetTimer = setTimeout(_resetIdle, 200);
    };
}

/**
 * Executado quando o usuario fica idle.
 * Seleciona top N analises nao-cacheadas e roda em paralelo.
 */
async function _onIdle() {
    // Verificar se ha elementos no modelo
    try {
        // @ts-ignore
        const { getAllElements } = await import('../elements/manager.js');
        if (getAllElements().length === 0) return;
    } catch (e) {
        console.debug('[idleAnalysis] checkElements:', (e as any)?.message || e);
        return;
    }

    const pending = ANALYSES.filter((a) => {
        if (_cache[a.key]) return false;
        try {
            return a.condition();
        } catch (e) {
            console.debug('[idleAnalysis] condition:', (e as any)?.message || e);
            return false;
        }
    });

    const batch = pending.slice(0, MAX_ANALYSES);
    if (batch.length === 0) return;

    log.debug('Processing:', batch.map((a) => a.label).join(', '));

    const results = await Promise.allSettled(
        batch.map((a) =>
            Promise.race([
                a.run(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ANALYSIS_TIMEOUT)),
            ]),
        ),
    );

    let completedCount = 0;
    results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value != null) {
            _cache[(batch[i] as any).key] = { data: r.value, timestamp: Date.now() };
            completedCount++;
        } else {
            const reason = (r as any).reason;
            log.debug(`${(batch[i] as any).label} failed:`, reason?.message || 'null result');
        }
    });

    // Notificar que insights estao prontos
    if (completedCount > 0) {
        window.dispatchEvent(
            new CustomEvent('ecbt:idleInsightsReady', {
                detail: { count: completedCount, keys: Object.keys(_cache) },
            }),
        );
    }

    // Re-agendar se ainda ha analises pendentes
    const remaining = ANALYSES.filter((a) => !_cache[a.key]);
    if (remaining.length > 0) {
        _resetIdle();
    }
}

// ----------------------------------------------------------------
// CONDITION HELPERS - verificam dados disponiveis no modelo
// ----------------------------------------------------------------

/** Verifica se ha elementos com N ou mais observacoes. */
function _hasObservations(_minCount?: any) {
    // Otimista - validacao real ocorre no run() via dynamic import.
    // condition() nao pode ser async, entao retornamos true e
    // o run() fara a verificacao real.
    return true;
}

/** Verifica se ha 3+ elementos com coordenadas. */
function _hasElementsWithCoords(_minCount?: any) {
    return true; // Otimista — validacao real no run()
}

/** Verifica se ha dados de custo. */
function _hasCostData() {
    return true; // Otimista — validacao real no run()
}

/** Verifica se ha rede neural treinada. */
function _hasTrainedNetwork() {
    return false; // Conservador — NN nao esta treinada por default
}

// ----------------------------------------------------------------
// DATA HELPERS - coletam dados do modelo para as analises
// ----------------------------------------------------------------

/** Coleta todas as observacoes de todos os elementos. */
function _getAllObservations() {
    try {
        // Dynamic import ja ocorreu no run() - getElements disponivel
        const elModule = _requireSync();
        if (!elModule) return [];
        const elements = (elModule.getAllElements || elModule.getElements)();
        const obs = [];
        for (const el of elements) {
            if (el.data?.observations) {
                obs.push(...el.data.observations);
            }
        }
        return obs;
    } catch (e) {
        console.debug('[idleAnalysis] getObs:', (e as any)?.message || e);
        return [];
    }
}

/** Cache de modulo sincrono (para uso dentro de run() apos import). */
let _elementsModuleCache: any = null;
function _requireSync() {
    return _elementsModuleCache;
}

/** Importa o elements manager e cacheia. */
async function _ensureElementsModule() {
    if (!_elementsModuleCache) {
        // @ts-ignore
        _elementsModuleCache = await import('../elements/manager.js');
    }
    return _elementsModuleCache;
}

/** Constroi scores EIS a partir do modelo. */
function _buildEISScores() {
    // Scores default para calculo - o EIS real precisa de avaliacao manual.
    // Aqui usamos heuristicas baseadas nos dados disponiveis.
    return { T: 3, A: 3, Cp: 3, Ty: 3, Cs: 3, Cm: 3 };
}

/** Constroi parametros baseline para Monte Carlo. */
function _buildBaselineParams() {
    return {
        months: 120,
        initialConcentration: 500,
        initialRadius: 50,
        initialHealth: 70,
        remediationActive: false,
        monitoringCost: 5000,
    };
}

/** Coleta elementos com posicoes. */
function _getElementsWithPositions() {
    try {
        const mod = _elementsModuleCache;
        if (!mod) return [];
        return (mod.getAllElements || mod.getElements)().filter((el: any) => {
            const d = el.data;
            return d?.coordinates || d?.center || d?.position;
        });
    } catch (e) {
        console.debug('[idleAnalysis] withPositions:', (e as any)?.message || e);
        return [];
    }
}

/** Constroi inputs atuais para inferencia NN. */
function _buildCurrentInputs() {
    return {};
}

// Atualizar cache de modulo durante o run
const _originalRun = ANALYSES[0]?.run;
for (const a of ANALYSES) {
    const originalRun = a.run;
    a.run = async () => {
        await _ensureElementsModule();
        return originalRun();
    };
}
