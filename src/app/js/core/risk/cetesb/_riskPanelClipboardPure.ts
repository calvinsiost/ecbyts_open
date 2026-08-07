// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CETESB-RISK-001 UI-B Phase 1 — pure-logic clipboard helper para riskAssessmentPanel.
//
// Espelha o painel atual (5 campos: sqi, scenario, soilConc, groundwaterConc, airConc)
// em TSV 2 colunas (Campo / Valor) — formato que o usuário pode colar direto numa
// planilha vertical e que reconhecemos de volta.
//
// Não é UI: nenhum import de DOM/clipboard/THREE/IDB. Caller faz o wire.
//
// PRIOR ART:
//   - src/app/js/core/risk/cetesb/_clipboardInteropPure.ts (UI-B grid bidirecional)
//     reusa parseTsv, serializeTsv, parseNumberFromClipboard.
//   - src/app/js/utils/handlers/labReconciliation.ts (textarea-based paste)
//
// SPEC: docs/specs/features/SPEC_CETESB_RISK_ASSESSMENT.md UI-B Phase 1

import { parseTsv, serializeTsv, parseNumberFromClipboard } from './_clipboardInteropPure.js';
import type { ScenarioId } from './_riskCatalogPure.js';

// ===========================================================================
// Tipos
// ===========================================================================

export interface RiskPanelClipboardState {
    readonly selectedCas: string;
    readonly selectedScenario: ScenarioId;
    readonly soilConc: number;
    readonly groundwaterConc: number;
    readonly airConc: number;
}

export interface RiskPanelClipboardPatch {
    selectedCas?: string;
    selectedScenario?: ScenarioId;
    soilConc?: number;
    groundwaterConc?: number;
    airConc?: number;
}

export interface ParseFromTsvResult {
    readonly ok: boolean;
    readonly patch: RiskPanelClipboardPatch;
    readonly accepted: number;
    readonly rejected: number;
    readonly warnings: ReadonlyArray<string>;
}

// ===========================================================================
// Constantes — labels canônicos por campo, tolerantes a PT/EN
// ===========================================================================

interface FieldDef {
    readonly key: keyof RiskPanelClipboardPatch;
    readonly canonical: string;
    readonly aliases: ReadonlyArray<string>;
    readonly kind: 'cas' | 'scenario' | 'number';
}

const FIELDS: ReadonlyArray<FieldDef> = Object.freeze([
    Object.freeze({
        key: 'selectedCas' as const,
        canonical: 'SQI (CAS)',
        aliases: Object.freeze(['sqi', 'cas', 'substancia', 'substância', 'substance', 'chemical', 'parameter']),
        kind: 'cas' as const,
    }),
    Object.freeze({
        key: 'selectedScenario' as const,
        canonical: 'Cenário',
        aliases: Object.freeze(['scenario', 'cenario', 'uso', 'land use', 'land-use']),
        kind: 'scenario' as const,
    }),
    Object.freeze({
        key: 'soilConc' as const,
        canonical: 'Concentração no solo',
        aliases: Object.freeze(['soil', 'solo', 'soil conc', 'soilconc', 'concentracao no solo', 'solo (mg/kg)']),
        kind: 'number' as const,
    }),
    Object.freeze({
        key: 'groundwaterConc' as const,
        canonical: 'Concentração na água subterrânea',
        aliases: Object.freeze([
            'groundwater',
            'agua subterranea',
            'água subterrânea',
            'groundwaterconc',
            'agua subterranea (ug/l)',
            'as',
        ]),
        kind: 'number' as const,
    }),
    Object.freeze({
        key: 'airConc' as const,
        canonical: 'Concentração no ar',
        aliases: Object.freeze(['air', 'ar', 'airconc', 'ar (ug/m3)', 'concentracao no ar']),
        kind: 'number' as const,
    }),
]);

const CAS_REGEX = /^[1-9]\d{0,6}-\d{2}-\d$/;
const VALID_SCENARIOS: ReadonlyArray<ScenarioId> = Object.freeze([
    'RES_URB',
    'RES_RUR',
    'TRAB_COM_IND',
    'TRAB_OBRA_CIV',
]) as ReadonlyArray<ScenarioId>;

// ===========================================================================
// Serialize — state → TSV (Campo / Valor)
// ===========================================================================

function formatNumber(v: number): string {
    if (!Number.isFinite(v)) return '0';
    if (v === 0) return '0';
    const abs = Math.abs(v);
    if (abs >= 1e-4 && abs < 1e15) {
        const fixed = v.toFixed(6).replace(/\.?0+$/, '');
        return fixed;
    }
    return v.toExponential(6);
}

