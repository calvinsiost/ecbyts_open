// @ts-check
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
   CONTRACT MANAGER — CRUD and financial calculations for contracts
   Gerenciador de contratos com calculos financeiros

   ENTIDADES:
   - Contrato: Partes, termos financeiros, cronograma, KPIs
   - Desembolso: Pagamento programado vinculado a marco
   - Bonus/Malus: Incentivo vinculado a desempenho de KPI

   TIPOS DE CONTRATO:
   - remediation: Remediacao ambiental (CONAMA/CETESB)
   - monitoring: Monitoramento periodico
   - investigation: Investigacao ambiental
   - insurance: Seguro vinculado a compra de library (ambiental ou garantia)
   - credit_agreement: Contrato para geracao e split de creditos EIC
   - custom: Contrato generico definido pelo usuario
   ================================================================ */

import { generateId } from '../helpers/id.js';
import { idbSet, idbGetWithLegacy } from '../storage/idbStore.js';
import {
    createDeferredIdlePersistence,
    type DeferredIdlePersistenceController,
} from '../performance/deferredIdlePersistence.js';
// Adopt own pure helpers (Module C extraction commit 136b4f5d) — financial math.
import {
    computeFinancialSummary,
    evaluateContractKpis,
    computeInsurancePremium,
} from './_contractFinancialPure.js';

/** @typedef {Record<string, any>} AnyRecord */

// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------

const IDB_KEY = 'ecbyts-gov-contracts';
const CONTRACTS_SAVE_DEBOUNCE_MS = 1500;
const CONTRACTS_SAVE_AFTER_BOOT_DELAY_MS = 30000;
const CONTRACTS_SAVE_IDLE_TIMEOUT_MS = 3000;

/** @type {Array<any>} */
let contracts: any = [];
let _loaded = false;
let _lastSaveSignature = '';

/** @type {ReturnType<typeof setTimeout>|null} */
let _saveScheduler: DeferredIdlePersistenceController | null = null;

// ----------------------------------------------------------------
// PERSISTENCE - IDB (debounced, fire-and-forget)
// ----------------------------------------------------------------

/** Debounced save to IndexedDB. Never throws. */
function _save() {
    if (typeof indexedDB === 'undefined') return;
    _getContractsSaveScheduler().schedule();
}

function _getContractsSignature(payload = contracts) {
    try {
        return JSON.stringify(payload);
    } catch {
        return `contracts:${contracts.length}`;
    }
}

function _getContractsSaveScheduler() {
    if (!_saveScheduler) {
        _saveScheduler = createDeferredIdlePersistence({
            debounceMs: CONTRACTS_SAVE_DEBOUNCE_MS,
            bootDelayMs: CONTRACTS_SAVE_AFTER_BOOT_DELAY_MS,
            idleTimeoutMs: CONTRACTS_SAVE_IDLE_TIMEOUT_MS,
            flush: _flushContractsSave,
            onError: (error) => {
                console.debug('[utils/governance/contractManager:persist-idle]', (error as any)?.message || error);
            },
        });
    }
    return _saveScheduler;
}

async function _flushContractsSave() {
    if (typeof indexedDB === 'undefined') return true;
    _saveScheduler?.clear();
    const payload = contracts.map((c: any) => ({ ...c }));
    const signature = _getContractsSignature(payload);
    if (signature === _lastSaveSignature) return true;
    const ok = await idbSet(IDB_KEY, payload);
    if (ok) _lastSaveSignature = signature;
    return ok;
}

/**
 * Load contracts from IDB on startup.
 * Carrega contratos do IndexedDB na inicializacao.
 * @returns {Promise<void>}
 */
export async function loadContracts() {
    if (_loaded) return;
    const data = await idbGetWithLegacy(IDB_KEY);
    if (Array.isArray(data) && data.length > 0) {
        contracts = data;
    }
    _lastSaveSignature = _getContractsSignature(contracts);
    _loaded = true;
}

// ----------------------------------------------------------------
// INSURANCE CATALOG - Catalogo de seguros disponiveis no marketplace
// v1: 3 subtipos. Extensivel adicionando entries ao catalogo.
// ----------------------------------------------------------------

const INSURANCE_CATALOG = {
    environmental: {
        garantia_remediacao: { pctOfPrice: 12, months: 24, i18nKey: 'insGarantiaRemediacao' },
    },
    warranty: {
        extended_support: { pctOfPrice: 10, months: 12, i18nKey: 'insExtendedSupport' },
        refund_guarantee: { pctOfPrice: 5, months: 6, i18nKey: 'insRefundGuarantee' },
    },
};

