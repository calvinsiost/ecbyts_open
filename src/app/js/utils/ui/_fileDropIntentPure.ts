// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/**
 * FILE-DROP-INTENT-001 — lógica pura do dialog de intenção de drop.
 *
 * Zero dependência de DOM/browser: validação de tipo+tamanho (M5),
 * resumo tabular barato "~N linhas × M colunas" (M2) e normalização
 * da escolha do usuário (IntentChoice). Consumido por
 * `fileDropIntentDialog.ts` (DOM) e por `tests/file-drop-intent-pure.test.mjs`.
 *
 * Spec: docs/specs/features/SPEC_FILE_DROP_INTENT_DIALOG.md
 */

/** Escolha do usuário no dialog — duas decisões INDEPENDENTES. */
export interface IntentChoice {
    addToFiles: boolean;
    openWizard: boolean;
}

/** Metadados mínimos de um arquivo solto (subset de File — testável em node). */
export interface DropFileMeta {
    name: string;
    size: number;
}

export type DropRejectReason = 'unsupported_type' | 'too_large' | 'invalid_name';

export interface DropValidationResult {
    ok: boolean;
    ext: string;
    reason: DropRejectReason | null;
    /** O wizard de importação sabe rotear esta extensão? (habilita o checkbox) */
    wizardSupported: boolean;
}

/**
 * Tipos aceitos no DROP (M5) — lista da spec §2.1 (Files + ingestão).
 * `shp` incluído por paridade com a rota shapefile do wizard.
 */
export const ACCEPTED_DROP_EXTENSIONS: ReadonlySet<string> = new Set([
    'csv',
    'tsv',
    'xlsx',
    'xls',
    'pdf',
    'docx',
    'json',
    'geojson',
    'zip',
    'ecbt',
    'txt',
    'shp',
]);

/**
 * Extensões roteáveis pelo wizard "Importar Dados" (_startIngestionForFile):
 * pdf/docx → extração de documento; shp/zip → shapefile; planilhas → tabular.
 * `txt/json/geojson/ecbt` ficam FORA (prosa/vector/key não são tuplas de
 * observação — o checkbox do wizard aparece desabilitado com hint).
 */
export const WIZARD_EXTENSIONS: ReadonlySet<string> = new Set([
    'csv',
    'tsv',
    'xlsx',
    'xls',
    'pdf',
    'docx',
    'zip',
    'shp',
]);

/**
 * Cap do pré-check de tamanho (M5). Usa o teto do maior plano (pro 500MB):
 * a quota real do usuário é revalidada pelo `register()` (validação dupla —
 * research §3); aqui só recusamos o claramente absurdo sem falso-negativo
 * para usuários pro.
 */
export const DEFAULT_MAX_DROP_BYTES = 500 * 1024 * 1024;

/** Cap de leitura do preview tabular (M2) — nunca parse pesado no dialog. */
export const CSV_PREVIEW_READ_CAP_BYTES = 5 * 1024 * 1024;

/** Extrai extensão minúscula sem ponto; '' quando ausente. */
export function getFileExtension(name: unknown): string {
    if (typeof name !== 'string') return '';
    const trimmed = name.trim();
    const idx = trimmed.lastIndexOf('.');
    if (idx <= 0 || idx === trimmed.length - 1) return '';
    return trimmed.slice(idx + 1).toLowerCase();
}

/**
 * M5 — validação client-side pré-dialog. Recusa tipo fora da whitelist e
 * tamanho acima do cap. Arquivo recusado → toast com motivo, SEM dialog.
 */
export function validateDropFile(
    meta: DropFileMeta | null | undefined,
    maxBytes: number = DEFAULT_MAX_DROP_BYTES,
): DropValidationResult {
    const name = meta?.name;
    const ext = getFileExtension(name);
    if (!name || typeof name !== 'string' || !name.trim()) {
        return { ok: false, ext, reason: 'invalid_name', wizardSupported: false };
    }
    if (!ext || !ACCEPTED_DROP_EXTENSIONS.has(ext)) {
        return { ok: false, ext, reason: 'unsupported_type', wizardSupported: false };
    }
    const size = typeof meta?.size === 'number' && Number.isFinite(meta.size) ? meta.size : 0;
    if (size > maxBytes) {
        return { ok: false, ext, reason: 'too_large', wizardSupported: WIZARD_EXTENSIONS.has(ext) };
    }
    return { ok: true, ext, reason: null, wizardSupported: WIZARD_EXTENSIONS.has(ext) };
}

/** Extensões com preview tabular barato no dialog (M2). */
export function isTabularExtension(ext: string): boolean {
    return ext === 'csv' || ext === 'tsv';
}

export interface TabularSummary {
    /** Linhas não-vazias detectadas (dados; sem distinguir header). */
    rows: number;
    /** Colunas da primeira linha não-vazia. */
    cols: number;
    /** true quando o texto foi cortado no cap de leitura (contagem é "~"). */
    truncated: boolean;
}

/**
 * M2 — resumo "~N linhas × M colunas" de texto tabular (csv/tsv).
 * Detecção de delimitador na 1ª linha não-vazia: tab > ';' > ','.
 * NÃO é um parser CSV (aspas/multiline ignorados de propósito) — é um
 * preview barato; o parse real é papel do wizard.
 */
export function summarizeTabularText(
    text: unknown,
    opts: { truncated?: boolean } = {},
): TabularSummary {
    const truncated = !!opts.truncated;
    if (typeof text !== 'string' || !text.trim()) {
        return { rows: 0, cols: 0, truncated };
    }
    const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
    if (!lines.length) return { rows: 0, cols: 0, truncated };
    const first = lines[0] as string;
    let delimiter = ',';
    if (first.includes('\t')) delimiter = '\t';
    else if (first.includes(';')) delimiter = ';';
    const cols = first.split(delimiter).length;
    // Texto truncado no cap: a última linha pode estar incompleta — desconta.
    const rows = truncated && lines.length > 1 ? lines.length - 1 : lines.length;
    return { rows, cols, truncated };
}

/**
 * S1 — sanitiza a escolha persistida (localStorage) ou qualquer entrada
 * externa para um IntentChoice seguro. Junk → ambos false.
 */
export function normalizeIntentChoice(raw: unknown): IntentChoice {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return {
        addToFiles: obj.addToFiles === true,
        openWizard: obj.openWizard === true,
    };
}
