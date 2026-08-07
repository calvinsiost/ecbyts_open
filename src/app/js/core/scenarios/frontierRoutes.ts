// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Rotas de fronteira / biorrefinaria em cascata — pure logic.
 * micro_activity:ECBYTS-ENERGY-SCENARIOS-001#28.
 *
 * Modela a cascata de valorização da biorrefinaria (energia → biochar →
 * química fina) como um DAG de rotas tecnológicas com TRL, maturidade e
 * dependências. Um cenário ilustrativo de biomassa lignocelulósica
 * (resíduo → energia → biochar → química fina) exige que o gêmeo digital
 * represente as rotas de fronteira e a ordem de
 * maturação da cascata: cada estágio depende do anterior estar maduro o
 * suficiente antes de avançar.
 *
 * Cascata de valorização (3 estágios canônicos):
 *   1. ENERGIA  — combustão/biogás/co-queima (menor barreira TRL, primeiro)
 *   2. BIOCHAR  — pirólise lenta / hidrotermal (depende de energia p/ calor)
 *   3. QUÍMICA FINA — extração/síntese de bio-óleo, fenólicos, ativados
 *      (maior barreira TRL, depende de biochar como insumo)
 *
 * NOT: nenhum cálculo de emissão/custo aqui; nada de DOM; nada de Supabase;
 * nenhuma fórmula de CAPEX/OPEX/ECBT/ODS (isso é do motor de cenários).
 */

export const CASCADE_STAGE_ORDER = ['energy', 'biochar', 'fine-chemicals'] as const;

export type CascadeStage = (typeof CASCADE_STAGE_ORDER)[number];

export const CASCADE_STAGE_LABELS: Readonly<Record<CascadeStage, string>> = Object.freeze({
    'energy': 'Energia (combustão / biogás / co-queima)',
    'biochar': 'Biochar (pirólise lenta / hidrotermal)',
    'fine-chemicals': 'Química fina (bio-óleo / fenólicos / carvão ativado)',
});

export const CASCADE_STAGE_POSITION: Readonly<Record<CascadeStage, number>> = Object.freeze({
    'energy': 0,
    'biochar': 1,
    'fine-chemicals': 2,
});

export type RouteMaturity = 'lab' | 'pilot' | 'demo' | 'commercial';

export const MATURITY_LABELS: Readonly<Record<RouteMaturity, string>> = Object.freeze({
    'lab': 'Laboratório (TRL 1-3)',
    'pilot': 'Piloto (TRL 4-5)',
    'demo': 'Demonstração (TRL 6-7)',
    'commercial': 'Comercial (TRL 8-9)',
});

export interface FrontierRouteInput {
    readonly id: string;
    readonly name: string;
    readonly stage: CascadeStage;
    readonly trl: number;
    readonly trlTarget: number;
    readonly trlTargetMonths: number | null;
    readonly dependsOn: readonly string[];
    readonly description?: string;
}

export interface FrontierRouteVM {
    readonly id: string;
    readonly name: string;
    readonly stage: CascadeStage;
    readonly stageLabel: string;
    readonly stagePosition: number;
    readonly trl: number;
    readonly trlTarget: number;
    readonly trlTargetMonths: number | null;
    readonly maturity: RouteMaturity;
    readonly maturityLabel: string;
    readonly dependsOn: readonly string[];
    readonly dependents: readonly string[];
    readonly description: string;
    readonly cascadeReady: boolean;
    readonly summary: string;
}

export interface FrontierCascadeVM {
    readonly dataSource: 'real' | 'example';
    readonly routes: readonly FrontierRouteVM[];
    readonly cascadeOrder: readonly string[];
    readonly stageMaturity: Readonly<Record<CascadeStage, RouteMaturity | null>>;
    readonly bottleneckStage: CascadeStage | null;
    readonly overallMaturity: RouteMaturity | null;
}