/** Minimum premium per policy in cents */
const INSURANCE_FLOOR_CENTS = 199;

/** @type {AnyRecord} */
const INSURANCE_CATALOG_BY_CATEGORY = INSURANCE_CATALOG;

/**
 * @param {AnyRecord} [raw]
 * @returns {AnyRecord}
 */
function _normalizeCreditTerms(raw: any = {}) {
    const contractor = Number(raw?.creditSplit?.contractor || 0);
    const contracted = Number(raw?.creditSplit?.contracted || 0);
    const sum = Math.round((contractor + contracted) * 100) / 100;

    if (!Number.isFinite(contractor) || contractor < 0 || contractor > 100) {
        throw new Error('credit_split_contractor_invalid');
    }
    if (!Number.isFinite(contracted) || contracted < 0 || contracted > 100) {
        throw new Error('credit_split_contracted_invalid');
    }
    if (sum !== 100) {
        throw new Error('credit_split_must_sum_100');
    }

    const method = String(raw.verificationMethod || 'automatic').toLowerCase();
    if (!['automatic', 'auditor'].includes(method)) {
        throw new Error('credit_verification_method_invalid');
    }

    return {
        scope: raw.scope || { type: 'model' },
        verificationMethod: method,
        creditSplit: { contractor, contracted },
        auditorAddress: method === 'auditor' ? String(raw.auditorAddress || '').trim() : null,
        maxCreditsPerPeriod: Number(raw.maxCreditsPerPeriod || 50),
        periodDays: Number(raw.periodDays || 30),
        qualityClass: String(raw.qualityClass || 'EIC-Silver'),
    };
}

// ----------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------

/**
 * Add a new contract.
 * Adiciona novo contrato ao sistema.
 *
 * @param {AnyRecord} data - Contract data
 * @returns {AnyRecord} - Created contract
 */
export function addContract(data: any = {}) {
    const creditTerms = data.type === 'credit_agreement' ? _normalizeCreditTerms(data.creditTerms || {}) : null;
    const contract = {
        id: data.id || generateId('contract'),
        name: data.name || 'New Contract',
        type: data.type || 'custom',
        status: data.status || 'draft',
        parties: data.parties || [],
        financial: {
            totalValue: data.financial?.totalValue || 0,
            currency: data.financial?.currency || 'BRL',
            disbursements: data.financial?.disbursements || [],
            bonusMalus: data.financial?.bonusMalus || [],
        },
        dates: {
            effectiveDate: data.dates?.effectiveDate || '',
            expirationDate: data.dates?.expirationDate || '',
            renewalDate: data.dates?.renewalDate || '',
        },
        linkedElements: data.linkedElements || [],
        linkedWbsItems: data.linkedWbsItems || [],
        notes: data.notes || '',
        insurance:
            data.type === 'insurance'
                ? {
                      category: data.insurance?.category || 'warranty',
                      subtype: data.insurance?.subtype || '',
                      linkedOrderId: data.insurance?.linkedOrderId || '',
                      linkedLibraryId: data.insurance?.linkedLibraryId || '',
                      premiumCents: data.insurance?.premiumCents || 0,
                      coverageValueCents: data.insurance?.coverageValueCents || 0,
                      coveragePeriodMonths: data.insurance?.coveragePeriodMonths || 12,
                      policyNumber: data.insurance?.policyNumber || '',
                      claimStatus: data.insurance?.claimStatus || 'none',
                      claimDate: data.insurance?.claimDate || null,
                      claimNotes: data.insurance?.claimNotes || '',
                  }
                : data.insurance || null,
        creditTerms,
        costCenterId: data.costCenterId || null,
        createdAt: data.createdAt || new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
    };

    contracts.push(contract);
    _save();
    return contract;
}

/**
 * Update an existing contract.
 * Atualiza contrato existente.
 *
 * @param {string} id - Contract ID
 * @param {AnyRecord} updates - Fields to update
 * @returns {AnyRecord|null} - Updated contract or null
 */
