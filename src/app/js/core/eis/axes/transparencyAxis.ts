// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   EIS — Eixo T (Transparência) Renovado — SPEC-REC-003
   Avaliação objetiva de proveniência de dados com 6 verificações.
   ================================================================

   Referências:
   - ABNT NBR 15495-1: Poços de monitoramento de águas subterrâneas
   - EPA QAPP §3.4: Chain of Custody for Environmental Sampling
   - ISO/IEC 17025:2017: Requisitos gerais para laboratórios
   - CETESB MA-065: Procedimentos de Controle de Qualidade Analítica
   - INMETRO RBC: Rede Brasileira de Calibração
   - ABNT NBR 14166: Rede de referência cadastral municipal

   Fórmula de score: score = 1 + (checks_passadas / 6) × 4
   Range: 1.0 (nenhum check) a 5.0 (todos os checks)
   ================================================================ */

type AnyRecord = Record<string, any>;

interface CheckResult {
    passed: boolean;
    reason: string;
}

interface TransparencyContext {
    acceptableRpd?: number;
    acceptablePrecision?: number;
    requireAllHandoffs?: boolean;
}

interface ResolvedContext {
    acceptableRpd: number;
    acceptablePrecision: number;
    requireAllHandoffs: boolean;
}

interface TransparencyChecks {
    samplingMethodDocumented: boolean;
    chainOfCustodyComplete: boolean;
    labAccredited: boolean;
    qaQcPerformed: boolean;
    instrumentCalibrated: boolean;
    locationPrecision: boolean;
}

interface TransparencyScoreResult {
    score: number;
    checks: Readonly<TransparencyChecks>;
    details: Readonly<Record<keyof TransparencyChecks, Readonly<CheckResult>>>;
    passed: number;
    total: number;
}

// ================================================================
// CONSTANTES - Descritores dos 6 checks de transparência
// ================================================================

/**
 * Descritores dos 6 checks de proveniência do Eixo T.
 * Cada entry mapeia um check de rastreabilidade a uma norma de referência.
 */
export const TRANSPARENCY_CHECKS: ReadonlyArray<{ id: string; label: string; norm: string }> = Object.freeze([
    Object.freeze({
        id: 'samplingMethodDocumented',
        label: 'Método de amostragem documentado',
        norm: 'ABNT NBR 15495-1',
    }),
    Object.freeze({
        id: 'chainOfCustodyComplete',
        label: 'Cadeia de custódia com handoffs assinados',
        norm: 'EPA QAPP §3.4',
    }),
    Object.freeze({
        id: 'labAccredited',
        label: 'Laboratório acreditado ISO 17025',
        norm: 'ISO/IEC 17025:2017',
    }),
    Object.freeze({
        id: 'qaQcPerformed',
        label: 'QA/QC executado (branco + duplicata + RPD)',
        norm: 'CETESB MA-065',
    }),
    Object.freeze({
        id: 'instrumentCalibrated',
        label: 'Instrumento com certificado de calibração válido',
        norm: 'INMETRO RBC',
    }),
    Object.freeze({
        id: 'locationPrecision',
        label: 'Precisão de localização ≤ threshold',
        norm: 'GPS ABNT NBR 14166',
    }),
]);

// ================================================================
// CHECKS INTERNOS - Funções puras de avaliação por check
// ================================================================

/**
 * Check A: Método de amostragem documentado com referência normativa.
 * Verifica presença de referência não-vazia em samplingMethod.
 */
function _checkSamplingMethodDocumented(obs: AnyRecord): CheckResult {
    const ref = obs?.samplingMethod?.reference;
    const passed = Boolean(ref && typeof ref === 'string' && ref.trim() !== '');
    return Object.freeze({
        passed,
        reason: passed ? `Referência documentada: "${ref}"` : 'samplingMethod.reference ausente ou vazio',
    });
}

/**
 * Check B: Cadeia de custódia completa com handoffs assinados.
 * Requer array de handoffs com comprimento mínimo e todos assinados.
 * O comprimento mínimo é determinado por context.requireAllHandoffs:
 *   true (default) → ≥2 handoffs
 *   false          → ≥1 handoff
 */