/**
 * Serializa o estado do painel em TSV 2 colunas (Campo / Valor).
 *
 * Layout (5 linhas + header):
 *   ```
 *   Campo<TAB>Valor
 *   SQI (CAS)<TAB>71-43-2
 *   Cenário<TAB>RES_URB
 *   Concentração no solo<TAB>0.5
 *   Concentração na água subterrânea<TAB>10
 *   Concentração no ar<TAB>0
 *   ```
 *
 * Cola direto numa planilha vertical (1 linha por campo).
 */
export function serializeRiskFormToTsv(state: RiskPanelClipboardState): string {
    if (!state) return '';
    const matrix: string[][] = [
        ['Campo', 'Valor'],
        [FIELDS[0]!.canonical, String(state.selectedCas || '')],
        [FIELDS[1]!.canonical, String(state.selectedScenario || '')],
        [FIELDS[2]!.canonical, formatNumber(state.soilConc)],
        [FIELDS[3]!.canonical, formatNumber(state.groundwaterConc)],
        [FIELDS[4]!.canonical, formatNumber(state.airConc)],
    ];
    return serializeTsv(matrix);
}

// ===========================================================================
// Parse — TSV → state patch
// ===========================================================================

function normalizeLabel(s: string): string {
    if (typeof s !== 'string') return '';
    const out = s.trim().toLowerCase().normalize('NFD');
    let stripped = '';
    for (let i = 0; i < out.length; i++) {
        const cp = out.charCodeAt(i);
        if (cp >= 0x0300 && cp <= 0x036f) continue;
        stripped += out[i];
    }
    return stripped.replace(/\s+/g, ' ');
}

function findFieldByLabel(label: string): FieldDef | null {
    const norm = normalizeLabel(label);
    if (!norm) return null;
    for (const f of FIELDS) {
        if (normalizeLabel(f.canonical) === norm) return f;
        for (const alias of f.aliases) {
            if (normalizeLabel(alias) === norm) return f;
        }
    }
    return null;
}

/**
 * Detecta orientação do TSV:
 *   - 'kv-rows': 2 colunas, N linhas → cada linha é (campo, valor)
 *   - 'kv-cols': 2 linhas, N colunas → linha 0 = campos, linha 1 = valores
 *   - 'inline-3': 1 linha × 3+ colunas numéricas → soil/groundwater/air em ordem
 *   - 'unknown': nada reconhecível
 */
type Orientation = 'kv-rows' | 'kv-cols' | 'inline-3' | 'unknown';

function detectOrientation(rows: ReadonlyArray<ReadonlyArray<string>>): Orientation {
    if (rows.length === 0) return 'unknown';
    // 1×3+ numérico tem precedência sobre kv-rows (1×2 com 2 números seria ambíguo)
    if (rows.length === 1 && rows[0]!.length >= 3) {
        const allNumeric = rows[0]!.every((c) => parseNumberFromClipboard(c) !== null);
        if (allNumeric) return 'inline-3';
    }
    // kv-rows: ≥1 linha com 2 cols onde col 0 é um campo conhecido
    if (rows[0]!.length === 2) {
        for (const r of rows) {
            if (r.length === 2 && findFieldByLabel(r[0]!)) return 'kv-rows';
        }
    }
    // kv-cols: 2 linhas, ≥2 cols, primeira linha tem ≥1 label conhecido
    if (rows.length === 2 && rows[0]!.length >= 2 && rows[0]!.length === rows[1]!.length) {
        for (const label of rows[0]!) {
            if (findFieldByLabel(label)) return 'kv-cols';
        }
    }
    return 'unknown';
}

function applyFieldValue(
    field: FieldDef,
    rawValue: string,
    patch: RiskPanelClipboardPatch,
    warnings: string[],
): boolean {
    const value = rawValue.trim();
    if (value === '') return false;
    if (field.kind === 'cas') {
        if (!CAS_REGEX.test(value)) {
            warnings.push(`CAS inválido para "${field.canonical}": "${value.slice(0, 30)}"`);
            return false;
        }
        patch.selectedCas = value;
        return true;
    }
    if (field.kind === 'scenario') {
        const upper = value.toUpperCase().replace(/[\s-]/g, '_');
        if (!(VALID_SCENARIOS as ReadonlyArray<string>).includes(upper)) {
            warnings.push(`Cenário inválido: "${value.slice(0, 30)}"`);
            return false;
        }
        patch.selectedScenario = upper as ScenarioId;
        return true;
    }
    // number
    const num = parseNumberFromClipboard(value);
    if (num === null) {
        warnings.push(`Valor numérico inválido para "${field.canonical}": "${value.slice(0, 30)}"`);
        return false;
    }
    if (num < 0) {
        warnings.push(`Valor negativo rejeitado para "${field.canonical}": ${num}`);
        return false;
    }
    if (field.key === 'soilConc') patch.soilConc = num;
    else if (field.key === 'groundwaterConc') patch.groundwaterConc = num;
    else if (field.key === 'airConc') patch.airConc = num;
    return true;
}

