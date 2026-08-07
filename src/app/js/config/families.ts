// This file is part of ecbyts/ECBT. AGPL-3.0-only.
// Extracted from app/js/config.js in ARCH-MONO-001 Phase 2 (monolith split).

export const DEFAULT_FAMILIES = {
    // Containers espaciais (PDPL-U / PDPLU hierarchy)
    site_project: {
        id: 'site_project',
        name: 'Projeto (Site)',
        icon: 'folder',
        code: 'Q',
        enabled: true,
        isContainer: true,
        allowedChildren: null,
    },
    site_area: {
        id: 'site_area',
        name: 'Area de Investigacao',
        icon: 'map',
        code: 'U',
        enabled: true,
        isContainer: true,
        allowedChildren: null,
    },
    site_zone: {
        id: 'site_zone',
        name: 'Zona',
        icon: 'square',
        code: 'N',
        enabled: true,
        isContainer: true,
        allowedChildren: null,
    },

    /**
     * Pluma de contaminacao - representa area contaminada no subsolo.
     * Elemento principal para modelagem de areas impactadas.
     */
    plume: {
        id: 'plume',
        nameKey: 'contaminationPlume',
        icon: 'plume',
        code: 'P',
        enabled: true,
        isContainer: false,
    },

    /**
     * Poco de monitoramento - usado para coletar amostras de agua.
     * Essencial para acompanhamento da qualidade da agua subterranea.
     */
    well: {
        id: 'well',
        nameKey: 'monitoringWell',
        icon: 'well',
        code: 'W',
        enabled: true,
        isContainer: false,
    },

    /**
     * Lago - corpo d'agua superficial.
     * Pode interagir com o aquifero (recarga ou descarga).
     */
    lake: {
        id: 'lake',
        nameKey: 'lake',
        icon: 'droplet',
        code: 'L',
        enabled: true,
        isContainer: false,
    },

    /**
     * Rio - curso d'agua.
     * Importante para entender fluxo de agua na regiao.
     */
    river: {
        id: 'river',
        nameKey: 'river',
        icon: 'river',
        code: 'R',
        enabled: true,
        isContainer: false,
    },

    /**
     * Edificacao - construcoes na area.
     * Contexto para entender uso do solo.
     */
    building: {
        id: 'building',
        nameKey: 'building',
        icon: 'building',
        code: 'B',
        enabled: true,
        isContainer: false,
    },

    /**
     * Tanque de armazenamento - possivel fonte de contaminacao.
     * Tanques subterraneos podem vazar e contaminar o solo.
     */
    tank: {
        id: 'tank',
        nameKey: 'storageTank',
        icon: 'cylinder',
        code: 'T',
        enabled: true,
        isContainer: false,
    },

    /**
     * Marcador - ponto de referencia generico.
     * Pode indicar qualquer local de interesse.
     */
    marker: {
        id: 'marker',
        nameKey: 'marker',
        icon: 'map-pin',
        code: 'M',
        enabled: true,
        isContainer: false,
    },

    /**
     * Limite - contorno da area de estudo.
     * Define os limites geograficos do modelo.
     */
    boundary: {
        id: 'boundary',
        nameKey: 'boundary',
        icon: 'square-dashed',
        code: 'Y',
        enabled: true,
        isContainer: false,
    },

    /**
     * Camada geologica - estrato do subsolo.
     * Representa diferentes tipos de solo/rocha.
     */
    stratum: {
        id: 'stratum',
        nameKey: 'geologicalLayer',
        icon: 'layers',
        code: 'G',
        enabled: true,
        isContainer: false,
    },

    /**
     * Nascente - ponto onde a agua subterranea emerge.
     * Indica areas de descarga do aquifero.
     */
    spring: {
        id: 'spring',
        nameKey: 'spring',
        icon: 'spring',
        code: 'S',
        enabled: true,
        isContainer: false,
    },

    /**
     * Ponto de amostragem - local de coleta de amostras.
     * Pode ser solo, agua superficial, etc.
     */
    sample: {
        id: 'sample',
        nameKey: 'samplePoint',
        icon: 'flask',
        code: 'X',
        enabled: true,
        isContainer: false,
    },

    // ================================================================
    // NOVAS FAMÍLIAS ESG & H&S
    // ================================================================

    /**
     * Área organizacional - setor ou zona da planta.
     * Usado para métricas de H&S e alocação de recursos.
     */
    area: {
        id: 'area',
        nameKey: 'organizationalArea',
        icon: 'factory',
        code: 'A',
        enabled: true,
        isContainer: false,
    },

    /**
     * Indivíduo - pessoa, animal ou árvore rastreável.
     * Para H&S (colaboradores) e biodiversidade (fauna/flora).
     */
    individual: {
        id: 'individual',
        nameKey: 'individual',
        icon: 'user',
        code: 'H',
        enabled: true,
        isContainer: false,
    },

    /**
     * Incidente - ocorrência de H&S.
     * Acidentes, quase-acidentes, primeiros socorros.
     */
    incident: {
        id: 'incident',
        nameKey: 'incident',
        icon: 'alert-triangle',
        code: 'I',
        enabled: true,
        isContainer: false,
    },

    /**
     * Fonte de emissão - chaminé, vent, fugitiva.
     * Para inventário de emissões atmosféricas.
     */
    emission_source: {
        id: 'emission_source',
        nameKey: 'emissionSource',
        icon: 'wind',
        code: 'E',
        enabled: true,
        isContainer: false,
    },

    /**
     * Fluxo de resíduo - corrente de resíduo sólido.
     * Para gestão de resíduos e reciclagem.
     */
    waste_stream: {
        id: 'waste_stream',
        nameKey: 'wasteStream',
        icon: 'refresh-cw',
        code: 'Z',
        enabled: true,
        isContainer: false,
    },

    /**
     * Ponto de efluente - descarga de efluentes líquidos.
     * Para monitoramento de qualidade de efluentes.
     */
    effluent_point: {
        id: 'effluent_point',
        nameKey: 'effluentPoint',
        icon: 'droplet',
        code: 'F',
        enabled: true,
        isContainer: false,
    },

    /**
     * Habitat - área de biodiversidade.
     * Ecossistemas, áreas protegidas, zonas de restauração.
     */
    habitat: {
        id: 'habitat',
        nameKey: 'habitat',
        icon: 'tree',
        code: 'D',
        enabled: true,
    },

    /**
     * Sensor - dispositivo de monitoramento remoto (IoT).
     * Coleta dados ambientais em tempo real via protocolo de busca externo.
     * Estado preenchido dinamicamente via getAppData().
     */
    sensor: {
        id: 'sensor',
        nameKey: 'sensor',
        icon: 'radio',
        code: 'SN',
        enabled: true,
    },

    // ================================================================
    // FAMILIAS INTANGIVEIS
    // ================================================================

    /**
     * Ativo intangivel - contratos, software, creditos de carbono,
     * certificados de energia verde, licencas ambientais.
     * Representado como sprite flutuante (billboard) na cena 3D.
     */
    intangible: {
        id: 'intangible',
        nameKey: 'intangibleAsset',
        icon: 'sparkles',
        code: 'J',
        enabled: true,
    },

    /**
     * Generico - tipo coringa para elementos que nao se encaixam
     * em nenhuma outra familia. Flexivel para usos diversos.
     */
    generic: {
        id: 'generic',
        nameKey: 'genericElement',
        icon: 'cube',
        code: 'K',
        enabled: true,
    },

    // ================================================================
    // FAMILIAS GEOLOGICAS / ESTRUTURAIS
    // ================================================================

    /**
     * Falha geologica - estrutura planar de ruptura no subsolo.
     * Parametros: strike, dip, deslocamento, tipo (normal/reversa/transcorrente).
     * Referencia: convencoes de geologia estrutural (regra da mao direita).
     */
    fault: {
        id: 'fault',
        nameKey: 'geologicalFault',
        icon: 'alert-triangle',
        code: 'V',
        enabled: true,
        isContainer: false,
    },

    // ================================================================
    // FAMILIAS ESPACIAIS / GIS
    // ================================================================

    /**
     * Blueprint espacial - planta CAD/GIS importada (DXF).
     * Footprint poligonal com camadas, area metrica, compliance ambiental.
     * Pipeline: DXF -> Polygonize -> UTM -> Simplify -> WGS84 -> GeoJSON.
     */
    blueprint: {
        id: 'blueprint',
        nameKey: 'spatialBlueprint',
        icon: 'map',
        code: 'BP',
        enabled: true,
    },

    /**
     * Barragem - estrutura de contencao de agua ou rejeitos.
     * Multi-matriz: surface_water, sediment, waste. Relevante para mineracao +
     * hidreletrica + saneamento. Modelos 3D via model-library (CC BY 4.0 Meshy).
     */
    dam: {
        id: 'dam',
        nameKey: 'dam',
        icon: 'triangle',
        code: 'DM',
        enabled: true,
        isContainer: false,
    },

    /**
     * Mina a ceu aberto (open-pit) - lavra superficial em degraus (bancos).
     * Matriz: soil, groundwater, air. Relevante para mineracao + pedreiras +
     * estudos de remediacao pos-fechamento. Modelos 3D via model-library.
     */
    pit: {
        id: 'pit',
        nameKey: 'openPitMine',
        icon: 'arrow-down-circle',
        code: 'O',
        enabled: true,
        isContainer: false,
    },

    // ================================================================
    // NOVAS FAMILIAS (2026-04-20) - INFRAESTRUTURA & FROTA
    // Criadas a partir dos 88 GLBs ingestados de Desktop/Modelos3D.
    // Ver model-library.js batch 2+3 (commits ff957338 + b620a625).
    // ================================================================

    /**
     * Veiculo - frota movel (ambulancias, carros, caminhoes especiais).
     * Uso: logistica operacional, resposta a emergencias, transporte de
     * material. Nao cobre waste_truck (ja em waste_stream).
     */
    vehicle: {
        id: 'vehicle',
        nameKey: 'vehicle',
        icon: 'truck',
        code: 'VH',
        enabled: true,
        isContainer: false,
    },

    /**
     * Equipamento - ativos industriais estaticos ou rotativos
     * (compressores, geradores, motores, turbinas, transformadores).
     * Matriz: air (emissoes), noise, intangible (O&M). Relevante para
     * inventario de ativos + gestao de manutencao.
     */
    equipment: {
        id: 'equipment',
        nameKey: 'equipment',
        icon: 'settings',
        code: 'EQ',
        enabled: true,
        isContainer: false,
    },

    /**
     * Infraestrutura linear - elementos de conducao continuos
     * (tubulacoes, valvulas, mangueiras, estradas, ruas, estruturas metalicas).
     * Pode conectar multiplos elementos (source → receiver). Matriz: air/soil
     * (vazamentos), waste (disposicao).
     */
    infra_linear: {
        id: 'infra_linear',
        nameKey: 'linearInfrastructure',
        icon: 'git-merge',
        code: 'IL',
        enabled: true,
        isContainer: false,
    },

    /**
     * Sistema de tratamento - unidades de controle ambiental ativo
     * (separador agua-oleo, sistema septico, etc). Difere de emission_source
     * por ser SINK de contaminacao (trata), nao fonte. Calculo de eficiencia +
     * compliance com CONAMA 430.
     */
    treatment_system: {
        id: 'treatment_system',
        nameKey: 'treatmentSystem',
        icon: 'shield',
        code: 'TS',
        enabled: true,
        isContainer: false,
    },

    /**
     * Atmosfera - fenomenos volumetricos aereos (nuvens, plumas atmosfericas
     * nao-poluentes, colunas convectivas). Differ de emission_source que e
     * pontual. Usado para contexto meteorologico em risk assessment.
     */
    atmosphere: {
        id: 'atmosphere',
        nameKey: 'atmosphere',
        icon: 'cloud',
        code: 'AT',
        enabled: true,
        isContainer: false,
    },

    /**
     * Rotas e Fluxos - representação linear direcional de cursos d'água,
     * rotas logísticas, tubulações e conectores de fluxo. Suporta propriedades
     * hidráulicas (Manning), topologia de grafo e simulação de transporte.
     * Spec: docs/specs/features/SPEC_FAMILY_ROUTES_FLOWS.md §9.46
     */
    route_flow: {
        id: 'route_flow',
        nameKey: 'routeFlow',
        icon: 'git-commit',
        code: 'RF',
        enabled: true,
        isContainer: false,
    },

    /**
     * Bacia hidrografica (watershed) - area de contribuicao que drena para um
     * ponto de exutorio (poco, captacao, foz). Derivada de uma grade de elevacao
     * (DEM) via D8 + Priority-Flood (sub-modulo WatershedModule liga a familia ao
     * algoritmo em core/hydrology). Matriz: surface-water + groundwater.
     * Spec: docs/specs/features/SPEC_WATERSHED_FAMILY.md
     */
    watershed: {
        id: 'watershed',
        nameKey: 'watershed',
        icon: 'droplet',
        code: 'WS',
        enabled: true,
        isContainer: false,
    },

    // ================================================================
    // ANNOTATION (2026-05-15) — Calculator-driven placas/post-its
    // ================================================================

    /**
     * Placa (post-it) — anotacao flutuante no modelo 3D vinculada a um
     * elemento e populada por um calculator function. Renderizada como
     * CSS2DRenderer billboard (HTML always faces camera) com estilo
     * sticky note (amber). Padrao baseado em:
     *   - threejs.org/docs/pages/CSS2DRenderer.html
     *   - mrdoob/three.js examples/css2d_label.html
     * Estado armazenado em data: { calculatorFnId, inputs, result,
     * formattedResult, linkedTo, position }.
     */
    post: {
        id: 'post',
        nameKey: 'postFamilyLabel',
        icon: 'sticky-note',
        code: 'PS',
        enabled: true,
        isContainer: false,
    },

    // ================================================================
    // PRODUCTION-AREA-001 (2026-06-21) — Área Produtiva / Planta de Beneficiamento
    // ================================================================

    /**
     * Área Produtiva (Planta de Beneficiamento) - o "motor produtivo" que
     * recebe matéria-prima, processa e devolve produto comercial + rejeito,
     * registrando o que entra, o que sai e a que ritmo (três taxas: vazão,
     * recuperação, teor/rendimento). Catálogo data-driven de subtipos
     * (mineração/petróleo, ampliável).
     *
     * REUSE-CHECK / ADR §10: família NOVA, distinta da família 'area'
     * (organizacional, ícone 'factory', grupo environmental). Ícone próprio
     * ('package') e nome explícito evitam confusão de UX. Sem colisão de
     * code ('PA' livre) nem de ícone.
     * Spec: docs/specs/features/SPEC_PRODUCTION_AREA_FAMILY.md
     */
    production_area: {
        id: 'production_area',
        nameKey: 'productionArea',
        icon: 'package',
        code: 'PA',
        enabled: true,
        isContainer: false,
    },

    // ================================================================
    // ECBYTS-ENERGY-SCENARIOS-001#5 (2026-07-22) — DRONE / UAV
    // ================================================================

    /**
     * Drone / UAV - aeronave nao tripulada para captura aerea (mapeamento,
     * fotogrametria) ou transporte de carga leve (logistica de varzea:
     * pontos esparsos de coleta -> ponto de centralizacao).
     * Propriedades em data: payloadKg, autonomyKm, autonomyMin, speedKmh,
     * costPerHour, costPerKm, droneType ('cargo'|'mapping').
     * Voa por rotas route_flow type 'flight_route' (renderizadas elevadas).
     * Modulo: core/elements/families/drone/ (schema + KPIs logisticos puros).
     * REUSE-CHECK: distinta de 'vehicle' (frota terrestre) — o drone carrega
     * envelope de voo (altitude/autonomia) e KPIs por kg transportado.
     * Parecer: docs/reports/ENERGY_SCENARIOS_FAMILY_CENSUS_2026-07-22.md §4.5
     */
    drone: {
        id: 'drone',
        nameKey: 'droneUav',
        icon: 'send',
        code: 'DN',
        enabled: true,
        isContainer: false,
    },
};
