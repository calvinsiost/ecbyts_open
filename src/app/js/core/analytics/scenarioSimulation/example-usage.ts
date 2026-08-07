// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Scenario Simulation - Example Usage
/* ================================================================
   EXEMPLOS DE USO — Scenario Simulation Engine
   ================================================================

   Este arquivo demonstra como usar o motor de simulação.
   Não é carregado em produção — serve como documentação executável.
   ================================================================ */
import { runScenarioSimulation, runScenarioById, compareStrategies, compareStrategiesByScenario, generateSummary, getScenario, getDecision, } from './index.js';
// ================================================================
// EXEMPLO 1: Simulação Simples
// ================================================================
async function exemploSimulacaoSimples() {
    console.log('=== Exemplo 1: Simulação Simples ===');
    // Usando cenário pré-definido
    const resultado: any = runScenarioById('btex_gas_station', { numRuns: 300 });
    console.log('Score:', resultado.score.score, resultado.score.label);
    console.log('Probabilidade de conformidade:', resultado.stats.probabilities.compliance);
    console.log('Custo mediano:', resultado.stats.totalCost.p50);
    // Relatório em texto
    console.log('\n' + generateSummary(resultado));
}
// ================================================================
// EXEMPLO 2: Simulação com Parâmetros Customizados
// ================================================================
async function exemploParametrosCustomizados() {
    console.log('=== Exemplo 2: Parâmetros Customizados ===');
    const params = {
        initialConcentration: 5000, // µg/L
        threshold: 100, // VI de benzeno
        backgroundLevel: 0.5,
        initialRadius: 30,
        naturalDecayRate: 0.008,
        dispersionRate: 0.015,
        initialHealth: 60,
        months: 120,
        initialCost: 50000,
        monitoringCost: 3000,
        remediationActive: false, // Sem remediação ativa
        failureProbability: 0.002,
    };
    const resultado: any = runScenarioSimulation(params, { numRuns: 200 });
    console.log('Conformidade:', (resultado.stats.probabilities.compliance * 100).toFixed(1) + '%');
    console.log('Custo P10/P50/P90:', resultado.stats.totalCost.p10.toFixed(0), resultado.stats.totalCost.p50.toFixed(0), resultado.stats.totalCost.p90.toFixed(0));
}
// ================================================================
// EXEMPLO 3: Simulação com Decisão (Pump & Treat)
// ================================================================
async function exemploComDecisao() {
    console.log('=== Exemplo 3: Com Decisão ===');
    const params = {
        initialConcentration: 5000,
        threshold: 100,
        months: 120,
        // ... outros parâmetros
    };
    // Sem remediação (baseline)
    const baseline = runScenarioSimulation(params, { numRuns: 200 });
    console.log('Baseline - Score:', baseline.score.score);
    // Com Pump & Treat
    const decision = getDecision('pump_and_treat');
    const comRemediacao = runScenarioSimulation(params, {
        numRuns: 200,
        decisionMods: decision.mods,
    });
    console.log('Com P&T - Score:', comRemediacao.score.score);
    console.log('Delta:', comRemediacao.score.score - baseline.score.score);
}
// ================================================================
// EXEMPLO 4: Comparação de Múltiplas Estratégias
// ================================================================
async function exemploComparacao() {
    console.log('=== Exemplo 4: Comparação de Estratégias ===');
    const estrategias = ['mna_early', 'pump_and_treat', 'prb_zero_valent', 'full_founder'];
    const comparacao: any = compareStrategiesByScenario('btex_gas_station', estrategias, 200);
    console.log('Baseline:', comparacao.baseline.score.score);
    console.log('\nRanking:');
    comparacao.comparisons.forEach((c: any, i: number) => {
        console.log(`${i + 1}. ${c.name}`);
        console.log(`   Score: ${c.score.score} (${c.deltas.score > 0 ? '+' : ''}${c.deltas.score})`);
        console.log(`   Conformidade: ${(c.stats.probabilities.compliance * 100).toFixed(0)}%`);
        console.log(`   Custo mediano: R$ ${(c.stats.totalCost.p50 / 1000).toFixed(0)}k`);
    });
}
// ================================================================
// EXEMPLO 5: Acesso a Timeline (Fan Chart Data)
// ================================================================
async function exemploTimeline() {
    console.log('=== Exemplo 5: Timeline para Fan Chart ===');
    const resultado: any = runScenarioById('btex_gas_station', { numRuns: 300 });
    // Dados para fan chart de concentração
    const timelineData = resultado.stats.timeline.map((t: any) => ({
        month: t.month,
        p10: t.concentration.p10,
        p50: t.concentration.p50,
        p90: t.concentration.p90
    }));
    console.log('Último mês:', timelineData[timelineData.length - 1]);
    // Dados para fan chart de custo acumulado
    const costData = resultado.stats.timeline.map((t: any) => ({
        month: t.month,
        p10: t.cost.p10,
        p50: t.cost.p50,
        p90: t.cost.p90
    }));
    console.log('Custo acumulado (ano 10):', costData[costData.length - 1]);
}
// ================================================================
// EXEMPLO 6: Análise de Risco
// ================================================================
async function exemploAnaliseRisco() {
    console.log('=== Exemplo 6: Análise de Risco ===');
    const resultado: any = runScenarioById('chlorinated_solvents', { numRuns: 500 });
    const probs = resultado.stats.probabilities;
    console.log('Probabilidades:');
    console.log('  - Conformidade:', (probs.compliance * 100).toFixed(1) + '%');
    console.log('  - Falha:', (probs.failure * 100).toFixed(1) + '%');
    console.log('  - Estouro de orçamento:', (probs.costOverrun * 100).toFixed(1) + '%');
    // Value at Risk (VaR) de custo: P95
    const var95 = resultado.stats.totalCost.p90 * 1.05; // aproximação
    console.log('\nValue at Risk (95%): R$', var95.toLocaleString());
}
// ================================================================
// EXEMPLO 7: Sensitivity Analysis (via múltiplas simulações)
// ================================================================
async function exemploSensibilidade() {
    console.log('=== Exemplo 7: Análise de Sensibilidade ===');
    const params = {
        initialConcentration: 5000,
        threshold: 100,
        months: 120,
    };
    const taxasDecaimento = [0.002, 0.005, 0.008, 0.012, 0.02];
    console.log('Efeito da taxa de decaimento natural:');
    for (const rate of taxasDecaimento) {
        const resultado: any = runScenarioSimulation({ ...params, naturalDecayRate: rate }, { numRuns: 100 });
        console.log(`  ${(rate * 100).toFixed(1)}%/mês:`, `conformidade ${((resultado.stats as any)?.probabilities?.compliance * 100).toFixed(0)}%,`, `score ${resultado.score.score}`);
    }
}
// ================================================================
// EXEMPLO 8: Custom Decision
// ================================================================
async function exemploDecisaoCustom() {
    console.log('=== Exemplo 8: Decisão Customizada ===');
    // Definir decisão inline (não precisa estar em decisionDefs.js)
    const minhaEstrategia = {
        id: 'hibrida_custom',
        name: 'Estratégia Híbrida Customizada',
        description: 'Bioestimulação + monitoramento denso',
        mods: {
            remediationActive: true,
            remediationEfficiency: 0.1,
            naturalDecayRate: 0.018,
            initialCost: 300000,
            remediationOpex: 10000,
            monitoringCost: 6000,
            failureProbability: 0.0015,
        },
    };
    const resultado = compareStrategies(getScenario('btex_gas_station').params, [minhaEstrategia], 200);
    console.log('Resultado estratégia custom:', resultado.comparisons[0].score.score);
}
// ================================================================
// EXECUÇÃO (descomente para testar no console)
// ================================================================
// exemploSimulacaoSimples();
// exemploParametrosCustomizados();
// exemploComDecisao();
// exemploComparacao();
// exemploTimeline();
// exemploAnaliseRisco();
// exemploSensibilidade();
// exemploDecisaoCustom();
// Export para uso em testes
export { exemploSimulacaoSimples, exemploParametrosCustomizados, exemploComDecisao, exemploComparacao, exemploTimeline, exemploAnaliseRisco, exemploSensibilidade, exemploDecisaoCustom, };
