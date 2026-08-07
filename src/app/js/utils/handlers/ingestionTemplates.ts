// This file is part of ecbyts/ECBT. AGPL-3.0-only.
// Extracted from app/js/utils/handlers/ingestion.js in ARCH-MONO-001 Phase 6a.
//
// TEMPLATES - static CSV download templates for the ingestion wizard.
// Pure data, no module state, no imports. Consumed by handleDownloadTemplate.
// ----------------------------------------------------------------
// TEMPLATE DOWNLOAD
// ----------------------------------------------------------------

export const TEMPLATES: Record<string, { group: string; filename: string; label: string; csv: string[] }> = {
    // ================================================================
    // AMBIENTAL - Environmental data formats
    // ================================================================
    'edd-r2': {
        group: 'env',
        filename: 'template_epa_edd_r2.csv',
        label: 'EDD R2',
        csv: [
            'sys_loc_code,x_coord,y_coord,loc_type,sys_sample_code,sample_date,sample_matrix_code,chemical_name,cas_rn,result_value,result_unit,detect_flag,analytical_method,reporting_detection_limit',
            'MW-01,583960,4507230,MW,MW-01-20250115,01/15/2025,WG,Benzene,71-43-2,5.2,ug/L,Y,SW846 8260B,1.0',
            'MW-02,583985,4507245,MW,MW-02-20250115,01/15/2025,WG,Benzene,71-43-2,12.8,ug/L,Y,SW846 8260B,1.0',
        ],
    },
    'edd-r3': {
        group: 'env',
        filename: 'template_epa_edd_r3.csv',
        label: 'EDD R3',
        csv: [
            'sys_loc_code,latitude,longitude,loc_type,sys_sample_code,sample_date,matrix,chemical_name,cas_rn,result_value,result_unit,detect_flag,method_name,reporting_limit,task_code',
            'MW-01,39.9526,-75.1652,MW,MW-01-20250115,2025-01-15,WG,Benzene,71-43-2,5.2,ug/L,Y,EPA 8260,1.0,GWMON',
            'MW-02,39.9530,-75.1660,MW,MW-02-20250115,2025-01-15,WG,Lead,7439-92-1,18.5,ug/L,Y,EPA 6010,5.0,GWMON',
        ],
    },
    'edd-r5': {
        group: 'env',
        filename: 'template_epa_edd_r5.csv',
        label: 'EDD R5',
        csv: [
            'sys_loc_code,latitude,longitude,loc_type_code,sys_sample_code,sample_date,matrix_code,param_name,cas_rn,report_result_value,result_unit,detect_flag,analysis_method,method_detection_limit,lab_name',
            'MW-01,41.8781,-87.6298,MW,MW-01-20250115,2025-01-15,WG,Benzene,71-43-2,5.2,ug/L,Y,8260B,0.5,TestLab Inc',
            'MW-02,41.8785,-87.6305,MW,MW-02-20250115,2025-01-15,SO,Arsenic,7440-38-2,22.3,mg/kg,Y,6010B,2.0,TestLab Inc',
        ],
    },
    sedd: {
        group: 'env',
        filename: 'template_sedd.csv',
        label: 'SEDD',
        csv: [
            'sys_loc_code,latitude,longitude,loc_type_code,sys_sample_code,sample_date,matrix_code,analyte_name,cas_rn,result_value,result_unit,detect_flag,analysis_method,mdl,pql,lab_sample_id,lab_name,stage',
            'MW-01,40.7128,-74.0060,MW,MW-01-20250115,2025-01-15,WG,Benzene,71-43-2,5.2,ug/L,Y,EPA 8260,0.3,1.0,LS-001,EnviroLab,Final',
            'MW-02,40.7135,-74.0070,MW,MW-02-20250115,2025-01-15,WG,Toluene,108-88-3,,ug/L,N,EPA 8260,0.5,1.0,LS-002,EnviroLab,Final',
        ],
    },
    'edd-br': {
        group: 'env',
        filename: 'template_edd_br.csv',
        label: 'EDD-BR',
        csv: [
            'cod_ponto,latitude,longitude,tipo_ponto,cod_amostra,data_coleta,matriz,parametro,cas,resultado,unidade,detectado,metodo,limite_quantificacao',
            'PM-01,-23.5505,-46.6333,PM,PM-01-20250115,2025-01-15,AS,Benzeno,71-43-2,5.2,ug/L,S,EPA 8260,1.0',
            'PM-02,-23.5510,-46.6340,PM,PM-02-20250115,2025-01-15,AS,Benzeno,71-43-2,12.8,ug/L,S,EPA 8260,1.0',
        ],
    },
    wqx: {
        group: 'env',
        filename: 'template_wqx.csv',
        label: 'WQX',
        csv: [
            'OrganizationIdentifier,MonitoringLocationIdentifier,MonitoringLocationName,MonitoringLocationTypeName,LatitudeMeasure,LongitudeMeasure,ActivityIdentifier,ActivityStartDate,ActivityMediaName,CharacteristicName,ResultMeasureValue,ResultMeasure/MeasureUnitCode,ResultDetectionConditionText,AnalyticalMethodIdentifier',
            'TESTORG,SITE-01,River Upstream,River/Stream,-23.5505,-46.6333,ACT-001,2025-01-15,Water,Dissolved oxygen (DO),7.2,mg/L,,EPA 360.1',
            'TESTORG,SITE-02,Lake Center,Lake,-23.5510,-46.6340,ACT-002,2025-01-15,Water,pH,6.8,None,,EPA 150.1',
        ],
    },
    sdwis: {
        group: 'env',
        filename: 'template_sdwis.csv',
        label: 'SDWIS',
        csv: [
            'PWS_ID,PWS_Name,Facility_ID,Sample_Point_ID,Sample_ID,Collection_Date,Analyte_Code,Analyte_Name,Concentration,Unit,MCL,Method,Compliance_Status',
            'TX1234567,City Water Supply,FAC-01,SP-01,S-20250115,2025-01-15,1005,Arsenic,8.5,ug/L,10,EPA 200.8,Compliant',
            'TX1234567,City Water Supply,FAC-01,SP-02,S-20250116,2025-01-16,2987,Lead,12.3,ug/L,15,EPA 200.8,Compliant',
        ],
    },
    equis: {
        group: 'env',
        filename: 'template_equis.csv',
        label: 'EQuIS',
        csv: [
            'sys_loc_code,loc_name,loc_type,latitude,longitude,sys_sample_code,sample_name,sample_date,start_depth,end_depth,matrix_code,analytic_method,chemical_name,cas_rn,result_value,result_unit,detect_flag,reporting_detection_limit,lab_qualifiers,lab_name_code',
            'MW-01,Monitor Well 1,MW,39.9526,-75.1652,MW01-20250115,MW-01 GW,2025-01-15,3.0,3.5,WG,SW8260B,Benzene,71-43-2,5.2,ug/L,Y,1.0,,TestLab',
            'SB-01,Soil Boring 1,SB,39.9530,-75.1660,SB01-20250115,SB-01 5ft,2025-01-15,1.0,2.0,SO,SW8260B,Toluene,108-88-3,0.85,mg/kg,Y,0.1,,TestLab',
        ],
    },
    esdat: {
        group: 'env',
        filename: 'template_esdat.csv',
        label: 'ESdat',
        csv: [
            'Location_ID,Location_Name,Location_Type,Easting,Northing,Coord_System,Sample_ID,Sample_Date,Matrix,Depth_From,Depth_To,ChemName,CAS_Number,Result,Result_Unit,LOR,Method_Type,Total_or_Filtered,Lab_Name',
            'BH-01,Borehole 1,Bore,321450,6248900,MGA56,BH01-20250115,2025-01-15,Soil,0.5,1.0,Benzene,71-43-2,0.45,mg/kg,0.05,8260B,Total,ALS',
            'MW-01,Monitor Well 1,Well,321455,6248910,MGA56,MW01-20250115,2025-01-15,Water,3.0,3.5,Benzene,71-43-2,8.3,ug/L,1.0,8260B,Total,ALS',
        ],
    },
    erpims: {
        group: 'env',
        filename: 'template_erpims.csv',
        label: 'ERPIMS',
        csv: [
            'installation_name,operable_unit,site_name,location_id,location_type,latitude,longitude,sample_id,sample_date,matrix,depth_top,depth_bottom,analyte_name,cas_number,result,units,detect_flag,method,mdl,pql',
            'Fort Example,OU-1,Landfill Area,MW-01,MW,35.1234,-79.5678,MW01-20250115,2025-01-15,WG,3.0,3.5,TCE,79-01-6,45.2,ug/L,Y,8260B,0.5,1.0',
            'Fort Example,OU-1,Landfill Area,MW-02,MW,35.1240,-79.5685,MW02-20250115,2025-01-15,WG,3.0,3.5,PCE,127-18-4,,ug/L,N,8260B,0.5,1.0',
        ],
    },
    adam: {
        group: 'env',
        filename: 'template_adam.csv',
        label: 'ADaM',
        csv: [
            'project_code,site_id,location_id,sample_id,sample_date,matrix,fraction,prep_method,analytical_method,cas_number,analyte,result_value,result_qualifier,result_unit,mdl,rl,dilution_factor,lab_id,batch_id',
            'PROJ-001,SITE-A,MW-01,MW01-20250115,2025-01-15,Water,Dissolved,3510C,8260B,71-43-2,Benzene,5.2,,ug/L,0.3,1.0,1,LAB-001,B-2025-001',
            'PROJ-001,SITE-A,MW-01,MW01-20250115,2025-01-15,Water,Dissolved,3510C,8260B,108-88-3,Toluene,,U,ug/L,0.5,1.0,1,LAB-001,B-2025-001',
        ],
    },
    lims: {
        group: 'env',
        filename: 'template_lims_export.csv',
        label: 'LIMS',
        csv: [
            'lab_sample_id,client_sample_id,client_name,project_id,sample_date,received_date,matrix,prep_method,analytical_method,analyte,cas_number,result,qualifier,units,mdl,rl,dilution,batch_id,analyst,analysis_date',
            'LS-20250115-001,MW-01-GW,EnviroCo,PROJ-001,2025-01-15,2025-01-17,Water,3510C,SW8260B,Benzene,71-43-2,5.2,,ug/L,0.3,1.0,1,BATCH-001,JSmith,2025-01-20',
            'LS-20250115-001,MW-01-GW,EnviroCo,PROJ-001,2025-01-15,2025-01-17,Water,3510C,SW8260B,Toluene,108-88-3,,U,ug/L,0.5,1.0,1,BATCH-001,JSmith,2025-01-20',
        ],
    },
    sensorthings: {
        group: 'env',
        filename: 'template_ogc_sensorthings.csv',
        label: 'SensorThings',
        csv: [
            'Thing_name,Thing_description,Location_name,Location_latitude,Location_longitude,Datastream_name,ObservedProperty_name,ObservedProperty_definition,Sensor_name,phenomenonTime,result,resultQuality,unitOfMeasurement_name,unitOfMeasurement_symbol',
            'Station-01,Groundwater monitoring well,Site Alpha,-23.5505,-46.6333,GW Level,Water Table Elevation,http://vocabulary.odm2.org/variable/waterTableElevation,Pressure Transducer,2025-01-15T10:00:00Z,523.45,good,m,m',
            'Station-01,Groundwater monitoring well,Site Alpha,-23.5505,-46.6333,GW Temp,Water Temperature,http://vocabulary.odm2.org/variable/temperature,Thermistor,2025-01-15T10:00:00Z,22.3,good,Celsius,degC',
        ],
    },
    waterml: {
        group: 'env',
        filename: 'template_waterml.csv',
        label: 'WaterML',
        csv: [
            'site_code,site_name,latitude,longitude,variable_code,variable_name,unit_name,unit_abbreviation,sample_medium,value_type,date_time,value,quality_control_level,method_description,source_organization',
            'USGS-01234567,Rio Tiete Upstream,-23.5505,-46.6333,00060,Streamflow,cubic feet per second,cfs,Surface Water,Derived Value,2025-01-15T12:00:00,125.3,Quality controlled,Acoustic Doppler,USGS',
            'USGS-01234567,Rio Tiete Upstream,-23.5505,-46.6333,00010,Temperature,degrees Celsius,degC,Surface Water,Field Observation,2025-01-15T12:00:00,22.1,Quality controlled,YSI EXO2 Sonde,USGS',
        ],
    },
    geosciml: {
        group: 'env',
        filename: 'template_geosciml.csv',
        label: 'GeoSciML',
        csv: [
            'borehole_id,borehole_name,latitude,longitude,elevation_m,total_depth_m,interval_top_m,interval_bottom_m,lithology_code,lithology_description,geological_unit,age_era,color,grain_size,moisture,weathering_grade',
            'BH-01,Borehole Alpha,-23.5505,-46.6333,750.2,30.0,0.0,2.0,FILL,Anthropic fill,Quaternary deposits,Quaternary,Brown,Mixed,Moist,W5',
            'BH-01,Borehole Alpha,-23.5505,-46.6333,750.2,30.0,2.0,8.5,CLAY,Stiff brown clay,Sao Paulo Formation,Tertiary,Reddish brown,Clay,Moist,W3',
        ],
    },
    ecbyts: {
        group: 'env',
        filename: 'template_ecbyts.csv',
        label: 'ecbyts',
        csv: [
            'elementName,family,latitude,longitude,sampleCode,sampleDate,chemicalName,casNumber,resultValue,resultUnit,detectFlag',
            'MW-01,well,-23.5505,-46.6333,MW-01-20250115,2025-01-15,Benzene,71-43-2,5.2,ug/L,Y',
            'MW-02,well,-23.5510,-46.6340,MW-02-20250115,2025-01-15,Benzene,71-43-2,12.8,ug/L,Y',
        ],
    },
    // ================================================================
    // OCUPACIONAL - OHS data formats
    // ================================================================
    'ohs-aiha': {
        group: 'ohs',
        filename: 'template_ohs_aiha.csv',
        label: 'AIHA',
        csv: [
            'worker_id,worker_name,ghe,job_title,department,agent_name,cas_rn,twa_8h,stel,oel,sample_type,exposure_route,ppe_status,sample_date',
            'W001,Joao Silva,GHE-01,Operador,Producao,Benzene,71-43-2,2.5,,1.0,personal,inhalation,full,2025-01-15',
            'A001,,GHE-02,,Manutencao,Noise,,92,,85,area,noise,,2025-01-15',
        ],
    },
    'ohs-doehrs': {
        group: 'ohs',
        filename: 'template_ohs_doehrs.csv',
        label: 'DOEHRS',
        csv: [
            'ssn_last4,ghe_code,agent_name,cas_rn,result,result_unit,oel,sample_type,exposure_route,duration_hours,sample_date,installation',
            '1234,GHE-A01,Benzene,71-43-2,0.8,ppm,1.0,personal,inhalation,8,2025-01-15,Fort Bragg',
            '9012,GHE-B02,Noise,,88,dBA,85,area,noise,8,2025-01-15,Fort Bragg',
        ],
    },
    'ohs-oel': {
        group: 'ohs',
        filename: 'template_oel_edd.csv',
        label: 'OEL-EDD',
        csv: [
            'cas_rn,agent_name,tlv_twa,tlv_stel,tlv_ceiling,tlv_unit,pel_twa,pel_unit,rel_twa,rel_stel,rel_unit,oeb_band,source,year,notation',
            '71-43-2,Benzene,0.5,2.5,,ppm,1.0,ppm,0.1,,ppm,4,ACGIH/OSHA/NIOSH,2024,A1 Skin',
            '108-88-3,Toluene,20,,,,200,ppm,100,150,ppm,2,ACGIH/OSHA/NIOSH,2024,',
            '7440-38-2,Arsenic,0.01,,,mg/m3,0.01,mg/m3,0.002,,mg/m3,5,ACGIH/OSHA/NIOSH,2024,A1',
        ],
    },
    'ohs-sds': {
        group: 'ohs',
        filename: 'template_sds_ghs.csv',
        label: 'SDS/GHS',
        csv: [
            'product_name,cas_rn,supplier,ghs_classification,hazard_statements,precautionary_statements,signal_word,pictograms,oel_twa,oel_stel,oel_unit,flash_point_c,boiling_point_c,ld50_oral_mg_kg,lc50_inhalation_mg_L,first_aid_inhalation,ppe_required',
            'Benzene,71-43-2,LabChem Inc,Flam. Liq. 2; Carc. 1A; Muta. 1B,H225 H350 H340,P201 P210 P280,Danger,GHS02 GHS08,0.5,,ppm,−11,80.1,930,13.7,Move to fresh air,Gloves + respiratory protection',
            'Toluene,108-88-3,SigmaAldrich,Flam. Liq. 2; Repr. 2,H225 H361d,P210 P280,Danger,GHS02 GHS08,20,,ppm,4,111,636,12.5,Move to fresh air,Chemical splash goggles + gloves',
        ],
    },
    'ohs-oeb': {
        group: 'ohs',
        filename: 'template_oeb.csv',
        label: 'OEB',
        csv: [
            'compound_name,cas_rn,oeb_band,oel_range_low,oel_range_high,oel_unit,basis,toxicity_endpoints,containment_required,ppe_minimum,source',
            'Compound A,12345-67-8,1,1000,,ug/m3,Low acute toxicity,LD50 > 2000 mg/kg,Standard ventilation,Safety glasses,Internal assessment',
            'Compound B,98765-43-2,4,1,10,ug/m3,Reproductive toxicant,NOAEL 0.5 mg/kg/day,Isolator or closed system,Full suit + SCBA,Internal assessment',
            'Compound C,11111-22-3,5,,1,ug/m3,Potent carcinogen,Genotoxic,Negative pressure isolator,Full containment,Internal assessment',
        ],
    },
    'ohs-nr15': {
        group: 'ohs',
        filename: 'template_ohs_nr15.csv',
        label: 'NR-15',
        csv: [
            'matricula,nome_funcionario,cargo,setor,agente,nivel,limite_tolerancia,grau_insalubridade,epi,data_medicao',
            '12345,Joao Silva,Operador,Producao,Ruido Continuo,92 dBA,85 dBA,medio,protetor auricular,2025-01-15',
            '12346,Maria Santos,Tecnico,Laboratorio,Benzeno,2.5 mg/m3,1.0 mg/m3,maximo,mascara PFF2,2025-01-15',
        ],
    },
    'ohs-ppra': {
        group: 'ohs',
        filename: 'template_ohs_ppra_pgr.csv',
        label: 'PPRA/PGR',
        csv: [
            'setor,ghe,risco,agente,fonte,probabilidade,severidade,nivel_risco,medida_controle,responsavel',
            'Producao,GHE-01,Quimico,Benzeno,Tanque armazenamento,3,4,12,Ventilacao + EPI,Eng. Seguranca',
            'Manutencao,GHE-02,Fisico,Ruido,Compressor,4,3,12,Protetor auricular,Eng. Seguranca',
        ],
    },
    'ohs-pcmso': {
        group: 'ohs',
        filename: 'template_ohs_pcmso.csv',
        label: 'PCMSO',
        csv: [
            'matricula,nome_funcionario,cargo,setor,tipo_exame,data_exame,resultado,apto,observacao',
            '12345,Joao Silva,Operador,Producao,admissional,2025-01-10,normal,sim,',
            '12346,Maria Santos,Tecnico,Laboratorio,periodico,2025-01-15,alterado,sim,Acompanhar hemograma',
        ],
    },
    'ohs-bio': {
        group: 'ohs',
        filename: 'template_ohs_bei.csv',
        label: 'BEI/IBMP',
        csv: [
            'patient_id,patient_name,specimen,analyte,cas_rn,result,result_unit,bei,method,sample_date,ghe',
            'W001,Joao Silva,urine,Hippuric Acid,,1.2,g/g creat.,1.6,HPLC,2025-01-15,GHE-01',
            'W001,Joao Silva,blood,Lead,7439-92-1,18,ug/dL,30,AAS,2025-01-15,GHE-01',
        ],
    },
    'ohs-icd': {
        group: 'ohs',
        filename: 'template_icd10_icd11.csv',
        label: 'ICD-10/11',
        csv: [
            'patient_id,patient_name,icd_version,icd_code,diagnosis_description,diagnosis_date,diagnosis_type,severity,body_system,occupational_related,causal_agent,department,physician',
            'W001,Joao Silva,ICD-10,J68.0,Chemical bronchitis due to fumes,2025-01-15,Primary,Moderate,Respiratory,Yes,Chlorine gas,Producao,Dr. Santos',
            'W002,Maria Santos,ICD-10,H83.3,Noise-induced hearing loss,2025-02-10,Primary,Mild,Ear,Yes,Occupational noise >85dBA,Manutencao,Dr. Oliveira',
        ],
    },
    'ohs-chad': {
        group: 'ohs',
        filename: 'template_chad.csv',
        label: 'CHAD',
        csv: [
            'person_id,age,sex,activity_code,activity_description,location_code,location_description,start_time,duration_minutes,microenvironment,ventilation,temperature_c,relative_humidity_pct,co_exposure_ppm,pm25_ug_m3',
            'P001,35,M,12100,Work - Manufacturing,31000,Industrial building,08:00,480,Indoor-industrial,Mechanical,25,60,2.1,45.3',
            'P002,42,F,12200,Work - Office,32000,Commercial building,09:00,480,Indoor-office,HVAC,23,45,0.5,12.1',
        ],
    },
    // ================================================================
    // CLASSIFICACAO - Reference/lookup tables
    // ================================================================
    'ref-soc': {
        group: 'ref',
        filename: 'template_soc_codes.csv',
        label: 'SOC',
        csv: [
            'soc_code,soc_title,major_group,minor_group,broad_occupation,detailed_occupation,cbo_equivalent,typical_exposure_agents,typical_oeb',
            '51-9011,Chemical Equipment Operators,51-0000 Production,51-9000 Other Production,51-9010 Chemical Processing,51-9011 Chemical Equipment Operators and Tenders,8116-05,Solvents/Acids/Bases,2-3',
            '47-2152,Plumbers,47-0000 Construction,47-2000 Construction Trades,47-2150 Pipelayers and Plumbers,47-2152 Plumbers Pipefitters and Steamfitters,7241-05,Lead/Asbestos/Solvents,2-4',
        ],
    },
    'ref-naics': {
        group: 'ref',
        filename: 'template_naics_sic.csv',
        label: 'NAICS/SIC',
        csv: [
            'naics_code,naics_title,sic_code,sic_title,cnae_code,cnae_title,risk_level,typical_hazards,osha_recordable_rate,fatality_rate_per_100k',
            '324110,Petroleum Refineries,2911,Petroleum Refining,19210,Fabricacao de produtos do refino de petroleo,High,Fire/Explosion/H2S/Benzene/VOC,2.1,3.5',
            '327310,Cement Manufacturing,3241,Cement Hydraulic,23427,Fabricacao de cimento,High,Silica/Noise/Heat/Dust,3.8,2.1',
        ],
    },
    'ref-tlv': {
        group: 'ref',
        filename: 'template_tlv_pel_rel.csv',
        label: 'TLV/PEL/REL',
        csv: [
            'cas_rn,substance,acgih_tlv_twa,acgih_tlv_stel,acgih_tlv_unit,acgih_notation,osha_pel_twa,osha_pel_unit,niosh_rel_twa,niosh_rel_stel,niosh_rel_unit,niosh_idlh,nr15_lt,nr15_unit,nr15_grau',
            '71-43-2,Benzene,0.5,2.5,ppm,A1 Skin,1,ppm,0.1,,ppm,500,1.0,ppm,maximo',
            '7439-92-1,Lead,0.05,,mg/m3,A3,0.05,mg/m3,0.05,,mg/m3,100,0.1,mg/m3,medio',
            '14808-60-7,Silica (quartz),0.025,,mg/m3,A2,0.05,mg/m3,0.05,,mg/m3,25,0.05,mg/m3,maximo',
        ],
    },
    // ================================================================
    // GHG / ESG - Greenhouse Gas & Sustainability
    // ================================================================
    'ghg-protocol': {
        group: 'ghg',
        filename: 'template_ghg_protocol.csv',
        label: 'GHG Protocol',
        csv: [
            'ano,organizacao,setor,escopo,categoria,fonte_emissao,combustivel_atividade,quantidade,unidade,fator_emissao_co2,fator_emissao_ch4,fator_emissao_n2o,emissao_co2_t,emissao_ch4_t,emissao_n2o_t,emissao_co2e_t,metodo_calculo,fonte_fe',
            '2025,Empresa ABC,Industria,Escopo 1,Combustao Estacionaria,Caldeira,Gas Natural,150000,m3,2.1482,0.0001,0.0001,322.23,0.015,0.015,327.01,IPCC 2006,MCT Brasil',
            '2025,Empresa ABC,Industria,Escopo 1,Combustao Movel,Frota Diesel,Oleo Diesel,80000,litros,2.6030,0.0001,0.0001,208.24,0.008,0.008,211.42,IPCC 2006,MCT Brasil',
            '2025,Empresa ABC,Industria,Escopo 2,Energia Eletrica,Grid Nacional,Eletricidade,500000,kWh,0.0578,,,28.90,,,28.90,Localizacao,SIN 2024',
            '2025,Empresa ABC,Industria,Escopo 3,Viagens a Negocios,Aereo,Voo Domestico,25000,km,,,,,,,,DEFRA 2024,DEFRA',
        ],
    },
};