/**
 * Parseia TSV colado em patch parcial do estado do painel.
 *
 * Aceita 3 layouts:
 *   1. 2 colunas × N linhas (Campo/Valor) — formato canônico produzido por `serializeRiskFormToTsv`
 *   2. 2 linhas × N colunas (Header/Row) — formato "tabela horizontal"
 *   3. 1 linha × 3 colunas numéricas — assume (soil, groundwater, air) em ordem
 *
 * Sempre defensivo: nunca throws, retorna `ok=false` com warnings se nada reconhecido.
 */
export function parseRiskFormFromTsv(tsv: unknown): ParseFromTsvResult {
    const baseEmpty = Object.freeze({
        ok: false,
        patch: Object.freeze({}),
        accepted: 0,
        rejected: 0,
        warnings: Object.freeze<string[]>([]),
    });

    if (typeof tsv !== 'string' || tsv.trim() === '') {
        return Object.freeze({ ...baseEmpty, warnings: Object.freeze(['TSV vazio']) });
    }

    const parsed = parseTsv(tsv);
    if (parsed.height === 0) {
        return Object.freeze({ ...baseEmpty, warnings: Object.freeze(['parseTsv não retornou linhas']) });
    }

    const orientation = detectOrientation(parsed.rows);
    const warnings: string[] = [];
    const patch: RiskPanelClipboardPatch = {};
    let accepted = 0;
    let rejected = 0;

    if (orientation === 'kv-rows') {
        for (const row of parsed.rows) {
            if (row.length < 2) continue;
            const labelCell = row[0]!;
            const valueCell = row[1]!;
            if (normalizeLabel(labelCell) === 'campo' && normalizeLabel(valueCell) === 'valor') continue; // header
            const field = findFieldByLabel(labelCell);
            if (!field) {
                rejected++;
                warnings.push(`Campo desconhecido: "${labelCell.slice(0, 30)}"`);
                continue;
            }
            if (applyFieldValue(field, valueCell, patch, warnings)) accepted++;
            else rejected++;
        }
    } else if (orientation === 'kv-cols') {
        const labels = parsed.rows[0]!;
        const values = parsed.rows[1]!;
        for (let i = 0; i < labels.length; i++) {
            const field = findFieldByLabel(labels[i]!);
            if (!field) {
                rejected++;
                warnings.push(`Campo desconhecido: "${labels[i]!.slice(0, 30)}"`);
                continue;
            }
            if (applyFieldValue(field, values[i]!, patch, warnings)) accepted++;
            else rejected++;
        }
    } else if (orientation === 'inline-3') {
        const cells = parsed.rows[0]!;
        const order: Array<keyof RiskPanelClipboardPatch> = ['soilConc', 'groundwaterConc', 'airConc'];
        for (let i = 0; i < Math.min(cells.length, order.length); i++) {
            const num = parseNumberFromClipboard(cells[i]!);
            if (num === null || num < 0) {
                rejected++;
                continue;
            }
            const k = order[i]!;
            if (k === 'soilConc') patch.soilConc = num;
            else if (k === 'groundwaterConc') patch.groundwaterConc = num;
            else if (k === 'airConc') patch.airConc = num;
            accepted++;
        }
    } else {
        return Object.freeze({
            ok: false,
            patch: Object.freeze({}),
            accepted: 0,
            rejected: 0,
            warnings: Object.freeze(['Layout TSV não reconhecido (esperado: Campo/Valor 2-col, header/row 2-linhas, ou 1×3 inline)']),
        });
    }

    return Object.freeze({
        ok: accepted > 0,
        patch: Object.freeze({ ...patch }),
        accepted,
        rejected,
        warnings: Object.freeze(warnings),
    });
}

/** Metadata pública. */
export const RISK_PANEL_CLIPBOARD_META = Object.freeze({
    supportedLayouts: Object.freeze([
        '2-col Campo/Valor (canonical, gerado por serializeRiskFormToTsv)',
        '2-row header+row (tabela horizontal)',
        '1×3 inline numérico (soil/groundwater/air)',
    ]),
    fieldCount: FIELDS.length,
    aliasesPerField: Object.freeze(FIELDS.map((f) => f.aliases.length)),
});
