// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// utils/handlers/decisionRulesHandler.js
// Wire-up of P1-53 decision rules engine into UI.
// window.handleShowDecisionRules() - demo ALARP + precautionary + cost-benefit.

import {
    DECISION_FRAMEWORKS,
    classifyAlarpRegion,
    applyPrecautionaryPrinciple,
    computeCostBenefit,
    makeDecision,
} from '../../core/uncertainty/decisionRulesEngine.js';
import { showToast } from '../ui/toast.js';

export function handleShowDecisionRules() {
    const riskScore = 0.55;
    const samples = Array.from({ length: 100 }, () => Math.random() * 0.6 + 0.1);
    const cb = { costs: [100, 50, 50, 50, 50], benefits: [0, 80, 80, 80, 80], discountRate: 0.08, years: 5 };

    const alarp = classifyAlarpRegion(riskScore);
    const prec = applyPrecautionaryPrinciple(samples, 0.5);
    const cost = computeCostBenefit(cb.costs, cb.benefits, cb.discountRate, cb.years);
    const decision = makeDecision(riskScore, samples, cb, DECISION_FRAMEWORKS.ALARP);

    const lines = [
        `Decision rules demo — risk=${riskScore} samples=${samples.length}`,
        `ALARP: ${alarp} | Precaut: ${prec.decision} (P>thr=${prec.exceedanceProbability.toFixed(2)})`,
        `BCR=${cost.bcr.toFixed(2)} → ${cost.recommendation} | ALARP framework: ${decision.decision}`,
    ];
    showToast(lines.join(' • '), 'info', 7000);
}

export const decisionRulesHandlers = { handleShowDecisionRules };