export function updateContract(id: any, updates: any) {
    const contract = contracts.find((c: any) => c.id === id);
    if (!contract) return null;

    // Merge top-level fields
    for (const [key, value] of Object.entries(updates)) {
        if (key === 'financial') {
            Object.assign(contract.financial, value);
        } else if (key === 'dates') {
            Object.assign(contract.dates, value);
        } else if (key === 'insurance' && contract.insurance) {
            Object.assign(contract.insurance, value);
        } else if (key === 'creditTerms') {
            if (contract.type !== 'credit_agreement') {
                throw new Error('credit_terms_only_for_credit_agreement');
            }
            contract.creditTerms = _normalizeCreditTerms({ ...(contract.creditTerms || {}), ...(value || {}) });
        } else if (key !== 'id' && key !== 'createdAt') {
            contract[key] = value;
        }
    }

    if (updates.type === 'credit_agreement' && contract.type === 'credit_agreement' && !contract.creditTerms) {
        contract.creditTerms = _normalizeCreditTerms({});
    }

    contract.modifiedAt = new Date().toISOString();
    _save();
    return contract;
}

/**
 * Remove a contract.
 * Remove contrato do sistema.
 *
 * @param {string} id - Contract ID
 * @returns {boolean} - true if removed
 */
export function removeContract(id: any) {
    const idx = contracts.findIndex((c: any) => c.id === id);
    if (idx === -1) return false;
    contracts.splice(idx, 1);
    _save();
    return true;
}

/**
 * Clear all contracts.
 * Remove todos os contratos do sistema.
 */
export function clearContracts() {
    contracts = [];
    _save();
}

/**
 * Get all contracts.
 * @returns {Array<any>}
 */
export function getContracts() {
    return contracts;
}

/**
 * Get a contract by ID.
 * @param {string} id
 * @returns {AnyRecord|null}
 */
export function getContract(id: any) {
    return contracts.find((c: any) => c.id === id) || null;
}

// ----------------------------------------------------------------
// PARTY MANAGEMENT
// ----------------------------------------------------------------

/**
 * Add a party to a contract.
 * Adiciona parte (pessoa/empresa) a um contrato.
 *
 * @param {string} contractId - Contract ID
 * @param {AnyRecord} party - { role, name, registry, signedAt }
 * @returns {AnyRecord|null} - Updated contract
 */
export function addParty(contractId: any, party: any) {
    const contract = getContract(contractId);
    if (!contract) return null;

    contract.parties.push({
        role: party.role || 'contractor',
        name: party.name || '',
        registry: party.registry || '',
        signedAt: party.signedAt || '',
    });

    contract.modifiedAt = new Date().toISOString();
    _save();
    return contract;
}

/**
 * Remove a party from a contract.
 * @param {string} contractId
 * @param {number} index
 */
export function removeParty(contractId: any, index: any) {
    const contract = getContract(contractId);
    if (!contract || index < 0 || index >= contract.parties.length) return;
    contract.parties.splice(index, 1);
    contract.modifiedAt = new Date().toISOString();
    _save();
}

// ----------------------------------------------------------------
// DISBURSEMENT MANAGEMENT
// ----------------------------------------------------------------

/**
 * Add a disbursement to a contract.
 * Adiciona desembolso programado.
 *
 * @param {string} contractId
 * @param {AnyRecord} disbursement - { date, amount, description, status }
 */
export function addDisbursement(contractId: any, disbursement: any) {
    const contract = getContract(contractId);
    if (!contract) return null;

    contract.financial.disbursements.push({
        id: generateId('disb'),
        date: disbursement.date || '',
        amount: disbursement.amount || 0,
        description: disbursement.description || '',
        status: disbursement.status || 'scheduled',
        linkedLibrary: disbursement.linkedLibrary || null,
    });

    contract.modifiedAt = new Date().toISOString();
    _save();
    return contract;
}

/**
 * Update a disbursement by ID.
 * Atualiza campos de um desembolso especifico.
 *
 * @param {string} contractId
 * @param {string} disbursementId
 * @param {AnyRecord} updates - Fields to merge
 * @returns {AnyRecord|null} - Updated contract or null
 */
export function updateDisbursement(contractId: any, disbursementId: any, updates: any) {
    const contract = getContract(contractId);
    if (!contract) return null;
    const disbursements = ((contract.financial.disbursements) as any[]);
    const disb = disbursements.find((d: any) => d.id === disbursementId);
    if (!disb) return null;
    for (const [k, v] of Object.entries(updates)) {
        if (k !== 'id') disb[k] = v;
    }
    contract.modifiedAt = new Date().toISOString();
    _save();
    return contract;
}

