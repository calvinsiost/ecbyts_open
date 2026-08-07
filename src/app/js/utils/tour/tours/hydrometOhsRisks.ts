// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   GUIDED TOUR — Hydromet OHS Risks (1 tour, 7 steps ACIONÁVEIS)

   Calvin 2026-06-09: "na tela ele não continua selecionando nada
   que faça sentido nem inserindo nenhum elemento ou leitura que
   seja válida"

   Refatorado: cada step agora AGE no modelo de verdade via headless
   handlers (handleAddElement + handleAddObservation com _headless:true)
   para que o usuário VEJA o tanque sendo criado no canvas + observações
   reais sendo inseridas. Sem "tooltip flutuante vazio".

   Sequência operacional:
   1. Intro
   2. Cria tanque "Lixiviação Heap-1" no canvas
   3. Insere 5 observações químicas reais (pH, H2SO4, As, Cd, HCN ar)
   4. Aplica preset CONAMA 420 (regulatório water/solo) + abre validation
   5. Abre workflow picker p/ Emergency Response
   6. Resume + EIS T impact
   7. Complete
   ================================================================ */

import { registerGuidedTour } from '../categories.js';

const W: any = typeof window !== 'undefined' ? window : {};

// Estado compartilhado entre steps (id do tanque criado no step 2).
const _state = { tankId: null as string | null };

function _selectCreatedTank(tankId: string): void {
    try { W.setSelectedElement?.(tankId); } catch (e) { console.debug('[hydromet-tour]', (e as Error)?.message || e); }
    try { W.requestElementsUIRefresh?.(); } catch (e) { console.debug('[hydromet-tour]', (e as Error)?.message || e); }
}

async function _createHydrometTank(): Promise<void> {
    try {
        if (typeof W.handleAddElement !== 'function') return;
        const r = await W.handleAddElement({
            _headless: true,
            familyId: 'tank',
            name: 'Tanque Lixiviação Heap-1 (H₂SO₄ pH<2)',
            x: 350000,
            y: 7400000,
        });
        if (!r?.success || !r.elementId) return;
        _state.tankId = String(r.elementId);
        _selectCreatedTank(_state.tankId);
        W.showToast?.('Tanque hidrometalúrgico criado no modelo', 'success');
    } catch (e) {
        console.debug('[tour:hydromet] createTank err:', (e as Error)?.message || e);
    }
}

const _CHEM_READINGS = [
    { parameterId: 'pH', value: 1.5, unit: 'pH', evt: 'rotina · lixiviação ácida' },
    { parameterId: 'H2SO4', value: 120, unit: 'g/L', evt: 'concentração ácido' },
    { parameterId: 'arsenio', value: 8.2, unit: 'mg/L', evt: 'metal dissolvido' },
    { parameterId: 'cadmio', value: 0.45, unit: 'mg/L', evt: 'metal dissolvido' },
    { parameterId: 'HCN_ar', value: 5.1, unit: 'mg/m3', evt: 'NR-15 anexo 11 — limite tolerância 4,7 mg/m³' },
];

async function _insertChemReadings(): Promise<void> {
    if (!_state.tankId) return;
    try {
        if (typeof W.handleAddObservation !== 'function') return;
        let inserted = 0;
        for (const r of _CHEM_READINGS) {
            const out = W.handleAddObservation({
                _headless: true,
                elementId: _state.tankId,
                parameterId: r.parameterId,
                value: r.value,
                unit: r.unit,
                date: new Date().toISOString().slice(0, 10),
                event_type: 'routine',
                event_severity: r.parameterId === 'HCN_ar' ? 4 : 1,
            });
            if (out?.success) inserted++;
        }
        try { W.requestElementsUIRefresh?.(); } catch (e) { console.debug('[hydromet-tour]', (e as Error)?.message || e); }
        W.showToast?.(`${inserted} observações químicas inseridas no tanque`, 'success');
    } catch (e) {
        console.debug('[tour:hydromet] insertReadings err:', (e as Error)?.message || e);
    }
}

async function _trySeedValidation(): Promise<boolean> {
    try {
        if (typeof W.handleSeedConama420Domain === 'function') {
            await W.handleSeedConama420Domain();
            return true;
        }
        return false;
    } catch (e) {
        console.debug('[tour:hydromet] seedValidation err:', (e as Error)?.message || e);
        return false;
    }
}