export const EXAMPLE_FRONTIER_ROUTES: readonly FrontierRouteInput[] = Object.freeze([
    {
        id: 'example:combustion',
        name: 'Combustão direta do caroço (caldeira)',
        stage: 'energy',
        trl: 7,
        trlTarget: 8,
        trlTargetMonths: 18,
        dependsOn: [],
        description: 'Queima direta de resíduo de biomassa lignocelulósica em caldeira industrial para geração de vapor e energia térmica.',
    },
    {
        id: 'example:biogas',
        name: 'Biogás da borra (digestão anaeróbia)',
        stage: 'energy',
        trl: 4,
        trlTarget: 6,
        trlTargetMonths: 48,
        dependsOn: [],
        description: 'Digestão anaeróbia de resíduo úmido de biomassa para produção de biogás (metano) e biofertilizante.',
    },
    {
        id: 'example:pyrolysis',
        name: 'Pirólise lenta do caroço (biochar)',
        stage: 'biochar',
        trl: 5,
        trlTarget: 6,
        trlTargetMonths: 36,
        dependsOn: ['example:combustion'],
        description: 'Pirólise lenta (400-600 °C) do caroço para produção de biochar com alto teor de carbono fixo.',
    },
    {
        id: 'example:hydrothermal',
        name: 'Carbonização hidrotermal (hidrochar)',
        stage: 'biochar',
        trl: 3,
        trlTarget: 5,
        trlTargetMonths: 60,
        dependsOn: ['example:biogas'],
        description: 'Carbonização hidrotermal (180-250 °C, 10-40 bar) da borra úmida para hidrochar.',
    },
    {
        id: 'example:bio-oil',
        name: 'Bio-óleo de pirólise rápida',
        stage: 'fine-chemicals',
        trl: 3,
        trlTarget: 5,
        trlTargetMonths: 60,
        dependsOn: ['example:pyrolysis'],
        description: 'Pirólise rápida (500 °C, curto tempo de residência) para bio-óleo com fenólicos e ácidos orgânicos.',
    },
    {
        id: 'example:activated-carbon',
        name: 'Carvão ativado de biochar',
        stage: 'fine-chemicals',
        trl: 4,
        trlTarget: 6,
        trlTargetMonths: 48,
        dependsOn: ['example:pyrolysis'],
        description: 'Ativação física (vapor, 800-900 °C) ou química (KOH, H3PO4) do biochar para carvão ativado.',
    },
]);

function _clampTrl(v: unknown): number | null {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (!Number.isFinite(n)) return null;
    const i = Math.round(n);
    return i >= 1 && i <= 9 ? i : null;
}

export function trlToMaturity(trl: number): RouteMaturity {
    if (trl <= 3) return 'lab';
    if (trl <= 5) return 'pilot';
    if (trl <= 7) return 'demo';
    return 'commercial';
}

export function maturityRank(m: RouteMaturity): number {
    switch (m) {
        case 'lab': return 0;
        case 'pilot': return 1;
        case 'demo': return 2;
        case 'commercial': return 3;
    }
}

export function validateDependencies(routes: readonly FrontierRouteInput[]): readonly string[] {
    const errors: string[] = [];
    const ids = new Set(routes.map((r) => r.id));

    for (const r of routes) {
        for (const dep of r.dependsOn) {
            if (!ids.has(dep)) {
                errors.push(`Rota "${r.id}" depende de "${dep}" que não existe no conjunto.`);
            }
            if (dep === r.id) {
                errors.push(`Rota "${r.id}" tem auto-dependência.`);
            }
        }
    }

    const visited = new Set<string>();
    const inStack = new Set<string>();
    const byId = new Map(routes.map((r) => [r.id, r]));

    function dfs(id: string): boolean {
        if (inStack.has(id)) return true;
        if (visited.has(id)) return false;
        visited.add(id);
        inStack.add(id);
        const route = byId.get(id);
        if (route) {
            for (const dep of route.dependsOn) {
                if (dfs(dep)) return true;
            }
        }
        inStack.delete(id);
        return false;
    }

    for (const r of routes) {
        if (dfs(r.id)) {
            errors.push(`Ciclo de dependência detectado envolvendo "${r.id}".`);
            break;
        }
    }

    return errors;
}

export function resolveCascadeOrder(routes: readonly FrontierRouteInput[]): readonly string[] {
    const byId = new Map(routes.map((r) => [r.id, r]));
    const visited = new Set<string>();
    const order: string[] = [];

    function visit(id: string): void {
        if (visited.has(id)) return;
        visited.add(id);
        const route = byId.get(id);
        if (!route) return;
        for (const dep of route.dependsOn) {
            visit(dep);
        }
        order.push(id);
    }

    const sorted = [...routes].sort((a, b) => {
        const pa = CASCADE_STAGE_POSITION[a.stage] ?? 0;
        const pb = CASCADE_STAGE_POSITION[b.stage] ?? 0;
        if (pa !== pb) return pa - pb;
        return a.id.localeCompare(b.id);
    });

    for (const r of sorted) {
        visit(r.id);
    }

    return order;
}

function _buildDependentsMap(routes: readonly FrontierRouteInput[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const r of routes) {
        if (!map.has(r.id)) map.set(r.id, []);
        for (const dep of r.dependsOn) {
            if (!map.has(dep)) map.set(dep, []);
            map.get(dep)!.push(r.id);
        }
    }
    return map;
}

