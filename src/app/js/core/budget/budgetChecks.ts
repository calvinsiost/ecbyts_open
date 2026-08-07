// @ts-check
// micro_activity:acad:p2:orcamento-cotado:x03 — Motor de checagens declarativas de orçamento.
// Valida orçamento cotado (padrão de agências de fomento) contra regras configuráveis:
// capex-fraction, envelope-total, rubrica-min, contrapartida.
// Puro: sem DOM, sem side-effects, sem dependências externas.

export type RubricaCategory = 'capex' | 'opex' | 'contrapartida' | 'outros';

export interface BudgetRubrica {
    readonly id: string;
    readonly name: string;
    readonly value: number;
    readonly category: RubricaCategory;
}

export interface Budget {
    readonly totalEnvelope: number;
    readonly rubricas: readonly BudgetRubrica[];
    readonly contrapartidaTotal?: number;
}

export type BudgetCheckType = 'capex-fraction' | 'envelope-total' | 'rubrica-min' | 'contrapartida';

export interface BudgetRule {
    readonly id: string;
    readonly type: BudgetCheckType;
    readonly threshold?: number;
    readonly minValue?: number;
    readonly minCount?: number;
    readonly severity?: 'error' | 'warning';
}

export interface BudgetCheckResult {
    readonly ruleId: string;
    readonly type: BudgetCheckType;
    readonly pass: boolean;
    readonly severity: 'error' | 'warning';
    readonly message: string;
    readonly actual?: number;
    readonly expected?: number;
}

export const DEFAULT_CAPEX_FRACTION_LIMIT = 0.20;
export const DEFAULT_CONTRAPARTIDA_FRACTION = 0.10;
export const ENVELOPE_TOLERANCE = 0.01;

function sumByCategory(rubricas: readonly BudgetRubrica[], category: RubricaCategory): number {
    let total = 0;
    for (const r of rubricas) {
        if (r.category === category && Number.isFinite(r.value)) {
            total += r.value;
        }
    }
    return total;
}

function sumAll(rubricas: readonly BudgetRubrica[]): number {
    let total = 0;
    for (const r of rubricas) {
        if (Number.isFinite(r.value)) {
            total += r.value;
        }
    }
    return total;
}

function checkCapexFraction(budget: Budget, rule: BudgetRule): BudgetCheckResult {
    const limit = rule.threshold ?? DEFAULT_CAPEX_FRACTION_LIMIT;
    const severity = rule.severity ?? 'error';
    const capexTotal = sumByCategory(budget.rubricas, 'capex');
    const envelope = budget.totalEnvelope;

    if (!Number.isFinite(envelope) || envelope <= 0) {
        return {
            ruleId: rule.id,
            type: 'capex-fraction',
            pass: false,
            severity,
            message: 'Envelope total inválido ou zero — impossível calcular fração CAPEX.',
            actual: capexTotal,
            expected: limit,
        };
    }

    const fraction = capexTotal / envelope;
    const pass = fraction <= limit + 1e-9;

    return {
        ruleId: rule.id,
        type: 'capex-fraction',
        pass,
        severity,
        message: pass
            ? 'CAPEX dentro do limite (' + (fraction * 100).toFixed(1) + '% ≤ ' + (limit * 100).toFixed(0) + '%).'
            : 'CAPEX excede o limite (' + (fraction * 100).toFixed(1) + '% > ' + (limit * 100).toFixed(0) + '%).',
        actual: fraction,
        expected: limit,
    };
}

function checkEnvelopeTotal(budget: Budget, rule: BudgetRule): BudgetCheckResult {
    const severity = rule.severity ?? 'error';
    const declared = budget.totalEnvelope;
    const computed = sumAll(budget.rubricas);

    if (!Number.isFinite(declared)) {
        return {
            ruleId: rule.id,
            type: 'envelope-total',
            pass: false,
            severity,
            message: 'Envelope total declarado não é um número finito.',
            actual: computed,
            expected: declared,
        };
    }

    const tolerance = rule.threshold ?? ENVELOPE_TOLERANCE;
    const diff = Math.abs(computed - declared);
    const pass = diff <= tolerance;

    return {
        ruleId: rule.id,
        type: 'envelope-total',
        pass,
        severity,
        message: pass
            ? 'Soma das rubricas (' + computed.toFixed(2) + ') confere com o envelope (' + declared.toFixed(2) + ').'
            : 'Divergência: soma das rubricas (' + computed.toFixed(2) + ') ≠ envelope declarado (' + declared.toFixed(2) + '), Δ=' + diff.toFixed(2) + '.',
        actual: computed,
        expected: declared,
    };
}

