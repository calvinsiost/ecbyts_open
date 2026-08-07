// SCORES-HEALTH-001 RF-11.3: Testes turn-budget com parada honesta
//
// TEST-HEALTH-001#9: este arquivo importa .ts DIRETO (sem build .js mirror —
// _turnBudgetPure.ts não está em scripts/ts-migration-map.json, é TS-only sem
// consumidor no app browser). `node --test` puro falha com
// ERR_UNKNOWN_FILE_EXTENSION. Rodar via `npm run test:amh:ts` (usa
// --experimental-strip-types, feature nativa Node 22.14+, sem dep extra). Ver
// AGENTS.md secão "Tests that import .ts directly" para a decisão completa.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTurnBudget, DEFAULT_TURN_BUDGET } from '../src/app/js/core/scores/_turnBudgetPure.ts';

describe('evaluateTurnBudget', () => {
    it('0 iterações → ok, remaining=25', () => {
        const r = evaluateTurnBudget(0);
        assert.equal(r.shouldStop, false);
        assert.equal(r.reason, 'ok');
        assert.equal(r.remaining, 25);
    });

    it('10 iterações → ok (40% do budget)', () => {
        const r = evaluateTurnBudget(10);
        assert.equal(r.shouldStop, false);
        assert.equal(r.reason, 'ok');
        assert.equal(r.remaining, 15);
    });

    it('20 iterações → warning (80% do threshold)', () => {
        const r = evaluateTurnBudget(20);
        assert.equal(r.shouldStop, false);
        assert.equal(r.reason, 'budget_warning');
        assert.equal(r.severity, 'warning');
    });

    it('25 iterações → STOP (budget exhausted)', () => {
        const r = evaluateTurnBudget(25);
        assert.equal(r.shouldStop, true);
        assert.equal(r.reason, 'budget_exhausted');
        assert.equal(r.severity, 'critical');
        assert.equal(r.remaining, 0);
    });

    it('30 iterações → STOP (acima do budget)', () => {
        const r = evaluateTurnBudget(30);
        assert.equal(r.shouldStop, true);
        assert.equal(r.reason, 'budget_exhausted');
    });

    it('budget customizado (10) + 10 iterações → STOP', () => {
        const r = evaluateTurnBudget(10, { budget: 10 });
        assert.equal(r.shouldStop, true);
        assert.equal(r.reason, 'budget_exhausted');
    });

    it('iterações inválidas (NaN) → não para, reason=invalid', () => {
        const r = evaluateTurnBudget(NaN);
        assert.equal(r.shouldStop, false);
        assert.equal(r.reason, 'invalid_iterations');
    });

    it('iterações negativas → não para, reason=invalid', () => {
        const r = evaluateTurnBudget(-5);
        assert.equal(r.shouldStop, false);
        assert.equal(r.reason, 'invalid_iterations');
    });
});
