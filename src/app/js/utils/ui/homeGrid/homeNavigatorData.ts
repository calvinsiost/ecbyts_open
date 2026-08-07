// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 — construtores de DADOS do navegador (árvore) da home.
 * `buildNavigatorPoints` agrega leituras planejadas + observações dos elementos
 * em pontos→parâmetros→resultados; `buildLoadedModelNavigatorNodes` achata isso
 * em uma lista plana de nós (organização→sítio→campanha→ponto→parâmetro→
 * resultado) consumida pela árvore lateral. claude - ui 2026-06-15.
 *
 * EN: Pure data builders for the home navigator tree. Both legacy functions read
 *     homeGrid module state only through small helpers (label/observation/id
 *     getters + element/campaign accessors + the loaded-model guard), so this
 *     module receives every such helper through the injected `deps` object and
 *     contains no module-level state of its own. The aggregation/flattening logic
 *     and the exact returned shapes (Map collapsing, label `localeCompare` sort,
 *     id segment composition, node depths/parentIds/searchText) are preserved
 *     byte-for-byte from the inline `_buildNavigatorPoints` /
 *     `_buildLoadedModelNavigatorNodes` pair. `buildLoadedModelNavigatorNodes`
 *     delegates its inner point aggregation to `buildNavigatorPoints` (same
 *     `deps`), keeping a single implementation just like the legacy code reused
 *     `_buildNavigatorPoints`.
 *
 * PT (leigo): monta os DADOS da arvorezinha de navegacao da tela inicial. A
 *     primeira funcao junta as leituras planejadas e as medicoes de cada
 *     elemento em uma estrutura de pontos, parametros e resultados, ja ordenada
 *     por nome. A segunda transforma isso na lista achatada de itens (empresa →
 *     local → campanha → ponto → parametro → resultado) que a arvore mostra. Tudo
 *     que essas funcoes precisam saber sobre o estado do app (rotulos, lista de
 *     elementos e campanhas, se ha um modelo carregado) chega de fora, pelo
 *     objeto `deps`, entao este modulo nao guarda estado proprio. A logica e os
 *     valores retornados sao identicos ao codigo antigo que ficava embutido no
 *     homeGrid.
 *
 * Pure-data (retorna estruturas; sem innerHTML/listeners). Sem DOM proprio — os
 * unicos acessos a DOM/estado vivem nos helpers injetados via `deps`.
 */

/**
 * Dependencias injetadas — todos os helpers/getters que as funcoes legadas liam
 * do estado do homeGrid. Mantem o comportamento byte-a-byte sem duplicar a
 * leitura de estado.
 */
export interface NavigatorDataDeps {
    /** homeGrid `_getNavigatorParameterLabel` — rotulo do parametro via CONFIG. */
    readonly getNavigatorParameterLabel: (parameterId: any) => any;
    /** homeGrid `_getElementObservations` — observacoes de um elemento. */
    readonly getElementObservations: (element: any) => any[];
    /** homeGrid `_toNavigatorIdSegment` — normaliza um id para slug estavel. */
    readonly toNavigatorIdSegment: (value: any) => string;
    /** homeGrid `_formatNavigatorResultLabel` — rotulo de um resultado. */
    readonly formatNavigatorResultLabel: (observation: any, index: any) => any;
    /** homeGrid `_hasLoadedWorkspaceModel` — ha um modelo carregado no workspace. */
    readonly hasLoadedWorkspaceModel: () => boolean;
    /** homeGrid `_safeGetElements` — lista de elementos (resiliente a erro). */
    readonly safeGetElements: () => any[];
    /** homeGrid `_safeGetCampaigns` — lista de campanhas (resiliente a erro). */
    readonly safeGetCampaigns: () => any[];
    /** homeGrid `_getNavigatorOrganizationLabel` — rotulo da organizacao/escopo. */
    readonly getNavigatorOrganizationLabel: () => any;
    /** homeGrid `_getNavigatorSiteLabel` — rotulo do sitio/projeto. */
    readonly getNavigatorSiteLabel: () => any;
    /** homeGrid `_activeModelLabel` corrente (lido na hora). */
    readonly getActiveModelLabel: () => any;
}

