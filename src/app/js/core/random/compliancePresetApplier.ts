// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   RANDOM-COV-001 F2 (RF-6 wire — metade verificável) — adapter de aplicação.

   Aplica os bindings de preset de compliance (de buildCompliancePresetSeed) a um
   ComplianceManager, chamando `selectPreset({presetId, scope, reason})` por binding.

   O MANAGER é INJETADO (duck-typed) → este adapter é cheap-testável com um mock,
   sem DOM. A COLA DOM (escutar 'modelGenerated' → getComplianceManager() →
   applyCompliancePresetSeed) + a VERIFICAÇÃO VISUAL (Veredito da Área aparece) são
   o passo runtime/E2E restante do RF-6 — NÃO incluídos aqui (exigem Pixels-Over-DOM).

   Sequencial de propósito: addBinding é stateful (state n → n+1); aplicar em
   paralelo correria o estado. Pure quanto a determinismo (sem rng); efeitos só
   via o manager injetado.
   ================================================================ */

/** Interface mínima do ComplianceManager consumida aqui (duck-typed p/ teste). */
export interface PresetManagerLike {
    selectPreset(input: { presetId: string; scope: string; reason?: string }): Promise<unknown>;
}

export interface PresetBindingLike {
    readonly presetId: string;
    readonly scope: string;
}

export interface ApplyPresetSeedResult {
    readonly applied: number;
    readonly failed: number;
    readonly errors: ReadonlyArray<string>;
}

export const DEFAULT_APPLY_REASON = 'random-model-baseline';

/**
 * Aplica cada binding do seed via manager.selectPreset, sequencialmente.
 * Tolerante a falhas: registra erro por binding e continua. Nunca lança.
 * @returns contagem de aplicados/falhos + mensagens de erro (frozen).
 */
export async function applyCompliancePresetSeed(
    manager: PresetManagerLike | null | undefined,
    seed: ReadonlyArray<PresetBindingLike> | null | undefined,
    opts: { reason?: string } = {},
): Promise<ApplyPresetSeedResult> {
    const list = Array.isArray(seed) ? seed : [];
    if (!manager || typeof manager.selectPreset !== 'function') {
        return Object.freeze({
            applied: 0,
            failed: list.length,
            errors: Object.freeze(
                list.length > 0 ? ['manager.selectPreset indisponível — nenhum preset aplicado'] : [],
            ),
        });
    }
    const reason = typeof opts.reason === 'string' && opts.reason.trim() !== '' ? opts.reason : DEFAULT_APPLY_REASON;
    let applied = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const b of list) {
        if (!b || typeof b.presetId !== 'string' || typeof b.scope !== 'string') {
            failed++;
            errors.push(`binding inválido: ${JSON.stringify(b)}`);
            continue;
        }
        try {
            await manager.selectPreset({ presetId: b.presetId, scope: b.scope, reason });
            applied++;
        } catch (e: any) {
            failed++;
            errors.push(`${b.presetId}/${b.scope}: ${(e && e.message) || String(e)}`);
        }
    }
    return Object.freeze({ applied, failed, errors: Object.freeze(errors) });
}
