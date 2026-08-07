// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// ECBT key library store + destino/origem chooser (Library ecbyts vs dispositivo local).
// "Library do ecbyts" = coleção persistente offline-first (IndexedDB, mesma camada que
// knowledgeSync usa p/ cache); sync Supabase cloud é Fase 2. Local = arquivo .ecbt no disco.
import { t } from '../i18n/translations.js';
import { idbGet, idbSet } from '../storage/idbStore.js';
import { escapeHtml } from '../helpers/html.js';

const LIBRARY_KEY = 'ecbyts-ecbt-library';

export type EcbtLibraryEntry = {
    id: string;
    /** Kind do artefato (report/report_template/csm/nn_network/…). Genérico desde P1-10. */
    kind: string;
    name: string;
    key: string;
    savedAt: string;
};

/** 'library' | 'local' | null (cancelado). Pergunta destino/origem ao usuário. */
export async function chooseEcbtTarget(action: 'export' | 'import'): Promise<'library' | 'local' | null> {
    const { asyncConfirm } = await import('../ui/asyncDialogs.js' as string);
    const msg =
        action === 'export'
            ? t('ecbtLib.exportWhere') || 'Onde deseja salvar a chave .ecbt?'
            : t('ecbtLib.importWhere') || 'De onde deseja importar a chave .ecbt?';
    const choice = await asyncConfirm(msg, {
        confirmLabel: t('ecbtLib.library') || 'Library ecbyts',
        cancelLabel: t('ecbtLib.local') || 'Dispositivo local',
    });
    // asyncConfirm: confirm(true)=Library, cancel(false)=Local. (Escape→Local, aceitável)
    return choice ? 'library' : 'local';
}

export async function saveEcbtToLibrary(entry: Omit<EcbtLibraryEntry, 'savedAt'>): Promise<boolean> {
    if (!entry || !entry.id || !entry.key) return false;
    const list: EcbtLibraryEntry[] = (await idbGet(LIBRARY_KEY)) || [];
    const arr = Array.isArray(list) ? list : [];
    const savedAt = new Date().toISOString();
    const idx = arr.findIndex((e) => e.id === entry.id);
    const toSave: EcbtLibraryEntry = {
        id: String(entry.id),
        kind: String(entry.kind || 'report'),
        name: String(entry.name || entry.id),
        key: String(entry.key),
        savedAt,
    };
    if (idx >= 0) arr[idx] = toSave;
    else arr.push(toSave);
    await idbSet(LIBRARY_KEY, arr);
    return true;
}

export async function listEcbtLibrary(kind?: string): Promise<EcbtLibraryEntry[]> {
    const list: EcbtLibraryEntry[] = (await idbGet(LIBRARY_KEY)) || [];
    const arr = Array.isArray(list) ? list : [];
    return kind ? arr.filter((e) => e.kind === kind) : arr;
}

export async function deleteEcbtFromLibrary(id: string): Promise<boolean> {
    const list: EcbtLibraryEntry[] = (await idbGet(LIBRARY_KEY)) || [];
    const arr = Array.isArray(list) ? list : [];
    const filtered = arr.filter((e) => e.id !== id);
    if (filtered.length === arr.length) return false;
    await idbSet(LIBRARY_KEY, filtered);
    return true;
}

/** Picker overlay para selecionar uma entrada salva na Library. Retorna a entrada ou null. */
export async function pickFromEcbtLibrary(kind?: string): Promise<EcbtLibraryEntry | null> {
    const entries = await listEcbtLibrary(kind);
    if (entries.length === 0) {
        const { showToast } = await import('../ui/toast.js' as string);
        showToast(t('ecbtLib.empty') || 'Nenhuma chave .ecbt salva na Library', 'info');
        return null;
    }
    return new Promise<EcbtLibraryEntry | null>((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'async-dialog-overlay ecbt-lib-picker';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        const rows = entries
            .map(
                (e) => `
            <li class="ecbt-lib-row" data-id="${escapeHtml(e.id)}">
                <button type="button" class="ecbt-lib-pick" data-id="${escapeHtml(e.id)}">
                    <span class="ecbt-lib-name">${escapeHtml(e.name)}</span>
                    <span class="ecbt-lib-meta">${escapeHtml((e.savedAt || '').slice(0, 16).replace('T', ' '))}</span>
                </button>
                <button type="button" class="ecbt-lib-del" data-id="${escapeHtml(e.id)}" title="${escapeHtml(t('delete') || 'Excluir')}" aria-label="${escapeHtml(t('delete') || 'Excluir')}">&#10005;</button>
            </li>`,
            )
            .join('');
        overlay.innerHTML = `
            <div class="async-dialog ecbt-lib-dialog">
                <div class="async-dialog-body">
                    <p class="async-dialog-message">${escapeHtml(t('ecbtLib.pickTitle') || 'Selecione uma chave salva na Library')}</p>
                    <ul class="ecbt-lib-list">${rows}</ul>
                </div>
                <div class="async-dialog-actions">
                    <button type="button" class="async-dialog-btn async-dialog-btn--cancel">${escapeHtml(t('cancel') || 'Cancelar')}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const close = (result: EcbtLibraryEntry | null) => {
            overlay.remove();
            document.removeEventListener('keydown', onKey);
            resolve(result);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close(null);
        };
        document.addEventListener('keydown', onKey);
        overlay.addEventListener('click', (e: any) => {
            if (e.target === overlay) return close(null);
            const pick = e.target.closest?.('.ecbt-lib-pick');
            if (pick) {
                const found = entries.find((x) => x.id === pick.getAttribute('data-id'));
                return close(found || null);
            }
            const del = e.target.closest?.('.ecbt-lib-del');
            if (del) {
                const id = del.getAttribute('data-id');
                deleteEcbtFromLibrary(id).then(() => {
                    del.closest('.ecbt-lib-row')?.remove();
                    if (!overlay.querySelector('.ecbt-lib-row')) close(null);
                });
            }
        });
        overlay.querySelector('.async-dialog-btn--cancel')?.addEventListener('click', () => close(null));
    });
}
