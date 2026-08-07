// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Parâmetros do Meio Físico — bases padrão CETESB V 4.00 (março/2026).
// Portados do Manual do Usuário Anexo B (PDF pg 51), uma linha por cenário receptor.
//
// IMPORTANTE: valores Object.freeze (ADR-A2). Override do usuário SOMENTE via
// RiskAssessmentInput.mfOverrides — nunca mutar `MF_DEFAULTS` diretamente.
//
// SPEC: docs/specs/features/SPEC_CETESB_RISK_ASSESSMENT.md (CETESB-RISK-001) RF-1.2

import type { ScenarioId } from './_riskCatalogPure.js';

/**
 * Parâmetros do Meio Físico CETESB (Anexo B do Manual V 4.00 mar/2026).
 * Subset mínimo necessário para Fase 1 MVP — cobre os 25 parâmetros principais
 * usados pelos cálculos Johnson&Ettinger 1991 + Domenico 1987 + ASTM E 2081-00.
 */
export interface MfParams {
    // Parâmetros de construção (edificações) ---------------------------------
    /** Ab — Área das fundações (cm²) */
    Ab: number;
    /** Lb — Pé direito (cm) */
    Lb: number;
    /** Lcrk — Espessura das fundações/paredes (cm) */
    Lcrk: number;
    /** η — Fração da área de rachaduras/fendas (cm²-fenda/cm²-área total) */
    eta: number;
    /** θacrk — Conteúdo volumétrico de ar nas fundações (cm³-ar/cm³-vol) */
    thetaAcrk: number;
    /** θwcrk — Conteúdo volumétrico de água nas fundações (cm³-H2O/cm³-vol) */
    thetaWcrk: number;
    /** Xcrk — Perímetro das fundações (cm) */
    Xcrk: number;
    /** Zcrk — Profundidade da base das fundações (cm) */
    Zcrk: number;

    // Atenuação + emissão -----------------------------------------------------
    /** α — Fator de atenuação (USEPA 2015) */
    alpha: number;
    /** ER — Razão de troca de ar em espaços fechados (1/seg) */
    ER: number;
    /** Pa — Taxa de emissão de partículas (g/cm²·seg) */
    Pa: number;
    /** τ — Tempo médio do fluxo de vapor a partir da fonte (s) */
    tau: number;
    /** Uar — Velocidade do ar na zona de respiração (cm/s) */
    Uar: number;
    /** δar — Altura da zona de mistura do ar em ambiente aberto (cm) */
    deltaAr: number;
    /** Kand — Fator de volatilização de Andelman (USEPA 1991b) */
    Kand: number;

    // Solo + zona não saturada ------------------------------------------------
    /** hv — Espessura da zona não saturada (cm) */
    hv: number;
    /** Kv — Permeabilidade do solo ao vapor (cm²) */
    Kv: number;
    /** Ls — Espessura do solo superficial impactado (cm) */
    Ls: number;
    /** Lss — Profundidade do topo da fonte no solo subsuperficial (cm) */
    Lss: number;
    /** dss — Espessura do solo subsuperficial impactado (cm) */
    dss: number;
    /** θas — Conteúdo volumétrico de ar na ZNS (cm³-ar/cm³-solo) */
    thetaAs: number;
    /** θT — Porosidade total (cm³/cm³) */
    thetaT: number;
    /** θws — Conteúdo volumétrico de água na ZNS (cm³-H2O/cm³-solo) */
    thetaWs: number;
    /** ρs — Densidade do solo (g-solo/cm³-solo) */
    rhoS: number;

    // Fonte (geometria) -------------------------------------------------------
    /** A — Área da fonte (cm²) */
    A: number;
    /** Sd — Espessura da fonte na água subterrânea (cm) */
    Sd: number;
    /** Sw — Largura da fonte na água subterrânea (cm) */
    Sw: number;
}

/**
 * Defaults por cenário. Valores portados do Manual Anexo B V 4.00.
 * Pequenas variações entre cenários (Lb/Lcrk/Zcrk/ER/τ/Uar) refletem o tipo de
 * edificação e duração de exposição típicos de cada receptor.
 *
 * Referências CETESB embutidas (Manual Anexo B):
 * - CETESB 2009 (PROPOST 2014/CT MAGIA) — maioria dos parâmetros construtivos
 * - ASTM 2001, 2002 — η, Pa, τ, δar, Ls, Lss, dss, Sd
 * - USEPA 2015 — α
 * - USEPA 2018 — ER (residencial/comercial)
 * - USEPA 1991b — Kand
 * - MAXIMIANO 2001 — θacrk, θwcrk
 */