function checkRubricaMin(budget: Budget, rule: BudgetRule): BudgetCheckResult {
    const severity = rule.severity ?? 'warning';
    const minValue = rule.minValue ?? 0;
    const minCount = rule.minCount ?? 1;

    const violations: string[] = [];
    let validCount = 0;

    for (const r of budget.rubricas) {
        if (Number.isFinite(r.value) && r.value >= minValue) {
            validCount++;
        } else if (r.value < minValue) {
            violations.push(r.id + ' (' + r.value.toFixed(2) + ' < ' + minValue.toFixed(2) + ')');
        }
    }

    const countPass = validCount >= minCount;
    const valuePass = violations.length === 0;
    const pass = countPass && valuePass;

    let message: string;
    if (!countPass && !valuePass) {
        message = 'Rubricas abaixo do mínimo (' + violations.join('; ') + ') e contagem insuficiente (' + validCount + '/' + minCount + ').';
    } else if (!countPass) {
        message = 'Contagem de rubricas válidas insuficiente (' + validCount + '/' + minCount + ').';
    } else if (!valuePass) {
        message = 'Rubricas abaixo do valor mínimo: ' + violations.join('; ') + '.';
    } else {
        message = 'Todas as ' + validCount + ' rubricas atendem ao mínimo (' + minValue.toFixed(2) + ').';
    }

    return {
        ruleId: rule.id,
        type: 'rubrica-min',
        pass,
        severity,
        message,
        actual: validCount,
        expected: minCount,
    };
}

function checkContrapartida(budget: Budget, rule: BudgetRule): BudgetCheckResult {
    const severity = rule.severity ?? 'error';
    const requiredFraction = rule.threshold ?? DEFAULT_CONTRAPARTIDA_FRACTION;
    const envelope = budget.totalEnvelope;

    const contrapartida = budget.contrapartidaTotal ?? sumByCategory(budget.rubricas, 'contrapartida');

    if (!Number.isFinite(envelope) || envelope <= 0) {
        return {
            ruleId: rule.id,
            type: 'contrapartida',
            pass: false,
            severity,
            message: 'Envelope total inválido — impossível validar contrapartida.',
            actual: contrapartida,
            expected: requiredFraction,
        };
    }

    const fraction = contrapartida / envelope;
    const pass = fraction >= requiredFraction - 1e-9;

    return {
        ruleId: rule.id,
        type: 'contrapartida',
        pass,
        severity,
        message: pass
            ? 'Contrapartida atende ao mínimo (' + (fraction * 100).toFixed(1) + '% ≥ ' + (requiredFraction * 100).toFixed(0) + '%).'
            : 'Contrapartida insuficiente (' + (fraction * 100).toFixed(1) + '% < ' + (requiredFraction * 100).toFixed(0) + '%).',
        actual: fraction,
        expected: requiredFraction,
    };
}

const CHECK_DISPATCH: Record<BudgetCheckType, (budget: Budget, rule: BudgetRule) => BudgetCheckResult> = {
    'capex-fraction': checkCapexFraction,
    'envelope-total': checkEnvelopeTotal,
    'rubrica-min': checkRubricaMin,
    'contrapartida': checkContrapartida,
};

export function runBudgetChecks(budget: Budget, rules: readonly BudgetRule[]): BudgetCheckResult[] {
    const results: BudgetCheckResult[] = [];

    for (const rule of rules) {
        const handler = CHECK_DISPATCH[rule.type];
        if (!handler) {
            results.push({
                ruleId: rule.id,
                type: rule.type,
                pass: false,
                severity: 'error',
                message: 'Tipo de checagem desconhecido: ' + rule.type,
            });
            continue;
        }
        results.push(handler(budget, rule));
    }

    return results;
}

export function allChecksPass(results: readonly BudgetCheckResult[]): boolean {
    return results.every((r) => r.pass);
}

export function failuresOnly(results: readonly BudgetCheckResult[]): BudgetCheckResult[] {
    return results.filter((r) => !r.pass);
}
