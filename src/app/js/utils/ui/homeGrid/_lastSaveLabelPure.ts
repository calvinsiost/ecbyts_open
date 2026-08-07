// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 (stats slice — lógica pura) — formatação PURA do
 * rótulo "último salvamento" do card de estatísticas da home. claude (refactor)
 * 2026-06-19.
 *
 * EN: Pure relative-time formatter for the home "last save" stat card. The
 *     `_getLastSave()` helper in homeGrid.ts mixed I/O (localStorage read,
 *     `Date.now()`) with a deterministic bucketing of an elapsed interval into a
 *     human-readable label. This module isolates the deterministic part so the
 *     barrel only does the I/O. Behaviour is IDENTICAL to the legacy inline
 *     block, quirk for quirk:
 *       - missing/empty timestamp           → `never` label;
 *       - unparseable date (`isNaN(time)`)  → `never` label;
 *       - elapsed < 1 minute                → `justNow` label;
 *       - elapsed < 60 minutes              → `${minutes}min`;
 *       - elapsed < 24 hours                → `${hours}h`;
 *       - otherwise                         → `${days}d`.
 *     Every threshold uses `Math.floor` and the same strict `<` comparisons as
 *     the legacy code. Negative elapsed (a future timestamp) floors to 0 → < 1 →
 *     `justNow`, exactly as the original `Math.floor(diff / 60000) < 1` branch.
 *
 * PT (leigo): transforma, sem tela nem relógio do sistema, uma data de
 *     salvamento num texto curto que a pessoa entende:
 *       - sem data ou data inválida → "Never saved";
 *       - menos de 1 minuto         → "Just now";
 *       - menos de 1 hora           → "Nmin" (ex.: "12min");
 *       - menos de 1 dia            → "Nh" (ex.: "3h");
 *       - mais que isso             → "Nd" (ex.: "2d").
 *     Quem lê a data do navegador (localStorage) e pega a hora atual continua
 *     sendo o homeGrid; aqui só decidimos o texto. É a MESMA lógica que estava
 *     embutida no monolito, agora isolada e testável.
 *
 * Pure: entradas → string determinística. Cheap tests:
 * tests/ui/homeGrid/last-save-label.test.mjs.
 */

/** Rótulos i18n já resolvidos pelo chamador (sem chamar `t()` aqui dentro). */
export interface LastSaveLabels {
    /** Rótulo para "nunca salvo" / data ausente / data inválida. */
    readonly never: string;
    /** Rótulo para "agora mesmo" (menos de 1 minuto). */
    readonly justNow: string;
}

/** Entrada da formatação (tudo já lido pelo chamador, sem efeitos). */
export interface LastSaveInput {
    /**
     * Timestamp do último salvamento como string (igual ao valor cru de
     * `localStorage.getItem('ecbyts-last-save')`). `null`/`undefined`/`''`
     * significam "sem data".
     */
    readonly timestamp: string | null | undefined;
    /** "Agora" em ms (injetado para determinismo nos testes). */
    readonly now: number;
    /** Rótulos i18n já resolvidos. */
    readonly labels: LastSaveLabels;
}

/**
 * Formata o rótulo de "último salvamento" — espelha exatamente o corpo do
 * `_getLastSave()` legado (mesmos thresholds, mesmos `Math.floor`, mesmo
 * fallback `never`).
 *
 * @param {LastSaveInput} input timestamp + agora + rótulos
 * @returns {string} rótulo amigável
 */
export function formatLastSaveLabel(input: LastSaveInput): string {
    const { timestamp, now, labels } = input;
    const never = labels.never;

    // Sem data → never. Espelha `if (!ts) return never;` (falsy: '' /null/undefined).
    if (!timestamp) return never;

    const parsed = new Date(timestamp);
    // Data inválida → never. Espelha `if (isNaN(d.getTime())) return never;`.
    if (isNaN(parsed.getTime())) return never;

    const diff = now - parsed.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return labels.justNow;
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}