function _isCascadeReady(route: FrontierRouteInput, byId: Map<string, FrontierRouteInput>): boolean {
    for (const depId of route.dependsOn) {
        const dep = byId.get(depId);
        if (!dep) continue;
        if (dep.trl < dep.trlTarget) return false;
    }
    return true;
}

function _summary(r: FrontierRouteInput): string {
    const stageLabel = CASCADE_STAGE_LABELS[r.stage]?.split('(')[0]?.trim() ?? r.stage;
    if (r.trlTarget <= r.trl) return `[${stageLabel}] TRL ${r.trl} (alvo atingido)`;
    const prazo = r.trlTargetMonths !== null ? ` em ${r.trlTargetMonths} meses` : '';
    return `[${stageLabel}] TRL ${r.trl} → alvo ${r.trlTarget}${prazo}`;
}

function _worstMaturity(maturities: readonly (RouteMaturity | null)[]): RouteMaturity | null {
    let worst: RouteMaturity | null = null;
    for (const m of maturities) {
        if (m === null) continue;
        if (worst === null || maturityRank(m) < maturityRank(worst)) worst = m;
    }
    return worst;
}

export function buildFrontierRoutesVM(
    inputRoutes: readonly FrontierRouteInput[] | null | undefined,
): FrontierCascadeVM {
    const real = Array.isArray(inputRoutes) ? inputRoutes.filter((r) => {
        if (!r || typeof r.id !== 'string' || !r.id) return false;
        if (!CASCADE_STAGE_ORDER.includes(r.stage)) return false;
        return _clampTrl(r.trl) !== null;
    }) : [];

    const dataSource: 'real' | 'example' = real.length > 0 ? 'real' : 'example';
    const routes = real.length > 0 ? real : EXAMPLE_FRONTIER_ROUTES;

    const byId = new Map(routes.map((r) => [r.id, r]));
    const dependentsMap = _buildDependentsMap(routes);
    const cascadeOrder = resolveCascadeOrder(routes);

    const vms: FrontierRouteVM[] = routes.map((r) => {
        const trl = _clampTrl(r.trl) ?? 1;
        const trlTarget = Math.max(_clampTrl(r.trlTarget) ?? trl, trl);
        const maturity = trlToMaturity(trl);
        return Object.freeze({
            id: r.id,
            name: typeof r.name === 'string' && r.name ? r.name : r.id,
            stage: r.stage,
            stageLabel: CASCADE_STAGE_LABELS[r.stage as CascadeStage] ?? r.stage,
            stagePosition: CASCADE_STAGE_POSITION[r.stage as CascadeStage] ?? 0,
            trl,
            trlTarget,
            trlTargetMonths: typeof r.trlTargetMonths === 'number' && Number.isFinite(r.trlTargetMonths) && r.trlTargetMonths > 0
                ? Math.round(r.trlTargetMonths)
                : null,
            maturity,
            maturityLabel: MATURITY_LABELS[maturity],
            dependsOn: Object.freeze([...r.dependsOn]) as readonly string[],
            dependents: Object.freeze(dependentsMap.get(r.id) ?? []) as readonly string[],
            description: typeof r.description === 'string' ? r.description : '',
            cascadeReady: _isCascadeReady(r, byId),
            summary: _summary(r),
        });
    });

    const stageMaturity: Record<CascadeStage, RouteMaturity | null> = {
        'energy': null,
        'biochar': null,
        'fine-chemicals': null,
    };
    for (const stage of CASCADE_STAGE_ORDER) {
        const stageRoutes = vms.filter((v) => v.stage === stage);
        if (stageRoutes.length === 0) {
            stageMaturity[stage] = null;
            continue;
        }
        let best: RouteMaturity | null = null;
        for (const sr of stageRoutes) {
            if (best === null || maturityRank(sr.maturity) > maturityRank(best)) best = sr.maturity;
        }
        if (best === null) { stageMaturity[stage] = null; continue; }
        stageMaturity[stage] = best;
    }

    const worst = _worstMaturity(CASCADE_STAGE_ORDER.map((s) => stageMaturity[s]));
    let bottleneckStage: CascadeStage | null = null;
    if (worst !== null) {
        for (const s of CASCADE_STAGE_ORDER) {
            if (stageMaturity[s] === worst) { bottleneckStage = s; break; }
        }
    }

    return Object.freeze({
        dataSource,
        routes: Object.freeze(vms) as readonly FrontierRouteVM[],
        cascadeOrder: Object.freeze(cascadeOrder) as readonly string[],
        stageMaturity: Object.freeze(stageMaturity) as Readonly<Record<CascadeStage, RouteMaturity | null>>,
        bottleneckStage,
        overallMaturity: worst,
    });
}