async function _trySelectCompliancePreset(): Promise<boolean> {
    // FIX bug erro1.mp4 (Calvin 2026-06-09): seed da Validation Profile NÃO
    // ativa o Compliance Preset (subsistema separado — banner inferior).
    // Aqui aplicamos também via complianceManager.selectPreset() para que o
    // banner "Nenhum preset ativo" mude para "CONAMA 420/2009 BR ativo".
    try {
        // Path fix 2026-06-11 (claude - ui): de tours/ o correto é ../../ui/
        // ('../../utils/ui/' resolvia p/ utils/utils/ui → 404 + erro tsc).
        const ui = (await import('../../ui/complianceUiBootstrap.js')) as unknown as {
            getComplianceManager?: () => { selectPreset?: (opts: Record<string, unknown>) => Promise<{ changed?: boolean }> };
        };
        const mgr = ui?.getComplianceManager?.();
        if (!mgr?.selectPreset) return false;
        const result = await mgr.selectPreset({
            presetId: 'br-conama-420-ar4',
            scope: 'all',
            reason: 'hydromet_ohs_tour_step4',
        });
        return result?.changed === true;
    } catch (e) {
        console.debug('[tour:hydromet] selectCompliancePreset err:', (e as Error)?.message || e);
        return false;
    }
}

function _buildPresetToastMessage(validationOK: boolean, bannerOK: boolean): string {
    if (validationOK && bannerOK) return 'CONAMA 420 BR ativo — banner + Validation Profile + NR-15';
    if (validationOK) return 'Validation Profile CONAMA 420 ativa (banner inferior pendente)';
    return 'Compliance Preset CONAMA 420 BR ativo';
}

async function _applyConamaPreset(): Promise<void> {
    const validationOK = await _trySeedValidation();
    const bannerOK = await _trySelectCompliancePreset();
    if (validationOK || bannerOK) {
        W.showToast?.(_buildPresetToastMessage(validationOK, bannerOK), 'success');
    }
}

function _openWorkflowPicker(): void {
    try {
        if (typeof W.switchRibbonTab === 'function') W.switchRibbonTab('optimize');
        if (typeof W.handleOpenWorkflowPicker === 'function') W.handleOpenWorkflowPicker();
    } catch (e) {
        console.debug('[tour:hydromet] openWorkflowPicker err:', (e as Error)?.message || e);
    }
}

function _selectTankInUi(): void {
    try {
        if (_state.tankId) W.setSelectedElement?.(_state.tankId);
        W.requestElementsUIRefresh?.();
    } catch (e) {
        console.debug('[tour:hydromet] selectTank err:', (e as Error)?.message || e);
    }
}

registerGuidedTour({
    id: 'hydromet-ohs-risks',
    categoryId: 'environmental-workflows',
    nameKey: 'guidedTourHydrometOhs',
    descKey: 'guidedTourHydrometOhsDesc',
    icon: 'shield',
    difficulty: 'advanced',
    estimatedMinutes: 8,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-hydromet-intro',
            target: '#canvas-container',
            title: 'gtHydrometOhsIntro',
            body: 'gtHydrometOhsIntroBody',
            position: 'bottom',
            delay: 200,
        },
        {
            id: 'gt-hydromet-add-tank',
            target: '#canvas-container',
            title: 'gtHydrometOhsAddTank',
            body: 'gtHydrometOhsAddTankBody',
            position: 'right',
            action: () => { void _createHydrometTank(); },
            delay: 600,
        },
        {
            id: 'gt-hydromet-chem-params',
            target: '#right-panel, #element-details',
            title: 'gtHydrometOhsChemParams',
            body: 'gtHydrometOhsChemParamsBody',
            position: 'left',
            action: () => { void _insertChemReadings(); _selectTankInUi(); },
            delay: 600,
        },
        {
            id: 'gt-hydromet-ohs-thresholds',
            target: '#compliance-banner, #right-panel',
            title: 'gtHydrometOhsThresholds',
            body: 'gtHydrometOhsThresholdsBody',
            position: 'top',
            action: () => { void _applyConamaPreset(); },
            delay: 600,
        },
        {
            id: 'gt-hydromet-workforce',
            target: '#right-panel, #element-details',
            title: 'gtHydrometOhsWorkforce',
            body: 'gtHydrometOhsWorkforceBody',
            position: 'left',
            action: () => { _selectTankInUi(); },
            delay: 200,
        },
        {
            id: 'gt-hydromet-emergency',
            target: '#workflow-picker-modal, .workflow-picker, #ribbon-optimize',
            title: 'gtHydrometOhsEmergency',
            body: 'gtHydrometOhsEmergencyBody',
            position: 'bottom',
            action: () => { _openWorkflowPicker(); },
            delay: 600,
        },
        {
            id: 'gt-hydromet-complete',
            target: '#canvas-container',
            title: 'gtHydrometOhsComplete',
            body: 'gtHydrometOhsCompleteBody',
            position: 'bottom',
            postAction: () => {
                try { W.closeModal?.('workflow-picker-modal'); } catch (e) { console.debug('[hydromet-tour]', (e as Error)?.message || e); }
                try { W.closeModal?.('workflow-wizard'); } catch (e) { console.debug('[hydromet-tour]', (e as Error)?.message || e); }
                _selectTankInUi();
            },
        },
    ],
});
