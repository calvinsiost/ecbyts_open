// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   MODEL IDENTITY, LINKS & CORPORATE I/O
   ================================================================

   Gerencia identidade unica do modelo, conexoes com outros modelos,
   e registro corporativo de compras (inputs) e vendas (outputs).

   MODEL ID:
   - SHA-256 hash (16 hex chars) gerado na criacao do projeto
   - Persiste entre exportacoes/importacoes
   - Identifica unicamente este modelo

   MODEL LINKS:
   - inputs[]: modelos dos quais este depende (upstream)
   - outputs[]: modelos que dependem deste (downstream)

   CORPORATE I/O:
   - corporateInputs[]: insumos e servicos comprados (perfuracao, lab, EPIs, etc.)
   - corporateOutputs[]: produtos e servicos vendidos (relatorios, consultoria, etc.)
   - Cada transacao pode ser vinculada a elementos 3D, campanhas e contratos

   ================================================================ */

// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------

type ModelLink = {
    modelId: string;
    name: string;
    role: string;
};

type ModelLinks = {
    inputs: ModelLink[];
    outputs: ModelLink[];
};

type CorporateTransactionDraft = {
    category?: string;
    description?: string;
    quantity?: number;
    unit?: string;
    unitCost?: number;
    currency?: string;
    date?: string;
    supplier?: string;
    invoiceRef?: string;
    status?: string;
    notes?: string;
    linkedElementIds?: string[];
    linkedCampaignId?: string | null;
    linkedContractId?: string | null;
};

type CorporateTransaction = Required<Omit<CorporateTransactionDraft, 'linkedCampaignId' | 'linkedContractId'>> & {
    id: string;
    totalCost: number;
    linkedCampaignId: string | null;
    linkedContractId: string | null;
};

/** ID unico do modelo (16 hex chars) */
let modelId: string | null = null;

/** Links com outros modelos */
let modelLinks: ModelLinks = {
    inputs: [], // [{ modelId, name, role }]
    outputs: [], // [{ modelId, name, role }]
};

/** Registro corporativo de compras e vendas */
let corporateInputs: CorporateTransaction[] = []; // compras / insumos adquiridos
let corporateOutputs: CorporateTransaction[] = []; // vendas / servicos entregues

function _randomUuid(): string {
    const root: any = typeof window !== 'undefined' ? window : globalThis;
    const seeded = root?.__ecbytsRandomSeededUuid;
    if (typeof seeded === 'function') return seeded();
    return crypto.randomUUID();
}

/** Categorias pre-definidas para inputs (compras) */
export const INPUT_CATEGORIES = [
    { id: 'raw_material', icon: 'package' },
    { id: 'lab_services', icon: 'flask' },
    { id: 'drilling', icon: 'drill' },
    { id: 'equipment', icon: 'settings' },
    { id: 'ppe', icon: 'shield' },
    { id: 'fuel', icon: 'fuel' },
    { id: 'logistics', icon: 'truck' },
    { id: 'consulting_in', icon: 'users' },
    { id: 'rental', icon: 'key' },
    { id: 'reagents', icon: 'droplet' },
    { id: 'other_input', icon: 'more-horizontal' },
];

/** Categorias pre-definidas para outputs (vendas) */
export const OUTPUT_CATEGORIES = [
    { id: 'report', icon: 'file-text' },
    { id: 'monitoring', icon: 'activity' },
    { id: 'consulting_out', icon: 'briefcase' },
    { id: 'certificate', icon: 'award' },
    { id: 'remediation', icon: 'tool' },
    { id: 'training', icon: 'book-open' },
    { id: 'product', icon: 'box' },
    { id: 'other_output', icon: 'more-horizontal' },
];

/** Unidades comuns */
export const COMMON_UNITS = ['un', 'kg', 'm', 'L', 'hr', 'km', 'day', 'month', 'test', 'visit'];

// ----------------------------------------------------------------
// MODEL ID GENERATION
// ----------------------------------------------------------------

/**
 * Gera ID unico para o modelo usando SHA-256.
 * Combina timestamp + userAgent + UUID para entropia.
 *
 * @returns 16 hex chars
 */
export async function generateModelId(): Promise<string> {
    const raw = new Date().toISOString() + navigator.userAgent + _randomUuid();
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const hex = Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    modelId = hex.slice(0, 16);
    return modelId;
}

/**
 * Obtem o ID do modelo atual.
 * Se nao existir, gera um novo.
 *
 * @returns
 */
export async function getModelId(): Promise<string> {
    if (!modelId) {
        await generateModelId();
    }
    return modelId as string;
}

