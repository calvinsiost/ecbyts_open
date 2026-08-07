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
   GERENCIADOR DE CAMPANHAS
   ================================================================

   Este modulo gerencia campanhas de monitoramento.

   CAMPANHA = AGRUPAMENTO DE DATAS + LEITURAS PLANEJADAS
   - id: identificador unico
   - name: nome de exibicao
   - startDate: data inicial (obrigatoria)
   - endDate: data final (opcional)
   - color: cor de destaque
   - visible: se esta ativa na visualizacao
   - plannedReadings: leituras esperadas [{ elementId, parameterId }]

   PLANEJADO vs EXECUTADO:
   Cada campanha define leituras planejadas (elemento + parametro).
   Observacoes reais vinculadas por campaignId sao o "executado".
   A razao executado/planejado alimenta o eixo Cp (Completude) do EIS.

   ================================================================ */
import { requireOwnershipPermission } from '../ownership/index.js';
// Adopt own pure helpers (Module C extraction commit 0bfed2f2) — DRY interno.
import {
    createCampaignId,
    normalizeCampaignShape,
    // eslint-disable-next-line
    normalizePlannedReading,
    addPlannedReadingToCampaign,
    updatePlannedReadingField,
    removePlannedReadingAt,
    computeCampaignCompleteness,
    serializeCampaignsArray,
    importCampaignsArray,
    getTodayDateIso,
} from './_campaignsPure.js';
// ----------------------------------------------------------------
// ESTADO DO MODULO
// ----------------------------------------------------------------
/** @type {any[]} */
let campaigns: any[] = [];
let campaignCounter = 0;
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
function createId() {
    const { id, nextCounter } = createCampaignId(campaignCounter);
    campaignCounter = nextCounter;
    return id;
}
/** @param {any} campaign */
function normalizeCampaign(campaign: any) {
    // Only consume an id from the counter when caller didn't provide one.
    const c = campaign || {};
    const fallbackId = !c.id ? createId() : '';
    const fallbackName = `Campanha ${campaignCounter}`;
    return normalizeCampaignShape(c, fallbackId, fallbackName, getTodayDateIso());
}
// ----------------------------------------------------------------
// FUNCOES DE ACESSO
// ----------------------------------------------------------------
export function getAllCampaigns() {
    return campaigns;
}
/** @param {any} id */
export function getCampaignById(id: any) {
    return campaigns.find((c: any) => c.id === id);
}
// ----------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------
export function addCampaign(data = {}) {
    const campaign = normalizeCampaign(data);
    campaigns.push(campaign);
    return campaign;
}
/** @param {any} id @param {any} updates */
export function updateCampaign(id: any,updates: any) {
    const campaign = getCampaignById(id);
    if (!campaign) return null;
    Object.assign(campaign, updates);
    if (!campaign.startDate) {
        campaign.startDate = getTodayDateIso();
    }
    return campaign;
}
/** @param {any} id @param {any} options */
export function removeCampaign(id: any,options: any = {}) {
    if (!(/** @type {any} */ (options)?.skipOwnershipCheck)) {
        const ownership = requireOwnershipPermission('campaign_remove');
        if (!ownership.ok) return false;
    }
    const index = campaigns.findIndex((c: any) => c.id === id);
    if (index === -1) return false;
    campaigns.splice(index, 1);
    return true;
}
/** @param {any} id @param {any} visible */
export function setCampaignVisibility(id: any,visible: any) {
    const campaign = getCampaignById(id);
    if (campaign) {
        campaign.visible = visible;
    }
}
// ----------------------------------------------------------------
// PLANNED READINGS - Leituras planejadas (elemento + parametro)
// ----------------------------------------------------------------
/**
 * Add a planned reading to a campaign.
 * Adiciona uma leitura esperada (elemento + parametro) a campanha.
 *
 * @param {string} campaignId
 * @param {any} reading
 * @returns {Object|null} Updated campaign or null if not found.
 */
export function addPlannedReading(campaignId: any,reading: any = {}) {
    const campaign = getCampaignById(campaignId);
    if (!campaign) return null;
    return addPlannedReadingToCampaign(campaign, reading);
}
/**
 * Update a field in a planned reading.
 * Edita o elementId ou parameterId de uma leitura planejada.
 *
 * @param {string} campaignId
 * @param {number} index - Index in the plannedReadings array.
 * @param {string} field - 'elementId' or 'parameterId'.
 * @param {string} value
 * @returns {Object|null}
 */
export function updatePlannedReading(campaignId: any,index: any,field: any,value: any) {
    const campaign = getCampaignById(campaignId);
    if (!campaign) return null;
    return updatePlannedReadingField(campaign as any, index, field, value) ? campaign : null;
}
/**
 * Remove a planned reading from a campaign.
 * Remove uma leitura planejada pelo indice.
 *
 * @param {string} campaignId
 * @param {number} index
 * @returns {boolean}
 */
export function removePlannedReading(campaignId: any,index: any) {
    const campaign = getCampaignById(campaignId);
    if (!campaign) return false;
    return removePlannedReadingAt(campaign as any, index);
}
/**
 * Compute completeness for a campaign: planned vs executed.
 * Para cada {elementId, parameterId} planejado, verifica se existe
 * pelo menos uma observacao com campaignId + elementId + parameterId
 * com value != null.
 *
 * @param {string} campaignId
 * @param {Array<any>} allElements - From getAllElements().
 * @returns {{ planned: number, executed: number, ratio: number, details: Array<{ elementId: string, parameterId: string, executed: boolean }> }}
 */
export function getCampaignCompleteness(campaignId: any,allElements: any) {
    const campaign = getCampaignById(campaignId);
    return computeCampaignCompleteness(campaign as any, allElements);
}
// ----------------------------------------------------------------
// SERIALIZACAO
// ----------------------------------------------------------------
export function exportCampaigns() {
    return serializeCampaignsArray(campaigns as any);
}
/** @param {any} imported */
export function importCampaigns(imported: any) {
    const { array, counter } = importCampaignsArray(imported, (i) => `Campanha ${i + 1}`, getTodayDateIso());
    campaigns = array;
    campaignCounter = counter;
}
export function clearCampaigns() {
    campaigns = [];
    campaignCounter = 0;
}
// ----------------------------------------------------------------
// TAB-MODEL-SWITCH-001 — Manager Signature (snapshot/restore per tab)
// ----------------------------------------------------------------
/**
 * Exporta estado completo do manager para snapshot de tab.
 * Wraps exportCampaigns + campaignCounter (necessário para preservar IDs futuros).
 */
export function exportState(): { campaigns: unknown; campaignCounter: number } {
    return {
        campaigns: exportCampaigns(),
        campaignCounter,
    };
}
/**
 * Restaura estado completo do manager a partir de snapshot.
 * Tolerante a state vazio ou malformado (degrada para clearCampaigns).
 */
export function importState(state: { campaigns?: unknown; campaignCounter?: number } | null | undefined): void {
    if (!state || typeof state !== 'object') {
        clearCampaigns();
        return;
    }
    importCampaigns(state.campaigns);
    if (typeof state.campaignCounter === 'number' && state.campaignCounter >= campaignCounter) {
        campaignCounter = state.campaignCounter;
    }
}
/** Alias canônico para Manager Registry (compat com elements/edges/etc.) */
export function resetState(): void {
    clearCampaigns();
}
