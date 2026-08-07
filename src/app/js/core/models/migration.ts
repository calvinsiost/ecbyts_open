// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/**
 * migration.ts - Single-model → Multi-model migration (one-shot)
 *
 * Detecta chaves IDB globais legadas (LEGACY_MODEL_KEYS) e move para namespace
 * `model:{newId}:*`, registrando o modelo no índice com nome "Modelo importado".
 *
 * Idempotente via flag IDB `migrated:multi-model-v1`. Nunca executa duas vezes.
 * Também faz fallback para localStorage (alguns models antigos estão lá antes
 * da migração IDB de 2026-02).
 *
 * Invariante: se migration falhar no meio, chaves globais permanecem intactas.
 * O caller (boot de main.js) deve apenas rodar se CONFIG.FEATURES.MULTI_MODEL=true.
 *
 * Ver ADR.md A5 + SPEC_MULTI_MODEL_TABS §4.
 */
import { idbGet, idbSet, modelScope } from '../../utils/storage/idbStore.js';
import { createModel, switchActive, LEGACY_MODEL_KEYS } from './registry.js';
const MIGRATION_FLAG = 'migrated:multi-model-v1';
/**
 * Traduz chave legada 'ecbyts-elements' → suffix 'elements' para modelScope.
 * Chaves sem prefixo 'ecbyts-' (futuras) ficam como estão.
 * @param {string} legacyKey
 * @returns {string}
 */
function _legacyToSuffix(legacyKey: any) {
    return legacyKey.replace(/^ecbyts-/, '');
}
/**
 * Lê uma chave legada de IDB primeiro, localStorage como fallback.
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function _readLegacy(key: any) {
    const idbValue = await idbGet(key);
    if (idbValue != null)
        return idbValue;
    // Fallback localStorage (modelos pré-migração IDB)
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
        if (!raw)
            return null;
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/**
 * Verifica se alguma chave legada tem dado (em IDB ou LS).
 * @returns {Promise<boolean>}
 */
async function _hasLegacyData() {
    for (const key of LEGACY_MODEL_KEYS) {
        const v = await _readLegacy(key);
        if (v != null) {
            // Arrays vazios ainda indicam "sem dados" - pula
            if (Array.isArray(v) && v.length === 0)
                continue;
            // Strings vazias idem
            if (typeof v === 'string' && v === '')
                continue;
            return true;
        }
    }
    return false;
}
/**
 * Executa a migração single→multi se necessário.
 *
 * Retorno:
 *   - {status:'skipped', reason:'already-migrated'} - flag presente
 *   - {status:'skipped', reason:'no-legacy-data'} - nada a migrar
 *   - {status:'migrated', modelId, elementCount} - sucesso
 *   - {status:'failed', error} - falha (flag NÃO marcada, dados preservados)
 *
 * @returns {Promise<{status:string, reason?:string, modelId?:string, elementCount?:number, error?:string}>}
 */
export async function runMigration() {
    const already = await idbGet(MIGRATION_FLAG);
    if (already) {
        return { status: 'skipped', reason: 'already-migrated' };
    }
    const hasData = await _hasLegacyData();
    if (!hasData) {
        // Marca flag mesmo sem dados para fast-path em boots futuros
        await idbSet(MIGRATION_FLAG, true);
        return { status: 'skipped', reason: 'no-legacy-data' };
    }
    try {
        const model = (await createModel({ name: 'Modelo importado', source: 'import' }));
        const scope = modelScope(model.id);
        let elementCount = 0;
        let campaignCount = 0;
        // Copia cada chave legada para scope. Em falha parcial, aborta sem marcar flag.
        for (const legacyKey of LEGACY_MODEL_KEYS) {
            const value = await _readLegacy(legacyKey);
            if (value == null)
                continue;
            const suffix = _legacyToSuffix(legacyKey);
            const ok = await scope.set(suffix, value);
            if (!ok) {
                return {
                    status: 'failed',
                    error: `falha ao copiar chave ${legacyKey} para scope`,
                };
            }
            if (legacyKey === 'ecbyts-elements' && Array.isArray(value)) {
                elementCount = value.length;
            }
            if (legacyKey === 'ecbyts-campaigns' && Array.isArray(value)) {
                campaignCount = value.length;
            }
        }
        // Atualiza contadores no índice
        if (elementCount || campaignCount) {
            const { updateCounts } = await import('./registry.js');
            await updateCounts(model.id, { elementCount, campaignCount });
        }
        // Ativa o modelo migrado
        await switchActive(model.id);
        // Marca flag APENAS após sucesso completo
        await idbSet(MIGRATION_FLAG, true);
        // NÃO deletamos chaves legadas - mantém rollback via script.
        // scripts/revert-multi-model.mjs pode copiar de volta se necessário.
        return { status: 'migrated', modelId: model.id, elementCount };
    }
    catch (e) {
        return { status: 'failed', error: (e as any)?.message || String(e) };
    }
}
/**
 * Força reset da flag de migração. USO: apenas para testes.
 * Em produção, rollback deve usar `scripts/revert-multi-model.mjs`.
 * @returns {Promise<boolean>}
 */
export async function _resetMigrationFlag() {
    const { idbDelete } = await import('../../utils/storage/idbStore.js');
    return idbDelete(MIGRATION_FLAG);
}
//# sourceMappingURL=migration.js.map