export const MF_DEFAULTS: Readonly<Record<ScenarioId, Readonly<MfParams>>> = Object.freeze({
    RES_URB: Object.freeze({
        Ab: 200_000,
        Lb: 250,
        Lcrk: 10,
        eta: 0.01,
        thetaAcrk: 0.2806,
        thetaWcrk: 0.1794,
        Xcrk: 1788.85,
        Zcrk: 10.0,
        alpha: 0.03,
        ER: 1.55e-4,
        Pa: 6.9e-14,
        tau: 9.4608e8, // CETESB 2009 (planilha v4.00 mar/2026, parity verified)
        Uar: 100, // CETESB 2009 (planilha v4.00 mar/2026, parity verified)
        deltaAr: 200,
        Kand: 0.5,
        hv: 445,
        Kv: 1.0e-6,
        Ls: 100,
        Lss: 100,
        dss: 345,
        thetaAs: 0.2806,
        thetaT: 0.46,
        thetaWs: 0.1794,
        rhoS: 1.3,
        A: 20_250_000,
        Sd: 200,
        Sw: 4500,
    }),
    RES_RUR: Object.freeze({
        Ab: 200_000,
        Lb: 250,
        Lcrk: 10,
        eta: 0.01,
        thetaAcrk: 0.2806,
        thetaWcrk: 0.1794,
        Xcrk: 1788.85,
        Zcrk: 10.0,
        alpha: 0.03,
        ER: 1.55e-4,
        Pa: 6.9e-14,
        tau: 2.4724224e9, // CETESB 2009 (planilha v4.00 mar/2026, parity verified)
        Uar: 225, // CETESB 2009 (planilha v4.00 mar/2026, parity verified)
        deltaAr: 200,
        Kand: 0.5,
        hv: 445,
        Kv: 1.0e-6,
        Ls: 100,
        Lss: 100,
        dss: 345,
        thetaAs: 0.2806,
        thetaT: 0.46,
        thetaWs: 0.1794,
        rhoS: 1.3,
        A: 20_250_000,
        Sd: 200,
        Sw: 4500,
    }),
    TRAB_COM_IND: Object.freeze({
        Ab: 200_000,
        Lb: 300,
        Lcrk: 15,
        eta: 0.01,
        thetaAcrk: 0.2806,
        thetaWcrk: 0.1794,
        Xcrk: 1788.85,
        Zcrk: 15.0,
        alpha: 0.03,
        ER: 4.16e-4,
        Pa: 6.9e-14,
        tau: 7.8840002e8, // CETESB 2009 (planilha v4.00 mar/2026, parity verified)
        Uar: 100,
        deltaAr: 200,
        Kand: 0.5,
        hv: 445,
        Kv: 1.0e-6,
        Ls: 100,
        Lss: 100,
        dss: 345,
        thetaAs: 0.2806,
        thetaT: 0.46,
        thetaWs: 0.1794,
        rhoS: 1.3,
        A: 20_250_000,
        Sd: 200,
        Sw: 4500,
    }),
    TRAB_OBRA_CIV: Object.freeze({
        Ab: 200_000,
        Lb: 250,
        Lcrk: 15,
        eta: 0.01,
        thetaAcrk: 0.2806,
        thetaWcrk: 0.1794,
        Xcrk: 1788.85,
        Zcrk: 15.0,
        alpha: 0.03,
        ER: 1.39e-4,
        Pa: 6.9e-14,
        tau: 3.1536e7, // CETESB 2009 (planilha v4.00 mar/2026, parity verified)
        Uar: 100,
        deltaAr: 200,
        Kand: 0.5,
        hv: 445,
        Kv: 1.0e-6,
        Ls: 100,
        Lss: 100,
        dss: 345,
        thetaAs: 0.2806,
        thetaT: 0.46,
        thetaWs: 0.1794,
        rhoS: 1.3,
        A: 20_250_000,
        Sd: 200,
        Sw: 4500,
    }),
});

/** Retorna o subconjunto de parâmetros MF para um cenário. */
export function getMfDefaults(scenarioId: ScenarioId): Readonly<MfParams> | undefined {
    return MF_DEFAULTS[scenarioId];
}

/**
 * Aplica overrides do usuário a um MF base, retornando um objeto NOVO (não muta).
 * Campos undefined nos overrides preservam o default.
 */
export function applyMfOverrides(
    base: Readonly<MfParams>,
    overrides: Partial<MfParams> | undefined,
): MfParams {
    if (!overrides) return { ...base };
    const out: MfParams = { ...base };
    for (const key of Object.keys(overrides) as Array<keyof MfParams>) {
        const v = overrides[key];
        if (v !== undefined && Number.isFinite(v)) {
            out[key] = v as number;
        }
    }
    return out;
}

/** Source string para auditoria (carimbado em RiskAssessmentResult.source). */
export const MF_SOURCE = 'CETESB DD 103/2007/C/E v4.00 — Anexo B (mar/2026)' as const;
