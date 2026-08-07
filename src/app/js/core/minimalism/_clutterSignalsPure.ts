// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CLUTTER SIGNALS — sinais objetivos de RUÍDO a partir de um modelo de tela
   UI-MINIMALISM-001 RF-5/RF-6. Calvin 2026-06-15.

   Deriva `ClutterFinding[]` de sinais MEDÍVEIS (não-subjetivos) do
   markup/template de uma tela — para o `_minimalismScorePure` pontuar.
   Heurística objetiva + thresholds calibrados (KQ3): contagem de grupos
   visuais, controles sempre-visíveis, ratio texto/ícone, nº de concerns
   por seção, strings repetidas (≥2×). Sem DOM/IO/THREE — recebe um
   `ScreenModel` já extraído (o extrator de DOM vive na camada utils/F3).

   Provenance: Nielsen NN/g "Aesthetic and Minimalist Design" (#8) +
   Progressive Disclosure; Tufte data-ink ratio.
   ================================================================ */

import type { ClutterFinding, ClutterSeverity } from './_minimalismScorePure.js';

/** Thresholds calibrados (espelham a razão do friendliness — auditáveis à mão). */
export const CLUTTER_THRESHOLDS = Object.freeze({
    /** ≥ este nº de concerns distintos num painel = job-mixing → blocker. */
    concernsBlocker: 3,
    /** Mais de N grupos visuais no estado default = excesso de divisão. */
    visualGroupsWarn: 6,
    /** Controles sempre-visíveis acima disso = candidato a progressive disclosure. */
    alwaysVisibleControlsWarn: 8,
    /** Rótulo acima de N chars = verboso (podia ser curto/icônico). */
    longLabelChars: 28,
    /** Mesma string exibida ≥ este nº de vezes = redundância. */
    repeatedStringMin: 2,
    /** Ratio texto/ícone abaixo disso é OK; acima = excesso de texto cru. */
    textToIconWarn: 6,
});

/**
 * Modelo de tela já extraído (DOM→objeto vive na camada utils). PURO: o core
 * recebe contagens e listas, nunca toca o DOM. Todos os campos são opcionais —
 * ausência = sem sinal (degrada gracioso).
 */
export interface ScreenModel {
    /** ID da tela/rota (vira `screen` nos findings). */
    readonly screen?: string;
    /** Quantos jobs/concerns distintos o painel cobre (ex.: 3 no print). */
    readonly concerns?: ReadonlyArray<string>;
    /** Nº de grupos visuais (seções/cards) no estado default. */
    readonly visualGroups?: number;
    /** Nº de controles avançados/raros sempre-visíveis no estado default. */
    readonly alwaysVisibleControls?: number;
    /** Total de controles na tela (para o ratio). */
    readonly totalControls?: number;
    /** Rótulos de texto exibidos (para detectar verbosidade). */
    readonly textLabels?: ReadonlyArray<string>;
    /** Nº de elementos com ícone (para o ratio texto/ícone). */
    readonly iconCount?: number;
    /** Strings/valores exibidos (para detectar redundância — mesma string ≥2×). */
    readonly displayedStrings?: ReadonlyArray<string>;
    /** Há um CTA primário claro? (hierarquia visual). */
    readonly hasPrimaryCta?: boolean;
    /** Estados-vazios sem CTA (ex.: "0 Observações" morto). */
    readonly deadEmptyStates?: ReadonlyArray<string>;
    /** Frases negativas/óbvias ("Sem campanha associada", "Vinculado ao..."). */
    readonly negativePhrases?: ReadonlyArray<string>;
}

/**
 * Remove ruído de markup p/ não contar texto que o usuário NÃO vê: conteúdo de
 * comentário HTML, valores de atributo e `aria-*`. Anti-falso-positivo (RF-1.6).
 * Recebe uma string de markup e devolve só o texto visível aproximado.
 */
export function stripMarkupLiterals(markup: string): string {
    if (typeof markup !== 'string' || !markup) return '';
    return (
        markup
            // comentários HTML <!-- ... -->
            .replace(/<!--[\s\S]*?-->/g, ' ')
            // conteúdo de <script>/<style>
            .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
            // atributos (inclui aria-*, title, alt) — name="value" e name='value'
            .replace(/\s[a-zA-Z_:][-a-zA-Z0-9_:.]*\s*=\s*"(?:[^"]*)"/g, ' ')
            .replace(/\s[a-zA-Z_:][-a-zA-Z0-9_:.]*\s*=\s*'(?:[^']*)'/g, ' ')
            // tags restantes
            .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
            // colapsa espaço
            .replace(/\s+/g, ' ')
            .trim()
    );
}

