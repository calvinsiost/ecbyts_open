// @ts-check
// Generated from src/app/js/utils/cloud/validation.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   VALIDATION — Professional validation tag on model elements
   Tag de validacao profissional nos elementos do modelo

   CONCEITO:
   Quando um profissional verificado (com assinatura ativa) valida
   elementos de um modelo, esses elementos recebem um selo que:
   - Viaja com o modelo (no campo professionalValidation)
   - E exibido na UI como badge visual
   - Influencia o comportamento da IA no chat

   ATTEST-001 (eixo E5 — TEMPORALIDADE) — BUG DE VERACIDADE CORRIGIDO:
   Este selo gravava `subscriptionActive` como BOOLEANO no momento da validacao,
   e esse booleano VIAJAVA dentro do .ecbt exportado. Consequencia: um modelo
   exportado hoje continuava afirmando `subscriptionActive: true` indefinidamente,
   mesmo depois de a assinatura do profissional expirar ou ser cancelada. O
   arquivo afirmava um fato que deixara de ser verdade, e nao havia como corrigir
   sem reexportar.

   A CORRECAO: um booleano nao consegue ser honesto sobre o tempo. O que se sabe
   e sempre "no instante X, o estado era Y" — nunca "o estado E Y, para sempre".
   Por isso o que se grava agora e QUANDO o estado foi observado
   (`subscriptionCheckedAt`) e, se conhecido, ate quando ele vale
   (`subscriptionValidUntil`); o estado presente e DERIVADO na leitura por
   {@link getSubscriptionAssertion}.

   IMPORTANTE — nao ha data de expiracao de assinatura disponivel no perfil
   (a sessao so expoe `subscription_status`). Logo `subscriptionValidUntil` fica
   `null` (semDado) em vez de receber data forjada: data inventada e
   indistinguivel de data real, o que e pior que ausencia. Enquanto nao existir
   verificacao server-side (ATTEST-001 RF-7), a UI exibe "valido em <data>" e
   NUNCA "ativo".

   FORMATO NO MODELO:
   {
     professionalValidation: {
       validatedBy: "email",
       councilId: "CREA-SP 123456",
       displayName: "Eng. Joao Silva",
       validatedAt: "2026-02-22T10:00:00Z",
       subscriptionCheckedAt: "2026-02-22T10:00:00Z",
       subscriptionValidUntil: null,
       elements: ["well-1", "plume-1"]
     }
   }
   ================================================================ */
import { getCurrentUser } from '../auth/session.js';
type ValidationData = {
    validatedBy: string;
    councilId: string;
    displayName: string;
    validatedAt: string;
    /** Instante em que o estado da assinatura foi DE FATO observado. */
    subscriptionCheckedAt: string | null;
    /** Fim de vigencia conhecido da assinatura, ou null (semDado). NUNCA forjado. */
    subscriptionValidUntil: string | null;
    /**
     * @deprecated Booleano legado. Mantido SOMENTE para ler .ecbt antigos sem
     * quebra (RF-8). Nunca leia isto como estado presente — use
     * {@link getSubscriptionAssertion}. Ao ser lido de arquivo antigo, significa
     * apenas "era esse o estado em `validatedAt`", jamais "e esse o estado agora".
     */
    subscriptionActive: boolean;
    elements: string[];
};
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
/**
 * @typedef {Object} ValidationData
 * @property {string} validatedBy
 * @property {string} councilId
 * @property {string} displayName
 * @property {string} validatedAt
 * @property {boolean} subscriptionActive
 * @property {string[]} elements
 */
let validationData: ValidationData | null = null;
// ----------------------------------------------------------------
// EXPORT / IMPORT
// ----------------------------------------------------------------
/**
 * Export professional validation data for model export.
 * Exporta dados de validacao profissional para inclusao no modelo.
 *
 * @returns {Object|null} - Dados de validacao ou null se nao aplicavel
 */
