// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   BROADCAST FORM — lógica pura do editor de perfil de broadcast.

   Extraída inline de utils/ui/radarModal.ts (o pior code-score da
   camada de telas) para ser importável em Node cheap tests sem DOM,
   fetch ou Supabase. Cada função reproduz BYTE-A-BYTE a expressão que
   vivia embutida no handler/template do editor.

   Funções:
   - createDefaultBroadcastProfile()      → objeto-perfil default (era o
       literal inline em _renderEditor quando não havia existingProfile)
   - resolveSectionLabel(sec)             → rótulo PT-BR de uma seção
       (era `sectionLabels[sec] || sec` com o mapa inline no _renderEditor)
   - cleanEmailChipText(text)             → e-mail limpo a partir do
       textContent do chip (era `chip.textContent.replace('✕','').trim()`
       inline no handler de salvar)
   - isAllowedRadarCta(name, allow)       → guard do _radarCtaOpen
       (era `RADAR_CTA_ALLOW.has(String(name))` inline)
   ================================================================ */

/** Perfil de broadcast em edição (campos usados pelo editor inline). */
export interface BroadcastProfileDraft {
    name: string;
    visibility: string;
    allowed_emails: string[];
    visible_families: string[];
    visible_sections: string[];
    hidden_fields: string[];
}

/**
 * Cria o objeto-perfil default usado quando o editor abre sem um
 * `existingProfile`. Reproduz byte-a-byte o literal que vivia inline em
 * `_renderEditor`. Retorna uma instância nova a cada chamada (o editor
 * muta `visible_families`/`visible_sections` ao aplicar presets).
 */
export function createDefaultBroadcastProfile(): BroadcastProfileDraft {
    return {
        name: '',
        visibility: 'public',
        allowed_emails: [],
        visible_families: [],
        visible_sections: ['elements', 'campaigns', 'observations', 'project'],
        hidden_fields: [],
    };
}

/**
 * Mapa PT-BR de rótulos de seção. Reproduz byte-a-byte o objeto
 * `sectionLabels` que vivia inline em `_renderEditor`.
 */
export const SECTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
    elements: 'Elementos',
    campaigns: 'Campanhas',
    observations: 'Observacoes',
    project: 'Projeto',
    contracts: 'Contratos',
    sao: 'Matrizes ESH',
    costs: 'Custos',
    interpolation: 'Interpolacao',
    report: 'Relatorios',
});

/**
 * Resolve o rótulo de uma seção. Reproduz byte-a-byte
 * `sectionLabels[sec] || sec`: cai no próprio id quando não há mapeamento.
 *
 * @param sec  id da seção (ex.: "elements")
 */
export function resolveSectionLabel(sec: string): string {
    return SECTION_LABELS[sec] || sec;
}

/**
 * Limpa o texto de um chip de e-mail, devolvendo só o endereço.
 * Reproduz byte-a-byte `chip.textContent.replace('✕', '').trim()`
 * (o "✕" é o botão de remover embutido no chip).
 *
 * @param text  textContent do chip (ex.: "fulano@example.com ✕")
 */
export function cleanEmailChipText(text: unknown): string {
    return String(text ?? '').replace('✕', '').trim();
}

/**
 * Guard do CTA dos painéis do radar: só libera nomes na whitelist.
 * Reproduz byte-a-byte `RADAR_CTA_ALLOW.has(String(name))`.
 *
 * @param name   nome do handler pedido pelo CTA
 * @param allow  whitelist de handlers permitidos
 */
export function isAllowedRadarCta(name: unknown, allow: ReadonlySet<string>): boolean {
    return allow.has(String(name));
}
