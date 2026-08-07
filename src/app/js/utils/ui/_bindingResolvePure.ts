// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * _bindingResolvePure.ts — resolução PURA do clique delegado CSP-safe
 * (SPEC_EVIDENCE_CONTRACT RF-5 / EVIDENCE-CONTRACT-001#5).
 *
 * Contrato espelhado por `app/js/boot/cc-call-delegate.js` (makeDelegate):
 * dado um `event.target`, encontrar o elemento acionável mais próximo que
 * carrega `data-cc-call-<event>` e extrair o nome do handler + arg specs.
 *
 * REGRAS DE ROBUSTEZ (a razão de existir deste módulo):
 *  - NUNCA usar `className` como string: em SVG `className` é um
 *    `SVGAnimatedString` (objeto), não string — qualquer `className.includes`
 *    ou split quebraria. A resolução usa SOMENTE `closest()` + `getAttribute()`,
 *    que têm semântica idêntica em HTMLElement e SVGElement.
 *  - Subir a árvore com `closest('[attr]')`: o `event.target` de um clique num
 *    fluxograma SVG é o `<rect>`/`<text>` interno, não o `<g data-cc-call-click>`.
 *  - Key-guard (`data-cc-key`) só se aplica a eventos de TECLADO (eventKey é
 *    string). Um clique de mouse não tem `key` — o guard não pode vetá-lo.
 *    (Era exatamente esse veto indevido que silenciava o clique nos blocos
 *    do fluxograma da aba Ações, que carregam `data-cc-key="Enter"` para o
 *    keydown de a11y no MESMO `<g>` do `data-cc-call-click`.)
 *
 * PURE LOGIC: sem DOM real — opera sobre qualquer objeto com
 * `closest`/`getAttribute` (duck-typing), o que o torna cheap-testável
 * em node:test sem JSDOM.
 */

/** Shape mínimo de elemento aceito pela resolução (HTMLElement OU SVGElement). */
export interface DelegateTargetLike {
    closest?: (selector: string) => DelegateTargetLike | null;
    getAttribute?: (name: string) => string | null;
    /** Presente só para documentar que NÃO é usado (SVGAnimatedString em SVG). */
    className?: unknown;
}

/** Resultado da resolução de um clique delegado. */
export interface ResolvedDelegatedCall {
    /** Elemento que carrega o atributo (pode ser ancestral do target). */
    el: DelegateTargetLike;
    /** Nome (fnPath) do handler whitelisted, ex.: `handleOpenIngestionModal`. */
    fnName: string;
    /** Arg specs URI-encoded restantes do payload, ex.: `['s:input']`. */
    argSpecs: string[];
}

/**
 * Resolve um evento delegado: target → elemento acionável → handler.
 *
 * @param target `event.target` (ou simulação com closest/getAttribute).
 * @param attr Atributo delegado (default `data-cc-call-click`).
 * @param eventKey `event.key` quando for evento de teclado; omitir em mouse.
 * @returns Resolução ou `null` quando o clique NÃO deve disparar handler.
 */
export function resolveDelegatedCall(
    target: DelegateTargetLike | null | undefined,
    attr: string = 'data-cc-call-click',
    eventKey?: string,
): ResolvedDelegatedCall | null {
    if (!target || typeof target.closest !== 'function') return null;
    const el = target.closest(`[${attr}]`);
    if (!el || typeof el.getAttribute !== 'function') return null;

    const spec = el.getAttribute(attr);
    if (!spec) return null;

    // Key-guard: só veta eventos de teclado (eventKey string). Cliques de
    // mouse passam mesmo com data-cc-key presente (a11y keydown no mesmo el).
    const keyGuard = el.getAttribute('data-cc-key');
    if (keyGuard && typeof eventKey === 'string' && eventKey !== keyGuard) return null;

    const parts = spec.split('|');
    const fnName = parts[0];
    if (!fnName) return null;
    return { el, fnName, argSpecs: parts.slice(1) };
}