export function exportProfessionalValidation() {
    if (!validationData) return null;
    const user = /** @type {any} */ (getCurrentUser());
    // Se o usuario atual E o validador, o estado da assinatura pode ser
    // REOBSERVADO agora — e o que se grava e o instante da observacao, nao um
    // veredito atemporal. Se a assinatura nao estiver ativa, nao ha observacao
    // positiva a registrar: `subscriptionCheckedAt` volta a null (semDado), o que
    // faz a leitura degradar para "vigencia nao confirmada" em vez de afirmar
    // atividade que nao se constatou.
    if (user && validationData.validatedBy === user.email) {
        const activeNow = user.subscriptionStatus === 'active';
        validationData.subscriptionCheckedAt = activeNow ? new Date().toISOString() : null;
        validationData.subscriptionActive = activeNow;
    }
    return { ...validationData, elements: [...(validationData.elements || [])] };
}
/**
 * Import professional validation data from model.
 * Restaura dados de validacao profissional do modelo importado.
 *
 * @param {Object|null} data - Dados de validacao do modelo
 */
export function importProfessionalValidation(data: any) {
    if (!data) {
        validationData = null;
        return;
    }
    const d = /** @type {any} */ (data);
    // Compatibilidade com .ecbt ANTIGO (RF-8: migrar sem quebrar nada): arquivos
    // gravados antes desta correcao so tem o booleano. Ele NAO e promovido a
    // estado presente — no maximo testemunha o que era verdade em `validatedAt`,
    // e e isso que se registra como instante de observacao.
    const legacyActive = d.subscriptionActive === true;
    const checkedAt = typeof d.subscriptionCheckedAt === 'string' && d.subscriptionCheckedAt.length > 0
        ? d.subscriptionCheckedAt
        : (legacyActive && typeof d.validatedAt === 'string' && d.validatedAt.length > 0 ? d.validatedAt : null);
    validationData = {
        validatedBy: d.validatedBy || '',
        councilId: d.councilId || '',
        displayName: d.displayName || '',
        validatedAt: d.validatedAt || '',
        subscriptionCheckedAt: checkedAt,
        subscriptionValidUntil: typeof d.subscriptionValidUntil === 'string' && d.subscriptionValidUntil.length > 0
            ? d.subscriptionValidUntil
            : null,
        subscriptionActive: legacyActive,
        elements: Array.isArray(d.elements) ? [...d.elements] : [],
    };
}

/**
 * Estado DERIVADO da assinatura no instante da leitura — o antidoto ao booleano
 * congelado.
 *
 * Regra de honestidade (ATTEST-001 E5): enquanto nao houver verificacao
 * server-side (RF-7), nada aqui pode afirmar "ativo". O maximo que se sabe e que
 * em determinada data o estado foi observado como ativo — o que continua verdade
 * para sempre, ao contrario de "ativo".
 *
 * @param {string|Date} [at] - instante da avaliacao (default: agora)
 * @returns {{ state: 'unknown'|'observed'|'valid'|'expired', label: string,
 *   checkedAt: string|null, validUntil: string|null }}
 */
export function getSubscriptionAssertion(at: string | Date = new Date()) {
    if (!validationData) {
        return { state: 'unknown' as const, label: 'Sem validacao profissional', checkedAt: null, validUntil: null };
    }
    const checkedAt = validationData.subscriptionCheckedAt;
    const validUntil = validationData.subscriptionValidUntil;
    const nowMs = at instanceof Date ? at.getTime() : new Date(at).getTime();

    // Com fim de vigencia conhecido, o estado presente E derivavel de verdade.
    if (typeof validUntil === 'string' && validUntil.length > 0) {
        const untilMs = new Date(validUntil).getTime();
        if (Number.isFinite(untilMs) && Number.isFinite(nowMs)) {
            return untilMs >= nowMs
                ? { state: 'valid' as const, label: `Assinatura valida ate ${validUntil.slice(0, 10)}`, checkedAt, validUntil }
                : { state: 'expired' as const, label: `Assinatura expirou em ${validUntil.slice(0, 10)}`, checkedAt, validUntil };
        }
    }

    // Sem fim de vigencia (o caso real hoje): so se pode afirmar a OBSERVACAO.
    if (typeof checkedAt === 'string' && checkedAt.length > 0) {
        return {
            state: 'observed' as const,
            label: `Assinatura ativa constatada em ${checkedAt.slice(0, 10)} (nao reverificada desde entao)`,
            checkedAt,
            validUntil,
        };
    }

    return {
        state: 'unknown' as const,
        label: 'Vigencia da assinatura nao confirmada',
        checkedAt,
        validUntil,
    };
}
/**
 * Reset validation data (e.g. on model clear).
 * Reseta dados de validacao.
 */
