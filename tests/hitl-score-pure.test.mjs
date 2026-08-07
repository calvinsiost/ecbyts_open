// SCORES-HEALTH-001 RF-11.2: Testes computeHitlLoad + TCR@k
//
// TEST-HEALTH-001#9: este arquivo importa .ts DIRETO (sem build .js mirror —
// _hitlScorePure.ts não está em scripts/ts-migration-map.json, é TS-only sem
// consumidor no app browser). `node --test` puro falha com
// ERR_UNKNOWN_FILE_EXTENSION. Rodar via `npm run test:amh:ts` (usa
// --experimental-strip-types, feature nativa Node 22.14+, sem dep extra). Ver
// AGENTS.md secão "Tests that import .ts directly" para a decisão completa.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeHitlLoad, formatHitlScore } from '../src/app/js/core/scores/_hitlScorePure.ts';

describe('computeHitlLoad — tabela-verdade', () => {
    it('ABSENT: eventos vazios → null/null', () => {
        const r = computeHitlLoad([]);
        assert.equal(r.hitlLoad, null);
        assert.equal(r.tcrAtK, null);
        assert.equal(r.windowDescription, 'empty');
    });

    it('ABSENT: null input → null/null', () => {
        const r = computeHitlLoad(null);
        assert.equal(r.hitlLoad, null);
        assert.equal(r.tcrAtK, null);
    });

    it('ABSENT: só intervenções, nenhum done → null/null', () => {
        const r = computeHitlLoad([
            { activityKey: 'A', type: 'hitl_intervention' },
            { activityKey: 'B', type: 'hitl_intervention' },
        ]);
        assert.equal(r.hitlLoad, null);
        assert.equal(r.tcrAtK, null);
        assert.equal(r.totalInterventions, 2);
        assert.equal(r.totalDone, 0);
    });

    it('3 done, 0 intervenções → hitlLoad=0, TCR@1=1.0', () => {
        const r = computeHitlLoad([
            { activityKey: 'A', type: 'task_done' },
            { activityKey: 'B', type: 'task_done' },
            { activityKey: 'C', type: 'task_done' },
        ]);
        assert.equal(r.hitlLoad, 0);
        assert.equal(r.tcrAtK, 1.0);
        assert.equal(r.totalDone, 3);
        assert.equal(r.totalInterventions, 0);
    });

    it('4 done, 2 intervenções → hitlLoad=0.5, TCR@1=1.0', () => {
        const r = computeHitlLoad([
            { activityKey: 'A', type: 'task_done' },
            { activityKey: 'B', type: 'task_done' },
            { activityKey: 'C', type: 'task_done' },
            { activityKey: 'D', type: 'task_done' },
            { activityKey: 'A', type: 'hitl_intervention' },
            { activityKey: 'B', type: 'hitl_intervention' },
        ]);
        assert.equal(r.hitlLoad, 0.5);
        assert.equal(r.tcrAtK, 1.0); // todas com ≤1 intervenção
    });

    it('2 done, 4 intervenções → hitlLoad=2.0, TCR@1=0.0 (sobrecarga)', () => {
        const r = computeHitlLoad([
            { activityKey: 'A', type: 'task_done' },
            { activityKey: 'B', type: 'task_done' },
            { activityKey: 'A', type: 'hitl_intervention' },
            { activityKey: 'A', type: 'hitl_intervention' },
            { activityKey: 'B', type: 'hitl_intervention' },
            { activityKey: 'B', type: 'hitl_intervention' },
        ]);
        assert.equal(r.hitlLoad, 2.0);
        assert.equal(r.tcrAtK, 0.0); // nenhuma com ≤1
    });

    it('TCR@2: task com 2 interv → incluída no TCR@2 mas não no TCR@1', () => {
        const r = computeHitlLoad(
            [
                { activityKey: 'A', type: 'task_done' },
                { activityKey: 'B', type: 'task_done' },
                { activityKey: 'A', type: 'hitl_intervention' },
                { activityKey: 'A', type: 'hitl_intervention' },
                { activityKey: 'B', type: 'hitl_intervention' },
            ],
            { k: 2 },
        );
        // A tem 2 intv (≤2 ✓), B tem 1 intv (≤2 ✓) → TCR@2 = 1.0
        assert.equal(r.tcrAtK, 1.0);
        // hitlLoad = 3/2 = 1.5
        assert.equal(r.hitlLoad, 1.5);
    });

    it('k default = 1', () => {
        const r = computeHitlLoad([
            { activityKey: 'A', type: 'task_done' },
            { activityKey: 'A', type: 'hitl_intervention' },
            { activityKey: 'A', type: 'hitl_intervention' },
        ]);
        // A tem 2 intv > k=1 → TCR@1 = 0
        assert.equal(r.tcrAtK, 0.0);
    });
});

describe('formatHitlScore', () => {
    it('ABSENT → "ABSENT"', () => {
        assert.equal(
            formatHitlScore({
                hitlLoad: null,
                tcrAtK: null,
                totalInterventions: 0,
                totalDone: 0,
                windowDescription: 'empty',
            }),
            'ABSENT',
        );
    });

    it('valores reais → string formatada', () => {
        const s = formatHitlScore({
            hitlLoad: 0.5,
            tcrAtK: 0.75,
            totalInterventions: 2,
            totalDone: 4,
            windowDescription: 'test',
        });
        assert.ok(s.includes('HITL'));
        assert.ok(s.includes('TCR'));
        assert.ok(s.includes('50.0%'));
    });
});