/**
 * Agrega leituras planejadas + observacoes dos elementos em pontos →
 * parametros → resultados, ordenados por rotulo. Comportamento identico ao
 * `_buildNavigatorPoints` legado.
 *
 * @param elements Lista de elementos do workspace.
 * @param opts `{ plannedReadings, observationMatcher, includeAllElements }`.
 * @param deps Dependencias injetadas.
 */
export function buildNavigatorPoints(
    elements: any,
    { plannedReadings = [], observationMatcher, includeAllElements = false }: any = {},
    deps: NavigatorDataDeps,
) {
    const { getNavigatorParameterLabel, getElementObservations, toNavigatorIdSegment, formatNavigatorResultLabel } =
        deps;

    const pointMap = new Map();

    const ensurePoint = /** @param {any} deps */ (elementLike: any) => {
        const pointId = elementLike?.id || `point:${pointMap.size + 1}`;
        if (!pointMap.has(pointId)) {
            pointMap.set(pointId, {
                id: pointId,
                label: elementLike?.name || elementLike?.label || pointId,
                type: 'point',
                family: elementLike?.family || '',
                parameters: new Map(),
            });
        }
        return pointMap.get(pointId);
    };

    const ensureParameter = (pointEntry: any, parameterId: any) => {
        const resolvedParameterId = parameterId || 'unknown';
        if (!pointEntry.parameters.has(resolvedParameterId)) {
            pointEntry.parameters.set(resolvedParameterId, {
                id: resolvedParameterId,
                label: getNavigatorParameterLabel(resolvedParameterId),
                type: 'parameter',
                results: [],
            });
        }
        return pointEntry.parameters.get(resolvedParameterId);
    };

    for (const reading of plannedReadings) {
        if (!reading?.elementId) continue;
        const plannedElement = elements.find(
            /** @param {any} element */ (element: any) => element?.id === reading.elementId,
        ) || {
            id: reading.elementId,
            name: reading.elementId,
            family: 'point',
        };
        const pointEntry = ensurePoint(plannedElement);
        if (reading.parameterId) {
            ensureParameter(pointEntry, reading.parameterId);
        }
    }

    for (const element of elements) {
        const observations = getElementObservations(element).filter((observation: any) =>
            typeof observationMatcher === 'function' ? observationMatcher(observation) : true,
        );
        if (includeAllElements) {
            ensurePoint(element);
        }
        if (observations.length === 0) continue;
        const pointEntry = ensurePoint(element);
        for (const observation of observations) {
            const parameterId = observation?.parameterId || observation?.plannedParameterId || 'unknown';
            const parameterEntry = ensureParameter(pointEntry, parameterId);
            const resultIndex = parameterEntry.results.length;
            parameterEntry.results.push({
                id: `result:${toNavigatorIdSegment(element.id)}:${toNavigatorIdSegment(parameterId)}:${toNavigatorIdSegment(
                    observation?.id || observation?.timestamp || observation?.date || resultIndex,
                )}`,
                label: formatNavigatorResultLabel(observation, resultIndex),
                type: 'result',
                searchText:
                    `${parameterEntry.label} ${observation?.value ?? ''} ${observation?.unitId || observation?.unit || ''}`.trim(),
            });
        }
    }

    return Array.from(pointMap.values())
        .map((pointEntry: any) => ({
            ...pointEntry,
            parameters: Array.from(pointEntry.parameters.values()).sort((left: any, right: any) =>
                left.label.localeCompare(right.label),
            ),
        }))
        .sort((left: any, right: any) => left.label.localeCompare(right.label));
}

/**
 * Achata a agregacao de pontos em uma lista plana de nos da arvore (organizacao
 * → sitio → campanha → ponto → parametro → resultado). Comportamento identico ao
 * `_buildLoadedModelNavigatorNodes` legado.
 *
 * @param deps Dependencias injetadas.
 */
