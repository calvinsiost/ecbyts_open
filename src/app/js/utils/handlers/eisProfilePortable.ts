// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Kind portável `eis_profile` (perfis EIS customizados TCCCA+T) — P1-10 Fase A 6/6.
// Registra o handler no registry de artefatos (core/io/portableArtifacts) e expõe
// export/import de perfis EIS como chave .ecbt (Library ecbyts | local).
// Reusa core/eis/customScoreBuilder.validateTemplate + idbStore namespace dedicado
// 'ecbyts-eis-custom-profiles' (sem CRUD existente — este handler é o owner).
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
import { registerKind } from '../../core/io/portableArtifacts.js';
import { validateTemplate } from '../../core/eis/customScoreBuilder.js';
import { idbGet, idbSet } from '../storage/idbStore.js';

const log = createLogger('EisProfilePortable');

const IDB_KEY = 'ecbyts-eis-custom-profiles';

interface EisProfileShape {
    id: string;
    name: string;
    based_on?: string;
    owner_type?: string;
    owner_id?: string;
    status?: string;
    version?: number;
    axes?: unknown[];
    veto?: unknown;
    verdictThresholds?: unknown;
}

function _isProfileShape(o: any): boolean {
    if (!o || typeof o !== 'object') return false;
    if (typeof o.id !== 'string' || o.id.trim() === '') return false;
    if (typeof o.name !== 'string' || o.name.trim() === '') return false;
    return Array.isArray(o.axes) && o.axes.length > 0;
}

async function _listProfiles(): Promise<EisProfileShape[]> {
    const raw = await idbGet(IDB_KEY);
    return Array.isArray(raw) ? raw : [];
}

async function _saveProfile(profile: EisProfileShape): Promise<boolean> {
    const all = await _listProfiles();
    const idx = all.findIndex((p) => p.id === profile.id);
    if (idx >= 0) all[idx] = profile;
    else all.push(profile);
    return idbSet(IDB_KEY, all);
}

// Registra o kind `eis_profile` no boot deste módulo (idempotente).
registerKind({
    kind: 'eis_profile',
    schemaVersion: 1,
    validate: (payload: unknown) => {
        // Camada 1: shape mínimo (id+name+axes)
        if (!_isProfileShape(payload)) {
            return { valid: false, errors: ['Objeto não é um perfil EIS válido (requer id, name, axes[])'] };
        }
        // Camada 2: validação canônica via customScoreBuilder
        const v = validateTemplate(payload);
        return { valid: v.valid, errors: [...v.errors] };
    },
    toArtifact: (obj: unknown) => {
        const o: any = obj || {};
        return {
            id: String(o.id || ''),
            name: String(o.name || ''),
            based_on: typeof o.based_on === 'string' ? o.based_on : 'default',
            owner_type: typeof o.owner_type === 'string' ? o.owner_type : 'user',
            owner_id: typeof o.owner_id === 'string' ? o.owner_id : 'anonymous',
            status: typeof o.status === 'string' ? o.status : 'draft',
            version: typeof o.version === 'number' ? o.version : 1,
            axes: Array.isArray(o.axes) ? o.axes : [],
            veto: o.veto || { enabled: false, rules: [] },
            verdictThresholds: o.verdictThresholds || { green: 4.5, yellow: 3.5, red: 0 },
            // Provenance opcional
            authorId: typeof o.authorId === 'string' ? o.authorId : undefined,
            marketplaceAssetId: typeof o.marketplaceAssetId === 'string' ? o.marketplaceAssetId : undefined,
        };
    },
    fromArtifact: (artifact: unknown) => {
        const a: any = artifact || {};
        return {
            id: typeof a.id === 'string' && a.id ? a.id : `imported-eis-${Date.now()}`,
            name: String(a.name || 'Perfil EIS importado'),
            based_on: typeof a.based_on === 'string' ? a.based_on : 'default',
            owner_type: typeof a.owner_type === 'string' ? a.owner_type : 'user',
            owner_id: typeof a.owner_id === 'string' ? a.owner_id : 'anonymous',
            status: 'draft', // sempre força draft no import (não publicado)
            version: typeof a.version === 'number' ? a.version : 1,
            axes: Array.isArray(a.axes) ? a.axes : [],
            veto: a.veto || { enabled: false, rules: [] },
            verdictThresholds: a.verdictThresholds || { green: 4.5, yellow: 3.5, red: 0 },
            importedFrom: a.marketplaceAssetId ? 'library' : 'file',
            authorId: typeof a.authorId === 'string' ? a.authorId : undefined,
            marketplaceAssetId: typeof a.marketplaceAssetId === 'string' ? a.marketplaceAssetId : undefined,
        };
    },
    applyImport: async (obj: unknown) => {
        try {
            if (!_isProfileShape(obj)) return false;
            return await _saveProfile(obj as EisProfileShape);
        } catch (e: any) {
            log.error('applyImport failed:', e?.message || e);
            return false;
        }
    },
});