/** Normaliza uma string p/ comparação de redundância (case/space-insensitive). */
function _norm(s: string): string {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Conta ocorrências de um regex global numa string (determinístico, sem DOM). */
function _count(markup: string, re: RegExp): number {
    const m = markup.match(re);
    return m ? m.length : 0;
}

/**
 * Extrai um `ScreenModel` OBJETIVO de markup HTML ESTÁTICO — bridge browser-free
 * da pathway de sinais estáticos (RF-5). PURO: só parsing de string, sem DOM, IO
 * ou THREE; mesma markup → mesmo modelo. Conta sinais MECÂNICOS (não-subjetivos),
 * cobrindo o gap "o extrator de DOM vive na camada utils/F3" para o caso ESTÁTICO
 * (HTML commitado), dando alcance ao ranking por-tela (F4.1) sem precisar de app
 * rodando.
 *
 * Sinais derivados (todos por contagem determinística do markup visível, após
 * stripMarkupLiterals p/ texto e regex de tag p/ controles/grupos/ícones):
 *  - visualGroups        = nº de containers de seção (section/fieldset/article
 *                          + elementos com classe card/panel/group/section).
 *  - alwaysVisibleControls / totalControls = nº de controles (button/input/
 *                          select/textarea + a com classe btn), excluindo os
 *                          marcados hidden / aria-hidden=true / inline display:none.
 *  - iconCount           = nº de svg/img + elementos com classe icon.
 *  - textLabels          = rótulos de button/h1..h6/label (texto visível).
 *  - hasPrimaryCta       = existe ≥1 controle com classe primary.
 *
 * NÃO infere concerns/redundância/empty-state-morto (esses dependem de semântica
 * de domínio — ficam para o override curado no dataset, sem teatro). Campos
 * ausentes degradam gracioso no `deriveClutterSignals`.
 */
export function extractScreenModelFromMarkup(markup: string, screen?: string): ScreenModel {
    if (typeof markup !== 'string' || !markup) {
        return Object.freeze(screen ? { screen } : {});
    }
    // Remove comentários, <script>, <style> p/ não contar tags fora do corpo visível.
    const body = markup
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');

    // --- controles (sempre-visíveis vs ocultos) ---
    const controlTagRe = /<(?:button|input|select|textarea)\b[^>]*>/gi;
    const linkBtnRe = /<a\b[^>]*class\s*=\s*(?:"[^"]*\bbtn[^"]*"|'[^']*\bbtn[^']*')[^>]*>/gi;
    const allControlTags = [
        ...(body.match(controlTagRe) || []),
        ...(body.match(linkBtnRe) || []),
    ];
    const isHidden = (tag: string): boolean =>
        /\bhidden\b/i.test(tag) ||
        /aria-hidden\s*=\s*(?:"true"|'true')/i.test(tag) ||
        /style\s*=\s*(?:"[^"]*display\s*:\s*none|'[^']*display\s*:\s*none)/i.test(tag);
    const totalControls = allControlTags.length;
    const alwaysVisibleControls = allControlTags.filter((t) => !isHidden(t)).length;
    const hasPrimaryCta = allControlTags.some((t) =>
        /class\s*=\s*(?:"[^"]*\bprimary\b[^"]*"|'[^']*\bprimary\b[^']*')/i.test(t) && !isHidden(t),
    );

    // --- grupos visuais (seções/cards) ---
    const semanticGroups = _count(body, /<(?:section|fieldset|article)\b[^>]*>/gi);
    const classGroups = _count(
        body,
        /<[a-z][^>]*class\s*=\s*(?:"[^"]*\b(?:card|panel|group|section)\b[^"]*"|'[^']*\b(?:card|panel|group|section)\b[^']*')[^>]*>/gi,
    );
    const visualGroups = semanticGroups + classGroups;

    // --- ícones ---
    const iconCount =
        _count(body, /<(?:svg|img)\b[^>]*>/gi) +
        _count(body, /<[a-z][^>]*class\s*=\s*(?:"[^"]*\bicon\b[^"]*"|'[^']*\bicon\b[^']*')[^>]*>/gi);

    // --- rótulos de texto (botões / headings / labels) ---
    const textLabels: string[] = [];
    const labelRe = /<(button|h[1-6]|label)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let lm: RegExpExecArray | null;
    while ((lm = labelRe.exec(body)) !== null) {
        const txt = stripMarkupLiterals(lm[2] ?? '');
        if (txt) textLabels.push(txt);
    }

    return Object.freeze({
        ...(screen ? { screen } : {}),
        visualGroups,
        alwaysVisibleControls,
        totalControls,
        iconCount,
        hasPrimaryCta,
        ...(textLabels.length ? { textLabels: Object.freeze(textLabels) } : {}),
    });
}

