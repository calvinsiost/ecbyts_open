// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   MULTI-MODEL HANDLERS - window.* bridge para model tabs
   (SPEC_MULTI_MODEL_TABS Phase 3)

   Handlers:
   - handleSwitchModel(id)    dispatch switchActive + re-render
   - handleCloseModel(id)     confirma + deleteModel + re-render
   - handleCreateModel(src)   source: 'empty' | 'random' | 'import'
   - handleRenameModel(id, name)

   Scene lifecycle dispatch (dispose → load) fica para Phase 4.
   Nesta Phase 3: apenas CRUD de metadata + re-render da tab bar.
   ================================================================ */
import { switchActive, createModel, deleteModel, renameModel, listModels, getActiveModel, } from '../../core/models/registry.js';
import { renderModelTabs } from '../ui/modelTabs.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
/** @param {string} id */
async function handleSwitchModel(id: any) {
    if (!id)
        return;
    try {
        const ok = await switchActive(id);
        if (!ok) {
            showToast(`Modelo não encontrado: ${id}`, 'warning');
            return;
        }
        await renderModelTabs();
        // Phase 4 (pendente): dispatch custom event 'model:switch' que triggers
        // sceneOwner.dispose() + registry.loadIntoActive() + reinit.
        window.dispatchEvent(new CustomEvent('model:switched', { detail: { id } }));
    }
    catch (err: any) {
        console.error('[models] switch failed:', err);
        showToast('Falha ao trocar de modelo', 'error');
    }
}
/** @param {string} id */
async function handleCloseModel(id: any) {
    if (!id)
        return;
    try {
        const models = await listModels();
        if (models.length <= 1) {
            showToast('Não é possível fechar o último modelo', 'warning');
            return;
        }
        const m = ( /** @type {Array<{ id: string, name?: string }>} */(models)).find((x: any) => x.id === id);
        const name = m?.name || 'este modelo';
        // Reutiliza asyncConfirm se existir, senão confirma direto (CLAUDE.md
        // proíbe native confirm mas Phase 3 é scaffold - Phase 6 pluga o dialog).
        const _w = (window) as any;
        const confirmed = typeof _w.asyncConfirm === 'function'
            ? await _w.asyncConfirm((t ? t('models.tab.close.confirm') : 'Remover {name} permanentemente?').replace('{name}', name))
            : true;
        if (!confirmed)
            return;
        const ok = await deleteModel(id);
        if (!ok) {
            showToast('Falha ao remover modelo', 'error');
            return;
        }
        await renderModelTabs();
        window.dispatchEvent(new CustomEvent('model:closed', { detail: { id } }));
    }
    catch (err: any) {
        console.error('[models] close failed:', err);
        showToast('Erro ao fechar modelo', 'error');
    }
}
async function handleCreateModel(source = 'empty') {
    try {
        const name = source === 'random' ? 'Novo aleatório' : source === 'import' ? 'Importado' : 'Sem título';
        const m = /** @type {{ id: string }} */ (await createModel({ name, source }));
        await switchActive(m.id);
        await renderModelTabs();
        window.dispatchEvent(new CustomEvent('model:created', { detail: { id: m.id, source } }));
        showToast('Modelo criado', 'success');
    }
    catch (err: any) {
        console.error('[models] create failed:', err);
        showToast('Falha ao criar modelo', 'error');
    }
}
/**
 * @param {string} id
 * @param {string} newName
 */
async function handleRenameModel(id: any, newName: any) {
    if (!id || !newName)
        return;
    try {
        const ok = await renameModel(id, newName);
        if (ok) {
            await renderModelTabs();
            window.dispatchEvent(new CustomEvent('model:renamed', { detail: { id, name: newName } }));
        }
    }
    catch (err: any) {
        console.error('[models] rename failed:', err);
    }
}
async function handleListModels() {
    return listModels();
}
async function handleGetActiveModel() {
    return getActiveModel();
}
export const modelHandlers = {
    handleSwitchModel,
    handleCloseModel,
    handleCreateModel,
    handleRenameModel,
    handleListModels,
    handleGetActiveModel,
};
