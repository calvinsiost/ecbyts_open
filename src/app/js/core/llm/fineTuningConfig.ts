// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Fine-Tuning Pipeline Configuration - SPEC_FINE_TUNING_PIPELINE_QWEN_9_79 P1-36
/**
 * Fine-Tuning Pipeline Configuration - SPEC_FINE_TUNING_PIPELINE_QWEN_9_79 P1-36
 *
 * Schema de configuração e validação para o pipeline LoRA/QLoRA do Qwen2.5.
 * Integra com o painel de AI do produto (utils/ui/) para configuração visual.
 *
 * Fine-tuning configuration schema and validator for the Qwen2.5 LoRA/QLoRA pipeline.
 * Módulo JS puro - sem dependências de browser, testável em Node.
 */

/**
 * Métodos de fine-tuning suportados.
 * Supported fine-tuning methods.
 */
export const FINE_TUNING_METHODS = {
    LORA: 'lora',
    QLORA: 'qlora',
    FULL: 'full',
} as const;

export type FineTuningMethod = (typeof FINE_TUNING_METHODS)[keyof typeof FINE_TUNING_METHODS];

/**
 * Modelos Qwen2.5 suportados pelo pipeline.
 * Supported Qwen2.5 base models for the pipeline.
 */
export const SUPPORTED_MODELS = ['Qwen2.5-0.5B', 'Qwen2.5-1.5B', 'Qwen2.5-3B', 'Qwen2.5-7B'] as const;

export type SupportedModel = (typeof SUPPORTED_MODELS)[number];

/** Rank LoRA mínimo permitido. */
const LORA_RANK_MIN = 4;

/** Rank LoRA máximo permitido. */
const LORA_RANK_MAX = 64;

/** Mínimo de amostras exigidas no dataset. */
const DATASET_MIN_SAMPLES = 10;

export interface FineTuningConfig {
    /** Modelo Qwen2.5 base (deve estar em SUPPORTED_MODELS) */
    baseModel: SupportedModel;
    /** Método de fine-tuning (FINE_TUNING_METHODS) */
    method: FineTuningMethod;
    /** LoRA rank r (4–64) */
    loraRank: number;
    /** LoRA alpha (tipicamente 2×rank) */
    loraAlpha: number;
    /** Taxa de aprendizado */
    learningRate: number;
    /** Número de épocas de treinamento */
    epochs: number;
    /** Tamanho do lote por passo */
    batchSize: number;
    /** Diretório de saída para pesos treinados */
    outputDir: string;
}

/**
 * Cria e valida uma configuração de fine-tuning.
 * Creates and validates a fine-tuning configuration object.
 *
 * @param opts - Opções parciais de configuração
 * @returns Configuração validada e normalizada
 * @throws {Error} Se baseModel, method ou loraRank forem inválidos
 */
export function createFineTuningConfig(
    opts: Partial<FineTuningConfig> = {},
): FineTuningConfig {
    const {
        baseModel = 'Qwen2.5-0.5B' as SupportedModel,
        method = FINE_TUNING_METHODS.QLORA,
        loraRank = 16,
        loraAlpha,
        learningRate = 2e-4,
        epochs = 3,
        batchSize = 4,
        outputDir = './output',
    } = opts;

    if (!SUPPORTED_MODELS.includes(baseModel as any)) {
        throw new Error('Unsupported model: ' + baseModel);
    }
    if (!Object.values(FINE_TUNING_METHODS).includes(method as any)) {
        throw new Error('Invalid method: ' + method);
    }
    if (loraRank < LORA_RANK_MIN || loraRank > LORA_RANK_MAX) {
        throw new Error(`loraRank must be ${LORA_RANK_MIN}-${LORA_RANK_MAX}`);
    }

    return {
        baseModel: baseModel as SupportedModel,
        method: method as FineTuningMethod,
        loraRank,
        loraAlpha: loraAlpha ?? loraRank * 2,
        learningRate,
        epochs,
        batchSize,
        outputDir: String(outputDir),
    };
}

export interface DatasetSample {
    /** Prompt de entrada (instrução ao modelo) */
    instruction: string;
    /** Resposta esperada do modelo */
    output: string;
}

export interface DatasetValidationResult {
    /** true se dataset passou em todas as validações */
    valid: boolean;
    /** Lista de erros encontrados */
    errors: string[];
    /** Número de amostras no dataset */
    sampleCount: number;
}

/**
 * Valida um dataset de fine-tuning (array de {instruction, output}).
 * Validates a fine-tuning dataset array.
 *
 * @param samples - Array de amostras instruction+output
 * @returns DatasetValidationResult
 */
export function validateDataset(samples: unknown): DatasetValidationResult {
    if (!Array.isArray(samples)) {
        return { valid: false, errors: ['Dataset must be an array'], sampleCount: 0 };
    }

    const typedSamples = samples as DatasetSample[];
    const errors: string[] = [];

    if (typedSamples.length < DATASET_MIN_SAMPLES) {
        errors.push(`Too few samples: ${typedSamples.length} (minimum ${DATASET_MIN_SAMPLES})`);
    }

    typedSamples.forEach((s, i) => {
        if (!s || typeof s.instruction !== 'string') {
            errors.push(`Sample ${i}: missing instruction`);
        }
        if (!s || typeof s.output !== 'string') {
            errors.push(`Sample ${i}: missing output`);
        }
    });

    return {
        valid: errors.length === 0,
        errors,
        sampleCount: typedSamples.length,
    };
}

export interface VramEstimate {
    /** VRAM estimada em GB (arredondada para cima) */
    vramGb: number;
    /** true se cabe na GTX 1650 Ti (4 GB VRAM) */
    fitsGTX1650Ti: boolean;
}

/**
 * Estima a VRAM necessária para um dado FineTuningConfig.
 * Heurística baseada no tamanho do modelo × fator do método × batch / 4 + overhead de 1 GB.
 * Estimates VRAM required for a FineTuningConfig using a simple heuristic.
 *
 * @param config - Configuração de fine-tuning validada
 * @returns VramEstimate
 */
export function estimateVram(config: FineTuningConfig): VramEstimate {
    /**
     * Tamanho aproximado dos pesos do modelo em GB (fp16).
     */
    const modelSizeGb: Record<string, number> = {
        'Qwen2.5-0.5B': 1,
        'Qwen2.5-1.5B': 3,
        'Qwen2.5-3B': 6,
        'Qwen2.5-7B': 14,
    };

    const base = modelSizeGb[config.baseModel] ?? 4;

    // QLoRA: quantização 4-bit reduz consumo drasticamente (~35%)
    // LoRA: adaptadores adicionais sobre modelo fp16 (~60%)
    // Full: todo o modelo em fp32 para gradientes (100%)
    const multiplier =
        config.method === FINE_TUNING_METHODS.QLORA ? 0.35 : config.method === FINE_TUNING_METHODS.LORA ? 0.6 : 1.0;

    const vramGb = Math.ceil((base * multiplier * config.batchSize) / 4 + 1);

    return {
        vramGb,
        fitsGTX1650Ti: vramGb <= 4,
    };
}