/**
 * Remove a disbursement by ID.
 * Remove desembolso de um contrato.
 *
 * @param {string} contractId
 * @param {string} disbursementId
 * @returns {boolean}
 */
export function removeDisbursement(contractId: any, disbursementId: any) {
    const contract = getContract(contractId);
    if (!contract) return false;
    const disbursements = ((contract.financial.disbursements) as any[]);
    const idx = disbursements.findIndex((d: any) => d.id === disbursementId);
    if (idx === -1) return false;
    disbursements.splice(idx, 1);
    contract.modifiedAt = new Date().toISOString();
    _save();
    return true;
}

/**
 * Link a library to a disbursement as evidence.
 * Vincula library como evidencia de entregavel do desembolso.
 *
 * @param {string} contractId
 * @param {string} disbursementId
 * @param {AnyRecord} libraryInfo - { libraryId, libraryName, evidenceStatus }
 * @returns {AnyRecord|null}
 */
export function linkLibraryToDisbursement(contractId: any, disbursementId: any, libraryInfo: any) {
    const contract = getContract(contractId);
    if (!contract) return null;
    const disbursements = ((contract.financial.disbursements) as any[]);
    const disb = disbursements.find((d: any) => d.id === disbursementId);
    if (!disb) return null;
    disb.linkedLibrary = {
        libraryId: libraryInfo.libraryId,
        libraryName: libraryInfo.libraryName,
        evidenceStatus: libraryInfo.evidenceStatus || 'pending',
    };
    contract.modifiedAt = new Date().toISOString();
    _save();
    return contract;
}

/**
 * Unlink a library from a disbursement.
 * Remove vinculacao de library do desembolso.
 *
 * @param {string} contractId
 * @param {string} disbursementId
 * @returns {AnyRecord|null}
 */
export function unlinkLibraryFromDisbursement(contractId: any, disbursementId: any) {
    const contract = getContract(contractId);
    if (!contract) return null;
    const disbursements = ((contract.financial.disbursements) as any[]);
    const disb = disbursements.find((d: any) => d.id === disbursementId);
    if (!disb) return null;
    disb.linkedLibrary = null;
    contract.modifiedAt = new Date().toISOString();
    _save();
    return contract;
}

/**
 * Sync evidence status with installed libraries.
 * Sincroniza evidenceStatus com base nas libraries ativas.
 * Recebe funcao para evitar import circular (governance ← libraries).
 *
 * @param {Function} isActiveFn - (libraryId) => boolean
 */
export function syncLibraryEvidence(isActiveFn: any) {
    for (const contract of contracts) {
        for (const disb of contract.financial.disbursements) {
            if (disb.linkedLibrary) {
                const active = isActiveFn(disb.linkedLibrary.libraryId);
                disb.linkedLibrary.evidenceStatus = active ? 'delivered' : 'pending';
            }
        }
    }
    _save();
}

/**
 * Get evidence summary for a contract.
 * Resumo de evidencias vinculadas aos desembolsos.
 *
 * @param {string} contractId
 * @returns {AnyRecord|null} - { total, delivered, pending }
 */
export function getEvidenceSummary(contractId: any) {
    const contract = getContract(contractId);
    if (!contract) return null;
    let total = 0,
        delivered = 0,
        pending = 0;
    for (const d of contract.financial.disbursements) {
        if (d.linkedLibrary) {
            total++;
            if (d.linkedLibrary.evidenceStatus === 'delivered') delivered++;
            else pending++;
        }
    }
    return { total, delivered, pending };
}

// ----------------------------------------------------------------
// FINANCIAL CALCULATIONS
// ----------------------------------------------------------------

/**
 * Calculate financial summary for a contract.
 * Calcula resumo financeiro - total pago, restante, vencido.
 *
 * @param {string} contractId
 * @returns {AnyRecord|null} - { totalValue, totalPaid, totalScheduled, totalOverdue, remaining }
 */
export function getContractFinancialSummary(contractId: any) {
    const contract = getContract(contractId);
    if (!contract) return null;
    const now = new Date().toISOString().split('T')[0]!;
    // Delega agregação para _contractFinancialPure (math pura testável).
    return computeFinancialSummary(contract.financial.disbursements, contract.financial.totalValue, now);
}

/**
 * Evaluate KPIs and calculate bonus/malus for a contract.
 * Avalia KPIs e calcula bonus/malus vinculados ao desempenho.
 *
 * @param {string} contractId
 * @param {Array<any>} wbsItems - WBS items linked to this contract
 * @returns {AnyRecord} - { bonusTotal, malusTotal, details: [] }
 */
