// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Portable handler para cenários de avaliação de risco CETESB.
// Permite salvar/importar cenário .ecbt kind-aware via P1-10 portableArtifacts.
//
// Payload: { sqiCas, scenario, mediaImpacted, concentrations, mfOverrides?, targetILCR?, targetHQ? }
// Wrapper: ECBT.B0000001-{fam}-{...}-payload-{...}.TBCE com _kind="risk_scenario"
//
// SPEC: CETESB-RISK-001 Sub-4.1.4 (Salvar/Importar cenário .ecbt)
//
// Validations (pre-encode + post-decode):
//   - sqiCas: CAS válido formato N-NN-N (regex)
//   - scenario: RES_URB | RES_RUR | TRAB_COM_IND | TRAB_OBRA_CIV
//   - mediaImpacted: array não-vazio com 'soil' | 'groundwater' | 'air'
//   - concentrations: objeto com pelo menos uma concentração > 0

import type { PortableHandler, ValidationResult } from '../../io/portableArtifacts.js';

const SCHEMA_VERSION = 1;
const VALID_SCENARIOS = new Set(['RES_URB', 'RES_RUR', 'TRAB_COM_IND', 'TRAB_OBRA_CIV']);
const VALID_MEDIA = new Set(['soil', 'groundwater', 'air']);
const CAS_REGEX = /^[1-9]\d{0,6}-\d{2}-\d$/;

export interface RiskScenarioPayload {
    sqiCas: string;
    scenario: string;
    mediaImpacted: ReadonlyArray<string>;
    concentrations: { soil?: number; groundwater?: number; air?: number };
    mfOverrides?: Record<string, number>;
    targetILCR?: number;
    targetHQ?: number;
    label?: string;
}

export function validateRiskScenario(payload: unknown): ValidationResult {
    const errors: string[] = [];
    if (!payload || typeof payload !== 'object') {
        return { valid: false, errors: ['payload deve ser objeto'] };
    }
    const p = payload as Record<string, unknown>;

    if (typeof p.sqiCas !== 'string' || !CAS_REGEX.test(p.sqiCas)) {
        errors.push(`sqiCas inválido (esperado formato CAS N-NN-N): ${p.sqiCas}`);
    }
    if (typeof p.scenario !== 'string' || !VALID_SCENARIOS.has(p.scenario)) {
        errors.push(`scenario inválido (esperado RES_URB|RES_RUR|TRAB_COM_IND|TRAB_OBRA_CIV): ${p.scenario}`);
    }
    if (!Array.isArray(p.mediaImpacted) || p.mediaImpacted.length === 0) {
        errors.push('mediaImpacted deve ser array não-vazio');
    } else {
        for (const m of p.mediaImpacted) {
            if (typeof m !== 'string' || !VALID_MEDIA.has(m)) {
                errors.push(`mediaImpacted contém valor inválido: ${m}`);
            }
        }
    }
    if (!p.concentrations || typeof p.concentrations !== 'object') {
        errors.push('concentrations deve ser objeto');
    } else {
        const c = p.concentrations as Record<string, unknown>;
        const hasPositive =
            (typeof c.soil === 'number' && c.soil > 0) ||
            (typeof c.groundwater === 'number' && c.groundwater > 0) ||
            (typeof c.air === 'number' && c.air > 0);
        if (!hasPositive) errors.push('concentrations precisa ter ao menos um valor > 0');
        for (const [k, v] of Object.entries(c)) {
            if (!VALID_MEDIA.has(k)) errors.push(`concentrations key inválida: ${k}`);
            if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
                errors.push(`concentrations.${k} deve ser número finito >= 0`);
            }
        }
    }
    if (p.targetILCR !== undefined && (typeof p.targetILCR !== 'number' || p.targetILCR <= 0)) {
        errors.push('targetILCR deve ser número > 0');
    }
    if (p.targetHQ !== undefined && (typeof p.targetHQ !== 'number' || p.targetHQ <= 0)) {
        errors.push('targetHQ deve ser número > 0');
    }
    return { valid: errors.length === 0, errors };
}

export function toRiskScenarioArtifact(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') return null;
    const p = obj as RiskScenarioPayload;
    // Object.freeze para deep imutabilidade do artifact
    return Object.freeze({
        sqiCas: p.sqiCas,
        scenario: p.scenario,
        mediaImpacted: Object.freeze([...p.mediaImpacted]),
        concentrations: Object.freeze({
            ...(p.concentrations.soil !== undefined && { soil: p.concentrations.soil }),
            ...(p.concentrations.groundwater !== undefined && { groundwater: p.concentrations.groundwater }),
            ...(p.concentrations.air !== undefined && { air: p.concentrations.air }),
        }),
        ...(p.mfOverrides && { mfOverrides: Object.freeze({ ...p.mfOverrides }) }),
        ...(p.targetILCR !== undefined && { targetILCR: p.targetILCR }),
        ...(p.targetHQ !== undefined && { targetHQ: p.targetHQ }),
        ...(p.label && { label: p.label }),
    });
}

export function fromRiskScenarioArtifact(artifact: unknown): RiskScenarioPayload | null {
    if (!artifact || typeof artifact !== 'object') return null;
    const a = artifact as Record<string, unknown>;
    return {
        sqiCas: String(a.sqiCas),
        scenario: String(a.scenario),
        mediaImpacted: Array.isArray(a.mediaImpacted) ? (a.mediaImpacted as string[]) : [],
        concentrations: (a.concentrations as RiskScenarioPayload['concentrations']) || {},
        ...(a.mfOverrides ? { mfOverrides: a.mfOverrides as Record<string, number> } : {}),
        ...(typeof a.targetILCR === 'number' && { targetILCR: a.targetILCR }),
        ...(typeof a.targetHQ === 'number' && { targetHQ: a.targetHQ }),
        ...(typeof a.label === 'string' && { label: a.label }),
    };
}

/** Aplica o cenário importado — handler default só valida; UI bind via openRiskAssessmentPanel. */
async function applyRiskScenarioImport(_obj: unknown): Promise<boolean> {
    // Pure-handler — UI integration via riskAssessmentPanel.openWithScenario() (futuro).
    // Por ora apenas valida shape; rendering fica a cargo do caller.
    return true;
}

export const riskScenarioHandler: PortableHandler = Object.freeze({
    kind: 'risk_scenario',
    schemaVersion: SCHEMA_VERSION,
    validate: validateRiskScenario,
    toArtifact: toRiskScenarioArtifact,
    fromArtifact: fromRiskScenarioArtifact,
    applyImport: applyRiskScenarioImport,
});

/** Auto-registra o handler no portableArtifacts registry. Idempotente via registerKind. */
export async function registerRiskScenarioKind(): Promise<void> {
    const { registerKind } = await import('../../io/portableArtifacts.js');
    registerKind(riskScenarioHandler);
}
