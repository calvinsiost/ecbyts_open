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
   EXECUTOR DE COMANDOS - Mapeia ações do LLM para handlers
   ================================================================

   Este módulo executa as ações interpretadas pelo LLM,
   chamando os handlers existentes ou funções dos managers.

   FLUXO:
   1. Recebe ação e parâmetros validados
   2. Mapeia para o handler/função apropriada
   3. Executa a ação
   4. Retorna resultado

   ================================================================ */
import { t } from '../../utils/i18n/translations.js';
// CONSIST-OBS-001 B3 — proveniência IA (EU AI Act Art. 50)
import {
    buildAiProvenanceTag,
    createAiProvenanceLog,
    buildArt50Disclosure,
} from '../governance/_aiProvenancePure.js';
import { getModel } from './client.js';
// CONSIST-OBS-001 B4 — enforcement unidade+incerteza na fronteira de entrada
import { enforceObservationInput } from '../units/_inputEnforcementPure.js';
import { UNITS } from '../units/catalog.js';
import {
    addNewElement,
    updateElement,
    getSelectedElement,
    setSelectedElement,
    getAllElements,
    getMeshByElementId,
} from '../elements/manager.js';
import { addCampaign, updateCampaign } from '../campaigns/manager.js';
import { CONFIG } from '../../config.js';
import { analyzeReport } from '../audit/greenwashing.js';
import { createTHREEProxy } from '../three-lazy.js';
const THREE: any = createTHREEProxy();
import { getScene } from '../../utils/scene/setup.js';
import { researchSite } from './siteResearch.js';
import { addCustomFamily, getFamily } from '../elements/families.js';
import { wgs84ToUTM, wgs84ToRelative, setOrigin } from '../io/geo/coordinates.js';
import { getLlmActionMap, getHeadlessMeta, LLM_CATEGORY_DESCRIPTIONS } from '../../utils/api/registry.js';
type AnyRecord = Record<string, any>;
/** @typedef {Record<string, any>} AnyRecord */
// ================================================================
// ESTADO - Ultimo relatorio de pesquisa para POPULATE_FROM_RESEARCH
// ================================================================
/** @type {any} */
let _lastResearchReport: any = null;

async function loadPredictionAnalytics() {
    return import('../analytics/prediction.js' as string);
}

async function loadSpatialAnalytics() {
    return import('../analytics/spatial.js' as string);
}

function signalModelChanged(source: string) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function')
        return;
    const CustomEventCtor = (window as any).CustomEvent || globalThis.CustomEvent;
    if (typeof CustomEventCtor !== 'function')
        return;
    window.dispatchEvent(new CustomEventCtor('modelChanged', { detail: { source } }));
}

/**
 * Armazena o ultimo relatorio de pesquisa.
 * Chamado pelo handler SITE_RESEARCH apos sucesso.
 *
 * @param {Object} report - Relatorio da pesquisa
 */
function setLastResearchReport(report: any) {
    _lastResearchReport = report;
}
/**
 * Retorna o ultimo relatorio de pesquisa.
 * @returns {Object|null}
 */
export function getLastResearchReport() {
    return _lastResearchReport;
}
// ================================================================
// EXECUTOR PRINCIPAL
// ================================================================
/**
 * Executa uma ação do LLM
 * @param {string} action - Nome da ação
 * @param {Object} params - Parâmetros resolvidos
 * @returns {Promise<Object>} - { success, message, data }
 */
export async function executeCommand(action: string, params: any): Promise<any> {
    const handler = (actionHandlers)[action];
    if (handler) {
        try {
            const result = await handler(params) as any;
            _recordAiProvenance(action, params);
            return {
                success: true,
                message: result.message || t('success'),
                data: result.data || null,
            };
        } catch (error: any) {
            console.error('Erro ao executar comando:', error);
            return {
                success: false,
                message: error.message || 'Erro ao executar comando',
                data: null,
            };
        }
    }
    // Fallback dinamico: dispatch para window.* via registry
    const regResult = await executeRegistryAction(action, params);
    if (regResult?.success) _recordAiProvenance(action, params);
    return regResult;
}

// ================================================================
// CONSIST-OBS-001 B3 — PROVENIÊNCIA IA (EU AI Act Art. 50)
// ================================================================

/** Log de mutações IA da sessão (singleton; cap 1000 LRU). */
const _aiProvenanceLog = createAiProvenanceLog();

/**
 * Registra a proveniência de uma mutação executada pelo bot. Defensivo:
 * NUNCA quebra o fluxo do executor (try/catch + audit assíncrono best-effort).
 */
function _recordAiProvenance(actionId: string, params: any): void {
    try {
        let model = 'unknown';
        try { model = getModel() || 'unknown'; } catch (e: any) { console.debug('[llm:provenance-model]', e?.message || e); }
        const traceId = (globalThis as any).__ecbtSessionTraceId ?? null;
        const tag = buildAiProvenanceTag({ model, actionId, params, traceId });
        if (!tag) return;
        _aiProvenanceLog.record(tag);
        (globalThis as any).__ecbtLastAiProvenance = tag; // consumo por badge UI
        // Audit G1 (append-only) — import dinâmico best-effort
        import('../governance/auditTrail.js')
            .then((m) => m.logAction('ai-bot', 'ai.mutation', actionId, {
                model: tag.model, ts: tag.ts, paramsHash: tag.paramsHash, traceId: tag.traceId,
            }))
            .catch((e: any) => console.debug('[ai-provenance:audit]', e?.message || e));
    } catch (e: any) {
        console.debug('[ai-provenance]', e?.message || e);
    }
}

