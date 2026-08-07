// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Kind portável `simulation_scenario` (cenários de simulação salvos) — P1-10 Fase B.
// Encapsula configuração reproduzível de um modelo do core/simulation (modelId +
// version + params + runConfig). Permite usuário salvar/compartilhar cenários como
// .ecbt (chooser Library | local) e reaplicá-los abrindo o simulator com os mesmos
// inputs. Storage IDB próprio — handler é owner ('ecbyts-simulation-scenarios').
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
import { registerKind } from '../../core/io/portableArtifacts.js';
import { idbGet, idbSet } from '../storage/idbStore.js';

const log = createLogger('SimulationScenarioPortable');

const IDB_KEY = 'ecbyts-simulation-scenarios';

interface SimulationScenarioShape {
    id: string;
    name: string;
    modelId: string;
    modelVersion?: string;
    params: Record<string, unknown>;
    runConfig?: Record<string, unknown>;
    savedAt?: string;
    notes?: string;
}

function _isScenarioShape(o: any): boolean {
    if (!o || typeof o !== 'object') return false;
    if (typeof o.id !== 'string' || o.id.trim() === '') return false;
    if (typeof o.name !== 'string' || o.name.trim() === '') return false;
    if (typeof o.modelId !== 'string' || o.modelId.trim() === '') return false;
    if (!o.params || typeof o.params !== 'object') return false;
    return true;
}

async function _listScenarios(): Promise<SimulationScenarioShape[]> {
    const raw = await idbGet(IDB_KEY);
    return Array.isArray(raw) ? raw : [];
}

async function _saveScenario(s: SimulationScenarioShape): Promise<boolean> {
    const all = await _listScenarios();
    const idx = all.findIndex((x) => x.id === s.id);
    if (idx >= 0) all[idx] = s;
    else all.push(s);
    return idbSet(IDB_KEY, all);
}

// Registra o kind no boot (idempotente).
registerKind({
    kind: 'simulation_scenario',
    schemaVersion: 1,
    validate: (payload: unknown) => {
        if (!_isScenarioShape(payload)) {
            return {
                valid: false,
                errors: ['Cenário inválido — requer id, name, modelId, params{} obrigatórios.'],
            };
        }
        const errors: string[] = [];
        const p = payload as SimulationScenarioShape;
        // params: chaves devem ser strings, valores primitivos ou arrays simples
        for (const [k, v] of Object.entries(p.params)) {
            if (typeof k !== 'string' || k.trim() === '') {
                errors.push(`params: chave inválida ("${k}")`);
                continue;
            }
            if (v != null && typeof v === 'object' && !Array.isArray(v)) {
                // Permite objeto aninhado mas avisa
                if (Object.keys(v as object).length > 32) {
                    errors.push(`params.${k}: objeto aninhado excede 32 chaves`);
                }
            }
        }
        if (p.modelVersion && typeof p.modelVersion !== 'string') {
            errors.push('modelVersion: deve ser string');
        }
        return { valid: errors.length === 0, errors };
    },
    toArtifact: (obj: unknown) => {
        const o: any = obj || {};
        return {
            id: String(o.id || ''),
            name: String(o.name || ''),
            modelId: String(o.modelId || ''),
            modelVersion: typeof o.modelVersion === 'string' ? o.modelVersion : '1.0.0',
            params: o.params && typeof o.params === 'object' ? { ...o.params } : {},
            runConfig: o.runConfig && typeof o.runConfig === 'object' ? { ...o.runConfig } : {},
            savedAt: typeof o.savedAt === 'string' ? o.savedAt : '',
            notes: typeof o.notes === 'string' ? o.notes : '',
            authorId: typeof o.authorId === 'string' ? o.authorId : undefined,
            marketplaceAssetId: typeof o.marketplaceAssetId === 'string' ? o.marketplaceAssetId : undefined,
        };
    },
    fromArtifact: (artifact: unknown) => {
        const a: any = artifact || {};
        return {
            id: typeof a.id === 'string' && a.id ? a.id : `imported-sim-${Date.now()}`,
            name: String(a.name || 'Cenário importado'),
            modelId: String(a.modelId || ''),
            modelVersion: typeof a.modelVersion === 'string' ? a.modelVersion : '1.0.0',
            params: a.params && typeof a.params === 'object' ? { ...a.params } : {},
            runConfig: a.runConfig && typeof a.runConfig === 'object' ? { ...a.runConfig } : {},
            savedAt: typeof a.savedAt === 'string' ? a.savedAt : '',
            notes: typeof a.notes === 'string' ? a.notes : '',
            importedFrom: a.marketplaceAssetId ? 'library' : 'file',
            authorId: typeof a.authorId === 'string' ? a.authorId : undefined,
            marketplaceAssetId: typeof a.marketplaceAssetId === 'string' ? a.marketplaceAssetId : undefined,
        };
    },
    applyImport: async (obj: unknown) => {
        try {
            if (!_isScenarioShape(obj)) return false;
            return await _saveScenario(obj as SimulationScenarioShape);
        } catch (e: any) {
            log.error('applyImport failed:', e?.message || e);
            return false;
        }
    },
});

