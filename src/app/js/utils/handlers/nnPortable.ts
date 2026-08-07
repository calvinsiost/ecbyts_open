// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Kind portável `nn_network` (redes neurais treinadas do ML Studio) — P1-10.
// Registra o handler no registry de artefatos e expõe export/import de uma rede
// neural como chave .ecbt (Library ecbyts | dispositivo local). Reusa
// core/nn/manager (exportNetwork + importNetwork) + o codec de artefatos.
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
import { registerKind } from '../../core/io/portableArtifacts.js';

const log = createLogger('NnPortable');

/** Forma mínima de um payload de rede: { config: { inputSize, outputSize } }. */
function _isNetworkPayload(o: any): boolean {
    return (
        !!o &&
        typeof o === 'object' &&
        !!o.config &&
        typeof o.config === 'object' &&
        typeof o.config.inputSize === 'number' &&
        typeof o.config.outputSize === 'number'
    );
}

// Registra o kind `nn_network` no boot deste módulo (idempotente).
registerKind({
    kind: 'nn_network',
    schemaVersion: 1,
    validate: (payload: unknown) =>
        _isNetworkPayload(payload)
            ? { valid: true, errors: [] }
            : { valid: false, errors: ['Objeto não é uma rede neural portável válida (config.inputSize/outputSize)'] },
    toArtifact: (obj: unknown) => obj,
    fromArtifact: (artifact: unknown) => artifact,
    applyImport: async (obj: unknown) => {
        if (!_isNetworkPayload(obj)) return false;
        const mgr: any = await import('../../core/nn/manager.js' as string);
        const res = await mgr.importNetwork(obj);
        return !!res?.ok;
    },
});

function _slug(s: unknown): string {
    return String(s || 'nn-network')
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

/** Exporta uma rede neural (por id) como .ecbt — pergunta destino (Library | local). */
export async function exportNnNetworkEcbt(networkId: string): Promise<boolean> {
    try {
        const [mgr, pa, lib]: any = await Promise.all([
            import('../../core/nn/manager.js' as string),
            import('../../core/io/portableArtifacts.js' as string),
            import('../report/_ecbtLibraryStore.js' as string),
        ]);
        // LOADING-PERF GAP-2: garante o registry restaurado do IDB antes de exportar.
        await mgr.ensureNN?.();
        const payload = mgr.exportNetwork(networkId);
        if (!payload) {
            showToast(t('nnPortable.notFound') || 'Rede neural não encontrada.', 'warning');
            return false;
        }
        const key = await pa.encodeArtifact('nn_network', payload);
        const target = await lib.chooseEcbtTarget('export');
        if (!target) return false;
        const name = (payload.metadata && payload.metadata.description) || networkId;
        if (target === 'library') {
            const ok = await lib.saveEcbtToLibrary({ id: `nn-${_slug(networkId)}`, kind: 'nn_network', name, key });
            showToast(
                ok ? (t('ecbtLib.savedLibrary') || 'Salvo na Library ecbyts') : (t('nnPortable.exportFailed') || 'Falha'),
                ok ? 'success' : 'error',
            );
            return ok;
        }
        _download(key, `${_slug(networkId) || 'nn-network'}.ecbt`);
        showToast(t('nnPortable.exported') || 'Rede neural salva como .ecbt', 'success');
        return true;
    } catch (e: any) {
        log.error('export nn ecbt failed:', e?.message || e);
        showToast(t('nnPortable.exportFailed') || 'Falha ao exportar a rede neural.', 'error');
        return false;
    }
}

/**
 * Importa uma rede neural de uma chave .ecbt — pergunta origem (Library | local).
 * @returns id da rede importada (para auto-seleção no painel) ou null.
 */
export async function importNnNetworkEcbt(): Promise<string | null> {
    const lib: any = await import('../report/_ecbtLibraryStore.js' as string);
    const source = await lib.chooseEcbtTarget('import');
    if (!source) return null;
    if (source === 'library') {
        const entry = await lib.pickFromEcbtLibrary('nn_network');
        if (entry?.key) return _importKey(entry.key);
        return null;
    }
    return _importFromFile();
}

async function _importKey(key: string): Promise<string | null> {
    try {
        const [pa, mgr]: any = await Promise.all([
            import('../../core/io/portableArtifacts.js' as string),
            import('../../core/nn/manager.js' as string),
        ]);
        const res = await pa.decodeArtifact(String(key || '').trim());
        if (!res || res.kind !== 'nn_network') {
            showToast(t('nnPortable.importNotNetwork') || 'Esta chave não contém uma rede neural válida.', 'error');
            return null;
        }
        // LOADING-PERF GAP-2: garante o registry carregado antes de mesclar a rede
        // importada (evita corrida com o warm-up pós-shell sobrescrevendo _instances).
        await mgr.ensureNN?.();
        const out = await mgr.importNetwork(res.obj);
        if (!out?.ok) {
            showToast(t('nnPortable.importFailed') || 'Falha ao importar a rede neural.', 'error');
            return null;
        }
        showToast(t('nnPortable.imported') || 'Rede neural importada', 'success');
        return out.id || null;
    } catch (e: any) {
        log.error('import nn ecbt failed:', e?.message || e);
        showToast(t('nnPortable.importFailed') || 'Falha ao importar a rede neural.', 'error');
        return null;
    }
}

function _importFromFile(): Promise<string | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.ecbt,text/plain';
        input.style.display = 'none';
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) {
                resolve(null);
                return;
            }
            try {
                resolve(await _importKey(await file.text()));
            } catch (e: any) {
                log.error('read nn .ecbt failed:', e?.message || e);
                showToast(t('nnPortable.importFailed') || 'Falha ao ler o arquivo.', 'error');
                resolve(null);
            } finally {
                input.remove();
            }
        });
        document.body.appendChild(input);
        input.click();
    });
}

if (typeof window !== 'undefined') {
    (window as any).exportNnNetworkEcbt = exportNnNetworkEcbt;
    (window as any).importNnNetworkEcbt = importNnNetworkEcbt;
}
