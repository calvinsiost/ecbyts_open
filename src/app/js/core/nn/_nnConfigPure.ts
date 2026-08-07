// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   NN CONFIG PURE (Module C extraction)
   ================================================================

   Helpers pure-logic extraídos de core/nn/manager.ts:
     - buildConfig: extrai serializable config de instância SimpleNN.
     - migrateConfig: legacy hiddenSize → hiddenLayerSizes[hiddenSize].
   ================================================================ */

type AnyRecord = Record<string, any>;

/**
 * Extrai config serializable de uma instância NN (toJSON-friendly).
 * Preserva backward compat: emite `hiddenSize` = hiddenLayerSizes[0].
 * mode default 'classification' quando ausente.
 */
export function buildConfig(nn: AnyRecord): AnyRecord {
    return {
        inputSize: nn?.inputSize,
        hiddenLayerSizes: nn?.hiddenLayerSizes,
        hiddenSize: nn?.hiddenLayerSizes?.[0],
        outputSize: nn?.outputSize,
        classNames: nn?.classNames,
        mode: nn?.mode || 'classification',
    };
}

/**
 * Migra config legacy (hiddenSize: number) para novo formato
 * (hiddenLayerSizes: number[]). Idempotente — chamadas múltiplas
 * preservam o resultado.
 *
 * Muta o input para preservar API original. Retorna mesma ref.
 */
export function migrateConfig(config: AnyRecord): AnyRecord {
    if (config && !config.hiddenLayerSizes && config.hiddenSize) {
        config.hiddenLayerSizes = [config.hiddenSize];
    }
    return config;
}
