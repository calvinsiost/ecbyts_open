// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
/* ================================================================
   HUD MINIMIZE REGISTRY — pure-logic (no DOM)
   ================================================================

   Calvin 2026-06-19: "ao minimizar os HUDs do DOM principal eles ficam
   em mini caixinhas no rodapé recolhidos (similar aos painéis laterais)".

   Hoje os HUDs (cards intangíveis, scene-hud, equipment) só têm
   expand/collapse individual — NÃO viram chip recolhido no rodapé como
   os painéis laterais (panelManager #min-tabs-bottom). Esta camada PURA
   modela o ESTADO de minimização dos HUDs (qual está minimizado, a ordem
   dos chips no rodapé, e a persistência), espelhando a semântica do
   minimizePanel/restorePanel SEM tocar no DOM — o wire DOM (reusando
   #min-tabs-bottom + restore por clique) é uma camada separada.

   Boas práticas (pesquisa 2026-06-19):
     - Consistência: um único modelo mental de "minimizar" (painel = HUD).
     - Minimizar reduz a só um chip rotulado; restaurar volta à posição.
     - Chip precisa de affordance clara (rótulo legível + clicável).
   Refs: W3C Design System (collapsible/affordance), Material 3 (docked
   toolbar/chips na borda), Figma UX lesson (docked > floating).

   Padrão do projeto: registry imutável (estado NUNCA mutado in-place),
   determinístico, frozen — igual aos demais _*Pure.
   ================================================================ */

/**
 * @typedef {Object} HudMinChip
 * @property {string} hudId      identificador estável do HUD (ex: 'hud-cards', 'scene-hud', 'equipment')
 * @property {string} label      rótulo legível exibido no chip do rodapé
 * @property {number} order      posição do chip (0-based, ordem de minimização)
 */

/**
 * @typedef {Object} HudMinRegistry
 * @property {ReadonlyArray<HudMinChip>} chips  HUDs atualmente minimizados (chips no rodapé), em ordem
 */

/** Cria um registry vazio (nenhum HUD minimizado). */
export function createHudMinRegistry(): { chips: ReadonlyArray<any> } {
    return Object.freeze({ chips: Object.freeze([]) });
}

/** True se o HUD está minimizado (tem chip no rodapé). */
export function isHudMinimized(registry: any, hudId: string): boolean {
    if (!registry || !Array.isArray(registry.chips)) return false;
    return registry.chips.some((c: any) => c && c.hudId === hudId);
}

/**
 * Minimiza um HUD: adiciona um chip ao final do rodapé. Idempotente — se
 * o HUD já está minimizado, retorna o registry inalterado (mesma referência
 * lógica de conteúdo). NÃO muta o registry de entrada.
 * @returns {HudMinRegistry} novo registry frozen
 */
export function minimizeHud(registry: any, hudId: string, label: string): { chips: ReadonlyArray<any> } {
    const base = registry && Array.isArray(registry.chips) ? registry.chips : [];
    if (typeof hudId !== 'string' || hudId.length === 0) return Object.freeze({ chips: Object.freeze([...base]) });
    if (base.some((c: any) => c && c.hudId === hudId)) {
        // já minimizado — no-op idempotente (retorna cópia frozen estável)
        return Object.freeze({ chips: Object.freeze(base.map(_freezeChip)) });
    }
    const safeLabel = typeof label === 'string' && label.length > 0 ? label : hudId;
    const next = [...base.map(_freezeChip), Object.freeze({ hudId, label: safeLabel, order: base.length })];
    return Object.freeze({ chips: Object.freeze(_reindex(next)) });
}

/**
 * Restaura um HUD: remove seu chip do rodapé e reindexa os restantes
 * (preservando a ordem relativa). NÃO muta o registry de entrada.
 * @returns {HudMinRegistry} novo registry frozen
 */
export function restoreHud(registry: any, hudId: string): { chips: ReadonlyArray<any> } {
    const base = registry && Array.isArray(registry.chips) ? registry.chips : [];
    const kept = base.filter((c: any) => c && c.hudId !== hudId);
    return Object.freeze({ chips: Object.freeze(_reindex(kept.map(_freezeChip))) });
}

/** Restaura TODOS os HUDs (esvazia o rodapé). */
export function restoreAllHuds(): { chips: ReadonlyArray<any> } {
    return createHudMinRegistry();
}

/** Lista os chips na ordem do rodapé (array novo, seguro p/ render). */
export function listMinChips(registry: any): ReadonlyArray<any> {
    if (!registry || !Array.isArray(registry.chips)) return [];
    return registry.chips.map(_freezeChip);
}

/**
 * Serializa o registry para persistência (localStorage). Só os campos
 * estáveis — formato versionado p/ migração futura.
 */
export function serializeHudMinRegistry(registry: any): string {
    const chips = (registry && Array.isArray(registry.chips) ? registry.chips : []).map((c: any) => ({
        hudId: String(c?.hudId ?? ''),
        label: String(c?.label ?? ''),
    }));
    return JSON.stringify({ v: 1, chips });
}

/**
 * Desserializa de localStorage. Fail-soft: entrada inválida → registry
 * vazio. Reconstrói a ordem a partir do array salvo.
 */
export function deserializeHudMinRegistry(raw: any): { chips: ReadonlyArray<any> } {
    if (typeof raw !== 'string' || raw.length === 0) return createHudMinRegistry();
    let parsed: any;
    try { parsed = JSON.parse(raw); }
    catch { return createHudMinRegistry(); }
    if (!parsed || !Array.isArray(parsed.chips)) return createHudMinRegistry();
    const chips = parsed.chips
        .filter((c: any) => c && typeof c.hudId === 'string' && c.hudId.length > 0)
        .map((c: any, i: number) => Object.freeze({
            hudId: c.hudId,
            label: typeof c.label === 'string' && c.label.length > 0 ? c.label : c.hudId,
            order: i,
        }));
    // dedup por hudId preservando a primeira ocorrência
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const c of chips) { if (!seen.has(c.hudId)) { seen.add(c.hudId); deduped.push(c); } }
    return Object.freeze({ chips: Object.freeze(_reindex(deduped)) });
}

// ---- helpers internos ----
function _freezeChip(c: any): any {
    return Object.freeze({ hudId: c.hudId, label: c.label, order: c.order });
}
function _reindex(chips: any[]): any[] {
    return chips.map((c: any, i: number) => Object.freeze({ hudId: c.hudId, label: c.label, order: i }));
}