/**
 * Atalho: markup estático → `ClutterFinding[]` (extrai o modelo objetivo e roda o
 * deriver). Conveniência para o pipeline F4.1 mapear telas a partir de HTML
 * commitado sem browser.
 */
export function deriveClutterSignalsFromMarkup(
    markup: string,
    screen?: string,
): ReadonlyArray<ClutterFinding> {
    return deriveClutterSignals(extractScreenModelFromMarkup(markup, screen));
}

/**
 * Deriva os sinais de ruído de uma tela como `ClutterFinding[]`. Determinístico,
 * sem efeitos colaterais — mesmo modelo → mesmos findings (id estável por sinal).
 * Cada finding traz `evidence` objetivo (a contagem que o disparou).
 */
export function deriveClutterSignals(model: ScreenModel = {}): ReadonlyArray<ClutterFinding> {
    const screen = typeof model.screen === 'string' && model.screen.trim() ? model.screen.trim() : undefined;
    const out: ClutterFinding[] = [];
    const push = (
        suffix: string,
        dimension: ClutterFinding['dimension'],
        severity: ClutterSeverity,
        reach: number,
        evidence: string,
        note?: string,
    ) => {
        out.push(
            Object.freeze({
                id: `${screen || 'screen'}:${suffix}`,
                dimension,
                severity,
                reach,
                resolved: false,
                ...(screen ? { screen } : {}),
                evidence,
                ...(note ? { note } : {}),
            }),
        );
    };

    // concern_cohesion — ≥3 concerns distintos num painel = job-mixing (blocker).
    const concerns = Array.isArray(model.concerns) ? model.concerns.filter((c) => typeof c === 'string' && c.trim()) : [];
    if (concerns.length >= CLUTTER_THRESHOLDS.concernsBlocker) {
        push(
            'job-mixing',
            'concern_cohesion',
            'blocker',
            2,
            `${concerns.length} concerns num só painel: ${concerns.join(', ')}`,
            'painel faz vários jobs — dividir (progressive disclosure / seção dedicada)',
        );
    } else if (concerns.length === 2) {
        push('two-concerns', 'concern_cohesion', 'slows', 1, `2 concerns: ${concerns.join(', ')}`);
    }

    // progressive_disclosure — controles avançados sempre-visíveis no default.
    if (typeof model.alwaysVisibleControls === 'number' && model.alwaysVisibleControls > CLUTTER_THRESHOLDS.alwaysVisibleControlsWarn) {
        push(
            'always-visible',
            'progressive_disclosure',
            'slows',
            1,
            `${model.alwaysVisibleControls} controles avançados sempre-visíveis (limite ${CLUTTER_THRESHOLDS.alwaysVisibleControlsWarn})`,
            'mover o avançado para "on demand" (botão/menu)',
        );
    }

    // signal_to_noise — grupos visuais demais no estado default (Tufte data-ink).
    if (typeof model.visualGroups === 'number' && model.visualGroups > CLUTTER_THRESHOLDS.visualGroupsWarn) {
        push(
            'visual-groups',
            'signal_to_noise',
            'slows',
            1,
            `${model.visualGroups} grupos visuais (limite ${CLUTTER_THRESHOLDS.visualGroupsWarn})`,
            'colapsar/agrupar; reduzir divisórias',
        );
    }
    // signal_to_noise — ratio texto/ícone alto = excesso de texto cru.
    const labels = Array.isArray(model.textLabels) ? model.textLabels.filter((t) => typeof t === 'string') : [];
    const icons = typeof model.iconCount === 'number' ? model.iconCount : 0;
    if (labels.length > CLUTTER_THRESHOLDS.textToIconWarn && (icons === 0 || labels.length / Math.max(1, icons) > CLUTTER_THRESHOLDS.textToIconWarn)) {
        push(
            'text-heavy',
            'signal_to_noise',
            'annoys',
            1,
            `${labels.length} rótulos de texto vs ${icons} ícones (ratio alto)`,
            'iconizar onde possível (data-ink)',
        );
    }

    // redundancy — mesma string exibida ≥2×.
    const strings = Array.isArray(model.displayedStrings) ? model.displayedStrings.filter((s) => typeof s === 'string' && s.trim()) : [];
    const counts = new Map<string, { raw: string; n: number }>();
    for (const s of strings) {
        const k = _norm(s);
        const e = counts.get(k);
        if (e) e.n += 1;
        else counts.set(k, { raw: s.trim(), n: 1 });
    }
    const repeated = [...counts.values()].filter((e) => e.n >= CLUTTER_THRESHOLDS.repeatedStringMin).sort((a, b) => b.n - a.n || a.raw.localeCompare(b.raw));
    for (const e of repeated) {
        push(
            `redundant-${_norm(e.raw).replace(/[^a-z0-9]+/g, '-').slice(0, 24) || 'x'}`,
            'redundancy',
            e.n >= 3 ? 'slows' : 'annoys',
            1,
            `"${e.raw}" exibido ${e.n}×`,
            'mostrar a informação UMA vez',
        );
    }

    // verbosity — rótulos longos + frases negativas/óbvias.
    const longLabels = labels.filter((l) => l.length > CLUTTER_THRESHOLDS.longLabelChars);
    if (longLabels.length) {
        push(
            'long-labels',
            'verbosity',
            'annoys',
            1,
            `${longLabels.length} rótulo(s) > ${CLUTTER_THRESHOLDS.longLabelChars} chars (ex.: "${(longLabels[0] ?? '').slice(0, 40)}")`,
            'encurtar/iconizar',
        );
    }
    const negatives = Array.isArray(model.negativePhrases) ? model.negativePhrases.filter((p) => typeof p === 'string' && p.trim()) : [];
    if (negatives.length) {
        push(
            'negative-phrases',
            'verbosity',
            'slows',
            1,
            `${negatives.length} frase(s) negativa/óbvia: ${negatives.slice(0, 2).join('; ')}`,
            'remover ou virar ícone-tooltip',
        );
    }

    // visual_hierarchy — sem CTA primário claro.
    if (model.hasPrimaryCta === false) {
        push(
            'no-primary-cta',
            'visual_hierarchy',
            'slows',
            1,
            'nenhum CTA primário claro — o que o usuário FAZ aqui?',
            'definir e destacar a ação primária',
        );
    }

    // empty_state_clarity — "0 X" morto sem CTA.
    const deads = Array.isArray(model.deadEmptyStates) ? model.deadEmptyStates.filter((d) => typeof d === 'string' && d.trim()) : [];
    if (deads.length) {
        push(
            'dead-empty-state',
            'empty_state_clarity',
            'annoys',
            1,
            `${deads.length} estado-vazio sem CTA: ${deads.slice(0, 2).join('; ')}`,
            'virar empty-state pedagógico ("+ Adicionar…")',
        );
    }

    return Object.freeze(out);
}