/** Tags de mutação IA da sessão (badge UI / export ECBT). */
export function getAiMutationLog() {
    return _aiProvenanceLog.getAll();
}

/** Disclosure machine-readable EU AI Act Art. 50 da sessão corrente. */
export function getArt50Disclosure() {
    return buildArt50Disclosure(_aiProvenanceLog.getAll());
}
// ================================================================
// HANDLERS DE AÇÕES
// ================================================================
const actionHandlers: Record<string, (params: any) => Promise<any>> = {
    /**
     * Adiciona observação a um elemento
     */
    ADD_OBSERVATION: async (/** @type {any} */ params) => {
        const { elementId, parameterId, value, unitId, campaignId, x = 0, y = 0, z = 0, date } = params;
        // Encontra o elemento
        const elements = getAllElements();
        const element = elements.find((/** @type {any} */ e) => e.id === elementId);
        if (!element) {
            throw new Error(`Elemento não encontrado: ${elementId}`);
        }
        // Prepara a nova observação
        const newObservation = {
            x: Number(x) || 0,
            y: Number(y) || 0,
            z: Number(z) || 0,
            date: date || new Date().toISOString().slice(0, 10),
            campaignId: campaignId || null,
            parameterId: parameterId,
            value: Number(value),
            unitId: unitId || getDefaultUnit(parameterId),
            autoConvert: false,
            additionalReadings: [],
        };
        // CONSIST-OBS-001 B4 — enforcement de unidade+incerteza na fronteira
        // de entrada (modo warn: enriquece com _unitMeta UCUM/QUDT FAIR e loga
        // gaps; strict opt-in via CONFIG.FEATURES.UNIT_INPUT_ENFORCEMENT).
        let observationToAdd: any = newObservation;
        try {
            const mode = (CONFIG as any)?.FEATURES?.UNIT_INPUT_ENFORCEMENT === 'strict' ? 'strict' : 'warn';
            const enforced = enforceObservationInput(newObservation, {
                mode, knownUnitIds: Object.keys(UNITS),
            });
            if (!enforced.ok) {
                throw new Error(`Observação rejeitada (unit enforcement): ${enforced.errors.join('; ')}`);
            }
            if (enforced.warnings.length > 0) {
                console.debug('[unit-enforcement:ADD_OBSERVATION]', enforced.warnings.join(' | '));
            }
            observationToAdd = enforced.enriched;
        } catch (e: any) {
            if (String(e?.message || '').includes('unit enforcement')) throw e;
            console.debug('[unit-enforcement]', e?.message || e);
        }
        // Adiciona a observação
        const observations = Array.isArray(element.data?.observations) ? [...element.data.observations] : [];
        observations.push(observationToAdd);
        updateElement(elementId, {
            data: {
                ...element.data,
                observations,
            },
        });
        // Seleciona o elemento para mostrar na UI
        setSelectedElement(elementId);
        signalModelChanged('llm-add-observation');
        const paramName = getParameterName(parameterId);
        const unitSymbol = getUnitSymbol(unitId);
        return {
            message: `Observação de ${paramName} (${value} ${unitSymbol}) adicionada ao ${element.name}`,
            data: { elementId, observationIndex: observations.length - 1 },
        };
    },
    /**
     * Cria novo elemento
     */
    ADD_ELEMENT: async (/** @type {any} */ params) => {
        const { familyId, name } = params;
        // Usa o handler global se disponível
        if (typeof window.handleAddElement === 'function') {
            window.handleAddElement(familyId);
            const element = getSelectedElement();
            if (element && name) {
                updateElement(element.id, { name });
                signalModelChanged('llm-add-element-rename');
            }
            return {
                message: `${element?.name || 'Elemento'} criado com sucesso`,
                data: { elementId: element?.id },
            };
        }
        // Fallback: usa diretamente o manager
        const element = addNewElement(familyId);
        if (!element) {
            throw new Error(`Falha ao criar elemento do tipo ${familyId}`);
        }
        if (name) {
            updateElement(element.id, { name });
        }
        setSelectedElement(element.id);
        signalModelChanged('llm-add-element');
        return {
            message: `${element.name} criado com sucesso`,
            data: { elementId: element.id },
        };
    },
    /**
     * Cria nova campanha
     */
    ADD_CAMPAIGN: async (/** @type {any} */ params) => {
        const { name, startDate, endDate, color } = params;
        const campaignData: AnyRecord = {};
        if (name) campaignData.name = name;
        if (startDate) campaignData.startDate = startDate;
        if (endDate) campaignData.endDate = endDate;
        if (color) campaignData.color = color;
        const campaign = addCampaign(campaignData);
        // Atualiza UI
        if (typeof window.updateCampaignsList === 'function') {
            window.updateCampaignsList();
        } else {
            signalModelChanged('llm-add-campaign');
        }
        return {
            message: `Campanha "${campaign.name}" criada com sucesso`,
            data: { campaignId: campaign.id },
        };
    },
    /**
     * Atualiza observação existente
     */
    UPDATE_OBSERVATION: async (/** @type {any} */ params) => {
        const { elementId, observationIndex, field, value, isAdditional, readingIndex } = params;
        // Usa handler global se disponível
        if (isAdditional && typeof window.handleReadingChange === 'function') {
            (window as any).handleReadingChange(
                elementId,
                observationIndex,
                readingIndex,
                field,
                value,
                true,
            );
        } else if (typeof window.handleObservationChange === 'function') {
            (window as any).handleObservationChange(elementId, observationIndex, field, value);
        } else {
            // Fallback: atualiza diretamente
            const elements = getAllElements();
            const element = elements.find((/** @type {any} */ e) => e.id === elementId);
            if (!element) {
                throw new Error(`Elemento não encontrado: ${elementId}`);
            }
            const observations = Array.isArray(element.data?.observations) ? [...element.data.observations] : [];
            if (!observations[observationIndex]) {
                throw new Error(`Observação ${observationIndex} não encontrada`);
            }
            observations[observationIndex] = {
                ...observations[observationIndex],
                [field]: value,
            };
            updateElement(elementId, {
                data: {
                    ...element.data,
                    observations,
                },
            });
        }
        if (typeof window.updateElementDetails === 'function') {
            window.updateElementDetails();
        }
        return {
            message: `Observação atualizada: ${field} = ${value}`,
            data: { elementId, observationIndex, field, value },
        };
    },
    /**
     * Atualiza elemento
     */
    UPDATE_ELEMENT: async (/** @type {any} */ params) => {
        const { elementId, field, value } = params;
        if (typeof window.handleElementFieldChange === 'function') {
            (window as any).handleElementFieldChange(elementId, field, value);
        } else {
            updateElement(elementId, { [field]: value });
        }
        signalModelChanged('llm-update-element');
        return {
            message: `Elemento atualizado: ${field} = ${value}`,
            data: { elementId, field, value },
        };
    },
    /**
     * Atualiza campanha
     */
    UPDATE_CAMPAIGN: async (/** @type {any} */ params) => {
        const { campaignId, field, value } = params;
        const campaign = updateCampaign(campaignId, { [field]: value });
        if (!campaign) {
            throw new Error(`Campanha não encontrada: ${campaignId}`);
        }
        if (typeof window.updateCampaignsList === 'function') {
            window.updateCampaignsList();
        }
        return {
            message: `Campanha "${campaign.name}" atualizada: ${field} = ${value}`,
            data: { campaignId, field, value },
        };
    },
    // ================================================================
    // ANALYTICS ACTIONS - Trend analysis, spatial, audit
    // Acoes analiticas executadas pelo bot conversacional
    // ================================================================
    /**
     * Analisa tendencias de series temporais
     */
    ANALYZE_TRENDS: async (/** @type {any} */ params) => {
        const { analyzeTimeSeries, getAllTrends } = await loadPredictionAnalytics();
        // Single element analysis
        if (params.elementId && params.parameterId) {
            const result = analyzeTimeSeries(params.elementId, params.parameterId);
            if (!result) {
                return { message: 'Dados insuficientes para análise de tendência (mínimo 3 observações com datas).' };
            }
            return {
                message: formatTrendResult(result),
                data: result,
            };
        }
        // Batch analysis: all element-parameter combinations
        const trends = getAllTrends();
        if (trends.length === 0) {
            return {
                message:
                    'Nenhuma série temporal com dados suficientes encontrada. Adicione observações com datas para habilitar a análise.',
            };
        }
        let msg = `[GRAPH] Análise de tendência — ${trends.length} séries analisadas:\n\n`;
        for (const r of trends) {
            const icon = r.trend === 'increasing' ? '↑' : r.trend === 'decreasing' ? '↓' : '→';
            const sig = r.significant ? '' : ' (n.s.)';
            msg += `${icon} ${r.elementName} / ${r.parameterName}: `;
            msg += `${r.trend}${sig} (τ=${r.mannKendall.tau.toFixed(3)}, p=${r.mannKendall.pValue.toFixed(4)}, `;
            msg += `Sen=${r.sensSlope.slopePerMonth.toFixed(4)}/${r.unitSymbol}/mês, R²=${r.ols.r2.toFixed(3)})\n`;
        }
        return { message: msg, data: { trends } };
    },
    /**
     * Sugere pontos otimos de amostragem e visualiza na cena 3D
     */
    SUGGEST_SAMPLING: async (/** @type {any} */ params) => {
        const { calculateCoverage, suggestOptimalPoints, visualizeRecommendations } = await loadSpatialAnalytics();
        const count = params.count || 5;
        const coverage = (calculateCoverage()) as AnyRecord;
        const points = suggestOptimalPoints(count);
        if (points.length === 0) {
            return {
                message: `Cobertura: ${(coverage.coverage * 100).toFixed(1)}% (${coverage.pointCount} pontos). Nenhuma lacuna significativa encontrada.`,
            };
        }
        // Visualize in 3D scene
        const scene = getScene();
        if (scene && THREE) {
            visualizeRecommendations(scene, points, THREE);
        }
        let msg = `[PIN] Cobertura atual: ${(coverage.coverage * 100).toFixed(1)}% (${coverage.pointCount} pontos de monitoramento)\n\n`;
        msg += `${points.length} pontos ótimos sugeridos:\n`;
        for (const p of points) {
            msg += `  #${p.priority}: X=${p.x.toFixed(1)}, Z=${p.z.toFixed(1)} — ${p.reason}\n`;
        }
        msg += '\nMarcadores verdes adicionados à cena 3D. Peça "limpar marcadores" para removê-los.';
        return { message: msg, data: { coverage, points } };
    },
    /**
     * Executa auditoria ESG anti-greenwashing
     */
    RUN_AUDIT: async (/** @type {any} */ params) => {
        const reportText = params.reportText || '';
        const result = (await analyzeReport(reportText)) as AnyRecord;
        const ri = result.reliability;
        let msg = `[AUDIT] Auditoria ESG — Índice de Confiabilidade: ${ri.score}/100 (${ri.grade})\n\n`;
        msg += `Achados: ${result.summary.totalFindings} total `;
        msg += `(${result.summary.critical} críticos, ${result.summary.high} altos, `;
        msg += `${result.summary.medium} médios, ${result.summary.low} baixos)\n\n`;
        // Red flags
        if (ri.redFlags.length > 0) {
            msg += '[!] Red flags:\n';
            ri.redFlags.forEach((f: any) => {
                msg += `  • ${f}\n`;
            });
            msg += '\n';
        }
        // Statistical tests summary
        const b = result.statistical.benford;
        if (b.n >= 10) {
            msg += `Benford: ${b.conformity} (χ²=${b.chiSquared.toFixed(2)}, p=${b.pValue.toFixed(4)}, n=${b.n})\n`;
        }
        // Quality findings
        if (result.quality.findings.length > 0) {
            msg += `\nQualidade da investigação (${result.quality.findings.length} achados):\n`;
            result.quality.findings.slice(0, 5).forEach((f: any) => {
                msg += `  [${f.severity}] ${f.finding}\n`;
            });
            if (result.quality.findings.length > 5) {
                msg += `  ... e mais ${result.quality.findings.length - 5} achados\n`;
            }
        }
        // LLM claims
        if (result.claims.length > 0) {
            msg += `\nVerificação de alegações (${result.claims.length}):\n`;
            result.claims.slice(0, 5).forEach((c: any) => {
                msg += `  [${c.verdict}] "${c.claim}" — ${c.evidence}\n`;
            });
        }
        return { message: msg, data: result };
    },
    /**
     * Remove marcadores de recomendacao da cena 3D
     */
    CLEAR_MARKERS: async () => {
        const { clearRecommendations } = await loadSpatialAnalytics();
        const scene = getScene();
        clearRecommendations(scene);
        return { message: 'Marcadores de recomendação removidos da cena 3D.' };
    },
    // ================================================================
    // SITE RESEARCH - Consulta de dados publicos
    // ================================================================
    /**
     * Pesquisa dados publicos de uma area para modelo conceitual.
     * Usa Nominatim, IBGE e Overpass API.
     * Armazena o relatorio para uso posterior por POPULATE_FROM_RESEARCH.
     */
    SITE_RESEARCH: async (/** @type {any} */ params) => {
        const researchParams: AnyRecord = {
            address: params.address || params.query || '',
            radius: params.radius ? Number(params.radius) : 1000,
        };
        if (params.lat) researchParams.lat = Number(params.lat);
        if (params.lon) researchParams.lon = Number(params.lon);
        const report = await researchSite(researchParams as any);
        // Armazena para POPULATE_FROM_RESEARCH usar depois
        setLastResearchReport(report);
        if (!report.success) {
            return {
                message: report.summary || 'Não foi possível realizar a pesquisa.',
                data: report,
            };
        }
        // Conta features encontradas para sugerir inserção
        const feat = (report.nearbyFeatures || {}) as AnyRecord;
        const totalFeatures =
            (feat.waterBodies?.length || 0) + (feat.industries?.length || 0) + (feat.sensitiveSites?.length || 0);
        const hint =
            totalFeatures > 0
                ? `\n\n[TIP] ${totalFeatures} features encontradas. Diga "inserir dados no modelo" para criar elementos automaticamente.`
                : '';
        return {
            message: report.summary + hint,
            data: report,
        };
    },
    /**
     * Popula o modelo com dados da ultima pesquisa de area.
     * Cria elementos (markers/buildings) para features encontradas
     * e preenche coordenadas do projeto.
     *
     * AÇÃO CRÍTICA: Se o modelo ja tem dados, o LLM deve alertar
     * o usuario antes de confirmar. O parametro mode controla
     * se os dados sao adicionados (append) ou substituidos (replace).
     */
    POPULATE_FROM_RESEARCH: async (/** @type {any} */ params) => {
        if (!_lastResearchReport || !_lastResearchReport.success) {
            throw new Error(
                'Nenhuma pesquisa de área disponível. Use "Pesquisa de Área" primeiro para buscar dados de uma localização.',
            );
        }
        const report = _lastResearchReport;
        const feat = (report.nearbyFeatures || {}) as AnyRecord;
        const loc = report.location;
        const mun = report.municipio;
        /** @type {AnyRecord[]} */
        const created = [];
        /** @type {string[]} */
        const actions = []; // Log de acoes realizadas
        // Categorias a importar (default: todas)
        const categories = params.categories || ['waterBodies', 'industries', 'sensitiveSites'];
        const includeCoordinates = params.includeCoordinates !== false;
        const mode = params.mode || 'append'; // 'append' ou 'replace'
        // --- 0. Modo replace: limpa elementos existentes ---
        // PROTEÇÃO: modo replace so funciona se explicitamente solicitado
        if (mode === 'replace') {
            const existing = getAllElements();
            if (existing.length > 0) {
                // Conta elementos com observacoes para alertar sobre perda de dados
                const withObs = existing.filter((/** @type {any} */ e) => e.data?.observations?.length > 0);
                if (withObs.length > 0) {
                    actions.push(`⚠️ ${withObs.length} elementos com observações serão removidos`);
                }
                for (const el of existing) {
                    if (typeof window.handleDeleteElement === 'function') {
                        window.handleDeleteElement(el.id);
                    }
                }
                actions.push(`[DEL] ${existing.length} elementos anteriores removidos`);
            }
        }
        // --- 1. Preenche coordenadas do projeto ---
        if (includeCoordinates && loc) {
            // Converte WGS84 lat/lon para UTM antes de salvar nos campos de origem
            const utm = wgs84ToUTM({ latitude: loc.lat, longitude: loc.lon });
            const eastingEl = (document.getElementById('utm-origin-easting')) as HTMLInputElement|null;
            const northingEl = (document.getElementById('utm-origin-northing')) as HTMLInputElement|null;
            if (eastingEl) eastingEl.value = utm.easting.toFixed(2);
            if (northingEl) northingEl.value = utm.northing.toFixed(2);
            // Atualiza origem do sistema de coordenadas
            setOrigin({
                easting: utm.easting,
                northing: utm.northing,
                elevation: 0,
                zone: utm.zone,
                hemisphere: utm.hemisphere,
            });
            actions.push(
                `[COORD] Coordenadas: ${loc.lat.toFixed(6)}, ${loc.lon.toFixed(6)} (UTM ${utm.zone}${utm.hemisphere}: ${utm.easting.toFixed(0)}E ${utm.northing.toFixed(0)}N)`,
            );
            // Preenche nome do projeto (sobrescreve em replace, preenche vazio em append)
            const nameEl = (document.getElementById('project-name')) as HTMLInputElement|null;
            if (nameEl && (mode === 'replace' || !nameEl.value)) {
                const addr = report.address || {};
                nameEl.value = addr.road
                    ? `${addr.road}${addr.house_number ? ' ' + addr.house_number : ''}, ${addr.city || addr.town || ''}`
                    : loc.displayName?.split(',').slice(0, 2).join(',') || 'Novo Projeto';
                actions.push(`[NAME] Nome do projeto: ${nameEl.value}`);
            }
            // Preenche descrição com resumo do município
            const descEl = (document.getElementById('project-description')) as HTMLInputElement|null;
            if (descEl && (mode === 'replace' || !descEl.value) && mun) {
                descEl.value = `${mun.nome} — ${mun.uf} | ${mun.mesorregiao} | IBGE: ${mun.id}`;
                actions.push(`[CITY] Município: ${mun.nome} — ${mun.uf}`);
            }
        }
        // --- 2. Garante que famílias necessárias existam ---
        // Usa nomes de icones Lucide (registrados em ui/icons.js)
        ensureFamilyExists('water_body', "Corpo d'Água", 'droplet');
        ensureFamilyExists('industry', 'Indústria/Posto', 'factory');
        ensureFamilyExists('sensitive_area', 'Área Sensível', 'alert-triangle');
        // --- Helper: calcula posicao relativa a partir de lat/lon ---
        /**
         * @param {number|null|undefined} lat
         * @param {number|null|undefined} lon
         * @returns {{ x: number, y?: number, z: number }}
         */
        function featurePosition(lat: any, lon: any) {
            if (lat == null || lon == null) return { x: 0, y: 0, z: 0 };
            return wgs84ToRelative({ latitude: lat, longitude: lon });
        }
        // --- Helper: posiciona mesh apos criacao do elemento ---
        /**
         * @param {{ id: string }} el
         * @param {{ x: number, y?: number, z: number }} pos
         */
        function positionElement(el: any, pos: any) {
            const mesh = getMeshByElementId(el.id);
            if (mesh) mesh.position.set(pos.x, pos.y ?? 0, pos.z);
        }
        // --- 3. Cria elementos para corpos d'água ---
        if (categories.includes('waterBodies') && feat.waterBodies?.length > 0) {
            for (const wb of feat.waterBodies.slice(0, 10)) {
                const el = addNewElement('water_body');
                if (el) {
                    const name = wb.name || `Corpo d'água (${wb.type})`;
                    const pos = featurePosition(wb.lat, wb.lon);
                    updateElement(el.id, {
                        name,
                        data: {
                            ...el.data,
                            position: { x: pos.x, y: 0, z: pos.z },
                            sourceType: wb.type,
                            sourceLat: wb.lat,
                            sourceLon: wb.lon,
                            sourceApi: 'overpass',
                            observations: [],
                        },
                    });
                    positionElement(el, pos);
                    created.push({ type: '[WATER]', name, family: 'water_body' });
                }
            }
        }
        // --- 4. Cria elementos para indústrias/postos ---
        if (categories.includes('industries') && feat.industries?.length > 0) {
            for (const ind of feat.industries.slice(0, 10)) {
                const el = addNewElement('industry');
                if (el) {
                    const name = ind.name || `Indústria (${ind.type})`;
                    const pos = featurePosition(ind.lat, ind.lon);
                    updateElement(el.id, {
                        name,
                        data: {
                            ...el.data,
                            position: { x: pos.x, y: 0, z: pos.z },
                            sourceType: ind.type,
                            sourceLat: ind.lat,
                            sourceLon: ind.lon,
                            sourceApi: 'overpass',
                            observations: [],
                        },
                    });
                    positionElement(el, pos);
                    created.push({ type: '[INDUSTRY]', name, family: 'industry' });
                }
            }
        }
        // --- 5. Cria elementos para áreas sensíveis ---
        if (categories.includes('sensitiveSites') && feat.sensitiveSites?.length > 0) {
            for (const ss of feat.sensitiveSites.slice(0, 10)) {
                const el = addNewElement('sensitive_area');
                if (el) {
                    const name = ss.name || `Área sensível (${ss.type})`;
                    const pos = featurePosition(ss.lat, ss.lon);
                    updateElement(el.id, {
                        name,
                        data: {
                            ...el.data,
                            position: { x: pos.x, y: 0, z: pos.z },
                            sourceType: ss.type,
                            sourceLat: ss.lat,
                            sourceLon: ss.lon,
                            sourceApi: 'overpass',
                            observations: [],
                        },
                    });
                    positionElement(el, pos);
                    created.push({ type: '⚠️', name, family: 'sensitive_area' });
                }
            }
        }
        // --- 6. Atualiza UI e enquadra camera nos novos elementos ---
        signalModelChanged('llm-populate-from-research');
        if (typeof window.fitAllElements === 'function') {
            window.fitAllElements();
        }
        // --- 7. Gera resumo ---
        let msg = `✅ MODELO POPULADO\n\n`;
        // Mostra acoes de projeto realizadas
        if (actions.length > 0) {
            msg += `[DATA] Dados do projeto:\n`;
            for (const a of actions) {
                msg += `  ${a}\n`;
            }
            msg += '\n';
        }
        // Mostra elementos criados
        if (created.length > 0) {
            msg += `[BUILD] ${created.length} elementos criados:\n`;
            for (const c of created) {
                msg += `  ${c.type} ${c.name}\n`;
            }
        } else {
            const radius = report.query?.radius || 1000;
            msg += `ℹ️ Nenhuma feature encontrada no entorno (raio ${radius}m).\n`;
            msg += `   Tente "pesquisar [local] raio 2000" para ampliar a busca.\n`;
        }
        // Uso do solo como metadado
        if (feat.landUse?.length > 0) {
            const types = [...new Set(feat.landUse.map((l: AnyRecord) => l.type))];
            msg += `\n[MAP] Uso do solo: ${types.join(', ')}`;
        }
        return {
            message: msg,
            data: { created, actions, coordinates: loc, municipio: mun, mode },
        };
    },
    // ================================================================
    // ADD_MESSAGE - Salva mensagem no historico do elemento
    // ================================================================
    /**
     * Adiciona mensagem ao historico de conversas de um elemento.
     * Usado para persistir contexto entre sessoes.
     */
    // ================================================================
    // AGENTIC LLM - State queries (read-only) + Workflow trigger
    // ================================================================
    /**
     * Consulta estado do modelo (read-only, sem confirmacao).
     * Resultado retornado ao LLM para continuar raciocinando.
     */
    QUERY_STATE: async (/** @type {any} */ params) => {
        const { queryState } = await import('./stateQueries.js' as string);
        const result = queryState(params.query || 'summary', params.filter || {});
        return {
            message: JSON.stringify(result, null, 2),
            data: result,
        };
    },
    /**
     * Consulta detalhes de um elemento (read-only).
     */
    QUERY_ELEMENT: async (/** @type {any} */ params) => {
        const { queryElement } = await import('./stateQueries.js' as string);
        const result = queryElement(params.elementId);
        if (!result) {
            throw new Error(`Elemento não encontrado: ${params.elementId}`);
        }
        return {
            message: JSON.stringify(result, null, 2),
            data: result,
        };
    },
    /**
     * Verifica conformidade regulatoria de um parametro (read-only).
     */
    QUERY_COMPLIANCE: async (/** @type {any} */ params) => {
        const { queryCompliance } = await import('./stateQueries.js' as string);
        const result = await queryCompliance(params.parameterId, params.regulation || 'CONAMA_420');
        return {
            message: JSON.stringify(result, null, 2),
            data: result,
        };
    },
    /**
     * Busca datasets e camadas na base de conhecimento (Supabase).
     * Combina full-text search com filtro geografico.
     */
    QUERY_KNOWLEDGE: async (/** @type {any} */ params) => {
        try {
            const { getSupabaseClient } = await import('../../supabase-config.js' as string);
            const supabase = getSupabaseClient();
            if (!supabase) return { message: 'Supabase not available', data: [] };
            let lon = null;
            let lat = null;
            try {
                const { hasOrigin, getOrigin } = await import('../io/geo/coordinates.js' as string);
                if (hasOrigin()) {
                    const { utmToWGS84 } = await import('../io/geo/coordinates.js' as string);
                    const wgs84 = utmToWGS84(getOrigin());
                    lon = wgs84.longitude;
                    lat = wgs84.latitude;
                }
            } catch (e: any) {
                console.debug('[commandExecutor] geoCtx:', /** @type {any} */ (e).message || e);
                /* no geo context */
            }
            const { data, error } = await supabase.rpc('search_knowledge', {
                p_query: params.query || '',
                p_lon: lon,
                p_lat: lat,
                p_categories: params.categories || null,
                p_limit: params.limit || 10,
            });
            if (error) return { message: `Knowledge search failed: ${error.message}`, data: [] };
            if (!data || data.length === 0) return { message: 'No knowledge assets found for this query.', data: [] };
            const rows = (data) as AnyRecord[];
            const formatted = rows.map((a: any) => ({
                name: a.name,
                category: a.asset_category,
                source: a.source_name,
                features: a.feature_count,
                relevance: a.text_rank?.toFixed(2),
            }));
            const summary = formatted
                .map((/** @type {AnyRecord} */ a) => `${a.name} (${a.category}, ${a.features || '?'} features)`)
                .join('; ');
            return {
                message: `Found ${data.length} knowledge assets: ${summary}`,
                data: formatted,
            };
        } catch (err: any) {
            return { message: `Knowledge query error: ${/** @type {any} */ (err).message}`, data: [] };
        }
    },
    /**
     * Inicia um workflow guiado com decisoes pre-preenchidas.
     */
    START_WORKFLOW: async (/** @type {any} */ params) => {
        const { workflowId, prefill } = params;
        // Dispara o handler global para abrir o wizard
        if (typeof window.handleStartWorkflow === 'function') {
            window.handleStartWorkflow(workflowId, prefill || {});
            return {
                message: `Workflow "${workflowId}" iniciado`,
                data: { workflowId, prefill },
            };
        }
        throw new Error('Workflow handler not available');
    },
    /**
     * Inicia o Hydromet OHS guided tour. Equivalente ao botão "Tours Guiados
     * → Fluxos Ambientais → Riscos Hidrometalúrgicos + Saúde Ocupacional".
     * Cria tanque + 5 obs químicas + CONAMA 420 + workflow emergência.
     * Calvin 2026-06-10: paridade avatar↔MCP.
     */
    RUN_HYDROMET_TOUR: async () => {
        const w = window as any;
        if (typeof w.handleStartGuidedTour !== 'function') {
            throw new Error('Guided tour handler not available');
        }
        // Lazy-load tour modules (idêntico ao caminho titlebar button)
        if (typeof w.handleOpenGuidedTours === 'function') {
            await w.handleOpenGuidedTours();
            if (typeof w.handleCloseGuidedTours === 'function') w.handleCloseGuidedTours();
        }
        await w.handleStartGuidedTour('hydromet-ohs-risks');
        return {
            message: 'Tour "Riscos Hidrometalúrgicos + Saúde Ocupacional" iniciado',
            data: { tourId: 'hydromet-ohs-risks', steps: 7 },
        };
    },
    /**
     * Abre o Files panel + força input picker (browser sandbox impede leitura
     * direta do disco; user clica/arrasta). Calvin 2026-06-10.
     */
    OPEN_FILE_UPLOAD: async () => {
        const w = window as any;
        if (typeof w.handleOpenFilesPanel === 'function') await w.handleOpenFilesPanel();
        const input = typeof document !== 'undefined'
            ? (document.querySelector('input[type="file"]') as HTMLInputElement | null)
            : null;
        input?.click();
        return {
            message: 'Painel de Arquivos aberto. Arraste o documento ou clique para selecionar.',
            data: { panel: 'files', awaitingUpload: true },
        };
    },
    /**
     * Abre o Ingestion Wizard (EDD/XLSX/PDF multi-step).
     */
    START_INGESTION_WIZARD: async () => {
        const w = window as any;
        if (typeof w.handleOpenIngestionModal !== 'function') {
            throw new Error('Ingestion wizard handler not available');
        }
        await w.handleOpenIngestionModal();
        return {
            message: 'Wizard de Ingestão aberto. Siga: arquivo → mapeamento → revisão → confirmar.',
            data: { wizard: 'ingestion', steps: ['file', 'mapping', 'review', 'confirm'] },
        };
    },
    CREATE_ECO_TOOL: async (/** @type {any} */ params) => {
        const { name, description, htmlContent } = params;
        const { createEcoTool } = await import('./toolBuilder.js' as string);
        const tool = createEcoTool(name, description || '', htmlContent);
        signalModelChanged('llm-create-eco-tool');
        // Se houver modal de ferramentas, atualiza
        if (typeof window.renderEcoToolsList === 'function') {
            window.renderEcoToolsList();
        }
        return {
            message: `Ferramenta "${tool.name}" criada com sucesso. O HTML gerado foi salvo no modelo.`,
            data: { toolId: tool.id },
        };
    },
    ADD_MESSAGE: async (/** @type {any} */ params) => {
        const { elementId, role, content, toolId, agentId } = params;
        const elements = getAllElements();
        const element = elements.find((e: any) => e.id === elementId);
        if (!element) {
            throw new Error(`Elemento não encontrado: ${elementId}`);
        }
        if (!Array.isArray(element.messages)) {
            element.messages = [];
        }
        element.messages.push({
            role: role || 'assistant',
            content: content || '',
            toolId: toolId || null,
            agentId: agentId || null,
            timestamp: new Date().toISOString(),
        });
        return {
            message: `Mensagem salva no elemento ${element.name}`,
            data: { elementId, messageCount: element.messages.length },
        };
    },
    /**
     * LIST_CAPABILITIES - Descobre acoes disponiveis por categoria.
     * Permite ao LLM explorar Tier 3 sob demanda.
     *
     * @param {Object} action
     * @param {string} [params.category] - Filtrar por categoria (sensor, governance, etc.)
     * @returns {Promise<{ message: string, data: Array<any>|Record<string, string[]> }>}
     */
    LIST_CAPABILITIES: async (/** @type {any} */ params) => {
        const { category } = params;
        const llmMap = getLlmActionMap();
        /** @type {Array<{ action: string, params: string[], category: string }>} */
        const results = [];
        for (const [llmName, entry] of llmMap) {
            if (category && entry.cat !== category) continue;
            results.push({
                action: llmName,
                params: entry.params,
                category: entry.cat,
            });
        }
        // Agrupa por categoria para facilitar leitura
        /** @type {Record<string, string[]>} */
        const grouped: Record<string, string[]> = {};
        for (const r of results) {
            if (!grouped[r.category]) grouped[r.category] = [];
            (grouped[r.category] as string[]).push(r.action);
        }
        const desc = category ? /** @type {AnyRecord} */ (LLM_CATEGORY_DESCRIPTIONS)[category] || '' : '';
        const summary = category
            ? `${results.length} ações na categoria "${category}"${desc ? `: ${desc}` : ''}`
            : `${results.length} ações em ${Object.keys(grouped).length} categorias`;
        return {
            message: summary,
            data: category ? results : grouped,
        };
    },
};
// ================================================================
// DYNAMIC DISPATCH - Registry fallback para acoes nao-custom
// ================================================================
/**
 * Executa acao via registry, chamando window[handler](...args).
 * Usado como fallback quando a acao nao tem handler custom.
 *
 * @param {string} action - Nome SCREAMING_SNAKE da acao
 * @param {AnyRecord} action - Parametros nomeados
 * @returns {Promise<AnyRecord>} - { success, message, data }
 */