function _slug(s: unknown): string {
    return String(s || 'simulation-scenario')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}

function _download(text: string, filename: string): void {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Lista cenários de simulação persistidos (read-only). */
export async function getCustomSimulationScenarios(): Promise<SimulationScenarioShape[]> {
    return _listScenarios();
}

/** Salva um novo cenário (helper público — caller fornece o shape completo). */
export async function saveSimulationScenario(scenario: SimulationScenarioShape): Promise<boolean> {
    if (!_isScenarioShape(scenario)) return false;
    return _saveScenario(scenario);
}

/** Exporta um cenário (por id) como chave .ecbt (chooser Library/local). */
export async function exportSimulationScenarioEcbt(
    scenarioId: string,
): Promise<{ ok: boolean; key?: string; filename?: string }> {
    try {
        const all = await _listScenarios();
        const scenario = all.find((s) => s.id === scenarioId);
        if (!scenario) {
            showToast(t('simScenario.notFound') || 'Cenário não encontrado.', 'warning');
            return { ok: false };
        }
        const pa: any = await import('../../core/io/portableArtifacts.js' as string);
        const lib: any = await import('../report/_ecbtLibraryStore.js' as string);
        const key = await pa.encodeArtifact('simulation_scenario', scenario);
        const target = await lib.chooseEcbtTarget('export');
        if (!target) return { ok: false };
        const name = scenario.name || scenario.id;
        const filename = `${_slug(name) || 'scenario'}.ecbt`;
        if (target === 'library') {
            const ok = await lib.saveEcbtToLibrary({
                id: `sim-${_slug(scenario.id)}`,
                kind: 'simulation_scenario',
                name,
                key,
            });
            showToast(
                ok
                    ? t('ecbtLib.savedLibrary') || 'Salvo na Library ecbyts'
                    : t('simScenario.exportFailed') || 'Falha ao exportar',
                ok ? 'success' : 'error',
            );
            return { ok, key, filename };
        }
        _download(key, filename);
        showToast(t('simScenario.exported') || 'Cenário salvo como .ecbt', 'success');
        return { ok: true, key, filename };
    } catch (e: any) {
        log.error('export simulation scenario ecbt failed:', e?.message || e);
        showToast(t('simScenario.exportFailed') || 'Falha ao exportar cenário.', 'error');
        return { ok: false };
    }
}

/** Importa um cenário de chave .ecbt (chooser Library/local) → persiste em IDB. */
export async function importSimulationScenarioEcbt(): Promise<{ ok: boolean; scenarioId?: string }> {
    try {
        const lib: any = await import('../report/_ecbtLibraryStore.js' as string);
        const source = await lib.chooseEcbtTarget('import');
        if (!source) return { ok: false };
        if (source === 'library') {
            const entry = await lib.pickFromEcbtLibrary('simulation_scenario');
            if (!entry?.key) return { ok: false };
            return _importKeyFlow(entry.key);
        }
        return _importFromFileFlow();
    } catch (e: any) {
        log.error('import simulation scenario ecbt failed:', e?.message || e);
        showToast(t('simScenario.importFailed') || 'Falha ao importar cenário.', 'error');
        return { ok: false };
    }
}

async function _importKeyFlow(key: string): Promise<{ ok: boolean; scenarioId?: string }> {
    const pa: any = await import('../../core/io/portableArtifacts.js' as string);
    const ok = await pa.importArtifactKey(String(key || '').trim());
    showToast(
        ok
            ? t('simScenario.imported') || 'Cenário importado'
            : t('simScenario.importNotScenario') || 'Chave não contém um cenário válido.',
        ok ? 'success' : 'error',
    );
    return { ok };
}

function _importFromFileFlow(): Promise<{ ok: boolean; scenarioId?: string }> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.ecbt,text/plain';
        input.style.display = 'none';
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) {
                resolve({ ok: false });
                return;
            }
            try {
                const text = await file.text();
                resolve(await _importKeyFlow(text));
            } catch (e: any) {
                log.error('read simulation scenario ecbt failed:', e?.message || e);
                showToast(t('simScenario.importFailed') || 'Falha ao ler arquivo.', 'error');
                resolve({ ok: false });
            } finally {
                input.remove();
            }
        });
        document.body.appendChild(input);
        input.click();
    });
}

if (typeof window !== 'undefined') {
    (window as any).exportSimulationScenarioEcbt = exportSimulationScenarioEcbt;
    (window as any).importSimulationScenarioEcbt = importSimulationScenarioEcbt;
    (window as any).saveSimulationScenario = saveSimulationScenario;
    (window as any).getCustomSimulationScenarios = getCustomSimulationScenarios;
}
