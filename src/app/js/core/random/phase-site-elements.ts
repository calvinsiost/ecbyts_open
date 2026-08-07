// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Phase Site Elements Builder - RANDOM-REBUILD-V2 C.7.2.
 *
 * Keeps the long-tail site/natural/support element families out of
 * phase-elements.js so the primary builders stay within the LOC budget.
 */

function assertRuntime(name: string, runtimePairs: Array<[string, any]>): void {
    for (const [label, value] of runtimePairs) {
        if (typeof value !== 'function') {
            throw new Error(`${name} requires explicit runtime helper: ${label}`);
        }
    }
}

export function createSiteElementsPhase(ctx: any, runtime: any = {}): void {
    const {
        addElement,
        nextElementCounter,
        syntheticTerrainElevation,
        findRiverSource,
        generateRiverPath,
        runtimeRandom,
        runtimeDate,
        runtimeNow,
        randInt,
        generateObservations,
    } = runtime;
    assertRuntime('createSiteElementsPhase', [
        ['addElement', addElement],
        ['nextElementCounter', nextElementCounter],
        ['syntheticTerrainElevation', syntheticTerrainElevation],
        ['findRiverSource', findRiverSource],
        ['generateRiverPath', generateRiverPath],
        ['runtimeRandom', runtimeRandom],
        ['runtimeDate', runtimeDate],
        ['runtimeNow', runtimeNow],
        ['randInt', randInt],
        ['generateObservations', generateObservations],
    ]);

    const {
        include,
        campaigns,
        halfWidth,
        halfLength,
        industrialCenter,
        monitoringCenter,
        naturalCenter,
        zoneSpread,
        inZone,
        clamp,
        hMeta,
        detectedZones,
        randRange,
        randChoice,
        rndLat,
        rndLon,
        buildingPositions,
        wellPositions,
        generatedAreas,
    } = ctx;

    if (include.has('tank')) {
        const TANK_CONTENTS: Record<string, string> = {
            diesel: 'Diesel',
            gasoline: 'Gasolina',
            fuel_oil: 'Óleo Combustível',
            chemicals: 'Químicos',
        };
        const numTanks = randInt(1, 3);
        for (let i = 0; i < numTanks; i++) {
            const elementCounter = nextElementCounter();
            const building =
                buildingPositions.length > 0
                    ? randChoice(buildingPositions)
                    : { x: industrialCenter.x, z: industrialCenter.z, h: 6 };
            const x = clamp(building.x + randRange(-25, 25), halfWidth);
            const z = clamp(building.z + randRange(-25, 25), halfLength);
            const groundY = syntheticTerrainElevation(x, z, halfWidth, halfLength);
            const isUnderground = runtimeRandom('model') > 0.3;
            const depthOffset = isUnderground ? randRange(-5, -2) : 0;
            const y = groundY + depthOffset;
            const contents = randChoice(Object.keys(TANK_CONTENTS));

            addElement(
                'tank',
                `tank-${elementCounter}`,
                `Tanque de ${TANK_CONTENTS[contents]}`,
                {
                    position: { x, y, z },
                    depthOffset,
                    dimensions: { diameter: randRange(2, 6), length: randRange(4, 10) },
                    type: isUnderground ? 'underground' : 'aboveground',
                    contents,
                    observations: generateObservations('tank', { x, y, z }, campaigns),
                },
                hMeta('tank'),
            );
        }
    }

    if (include.has('lake') && runtimeRandom('model') > 0.4) {
        const elementCounter = nextElementCounter();
        const waterPos = detectedZones?.water || inZone(naturalCenter, zoneSpread * 0.4);
        const pos = detectedZones?.water ? waterPos : inZone(naturalCenter, zoneSpread * 0.4);
        const groundY = syntheticTerrainElevation(pos.x, pos.z, halfWidth, halfLength);
        ctx.lakePosition = { x: pos.x, y: groundY, z: pos.z };

        addElement(
            'lake',
            `lake-${elementCounter}`,
            'Lagoa de Contenção',
            {
                position: ctx.lakePosition,
                shape: { radiusX: randRange(15, 50), radiusY: randRange(10, 35), depth: randRange(2, 8) },
                observations: generateObservations('lake', ctx.lakePosition, campaigns),
            },
            hMeta('lake'),
        );
    }

    if (include.has('river')) {
        const elementCounter = nextElementCounter();
        const numPoints = randInt(6, 9);
        const visibleRatio = 0.62;
        const source = findRiverSource(naturalCenter, zoneSpread, halfWidth, halfLength, { visibleRatio });
        const stepSize = Math.min(halfWidth, halfLength) * 0.14;
        const points = generateRiverPath(source, numPoints, stepSize, halfWidth, halfLength, { visibleRatio });

        ctx.riverMidpoint = points[Math.floor(points.length / 2)];
        addElement(
            'river',
            `river-${elementCounter}`,
            'Córrego',
            {
                path: points,
                width: randRange(2, 6),
                observations: generateObservations('river', ctx.riverMidpoint, campaigns),
            },
            hMeta('river'),
        );
    }

    if (include.has('spring')) {
        const SPRING_NAMES: Record<string, string> = {
            artesian: 'Artesiana',
            gravity: 'Gravitacional',
            seepage: 'de Infiltração',
        };
        const numSprings = randInt(0, 2);
        for (let i = 0; i < numSprings; i++) {
            const elementCounter = nextElementCounter();
            const pos = inZone(naturalCenter, zoneSpread * 0.6);
            const springType = randChoice(['artesian', 'gravity', 'seepage']);
            const groundY = syntheticTerrainElevation(pos.x, pos.z, halfWidth, halfLength);

            addElement(
                'spring',
                `spring-${elementCounter}`,
                `Nascente ${SPRING_NAMES[springType]}`,
                {
                    position: { x: pos.x, y: groundY, z: pos.z },
                    discharge: randRange(0.5, 10),
                    type: springType,
                    observations: generateObservations('spring', { x: pos.x, y: groundY, z: pos.z }, campaigns),
                },
                hMeta('spring'),
            );
        }
    }

    if (include.has('marker')) {
        const numMarkers = randInt(0, 3);
        for (let i = 0; i < numMarkers; i++) {
            const elementCounter = nextElementCounter();
            const mx = randRange(-halfWidth * 0.8, halfWidth * 0.8);
            const mz = randRange(-halfLength * 0.8, halfLength * 0.8);
            const my = syntheticTerrainElevation(mx, mz, halfWidth, halfLength);

            addElement(
                'marker',
                `marker-${elementCounter}`,
                `Marcador ${i + 1}`,
                { position: { x: mx, y: my, z: mz } },
                hMeta('marker'),
            );
        }
    }

    if (include.has('sample')) {
        const SAMPLE_NAMES: Record<string, string> = {
            soil: 'Solo',
            surface_water: 'Água Superficial',
            sediment: 'Sedimento',
            groundwater: 'Água Subterrânea',
        };
        const numSamples = randInt(1, 4);
        for (let i = 0; i < numSamples; i++) {
            const elementCounter = nextElementCounter();
            const pos = inZone(monitoringCenter, zoneSpread * 0.7);
            const matrix = randChoice(Object.keys(SAMPLE_NAMES));
            const groundY = syntheticTerrainElevation(pos.x, pos.z, halfWidth, halfLength);

            addElement(
                'sample',
                `sample-${elementCounter}`,
                `Amostra de ${SAMPLE_NAMES[matrix]}`,
                {
                    position: { x: pos.x, y: groundY, z: pos.z },
                    matrix,
                    depth: randRange(0, 10),
                    observations: generateObservations('sample', { x: pos.x, y: groundY, z: pos.z }, campaigns),
                },
                hMeta('sample'),
            );
        }
    }

    if (include.has('emission_source')) {
        const EMISSION_NAMES: Record<string, string> = {
            combustion: 'da Caldeira',
            process: 'do Processo',
            flare: 'do Flare',
        };
        const numEmissionSources = randInt(1, 3);
        for (let i = 0; i < numEmissionSources; i++) {
            const elementCounter = nextElementCounter();
            const building =
                buildingPositions.length > 0
                    ? buildingPositions[i % buildingPositions.length]
                    : { x: industrialCenter.x, z: industrialCenter.z, h: 6 };
            const x = building.x + randRange(-5, 5);
            const z = building.z + randRange(-5, 5);
            const category = randChoice(['combustion', 'process', 'flare']);

            addElement(
                'emission_source',
                `emission-${elementCounter}`,
                `Chaminé ${EMISSION_NAMES[category]}`,
                {
                    position: { x, y: building.h + randRange(2, 8), z },
                    type: randChoice(['stack', 'vent', 'fugitive']),
                    sourceCategory: category,
                    observations: generateObservations('emission_source', { x, y: building.h, z }, campaigns),
                },
                hMeta('emission_source'),
            );
        }
    }

    if (include.has('waste_stream')) {
        const WASTE_NAMES: Record<string, string> = {
            'Class I': 'Perigoso',
            'Class IIA': 'Não Inerte',
            'Class IIB': 'Inerte',
        };
        const numWasteStreams = randInt(1, 3);
        for (let i = 0; i < numWasteStreams; i++) {
            const elementCounter = nextElementCounter();
            const building =
                buildingPositions.length > 0
                    ? randChoice(buildingPositions)
                    : { x: industrialCenter.x, z: industrialCenter.z };
            const wasteX = clamp(building.x + randRange(-15, 15), halfWidth);
            const wasteZ = clamp(building.z + randRange(-15, 15), halfLength);
            const wasteY = syntheticTerrainElevation(wasteX, wasteZ, halfWidth, halfLength);
            const wastePos = { x: wasteX, y: wasteY, z: wasteZ };
            const wasteClass = randChoice(['Class I', 'Class IIA', 'Class IIB']);

            addElement(
                'waste_stream',
                `waste-${elementCounter}`,
                `Resíduo ${WASTE_NAMES[wasteClass]}`,
                {
                    position: wastePos,
                    wasteClass,
                    destination: randChoice(['recycling', 'landfill', 'incineration', 'coprocessing']),
                    observations: generateObservations('waste_stream', wastePos, campaigns),
                },
                hMeta('waste_stream'),
            );
        }
    }

    if (include.has('effluent_point')) {
        const EFFLUENT_NAMES: Record<string, string> = {
            industrial: 'Industrial',
            sanitary: 'Sanitário',
            stormwater: 'Pluvial',
        };
        const numEffluentPoints = randInt(1, 2);
        for (let i = 0; i < numEffluentPoints; i++) {
            const elementCounter = nextElementCounter();
            let x;
            let z;
            const waterRef = ctx.riverMidpoint || ctx.lakePosition;
            if (waterRef) {
                x = clamp(waterRef.x + randRange(-20, 20), halfWidth);
                z = clamp(waterRef.z + randRange(-20, 20), halfLength);
            } else {
                x = halfWidth * randChoice([-0.9, 0.9]);
                z = randRange(-halfLength * 0.5, halfLength * 0.5);
            }
            const effY = syntheticTerrainElevation(x, z, halfWidth, halfLength);
            const effluentType = randChoice(['industrial', 'sanitary', 'stormwater']);

            addElement(
                'effluent_point',
                `effluent-${elementCounter}`,
                `Efluente ${EFFLUENT_NAMES[effluentType]}`,
                {
                    position: { x, y: effY, z },
                    effluentType,
                    receivingBody: ctx.riverMidpoint ? 'river' : ctx.lakePosition ? 'lake' : 'treatment_plant',
                    observations: generateObservations('effluent_point', { x, y: effY, z }, campaigns),
                },
                hMeta('effluent_point'),
            );
        }
    }

    if (include.has('area')) {
        const AREA_NAMES: Record<string, string> = {
            production: 'Produção',
            warehouse: 'Armazém',
            office: 'Escritório',
            maintenance: 'Manutenção',
        };
        const areaTypes = Object.keys(AREA_NAMES);
        const numAreas = randInt(2, 4);
        for (let i = 0; i < numAreas; i++) {
            const elementCounter = nextElementCounter();
            const areaType = areaTypes[i % areaTypes.length] as string;
            const areaName = `Setor ${AREA_NAMES[areaType]}`;

            addElement(
                'area',
                `area-${elementCounter}`,
                areaName,
                {
                    areaType,
                    headcount: randInt(10, 200),
                    workedHours: randInt(50000, 500000),
                    projectArea: areaName,
                    observations: generateObservations('area', { x: 0, y: 0, z: 0 }, campaigns),
                },
                hMeta('area'),
            );
            generatedAreas.push({ area: areaName, subarea: areaType });
        }
    }

    if (include.has('incident')) {
        const numIncidents = randInt(0, 3);
        for (let i = 0; i < numIncidents; i++) {
            const elementCounter = nextElementCounter();
            const incidentDate = runtimeDate(runtimeNow() - randInt(1, 365) * 24 * 60 * 60 * 1000);

            addElement(
                'incident',
                `incident-${elementCounter}`,
                `Incidente ${i + 1}`,
                {
                    type: randChoice(['accident', 'near_miss', 'first_aid', 'medical_treatment']),
                    severity: randChoice(['low', 'medium', 'high', 'critical']),
                    lostDays: randInt(0, 30),
                    date: incidentDate.toISOString().slice(0, 10),
                    rootCause: randChoice(['behavioral', 'equipment', 'process', 'environmental']),
                },
                hMeta('incident'),
            );
        }
    }

    if (include.has('habitat')) {
        const HABITAT_NAMES: Record<string, string> = {
            forest: 'Mata Nativa',
            wetland: 'Área Alagável',
            grassland: 'Campo',
            riparian: 'Mata Ciliar',
        };
        const numHabitats = randInt(1, 3);
        for (let i = 0; i < numHabitats; i++) {
            const elementCounter = nextElementCounter();
            const pos = inZone(naturalCenter, zoneSpread * 0.5);
            const habitatType = randChoice(Object.keys(HABITAT_NAMES));
            const groundY = syntheticTerrainElevation(pos.x, pos.z, halfWidth, halfLength);

            addElement(
                'habitat',
                `habitat-${elementCounter}`,
                HABITAT_NAMES[habitatType],
                {
                    position: { x: pos.x, y: groundY, z: pos.z },
                    habitatType,
                    protectionStatus: randChoice(['none', 'buffer_zone', 'protected', 'restoration']),
                    area: randRange(1, 100),
                    observations: generateObservations('habitat', { x: pos.x, y: groundY, z: pos.z }, campaigns),
                },
                hMeta('habitat'),
            );
        }
    }

    if (include.has('individual')) {
        const numIndividuals = randInt(5, 15);
        const individualTypes = ['person', 'person', 'person', 'animal', 'tree'];
        for (let i = 0; i < numIndividuals; i++) {
            const elementCounter = nextElementCounter();
            const individualType = randChoice(individualTypes);
            const pos =
                individualType === 'person'
                    ? inZone(industrialCenter, zoneSpread * 0.8)
                    : inZone(naturalCenter, zoneSpread * 0.9);
            const groundY = syntheticTerrainElevation(pos.x, pos.z, halfWidth, halfLength);
            const obsPos = { x: pos.x, y: groundY, z: pos.z };

            if (individualType === 'person') {
                const PERSON_ROLES: Record<string, string> = {
                    operator: 'Operador',
                    technician: 'Técnico',
                    supervisor: 'Supervisor',
                    manager: 'Gestor',
                };
                const role = randChoice(Object.keys(PERSON_ROLES));
                addElement(
                    'individual',
                    `individual-${elementCounter}`,
                    `${PERSON_ROLES[role]} ${i + 1}`,
                    {
                        position: obsPos,
                        individualType: 'person',
                        role,
                        department:
                            generatedAreas.length > 0 ? randChoice(generatedAreas).area : `Setor ${randInt(1, 4)}`,
                        observations: generateObservations('individual', obsPos, campaigns),
                    },
                    hMeta('building'),
                );
            } else if (individualType === 'animal') {
                const species = randChoice(['Capivara', 'Tucano', 'Bugio', 'Onça-Pintada', 'Anta']);
                addElement(
                    'individual',
                    `individual-${elementCounter}`,
                    species,
                    {
                        position: obsPos,
                        individualType: 'animal',
                        species,
                        taxonId: `GBIF-${randInt(1000000, 9999999)}`,
                        observationDate: campaigns[randInt(0, campaigns.length - 1)].date.toISOString().slice(0, 10),
                        observations: generateObservations('habitat', obsPos, campaigns),
                    },
                    hMeta('habitat'),
                );
            } else {
                const species = randChoice(['Ipê Amarelo', 'Jatobá', 'Pau-Brasil', 'Araucária']);
                addElement(
                    'individual',
                    `individual-${elementCounter}`,
                    species,
                    {
                        position: obsPos,
                        individualType: 'tree',
                        species,
                        dbh: randRange(10, 100),
                        height: randRange(5, 30),
                        observations: generateObservations('habitat', obsPos, campaigns),
                    },
                    hMeta('habitat'),
                );
            }
        }
    }

    if (include.has('sensor')) {
        const SENSOR_NAMES: Record<string, string> = {
            temperature: 'Temperatura',
            multiparameter: 'Multiparâmetro',
            level: 'Nível',
            flow: 'Vazão',
        };
        const sensorTypes = Object.keys(SENSOR_NAMES);
        const numSensors = randInt(1, 3);
        for (let i = 0; i < numSensors; i++) {
            const elementCounter = nextElementCounter();
            const sensorType = randChoice(sensorTypes);
            let sx;
            let sz;
            const sensorRef = wellPositions.length > 0 ? randChoice(wellPositions) : null;
            if (sensorRef) {
                sx = clamp(sensorRef.x + randRange(-10, 10), halfWidth);
                sz = clamp(sensorRef.z + randRange(-10, 10), halfLength);
            } else {
                const pos = inZone(monitoringCenter, zoneSpread);
                sx = pos.x;
                sz = pos.z;
            }
            const sensorY = syntheticTerrainElevation(sx, sz, halfWidth, halfLength);

            addElement(
                'sensor',
                `sensor-${elementCounter}`,
                `Sensor de ${SENSOR_NAMES[sensorType]}`,
                {
                    position: { x: sx, y: sensorY, z: sz },
                    geoCoordinates: {
                        latitude: rndLat + sz / 111320,
                        longitude: rndLon + sx / (111320 * Math.cos((rndLat * Math.PI) / 180)),
                    },
                    userId: randInt(1, 10),
                    connectorKey: '',
                    sensorType,
                    monitoredParameters: ['temperature', 'pH', 'conductivity', 'water_level'],
                    profile: null,
                    evaluation: null,
                    weather: null,
                    lastFetch: null,
                    errors: [],
                    observations: generateObservations('sensor', { x: sx, y: sensorY, z: sz }, campaigns),
                },
                hMeta('sensor'),
            );
        }
    }

    if (include.has('vehicle')) {
        const VEHICLE_NAMES: Record<string, string> = {
            truck: 'Caminhão',
            car: 'Veículo Leve',
            bus: 'Ônibus',
            tractor: 'Trator',
        };
        const vehicleTypes = Object.keys(VEHICLE_NAMES);
        const numVehicles = randInt(1, 3);
        for (let i = 0; i < numVehicles; i++) {
            const elementCounter = nextElementCounter();
            const vehicleType = vehicleTypes[i % vehicleTypes.length] as string;
            const vehicleX = clamp(industrialCenter.x + randRange(-30, 30), halfWidth);
            const vehicleZ = clamp(industrialCenter.z + randRange(-30, 30), halfLength);
            const vehicleY = syntheticTerrainElevation(vehicleX, vehicleZ, halfWidth, halfLength);
            addElement(
                'vehicle',
                `vehicle-${elementCounter}`,
                `${VEHICLE_NAMES[vehicleType]} ${i + 1}`,
                {
                    position: { x: vehicleX, y: vehicleY + 1, z: vehicleZ },
                    vehicleType,
                    fuelType: randChoice(['diesel', 'gasoline', 'electric', 'ethanol']),
                    observations: generateObservations('vehicle', { x: vehicleX, y: vehicleY, z: vehicleZ }, campaigns),
                },
                hMeta('vehicle'),
            );
        }
    }

    if (include.has('equipment')) {
        const EQUIPMENT_NAMES: Record<string, string> = {
            compressor: 'Compressor',
            generator: 'Gerador',
            crane: 'Guindaste',
            pump: 'Bomba',
        };
        const equipmentTypes = Object.keys(EQUIPMENT_NAMES);
        const numEquipment = randInt(1, 3);
        for (let i = 0; i < numEquipment; i++) {
            const elementCounter = nextElementCounter();
            const equipmentType = equipmentTypes[i % equipmentTypes.length] as string;
            const building =
                buildingPositions.length > 0
                    ? buildingPositions[i % buildingPositions.length]
                    : { x: industrialCenter.x, z: industrialCenter.z };
            const eqX = clamp(building.x + randRange(-10, 10), halfWidth);
            const eqZ = clamp(building.z + randRange(-10, 10), halfLength);
            const eqY = syntheticTerrainElevation(eqX, eqZ, halfWidth, halfLength);
            addElement(
                'equipment',
                `equipment-${elementCounter}`,
                `${EQUIPMENT_NAMES[equipmentType]} ${i + 1}`,
                {
                    position: { x: eqX, y: eqY + 1, z: eqZ },
                    equipmentType,
                    manufacturer: randChoice(['Siemens', 'ABB', 'GE', 'Atlas Copco']),
                    observations: generateObservations('equipment', { x: eqX, y: eqY, z: eqZ }, campaigns),
                },
                hMeta('equipment'),
            );
        }
    }

    if (include.has('infra_linear')) {
        const INFRA_NAMES: Record<string, string> = {
            pipeline: 'Tubulação',
            cable: 'Cabo',
            road: 'Via',
            conduit: 'Conduite',
        };
        const infraTypes = Object.keys(INFRA_NAMES);
        const numInfra = randInt(1, 2);
        for (let i = 0; i < numInfra; i++) {
            const elementCounter = nextElementCounter();
            const infraType = infraTypes[i % infraTypes.length] as string;
            const startX = clamp(industrialCenter.x + randRange(-40, 40), halfWidth);
            const startZ = clamp(industrialCenter.z + randRange(-40, 40), halfLength);
            const endX = clamp(startX + randRange(20, 60), halfWidth);
            const endZ = clamp(startZ + randRange(-20, 20), halfLength);
            const startY = syntheticTerrainElevation(startX, startZ, halfWidth, halfLength);
            addElement(
                'infra_linear',
                `infra-${elementCounter}`,
                `${INFRA_NAMES[infraType]} ${i + 1}`,
                {
                    position: { x: startX, y: startY, z: startZ },
                    endPosition: {
                        x: endX,
                        y: syntheticTerrainElevation(endX, endZ, halfWidth, halfLength),
                        z: endZ,
                    },
                    infraType,
                    length: Math.sqrt((endX - startX) ** 2 + (endZ - startZ) ** 2).toFixed(1),
                    observations: generateObservations('infra_linear', { x: startX, y: startY, z: startZ }, campaigns),
                },
                hMeta('infra_linear'),
            );
        }
    }

    if (include.has('treatment_system')) {
        const TREATMENT_NAMES: Record<string, string> = {
            wwtp: 'ETE - Estação de Tratamento',
            oil_water_separator: 'Separador Óleo-Água',
            septic_system: 'Sistema Séptico',
            filtration: 'Sistema de Filtração',
        };
        const treatmentTypes = Object.keys(TREATMENT_NAMES);
        const numTreatment = randInt(1, 2);
        for (let i = 0; i < numTreatment; i++) {
            const elementCounter = nextElementCounter();
            const treatmentType = treatmentTypes[i % treatmentTypes.length] as string;
            const waterRef = ctx.riverMidpoint || ctx.lakePosition;
            const refX = waterRef ? waterRef.x : industrialCenter.x;
            const refZ = waterRef ? waterRef.z : industrialCenter.z;
            const trX = clamp(refX + randRange(-15, 15), halfWidth);
            const trZ = clamp(refZ + randRange(-15, 15), halfLength);
            const trY = syntheticTerrainElevation(trX, trZ, halfWidth, halfLength);
            addElement(
                'treatment_system',
                `treatment-${elementCounter}`,
                `${TREATMENT_NAMES[treatmentType]} ${i + 1}`,
                {
                    position: { x: trX, y: trY, z: trZ },
                    treatmentType,
                    capacity: `${randInt(100, 2000)} m³/dia`,
                    observations: generateObservations('treatment_system', { x: trX, y: trY, z: trZ }, campaigns),
                },
                hMeta('treatment_system'),
            );
        }
    }

    if (include.has('atmosphere')) {
        const numAtmosphere = randInt(1, 2);
        for (let i = 0; i < numAtmosphere; i++) {
            const elementCounter = nextElementCounter();
            const atmX = clamp(industrialCenter.x + randRange(-20, 20), halfWidth);
            const atmZ = clamp(industrialCenter.z + randRange(-20, 20), halfLength);
            const groundY = syntheticTerrainElevation(atmX, atmZ, halfWidth, halfLength);
            const monitoringHeight = randChoice([2, 5, 10]); // alturas padrão monitoramento ar
            addElement(
                'atmosphere',
                `atmosphere-${elementCounter}`,
                `Qualidade do Ar ${i + 1}`,
                {
                    position: { x: atmX, y: groundY + monitoringHeight, z: atmZ },
                    monitoringHeight,
                    samplingType: randChoice(['passive', 'active', 'continuous']),
                    observations: generateObservations('atmosphere', { x: atmX, y: groundY, z: atmZ }, campaigns),
                },
                hMeta('atmosphere'),
            );
        }
    }

    if (include.has('intangible')) {
        const INTANGIBLE_ITEMS = [
            { name: 'Crédito de Carbono', type: 'carbon_credit' },
            { name: 'Licença Ambiental', type: 'environmental_license' },
            { name: 'Certificação ISO 14001', type: 'certification' },
            { name: 'Contrato de Remediação', type: 'remediation_contract' },
            { name: 'Seguro Ambiental', type: 'insurance' },
            { name: 'Outorga de Uso de Água', type: 'water_use_permit' },
        ];
        const numIntangibles = randInt(1, 3);
        for (let i = 0; i < numIntangibles; i++) {
            const elementCounter = nextElementCounter();
            const item = INTANGIBLE_ITEMS[i % INTANGIBLE_ITEMS.length] as { name: string; type: string };

            addElement(
                'intangible',
                `intangible-${elementCounter}`,
                item.name,
                {
                    assetType: item.type,
                    issueDate: runtimeDate(runtimeNow() - randInt(30, 730) * 86400000)
                        .toISOString()
                        .slice(0, 10),
                    expiryDate: runtimeDate(runtimeNow() + randInt(30, 1095) * 86400000)
                        .toISOString()
                        .slice(0, 10),
                    value: randRange(10000, 500000).toFixed(2),
                    status: randChoice(['active', 'pending', 'expired', 'renewed']),
                },
                hMeta('intangible'),
            );
        }
    }

    if (include.has('generic')) {
        const GENERIC_ITEMS = [
            'Equipamento de Campo',
            'Estação Meteorológica',
            'Ponto de Referência',
            'Registro Fotográfico',
        ];
        const numGeneric = randInt(1, 2);
        for (let i = 0; i < numGeneric; i++) {
            const elementCounter = nextElementCounter();
            addElement(
                'generic',
                `generic-${elementCounter}`,
                GENERIC_ITEMS[i % GENERIC_ITEMS.length],
                {
                    description: `Elemento genérico ${i + 1} para demonstração`,
                    createdDate: runtimeDate(runtimeNow() - randInt(1, 365) * 86400000)
                        .toISOString()
                        .slice(0, 10),
                },
                hMeta('generic'),
            );
        }
    }

    // RANDOM-COV-001 F1 (RF-1) — Barragem (mineração / hidro / saneamento).
    // Inserido ao FIM da fase: não altera a sequência do PRNG das famílias
    // anteriores → elementos existentes ficam byte-idênticos; só estes são
    // acrescentados. Toda aleatoriedade via PRNG semeado (determinismo).
    if (include.has('dam')) {
        const DAM_TYPES: Record<string, string> = {
            tailings: 'Barragem de Rejeitos',
            water: 'Barragem de Água',
            sanitation: 'Barragem de Contenção',
        };
        const numDams = randInt(0, 2);
        for (let i = 0; i < numDams; i++) {
            const elementCounter = nextElementCounter();
            const pos = inZone(industrialCenter, zoneSpread * 0.5);
            const x = clamp(pos.x, halfWidth);
            const z = clamp(pos.z, halfLength);
            const groundY = syntheticTerrainElevation(x, z, halfWidth, halfLength);
            const damType = randChoice(Object.keys(DAM_TYPES));
            addElement(
                'dam',
                `dam-${elementCounter}`,
                DAM_TYPES[damType],
                {
                    position: { x, y: groundY, z },
                    damType,
                    crestLength: Math.round(randRange(80, 300)),
                    height: Math.round(randRange(10, 60)),
                    observations: generateObservations('dam', { x, y: groundY, z }, campaigns),
                },
                hMeta('dam'),
            );
        }
    }

    // RANDOM-COV-001 F1 (RF-1) — Cava a céu aberto (mineração / pedreiras).
    if (include.has('pit')) {
        const numPits = randInt(0, 1);
        for (let i = 0; i < numPits; i++) {
            const elementCounter = nextElementCounter();
            const pos = inZone(industrialCenter, zoneSpread * 0.6);
            const x = clamp(pos.x, halfWidth);
            const z = clamp(pos.z, halfLength);
            const groundY = syntheticTerrainElevation(x, z, halfWidth, halfLength);
            addElement(
                'pit',
                `pit-${elementCounter}`,
                'Cava a Céu Aberto',
                {
                    position: { x, y: groundY, z },
                    depth: Math.round(randRange(20, 120)),
                    benchCount: randInt(3, 10),
                    radiusTop: Math.round(randRange(60, 250)),
                    observations: generateObservations('pit', { x, y: groundY, z }, campaigns),
                },
                hMeta('pit'),
            );
        }
    }

    // RANDOM-COV-001 F1 (RF-2) — Rota/Fluxo (elemento linear direcional).
    // Liga dois nós existentes (poços/edifícios) por um `path` geométrico →
    // conectividade espacial. NOTA: a fiação em model.edges (para os KPIs de
    // grafo do GRAPH-KPI-001) exige IDs de elemento, ausentes nestas listas de
    // posição; fica como refinamento futuro da RF-2.
    if (include.has('route_flow')) {
        const ROUTE_TYPES: Record<string, string> = {
            pipe: 'Tubulação',
            sampling_route: 'Rota de Amostragem',
            vehicle_route: 'Rota de Veículo',
        };
        const nodes = [...(wellPositions || []), ...(buildingPositions || [])].filter(Boolean);
        const numRoutes = nodes.length >= 2 ? randInt(1, 3) : 0;
        for (let i = 0; i < numRoutes; i++) {
            const elementCounter = nextElementCounter();
            const a = randChoice(nodes);
            let b = randChoice(nodes);
            let guard = 0;
            while (b === a && guard++ < 5) b = randChoice(nodes);
            const ax = clamp(a.x, halfWidth);
            const az = clamp(a.z, halfLength);
            const bx = clamp(b.x, halfWidth);
            const bz = clamp(b.z, halfLength);
            const ay = syntheticTerrainElevation(ax, az, halfWidth, halfLength);
            const by = syntheticTerrainElevation(bx, bz, halfWidth, halfLength);
            const routeType = randChoice(Object.keys(ROUTE_TYPES));
            addElement(
                'route_flow',
                `route_flow-${elementCounter}`,
                ROUTE_TYPES[routeType],
                {
                    routeType,
                    path: [
                        { x: ax, y: ay, z: az },
                        { x: bx, y: by, z: bz },
                    ],
                    position: { x: (ax + bx) / 2, y: (ay + by) / 2, z: (az + bz) / 2 },
                },
                hMeta('route_flow'),
            );
        }
    }

    // RANDOM-COV-001 F3 (RF-7) — Falha geológica (strike/dip plausíveis).
    // Pure-logic, mesmo padrão das demais famílias; alimenta o FaultInspectorModule.
    // Inserido ao FIM da fase → sequência do PRNG das famílias anteriores intacta.
    if (include.has('fault')) {
        const numFaults = randInt(0, 2);
        for (let i = 0; i < numFaults; i++) {
            const elementCounter = nextElementCounter();
            const pos = inZone(naturalCenter, zoneSpread * 0.7);
            const x = clamp(pos.x, halfWidth);
            const z = clamp(pos.z, halfLength);
            const groundY = syntheticTerrainElevation(x, z, halfWidth, halfLength);
            // strike 0–360° (azimute do traço), dip 30–85° (mergulho realista).
            const strike = Math.round(runtimeRandom('model') * 360);
            const dip = Math.round(30 + runtimeRandom('model') * 55);
            const length = Math.round(randRange(60, 400));
            addElement(
                'fault',
                `fault-${elementCounter}`,
                'Falha Geológica',
                {
                    position: { x, y: groundY, z },
                    strike,
                    dip,
                    length,
                    dipDirection: (strike + 90) % 360,
                },
                hMeta('fault'),
            );
        }
    }

    // RANDOM-COV-001 F5 (post) — Placa de anotação 3D (CSS2DRenderer).
    // Última família p/ cobertura 35/35. Pure-logic; ancora um texto a uma posição
    // (opcionalmente sobre um poço/edifício existente). Inserido ao FIM da fase.
    if (include.has('post')) {
        const POST_NOTES = [
            'Ponto de atenção',
            'Revisar em campo',
            'Acesso restrito',
            'Amostragem pendente',
        ];
        const anchors = [...(wellPositions || []), ...(buildingPositions || [])].filter(Boolean);
        const numPosts = randInt(0, 2);
        for (let i = 0; i < numPosts; i++) {
            const elementCounter = nextElementCounter();
            const anchor = anchors.length > 0 ? randChoice(anchors) : inZone(monitoringCenter, zoneSpread * 0.5);
            const x = clamp(anchor.x, halfWidth);
            const z = clamp(anchor.z, halfLength);
            const groundY = syntheticTerrainElevation(x, z, halfWidth, halfLength);
            addElement(
                'post',
                `post-${elementCounter}`,
                'Anotação',
                {
                    position: { x, y: groundY + 3, z },
                    label: POST_NOTES[i % POST_NOTES.length],
                    linkedTo: null,
                },
                hMeta('post'),
            );
        }
    }
}
