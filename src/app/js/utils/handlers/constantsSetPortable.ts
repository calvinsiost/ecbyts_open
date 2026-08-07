// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Kind portável `constants_set` (conjunto de constantes user-defined) — P1-10 Fase B.
// Permite usuário compartilhar grupo de constantes (fatores de emissão, incertezas,
// fatores de conversão) como .ecbt. applyImport itera e usa addUserConstant existente.
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
import { registerKind } from '../../core/io/portableArtifacts.js';

const log = createLogger('ConstantsSetPortable');

interface ConstantItem {
    id?: string;
    name: string;
    symbol?: string;
    value: number | string;
    unit?: string;
    description?: string;
    category?: string;
    uncertainty?: number | null;
    uncertaintyType?: string | null;
    coverageFactor?: number | null;
}

interface ConstantsSetShape {
    id: string;
    name: string;
    description?: string;
    constants: ConstantItem[];
}

function _isConstantItem(c: any): boolean {
    if (!c || typeof c !== 'object') return false;
    if (typeof c.name !== 'string' || c.name.trim() === '') return false;
    if (c.value == null) return false;
    if (typeof c.value !== 'number' && typeof c.value !== 'string') return false;
    if (typeof c.value === 'number' && !Number.isFinite(c.value)) return false;
    return true;
}

function _isSetShape(o: any): boolean {
    if (!o || typeof o !== 'object') return false;
    if (typeof o.id !== 'string' || o.id.trim() === '') return false;
    if (typeof o.name !== 'string' || o.name.trim() === '') return false;
    if (!Array.isArray(o.constants) || o.constants.length === 0) return false;
    return o.constants.every(_isConstantItem);
}

// Registra o kind no boot (idempotente).
registerKind({
    kind: 'constants_set',
    schemaVersion: 1,
    validate: (payload: unknown) => {
        if (!_isSetShape(payload)) {
            return {
                valid: false,
                errors: ['Conjunto de constantes inválido — requer id, name, constants[] (cada item com name+value).'],
            };
        }
        const p = payload as ConstantsSetShape;
        const errors: string[] = [];
        // Cap de 500 constantes por set (anti-DoS)
        if (p.constants.length > 500) {
            errors.push('constants: excede 500 itens (limite de segurança)');
        }
        // Detecta nomes/símbolos duplicados (deteriorate UX downstream)
        const seenNames = new Set<string>();
        const seenSymbols = new Set<string>();
        for (const c of p.constants) {
            const nKey = String(c.name).trim().toLowerCase();
            if (seenNames.has(nKey)) errors.push(`Nome duplicado: "${c.name}"`);
            seenNames.add(nKey);
            if (c.symbol) {
                const sKey = String(c.symbol).trim().toLowerCase();
                if (sKey && seenSymbols.has(sKey)) errors.push(`Símbolo duplicado: "${c.symbol}"`);
                if (sKey) seenSymbols.add(sKey);
            }
        }
        return { valid: errors.length === 0, errors };
    },
    toArtifact: (obj: unknown) => {
        const o: any = obj || {};
        return {
            id: String(o.id || ''),
            name: String(o.name || ''),
            description: String(o.description || ''),
            constants: Array.isArray(o.constants)
                ? o.constants.map((c: any) => ({
                    name: String(c.name || ''),
                    symbol: c.symbol ? String(c.symbol) : undefined,
                    value: c.value,
                    unit: c.unit ? String(c.unit) : undefined,
                    description: c.description ? String(c.description) : undefined,
                    category: c.category ? String(c.category) : undefined,
                    uncertainty: typeof c.uncertainty === 'number' ? c.uncertainty : null,
                    uncertaintyType: typeof c.uncertaintyType === 'string' ? c.uncertaintyType : null,
                    coverageFactor: typeof c.coverageFactor === 'number' ? c.coverageFactor : null,
                }))
                : [],
            authorId: typeof o.authorId === 'string' ? o.authorId : undefined,
            marketplaceAssetId: typeof o.marketplaceAssetId === 'string' ? o.marketplaceAssetId : undefined,
        };
    },
    fromArtifact: (artifact: unknown) => {
        const a: any = artifact || {};
        return {
            id: typeof a.id === 'string' && a.id ? a.id : `imported-cset-${Date.now()}`,
            name: String(a.name || 'Conjunto de constantes importado'),
            description: String(a.description || ''),
            constants: Array.isArray(a.constants) ? a.constants : [],
            importedFrom: a.marketplaceAssetId ? 'library' : 'file',
            authorId: typeof a.authorId === 'string' ? a.authorId : undefined,
            marketplaceAssetId: typeof a.marketplaceAssetId === 'string' ? a.marketplaceAssetId : undefined,
        };
    },
    applyImport: async (obj: unknown) => {
        try {
            if (!_isSetShape(obj)) return false;
            const set = obj as ConstantsSetShape;
            const { addUserConstant }: any = await import('../../core/constants/manager.js' as string);
            let added = 0;
            for (const c of set.constants) {
                try {
                    const res = addUserConstant(c);
                    if (res) added++;
                } catch (e: any) {
                    log.debug('skip constant:', c.name, e?.message || e);
                }
            }
            return added > 0;
        } catch (e: any) {
            log.error('applyImport failed:', e?.message || e);
            return false;
        }
    },
});

