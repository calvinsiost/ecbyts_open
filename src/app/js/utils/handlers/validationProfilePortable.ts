// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Kind portável `validation_profile` (perfis de validação CONAMA/CETESB) — P1-10.
// Registra o handler no registry de artefatos (core/io/portableArtifacts) e expõe
// export/import de um perfil de validação como chave .ecbt (Library ecbyts | local).
// Reusa core/validation/profileEngine + encodeArtifact/decodeArtifact + _ecbtLibraryStore.
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
import { registerKind } from '../../core/io/portableArtifacts.js';

const log = createLogger('ValidationProfilePortable');

/** Forma mínima de um perfil de validação: id + name (string). */
function _isProfile(o: any): boolean {
    return !!o && typeof o === 'object' && typeof o.id === 'string' && o.id !== '' && typeof o.name === 'string';
}

// Registra o kind `validation_profile` no boot deste módulo (idempotente).
registerKind({
    kind: 'validation_profile',
    schemaVersion: 1,
    validate: (payload: unknown) =>
        _isProfile(payload) ? { valid: true, errors: [] } : { valid: false, errors: ['Objeto não é um perfil de validação válido (id+name)'] },
    toArtifact: (obj: unknown) => obj, // perfil já é JSON serializável
    fromArtifact: (artifact: unknown) => artifact,
    applyImport: async (obj: unknown) => {
        if (!_isProfile(obj)) return false;
        const { saveCustomProfile }: any = await import('../../core/validation/profileEngine.js' as string);
        const saved = await saveCustomProfile(obj);
        return !!saved;
    },
});

function _slug(s: unknown): string {
    return String(s || 'profile')
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

/** Exporta um perfil de validação (por id) como .ecbt — pergunta destino (Library | local). */
export async function exportValidationProfileEcbt(profileId: string): Promise<boolean> {
    try {
        const [{ getValidationProfile }, pa, lib]: any = await Promise.all([
            import('../../core/validation/profileEngine.js' as string),
            import('../../core/io/portableArtifacts.js' as string),
            import('../report/_ecbtLibraryStore.js' as string),
        ]);
        const profile = await getValidationProfile(profileId);
        if (!profile) {
            showToast(t('valProfile.notFound') || 'Perfil de validação não encontrado.', 'warning');
            return false;
        }
        const key = await pa.encodeArtifact('validation_profile', profile);
        const target = await lib.chooseEcbtTarget('export');
        if (!target) return false;
        const name = profile.name || profile.id;
        if (target === 'library') {
            const ok = await lib.saveEcbtToLibrary({ id: `valprofile-${_slug(profile.id)}`, kind: 'validation_profile', name, key });
            showToast(ok ? (t('ecbtLib.savedLibrary') || 'Salvo na Library ecbyts') : (t('valProfile.exportFailed') || 'Falha'), ok ? 'success' : 'error');
            return ok;
        }
        _download(key, `${_slug(name) || 'profile'}.ecbt`);
        showToast(t('valProfile.exported') || 'Perfil salvo como .ecbt', 'success');
        return true;
    } catch (e: any) {
        log.error('export validation profile ecbt failed:', e?.message || e);
        showToast(t('valProfile.exportFailed') || 'Falha ao exportar o perfil de validação.', 'error');
        return false;
    }
}

/** Importa um perfil de validação de uma chave .ecbt — pergunta origem (Library | local). */
export async function importValidationProfileEcbt(): Promise<void> {
    const lib: any = await import('../report/_ecbtLibraryStore.js' as string);
    const source = await lib.chooseEcbtTarget('import');
    if (!source) return;
    if (source === 'library') {
        const entry = await lib.pickFromEcbtLibrary('validation_profile');
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
            ok ? (t('valProfile.imported') || 'Perfil de validação importado') : (t('valProfile.importNotProfile') || 'Esta chave não contém um perfil de validação válido.'),
            ok ? 'success' : 'error',
        );
    } catch (e: any) {
        log.error('import validation profile ecbt failed:', e?.message || e);
        showToast(t('valProfile.importFailed') || 'Falha ao importar o perfil de validação.', 'error');
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
            log.error('read validation profile .ecbt failed:', e?.message || e);
            showToast(t('valProfile.importFailed') || 'Falha ao ler o arquivo.', 'error');
        } finally {
            input.remove();
        }
    });
    document.body.appendChild(input);
    input.click();
}

if (typeof window !== 'undefined') {
    (window as any).exportValidationProfileEcbt = exportValidationProfileEcbt;
    (window as any).importValidationProfileEcbt = importValidationProfileEcbt;
}