function _checkChainOfCustodyComplete(obs: AnyRecord, ctx: ResolvedContext): CheckResult {
    const handoffs = obs?.custody?.handoffs;
    const minHandoffs = ctx.requireAllHandoffs === false ? 1 : 2;

    if (!Array.isArray(handoffs)) {
        return Object.freeze({ passed: false, reason: 'custody.handoffs ausente ou não é array' });
    }
    if (handoffs.length < minHandoffs) {
        return Object.freeze({
            passed: false,
            reason: `custody.handoffs tem ${handoffs.length} entradas; mínimo é ${minHandoffs}`,
        });
    }
    const unsigned = handoffs.filter((h: any) => h?.signed !== true);
    if (unsigned.length > 0) {
        return Object.freeze({
            passed: false,
            reason: `${unsigned.length} handoff(s) sem assinatura (signed !== true)`,
        });
    }
    return Object.freeze({ passed: true, reason: `${handoffs.length} handoffs assinados presentes` });
}

/**
 * Check C: Laboratório com escopo de acreditação ISO 17025 declarado.
 * Verificação de presença de string não-vazia; validação de escopo completo
 * é responsabilidade da camada UI/domínio.
 */
function _checkLabAccredited(obs: AnyRecord): CheckResult {
    const scope = obs?.lab?.iso17025Scope;
    const passed = Boolean(scope && typeof scope === 'string' && scope.trim() !== '');
    return Object.freeze({
        passed,
        reason: passed ? `Escopo ISO 17025 declarado: "${scope}"` : 'lab.iso17025Scope ausente ou vazio',
    });
}

/**
 * Check D: Controle de qualidade analítica executado.
 * Requer branco (blank), duplicata (duplicate) e RPD dentro do limite aceitável.
 */
function _checkQaQcPerformed(obs: AnyRecord, ctx: ResolvedContext): CheckResult {
    const qaqc = obs?.qaqc;
    const acceptableRpd = ctx.acceptableRpd ?? 20;

    if (!qaqc?.blank) {
        return Object.freeze({ passed: false, reason: 'qaqc.blank não executado (false ou ausente)' });
    }
    if (!qaqc?.duplicate) {
        return Object.freeze({ passed: false, reason: 'qaqc.duplicate não executado (false ou ausente)' });
    }
    if (typeof qaqc?.rpd !== 'number') {
        return Object.freeze({ passed: false, reason: 'qaqc.rpd ausente ou não numérico' });
    }
    if (qaqc.rpd > acceptableRpd) {
        return Object.freeze({
            passed: false,
            reason: `qaqc.rpd=${qaqc.rpd}% excede limite aceitável de ${acceptableRpd}%`,
        });
    }
    return Object.freeze({
        passed: true,
        reason: `QA/QC completo: branco + duplicata + RPD=${qaqc.rpd}% (≤${acceptableRpd}%)`,
    });
}

/**
 * Check E: Instrumento com certificado de calibração válido.
 * Se calibrationExpiry presente, verifica que não expirou em relação à data da observação.
 * Se calibrationExpiry ausente, aceita como válido (declarado apenas).
 */
function _checkInstrumentCalibrated(obs: AnyRecord): CheckResult {
    const cert = obs?.instrument?.calibrationCertificate;
    if (!cert || typeof cert !== 'string' || cert.trim() === '') {
        return Object.freeze({
            passed: false,
            reason: 'instrument.calibrationCertificate ausente ou vazio',
        });
    }

    const expiry = obs?.instrument?.calibrationExpiry;
    if (expiry) {
        // Compara datas como strings ISO (lexicográfica - válido para YYYY-MM-DD)
        const obsDate = obs?.date;
        if (obsDate && expiry < obsDate) {
            return Object.freeze({
                passed: false,
                reason: `Certificado expirado: calibrationExpiry=${expiry} < data da observação=${obsDate}`,
            });
        }
    }

    return Object.freeze({
        passed: true,
        reason: expiry
            ? `Certificado válido: ${cert} (expiry=${expiry})`
            : `Certificado declarado: ${cert} (sem data de vencimento)`,
    });
}

/**
 * Check F: Precisão de localização dentro do threshold aceitável.
 * Requer valor numérico em precisionMeters menor ou igual ao threshold.
 */
function _checkLocationPrecision(obs: AnyRecord, ctx: ResolvedContext): CheckResult {
    const precision = obs?.location?.precisionMeters;
    const threshold = ctx.acceptablePrecision ?? 1.0;

    if (typeof precision !== 'number') {
        return Object.freeze({
            passed: false,
            reason: 'location.precisionMeters ausente ou não numérico',
        });
    }
    if (precision > threshold) {
        return Object.freeze({
            passed: false,
            reason: `precisionMeters=${precision}m excede threshold de ${threshold}m`,
        });
    }
    return Object.freeze({
        passed: true,
        reason: `Precisão de localização: ${precision}m (≤${threshold}m)`,
    });
}

