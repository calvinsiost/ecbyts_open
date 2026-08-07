// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Kind portável `symbology_profile` (perfis de simbologia) — P1-10.
// Registra o handler no registry de artefatos e expõe export/import de um perfil de
// simbologia como chave .ecbt (Library ecbyts | dispositivo local). Reusa
// core/symbology/manager (getProfiles + createProfile + saveProfiles) + o codec.
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
import { registerKind } from '../../core/io/portableArtifacts.js';

const log = createLogger('SymbologyPortable');

/** Forma mínima de um perfil de simbologia: id + name (string). */
function _isProfile(o: any): boolean {
    return !!o && typeof o === 'object' && typeof o.id === 'string' && o.id !== '' && typeof o.name === 'string';
}

// Registra o kind `symbology_profile` no boot deste módulo (idempotente).
registerKind({
    kind: 'symbology_profile',
    schemaVersion: 1,
    validate: (payload: unknown) =>
        _isProfile(payload) ? { valid: true, errors: [] } : { valid: false, errors: ['Objeto não é um perfil de simbologia válido (id+name)'] },
    toArtifact: (obj: unknown) => obj,
    fromArtifact: (artifact: unknown) => artifact,
    applyImport: async (obj: unknown) => {
        if (!_isProfile(obj)) return false;
        const sym: any = await import('../../core/symbology/manager.js' as string);
        // createProfile cria um shell (novo id) + push em _profiles; copiamos os dados do
        // perfil importado mantendo o novo id, e persistimos via saveProfiles.
        const created = sym.createProfile((obj as any).name || 'Perfil importado');
        const src = obj as any;
        if (src.elements) created.elements = src.elements;
        if (src.labels) created.labels = src.labels;
        if (src.surfaces) created.surfaces = src.surfaces;
        if (Array.isArray(src.rules)) created.rules = src.rules;
        if (src.scene) created.scene = src.scene;
        sym.saveProfiles?.();
        return true;
    },
});

function _slug(s: unknown): string {
    return String(s || 'symbology')
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

/** Exporta um perfil de simbologia (por id) como .ecbt — pergunta destino (Library | local). */
export async function exportSymbologyProfileEcbt(profileId: string): Promise<boolean> {
    try {
        const [sym, pa, lib]: any = await Promise.all([
            import('../../core/symbology/manager.js' as string),
            import('../../core/io/portableArtifacts.js' as string),
            import('../report/_ecbtLibraryStore.js' as string),
        ]);
        const profile = (sym.getProfiles() || []).find((p: any) => p.id === profileId);
        if (!profile) {
            showToast(t('symPortable.notFound') || 'Perfil de simbologia não encontrado.', 'warning');
            return false;
        }
        const key = await pa.encodeArtifact('symbology_profile', profile);
        const target = await lib.chooseEcbtTarget('export');
        if (!target) return false;
        const name = profile.name || profile.id;
        if (target === 'library') {
            const ok = await lib.saveEcbtToLibrary({ id: `symbology-${_slug(profile.id)}`, kind: 'symbology_profile', name, key });
            showToast(ok ? (t('ecbtLib.savedLibrary') || 'Salvo na Library ecbyts') : (t('symPortable.exportFailed') || 'Falha'), ok ? 'success' : 'error');
            return ok;
        }
        _download(key, `${_slug(name) || 'symbology'}.ecbt`);
        showToast(t('symPortable.exported') || 'Perfil de simbologia salvo como .ecbt', 'success');
        return true;
    } catch (e: any) {
        log.error('export symbology ecbt failed:', e?.message || e);
        showToast(t('symPortable.exportFailed') || 'Falha ao exportar o perfil de simbologia.', 'error');
        return false;
    }
}

/** Importa um perfil de simbologia de uma chave .ecbt — pergunta origem (Library | local). */
export async function importSymbologyProfileEcbt(): Promise<void> {
    const lib: any = await import('../report/_ecbtLibraryStore.js' as string);
    const source = await lib.chooseEcbtTarget('import');
    if (!source) return;
    if (source === 'library') {
        const entry = await lib.pickFromEcbtLibrary('symbology_profile');
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
            ok ? (t('symPortable.imported') || 'Perfil de simbologia importado') : (t('symPortable.importNotProfile') || 'Esta chave não contém um perfil de simbologia válido.'),
            ok ? 'success' : 'error',
        );
        if (ok && typeof (window as any).openSymbologyEditor === 'function') {
            (window as any).openSymbologyEditor();
        }
    } catch (e: any) {
        log.error('import symbology ecbt failed:', e?.message || e);
        showToast(t('symPortable.importFailed') || 'Falha ao importar o perfil de simbologia.', 'error');
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
            log.error('read symbology .ecbt failed:', e?.message || e);
            showToast(t('symPortable.importFailed') || 'Falha ao ler o arquivo.', 'error');
        } finally {
            input.remove();
        }
    });
    document.body.appendChild(input);
    input.click();
}

if (typeof window !== 'undefined') {
    (window as any).exportSymbologyProfileEcbt = exportSymbologyProfileEcbt;
    (window as any).importSymbologyProfileEcbt = importSymbologyProfileEcbt;
}
