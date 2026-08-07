// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   PRESET HANDLERS — Gera modelo a partir de preset selecionado
   Registra telemetria no Supabase (fire-and-forget).
   Suporta modo 'demo' (dados ficticios) e 'work' (estrutura vazia).
   ================================================================ */
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
// ─── Core handler ────────────────────────────────────────────────
/**
 * Gera modelo a partir de um preset.
 * @param {string} presetId - ID do preset (ex: 'gac_gas_station')
 * @param {'demo'|'work'} [mode='demo'] - Modo de geracao
 */
async function handleApplyPreset(presetId: any, mode: any = "demo") {
    try {
        const { getPreset } = await import('../../core/elements/presets/registry.js' as string);
        const preset = getPreset(presetId);
        if (!preset) {
            showToast(`Preset "${presetId}" not found`, 'error');
            return;
        }
        showToast(`${t(preset.nameKey) || preset.id}: ${t('preset.generating') || 'Generating model...'}`, 'info');
        if (mode === 'demo') {
            // Modo demo: gera modelo com dados ficticios
            const { generateRandomModel } = await import('../../core/elements/randomModel.js' as string);
            await generateRandomModel(/** @type {any} */ (new Set(preset.families)), preset.generationOptions);
        }
        else {
            // Modo work: cria modelo vazio com familias do preset configuradas
            const { clearAllElements } = await import('../../core/elements/manager.js' as string);
            clearAllElements();
            // Familias ja ficam disponiveis no seletor - o modelo inicia vazio
            // mas com as familias corretas ativas para o tipo de projeto
        }
        // Salvar preset usado na metadata do modelo (para telemetria local)
        try {
            const { safeSetItem } = await import('../storage/storageMonitor.js' as string);
            safeSetItem('ecbyts-active-preset', JSON.stringify({
                id: preset.id,
                mode,
                appliedAt: new Date().toISOString(),
            }));
        }
        catch (e: any) {
            console.debug('[presets] persistApplied:', /** @type {any} */ (e)?.message || e);
            /* noop */
        }
        // Telemetria Supabase (fire-and-forget)
        _recordPresetUsage(presetId, mode, preset.generationOptions);
        showToast(`${t(preset.nameKey) || preset.id}: ${t('preset.ready') || 'Model ready!'}`, 'success');
    }
    catch (err: any) {
        console.error('[presets] Failed to apply preset:', err);
        showToast(/** @type {any} */ (err)?.message || 'Failed to apply preset', 'error');
    }
}
/**
 * Telemetria de uso de preset (fire-and-forget).
 */
function _recordPresetUsage(presetId: any, mode: any, options: any) {
    try {
        const user = window.__ecbyts_current_user_id;
        const client = window.__ecbyts_supabase_client;
        if (!user || !client)
            return;
        client
            .from('preset_usage')
            .insert({
            user_id: user,
            preset_id: presetId,
            mode,
            options: options || {},
            tier: 'free', // TODO: read from session
        })
            .then(() => { })
            .catch((_e: any) => console.debug('[utils/handlers/presets:silent-catch]', _e?.message || _e)); // fire-and-forget
    }
    catch (e: any) {
        console.debug('[presets] recordUsage:', /** @type {any} */ (e)?.message || e);
        /* noop */
    }
}
// ─── Shortcut handlers (registrados no window) ───────────────────
function handlePresetGacGasStation() {
    handleApplyPreset('gac_gas_station', 'demo');
}
function handlePresetGacIndustrial() {
    handleApplyPreset('gac_industrial', 'demo');
}
function handlePresetGhgInventory() {
    handleApplyPreset('ghg_inventory', 'demo');
}
function handlePresetRemediation() {
    handleApplyPreset('remediation', 'demo');
}
function handlePresetCarRural() {
    handleApplyPreset('car_rural', 'demo');
}
function handlePresetOhsWorkplace() {
    handleApplyPreset('ohs_workplace', 'demo');
}
// ─── Export ──────────────────────────────────────────────────────
export const presetHandlers = {
    handleApplyPreset,
    handlePresetGacGasStation,
    handlePresetGacIndustrial,
    handlePresetGhgInventory,
    handlePresetRemediation,
    handlePresetCarRural,
    handlePresetOhsWorkplace,
};
