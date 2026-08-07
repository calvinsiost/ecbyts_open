// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Module/Handler Context Menu — F2 pure helpers (SPEC_MODULE_PROVENANCE_LIBRARIES_NAV)
//
// Helpers puros (sem DOM, sem i18n resolvido, sem rede) consumidos pela
// integração F3 com `utils/ui/globalContextMenu.js`. Mantêm o mesmo
// princípio do F1 wrapper: NÃO duplicam autoria/cadeia/materialidade —
// derivam tudo de `getModuleProvenance` (delegado a provenanceModel).
//
// Por que helpers puros aqui (F2) e wiring no consumer (F3):
// - `globalContextMenu.js` é codemod-governed (TS source) → integração
//   real é claude-executor scope. Estes helpers ficam fora do codemod e
//   são consumidos via import direto pelo consumer.
// - Cheap-testáveis em Node (sem browser).
//
// Convenções:
// - Itens emitem `labelKey` (chave i18n) — consumer resolve com `t()`.
// - Badge de autoria é não-só-cor: `{ icon, labelKey, tone }`.
// - `aiOperatedByUser` aparece SEMPRE quando actor=ai (accountability BP3).

/** Item canônico p/ o menu de contexto de um módulo. */
const MENU_ITEM_IDS = Object.freeze({
    OPEN_LIBRARIES: 'module.prov.menuLibraries',
    SHOW_PROVENANCE: 'module.prov.menuProvenance',
});

/**
 * Monta a lista de itens do menu de contexto de um módulo/handler.
 *
 * Cada item é `{ id, labelKey, action, disabled, payload }`:
 * - `id`: identificador estável (não-i18n) para hooks/telemetria.
 * - `labelKey`: chave i18n (consumer resolve).
 * - `action`: nome simbólico do handler a invocar.
 * - `disabled`: true quando a capability não está disponível.
 * - `payload`: dados para o handler (moduleId).
 *
 * Itens disabled aparecem com aria-disabled — não somem (descoberta).
 *
 * @param {{moduleId:string, canOpenLibraries?:boolean, canShowProvenance?:boolean}} input
 * @returns {Array<{id:string, labelKey:string, action:string, disabled:boolean, payload:{moduleId:string}}>}
 */
export function buildModuleMenuItems(input: any) {
    if (!input || typeof input !== 'object') {
        throw new TypeError('buildModuleMenuItems: input must be object');
    }
    const moduleId = input.moduleId;
    if (typeof moduleId !== 'string' || moduleId === '') {
        throw new TypeError('buildModuleMenuItems: moduleId required (non-empty string)');
    }
    const canOpenLibraries = input.canOpenLibraries !== false;
    const canShowProvenance = input.canShowProvenance !== false;
    return [
        {
            id: 'open-libraries',
            labelKey: MENU_ITEM_IDS.OPEN_LIBRARIES,
            action: 'handleOpenLibrariesForModule',
            disabled: !canOpenLibraries,
            payload: { moduleId },
        },
        {
            id: 'show-provenance',
            labelKey: MENU_ITEM_IDS.SHOW_PROVENANCE,
            action: 'handleShowModuleProvenance',
            disabled: !canShowProvenance,
            payload: { moduleId },
        },
    ];
}

/**
 * Resolve o badge não-só-cor para um valor de authorship.
 * Retorna `{ icon, labelKey, tone }` — consumer renderiza ícone + texto.
 *
 * Tones: 'neutral' (human), 'ai' (ai), 'mixed' (mixed).
 * Ícones são caracteres HTML safe (sem dependência SVG aqui).
 *
 * @param {string|null|undefined} authorship  'human' | 'ai' | 'mixed'
 * @returns {{icon:string, labelKey:string, tone:string}}
 */
export function resolveAuthorshipBadge(authorship: any) {
    switch (authorship) {
        case 'ai':
            return { icon: '◆', labelKey: 'module.prov.badge.ai', tone: 'ai' }; // ◆
        case 'mixed':
            return { icon: '◉', labelKey: 'module.prov.badge.mixed', tone: 'mixed' }; // ◉
        case 'human':
        default:
            return { icon: '★', labelKey: 'module.prov.badge.human', tone: 'neutral' }; // ★
    }
}