/**
 * Define o ID do modelo (usado na importacao).
 *
 * @param id - Model ID (16 hex chars)
 */
export function setModelId(id: string): void {
    modelId = id || null;
}

/**
 * Retorna o model ID sincronamente (pode ser null).
 *
 * @returns
 */
export function getModelIdSync(): string | null {
    return modelId;
}

// ----------------------------------------------------------------
// MODEL LINKS CRUD
// ----------------------------------------------------------------

/**
 * Obtem todos os links do modelo.
 *
 * @returns
 */
export function getModelLinks(): ModelLinks {
    return {
        inputs: [...modelLinks.inputs],
        outputs: [...modelLinks.outputs],
    };
}

/**
 * Define todos os links (usado na importacao).
 *
 * @param links
 */
export function setModelLinks(links: { inputs?: ModelLink[]; outputs?: ModelLink[] }): void {
    modelLinks = {
        inputs: Array.isArray(links?.inputs) ? links.inputs : [],
        outputs: Array.isArray(links?.outputs) ? links.outputs : [],
    };
}

/**
 * Adiciona um link de entrada (upstream model).
 *
 * @param linkedModelId - ID do modelo upstream
 * @param name - Nome descritivo
 * @param role - Papel (ex: 'source', 'boundary')
 */
export function addInputLink(linkedModelId: string, name: string, role: string): void {
    if (!linkedModelId) return;
    // Evita duplicatas
    if (modelLinks.inputs.some((l) => l.modelId === linkedModelId)) return;
    modelLinks.inputs.push({ modelId: linkedModelId, name: name || '', role: role || '' });
}

/**
 * Adiciona um link de saida (downstream model).
 *
 * @param linkedModelId - ID do modelo downstream
 * @param name - Nome descritivo
 * @param role - Papel (ex: 'receptor', 'target')
 */
export function addOutputLink(linkedModelId: string, name: string, role: string): void {
    if (!linkedModelId) return;
    if (modelLinks.outputs.some((l) => l.modelId === linkedModelId)) return;
    modelLinks.outputs.push({ modelId: linkedModelId, name: name || '', role: role || '' });
}

/**
 * Remove um link de entrada.
 *
 * @param linkedModelId
 */
export function removeInputLink(linkedModelId: string): void {
    modelLinks.inputs = modelLinks.inputs.filter((l) => l.modelId !== linkedModelId);
}

/**
 * Remove um link de saida.
 *
 * @param linkedModelId
 */
export function removeOutputLink(linkedModelId: string): void {
    modelLinks.outputs = modelLinks.outputs.filter((l) => l.modelId !== linkedModelId);
}

/**
 * Limpa todos os links e ID (para novo projeto).
 */
export function resetModelIdentity(): void {
    modelId = null;
    modelLinks = { inputs: [], outputs: [] };
    corporateInputs = [];
    corporateOutputs = [];
}

// ----------------------------------------------------------------
// CORPORATE I/O - Registro de compras e vendas
// ----------------------------------------------------------------

/**
 * Gera ID curto para transacao corporativa.
 * @returns 8 hex chars
 */
function _genTxId(): string {
    return _randomUuid().replace(/-/g, '').slice(0, 8);
}

/**
 * Retorna todas as compras (inputs corporativos).
 * @returns
 */
export function getCorporateInputs(): CorporateTransaction[] {
    return [...corporateInputs];
}

/**
 * Retorna todas as vendas (outputs corporativos).
 * @returns
 */
export function getCorporateOutputs(): CorporateTransaction[] {
    return [...corporateOutputs];
}

function _toFiniteNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return 0;
}

function _normalizeString(value: unknown, fallback: string): string {
    if (!value || typeof value !== 'string') return fallback;
    return value;
}

function _normalizeNullableString(value: unknown): string | null {
    if (!value) return null;
    return value as string;
}

function _normalizeStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value as string[];
    return [];
}

function _createCorporateTransaction(
    id: string,
    item: CorporateTransactionDraft,
    defaultCategory: string,
): CorporateTransaction {
    const quantity = _toFiniteNumber(item.quantity);
    const unitCost = _toFiniteNumber(item.unitCost);
    return {
        id,
        category: _normalizeString(item.category, defaultCategory),
        description: _normalizeString(item.description, ''),
        quantity,
        unit: _normalizeString(item.unit, 'un'),
        unitCost,
        totalCost: Math.round(quantity * unitCost * 100) / 100,
        currency: _normalizeString(item.currency, 'BRL'),
        date: _normalizeString(item.date, ''),
        supplier: _normalizeString(item.supplier, ''),
        invoiceRef: _normalizeString(item.invoiceRef, ''),
        status: _normalizeString(item.status, 'completed'),
        notes: _normalizeString(item.notes, ''),
        linkedElementIds: _normalizeStringArray(item.linkedElementIds),
        linkedCampaignId: _normalizeNullableString(item.linkedCampaignId),
        linkedContractId: _normalizeNullableString(item.linkedContractId),
    };
}

