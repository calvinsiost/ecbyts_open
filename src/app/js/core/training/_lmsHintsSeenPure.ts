// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   LMS HINTS SEEN (pure) — TRAINING-LMS-OPEN-001 T8.2
   ================================================================
   O painel de Treinamentos agrega as dicas de intenção (T8.1) já vistas
   para revisita: seção colapsada "Dicas que você já viu" na aba Aprender.

   Este módulo é PURO: normaliza a lista persistida (IDB, chave
   'ecbyts-lms-hints-seen') e decide o que renderizar — sem tocar
   DOM/IndexedDB. O call-site real (lmsManager.ts) lê/grava a store e passa
   arrays simples para dentro; trainingPanelRenderersView.ts consome
   `buildHintsSeenViewModel` para montar o HTML.
   ================================================================ */

/** Um registro persistido de "dica vista" (1 por módulo, a mais recente). */
export interface LmsHintSeenRecord {
    /** Módulo que disparou a dica (ex.: 'pipelines', 'datastudio'). */
    readonly moduleId: string;
    /** Label legível da lição sugerida (ex.: 'Fluxo GAC/DD-38'). */
    readonly lessonLabel: string;
    /** ISO timestamp de quando a dica foi vista pela 1ª vez. */
    readonly seenAt: string;
}

/** Um item pronto para render na seção "Dicas que você já viu". */
export interface LmsHintsSeenViewItem {
    readonly moduleId: string;
    readonly lessonLabel: string;
    readonly seenAt: string;
}

/** Resultado do cômputo: itens ordenados + se a seção deve aparecer. */
export interface LmsHintsSeenViewModel {
    readonly items: readonly LmsHintsSeenViewItem[];
    readonly hasItems: boolean;
}

function _isValidRecord(value: unknown): value is LmsHintSeenRecord {
    if (!value || typeof value !== 'object') return false;
    const rec = value as Record<string, unknown>;
    return typeof rec.moduleId === 'string' && rec.moduleId.length > 0 && typeof rec.lessonLabel === 'string';
}

/**
 * Normaliza a lista bruta persistida em IDB: descarta entradas inválidas,
 * deduplica por `moduleId` (mantém a mais recente por `seenAt`) e ordena da
 * mais recente para a mais antiga (a dica mais nova aparece primeiro).
 *
 * @param raw valor bruto lido de idbGet('ecbyts-lms-hints-seen') — pode ser
 *   `null`/`undefined`/qualquer coisa (nunca lança).
 */
export function normalizeHintsSeenList(raw: unknown): LmsHintSeenRecord[] {
    const list = Array.isArray(raw) ? raw : [];
    const byModule = new Map<string, LmsHintSeenRecord>();
    for (const entry of list) {
        if (!_isValidRecord(entry)) continue;
        const existing = byModule.get(entry.moduleId);
        const seenAt = typeof entry.seenAt === 'string' ? entry.seenAt : new Date(0).toISOString();
        if (!existing || new Date(seenAt).getTime() >= new Date(existing.seenAt).getTime()) {
            byModule.set(entry.moduleId, { moduleId: entry.moduleId, lessonLabel: entry.lessonLabel, seenAt });
        }
    }
    return Array.from(byModule.values()).sort(
        (a, b) => new Date(b.seenAt).getTime() - new Date(a.seenAt).getTime(),
    );
}

/**
 * Adiciona (ou atualiza) o registro de uma dica vista à lista já persistida,
 * pronta para regravar via idbSet. Pura: recebe a lista atual + o novo
 * registro, devolve a lista resultante (sem duplicar o módulo).
 */
export function upsertHintSeen(
    current: unknown,
    record: LmsHintSeenRecord,
): LmsHintSeenRecord[] {
    const normalized = normalizeHintsSeenList(current);
    const withoutModule = normalized.filter((item) => item.moduleId !== record.moduleId);
    return [record, ...withoutModule];
}

/**
 * Constrói o view-model consumido pelo render da seção "Dicas que você já
 * viu" — lista vazia esconde a seção (RF-8f: sem poluição por padrão).
 */
export function buildHintsSeenViewModel(raw: unknown): LmsHintsSeenViewModel {
    const items = normalizeHintsSeenList(raw);
    return { items, hasItems: items.length > 0 };
}

Object.freeze(normalizeHintsSeenList);
Object.freeze(upsertHintSeen);
Object.freeze(buildHintsSeenViewModel);
