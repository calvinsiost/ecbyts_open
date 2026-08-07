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
   CAMPAIGN HANDLERS — Sampling campaign management
   Handlers para campanhas de amostragem

   Uma "campanha" e um evento de coleta de dados em campo.
   Ex: "Campanha de Monitoramento - Janeiro 2026"
   Cada campanha tem uma data, equipe responsavel e cor de identificacao.
   As observacoes (medicoes) sao vinculadas a campanhas.
   ================================================================ */
import { addCampaign, updateCampaign, removeCampaign, setCampaignVisibility, addPlannedReading, updatePlannedReading, removePlannedReading, getCampaignById, } from '../../core/campaigns/manager.js';
import { getElementById, updateElement } from '../../core/elements/manager.js';
import { CONFIG } from '../../config.js';
import { getCurrentUser } from '../auth/session.js';
import { canDo } from '../auth/permissions.js';
import { showToast } from '../ui/toast.js';
import { purposeMicroFeedback } from '../../core/purpose/actionImpact.js';
import { t } from '../i18n/translations.js';
import { updateCampaignsList, updateScenesList, updateElementDetails } from '../ui/lists.js';
import { requireOwnershipPermission } from '../../core/ownership/index.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('Campaigns');
// ----------------------------------------------------------------
// CAMPAIGN CRUD
// Criar, editar e remover campanhas de amostragem.
// ----------------------------------------------------------------
/**
 * Add a new empty campaign.
 * Cria uma nova campanha de amostragem vazia.
 * @param {*} [params?]
 */
export function handleAddCampaign(params?: any) {
    // P2: Headless mode - create campaign without UI
    if (typeof params === 'object' && params?._headless) {
        const { name, startDate, endDate, color } = params;
        const campaign = addCampaign({});
        if (campaign && name) {
            updateCampaign(campaign.id, { name });
            if (startDate)
                updateCampaign(campaign.id, { startDate });
            if (endDate)
                updateCampaign(campaign.id, { endDate });
            if (color)
                updateCampaign(campaign.id, { color });
        }
        return campaign ? { success: true, campaignId: campaign.id } : { error: 'creation_failed' };
    }
    const c = addCampaign({});
    updateCampaignsList();
    if (c) {
        window.dispatchEvent(new CustomEvent('ecbt:campaignAdded', { detail: { id: c.id } }));
        _triggerGeoMLAutoUpdate(c.id);
        purposeMicroFeedback('handleAddCampaign');
    }
}
/**
 * Update a field in a campaign.
 * Atualiza um campo da campanha (nome, data, cor, etc.)
 *
 * @param {string} campaignId - Campaign ID
 * @param {string} field - Field to update
 * @param {*} value - New value
 */
export function handleCampaignChange(campaignId: string, field: string, value: any) {
    updateCampaign(campaignId, { [field]: value });
    updateCampaignsList();
    _triggerGeoMLAutoUpdate(campaignId);
}
/**
 * Toggle campaign visibility in the model.
 * Mostra ou esconde os dados de uma campanha na visualizacao.
 *
 * @param {string} campaignId - Campaign ID
 * @param {boolean} visible - Visibility state
 */
export function handleCampaignVisibility(campaignId: string, visible: boolean) {
    setCampaignVisibility(campaignId, visible);
    updateCampaignsList();
}
/**
 * Remove a campaign.
 * Remove uma campanha e atualiza a lista de cenas
 * (cenas podem referenciar campanhas).
 *
 * @param {string} campaignId - Campaign ID to remove
 */
export function handleRemoveCampaign(campaignId: string) {
    if (!canDo('delete')) {
        showToast(t('auth.actionDenied') || "You don't have permission to perform this action.", 'error');
        return;
    }
    const ownership = requireOwnershipPermission('campaign_remove');
    if (!ownership.ok) {
        showToast(t('auth.actionDenied') || (ownership as { error?: string }).error || 'Action denied', 'error');
        return;
    }
    removeCampaign(campaignId);
    updateCampaignsList();
    updateScenesList();
}
// ----------------------------------------------------------------
// PLANNED READINGS CRUD
// Gerenciar leituras planejadas (elemento + parametro esperados).
// ----------------------------------------------------------------
/**
 * Add a new empty planned reading to a campaign.
 * Adiciona uma leitura planejada vazia (usuario seleciona elemento e parametro).
 *
 * @param {string} campaignId
 */
export function handleAddPlannedReading(campaignId: string) {
    addPlannedReading(campaignId, { elementId: null, parameterId: null });
    updateCampaignsList();
}
/**
 * Update a field in a planned reading.
 * Edita o elementId ou parameterId de uma leitura planejada.
 *
 * @param {string} campaignId
 * @param {number} index
 * @param {string} field - 'elementId' or 'parameterId'
 * @param {string} value
 */
export function handlePlannedReadingChange(campaignId: string, index: number, field: string, value: string) {
    // Campos numericos: posicao e valor esperado
    const numericFields = ['x', 'y', 'z', 'expectedValue'];
    const parsed = numericFields.includes(field) ? (value === '' ? null : Number(value)) : value;
    updatePlannedReading(campaignId, parseInt(String(index), 10), field, /** @type {any} */ (parsed));
    updateCampaignsList();
}
/**
 * Remove a planned reading from a campaign.
 * Remove uma leitura planejada pelo indice.
 *
 * @param {string} campaignId
 * @param {number} index
 */
