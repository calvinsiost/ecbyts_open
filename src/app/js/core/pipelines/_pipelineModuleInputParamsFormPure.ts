// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   MODULE INPUT PARAMS FORM - view-model puro do formulario guiado
   de "Parametros de entrada do modulo" (editor nativo de pipeline).

   Substitui o textarea livre (JSON/key=value) por campos gerados a
   partir do catalogo de parametros tecnicos do dominio + dicas do
   targetModule escolhido. Chaves gravadas fora do catalogo viram
   linhas de texto livre (fallback para chave desconhecida), mantendo
   compatibilidade de leitura com packs que ja tem moduleInputParams.
   ================================================================ */

export interface ModuleInputParamCatalogEntry {
    id: string;
    label?: string;
    applicability?: string;
    valueKind?: string;
    description?: string;
    examples?: string[];
    userPrompt?: string;
}

export interface ModuleInputParamFormField {
    key: string;
    label: string;
    known: boolean;
    applicability: string;
    valueKind: string;
    description: string;
    examples: string[];
    value: string;
    placeholder: string;
}

export interface ModuleInputParamsFormViewModel {
    targetModule: string;
    fields: ModuleInputParamFormField[];
    knownCount: number;
    customCount: number;
}

export interface ModuleInputParamFormEntry {
    key: string;
    value: string;
    valueKind?: string;
}

/** Dicas de parametros que cada modulo de destino entende (chaves estruturais fora do catalogo do dominio). */
const TARGET_MODULE_PARAM_HINTS: Record<string, ModuleInputParamCatalogEntry[]> = {
    'pipelines.gac': [
        {
            id: 'presetId',
            label: 'Preset do fluxo',
            valueKind: 'reference',
            description: 'Identificador do preset de fluxo aberto pelo modulo (ex.: fluxo GAC/DD-38).',
            examples: ['m01.gac.flow.dd38'],
        },
        {
            id: 'templateId',
            label: 'Template do processo',
            valueKind: 'reference',
            description: 'Template de processo aplicado quando o modulo abre.',
            examples: ['gac-dd38-environmental-management'],
        },
    ],
    files: [
        {
            id: 'sourceFile',
            label: 'Arquivo de origem',
            valueKind: 'document',
            description: 'Arquivo que o modulo Files abre ou destaca para esta etapa.',
            examples: ['01_DadosAnaliticos.vpp'],
        },
    ],
};

function _text(value: unknown): string {
    return String(value ?? '').trim();
}

function _formatValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function _catalogEntries(input: ModuleInputParamCatalogEntry[] | null | undefined): ModuleInputParamCatalogEntry[] {
    return (Array.isArray(input) ? input : []).filter((entry) => _text(entry?.id));
}

/**
 * Monta o view-model do formulario guiado.
 * - Campos conhecidos vem do catalogo do dominio (required + optional;
 *   not-applicable fica de fora porque pertence a outro perfil).
 * - Dicas do targetModule entram como campos conhecidos estruturais.
 * - Chaves ja gravadas fora do catalogo viram linhas custom (texto livre).
 */
export function buildModuleInputParamsFormViewModel(input: {
    parameters?: ModuleInputParamCatalogEntry[] | null;
    currentParams?: Record<string, unknown> | null;
    targetModule?: string;
}): ModuleInputParamsFormViewModel {
    const targetModule = _text(input?.targetModule);
    const current = input?.currentParams && typeof input.currentParams === 'object'
        ? input.currentParams
        : {};
    const catalog = _catalogEntries(input?.parameters).filter(
        (entry) => _text(entry.applicability) !== 'not-applicable',
    );
    const hints = TARGET_MODULE_PARAM_HINTS[targetModule.toLowerCase()] || [];
    const seen = new Set<string>();
    const fields: ModuleInputParamFormField[] = [];
    const pushKnown = (entry: ModuleInputParamCatalogEntry, applicability: string) => {
        const key = _text(entry.id);
        if (!key || seen.has(key)) return;
        seen.add(key);
        const examples = Array.isArray(entry.examples) ? entry.examples.map(_text).filter(Boolean) : [];
        fields.push({
            key,
            label: _text(entry.label) || key,
            known: true,
            applicability,
            valueKind: _text(entry.valueKind) || 'text',
            description: _text(entry.userPrompt) || _text(entry.description),
            examples,
            value: _formatValue(current[key]),
            placeholder: examples[0] || '',
        });
    };
    for (const entry of catalog.filter((item) => _text(item.applicability) === 'required')) {
        pushKnown(entry, 'required');
    }
    for (const entry of catalog.filter((item) => _text(item.applicability) !== 'required')) {
        pushKnown(entry, 'optional');
    }
    for (const hint of hints) pushKnown(hint, 'structural');
    for (const [key, rawValue] of Object.entries(current)) {
        if (seen.has(key)) continue;
        seen.add(key);
        fields.push({
            key,
            label: key,
            known: false,
            applicability: 'custom',
            valueKind: 'text',
            description: '',
            examples: [],
            value: _formatValue(rawValue),
            placeholder: '',
        });
    }
    return {
        targetModule,
        fields,
        knownCount: fields.filter((field) => field.known).length,
        customCount: fields.filter((field) => !field.known).length,
    };
}

/** Converte o texto digitado para o escalar adequado ao valueKind (compativel com o parser key=value legado). */
export function coerceModuleInputParamValue(valueKind: string, raw: string): unknown {
    const text = _text(raw);
    if (!text) return undefined;
    if (_text(valueKind) === 'list') {
        const items = text.split(/[;,]/).map(_text).filter(Boolean);
        return items.length ? items : undefined;
    }
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (text === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    return text;
}

/**
 * Coleta os valores do formulario de volta para moduleInputParams.
 * Linhas vazias sao omitidas; retorna null quando nada restou (a UI remove o campo do no).
 */
export function collectModuleInputParamsFromFields(
    entries: ModuleInputParamFormEntry[] | null | undefined,
): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};
    for (const entry of Array.isArray(entries) ? entries : []) {
        const key = _text(entry?.key);
        if (!key) continue;
        const value = coerceModuleInputParamValue(_text(entry?.valueKind), String(entry?.value ?? ''));
        if (value === undefined) continue;
        out[key] = value;
    }
    return Object.keys(out).length ? out : null;
}
