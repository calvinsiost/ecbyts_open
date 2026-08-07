// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Report AI/Human Provenance Mask — pure-logic model (F1)
//
// Modelo puro de proveniência (autoria) para regiões de relatório.
// Alinhado com C2PA, IPTC Photo Metadata 2025.1 e EU AI Act Art. 50.
//
// Princípios:
// - Sem DOM, rede, THREE ou efeitos colaterais.
// - Determinístico: nenhuma dependência de Date.now() / Math.random().
//   A ordenação é derivada apenas dos dados fornecidos (sort de regionIds).
// - APPEND-ONLY: a cadeia de proveniência de cada região nunca tem
//   entradas removidas ou sobrescritas (marca não-removível — EU AI Act Art. 50).
// - Privacy-aware: a divulgação legível por máquina pode remover o texto
//   do prompt preservando o sistema/versão de IA (boa prática IPTC).
//
// Backward-safe: uma região/relatório sem qualquer entrada de proveniência
// é tratada como 'human' (relatórios legados não são afetados).

/**
 * Cria um store de proveniência opaco, simples e serializável.
 *
 * O store NÃO é um singleton de módulo: todas as funções recebem o store
 * como primeiro argumento. Estratégia escolhida: MUTATE-AND-RETURN — as
 * funções que alteram estado mutam o store fornecido e o retornam (o store
 * é considerado de propriedade do chamador).
 *
 * @returns {{ regions: Object }} Store serializável: `regions` mapeia
 *   `regionId` → `{ chain: Array }`.
 */
export function createProvenanceStore(): { regions: Record<string, any> } {
    return { regions: {} };
}

/**
 * Anexa uma entrada de proveniência à cadeia de uma região (APPEND-ONLY).
 *
 * Cada chamada empurra uma nova entrada para `chain[]` da região. Entradas
 * existentes NUNCA são removidas ou sobrescritas (marca não-removível).
 * Não existe API de remoção/edição por design.
 *
 * @param {{ regions: Object }} store Store de proveniência.
 * @param {string} store Identificador da região do relatório.
 * @param {Object} regionId Dados da entrada.
 * @param {'human'|'ai'} entry.actor Quem realizou a ação.
 * @param {string} [entry.aiSystem] Nome do sistema de IA (se actor='ai').
 * @param {string} [entry.aiVersion] Versão do sistema de IA.
 * @param {string} [entry.action] Ação realizada (texto livre).
 * @param {boolean} [entry.material=true] Materialidade: `true` para
 *   contribuição substantiva de IA; `false` para IA incidental
 *   (não torna a região 'ai' — limiar de materialidade, IAB).
 * @returns {{ regions: Object }} O mesmo store, mutado.
 */
export function tagRegionProvenance(store: any, regionId: any, entry: any): { regions: Record<string, any> } {
    const e = entry || {};
    const actor = e.actor === 'ai' ? 'ai' : 'human';
    const material = e.material === undefined ? true : Boolean(e.material);
    const record: Record<string, any> = {
        actor,
        aiSystem: e.aiSystem !== undefined ? e.aiSystem : null,
        aiVersion: e.aiVersion !== undefined ? e.aiVersion : null,
        action: e.action !== undefined ? e.action : null,
        material,
    };
    // Preserva, sem alterar, qualquer informação de prompt fornecida.
    if (e.aiPromptInformation !== undefined) {
        record.aiPromptInformation = e.aiPromptInformation;
    }
    if (e.promptInformation !== undefined) {
        record.promptInformation = e.promptInformation;
    }
    if (!store.regions[regionId]) store.regions[regionId] = { chain: [] };
    store.regions[regionId].chain.push(record);
    return store;
}

/**
 * Deriva a autoria de uma região a partir de sua cadeia.
 *
 * Regras:
 * - Sem cadeia / sem entradas → 'human' (backward-safe).
 * - Apenas atores 'human' → 'human'.
 * - Apenas IA material (`material=true`) → 'ai'.
 * - Ambos presentes (humano editou região de IA ou vice-versa) → 'mixed'.
 * - IA apenas incidental (`material=false`) NÃO torna a região 'ai'
 *   (limiar de materialidade); conta como contribuição não-substantiva,
 *   portanto a autoria recai sobre os atores humanos, ou 'human' na ausência.
 *
 * @param {{ regions: Object }} store Store de proveniência.
 * @param {string} store Identificador da região.
 * @returns {'human'|'ai'|'mixed'} Autoria derivada.
 */
export function getRegionAuthorship(store: any, regionId: any): 'human'|'ai'|'mixed' {
    const region = store.regions[regionId];
    const chain = region && Array.isArray(region.chain) ? region.chain : [];
    if (chain.length === 0) return 'human';
    let hasHuman = false;
    let hasMaterialAi = false;
    for (const entry of chain) {
        if (entry.actor === 'human') hasHuman = true;
        else if (entry.actor === 'ai' && entry.material) hasMaterialAi = true;
    }
    if (hasHuman && hasMaterialAi) return 'mixed';
    if (hasMaterialAi) return 'ai';
    return 'human';
}