async function executeRegistryAction(action: string, params: AnyRecord): Promise<AnyRecord> {
    const llmMap = getLlmActionMap();
    const entry = llmMap.get(action);
    if (!entry) {
        return {
            success: false,
            message: `Ação desconhecida: ${action}`,
            data: null,
        };
    }
    const handlerName = entry.name;
    // Verifica se handler existe em window
    const win = window as any;
    if (typeof win[handlerName] !== 'function') {
        return {
            success: false,
            message: `Handler não disponível: ${handlerName}`,
            data: null,
        };
    }
    // Acoes destrutivas requerem confirmacao explicita
    const meta = getHeadlessMeta(handlerName);
    if (meta?.destructive && !params._confirmed) {
        return {
            success: false,
            message: `Ação destrutiva "${action}" requer confirmação.`,
            data: { requiresConfirmation: true },
        };
    }
    try {
        // Mapeia params nomeados para args posicionais na ordem do registry
        const args = entry.params.map((p: any) => {
            const clean = p.replace('?', '');
            return params[clean];
        });
        const result = win[handlerName](...args);
        // Suporta handlers sync e async
        const resolved = result instanceof Promise ? await result : result;
        return {
            success: true,
            message: `${action} executado`,
            data: resolved ?? null,
        };
    } catch (error: any) {
        console.error(`[ecbyts] Erro em registry action ${action}:`, error);
        return {
            success: false,
            message: /** @type {any} */ (error).message || `Erro ao executar ${action}`,
            data: null,
        };
    }
}
// ================================================================
// HELPERS
// ================================================================
/**
 * Formata resultado de tendencia para exibicao no chat
 * @param {AnyRecord} r - Resultado de analyzeTimeSeries
 * @returns {string}
 */
