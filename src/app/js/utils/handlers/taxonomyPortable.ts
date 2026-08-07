// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Kind portável `taxonomy` (dicionários de dados / taxonomias regulatórias) — P1-10.
// Registra o handler no registry de artefatos e expõe export/import de uma taxonomia
// como chave .ecbt (Library ecbyts | dispositivo local). Reusa core/taxonomy/manager
// (getTaxonomyById + registerTaxonomy) + encodeArtifact/decodeArtifact + _ecbtLibraryStore.
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
import { registerKind } from '../../core/io/portableArtifacts.js';

const log = createLogger('TaxonomyPortable');

/** Forma mínima de uma taxonomia: id + name (string). */
function _isTaxonomy(o: any): boolean {
    return !!o && typeof o === 'object' && typeof o.id === 'string' && o.id !== '' && typeof o.name === 'string';
}

// Registra o kind `taxonomy` no boot deste módulo (idempotente).
registerKind({
    kind: 'taxonomy',
    schemaVersion: 1,
    validate: (payload: unknown) =>
        _isTaxonomy(payload) ? { valid: true, errors: [] } : { valid: false, errors: ['Objeto não é uma taxonomia válida (id+name)'] },
    toArtifact: (obj: unknown) => {
        // Remove o metadado interno _libraryId antes de exportar.
        if (obj && typeof obj === 'object') {
            const { _libraryId, ...rest } = obj as any;
            return rest;
        }
        return obj;
    },
    fromArtifact: (artifact: unknown) => artifact,
    applyImport: async (obj: unknown) => {
        if (!_isTaxonomy(obj)) return false;
        const { registerTaxonomy }: any = await import('../../core/taxonomy/manager.js' as string);
        return registerTaxonomy(obj, 'imported-ecbt') === true;
    },
});

function _slug(s: unknown): string {
    return String(s || 'taxonomy')
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

/** Exporta uma taxonomia (por id) como .ecbt — pergunta destino (Library | local). */
export async function exportTaxonomyEcbt(taxonomyId: string): Promise<boolean> {
    try {
        const [{ getTaxonomyById }, pa, lib]: any = await Promise.all([
            import('../../core/taxonomy/manager.js' as string),
            import('../../core/io/portableArtifacts.js' as string),
            import('../report/_ecbtLibraryStore.js' as string),
        ]);
        const tax = getTaxonomyById(taxonomyId);
        if (!tax) {
            showToast(t('taxPortable.notFound') || 'Taxonomia não encontrada.', 'warning');
            return false;
        }
        const key = await pa.encodeArtifact('taxonomy', tax);
        const target = await lib.chooseEcbtTarget('export');
        if (!target) return false;
        const name = tax.name || tax.id;
        if (target === 'library') {
            const ok = await lib.saveEcbtToLibrary({ id: `taxonomy-${_slug(tax.id)}`, kind: 'taxonomy', name, key });
            showToast(ok ? (t('ecbtLib.savedLibrary') || 'Salvo na Library ecbyts') : (t('taxPortable.exportFailed') || 'Falha'), ok ? 'success' : 'error');
            return ok;
        }
        _download(key, `${_slug(name) || 'taxonomy'}.ecbt`);
        showToast(t('taxPortable.exported') || 'Taxonomia salva como .ecbt', 'success');
        return true;
    } catch (e: any) {
        log.error('export taxonomy ecbt failed:', e?.message || e);
        showToast(t('taxPortable.exportFailed') || 'Falha ao exportar a taxonomia.', 'error');
        return false;
    }
}

/** Importa uma taxonomia de uma chave .ecbt — pergunta origem (Library | local). */
export async function importTaxonomyEcbt(): Promise<void> {
    const lib: any = await import('../report/_ecbtLibraryStore.js' as string);
    const source = await lib.chooseEcbtTarget('import');
    if (!source) return;
    if (source === 'library') {
        const entry = await lib.pickFromEcbtLibrary('taxonomy');
        if (entry?.key) await _importKey(entry.key);
        return;
    }
    _importFromFile();
}

async function _importKey(key: string): Promise<void> {
    try {
        const pa: any = await import('../../core/io/portableArtifacts.js' as string);
        const ok = await pa.importArtifactKey(String(key || '').trim());
        showToast(
            ok ? (t('taxPortable.imported') || 'Taxonomia importada') : (t('taxPortable.importNotTaxonomy') || 'Esta chave não contém uma taxonomia válida.'),
            ok ? 'success' : 'error',
        );
        if (ok && typeof (window as any).openTaxonomyPicker === 'function') {
            (window as any).openTaxonomyPicker();
        }
    } catch (e: any) {
        log.error('import taxonomy ecbt failed:', e?.message || e);
        showToast(t('taxPortable.importFailed') || 'Falha ao importar a taxonomia.', 'error');
    }
}

function _importFromFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ecbt,text/plain';
    input.style.display = 'none';
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
            await _importKey(await file.text());
        } catch (e: any) {
            log.error('read taxonomy .ecbt failed:', e?.message || e);
            showToast(t('taxPortable.importFailed') || 'Falha ao ler o arquivo.', 'error');
        } finally {
            input.remove();
        }
    });
    document.body.appendChild(input);
    input.click();
}

if (typeof window !== 'undefined') {
    (window as any).exportTaxonomyEcbt = exportTaxonomyEcbt;
    (window as any).importTaxonomyEcbt = importTaxonomyEcbt;
}