/**
 * Adiciona uma compra (input corporativo).
 * @param item - Dados da transacao
 * @returns ID do item criado
 */
export function addCorporateInput(item: CorporateTransactionDraft): string {
    const id = _genTxId();
    corporateInputs.push(_createCorporateTransaction(id, item, 'other_input'));
    return id;
}

/**
 * Atualiza uma compra existente.
 * @param id
 * @param updates
 */
export function updateCorporateInput(id: string, updates: Partial<CorporateTransactionDraft>): void {
    const idx = corporateInputs.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const it = corporateInputs[idx];
    if (!it) return;
    Object.assign(it, updates);
    if (updates.quantity !== undefined || updates.unitCost !== undefined) {
        it.totalCost = Math.round((it.quantity || 0) * (it.unitCost || 0) * 100) / 100;
    }
}

/**
 * Remove uma compra.
 * @param id
 */
export function removeCorporateInput(id: string): void {
    corporateInputs = corporateInputs.filter((i) => i.id !== id);
}

/**
 * Adiciona uma venda (output corporativo).
 * @param item - Dados da transacao
 * @returns ID do item criado
 */
export function addCorporateOutput(item: CorporateTransactionDraft): string {
    const id = _genTxId();
    corporateOutputs.push(_createCorporateTransaction(id, item, 'other_output'));
    return id;
}

/**
 * Atualiza uma venda existente.
 * @param id
 * @param updates
 */
export function updateCorporateOutput(id: string, updates: Partial<CorporateTransactionDraft>): void {
    const idx = corporateOutputs.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const it = corporateOutputs[idx];
    if (!it) return;
    Object.assign(it, updates);
    if (updates.quantity !== undefined || updates.unitCost !== undefined) {
        it.totalCost = Math.round((it.quantity || 0) * (it.unitCost || 0) * 100) / 100;
    }
}

/**
 * Remove uma venda.
 * @param id
 */
export function removeCorporateOutput(id: string): void {
    corporateOutputs = corporateOutputs.filter((i) => i.id !== id);
}

/**
 * Retorna totais para Relacao com Investidores.
 * @returns
 */
export function getCorporateTotals(): {
    totalInputs: number;
    totalOutputs: number;
    margin: number;
    marginPct: number;
    inputCount: number;
    outputCount: number;
} {
    const totalInputs = corporateInputs.reduce((s, i) => s + (i.totalCost || 0), 0);
    const totalOutputs = corporateOutputs.reduce((s, i) => s + (i.totalCost || 0), 0);
    const margin = totalOutputs - totalInputs;
    const marginPct = totalInputs > 0 ? (margin / totalInputs) * 100 : 0;
    return {
        totalInputs: Math.round(totalInputs * 100) / 100,
        totalOutputs: Math.round(totalOutputs * 100) / 100,
        margin: Math.round(margin * 100) / 100,
        marginPct: Math.round(marginPct * 10) / 10,
        inputCount: corporateInputs.length,
        outputCount: corporateOutputs.length,
    };
}

/**
 * Retorna transacoes vinculadas a um elemento especifico.
 * @param elementId
 * @returns
 */
export function getTransactionsByElement(elementId: string): { inputs: CorporateTransaction[]; outputs: CorporateTransaction[] } {
    return {
        inputs: corporateInputs.filter((i) => i.linkedElementIds?.includes(elementId)),
        outputs: corporateOutputs.filter((i) => i.linkedElementIds?.includes(elementId)),
    };
}

/**
 * Exporta dados corporativos para serializacao (ECO1).
 * @returns
 */
export function exportCorporateIO(): { inputs: CorporateTransaction[]; outputs: CorporateTransaction[] } {
    return {
        inputs: [...corporateInputs],
        outputs: [...corporateOutputs],
    };
}

/**
 * Importa dados corporativos de payload (ECO1).
 * @param data
 */
export function importCorporateIO(data: { inputs?: CorporateTransaction[]; outputs?: CorporateTransaction[] }): void {
    corporateInputs = Array.isArray(data?.inputs) ? data.inputs : [];
    corporateOutputs = Array.isArray(data?.outputs) ? data.outputs : [];
}