function _slug(s: unknown): string {
    return String(s || 'constants-set')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}

function _download(text: string, filename: string): void {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ----------------------------------------------------------------
// Export helpers
// ----------------------------------------------------------------

async function _loadConstants(): Promise<ConstantItem[] | null> {
    const { getUserConstants }: any = await import('../../core/constants/manager.js' as string);
    const constants = getUserConstants();
    if (!Array.isArray(constants) || constants.length === 0) {
        showToast(t('constantsSet.empty') || 'Sem constantes para exportar.', 'warning');
        return null;
    }
    return constants;
}

function _buildConstantsSet(name: string | undefined, constants: ConstantItem[]): ConstantsSetShape {
    const setName = name || `Constantes ${new Date().toISOString().slice(0, 10)}`;
    return {
        id: `cset-${Date.now()}`,
        name: setName,
        description: `${constants.length} constante(s) exportada(s)`,
        constants,
    };
}

async function _exportSetToLibrary(set: ConstantsSetShape, key: string, filename: string): Promise<{ ok: boolean; key: string; filename: string }> {
    const lib: any = await import('../report/_ecbtLibraryStore.js' as string);
    const ok = await lib.saveEcbtToLibrary({
        id: `cset-${_slug(set.id)}`,
        kind: 'constants_set',
        name: set.name,
        key,
    });
    showToast(
        ok
            ? t('ecbtLib.savedLibrary') || 'Salvo na Library ecbyts'
            : t('constantsSet.exportFailed') || 'Falha ao exportar',
        ok ? 'success' : 'error',
    );
    return { ok, key, filename };
}

function _downloadEcbt(key: string, filename: string): { ok: true; key: string; filename: string } {
    _download(key, filename);
    showToast(t('constantsSet.exported') || 'Conjunto de constantes salvo como .ecbt', 'success');
    return { ok: true, key, filename };
}

/**
 * Exporta TODAS as constantes do usuário atual como um único conjunto .ecbt.
 * Não há "set CRUD" — a unidade exportada é o snapshot atual.
 */
export async function exportConstantsSetEcbt(name?: string): Promise<{ ok: boolean; key?: string; filename?: string }> {
    try {
        const constants = await _loadConstants();
        if (!constants) return { ok: false };
        const set = _buildConstantsSet(name, constants);
        const pa: any = await import('../../core/io/portableArtifacts.js' as string);
        const lib: any = await import('../report/_ecbtLibraryStore.js' as string);
        const key = await pa.encodeArtifact('constants_set', set);
        const target = await lib.chooseEcbtTarget('export');
        if (!target) return { ok: false };
        const filename = `${_slug(set.name) || 'constants'}.ecbt`;
        if (target === 'library') {
            return _exportSetToLibrary(set, key, filename);
        }
        return _downloadEcbt(key, filename);
    } catch (e: any) {
        log.error('export constants set ecbt failed:', e?.message || e);
        showToast(t('constantsSet.exportFailed') || 'Falha ao exportar constantes.', 'error');
        return { ok: false };
    }
}

/** Importa um conjunto de constantes de chave .ecbt (chooser Library/local). */
export async function importConstantsSetEcbt(): Promise<{ ok: boolean }> {
    try {
        const lib: any = await import('../report/_ecbtLibraryStore.js' as string);
        const source = await lib.chooseEcbtTarget('import');
        if (!source) return { ok: false };
        if (source === 'library') {
            const entry = await lib.pickFromEcbtLibrary('constants_set');
            if (!entry?.key) return { ok: false };
            return _importKeyFlow(entry.key);
        }
        return _importFromFileFlow();
    } catch (e: any) {
        log.error('import constants set ecbt failed:', e?.message || e);
        showToast(t('constantsSet.importFailed') || 'Falha ao importar constantes.', 'error');
        return { ok: false };
    }
}

async function _importKeyFlow(key: string): Promise<{ ok: boolean }> {
    const pa: any = await import('../../core/io/portableArtifacts.js' as string);
    const ok = await pa.importArtifactKey(String(key || '').trim());
    showToast(
        ok
            ? t('constantsSet.imported') || 'Conjunto de constantes importado'
            : t('constantsSet.importNotSet') || 'Chave não contém um conjunto de constantes válido.',
        ok ? 'success' : 'error',
    );
    return { ok };
}

function _importFromFileFlow(): Promise<{ ok: boolean }> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.ecbt,text/plain';
        input.style.display = 'none';
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) {
                resolve({ ok: false });
                return;
            }
            try {
                const text = await file.text();
                resolve(await _importKeyFlow(text));
            } catch (e: any) {
                log.error('read constants set ecbt failed:', e?.message || e);
                showToast(t('constantsSet.importFailed') || 'Falha ao ler arquivo.', 'error');
                resolve({ ok: false });
            } finally {
                input.remove();
            }
        });
        document.body.appendChild(input);
        input.click();
    });
}

if (typeof window !== 'undefined') {
    (window as any).exportConstantsSetEcbt = exportConstantsSetEcbt;
    (window as any).importConstantsSetEcbt = importConstantsSetEcbt;
}