export function buildLoadedModelNavigatorNodes(deps: NavigatorDataDeps) {
    const {
        hasLoadedWorkspaceModel,
        safeGetElements,
        safeGetCampaigns,
        toNavigatorIdSegment,
        getNavigatorOrganizationLabel,
        getNavigatorSiteLabel,
        getActiveModelLabel,
    } = deps;

    if (!hasLoadedWorkspaceModel()) return [];

    const elements = safeGetElements();
    const campaigns = safeGetCampaigns();
    const nodes = [];
    const organizationId = `organization:${toNavigatorIdSegment(getNavigatorOrganizationLabel())}`;
    const siteId = `site:${toNavigatorIdSegment(getNavigatorSiteLabel())}`;

    nodes.push({
        id: organizationId,
        label: getNavigatorOrganizationLabel(),
        type: 'organization',
        depth: 0,
        parentId: null,
        searchText: getNavigatorOrganizationLabel(),
    });
    nodes.push({
        id: siteId,
        label: getNavigatorSiteLabel(),
        type: 'site',
        depth: 1,
        parentId: organizationId,
        searchText: `${getNavigatorSiteLabel()} ${getActiveModelLabel() || ''}`.trim(),
    });

    const campaignEntries = [];
    for (const campaign of campaigns) {
        const points = buildNavigatorPoints(
            elements,
            {
                plannedReadings: campaign?.plannedReadings || [],
                observationMatcher: /** @param {any} observation */ (observation: any) =>
                    observation?.campaignId === campaign.id,
            },
            deps,
        );
        if (points.length === 0) continue;
        campaignEntries.push({
            id: campaign.id,
            label: campaign.name || campaign.id,
            points,
        });
    }

    const uncategorizedPoints = buildNavigatorPoints(
        elements,
        {
            observationMatcher: /** @param {any} observation */ (observation: any) => !observation?.campaignId,
            includeAllElements: campaigns.length === 0,
        },
        deps,
    );
    if (uncategorizedPoints.length > 0) {
        campaignEntries.push({
            id: campaigns.length === 0 ? '__workspace__' : '__uncategorized__',
            label: campaigns.length === 0 ? 'Modelo atual' : 'Sem campanha',
            points: uncategorizedPoints,
        });
    }

    for (const campaignEntry of campaignEntries) {
        const campaignNodeId = `campaign:${toNavigatorIdSegment(campaignEntry.id)}`;
        nodes.push({
            id: campaignNodeId,
            label: campaignEntry.label,
            type: 'campaign',
            depth: 2,
            parentId: siteId,
            searchText: campaignEntry.label,
        });

        for (const pointEntry of campaignEntry.points) {
            const pointNodeId = `point:${toNavigatorIdSegment(campaignEntry.id)}:${toNavigatorIdSegment(pointEntry.id)}`;
            nodes.push({
                id: pointNodeId,
                label: pointEntry.label,
                type: 'point',
                depth: 3,
                parentId: campaignNodeId,
                searchText: `${pointEntry.label} ${pointEntry.family || ''}`.trim(),
            });

            for (const parameterEntry of pointEntry.parameters) {
                const parameterNodeId = `parameter:${toNavigatorIdSegment(campaignEntry.id)}:${toNavigatorIdSegment(pointEntry.id)}:${toNavigatorIdSegment(parameterEntry.id)}`;
                nodes.push({
                    id: parameterNodeId,
                    label: parameterEntry.label,
                    type: 'parameter',
                    depth: 4,
                    parentId: pointNodeId,
                    searchText: `${parameterEntry.label} ${parameterEntry.id}`.trim(),
                });

                for (const resultEntry of parameterEntry.results) {
                    nodes.push({
                        id: resultEntry.id,
                        label: resultEntry.label,
                        type: 'result',
                        depth: 5,
                        parentId: parameterNodeId,
                        searchText: `${resultEntry.label} ${resultEntry.searchText || ''}`.trim(),
                    });
                }
            }
        }
    }

    return nodes;
}