function formatTrendResult(r: AnyRecord) {
    const icon = r.trend === 'increasing' ? '↑' : r.trend === 'decreasing' ? '↓' : '→';
    const sig = r.significant ? '(significativo)' : '(não significativo)';
    return `[GRAPH] Tendência: ${r.elementName} / ${r.parameterName} (${r.unitSymbol})
Período: ${r.dateRange.start} a ${r.dateRange.end} (${r.n} observações)
Último valor: ${r.latestValue} ${r.unitSymbol}

${icon} Tendência: ${r.trend} ${sig}
• Regressão Linear: slope=${r.ols.slopePerMonth.toFixed(4)}/mês, R²=${r.ols.r2.toFixed(3)}
• Mann-Kendall: τ=${r.mannKendall.tau.toFixed(3)}, Z=${r.mannKendall.Z.toFixed(2)}, p=${r.mannKendall.pValue.toFixed(4)}
• Sen's Slope: ${r.sensSlope.slopePerMonth.toFixed(4)}/mês (IC: ${r.sensSlope.lowerCI.toFixed(4)} a ${r.sensSlope.upperCI.toFixed(4)})
• Estatísticas: média=${r.stats.mean.toFixed(2)}, mediana=${r.stats.median.toFixed(2)}, σ=${r.stats.std.toFixed(2)}`;
}
/**
 * Obtém a unidade padrão de um parâmetro
 * @param {string} parameterId
 * @returns {string}
 */