function _slug(s: unknown): string {
    return String(s || 'eis-profile')
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

/** Lista perfis EIS customizados persistidos (read-only helper). */
export async function getCustomEisProfiles(): Promise<EisProfileShape[]> {
    return _listProfiles();
}

/** Exporta um perfil EIS (por id) como chave .ecbt (chooser Library/local). */
export async function exportEisProfileEcbt(profileId: string): Promise<{ ok: boolean; key?: string; filename?: string }> {
    try {
        const all = await _listProfiles();
        const profile = all.find((p) => p.id === profileId);
        if (!profile) {
            showToast(t('eisProfile.notFound') || 'Perfil EIS não encontrado.', 'warning');
            return { ok: false };
        }
        const pa: any = await import('../../core/io/portableArtifacts.js' as string);
        const lib: any = await import('../report/_ecbtLibraryStore.js' as string);
        const key = await pa.encodeArtifact('eis_profile', profile);
        const target = await lib.chooseEcbtTarget('export');
        if (!target) return { ok: false };
        const name = profile.name || profile.id;
        const filename = `${_slug(name) || 'eis-profile'}.ecbt`;
        if (target === 'library') {
            const ok = await lib.saveEcbtToLibrary({
                id: `eis-${_slug(profile.id)}`,
                kind: 'eis_profile',
                name,
                key,
            });
            showToast(
                ok
                    ? t('ecbtLib.savedLibrary') || 'Salvo na Library ecbyts'
                    : t('eisProfile.exportFailed') || 'Falha ao exportar',
                ok ? 'success' : 'error',
            );
            return { ok, key, filename };
        }
        _download(key, filename);
        showToast(t('eisProfile.exported') || 'Perfil EIS salvo como .ecbt', 'success');
        return { ok: true, key, filename };
    } catch (e: any) {
        log.error('export eis profile ecbt failed:', e?.message || e);
        showToast(t('eisProfile.exportFailed') || 'Falha ao exportar perfil EIS.', 'error');
        return { ok: false };
    }
}

/** Importa um perfil EIS de chave .ecbt (chooser Library/local) → persiste em IDB. */
export async function importEisProfileEcbt(): Promise<{ ok: boolean; profileId?: string }> {
    try {
        const lib: any = await import('../report/_ecbtLibraryStore.js' as string);
        const source = await lib.chooseEcbtTarget('import');
        if (!source) return { ok: false };
        if (source === 'library') {
            const entry = await lib.pickFromEcbtLibrary('eis_profile');
            if (!entry?.key) return { ok: false };
            return _importKeyFlow(entry.key);
        }
        return _importFromFileFlow();
    } catch (e: any) {
        log.error('import eis profile ecbt failed:', e?.message || e);
        showToast(t('eisProfile.importFailed') || 'Falha ao importar perfil EIS.', 'error');
        return { ok: false };
    }
}

async function _importKeyFlow(key: string): Promise<{ ok: boolean; profileId?: string }> {
    const pa: any = await import('../../core/io/portableArtifacts.js' as string);
    const ok = await pa.importArtifactKey(String(key || '').trim());
    showToast(
        ok
            ? t('eisProfile.imported') || 'Perfil EIS importado'
            : t('eisProfile.importNotProfile') || 'Chave não contém um perfil EIS válido.',
        ok ? 'success' : 'error',
    );
    return { ok };
}

function _importFromFileFlow(): Promise<{ ok: boolean; profileId?: string }> {
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
                log.error('read eis profile ecbt failed:', e?.message || e);
                showToast(t('eisProfile.importFailed') || 'Falha ao ler arquivo.', 'error');
                resolve({ ok: false });
            } finally {
                input.remove();
            }
        });
        document.body.appendChild(input);
        input.click();
    });
}

/**
 * Wrapper para o botão "Salvar .ecbt" do painel EIS Custom: lê o profileId do
 * dropdown selecionado (`#eis-custom-template-select`) e dispara o export.
 * Toast informativo se nenhum perfil estiver selecionado.
 */
export async function exportEisProfileEcbtSelected(): Promise<{ ok: boolean }> {
    try {
        if (typeof document === 'undefined') return { ok: false };
        const sel = document.querySelector('#eis-custom-template-select') as HTMLSelectElement | null;
        const profileId = sel?.value || '';
        if (!profileId) {
            showToast(t('eisProfile.selectFirst') || 'Selecione um perfil EIS para exportar.', 'warning');
            return { ok: false };
        }
        const res = await exportEisProfileEcbt(profileId);
        return { ok: res.ok };
    } catch (e: any) {
        log.error('exportEisProfileEcbtSelected failed:', e?.message || e);
        return { ok: false };
    }
}

if (typeof window !== 'undefined') {
    (window as any).exportEisProfileEcbt = exportEisProfileEcbt;
    (window as any).exportEisProfileEcbtSelected = exportEisProfileEcbtSelected;
    (window as any).importEisProfileEcbt = importEisProfileEcbt;
    (window as any).getCustomEisProfiles = getCustomEisProfiles;
}