/**
 * Calcula a materialidade de `chain` (booleano) considerando apenas
 * entradas de IA materiais como contribuição substantiva.
 *
 * @param {Array} chain Cadeia de proveniência.
 * @returns {boolean} `true` se houver ao menos uma entrada de IA material.
 */
function chainIsMaterial(chain: any): boolean {
    for (const entry of chain) {
        if (entry.actor === 'ai' && entry.material) return true;
    }
    return false;
}

/**
 * Constrói o objeto de proveniência completo do relatório.
 *
 * Ordenação determinística: regionIds são ordenados (sort estável de
 * string). Percentuais são calculados sobre a contagem de regiões;
 * 0 regiões → todos os percentuais 0 (sem NaN).
 *
 * @param {{ regions: Object }} store Store de proveniência.
 * @returns {{ regions: Array, summary: Object }} Proveniência agregada.
 */
export function getReportProvenance(store: any): { regions: Array<any>, summary: Record<string, any> } {
    const ids = Object.keys(store.regions).sort();
    const regions = [];
    let aiCount = 0;
    let humanCount = 0;
    let mixedCount = 0;
    for (const id of ids) {
        const chain = store.regions[id].chain;
        const authorship = getRegionAuthorship(store, id);
        if (authorship === 'ai') aiCount++;
        else if (authorship === 'mixed') mixedCount++;
        else humanCount++;
        regions.push({
            id,
            authorship,
            chain: chain.slice(),
            material: chainIsMaterial(chain),
        });
    }
    const total = ids.length;
    const pct = (n: any) => total === 0 ? 0 : (n / total) * 100;
    return {
        regions,
        summary: {
            aiPct: pct(aiCount),
            humanPct: pct(humanCount),
            mixedPct: pct(mixedCount),
        },
    };
}

/**
 * Produz um objeto de divulgação legível por máquina, adequado para
 * embutir em metadados de exportação.
 *
 * Preserva a divulgação (AISystemUsed / Version). Quando `stripPrompt`
 * é `true` (padrão), NUNCA inclui texto de prompt
 * (`aiPromptInformation` / `promptInformation`), mesmo que presente na
 * cadeia (privacy-aware — boa prática IPTC). Para cada região, o sistema
 * e a versão de IA reportados são os da última entrada de IA presente.
 *
 * @param {{ regions: Object }} store Store de proveniência.
 * @param {Object} [store] Opções.
 * @param {boolean} [opts.stripPrompt=true] Remove texto de prompt.
 * @returns {{ regions: Array }} Metadados de divulgação por região.
 */
export function toDisclosureMetadata(store: any, opts: any): { regions: Array<any> } {
    const stripPrompt = !opts || opts.stripPrompt === undefined ? true : Boolean(opts.stripPrompt);
    const ids = Object.keys(store.regions).sort();
    const regions = ids.map((id) => {
        const chain = store.regions[id].chain;
        let aiSystem = null;
        let aiVersion = null;
        for (const entry of chain) {
            if (entry.actor === 'ai') {
                if (entry.aiSystem !== undefined && entry.aiSystem !== null) aiSystem = entry.aiSystem;
                if (entry.aiVersion !== undefined && entry.aiVersion !== null) aiVersion = entry.aiVersion;
            }
        }
        const out: Record<string, any> = {
            id,
            authorship: getRegionAuthorship(store, id),
            aiSystem,
            aiVersion,
        };
        if (!stripPrompt) {
            for (const entry of chain) {
                if (entry.aiPromptInformation !== undefined) {
                    out.aiPromptInformation = entry.aiPromptInformation;
                }
                if (entry.promptInformation !== undefined) {
                    out.promptInformation = entry.promptInformation;
                }
            }
        }
        return out;
    });
    return { regions };
}

/**
 * Classifica a materialidade de uma ação (heurística pura, documentada).
 *
 * Limiares documentados:
 * - actor humano (sem ação de IA) → 'human'.
 * - IA que gera conteúdo (`action` contém 'generate'/'create'/'write'/
 *   'draft'/'compose') OU inserção grande (`charsInserted` ≥ 40) →
 *   'ai-substantive'.
 * - IA com preenchimento trivial (inserção pequena, `charsInserted` < 40,
 *   ex.: default de um único campo) → 'ai-incidental'.
 *
 * @param {Object} input Dados da ação.
 * @param {string} [input.action] Descrição da ação.
 * @param {number} [input.charsInserted] Caracteres inseridos.
 * @returns {'ai-substantive'|'ai-incidental'|'human'} Classe de materialidade.
 */
export function classifyMateriality(input: any): 'ai-substantive'|'ai-incidental'|'human' {
    const i = input || {};
    const action = typeof i.action === 'string' ? i.action.toLowerCase() : '';
    const chars = typeof i.charsInserted === 'number' ? i.charsInserted : 0;
    const SUBSTANTIVE_CHAR_THRESHOLD = 40;
    if (i.actor === 'human') return 'human';
    const generative = /(generate|create|write|draft|compose)/.test(action);
    if (generative || chars >= SUBSTANTIVE_CHAR_THRESHOLD) return 'ai-substantive';
    if (action || chars > 0) return 'ai-incidental';
    return 'human';
}