function getDefaultUnit(parameterId: any) {
    const param = CONFIG.PARAMETERS.find((p: any) => p.id === parameterId);
    return param?.defaultUnitId || 'mg_L';
}
/**
 * Obtém o nome de um parâmetro
 * @param {string} parameterId
 * @returns {string}
 */
function getParameterName(parameterId: any) {
    const param = CONFIG.PARAMETERS.find((p: any) => p.id === parameterId);
    return param?.name || parameterId;
}
/**
 * Obtém o símbolo de uma unidade
 * @param {string} unitId
 * @returns {string}
 */
function getUnitSymbol(unitId: any) {
    const unit = CONFIG.UNITS.find((u: any) => u.id === unitId);
    return unit?.symbol || unitId;
}
/**
 * Garante que uma familia de elementos exista.
 * Se nao existir, cria como familia customizada.
 *
 * @param {string} familyId - ID da familia
 * @param {string} name - Nome de exibicao
 * @param {string} icon - Emoji do icone
 */
function ensureFamilyExists(familyId: any, name: any, icon: any) {
    if (!getFamily(familyId)) {
        addCustomFamily(familyId, name, icon);
    }
}
/**
 * Lista de ações suportadas
 * @returns {string[]}
 */
export function getSupportedActions() {
    const custom = Object.keys(actionHandlers);
    const llmMap = getLlmActionMap();
    return [...new Set([...custom, ...llmMap.keys()])];
}
