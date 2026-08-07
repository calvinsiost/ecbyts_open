// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure helpers (DOM-free) extraídos do figureEditModal para teste isolado.
// Calvin pediu (rating action #1, 2026-06-02) cobertura unit dos pure helpers
// como ação de maior impacto na nota composite (test coverage 55→80).
//
// NÃO importa DOM/Three/IDB/rede — apenas parsing/string/number math.

/** Extrai o número da figura a partir do texto do header (ex: "FIGURA 7" → 7). */
export function parseFigureNumber(text: string): number {
    const m = String(text || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
}

/**
 * Remove o prefixo "Figura N — " da caption (re-aplicado pelo modal ao salvar).
 * Se num <= 0, retorna o texto como-está (não havia prefixo numerado).
 */
export function stripFigurePrefix(text: string, num: number): string {
    if (!Number.isFinite(num) || num <= 0) return String(text || '');
    const re = new RegExp(`^\\s*Figura\\s+${num}\\s*[—-]\\s*`, 'i');
    return String(text || '').replace(re, '').trim();
}

/**
 * Lê a escala atual (width %) do <img> dentro do imgWrap. Padrão = 100 (sem width inline).
 * DOM-agnóstico: aceita estilo de inline string que pareça width:NN% (suficiente p/ unit test
 * com objeto simulado).
 */
export function readScalePctFromStyle(styleStr: string): number {
    const m = String(styleStr || '').match(/width\s*:\s*(\d+)\s*%/i);
    return m ? parseInt(m[1]!, 10) : 100;
}

/**
 * Normaliza o input de escala do user (string do <input type="number">) em valor
 * válido [20..100]. Não-finito ou fora do range → clamp.
 */
export function normalizeScalePct(rawInput: string | number): number {
    const n = typeof rawInput === 'number' ? rawInput : parseInt(String(rawInput || ''), 10);
    const safe = Number.isFinite(n) ? n : 100;
    return Math.max(20, Math.min(100, safe));
}

/**
 * Normaliza o input do número da figura (string) em inteiro >= 1, ou 0 se inválido
 * (0 → header mostra apenas "FIGURA" sem número, comportamento intencional).
 */
export function normalizeFigureNumber(rawInput: string | number): number {
    const n = typeof rawInput === 'number' ? rawInput : parseInt(String(rawInput || ''), 10);
    return Number.isFinite(n) && n > 0 ? Math.min(999, Math.trunc(n)) : 0;
}

/**
 * Monta o label do header ("FIGURA 7" ou "FIGURA" quando num <= 0).
 */
export function buildHeaderNumberLabel(num: number): string {
    return Number.isFinite(num) && num > 0 ? `FIGURA ${num}` : 'FIGURA';
}

/**
 * Monta o texto da figcaption ("Figura 7 — Entorno" ou apenas o texto quando num <= 0).
 */
export function buildCaptionText(caption: string, num: number): string {
    const safe = String(caption || '');
    return Number.isFinite(num) && num > 0 ? `Figura ${num} — ${safe}` : safe;
}
