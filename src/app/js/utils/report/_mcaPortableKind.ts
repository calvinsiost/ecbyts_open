// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Kind portável `csm` (Modelo Conceitual da Área) — bridge P1-10×P1-11.
// Registra o handler csm no registry de artefatos portáveis (core/io/portableArtifacts)
// e expõe export/import do MCA como chave .ecbt com escolha Library ecbyts / local.
// Reusa core/mca (_csmPure), o codec (encodeArtifact/decodeArtifact) e _ecbtLibraryStore.
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
import { registerKind } from '../../core/io/portableArtifacts.js';
import {
    buildCsmFromElements,
    // eslint-disable-next-line
    buildMcaSectionHtml,
    type Csm,
} from '../../core/mca/_csmPure.js';

const log = createLogger('McaPortableKind');

/** True se o objeto tem a forma de um CSM (sources/receptors/linkages + confidence). */
function _isCsm(o: any): boolean {
    return !!o && typeof o === 'object' && Array.isArray(o.sources) && Array.isArray(o.receptors) && Array.isArray(o.linkages) && typeof o.confidence === 'string';
}

// Registra o kind `csm` no boot deste módulo (idempotente — registerKind sobrescreve).
registerKind({
    kind: 'csm',
    schemaVersion: 1,
    validate: (payload: unknown) =>
        _isCsm(payload) ? { valid: true, errors: [] } : { valid: false, errors: ['Objeto não é um MCA/CSM válido'] },
    toArtifact: (obj: unknown) => obj, // CSM já é serializável (JSON puro)
    fromArtifact: (artifact: unknown) => artifact,
    applyImport: async (obj: unknown) => {
        if (!_isCsm(obj)) return false;
        const { insertCsmIntoReport }: any = await import('./_mcaInsert.js' as string);
        return insertCsmIntoReport(obj as Csm);
    },
});

function _slug(s: unknown): string {
    return String(s || 'mca')
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

/** Constrói o MCA do modelo atual e exporta como .ecbt — pergunta destino (Library | local). */
export async function exportMcaEcbt(): Promise<boolean> {
    try {
        const [{ getAllElements }, pa, lib]: any = await Promise.all([
            import('../../core/elements/manager.js' as string),
            import('../../core/io/portableArtifacts.js' as string),
            import('./_ecbtLibraryStore.js' as string),
        ]);
        const els = (typeof getAllElements === 'function' && getAllElements()) || [];
        const model = buildCsmFromElements(els, new Date().toISOString());
        if (model.sources.length === 0 && model.receptors.length === 0) {
            showToast(t('mca.empty') || 'Adicione fontes e/ou receptores ao modelo antes de gerar o MCA.', 'warning');
            return false;
        }
        const key = await pa.encodeArtifact('csm', model);
        const target = await lib.chooseEcbtTarget('export');
        if (!target) return false;
        const name = `MCA ${model.version} (${model.sources.length}F/${model.receptors.length}R)`;
        if (target === 'library') {
            const ok = await lib.saveEcbtToLibrary({ id: `csm-${_slug(name) || 'mca'}`, kind: 'csm', name, key });
            showToast(ok ? (t('ecbtLib.savedLibrary') || 'Salvo na Library ecbyts') : (t('mca.exportFailed') || 'Falha'), ok ? 'success' : 'error');
            return ok;
        }
        _download(key, `${_slug(name) || 'mca'}.ecbt`);
        showToast(t('mca.exported') || 'MCA salvo como .ecbt', 'success');
        return true;
    } catch (e: any) {
        log.error('export MCA ecbt failed:', e?.message || e);
        showToast(t('mca.exportFailed') || 'Falha ao exportar o MCA.', 'error');
        return false;
    }
}

/** Importa um MCA de uma chave .ecbt (kind csm) — pergunta origem (Library | local). */
export async function importMcaEcbt(): Promise<void> {
    const lib: any = await import('./_ecbtLibraryStore.js' as string);
    const source = await lib.chooseEcbtTarget('import');
    if (!source) return;
    if (source === 'library') {
        const entry = await lib.pickFromEcbtLibrary('csm');
        if (entry?.key) await _importKey(entry.key);
        return;
    }
    _importFromFile();
}

async function _importKey(key: string): Promise<void> {
    try {
        const pa: any = await import('../../core/io/portableArtifacts.js' as string);
        const ok = await pa.importArtifactKey(String(key || '').trim());
        if (!ok) showToast(t('mca.importNotCsm') || 'Esta chave não contém um MCA válido.', 'error');
    } catch (e: any) {
        log.error('import MCA ecbt failed:', e?.message || e);
        showToast(t('mca.importFailed') || 'Falha ao importar o MCA.', 'error');
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
            log.error('read MCA .ecbt failed:', e?.message || e);
            showToast(t('mca.importFailed') || 'Falha ao ler o arquivo.', 'error');
        } finally {
            input.remove();
        }
    });
    document.body.appendChild(input);
    input.click();
}

if (typeof window !== 'undefined') {
    (window as any).exportMcaEcbt = exportMcaEcbt;
    (window as any).importMcaEcbt = importMcaEcbt;
}