export function evaluateKPIs(contractId: any, wbsItems: any = []) {
    const contract = getContract(contractId);
    if (!contract) return { bonusTotal: 0, malusTotal: 0, details: [] };
    // Delega bonus/malus para _contractFinancialPure (caller monta Map kpiId→wbsItem).
    const wbsById = new Map((wbsItems as any[]).map((w: any) => [w.id, w]));
    return evaluateContractKpis(contract.financial.bonusMalus, wbsById as any, contract.financial.totalValue);
}

// ----------------------------------------------------------------
// ELEMENT LINKING
// ----------------------------------------------------------------

/**
 * Link an element to a contract.
 * @param {string} contractId
 * @param {string} elementId
 */
export function linkElement(contractId: any, elementId: any) {
    const contract = getContract(contractId);
    if (!contract) return;
    if (!contract.linkedElements.includes(elementId)) {
        contract.linkedElements.push(elementId);
        contract.modifiedAt = new Date().toISOString();
        _save();
    }
}

/**
 * Unlink an element from a contract.
 * @param {string} contractId
 * @param {string} elementId
 */
export function unlinkElement(contractId: any, elementId: any) {
    const contract = getContract(contractId);
    if (!contract) return;
    const idx = contract.linkedElements.indexOf(elementId);
    if (idx !== -1) {
        contract.linkedElements.splice(idx, 1);
        contract.modifiedAt = new Date().toISOString();
        _save();
    }
}

// ----------------------------------------------------------------
// INSURANCE - Seguros vinculados a compras do marketplace
// ----------------------------------------------------------------

/**
 * Get the insurance catalog.
 * Retorna catalogo de seguros disponiveis para UI.
 * @returns {AnyRecord}
 */
export function getInsuranceCatalog() {
    return INSURANCE_CATALOG;
}

/**
 * Calculate insurance premium in cents.
 * Calcula premio do seguro baseado no preco da library.
 *
 * @param {number} libraryPriceCents - Preco da library em centavos
 * @param {string} subtype - Subtipo do seguro (key do catalogo)
 * @returns {number} Premium em centavos
 */
export function calculatePremium(libraryPriceCents: any, subtype: any) {
    for (const cat of Object.values(INSURANCE_CATALOG_BY_CATEGORY)) {
        if ((cat as any)[subtype]) {
            // Delega cálculo para _contractFinancialPure (floor + round pura).
            return computeInsurancePremium(libraryPriceCents, (cat as any)[subtype].pctOfPrice, INSURANCE_FLOOR_CENTS);
        }
    }
    return INSURANCE_FLOOR_CENTS;
}

/**
 * Find catalog entry for a subtype.
 * Busca entry do catalogo pelo subtipo.
 * @param {string} subtype
 * @returns {{ category: string, entry: AnyRecord }|null}
 */
function _findCatalogEntry(subtype: any) {
    for (const [category, entries] of Object.entries(INSURANCE_CATALOG_BY_CATEGORY)) {
        if ((entries as any)[subtype]) return { category, entry: (entries as any)[subtype] };
    }
    return null;
}

/**
 * Add an insurance contract from purchase data.
 * Cria contrato de seguro a partir de dados da compra.
 *
 * @param {AnyRecord} data - { subtype, linkedOrderId, linkedLibraryId, premiumCents, coverageValueCents, userName }
 * @returns {AnyRecord} Created insurance contract
 */
export function addInsuranceContract(data: any) {
    const catalogInfo = _findCatalogEntry(data.subtype);
    const months = catalogInfo?.entry?.months || 12;
    const category = catalogInfo?.category || 'warranty';

    const now = new Date();
    const expires = new Date(now);
    expires.setMonth(expires.getMonth() + months);

    /** @param {number} notes */
    const pad = (n: any) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const rand = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    const policyNumber = `INS-${dateStr}-${rand}`;

    return addContract({
        name: `${policyNumber}`,
        type: 'insurance',
        status: 'active',
        parties: [
            { role: 'insured', name: data.userName || '', registry: '', signedAt: now.toISOString() },
            { role: 'insurer', name: 'ecbyts Platform', registry: '', signedAt: now.toISOString() },
        ],
        financial: {
            totalValue: (data.premiumCents || 0) / 100,
            currency: data.currency || 'USD',
        },
        dates: {
            effectiveDate: now.toISOString().split('T')[0],
            expirationDate: expires.toISOString().split('T')[0],
        },
        insurance: {
            category,
            subtype: data.subtype,
            linkedOrderId: data.linkedOrderId || '',
            linkedLibraryId: data.linkedLibraryId || '',
            premiumCents: data.premiumCents || 0,
            coverageValueCents: data.coverageValueCents || 0,
            coveragePeriodMonths: months,
            policyNumber,
            claimStatus: 'none',
            claimDate: null,
            claimNotes: '',
        },
    });
}