// ================================================================
// API PÚBLICA
// ================================================================

/**
 * Computa o score do Eixo T (Transparência) de uma observação.
 *
 * Avalia 6 checks objetivos de proveniência e rastreabilidade:
 *   a. samplingMethodDocumented - referência normativa do método
 *   b. chainOfCustodyComplete  - handoffs assinados em cadeia de custódia
 *   c. labAccredited           - escopo de acreditação ISO 17025
 *   d. qaQcPerformed           - branco + duplicata + RPD dentro do limite
 *   e. instrumentCalibrated    - certificado de calibração válido
 *   f. locationPrecision       - localização dentro da precisão aceitável
 *
 * Fórmula: score = 1 + (checks_passadas / 6) × 4
 *   0 checks → score 1.0 (mínimo)
 *   6 checks → score 5.0 (máximo)
 *
 * @param observation - Objeto de observação ambiental com campos de proveniência.
 * @param context - Contexto com thresholds de avaliação.
 * @throws {TypeError} Se observation for null ou undefined.
 */
export function computeTransparencyScore(
    observation: AnyRecord | null | undefined,
    context: TransparencyContext = {},
): Readonly<TransparencyScoreResult> {
    if (observation == null) {
        throw new TypeError('[transparencyAxis] observation não pode ser null ou undefined');
    }

    const ctx: ResolvedContext = {
        acceptableRpd: context.acceptableRpd ?? 20,
        acceptablePrecision: context.acceptablePrecision ?? 1.0,
        requireAllHandoffs: context.requireAllHandoffs !== false,
    };

    // Avaliar cada check individualmente
    const resultA = _checkSamplingMethodDocumented(observation);
    const resultB = _checkChainOfCustodyComplete(observation, ctx);
    const resultC = _checkLabAccredited(observation);
    const resultD = _checkQaQcPerformed(observation, ctx);
    const resultE = _checkInstrumentCalibrated(observation);
    const resultF = _checkLocationPrecision(observation, ctx);

    const checks: Readonly<TransparencyChecks> = Object.freeze({
        samplingMethodDocumented: resultA.passed,
        chainOfCustodyComplete: resultB.passed,
        labAccredited: resultC.passed,
        qaQcPerformed: resultD.passed,
        instrumentCalibrated: resultE.passed,
        locationPrecision: resultF.passed,
    });

    const details = Object.freeze({
        samplingMethodDocumented: Object.freeze({ passed: resultA.passed, reason: resultA.reason }),
        chainOfCustodyComplete: Object.freeze({ passed: resultB.passed, reason: resultB.reason }),
        labAccredited: Object.freeze({ passed: resultC.passed, reason: resultC.reason }),
        qaQcPerformed: Object.freeze({ passed: resultD.passed, reason: resultD.reason }),
        instrumentCalibrated: Object.freeze({ passed: resultE.passed, reason: resultE.reason }),
        locationPrecision: Object.freeze({ passed: resultF.passed, reason: resultF.reason }),
    }) as Readonly<Record<keyof TransparencyChecks, Readonly<CheckResult>>>;

    const passed = Object.values(checks).filter(Boolean).length;
    const total = 6;

    // Fórmula: score = 1 + (passed / 6) * 4, arredondado a 1 decimal
    const raw = 1 + (passed / total) * 4;
    const score = Math.round(raw * 10) / 10;

    return Object.freeze({ score, checks, details, passed, total });
}

/**
 * Classifica o score do Eixo T em grau de rastreabilidade.
 *
 * Escala:
 *   A (≥4.5) - Excelente: rastreabilidade completa
 *   B (≥3.5) - Boa: pequenas lacunas
 *   C (≥2.5) - Regular: lacunas relevantes
 *   D (<2.5)  - Insuficiente: sem rastreabilidade básica
 *
 * @param score - Score do Eixo T (1.0–5.0).
 */
export function getTransparencyGrade(score: number): Readonly<{ grade: string; label: string }> {
    if (score >= 4.5) {
        return Object.freeze({ grade: 'A', label: 'Excelente — rastreabilidade completa' });
    }
    if (score >= 3.5) {
        return Object.freeze({ grade: 'B', label: 'Boa — pequenas lacunas' });
    }
    if (score >= 2.5) {
        return Object.freeze({ grade: 'C', label: 'Regular — lacunas relevantes' });
    }
    return Object.freeze({ grade: 'D', label: 'Insuficiente — sem rastreabilidade básica' });
}