/**
 * Constrói o payload i18n para "operado por <usuário>" / "por <usuário>".
 * Não resolve texto — devolve { templateKey, vars }.
 *
 * Quando actor=ai: `{ templateKey: 'module.prov.aiOperatedBy',
 *                     vars: { aiSystem, aiVersion, byUser } }`
 * Quando actor=human: `{ templateKey: 'module.prov.developedBy'|'validatedBy',
 *                       vars: { byUser } }`.
 *
 * @param {{role:'developed'|'validated', authorship:string, by:string|null, ai:{aiSystem:string|null, aiVersion:string|null}}} block
 * @returns {{templateKey:string, vars:Object}}
 */
export function formatAttribution(block: any) {
    if (!block || typeof block !== 'object') {
        throw new TypeError('formatAttribution: block must be object');
    }
    const role = block.role;
    if (role !== 'developed' && role !== 'validated') {
        throw new TypeError('formatAttribution: role must be developed|validated');
    }
    const authorship = block.authorship;
    const by = block.by != null ? String(block.by) : null;
    const ai = block.ai || {};
    if (authorship === 'ai' || authorship === 'mixed') {
        return {
            templateKey: 'module.prov.aiOperatedBy',
            vars: {
                aiSystem: ai.aiSystem != null ? String(ai.aiSystem) : null,
                aiVersion: ai.aiVersion != null ? String(ai.aiVersion) : null,
                byUser: by,
            },
        };
    }
    return {
        templateKey: role === 'developed' ? 'module.prov.developedBy' : 'module.prov.validatedBy',
        vars: { byUser: by },
    };
}

/**
 * View-model do painel de proveniência. Consome `getModuleProvenance`
 * (output do F1 wrapper). NÃO recalcula authorship/chain — apenas
 * organiza para renderização.
 *
 * Output:
 * ```
 * {
 *   moduleId,
 *   blocks: [
 *     { role:'developed', badge, attribution, chainLength },
 *     { role:'validated', badge, attribution, chainLength },
 *   ],
 *   exportSbomAction: { action, payload, labelKey },
 * }
 * ```
 *
 * @param {{moduleId:string, developed:Object, validated:Object, chain?:Object}} moduleProv
 * @returns {{moduleId:string, blocks:Array, exportSbomAction:Object}}
 */
export function buildProvenancePanelModel(moduleProv: any) {
    if (!moduleProv || typeof moduleProv !== 'object') {
        throw new TypeError('buildProvenancePanelModel: moduleProv must be object');
    }
    const moduleId = moduleProv.moduleId;
    if (typeof moduleId !== 'string' || moduleId === '') {
        throw new TypeError('buildProvenancePanelModel: moduleProv.moduleId required');
    }
    const chain = moduleProv.chain || {};
    const blocks = ['developed', 'validated'].map((role: any) => {
        const blk = moduleProv[role] || { authorship: 'human', by: null, ai: { aiSystem: null, aiVersion: null } };
        const badge = resolveAuthorshipBadge(blk.authorship);
        const attribution = formatAttribution({
            role,
            authorship: blk.authorship,
            by: blk.by,
            ai: blk.ai || { aiSystem: null, aiVersion: null },
        });
        const c = Array.isArray(chain[role]) ? chain[role] : [];
        return {
            role,
            roleKey: role === 'developed' ? 'module.prov.developedBy' : 'module.prov.validatedBy',
            badge,
            attribution,
            chainLength: c.length,
        };
    });
    return {
        moduleId,
        blocks,
        exportSbomAction: {
            action: 'handleExportModuleSbom',
            payload: { moduleId },
            labelKey: 'module.prov.exportSbom',
        },
    };
}

/**
 * IDs públicos de chave i18n p/ os itens de menu. Útil em testes / hooks
 * que verificam o contrato sem hard-codar strings duplicadas.
 */
export const MODULE_MENU_KEYS = MENU_ITEM_IDS;