/**
 * File an insurance claim.
 * Registra sinistro em um contrato de seguro.
 *
 * @param {string} notes
 * @param {string} notes - Descricao do sinistro
 * @returns {AnyRecord|null}
 */
export function fileInsuranceClaim(contractId: any, notes: any) {
    const contract = getContract(contractId);
    if (!contract || contract.type !== 'insurance' || !contract.insurance) return null;
    if (contract.insurance.claimStatus !== 'none') return null;

    contract.insurance.claimStatus = 'filed';
    contract.insurance.claimDate = new Date().toISOString();
    contract.insurance.claimNotes = notes || '';
    contract.modifiedAt = new Date().toISOString();
    _save();
    return contract;
}

/**
 * Get all insurance contracts.
 * Retorna apenas contratos do tipo seguro.
 * @returns {Array<any>}
 */
export function getInsuranceContracts() {
    return contracts.filter((c: any) => c.type === 'insurance');
}

/**
 * Get insurance contracts linked to a specific order/purchase.
 * Busca seguros vinculados a uma compra especifica.
 *
 * @param {string} orderId - Order or purchase UUID
 * @returns {Array<any>}
 */
export function getInsuranceByPurchase(orderId: any) {
    return contracts.filter((c: any) => c.type === 'insurance' && c.insurance && c.insurance.linkedOrderId === orderId);
}

/**
 * Check and update expired insurance contracts.
 * Avaliacao lazy de expiracao - chamada ao renderizar.
 */
export function checkInsuranceExpiry() {
    const now = new Date().toISOString().split('T')[0]!;
    for (const c of contracts) {
        if (c.type === 'insurance' && c.status === 'active' && c.dates.expirationDate && c.dates.expirationDate < now) {
            c.status = 'completed';
            if (c.insurance)
                c.insurance.claimStatus = c.insurance.claimStatus === 'none' ? 'none' : c.insurance.claimStatus;
            c.modifiedAt = new Date().toISOString();
        }
    }
}

// ----------------------------------------------------------------
// SERIALIZATION
// ----------------------------------------------------------------

/**
 * Export contracts for model serialization.
 * Exporta contratos para serializacao do modelo.
 *
 * @returns {Array<any>}
 */
export function exportContracts() {
    return contracts.map((c: any) => ({ ...c }));
}

/**
 * Import contracts from model data.
 * Importa contratos de dados do modelo.
 *
 * @param {Array<any>} data
 */
export function importContracts(data: any) {
    contracts = [];
    if (!Array.isArray(data)) return;
    for (const item of data) {
        contracts.push({
            id: item.id || `contract-${Date.now()}`,
            name: item.name || '',
            type: item.type || 'custom',
            status: item.status || 'draft',
            parties: item.parties || [],
            financial: {
                totalValue: item.financial?.totalValue || 0,
                currency: item.financial?.currency || 'BRL',
                disbursements: ((item.financial?.disbursements || []) as any[]).map((d: any) => ({
                    id: d.id || generateId('disb'),
                    date: d.date || '',
                    amount: d.amount || 0,
                    description: d.description || '',
                    status: d.status || 'scheduled',
                    linkedLibrary: d.linkedLibrary || null
                })),
                bonusMalus: item.financial?.bonusMalus || [],
            },
            dates: item.dates || {},
            linkedElements: item.linkedElements || [],
            linkedWbsItems: item.linkedWbsItems || [],
            notes: item.notes || '',
            insurance: item.insurance || null,
            creditTerms:
                item.type === 'credit_agreement'
                    ? (() => {
                          try {
                              return _normalizeCreditTerms(item.creditTerms || {});
                          } catch {
                              return null;
                          }
                      })()
                    : null,
            createdAt: item.createdAt || new Date().toISOString(),
            modifiedAt: item.modifiedAt || new Date().toISOString(),
        });
    }
    _save();
}