export function resetValidation() {
    validationData = null;
}
// ----------------------------------------------------------------
// VALIDATION OPERATIONS
// ----------------------------------------------------------------
/**
 * Validate elements with current user's professional credentials.
 * Marca elementos como validados pelo profissional atual.
 *
 * @param {string[]} elementIds - IDs dos elementos a validar
 * @returns {boolean} - true se validou com sucesso
 */
export function validateElements(elementIds: string[]) {
    const user = /** @type {any} */ (getCurrentUser());
    if (!user) return false;
    if (user.professionalStatus !== 'approved') return false;
    if (user.subscriptionStatus !== 'active') return false;
    if (!validationData) {
        validationData = {
            validatedBy: user.email || '',
            councilId: '', // will be filled from profile
            displayName: user.displayName || '',
            validatedAt: new Date().toISOString(),
            subscriptionCheckedAt: new Date().toISOString(),
            // semDado: o perfil expoe `subscription_status`, nunca uma data de fim
            // de vigencia. Forjar uma aqui produziria data indistinguivel de real.
            subscriptionValidUntil: null,
            subscriptionActive: true,
            elements: [],
        };
    }
    const vd = validationData;
    // Update validator info
    vd.validatedBy = user.email || '';
    vd.displayName = user.displayName || '';
    vd.validatedAt = new Date().toISOString();
    // O guard acima ja constatou `user.subscriptionStatus === 'active'` — e ISTO
    // que se registra: a observacao e seu instante, nao um veredito perpetuo.
    vd.subscriptionCheckedAt = new Date().toISOString();
    vd.subscriptionActive = true;
    // Add new elements (avoid duplicates)
    const existing = /** @type {Set<string>} */ (new Set(vd.elements));
    for (const id of elementIds) {
        existing.add(id);
    }
    vd.elements = [...existing];
    return true;
}
/**
 * Set council ID on validation data (from profile fetch).
 * Define o council_id nos dados de validacao.
 *
 * @param {string} councilId
 */
export function setValidationCouncilId(councilId: string) {
    if (validationData) {
        validationData.councilId = councilId;
    }
}
/**
 * Remove validation from specific elements.
 * Remove validacao de elementos especificos.
 *
 * @param {string[]} elementIds - IDs dos elementos
 */
export function removeValidation(elementIds: string[]) {
    if (!validationData) return;
    const toRemove = /** @type {Set<string>} */ (new Set(elementIds));
    validationData.elements = validationData.elements.filter((id: string) => !toRemove.has(id));
    if (validationData.elements.length === 0) {
        validationData = null;
    }
}
// ----------------------------------------------------------------
// QUERIES
// ----------------------------------------------------------------
/**
 * Check if a specific element has professional validation.
 * Verifica se um elemento tem validacao profissional.
 *
 * @param {string} elementId
 * @returns {boolean}
 */
export function isElementValidated(elementId: string) {
    return validationData?.elements?.includes(elementId) || false;
}
/**
 * Get validation info for the current model.
 * Retorna informacoes de validacao do modelo atual.
 *
 * @returns {Object|null} - Dados de validacao ou null
 */
export function getValidationInfo() {
    if (!validationData) return null;
    return {
        ...validationData,
        elements: [...(validationData.elements || [])],
    };
}
/**
 * Check if model has any professional validation.
 * Verifica se o modelo tem alguma validacao profissional.
 *
 * @returns {boolean}
 */
export function hasValidation() {
    return validationData !== null && validationData.elements.length > 0;
}
/**
 * Get validated element count.
 * @returns {number}
 */
export function getValidatedCount() {
    return validationData?.elements?.length || 0;
}
//# sourceMappingURL=validation.js.map
