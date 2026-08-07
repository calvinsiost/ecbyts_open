// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SPEC_FC05_GEOML_GAUSSIAN_PROCESS (claude - novaspec, 2026-06-02) —
 * geomlAdapter consumindo RegistryCatalog para `core/geoml`.
 *
 * Surfacа os 3 kernels de GP regression (Matern 3/2, RBF, Exponential)
 * + capacidades de validação (LOO MAE/RMSE/R²) + otimização MLE de
 * hiperparâmetros como entries descobríveis no catálogo.
 *
 * NÃO substitui o pure-logic de `core/geoml` — surfacа para
 * descobribilidade pelo usuário/banca (FORCE11 best practice).
 *
 * RF1 (GP como opção no painel interpolation): fica fora do escopo
 * deste catálogo — requer wiring específico em core/interpolation que
 * é outro escopo (claude-ui ou claude-executor em sessão dedicada).
 * Catálogo aqui cumpre a descobribilidade básica + cita R-31.
 *
 * Refs:
 *   - SPEC `docs/specs/frontier/SPEC_FC05_GEOML_GAUSSIAN_PROCESS.md`
 *   - Abstração: `docs/specs/frontier/SPEC_REGISTRY_CATALOG.md`
 *   - Registry: `core/geoml/kernels.ts:112 KERNELS`
 *   - Rasmussen & Williams 2006 (R-31) — Algoritmo 2.1, eq. 2.30
 */

import { openRegistryCatalog, type RegistryEntry } from './registryCatalog.js';
import { t } from '../i18n/translations.js';

/**
 * Metadado curado por capacidade GeoML. Como em recognitionCatalog,
 * o registry de kernels só expõe funções — adapter enriquece com
 * descrição/papel/ref bibliográfica.
 *
 * Categorias:
 *   - 'kernel': funções covariance (Matern 3/2, RBF, Exponential)
 *   - 'validation': leave-one-out (MAE/RMSE/R²)
 *   - 'optimization': MLE em log-space
 *   - 'regression': fitGP/predictGP (Algoritmo 2.1 R&W)
 */
export const GEOML_CAPABILITY_META = Object.freeze({
    matern32: Object.freeze({
        group: 'kernel',
        description: 'Kernel Matérn ν=3/2 — default recomendado para campos ambientais heterogêneos (suavidade intermediária)',
        ref: 'Rasmussen & Williams 2006, eq. 4.17 (R-31)',
    }),
    rbf: Object.freeze({
        group: 'kernel',
        description: 'Kernel RBF (Squared Exponential / Gaussian) — campos infinitamente suaves, sensível a outliers',
        ref: 'Rasmussen & Williams 2006, eq. 4.9 (R-31)',
    }),
    exponential: Object.freeze({
        group: 'kernel',
        description: 'Kernel exponencial (Matérn ν=1/2 / Ornstein-Uhlenbeck) — campos não-diferenciáveis, captura ruído',
        ref: 'Rasmussen & Williams 2006, eq. 4.15 (R-31)',
    }),
    fitGP: Object.freeze({
        group: 'regression',
        description: 'Ajuste de GP via Cholesky + solve triangular — Algoritmo 2.1 R&W 2006 (treina posterior)',
        ref: 'Rasmussen & Williams 2006, Algorithm 2.1 (R-31)',
    }),
    predictGP: Object.freeze({
        group: 'regression',
        description: 'Predição GP com média + variância posterior (uncertainty quantification completa)',
        ref: 'Rasmussen & Williams 2006, eq. 2.25-2.26 (R-31)',
    }),
    looPredictions: Object.freeze({
        group: 'validation',
        description: 'Leave-One-Out cross-validation determinística — base para MAE/RMSE/R²',
        ref: 'Rasmussen & Williams 2006, eq. 5.10-5.12 (R-31); Hastie, Tibshirani, Friedman 2009',
    }),
    mae: Object.freeze({
        group: 'validation',
        description: 'Mean Absolute Error sobre resíduos LOO',
        ref: 'Hastie, Tibshirani, Friedman 2009',
    }),
    rmse: Object.freeze({
        group: 'validation',
        description: 'Root Mean Squared Error sobre resíduos LOO',
        ref: 'Hastie, Tibshirani, Friedman 2009',
    }),
    optimizeMLEGridSearch: Object.freeze({
        group: 'optimization',
        description: 'Maximum Likelihood Estimation via grid search em log-space (lengthScale + variance)',
        ref: 'Rasmussen & Williams 2006, eq. 2.30 (R-31)',
    }),
});

/**
 * Adaptador puro: capabilities object → RegistryEntry[].
 *
 * Caller passa objeto onde keys são nomes de capability (matern32,
 * fitGP, etc.) e values são references (functions ou null para
 * presença/ausência). Adapter consulta `GEOML_CAPABILITY_META` para
 * enriquecer.
 */
export function geomlAdapter(
    capabilities: Record<string, unknown> | null | undefined,
): RegistryEntry[] {
    if (!capabilities || typeof capabilities !== 'object') return [];
    const out: RegistryEntry[] = [];
    for (const key of Object.keys(capabilities)) {
        if (typeof key !== 'string' || key.length === 0) continue;
        const meta = (GEOML_CAPABILITY_META as any)[key] || {
            group: 'misc',
            description: '',
            ref: '',
        };
        const cap = capabilities[key];
        const isFn = typeof cap === 'function';
        out.push({
            id: key,
            label: key,
            group: meta.group,
            meta: {
                description: meta.description || '',
                callable: isFn,
                module: 'core/geoml',
            },
            ref: meta.ref || '',
        });
    }
    return out;
}

/**
 * Abre catálogo GeoML na UI. Lazy-load do registry. Cobre kernels +
 * regression + validation + optimization como entries descobríveis.
 *
 * Wire real GP no painel de interpolação fica fora do escopo (RF1) —
 * requer integração específica em core/interpolation/manager.
 */
export async function openGeomlCatalog(): Promise<void> {
    try {
        const geoml = (await import('/js/core/geoml/index.js' as any)) as any;
        // Coletar capabilities a partir do módulo (kernels + fns top-level)
        const capabilities: Record<string, unknown> = {};
        const kernels = geoml?.KERNELS || {};
        for (const k of Object.keys(kernels)) capabilities[k] = kernels[k];
        // Top-level functions de interesse
        for (const fn of ['fitGP', 'predictGP', 'looPredictions', 'mae', 'rmse', 'optimizeMLEGridSearch']) {
            if (typeof geoml?.[fn] === 'function') capabilities[fn] = geoml[fn];
        }
        const entries = geomlAdapter(capabilities);
        const title = (t ? t('geomlCatalog.title') : '')
            || `Catálogo GeoML — Gaussian Process (${entries.length} capacidades)`;
        openRegistryCatalog({
            entries,
            title,
            csvFilename: 'geoml-capabilities',
        });
    }
    catch (e: any) {
        console.debug('[geomlCatalog] open failed', e?.message || e);
    }
}