export function handleRemovePlannedReading(campaignId: string, index: number) {
    removePlannedReading(campaignId, parseInt(String(index), 10));
    updateCampaignsList();
}
/**
 * Quick-fill: create an observation from a planned reading.
 * Cria uma observacao no elemento com campaignId e parameterId ja preenchidos.
 * Atalho para o tecnico nao precisar abrir o elemento e preencher manualmente.
 *
 * @param {string} campaignId
 * @param {string} elementId
 * @param {string} parameterId
 */
export function handleFillFromPlan(campaignId: string, elementId: string, parameterId: string) {
    const element = getElementById(elementId);
    if (!element) {
        showToast(t('elementNotFound') || 'Element not found', 'error');
        return;
    }
    // Busca dados planejados da campanha (posicao e valor esperado)
    const campaign = getCampaignById(campaignId);
    const plannedReading = campaign?.plannedReadings?.find((r: any) => r.elementId === elementId && r.parameterId === parameterId);
    const param = CONFIG.PARAMETERS.find((p) => p.id === parameterId);
    const observations = Array.isArray(element.data?.observations) ? [...element.data.observations] : [];
    observations.push({
        // Posicao planejada (copiada do plano da campanha)
        plannedX: plannedReading?.x ?? null,
        plannedY: plannedReading?.y ?? null,
        plannedZ: plannedReading?.z ?? null,
        // Posicao executada (comeca em 0, tecnico preenche)
        x: 0,
        y: 0,
        z: 0,
        date: new Date().toISOString().slice(0, 10),
        campaignId,
        parameterId: parameterId || null,
        // Valor esperado vs coletado
        expectedValue: plannedReading?.expectedValue ?? null,
        value: null,
        unitId: param?.defaultUnitId || null,
        autoConvert: false,
        additionalReadings: [],
        variables: {},
        detect_flag: null,
        qualifier: null,
        detection_limit: null,
        cas_number: null,
        lab_name: null,
        sample_code: null,
        analytical_method: null,
        dilution_factor: null,
        sample_matrix: null,
        credentialLevel: getCurrentUser()?.credentialLevel || 'common',
        createdBy: getCurrentUser()?.email || null,
    });
    updateElement(elementId, { data: { ...element.data, observations } });
    updateCampaignsList();
    updateElementDetails();
    showToast(t('observationFilledFromPlan') || 'Observation created from planned reading', 'success');
}
/**
 * Dispara auto-update das layers GeoML se CONFIG.GEOML.AUTO_TRIGGER estiver ativo.
 * Fire-and-forget - não bloqueia a UI em caso de erro.
 * @param {string} campaignId
 */
async function _triggerGeoMLAutoUpdate(campaignId: string) {
    if (!CONFIG.GEOML?.AUTO_TRIGGER)
        return;
    try {
        const { createPotentiometricMap, createPlumeFromCampaign, getAllLayers, recomputeLayer } = await import('../../core/interpolation/manager.js');
        const { getAllElements } = await import('../../core/elements/manager.js');
        const minPts = CONFIG.GEOML?.AUTO_TRIGGER_MIN_POINTS ?? 3;
        // Coleta parâmetros disponíveis nesta campanha
        const elements = getAllElements();
        const paramCounts = new Map();
        for (const el of elements) {
            for (const obs of el.data?.observations ?? []) {
                if (obs.campaignId !== campaignId)
                    continue;
                if (!Number.isFinite(parseFloat(obs.value)))
                    continue;
                paramCounts.set(obs.parameterId, (paramCounts.get(obs.parameterId) ?? 0) + 1);
            }
        }
        const layers = /** @type {Array<any>} */ (getAllLayers());
        // Potentiometric: upsert se há water_level com pontos suficientes
        if ((paramCounts.get('water_level') ?? 0) >= minPts) {
            const existing = layers.find((l: any) => l.type === 'potentiometric' && l.autoGenerated);
            if (existing) {
                await recomputeLayer(existing.id);
            }
            else {
                const l: any = await createPotentiometricMap({ campaignId });
                if (l)
                    l.autoGenerated = true;
            }
        }
        // Contaminação: upsert por parâmetro (exceto water_level)
        for (const [parameterId, count] of paramCounts) {
            if (parameterId === 'water_level')
                continue;
            if (count < minPts)
                continue;
            const existing = layers.find((l: any) => l.type === 'contamination' && l.parameterId === parameterId && l.autoGenerated);
            if (existing) {
                await recomputeLayer(existing.id);
            }
            else {
                const result = /** @type {{ layer?: any }} */ (await createPlumeFromCampaign({ parameterId, campaignId }));
                if (result?.layer)
                    (result.layer as any).autoGenerated = true;
            }
        }
    }
    catch (err: any) {
        log.warn('GeoML auto-trigger failed silently', /** @type {Error} */ (err).message);
    }
}
/**
 * Open the Data Quality Dashboard modal.
 * Abre o painel de qualidade de dados das campanhas.
 */
export async function handleOpenDataQuality() {
    try {
        const { openDataQualityModal } = await import('../ui/dataQualityModal.js');
        openDataQualityModal();
    }
    catch (err: any) {
        log.error('openDataQuality failed', /** @type {Error} */ (err)?.message || err);
        showToast(t('dataQuality.openError') || 'Could not open data quality dashboard.', 'error');
    }
}
/**
 * All campaign handler functions exposed to HTML via window.
 * Objeto com todas as funcoes de campanha para o HTML.
 */
export const campaignHandlers = {
    handleAddCampaign,
    handleCampaignChange,
    handleCampaignVisibility,
    handleRemoveCampaign,
    handleAddPlannedReading,
    handlePlannedReadingChange,
    handleRemovePlannedReading,
    handleFillFromPlan,
    handleOpenDataQuality,
};
//# sourceMappingURL=campaigns.js.map
