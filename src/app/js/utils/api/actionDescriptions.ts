// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under AGPL-3.0-only

/* ================================================================
   ACTION DESCRIPTIONS — gerado por swarm OpenRouter (gemma4)
   453 descrições em pt-BR/en-US/es-LA para ACTION_REGISTRY actions.
   Usado pelo System Catalog modal para exibir descrição rica.

   Regenerar: npm run swarm:generic -- --activity=api-descriptions \
              --items-from=.runtime/api-actions-list.txt \
              --prompt-template=.runtime/api-desc-prompt.md \
              --route=gemma4 --concurrency=16 --execute
   Run: 2026-05-14T21:44:17.896Z
   ================================================================ */

interface ActionDescription { pt: string; en: string; es: string; }
export const ACTION_DESCRIPTIONS: Readonly<Record<string, ActionDescription>> = Object.freeze({
    handleAddElement: {
        pt: 'Adiciona um novo elemento ambiental ao modelo (poço, plume, etc.).',
        en: 'Adds a new environmental element to the model (well, plume, etc.).',
        es: 'Agrega un nuevo elemento ambiental al modelo (pozo, plume, etc.).',
    },
    handleRemoveElement: {
        pt: 'Remove um elemento do modelo 3D (poço, sensor ou área de contaminação).',
        en: 'Removes an element from the 3D model (well, sensor, or plume).',
        es: 'Elimina un elemento del modelo 3D (pozo, sensor o pluma).',
    },
    handleSelectElement: {
        pt: 'Seleciona um elemento específico no modelo 3D para inspeção.',
        en: 'Selects a specific element in the 3D model for inspection.',
        es: 'Selecciona un elemento específico en el modelo 3D para inspección.',
    },
    handleToggleVisibility: {
        pt: 'Alterna a visibilidade de um elemento no modelo 3D.',
        en: 'Toggles the visibility of an element in the 3D model.',
        es: 'Alterna la visibilidad de un elemento en el modelo 3D.',
    },
    handleElementFieldChange: {
        pt: 'Atualiza um campo de um elemento ambiental no modelo 3D.',
        en: 'Updates a field of an environmental element in the 3D model.',
        es: 'Actualiza un campo de un elemento ambiental en el modelo 3D.',
    },
    handleElementTransform: {
        pt: 'Transforma propriedades de um elemento (posição, escala ou rotação) no modelo.',
        en: 'Transforms element properties (position, scale, or rotation) in the model.',
        es: 'Transforma propiedades de un elemento (posición, escala o rotación) en el modelo.',
    },
    handleAddObservation: {
        pt: 'Adiciona uma nova observação ambiental a um elemento específico.',
        en: 'Adds a new environmental observation to a specific element.',
        es: 'Agrega una nueva observación ambiental a un elemento específico.',
    },
    handleObservationChange: {
        pt: 'Atualiza um parâmetro de uma observação ambiental no modelo.',
        en: 'Updates an environmental observation parameter in the model.',
        es: 'Actualiza un parámetro de una observación ambiental en el modelo.',
    },
    handleRemoveObservation: {
        pt: 'Remove uma observação ambiental específica do elemento.',
        en: 'Removes a specific environmental observation from the element.',
        es: 'Elimina una observación ambiental específica del elemento.',
    },
    handleObservationParameterChange: {
        pt: 'Altera um parâmetro de uma observação ambiental específica.',
        en: 'Changes a parameter of a specific environmental observation.',
        es: 'Cambia un parámetro de una observación ambiental específica.',
    },
    handleAddAdditionalReading: {
        pt: 'Adiciona uma nova leitura de observação ao elemento selecionado.',
        en: 'Adds a new observation reading to the selected element.',
        es: 'Agrega una nueva lectura de observación al elemento seleccionado.',
    },
    handleRemoveAdditionalReading: {
        pt: 'Remove uma leitura adicional de uma observação ambiental.',
        en: 'Removes an additional reading from an environmental observation.',
        es: 'Elimina una lectura adicional de una observación ambiental.',
    },
    handleReadingChange: {
        pt: 'Atualiza um valor de leitura em uma observação ambiental específica.',
        en: 'Updates a reading value in a specific environmental observation.',
        es: 'Actualiza un valor de lectura en una observación ambiental específica.',
    },
    handleUnitChange: {
        pt: 'Altera a unidade de medida de uma observação ambiental específica.',
        en: 'Changes the measurement unit of a specific environmental observation.',
        es: 'Cambia la unidad de medida de una observación ambiental específica.',
    },
    handleAddQualField: {
        pt: 'Adiciona um campo de parâmetro qualitativo a uma observação.',
        en: 'Adds a qualitative parameter field to an observation.',
        es: 'Agrega un campo de parámetro cualitativo a una observación.',
    },
    handleRemoveQualField: {
        pt: 'Remove um campo de observação qualitativa de um elemento monitorado.',
        en: 'Removes a qualitative observation field from a monitored element.',
        es: 'Elimina un campo de observación cualitativa de un elemento monitoreado.',
    },
    handleQualFieldChange: {
        pt: 'Atualiza um campo de observação qualitativa de um elemento monitorado.',
        en: 'Updates a qualitative observation field for a monitored element.',
        es: 'Actualiza un campo de observación cualitativa de un elemento monitoreado.',
    },
    handleAddCampaign: {
        pt: 'Adiciona uma nova campanha de monitoramento ambiental.',
        en: 'Adds a new environmental monitoring campaign.',
        es: 'Agrega una nueva campaña de monitoreo ambiental.',
    },
    handleCampaignChange: {
        pt: 'Atualiza um campo específico de uma campanha de monitoramento ambiental.',
        en: 'Updates a specific field of an environmental monitoring campaign.',
        es: 'Actualiza un campo específico de una campaña de monitoreo ambiental.',
    },
    handleCampaignVisibility: {
        pt: 'Alterna a visibilidade de uma campanha de monitoramento no modelo.',
        en: 'Toggles the visibility of a monitoring campaign in the model.',
        es: 'Alterna la visibilidad de una campaña de monitoreo en el modelo.',
    },
    handleRemoveCampaign: {
        pt: 'Remove uma campanha de monitoramento ambiental.',
        en: 'Removes an environmental monitoring campaign.',
        es: 'Elimina una campaña de monitoreo ambiental.',
    },
    handleAddScene: {
        pt: 'Adiciona uma nova cena de monitoramento ou visualização 3D.',
        en: 'Adds a new monitoring scene or 3D visualization.',
        es: 'Agrega una nueva escena de monitoreo o visualización 3D.',
    },
    handleSceneChange: {
        pt: 'Altera a cena ou visualização do modelo 3D ambiental.',
        en: 'Changes the environmental 3D model scene or view.',
        es: 'Cambia la escena o visualización del modelo 3D ambiental.',
    },
    handleCaptureViewStart: {
        pt: 'Inicia a captura da visualização da cena 3D para monitoramento.',
        en: 'Starts the 3D scene view capture for environmental monitoring.',
        es: 'Inicia la captura de la vista de la escena 3D para monitoreo.',
    },
    handleCaptureViewEnd: {
        pt: 'Finaliza a captura da visualização atual da cena 3D.',
        en: 'Finalizes the current 3D scene view capture.',
        es: 'Finaliza la captura de la vista actual de la escena 3D.',
    },
    handleApplyViewStart: {
        pt: 'Inicia a visualização da cena 3D para monitoramento ambiental.',
        en: 'Starts the 3D scene view for environmental monitoring.',
        es: 'Inicia la vista de la escena 3D para monitoreo ambiental.',
    },
    handleApplyViewEnd: {
        pt: 'Aplica o encerramento da visualização da cena 3D.',
        en: 'Applies the end of the 3D scene view.',
        es: 'Aplica el cierre de la vista de la escena 3D.',
    },
    handleRemoveScene: {
        pt: 'Remove uma cena de monitoramento ou modelo 3D do projeto.',
        en: 'Removes a monitoring scene or 3D model from the project.',
        es: 'Elimina una escena de monitoreo o modelo 3D del proyecto.',
    },
    setIsometricView: {
        pt: 'Alterna a visualização do modelo 3D para a perspectiva isométrica.',
        en: 'Toggles the 3D model view to isometric perspective.',
        es: 'Alterna la vista del modelo 3D a perspectiva isométrica.',
    },
    setTopView: {
        pt: 'Altera a visualização da câmera para a vista superior do modelo 3D.',
        en: 'Sets the camera view to the top-down perspective of the 3D model.',
        es: 'Cambia la vista de la cámara a la perspectiva superior del modelo 3D.',
    },
    setFrontView: {
        pt: 'Ajusta a câmera para a vista frontal do modelo 3D.',
        en: 'Sets the camera to the front view of the 3D model.',
        es: 'Ajusta la cámara a la vista frontal del modelo 3D.',
    },
    zoomIn: {
        pt: 'Aproxima a visualização da cena 3D para inspeção detalhada.',
        en: 'Zooms into the 3D scene for detailed inspection.',
        es: 'Acerca la visualización de la escena 3D para inspección detallada.',
    },
    zoomOut: {
        pt: 'Afasta a visualização da câmera no modelo 3D ambiental.',
        en: 'Zooms out the camera view in the environmental 3D model.',
        es: 'Aleja la vista de la cámara en el modelo 3D ambiental.',
    },
    resetView: {
        pt: 'Redefine a visualização da câmera para o enquadramento padrão do modelo.',
        en: "Resets the camera view to the model's default framing.",
        es: 'Restablece la vista de cámara al encuadre predeterminado del modelo.',
    },
    switchRibbonTab: {
        pt: 'Alterna a aba da barra de ferramentas da interface de monitoramento.',
        en: 'Switches the toolbar tab in the monitoring interface.',
        es: 'Cambia la pestaña de la barra de herramientas de la interfaz.',
    },
    setLanguage: {
        pt: 'Altera o idioma da interface do sistema ECBT.',
        en: 'Changes the ECBT system interface language.',
        es: 'Cambia el idioma de la interfaz del sistema ECBT.',
    },
    toggleLeftPanel: {
        pt: 'Alterna a visibilidade do painel lateral de controle da interface.',
        en: 'Toggles the visibility of the interface control side panel.',
        es: 'Alterna la visibilidad del panel lateral de control de la interfaz.',
    },
    toggleRightPanel: {
        pt: 'Alterna a visibilidade do painel lateral de controle e monitoramento.',
        en: 'Toggles the visibility of the monitoring and control side panel.',
        es: 'Alterna la visibilidad del panel lateral de control y monitoreo.',
    },
    toggleAnalyticsFullscreen: {
        pt: 'Alterna o modo tela cheia dos painéis de análise de dados ambientais.',
        en: 'Toggles fullscreen mode for environmental data analytics panels.',
        es: 'Alterna el modo pantalla completa de los paneles de análisis ambiental.',
    },
    closeModal: {
        pt: 'Fecha o modal de interface atual.',
        en: 'Closes the current UI modal.',
        es: 'Cierra el modal de interfaz actual.',
    },
    openExportModal: {
        pt: 'Abre o modal para exportação de dados e relatórios ambientais.',
        en: 'Opens the modal to export environmental data and reports.',
        es: 'Abre el modal para exportar datos e informes ambientales.',
    },
    openImportModal: {
        pt: 'Abre o modal para importação de dados ambientais ou modelos 3D.',
        en: 'Opens the modal to import environmental data or 3D models.',
        es: 'Abre el modal para importar datos ambientales o modelos 3D.',
    },
    copyExportKey: {
        pt: 'Copia a chave de exportação de dados do modelo ambiental.',
        en: 'Copies the environmental model data export key.',
        es: 'Copia la clave de exportación de datos del modelo ambiental.',
    },
    copyShareURL: {
        pt: 'Copia a URL de compartilhamento da visualização do Digital Twin.',
        en: 'Copies the Digital Twin view sharing URL.',
        es: 'Copia la URL de compartir la visualización del Digital Twin.',
    },
    downloadKey: {
        pt: 'Baixa a chave de acesso para autenticação ou criptografia de dados.',
        en: 'Downloads the access key for data authentication or encryption.',
        es: 'Descarga la clave de acceso para autenticación o cifrado de datos.',
    },
    onExportFormatChange: {
        pt: 'Altera o formato de exportação dos dados do modelo ambiental.',
        en: 'Changes the export format for the environmental model data.',
        es: 'Cambia el formato de exportación de los datos del modelo ambiental.',
    },
    openFamilyManager: {
        pt: 'Abre o gerenciador de famílias de elementos do modelo 3D.',
        en: 'Opens the 3D model element family manager.',
        es: 'Abre el gestor de familias de elementos del modelo 3D.',
    },
    handleFamilyToggle: {
        pt: 'Alterna a visibilidade de uma família de elementos no modelo 3D.',
        en: 'Toggles the visibility of an element family in the 3D model.',
        es: 'Alterna la visibilidad de una familia de elementos en el modelo 3D.',
    },
    handleFamilyDelete: {
        pt: 'Remove uma família de elementos do modelo 3D.',
        en: 'Removes a family of elements from the 3D model.',
        es: 'Elimina una familia de elementos del modelo 3D.',
    },
    addCustomFamily: {
        pt: 'Adiciona uma nova família de objetos customizados ao modelo 3D.',
        en: 'Adds a new custom object family to the 3D model.',
        es: 'Agrega una nueva familia de objetos personalizados al modelo 3D.',
    },
    handleAddProjectArea: {
        pt: 'Adiciona uma nova área de projeto ao monitoramento ambiental.',
        en: 'Adds a new project area to the environmental monitoring.',
        es: 'Agrega una nueva área de proyecto al monitoreo ambiental.',
    },
    handleRemoveProjectArea: {
        pt: 'Remove uma área de projeto do monitoramento ambiental.',
        en: 'Removes a project area from environmental monitoring.',
        es: 'Elimina un área de proyecto del monitoreo ambiental.',
    },
    handleProjectAreaChange: {
        pt: 'Altera o campo de uma área do projeto no modelo digital.',
        en: 'Changes a project area field within the digital model.',
        es: 'Cambia un campo de área del proyecto en el modelo digital.',
    },
    handleAddInputLink: {
        pt: 'Adiciona um novo link de entrada de dados ao projeto.',
        en: 'Adds a new data input link to the project.',
        es: 'Agrega un nuevo enlace de entrada de datos al proyecto.',
    },
    handleAddOutputLink: {
        pt: 'Adiciona um link de saída ao projeto ou relatório ambiental.',
        en: 'Adds an output link to the environmental project or report.',
        es: 'Agrega un enlace de salida al proyecto o informe ambiental.',
    },
    handleRemoveInputLink: {
        pt: 'Remove o vínculo de um modelo de entrada do projeto.',
        en: 'Removes an input model link from the project.',
        es: 'Elimina el vínculo de un modelo de entrada del proyecto.',
    },
    handleRemoveOutputLink: {
        pt: 'Remove o vínculo de saída de um modelo vinculado ao projeto.',
        en: 'Removes the output link of a model linked to the project.',
        es: 'Elimina el vínculo de salida de un modelo vinculado al proyecto.',
    },
    generateRandomModel: {
        pt: 'Gera um modelo ambiental aleatório para testes de visualização 3D.',
        en: 'Generates a random environmental model for 3D visualization testing.',
        es: 'Genera un modelo ambiental aleatorio para pruebas de visualización 3D.',
    },
    handleClearModel: {
        pt: 'Limpa todos os dados e elementos do modelo 3D atual.',
        en: 'Clears all data and elements from the current 3D model.',
        es: 'Limpia todos los datos y elementos del modelo 3D actual.',
    },
    handleUndo: {
        pt: 'Desfaz a última alteração realizada no modelo ou cenário.',
        en: 'Undoes the last change made to the model or scene.',
        es: 'Deshace el último cambio realizado en el modelo o escena.',
    },
    handleRedo: {
        pt: 'Refaz a última ação realizada no modelo ou na interface.',
        en: 'Redoes the last action performed in the model or interface.',
        es: 'Rehace la última acción realizada en el modelo o interfaz.',
    },
    handleCopyElement: {
        pt: 'Duplica um elemento selecionado no modelo 3D.',
        en: 'Duplicates a selected element in the 3D model.',
        es: 'Duplica un elemento seleccionado en el modelo 3D.',
    },
    handlePasteElement: {
        pt: 'Cola um elemento de modelo previamente copiado no ambiente 3D.',
        en: 'Pastes a previously copied model element into the 3D environment.',
        es: 'Pega un elemento de modelo previamente copiado en el entorno 3D.',
    },
    newProject: {
        pt: 'Inicia um novo projeto de Digital Twin ambiental.',
        en: 'Starts a new environmental Digital Twin project.',
        es: 'Inicia un nuevo proyecto de Digital Twin ambiental.',
    },
    handleOpenPresentationModal: {
        pt: 'Abre o modal de apresentação do Digital Twin ambiental.',
        en: 'Opens the environmental Digital Twin presentation modal.',
        es: 'Abre el modal de presentación del Digital Twin ambiental.',
    },
    getStorageUsage: {
        pt: 'Consulta o uso de armazenamento de dados do modelo digital.',
        en: 'Queries the data storage usage of the digital twin model.',
        es: 'Consulta el uso de almacenamiento de datos del modelo digital.',
    },
    getStorageBreakdown: {
        pt: 'Obtém o detalhamento do uso de armazenamento de dados do projeto.',
        en: 'Retrieves the breakdown of project data storage usage.',
        es: 'Obtiene el desglose del uso de almacenamiento de datos del proyecto.',
    },
    clearModelData: {
        pt: 'Limpa todos os dados do modelo 3D e parâmetros ambientais.',
        en: 'Clears all 3D model data and environmental parameters.',
        es: 'Limpia todos los datos del modelo 3D y parámetros ambientales.',
    },
    clearWorkspace: {
        pt: 'Limpa o espaço de trabalho e remove os dados da cena atual.',
        en: 'Clears the workspace and removes all current scene data.',
        es: 'Limpia el espacio de trabajo y elimina los datos de la escena.',
    },
    isEphemeral: {
        pt: 'Verifica se o dado ou elemento de monitoramento é temporário.',
        en: 'Checks if the monitoring data or element is ephemeral.',
        es: 'Verifica si el dato o elemento de monitoreo es efímero.',
    },
    updateAnalyticsData: {
        pt: 'Atualiza os dados analíticos de monitoramento e modelos ambientais.',
        en: 'Updates monitoring analytics data and environmental models.',
        es: 'Actualiza los datos analíticos de monitoreo y modelos ambientales.',
    },
    openLLMChat: {
        pt: 'Abre o chat de IA para análise de dados ambientais e conformidade.',
        en: 'Opens the AI chat for environmental data and compliance analysis.',
        es: 'Abre el chat de IA para análisis de datos ambientales y cumplimiento.',
    },
    closeLLMChat: {
        pt: 'Fecha o chat de assistência por LLM do sistema.',
        en: "Closes the system's LLM assistance chat.",
        es: 'Cierra el chat de asistencia por LLM del sistema.',
    },
    openLLMConfig: {
        pt: 'Abre as configurações do LLM para análise de dados ambientais.',
        en: 'Opens LLM settings for environmental data analysis.',
        es: 'Abre la configuración del LLM para análisis de datos ambientales.',
    },
    handleOpenParameterModal: {
        pt: 'Abre o modal de parâmetros para configuração de dados ambientais.',
        en: 'Opens the parameter modal to configure environmental data.',
        es: 'Abre el modal de parámetros para configurar datos ambientales.',
    },
    handleCloseParameterModal: {
        pt: 'Fecha o modal de configuração de parâmetros ambientais.',
        en: 'Closes the environmental parameter configuration modal.',
        es: 'Cierra el modal de configuración de parámetros ambientales.',
    },
    handleSaveParameter: {
        pt: 'Salva um parâmetro de monitoramento ou conformidade ambiental.',
        en: 'Saves an environmental monitoring or compliance parameter.',
        es: 'Guarda un parámetro de monitoreo o cumplimiento ambiental.',
    },
    handleAddStampClick: {
        pt: 'Adiciona um selo de marcação ou observação ao modelo 3D.',
        en: 'Adds a marking stamp or observation to the 3D model.',
        es: 'Agrega un sello de marcado u observación al modelo 3D.',
    },
    handleRemoveStamp: {
        pt: 'Remove um selo de marcação ou anotação da cena 3D.',
        en: 'Removes a stamp or annotation from the 3D scene.',
        es: 'Elimina un sello o anotación de la escena 3D.',
    },
    handleStampCategoryFilter: {
        pt: 'Filtra a exibição de selos (stamps) por categoria no modelo 3D.',
        en: 'Filters the display of stamps by category in the 3D model.',
        es: 'Filtra la visualización de sellos por categoría en el modelo 3D.',
    },
    handleStampClassificationFilter: {
        pt: 'Filtra selos de classificação no modelo 3D.',
        en: 'Filters classification stamps in the 3D model.',
        es: 'Filtra sellos de clasificación en el modelo 3D.',
    },
    handlePendingClassification: {
        pt: 'Processa classificações de dados ambientais pendentes.',
        en: 'Processes pending environmental data classifications.',
        es: 'Procesa las clasificaciones de datos ambientales pendientes.',
    },
    handleStampTypeSelect: {
        pt: 'Seleciona o tipo de carimbo/marcação para o modelo 3D.',
        en: 'Selects the stamp/marker type for the 3D model.',
        es: 'Selecciona el tipo de sello/marca para el modelo 3D.',
    },
    handleSaveStamp: {
        pt: 'Salva um registro de observação ou marcação temporal no modelo.',
        en: 'Saves an observation record or temporal stamp in the model.',
        es: 'Guarda un registro de observación o marca temporal en el modelo.',
    },
    handleQuickClassification: {
        pt: 'Classifica rapidamente um elemento ambiental por tipo.',
        en: 'Quickly classifies an environmental element by type.',
        es: 'Clasifica rápidamente un elemento ambiental por tipo.',
    },
    closeStampModal: {
        pt: 'Fecha o modal de inserção de selos/marcas no modelo 3D.',
        en: 'Closes the stamp/marker insertion modal in the 3D model.',
        es: 'Cierra el modal de inserción de sellos/marcas en el modelo 3D.',
    },
    handleAddEdgeClick: {
        pt: 'Inicia interação ao clicar em uma aresta de conexão no modelo 3D.',
        en: 'Triggers interaction when clicking a connection edge in the 3D model.',
        es: 'Inicia interacción al hacer clic en una arista de conexión en el modelo 3D.',
    },
    handleRemoveEdge: {
        pt: 'Remove uma conexão entre elementos no modelo 3D.',
        en: 'Removes a connection between elements in the 3D model.',
        es: 'Elimina una conexión entre elementos en el modelo 3D.',
    },
    handleEdgeTypeSelect: {
        pt: 'Seleciona o tipo de conexão/aresta para elementos no modelo 3D.',
        en: 'Selects the edge type for connections between 3D model elements.',
        es: 'Selecciona el tipo de arista para conexiones en el modelo 3D.',
    },
    handleTargetSelect: {
        pt: 'Seleciona um alvo ou elemento específico na cena 3D.',
        en: 'Selects a specific target or element in the 3D scene.',
        es: 'Selecciona un objetivo o elemento específico en la escena 3D.',
    },
    handleSaveEdge: {
        pt: 'Salva uma conexão ou relação entre elementos do modelo 3D.',
        en: 'Saves a connection or relationship between 3D model elements.',
        es: 'Guarda una conexión o relación entre elementos del modelo 3D.',
    },
    closeEdgeModal: {
        pt: 'Fecha o modal de edição de arestas/limites do modelo 3D.',
        en: 'Closes the 3D model edge/boundary editing modal.',
        es: 'Cierra el modal de edición de bordes/límites del modelo 3D.',
    },
    dockPanel: {
        pt: 'Acopla um painel de monitoramento ou dados na interface 3D.',
        en: 'Docks a monitoring or data panel into the 3D interface.',
        es: 'Acopla un panel de monitoreo o datos en la interfaz 3D.',
    },
    minimizePanel: {
        pt: 'Minimiza o painel de visualização ou controle de dados.',
        en: 'Minimizes the data visualization or control panel.',
        es: 'Minimiza el panel de visualización o control de datos.',
    },
    restorePanel: {
        pt: 'Restaura um painel de visualização ou monitoramento específico.',
        en: 'Restores a specific visualization or monitoring panel.',
        es: 'Restaura un panel de visualización o monitoreo específico.',
    },
    floatPanel: {
        pt: 'Flutua um painel de interface para visualização ou controle.',
        en: 'Floats an interface panel for visualization or control.',
        es: 'Flota un panel de interfaz para visualización o control.',
    },
    toggleParamDropdown: {
        pt: 'Alterna a visibilidade do menu de parâmetros de seleção.',
        en: 'Toggles the visibility of the selection parameter dropdown.',
        es: 'Alterna la visibilidad del menú desplegable de parámetros.',
    },
    filterParamOptions: {
        pt: 'Filtra opções de parâmetros de monitoramento para a interface.',
        en: 'Filters monitoring parameter options for the UI.',
        es: 'Filtra opciones de parámetros de monitoreo para la interfaz.',
    },
    selectParameter: {
        pt: 'Seleciona um parâmetro de monitoramento ou observação na interface.',
        en: 'Selects a monitoring or observation parameter in the UI.',
        es: 'Selecciona un parámetro de monitoreo u observación en la interfaz.',
    },
    handleSceneCampaigns: {
        pt: 'Gerencia campanhas de monitoramento na cena selecionada.',
        en: 'Manages monitoring campaigns within the selected scene.',
        es: 'Gestiona campañas de monitoreo en la escena seleccionada.',
    },
    handleSceneElementFilter: {
        pt: 'Filtra a visibilidade de elementos no modelo 3D da cena.',
        en: 'Filters the visibility of elements in the 3D scene model.',
        es: 'Filtra la visibilidad de elementos en el modelo 3D de la escena.',
    },
    handleCustomFieldChange: {
        pt: 'Atualiza um campo personalizado em uma observação ambiental.',
        en: 'Updates a custom field in an environmental observation.',
        es: 'Actualiza un campo personalizado en una observación ambiental.',
    },
    handleOpenMergeModal: {
        pt: 'Abre o modal para mesclar dados ou modelos ambientais.',
        en: 'Opens the modal to merge environmental data or models.',
        es: 'Abre el modal para fusionar datos o modelos ambientales.',
    },
    handleLoadCurrentAsA: {
        pt: 'Carrega o estado atual como uma nova versão de análise ou camada.',
        en: 'Loads the current state as a new analysis version or layer.',
        es: 'Carga el estado actual como una nueva versión de análisis o capa.',
    },
    handleLoadModelA: {
        pt: 'Carrega um modelo 3D de área contaminada para visualização.',
        en: 'Loads a 3D contaminated area model for visualization.',
        es: 'Carga un modelo 3D de área contaminada para visualización.',
    },
    handleLoadModelB: {
        pt: 'Carrega um modelo 3D de área contaminada para visualização.',
        en: 'Loads a 3D contaminated area model for visualization.',
        es: 'Carga un modelo 3D de área contaminada para visualización.',
    },
    handleRunDiff: {
        pt: 'Executa comparação de dados para identificar mudanças no modelo ambiental.',
        en: 'Runs data comparison to identify changes in the environmental model.',
        es: 'Ejecuta comparación de datos para identificar cambios en el modelo ambiental.',
    },
    handleAcceptAllA: {
        pt: 'Aceita todas as alterações ou termos de conformidade no merge.',
        en: 'Accepts all changes or compliance terms during merge.',
        es: 'Acepta todos los cambios o términos de cumplimiento en el merge.',
    },
    handleAcceptAllB: {
        pt: 'Aceita todos os termos ou alterações de merge no sistema.',
        en: 'Accepts all merge terms or changes in the system.',
        es: 'Acepta todos los términos o cambios de fusión en el sistema.',
    },
    handleApplyMerge: {
        pt: 'Mescla dados ou camadas de monitoramento no modelo digital.',
        en: 'Merges monitoring data or layers into the digital twin.',
        es: 'Fusiona datos o capas de monitoreo en el gemelo digital.',
    },
    handleExportDelta: {
        pt: 'Exporta as alterações (deltas) de dados do modelo ambiental.',
        en: 'Exports data changes (deltas) from the environmental model.',
        es: 'Exporta los cambios (deltas) de datos del modelo ambiental.',
    },
    handleAddContract: {
        pt: 'Adiciona um novo contrato de governança ao sistema.',
        en: 'Adds a new governance contract to the system.',
        es: 'Agrega un nuevo contrato de gobernanza al sistema.',
    },
    handleEditContract: {
        pt: 'Edita os termos de governança do contrato de monitoramento.',
        en: 'Edits the governance terms of the monitoring contract.',
        es: 'Edita los términos de gobernanza del contrato de monitoreo.',
    },
    handleRemoveContract: {
        pt: 'Remove um contrato de governança do sistema.',
        en: 'Removes a governance contract from the system.',
        es: 'Elimina un contrato de gobernanza del sistema.',
    },
    handleSaveContract: {
        pt: 'Salva o contrato de governança e conformidade do projeto.',
        en: 'Saves the project governance and compliance contract.',
        es: 'Guarda el contrato de gobernanza y cumplimiento del proyecto.',
    },
    handleAddWbsItem: {
        pt: 'Adiciona um novo item à estrutura de WBS de governança do projeto.',
        en: "Adds a new item to the project's governance WBS structure.",
        es: 'Agrega un nuevo elemento a la estructura WBS de gobernanza del proyecto.',
    },
    handleEditWbsItem: {
        pt: 'Edita um item da EAP (WBS) para gestão de governança do projeto.',
        en: 'Edits a WBS item for project governance management.',
        es: 'Edita un ítem de la EDT (WBS) para gestión de gobernanza del proyecto.',
    },
    handleRemoveWbsItem: {
        pt: 'Remove um item da estrutura de decomposição do trabalho (WBS) de governança.',
        en: 'Removes a Work Breakdown Structure (WBS) item from governance.',
        es: 'Elimina un elemento de la estructura de desglose de trabajo (WBS).',
    },
    handleApplyWbsTemplate: {
        pt: 'Aplica um template de WBS à estrutura de governança do projeto.',
        en: 'Applies a WBS template to the project governance structure.',
        es: 'Aplica una plantilla de WBS a la estructura de gobernanza del proyecto.',
    },
    handleCalculateEVA: {
        pt: 'Calcula o Valor Econômico Ambiental (EVA) para governança de ativos.',
        en: 'Calculates Environmental Value Added (EVA) for asset governance.',
        es: 'Calcula el Valor Económico Ambiental (EVA) para gobernanza de activos.',
    },
    handleLinkElementToContract: {
        pt: 'Vincula um elemento ambiental a um contrato de conformidade.',
        en: 'Links an environmental element to a compliance contract.',
        es: 'Vincula un elemento ambiental a un contrato de cumplimiento.',
    },
    handleFileInsuranceClaim: {
        pt: 'Registra sinistro de seguro para contrato de monitoramento ambiental.',
        en: 'Files an insurance claim for an environmental monitoring contract.',
        es: 'Registra un reclamo de seguro para un contrato de monitoreo ambiental.',
    },
    handleContractFilter: {
        pt: 'Aplica filtros de governança aos contratos e registros do sistema.',
        en: 'Applies governance filters to system contracts and records.',
        es: 'Aplica filtros de gobernanza a los contratos y registros del sistema.',
    },
    handleAddRegulatoryObligation: {
        pt: 'Adiciona uma nova obrigação regulatória (CONAMA/CETESB) ao sistema.',
        en: 'Adds a new regulatory obligation (CONAMA/CETESB) to the system.',
        es: 'Agrega una nueva obligación regulatoria (CONAMA/CETESB) al sistema.',
    },
    handleCompleteRegulatoryObligation: {
        pt: 'Registra a conclusão de uma obrigação regulatória de conformidade.',
        en: 'Records the completion of a regulatory compliance obligation.',
        es: 'Registra la conclusión de una obligación regulatoria de cumplimiento.',
    },
    handleRemoveRegulatoryObligation: {
        pt: 'Remove uma obrigação regulatória do sistema de governança.',
        en: 'Removes a regulatory obligation from the governance system.',
        es: 'Elimina una obligación regulatoria del sistema de gobernanza.',
    },
    handleGetRegulatoryCalendar: {
        pt: 'Recupera o calendário de prazos e conformidade regulatória.',
        en: 'Retrieves the regulatory compliance and deadline calendar.',
        es: 'Recupera el calendario de plazos y cumplimiento regulatorio.',
    },
    handleOpenRegulatoryObligationModal: {
        pt: 'Abre o modal de obrigações regulatórias (CONAMA/CETESB).',
        en: 'Opens the regulatory obligations modal (CONAMA/CETESB).',
        es: 'Abre el modal de obligaciones regulatorias (CONAMA/CETESB).',
    },
    handleRefreshRegulatoryCalendar: {
        pt: 'Atualiza o calendário de conformidade regulatória (CONAMA/CETESB).',
        en: 'Refreshes the regulatory compliance calendar (CONAMA/CETESB).',
        es: 'Actualiza el calendario de cumplimiento regulatorio (CONAMA/CETESB).',
    },
    handleLogDecision: {
        pt: 'Registra uma decisão de governança no log do sistema.',
        en: 'Logs a governance decision into the system record.',
        es: 'Registra una decisión de gobernanza en el log del sistema.',
    },
    handleOpenDecisionLogModal: {
        pt: 'Abre o modal de log de decisões de governança e conformidade.',
        en: 'Opens the governance and compliance decision log modal.',
        es: 'Abre el modal de registro de decisiones de gobernanza y cumplimiento.',
    },
    handleGetDecisionLog: {
        pt: 'Recupera o log de decisões de governança e conformidade ambiental.',
        en: 'Retrieves governance and environmental compliance decision logs.',
        es: 'Recupera el registro de decisiones de gobernanza y cumplimiento ambiental.',
    },
    handleRefreshDecisionLog: {
        pt: 'Atualiza o log de decisões de governança e conformidade ambiental.',
        en: 'Refreshes the environmental governance and decision log.',
        es: 'Actualiza el registro de decisiones de gobernanza y cumplimiento.',
    },
    handleToggleInsurance: {
        pt: 'Alterna a visualização de seguros/garantias do ativo listado.',
        en: 'Toggles insurance/guarantee view for the listed asset.',
        es: 'Alterna la vista de seguros/garantías del activo listado.',
    },
    handleInsuranceCheckChange: {
        pt: 'Atualiza a verificação de seguro para o ativo em uma moeda específica.',
        en: 'Updates insurance check for the asset in a specific currency.',
        es: 'Actualiza la verificación de seguro para el activo en una moneda específica.',
    },
    handleOpenSAOScenarioModal: {
        pt: 'Abre o modal de cenários SAOS para análise de monitoramento.',
        en: 'Opens the SAOS scenario modal for monitoring analysis.',
        es: 'Abre el modal de escenarios SAOS para análisis de monitoreo.',
    },
    handleActivateScenario: {
        pt: 'Ativa um cenário de simulação ou monitoramento ambiental específico.',
        en: 'Activates a specific environmental monitoring or simulation scenario.',
        es: 'Activa un escenario específico de monitoreo o simulación ambiental.',
    },
    handleDeactivateScenario: {
        pt: 'Desativa o cenário de monitoramento ou simulação atual.',
        en: 'Deactivates the current monitoring or simulation scenario.',
        es: 'Desactiva el escenario de monitoreo o simulación actual.',
    },
    handleSetTier: {
        pt: 'Define o nível de detalhamento ou camada de dados do modelo.',
        en: "Sets the model's level of detail or data tier.",
        es: 'Establece el nivel de detalle o capa de datos del modelo.',
    },
    handleToggleMatrix: {
        pt: 'Alterna a visualização da matriz de dados de monitoramento.',
        en: 'Toggles the monitoring data matrix view.',
        es: 'Alterna la vista de la matriz de datos de monitoreo.',
    },
    handleOpenSAOMatrixPanel: {
        pt: 'Abre o painel da matriz SAO para análise de dados ambientais.',
        en: 'Opens the SAO matrix panel for environmental data analysis.',
        es: 'Abre el panel de la matriz SAO para análisis de datos ambientales.',
    },
    handleLoadAllMatrices: {
        pt: 'Carrega todas as matrizes de dados ambientais e de monitoramento.',
        en: 'Loads all environmental and monitoring data matrices.',
        es: 'Carga todas las matrices de datos ambientales y de monitoreo.',
    },
    closeSAOScenarioModal: {
        pt: 'Fecha o modal de cenário de SAO (Análise de Situação Ambiental).',
        en: 'Closes the SAO (Environmental Situation Analysis) scenario modal.',
        es: 'Cierra el modal de escenario de SAO (Análisis de Situación Ambiental).',
    },
    handleFetchSensorData: {
        pt: 'Busca dados de sensores para um elemento específico no modelo.',
        en: 'Fetches sensor data for a specific element in the model.',
        es: 'Obtiene datos de sensores para un elemento específico en el modelo.',
    },
    handleSetSensorApiKey: {
        pt: 'Configura a chave de API para autenticação de sensores de monitoramento.',
        en: 'Sets the API key for monitoring sensor authentication.',
        es: 'Configura la clave API para la autenticación de sensores de monitoreo.',
    },
    handleSensorFieldChange: {
        pt: 'Atualiza um campo de dados de um sensor de monitoramento ambiental.',
        en: 'Updates a data field for an environmental monitoring sensor.',
        es: 'Actualiza un campo de datos de un sensor de monitoreo ambiental.',
    },
    handleSensorParameterToggle: {
        pt: 'Alterna a visualização de um parâmetro específico de um sensor.',
        en: 'Toggles the visibility of a specific sensor parameter.',
        es: 'Alterna la visualización de un parámetro específico de un sensor.',
    },
    handleSensorToObservation: {
        pt: 'Converte dados de um sensor em uma observação ambiental no modelo.',
        en: 'Converts sensor data into an environmental observation in the model.',
        es: 'Convierte datos de un sensor en una observación ambiental en el modelo.',
    },
    handleSensorEndpointChange: {
        pt: 'Atualiza a URL de conexão de um sensor de monitoramento ambiental.',
        en: 'Updates the connection URL for an environmental monitoring sensor.',
        es: 'Actualiza la URL de conexión de un sensor de monitoreo ambiental.',
    },
    handleSensorProfileChange: {
        pt: 'Atualiza o perfil de configuração de um sensor de monitoramento.',
        en: 'Updates the configuration profile of a monitoring sensor.',
        es: 'Actualiza el perfil de configuración de un sensor de monitoreo.',
    },
    handleSensorEvalChange: {
        pt: 'Atualiza a avaliação de um sensor de monitoramento ambiental.',
        en: 'Updates the evaluation of an environmental monitoring sensor.',
        es: 'Actualiza la evaluación de un sensor de monitoreo ambiental.',
    },
    handleFetchSensorDataSilent: {
        pt: 'Busca dados de sensores de forma silenciosa para o elemento.',
        en: 'Silently fetches sensor data for the specified element.',
        es: 'Obtiene datos de sensores de forma silenciosa para el elemento.',
    },
    handleToggleAutoRefresh: {
        pt: 'Alterna a atualização automática de dados de sensores no modelo.',
        en: 'Toggles automatic sensor data refresh in the model.',
        es: 'Alterna la actualización automática de datos de sensores en el modelo.',
    },
    handleAutoRefreshIntervalChange: {
        pt: 'Altera o intervalo de atualização automática dos dados do sensor.',
        en: 'Changes the automatic data refresh interval for the sensor.',
        es: 'Cambia el intervalo de actualización automática de los datos del sensor.',
    },
    handleStopAllAutoRefresh: {
        pt: 'Interrompe a atualização automática de dados dos sensores.',
        en: 'Stops automatic data refresh from environmental sensors.',
        es: 'Detiene la actualización automática de datos de los sensores.',
    },
    handleOpenSensorsCenter: {
        pt: 'Abre o centro de controle de sensores para monitoramento ambiental.',
        en: 'Opens the sensor control center for environmental monitoring.',
        es: 'Abre el centro de control de sensores para monitoreo ambiental.',
    },
    handleSensorCenterRefreshAll: {
        pt: 'Atualiza todos os dados de sensores no centro de monitoramento.',
        en: 'Refreshes all sensor data in the monitoring center.',
        es: 'Actualiza todos los datos de sensores en el centro de monitoreo.',
    },
    handleSensorCenterStartAll: {
        pt: 'Inicia o monitoramento de todos os sensores do centro de dados.',
        en: 'Starts monitoring for all sensors in the data center.',
        es: 'Inicia el monitoreo de todos los sensores del centro de datos.',
    },
    handleSensorCenterStopAll: {
        pt: 'Interrompe todas as transmissões de dados do centro de sensores.',
        en: 'Stops all data transmissions from the sensor center.',
        es: 'Detiene todas las transmisiones de datos del centro de sensores.',
    },
    handleSensorCenterFocusElement: {
        pt: 'Centraliza a visualização 3D no sensor especificado.',
        en: 'Centers the 3D view on the specified sensor.',
        es: 'Centra la vista 3D en el sensor especificado.',
    },
    handleSensorCenterSearch: {
        pt: 'Busca sensores de monitoramento ambiental no centro de dados.',
        en: 'Searches for environmental monitoring sensors in the data center.',
        es: 'Busca sensores de monitoreo ambiental en el centro de datos.',
    },
    handleSensorCenterFilter: {
        pt: 'Filtra sensores no centro de monitoramento pelo status.',
        en: 'Filters sensors in the monitoring center by status.',
        es: 'Filtra sensores en el centro de monitoreo por estado.',
    },
    handleSensorCenterSort: {
        pt: 'Ordena os sensores no centro de monitoramento por coluna.',
        en: 'Sorts sensors in the monitoring center by column.',
        es: 'Ordena los sensores en el centro de monitoreo por columna.',
    },
    handleSensorCenterPage: {
        pt: 'Navega para a página central de monitoramento de sensores.',
        en: 'Navigates to the sensor monitoring center page.',
        es: 'Navega a la página central de monitoreo de sensores.',
    },
    handleSensorCenterToggleExpand: {
        pt: 'Alterna a expansão do centro de informações do sensor monitorado.',
        en: 'Toggles the expansion of the monitored sensor information center.',
        es: 'Alterna la expansión del centro de información del sensor monitoreado.',
    },
    handleSensorCenterSetBulkInterval: {
        pt: 'Define o intervalo de amostragem em lote para o centro de sensores.',
        en: 'Sets bulk sampling intervals for the sensor center.',
        es: 'Define intervalos de muestreo masivo para el centro de sensores.',
    },
    handleToggleTicker: {
        pt: 'Alterna a exibição do ticker de monitoramento em tempo real.',
        en: 'Toggles the real-time monitoring ticker display.',
        es: 'Alterna la visualización del ticker de monitoreo en tiempo real.',
    },
    handleOpenTickerConfig: {
        pt: 'Abre a configuração do ticker de monitoramento ambiental.',
        en: 'Opens the environmental monitoring ticker configuration.',
        es: 'Abre la configuración del ticker de monitoreo ambiental.',
    },
    handleExpandTickerItem: {
        pt: 'Expande o detalhamento de um item no ticker de monitoramento.',
        en: 'Expands the details of a monitoring ticker item.',
        es: 'Expande el detalle de un elemento en el ticker de monitoreo.',
    },
    handleAddTickerItem: {
        pt: 'Adiciona um novo item ao ticker de monitoramento ambiental.',
        en: 'Adds a new item to the environmental monitoring ticker.',
        es: 'Agrega un nuevo elemento al ticker de monitoreo ambiental.',
    },
    handleRemoveTickerItem: {
        pt: 'Remove um item da barra de notificações/ticker de monitoramento.',
        en: 'Removes an item from the monitoring ticker/notification bar.',
        es: 'Elimina un elemento de la barra de notificaciones/ticker de monitoreo.',
    },
    handleUpdateTickerItem: {
        pt: 'Atualiza um dado ou parâmetro específico no ticker de monitoramento.',
        en: 'Updates a specific data point or parameter in the monitoring ticker.',
        es: 'Actualiza un dato o parámetro específico en el ticker de monitoreo.',
    },
    handleToggleTickerItem: {
        pt: 'Alterna a visibilidade de um item no ticker de monitoramento.',
        en: 'Toggles the visibility of a monitoring ticker item.',
        es: 'Alterna la visibilidad de un elemento en el ticker de monitoreo.',
    },
    handleDuplicateTickerItem: {
        pt: 'Duplica um item de ticker de monitoramento no sistema.',
        en: 'Duplicates a monitoring ticker item in the system.',
        es: 'Duplica un elemento de ticker de monitoreo en el sistema.',
    },
    handleReorderTickerItem: {
        pt: 'Reordena itens de monitoramento no ticker de observação.',
        en: 'Reorders monitoring items in the observation ticker.',
        es: 'Reordena elementos de monitoreo en el ticker de observación.',
    },
    handleAddTickerFilter: {
        pt: 'Adiciona um filtro de ticker para monitoramento de dados.',
        en: 'Adds a ticker filter for data monitoring.',
        es: 'Agrega un filtro de ticker para monitoreo de datos.',
    },
    handleRemoveTickerFilter: {
        pt: 'Remove um filtro de monitoramento da lista de tickers ativos.',
        en: 'Removes a monitoring filter from the active tickers list.',
        es: 'Elimina un filtro de monitoreo de la lista de tickers activos.',
    },
    handleUpdateTickerFilter: {
        pt: 'Atualiza o filtro de monitoramento no ticker de dados ambientais.',
        en: 'Updates the environmental data monitoring filter in the ticker.',
        es: 'Actualiza el filtro de monitoreo en el ticker de datos ambientales.',
    },
    handleTickerFilterValueChange: {
        pt: 'Atualiza o filtro de dados do ticker para monitoramento ambiental.',
        en: 'Updates the ticker filter value for environmental monitoring.',
        es: 'Actualiza el filtro de datos del ticker para monitoreo ambiental.',
    },
    handleTickerSpeedChange: {
        pt: 'Altera a velocidade de atualização do ticker de dados ambientais.',
        en: 'Changes the update speed of the environmental data ticker.',
        es: 'Cambia la velocidad de actualización del ticker de datos ambientales.',
    },
    handleTickerSeparatorChange: {
        pt: 'Altera o separador visual do ticker de monitoramento ambiental.',
        en: 'Changes the visual separator of the environmental monitoring ticker.',
        es: 'Cambia el separador visual del ticker de monitoreo ambiental.',
    },
    handleOpenCalculator: {
        pt: 'Abre a calculadora de parâmetros ambientais e conformidade.',
        en: 'Opens the environmental parameters and compliance calculator.',
        es: 'Abre la calculadora de parámetros ambientales y cumplimiento.',
    },
    handleCloseCalculator: {
        pt: 'Fecha o painel de calculadora de parâmetros ambientais.',
        en: 'Closes the environmental parameter calculator panel.',
        es: 'Cierra el panel de calculadora de parámetros ambientales.',
    },
    handleAddCalculatorMetric: {
        pt: 'Adiciona uma nova métrica de cálculo ao monitoramento ambiental.',
        en: 'Adds a new calculation metric to environmental monitoring.',
        es: 'Agrega una nueva métrica de cálculo al monitoreo ambiental.',
    },
    handleAddCalculatorRule: {
        pt: 'Adiciona uma nova regra de cálculo para parâmetros ambientais.',
        en: 'Adds a new calculation rule for environmental parameters.',
        es: 'Agrega una nueva regla de cálculo para parámetros ambientales.',
    },
    handleAddCalculatorRatio: {
        pt: 'Adiciona um novo cálculo de razão para análise de parâmetros ambientais.',
        en: 'Adds a new ratio calculation for environmental parameter analysis.',
        es: 'Agrega un nuevo cálculo de razón para análisis de parámetros ambientales.',
    },
    handleRemoveCalculatorItem: {
        pt: 'Remove um item do cálculo de parâmetros ambientais.',
        en: 'Removes an item from the environmental parameter calculation.',
        es: 'Elimina un elemento del cálculo de parámetros ambientales.',
    },
    handleToggleCalculatorItem: {
        pt: 'Alterna a exibição de um item de cálculo ambiental no modelo.',
        en: 'Toggles the display of an environmental calculation item in the model.',
        es: 'Alterna la visualización de un ítem de cálculo ambiental en el modelo.',
    },
    handleClearCalculator: {
        pt: 'Limpa os dados e cálculos da calculadora de parâmetros ambientais.',
        en: 'Clears data and calculations from the environmental parameter calculator.',
        es: 'Limpia los datos y cálculos de la calculadora de parámetros ambientales.',
    },
    handleOpenInterpolationPanel: {
        pt: 'Abre o painel de interpolação de dados para modelagem de plumas.',
        en: 'Opens the data interpolation panel for plume modeling.',
        es: 'Abre el panel de interpolación de datos para modelado de plumas.',
    },
    handleCloseInterpolationPanel: {
        pt: 'Fecha o painel de interpolação de dados ambientais.',
        en: 'Closes the environmental data interpolation panel.',
        es: 'Cierra el panel de interpolación de datos ambientales.',
    },
    handleAddTerrainLayer: {
        pt: 'Adiciona uma nova camada de interpolação ao terreno 3D.',
        en: 'Adds a new interpolation layer to the 3D terrain.',
        es: 'Agrega una nueva capa de interpolación al terreno 3D.',
    },
    handleAddTerrainLayerManualFromPaste: {
        pt: 'Adiciona uma camada de terreno manualmente via colagem de dados.',
        en: 'Adds a terrain layer manually via data paste.',
        es: 'Agrega una capa de terreno manualmente mediante pegado de datos.',
    },
    handleAddTerrainLayerManualFromUpload: {
        pt: 'Adiciona manualmente uma camada de terreno via upload.',
        en: 'Manually adds a terrain layer via upload.',
        es: 'Agrega manualmente una capa de terreno mediante carga.',
    },
    handleTerrainManualUploadChange: {
        pt: 'Atualiza o terreno do modelo via upload manual de dados.',
        en: 'Updates the model terrain via manual data upload.',
        es: 'Actualiza el terreno del modelo mediante carga manual de datos.',
    },
    handleAddWaterTableLayer: {
        pt: 'Adiciona uma camada de interpolação do nível freático ao modelo 3D.',
        en: 'Adds a water table interpolation layer to the 3D model.',
        es: 'Agrega una capa de interpolación del nivel freático al modelo 3D.',
    },
    handleAddContaminationLayer: {
        pt: 'Adiciona uma camada de interpolação de contaminação via parâmetro.',
        en: 'Adds a contamination interpolation layer via parameter.',
        es: 'Agrega una capa de interpolación de contaminación vía parámetro.',
    },
    handleRemoveInterpolationLayer: {
        pt: 'Remove a camada de interpolação de dados do modelo 3D.',
        en: 'Removes the data interpolation layer from the 3D model.',
        es: 'Elimina la capa de interpolación de datos del modelo 3D.',
    },
    handleToggleInterpolationLayer: {
        pt: 'Alterna a visualização da camada de interpolação de dados ambientais.',
        en: 'Toggles the environmental data interpolation layer visibility.',
        es: 'Alterna la visibilidad de la capa de interpolación de datos ambientales.',
    },
    handleRefreshInterpolationLayer: {
        pt: 'Atualiza a camada de interpolação de dados ambientais no modelo 3D.',
        en: 'Refreshes the environmental data interpolation layer in the 3D model.',
        es: 'Actualiza la capa de interpolación de datos ambientales en el modelo 3D.',
    },
    openAgentsModal: {
        pt: 'Abre o modal de agentes de IA para análise e monitoramento ambiental.',
        en: 'Opens the AI agents modal for environmental analysis and monitoring.',
        es: 'Abre el modal de agentes de IA para análisis y monitoreo ambiental.',
    },
    handleCreateAgent: {
        pt: 'Cria um novo agente de monitoramento ou análise no sistema.',
        en: 'Creates a new monitoring or analysis agent in the system.',
        es: 'Crea un nuevo agente de monitoreo o análisis en el sistema.',
    },
    handleEditAgent: {
        pt: 'Edita as configurações de um agente de monitoramento ou IA.',
        en: 'Edits the settings of a monitoring or AI agent.',
        es: 'Edita la configuración de un agente de monitoreo o IA.',
    },
    handleSaveAgent: {
        pt: 'Salva as configurações do agente de monitoramento ou IA.',
        en: 'Saves the monitoring or AI agent configurations.',
        es: 'Guarda las configuraciones del agente de monitoreo o IA.',
    },
    handleCancelEditAgent: {
        pt: 'Cancela a edição do agente de monitoramento e descarta alterações.',
        en: 'Cancels monitoring agent editing and discards changes.',
        es: 'Cancela la edición del agente de monitoreo y descarta cambios.',
    },
    handleDeleteAgent: {
        pt: 'Remove um agente de monitoramento ou análise do sistema.',
        en: 'Removes a monitoring or analysis agent from the system.',
        es: 'Elimina un agente de monitoreo o análisis del sistema.',
    },
    handleSelectAgent: {
        pt: 'Seleciona um agente de monitoramento ou análise no sistema.',
        en: 'Selects a monitoring or analysis agent in the system.',
        es: 'Selecciona un agente de monitoreo o análisis en el sistema.',
    },
    handleExportAgent: {
        pt: 'Exporta os dados e configurações do agente de monitoramento.',
        en: 'Exports monitoring agent data and configurations.',
        es: 'Exporta los datos y configuraciones del agente de monitoreo.',
    },
    handleImportAgent: {
        pt: 'Importa um agente de processamento para análise de dados ambientais.',
        en: 'Imports a processing agent for environmental data analysis.',
        es: 'Importa un agente de procesamiento para análisis de datos ambientales.',
    },
    openSmartImportModal: {
        pt: 'Abre o modal de importação inteligente de dados ambientais.',
        en: 'Opens the smart import modal for environmental data.',
        es: 'Abre el modal de importación inteligente de datos ambientales.',
    },
    handleSmartImportFile: {
        pt: 'Importa arquivos de dados ambientais via processamento inteligente.',
        en: 'Imports environmental data files via smart processing.',
        es: 'Importa archivos de datos ambientales mediante procesamiento inteligente.',
    },
    handleAdjustMapping: {
        pt: 'Ajusta o mapeamento de dados na importação inteligente de camadas.',
        en: 'Adjusts data mapping during smart import of environmental layers.',
        es: 'Ajusta el mapeo de datos durante la importación inteligente de capas.',
    },
    handleConfirmSmartImport: {
        pt: 'Confirma a importação inteligente de dados ambientais via IA.',
        en: 'Confirms the smart import of environmental data via AI.',
        es: 'Confirma la importación inteligente de datos ambientales vía IA.',
    },
    saveLLMConfig: {
        pt: 'Salva as configurações do modelo de linguagem (LLM) do sistema.',
        en: "Saves the system's Large Language Model (LLM) configurations.",
        es: 'Guarda las configuraciones del modelo de lenguaje (LLM) del sistema.',
    },
    sendLLMMessage: {
        pt: 'Envia uma mensagem para o LLM para análise de dados ambientais.',
        en: 'Sends a message to the LLM for environmental data analysis.',
        es: 'Envía un mensaje al LLM para análisis de datos ambientales.',
    },
    confirmLLMAction: {
        pt: 'Confirma a execução de uma ação sugerida pelo modelo de linguagem (LLM).',
        en: 'Confirms the execution of an action suggested by the LLM.',
        es: 'Confirma la ejecución de una acción sugerida por el LLM.',
    },
    cancelLLMAction: {
        pt: 'Cancela a execução de uma ação de IA/LLM em curso.',
        en: 'Cancels the current LLM/AI action execution.',
        es: 'Cancela la ejecución de una acción de IA/LLM en curso.',
    },
    handleProviderChange: {
        pt: 'Altera o provedor de LLM para processamento de dados ambientais.',
        en: 'Changes the LLM provider for environmental data processing.',
        es: 'Cambia el proveedor de LLM para el procesamiento de datos ambientales.',
    },
    testLLMConnection: {
        pt: 'Testa a conexão com o modelo de linguagem para análise ambiental.',
        en: 'Tests the LLM connection for environmental data analysis.',
        es: 'Prueba la conexión con el LLM para análisis ambiental.',
    },
    refreshLLMModels: {
        pt: 'Atualiza os modelos de LLM para análise de dados ambientais.',
        en: 'Refreshes LLM models for environmental data analysis.',
        es: 'Actualiza los modelos de LLM para análisis de datos ambientales.',
    },
    toggleChatToolsMenu: {
        pt: 'Alterna a visibilidade do menu de ferramentas de IA do chat.',
        en: 'Toggles the visibility of the AI chat tools menu.',
        es: 'Alterna la visibilidad del menú de herramientas de IA del chat.',
    },
    handleToggleChatTool: {
        pt: 'Alterna a visibilidade da ferramenta de chat do LLM.',
        en: 'Toggles the visibility of the LLM chat tool.',
        es: 'Alterna la visibilidad de la herramienta de chat del LLM.',
    },
    toggleContextualChat: {
        pt: 'Alterna o chat contextual para análise de dados ambientais.',
        en: 'Toggles the contextual chat for environmental data analysis.',
        es: 'Alterna el chat contextual para análisis de datos ambientales.',
    },
    handleAIBotContextMenu: {
        pt: 'Abre o menu de contexto do assistente de IA para análise ambiental.',
        en: 'Opens the AI bot context menu for environmental analysis.',
        es: 'Abre el menú contextual del asistente de IA para análisis ambiental.',
    },
    handleCreateCustomTool: {
        pt: 'Cria uma ferramenta personalizada para análise de dados via LLM.',
        en: 'Creates a custom tool for LLM-driven data analysis.',
        es: 'Crea una herramienta personalizada para análisis de datos vía LLM.',
    },
    handleEditCustomTool: {
        pt: 'Edita uma ferramenta customizada de análise ou monitoramento via LLM.',
        en: 'Edits a custom analysis or monitoring tool via LLM.',
        es: 'Edita una herramienta de análisis o monitoreo personalizada vía LLM.',
    },
    handleSaveCustomTool: {
        pt: 'Salva uma ferramenta customizada de análise ou monitoramento via LLM.',
        en: 'Saves a custom analysis or monitoring tool via LLM.',
        es: 'Guarda una herramienta de análisis o monitoreo personalizada vía LLM.',
    },
    handleRemoveCustomTool: {
        pt: 'Remove uma ferramenta customizada do assistente de LLM.',
        en: 'Removes a custom tool from the LLM assistant.',
        es: 'Elimina una herramienta personalizada del asistente LLM.',
    },
    configureVoiceIO: {
        pt: 'Configura a interface de voz para comandos de monitoramento e análise.',
        en: 'Configures voice interface for monitoring and analysis commands.',
        es: 'Configura la interfaz de voz para comandos de monitoreo y análisis.',
    },
    getVoiceIOStatus: {
        pt: 'Verifica o status da interface de voz para comandos de IA.',
        en: 'Checks the voice interface status for AI commands.',
        es: 'Verifica el estado de la interfaz de voz para comandos de IA.',
    },
    handleVoiceSttSourceChange: {
        pt: 'Altera a fonte de entrada de voz para comandos do LLM.',
        en: 'Changes the voice input source for LLM commands.',
        es: 'Cambia la fuente de entrada de voz para comandos del LLM.',
    },
    handleVoiceExternalProviderChange: {
        pt: 'Altera o provedor de voz externo para comandos de voz do sistema.',
        en: 'Changes the external voice provider for system voice commands.',
        es: 'Cambia el proveedor de voz externo para comandos de voz del sistema.',
    },
    handleVoiceExternalModelChange: {
        pt: 'Altera o modelo de LLM via comando de voz.',
        en: 'Changes the LLM model via voice command.',
        es: 'Cambia el modelo de LLM mediante comando de voz.',
    },
    sendVoiceMessageOnce: {
        pt: 'Envia uma mensagem de voz única via LLM para análise ou relatório.',
        en: 'Sends a single voice message via LLM for analysis or reporting.',
        es: 'Envía un mensaje de voz único vía LLM para análisis o reporte.',
    },
    stopVoiceIO: {
        pt: 'Interrompe a interface de comando de voz do LLM.',
        en: 'Stops the LLM voice command interface.',
        es: 'Detiene la interfaz de comandos de voz del LLM.',
    },
    isConverseWhenMinimizedEnabled: {
        pt: 'Verifica se o chat do LLM continua ativo ao minimizar a interface.',
        en: 'Checks if the LLM chat remains active when the UI is minimized.',
        es: 'Verifica si el chat del LLM sigue activo al minimizar la interfaz.',
    },
    setConverseWhenMinimizedEnabled: {
        pt: 'Habilita a conversa com o LLM mesmo com a interface minimizada.',
        en: 'Enables LLM interaction even when the UI is minimized.',
        es: 'Habilita la conversación con el LLM incluso con la interfaz minimizada.',
    },
    toggleConverseWhenMinimized: {
        pt: 'Alterna a exibição do chat de IA quando a janela está minimizada.',
        en: 'Toggles the AI chat display when the window is minimized.',
        es: 'Alterna la visualización del chat de IA cuando la ventana está minimizada.',
    },
    handleAddContractParty: {
        pt: 'Adiciona uma parte interessada ao contrato de governança.',
        en: 'Adds a stakeholder to the governance contract.',
        es: 'Agrega una parte interesada al contrato de gobernanza.',
    },
    handleRemoveContractParty: {
        pt: 'Remove uma parte do contrato de governança do projeto.',
        en: 'Removes a contract party from the project governance.',
        es: 'Elimina una parte del contrato de la gobernanza del proyecto.',
    },
    handleUpdateContractParty: {
        pt: 'Atualiza dados de uma parte em contratos de governança ambiental.',
        en: 'Updates data for a party in environmental governance contracts.',
        es: 'Actualiza datos de una parte en contratos de gobernanza ambiental.',
    },
    handleAddDisbursement: {
        pt: 'Registra um novo desembolso financeiro vinculado ao contrato de governança.',
        en: 'Records a new financial disbursement linked to the governance contract.',
        es: 'Registra un nuevo desembolso financiero vinculado al contrato de gobernanza.',
    },
    handleUnlinkElementFromContract: {
        pt: 'Desvincula um elemento ambiental de um contrato de monitoramento.',
        en: 'Unlinks an environmental element from a monitoring contract.',
        es: 'Desvincula un elemento ambiental de un contrato de monitoreo.',
    },
    handleMergeAcceptA: {
        pt: 'Aceita a fusão de dados ou modelos de monitoramento.',
        en: 'Accepts the merge of monitoring data or models.',
        es: 'Acepta la fusión de datos o modelos de monitoreo.',
    },
    handleMergeAcceptB: {
        pt: 'Aceita a fusão de dados ou modelos de monitoramento.',
        en: 'Accepts the merge of monitoring data or models.',
        es: 'Acepta la fusión de datos o modelos de monitoreo.',
    },
    moveTab: {
        pt: 'Move uma aba de visualização para um painel de monitoramento alvo.',
        en: 'Moves a view tab to a target monitoring panel.',
        es: 'Mueve una pestaña de visualización a un panel de monitoreo objetivo.',
    },
    toggleToolbar: {
        pt: 'Alterna a visibilidade da barra de ferramentas da interface.',
        en: 'Toggles the visibility of the interface toolbar.',
        es: 'Alterna la visibilidad de la barra de herramientas de la interfaz.',
    },
    toggleStatusbar: {
        pt: 'Alterna a visibilidade da barra de status do monitoramento.',
        en: 'Toggles the visibility of the monitoring status bar.',
        es: 'Alterna la visibilidad de la barra de estado del monitoreo.',
    },
    toggleConstellation: {
        pt: 'Alterna a visibilidade da constelação de dados no painel.',
        en: 'Toggles the visibility of the data constellation in the panel.',
        es: 'Alterna la visibilidad de la constelación de datos en el panel.',
    },
    floatToolbar: {
        pt: 'Alterna a flutuação da barra de ferramentas da interface de monitoramento.',
        en: 'Toggles the floating state of the monitoring interface toolbar.',
        es: 'Alterna el estado flotante de la barra de herramientas de monitoreo.',
    },
    dockToolbar: {
        pt: 'Fixa a barra de ferramentas de monitoramento na interface.',
        en: 'Docks the monitoring toolbar to the interface.',
        es: 'Ancla la barra de herramientas de monitoreo en la interfaz.',
    },
    floatConstellation: {
        pt: 'Flutua a constelação de elementos no painel de visualização.',
        en: 'Floats the element constellation in the visualization panel.',
        es: 'Flota la constelación de elementos en el panel de visualización.',
    },
    dockConstellation: {
        pt: 'Agrupa painéis de monitoramento e visualização em uma constelação.',
        en: 'Groups monitoring and visualization panels into a constellation.',
        es: 'Agrupa paneles de monitoreo y visualización en una constelación.',
    },
    toggleLLMChatPanel: {
        pt: 'Alterna a visibilidade do painel de chat da IA para análise ambiental.',
        en: 'Toggles the AI chat panel visibility for environmental analysis.',
        es: 'Alterna la visibilidad del panel de chat de IA para análisis ambiental.',
    },
    handleBoundaryFieldChange: {
        pt: 'Atualiza um campo de limite de um elemento no modelo 3D.',
        en: 'Updates a boundary field of an element in the 3D model.',
        es: 'Actualiza un campo de límite de un elemento en el modelo 3D.',
    },
    handleAreaFieldChange: {
        pt: 'Atualiza um campo de dados de uma área monitorada no modelo.',
        en: 'Updates a data field for a monitored area in the model.',
        es: 'Actualiza un campo de datos de un área monitoreada en el modelo.',
    },
    fitAllElements: {
        pt: 'Ajusta o zoom da câmera para enquadrar todos os elementos do modelo.',
        en: 'Adjusts camera zoom to fit all model elements in view.',
        es: 'Ajusta el zoom de la cámara para encuadrar todos los elementos.',
    },
    toggleBlockchainOptions: {
        pt: 'Alterna a visibilidade das opções de registro em blockchain.',
        en: 'Toggles the visibility of blockchain registration options.',
        es: 'Alterna la visibilidad de las opciones de registro en blockchain.',
    },
    onKeySelectChange: {
        pt: 'Atualiza a seleção de chaves de dados ou parâmetros de monitoramento.',
        en: 'Updates the selection of data keys or monitoring parameters.',
        es: 'Actualiza la selección de claves de datos o parámetros de monitoreo.',
    },
    createNewKey: {
        pt: 'Gera uma nova chave de acesso para operações de I/O ou autenticação.',
        en: 'Generates a new access key for I/O operations or authentication.',
        es: 'Genera una nueva clave de acceso para operaciones de I/O o autenticación.',
    },
    executeImport: {
        pt: 'Importa dados ou modelos para o Digital Twin.',
        en: 'Imports data or models into the Digital Twin.',
        es: 'Importa datos o modelos al Digital Twin.',
    },
    showAboutDialog: {
        pt: 'Abre o diálogo de informações sobre a plataforma ECBT.',
        en: 'Opens the information dialog about the ECBT platform.',
        es: 'Abre el diálogo de información sobre la plataforma ECBT.',
    },
    handleOpenDocs: {
        pt: 'Abre a documentação técnica e normas de conformidade ambiental.',
        en: 'Opens technical documentation and environmental compliance standards.',
        es: 'Abre la documentación técnica y normas de cumplimiento ambiental.',
    },
    handleOpenApiDocs: {
        pt: 'Abre a documentação da API para integração de dados ambientais.',
        en: 'Opens the API documentation for environmental data integration.',
        es: 'Abre la documentación de la API para integración de datos ambientales.',
    },
    handleReportBug: {
        pt: 'Reporta um erro de interface ou visualização no modelo 3D.',
        en: 'Reports a UI or 3D model visualization bug.',
        es: 'Reporta un error de interfaz o visualización en el modelo 3D.',
    },
    handleOpenErrorAdmin: {
        pt: 'Abre o painel de erros de administração do sistema.',
        en: 'Opens the system administration error panel.',
        es: 'Abre el panel de errores de administración del sistema.',
    },
    handleAddElementGroup: {
        pt: 'Adiciona um novo grupo de elementos ao modelo 3D.',
        en: 'Adds a new group of elements to the 3D model.',
        es: 'Agrega un nuevo grupo de elementos al modelo 3D.',
    },
    handleRenameElementGroup: {
        pt: 'Renomeia um grupo de elementos no modelo 3D.',
        en: 'Renames a group of elements in the 3D model.',
        es: 'Renombra un grupo de elementos en el modelo 3D.',
    },
    handleRemoveElementGroup: {
        pt: 'Remove um grupo de elementos do modelo 3D.',
        en: 'Removes a group of elements from the 3D model.',
        es: 'Elimina un grupo de elementos del modelo 3D.',
    },
    handleToggleElementGroupCollapse: {
        pt: 'Alterna a visibilidade (recolher/expandir) de grupos de elementos no modelo.',
        en: 'Toggles the visibility (collapse/expand) of element groups in the model.',
        es: 'Alterna la visibilidad (contraer/expandir) de grupos de elementos en el modelo.',
    },
    handleToggleElementUngroupedCollapse: {
        pt: 'Alterna a expansão de elementos ambientais não agrupados na cena.',
        en: 'Toggles expansion of ungrouped environmental elements in the scene.',
        es: 'Alterna la expansión de elementos ambientales no agrupados en la escena.',
    },
    handleElementGroupColorChange: {
        pt: 'Altera a cor de um grupo de elementos no modelo 3D.',
        en: 'Changes the color of an element group in the 3D model.',
        es: 'Cambia el color de un grupo de elementos en el modelo 3D.',
    },
    handleMoveElementToGroup: {
        pt: 'Move um elemento ambiental para um grupo específico no modelo 3D.',
        en: 'Moves an environmental element to a specific group in the 3D model.',
        es: 'Mueve un elemento ambiental a un grupo específico en el modelo 3D.',
    },
    handleAddFamilyGroup: {
        pt: 'Adiciona um novo grupo de famílias de elementos ao sistema.',
        en: 'Adds a new family group of elements to the system.',
        es: 'Agrega un nuevo grupo de familias de elementos al sistema.',
    },
    handleRenameFamilyGroup: {
        pt: 'Renomeia um grupo de elementos ou famílias no modelo 3D.',
        en: 'Renames a group of elements or families in the 3D model.',
        es: 'Renombra un grupo de elementos o familias en el modelo 3D.',
    },
    handleRemoveFamilyGroup: {
        pt: 'Remove um grupo de elementos relacionados na cena 3D.',
        en: 'Removes a group of related elements from the 3D scene.',
        es: 'Elimina un grupo de elementos relacionados en la escena 3D.',
    },
    handleToggleFamilyGroupCollapse: {
        pt: 'Alterna a expansão de grupos de elementos no modelo 3D.',
        en: 'Toggles the expansion of element groups in the 3D model.',
        es: 'Alterna la expansión de grupos de elementos en el modelo 3D.',
    },
    handleToggleFamilyUngroupedCollapse: {
        pt: 'Alterna a expansão de grupos de elementos ambientais não agrupados.',
        en: 'Toggles expansion of ungrouped environmental element groups.',
        es: 'Alterna la expansión de grupos de elementos ambientales no agrupados.',
    },
    handleFamilyGroupColorChange: {
        pt: 'Altera a cor de um grupo de elementos no modelo 3D.',
        en: 'Changes the color of a group of elements in the 3D model.',
        es: 'Cambia el color de un grupo de elementos en el modelo 3D.',
    },
    handleMoveFamilyToGroup: {
        pt: 'Move uma família de elementos para um grupo de monitoramento.',
        en: 'Moves an element family to a monitoring group.',
        es: 'Mueve una familia de elementos a un grupo de monitoreo.',
    },
    handleOpenAerialModal: {
        pt: 'Abre o modal de visualização de imagens aéreas e ortomosaicos.',
        en: 'Opens the aerial imagery and orthomosaic view modal.',
        es: 'Abre el modal de visualización de imágenes aéreas y ortomosaicos.',
    },
    handleAerialAnalyze: {
        pt: 'Executa análise aérea de dados para monitoramento ambiental.',
        en: 'Executes aerial data analysis for environmental monitoring.',
        es: 'Ejecuta análisis aéreo de datos para monitoreo ambiental.',
    },
    handleAerialConfirmImport: {
        pt: 'Confirma a importação de dados de imagens aéreas para o modelo 3D.',
        en: 'Confirms the import of aerial imagery data into the 3D model.',
        es: 'Confirma la importación de datos de imágenes aéreas al modelo 3D.',
    },
    handleAerialImageUpload: {
        pt: 'Faz o upload de imagem aérea para sobreposição no modelo 3D.',
        en: 'Uploads aerial imagery for overlay on the 3D model.',
        es: 'Sube imágenes aéreas para superposición en el modelo 3D.',
    },
    handleAerialUseBoundary: {
        pt: 'Define o limite de uso de área aérea para monitoramento ou restrição.',
        en: 'Sets the aerial use boundary for monitoring or restriction.',
        es: 'Define el límite de uso aéreo para monitoreo o restricción.',
    },
    handleAerialToggleFeature: {
        pt: 'Alterna a visualização de camadas de observação aérea no modelo 3D.',
        en: 'Toggles aerial observation layers in the 3D model view.',
        es: 'Alterna la visualización de capas de observación aérea en el modelo 3D.',
    },
    handleAerialSelectAll: {
        pt: 'Seleciona todos os elementos na visualização aérea do modelo.',
        en: "Selects all elements in the model's aerial view.",
        es: 'Selecciona todos los elementos en la vista aérea del modelo.',
    },
    handleAerialSetExtent: {
        pt: 'Define a extensão da visualização aérea da área monitorada.',
        en: 'Sets the aerial view extent of the monitored area.',
        es: 'Define la extensión de la vista aérea del área monitoreada.',
    },
    handleAerialMethodChange: {
        pt: 'Altera o método de visualização aérea do modelo 3D.',
        en: 'Changes the aerial view method of the 3D model.',
        es: 'Cambia el método de visualización aérea del modelo 3D.',
    },
    handleAerialAutoCalibrate: {
        pt: 'Executa a autocalibragem aérea do modelo 3D e sensores.',
        en: 'Executes aerial auto-calibration of the 3D model and sensors.',
        es: 'Ejecuta la autocalibración aérea del modelo 3D y sensores.',
    },
    handleAerialCalibrationChange: {
        pt: 'Ajusta a calibração aérea do modelo 3D para precisão de monitoramento.',
        en: 'Adjusts the 3D model aerial calibration for monitoring precision.',
        es: 'Ajusta la calibración aérea del modelo 3D para precisión de monitoreo.',
    },
    handleAerialResetCalibration: {
        pt: 'Redefine a calibração da visão aérea do modelo 3D.',
        en: "Resets the 3D model's aerial view calibration.",
        es: 'Reinicia la calibración de la vista aérea del modelo 3D.',
    },
    handleAerialToggleAdvanced: {
        pt: 'Alterna a visualização avançada de imagens aéreas e ortomosaicos.',
        en: 'Toggles advanced aerial imagery and orthomosaic views.',
        es: 'Alterna la visualización avanzada de imágenes aéreas y ortomosaicos.',
    },
    handleAerialRemoveAnnotation: {
        pt: 'Remove uma anotação de imagem aérea do modelo 3D.',
        en: 'Removes an aerial imagery annotation from the 3D model.',
        es: 'Elimina una anotación de imagen aérea del modelo 3D.',
    },
    handleAerialClearAnnotations: {
        pt: 'Limpa anotações aéreas sobrepostas ao modelo 3D.',
        en: 'Clears aerial annotations overlaid on the 3D model.',
        es: 'Limpia las anotaciones aéreas sobrepuestas al modelo 3D.',
    },
    handleAerialClearResults: {
        pt: 'Limpa os resultados de processamento de imagens aéreas e monitoramento.',
        en: 'Clears aerial imagery processing and monitoring results.',
        es: 'Limpia los resultados de procesamiento de imágenes aéreas y monitoreo.',
    },
    handleAerialSelectPaintFamily: {
        pt: 'Seleciona a família de cores para pintura aérea no modelo 3D.',
        en: 'Selects the color family for aerial painting in the 3D model.',
        es: 'Selecciona la familia de colores para pintura aérea en el modelo 3D.',
    },
    handleAerialBrushChange: {
        pt: 'Altera o pincel de visualização aérea no modelo 3D.',
        en: 'Changes the aerial view brush in the 3D model.',
        es: 'Cambia el pincel de vista aérea en el modelo 3D.',
    },
    handleAerialTrainNN: {
        pt: 'Treina rede neural para processamento de dados de imagens aéreas.',
        en: 'Trains neural network for aerial imagery data processing.',
        es: 'Entrena red neuronal para procesamiento de imágenes aéreas.',
    },
    handleAerialClassifyNN: {
        pt: 'Executa classificação neural de imagens aéreas para análise ambiental.',
        en: 'Runs neural classification of aerial imagery for environmental analysis.',
        es: 'Ejecuta clasificación neural de imágenes aéreas para análisis ambiental.',
    },
    handleAerialClearPaint: {
        pt: 'Limpa as marcações de pintura aérea sobre o modelo 3D.',
        en: 'Clears aerial paint markings on the 3D model.',
        es: 'Limpia las marcas de pintura aérea sobre el modelo 3D.',
    },
    handleAerialUndoPaint: {
        pt: 'Desfaz a última pintura ou marcação na visualização aérea.',
        en: 'Undoes the last paint or marking on the aerial view.',
        es: 'Deshace la última pintura o marca en la vista aérea.',
    },
    handleAerialVectorize: {
        pt: 'Vetoriza dados aéreos para modelagem 3D de áreas monitoradas.',
        en: 'Vectorizes aerial data for 3D modeling of monitored areas.',
        es: 'Vectoriza datos aéreos para modelado 3D de áreas monitoreadas.',
    },
    handleAerialExportGeoJSON: {
        pt: 'Exporta dados de observação aérea em formato GeoJSON.',
        en: 'Exports aerial observation data in GeoJSON format.',
        es: 'Exporta datos de observación aérea en formato GeoJSON.',
    },
    handleListNetworks: {
        pt: 'Lista as redes de monitoramento e sensores ativos no modelo.',
        en: 'Lists active monitoring networks and sensors in the model.',
        es: 'Lista las redes de monitoreo y sensores activos en el modelo.',
    },
    handleGetNetworkInfo: {
        pt: 'Recupera informações da rede de monitoramento via networkId.',
        en: 'Retrieves monitoring network info via networkId.',
        es: 'Recupera información de la red de monitoreo vía networkId.',
    },
    handleResetNetwork: {
        pt: 'Reinicia a rede de monitoramento ou sensores do ID especificado.',
        en: 'Resets the monitoring network or sensors for the specified ID.',
        es: 'Reinicia la red de monitoreo o sensores del ID especificado.',
    },
    handleRemoveNetwork: {
        pt: 'Remove uma rede de monitoramento ou sensores do modelo.',
        en: 'Removes a monitoring network or sensor array from the model.',
        es: 'Elimina una red de monitoreo o sensores del modelo.',
    },
    handleOpenNNManager: {
        pt: 'Abre o gerenciador de redes neurais para análise de dados ambientais.',
        en: 'Opens the neural network manager for environmental data analysis.',
        es: 'Abre el gestor de redes neuronales para análisis de datos ambientales.',
    },
    handleNNCreate: {
        pt: 'Cria uma nova rede neural para processamento de dados ambientais.',
        en: 'Creates a new neural network for environmental data processing.',
        es: 'Crea una nueva red neuronal para el procesamiento de datos ambientales.',
    },
    handleNNOpenBuilder: {
        pt: 'Abre o construtor de redes neurais para modelagem de dados.',
        en: 'Opens the neural network builder for data modeling.',
        es: 'Abre el constructor de redes neuronales para modelado de datos.',
    },
    handleNNTrain: {
        pt: 'Inicia o treinamento da rede neural para modelos de contaminação.',
        en: 'Starts neural network training for contamination models.',
        es: 'Inicia el entrenamiento de la red neuronal para modelos de contaminación.',
    },
    handleNNOpenWhatIf: {
        pt: "Abre simulação de cenários 'What-If' para análise de redes neurais.",
        en: "Opens 'What-If' scenario simulations for neural network analysis.",
        es: "Abre simulaciones de escenarios 'What-If' para análisis de redes neuronales.",
    },
    handleWhatIfSliderChange: {
        pt: 'Simula mudanças em variáveis de rede para análise de cenários ambientais.',
        en: 'Simulates network variable changes for environmental scenario analysis.',
        es: 'Simula cambios en variables de red para análisis de escenarios ambientales.',
    },
    handleWhatIfConnectPlume: {
        pt: 'Simula a conexão de uma plume de contaminação via análise What-If.',
        en: 'Simulates contamination plume connection via What-If analysis.',
        es: 'Simula la conexión de una pluma de contaminación vía análisis What-If.',
    },
    handleReportTitleChange: {
        pt: 'Altera o título do relatório de monitoramento ou conformidade.',
        en: 'Changes the title of the monitoring or compliance report.',
        es: 'Cambia el título del informe de monitoreo o cumplimiento.',
    },
    handleInsertSceneAnchor: {
        pt: 'Insere um ponto de ancoragem de cena no modelo 3D ambiental.',
        en: 'Inserts a scene anchor point into the environmental 3D model.',
        es: 'Inserta un punto de anclaje de escena en el modelo 3D ambiental.',
    },
    handleReportAnchorClick: {
        pt: 'Navega para um ponto de interesse específico no relatório ambiental.',
        en: 'Navigates to a specific point of interest in the environmental report.',
        es: 'Navega hacia un punto de interés específico en el reporte ambiental.',
    },
    handleExportReportPDF: {
        pt: 'Exporta relatório de conformidade e monitoramento em PDF.',
        en: 'Exports compliance and monitoring report as PDF.',
        es: 'Exporta informe de cumplimiento y monitoreo en PDF.',
    },
    handleScrollToReportAnchor: {
        pt: 'Rola a visualização para um ponto específico do relatório ambiental.',
        en: 'Scrolls the view to a specific anchor within the environmental report.',
        es: 'Desplaza la vista hacia un punto específico del informe ambiental.',
    },
    handleOpenReportOverlay: {
        pt: 'Abre o painel de sobreposição para visualização de relatórios ambientais.',
        en: 'Opens the overlay panel for environmental report visualization.',
        es: 'Abre el panel de superposición para visualización de informes ambientales.',
    },
    handleCloseReportOverlay: {
        pt: 'Fecha o painel de sobreposição de relatórios ambientais.',
        en: 'Closes the environmental report overlay panel.',
        es: 'Cierra el panel de superposición de informes ambientales.',
    },
    handleToggleReportSplit: {
        pt: 'Alterna a visualização dividida do relatório de monitoramento.',
        en: 'Toggles the split view of the monitoring report.',
        es: 'Alterna la vista dividida del informe de monitoreo.',
    },
    handleToggleReportReadMode: {
        pt: 'Alterna o modo de leitura do relatório de monitoramento ambiental.',
        en: 'Toggles the read-only mode for environmental monitoring reports.',
        es: 'Alterna el modo de lectura del informe de monitoreo ambiental.',
    },
    handleReportPrintPreview: {
        pt: 'Gera a prévia de impressão do relatório ambiental.',
        en: 'Generates the print preview for the environmental report.',
        es: 'Genera la vista previa de impresión del informe ambiental.',
    },
    handleLoginEmail: {
        pt: 'Realiza o login do usuário via e-mail para acessar a plataforma.',
        en: 'Logs in the user via email to access the platform.',
        es: 'Inicia sesión del usuario mediante email para acceder a la plataforma.',
    },
    handleRegisterEmail: {
        pt: 'Registra o e-mail do usuário para autenticação no sistema ECBT.',
        en: 'Registers user email for ECBT system authentication.',
        es: 'Registra el email del usuario para autenticación en el sistema ECBT.',
    },
    handleLoginGoogle: {
        pt: 'Autentica o usuário via Google para acessar o ecossistema ECBT.',
        en: 'Authenticates user via Google to access the ECBT ecosystem.',
        es: 'Autentica al usuario vía Google para acceder al ecosistema ECBT.',
    },
    handleLogout: {
        pt: 'Encerra a sessão do usuário na plataforma ECBT.',
        en: 'Logs out the user from the ECBT platform.',
        es: 'Cierra la sesión del usuario en la plataforma ECBT.',
    },
    handleToggleAuthMenu: {
        pt: 'Alterna a visibilidade do menu de autenticação do sistema.',
        en: 'Toggles the visibility of the system authentication menu.',
        es: 'Alterna la visibilidad del menú de autenticación del sistema.',
    },
    handleOpenAccessModal: {
        pt: 'Abre o modal de controle de acesso e permissões de dados.',
        en: 'Opens the data access and permissions control modal.',
        es: 'Abre el modal de control de acceso y permisos de datos.',
    },
    handleClaimOwnership: {
        pt: 'Reivindica a propriedade de um ativo ou dado no ecossistema.',
        en: 'Claims ownership of an asset or data within the ecosystem.',
        es: 'Reivindica la propiedad de un activo o dato en el ecosistema.',
    },
    handleAddAccessRule: {
        pt: 'Adiciona uma nova regra de acesso à governança de dados.',
        en: 'Adds a new access rule to the data governance.',
        es: 'Agrega una nueva regla de acceso a la gobernanza de datos.',
    },
    handleRemoveAccessRule: {
        pt: 'Remove uma regra de acesso à governança de dados do projeto.',
        en: 'Removes an access rule from the project data governance.',
        es: 'Elimina una regla de acceso a la gobernanza de datos del proyecto.',
    },
    handleUpdateAccessRule: {
        pt: 'Atualiza regras de acesso para controle de governança e dados.',
        en: 'Updates access rules for governance and data control.',
        es: 'Actualiza reglas de acceso para gobernanza y control de datos.',
    },
    handleObserverModeChange: {
        pt: 'Altera o modo de observação do modelo 3D e monitoramento.',
        en: 'Changes the 3D model and monitoring observation mode.',
        es: 'Cambia el modo de observación del modelo 3D y monitoreo.',
    },
    handleLoginGitHub: {
        pt: 'Autentica o usuário via GitHub para acesso à plataforma.',
        en: 'Authenticates the user via GitHub to access the platform.',
        es: 'Autentica al usuario vía GitHub para acceder a la plataforma.',
    },
    handleLoginMicrosoft: {
        pt: 'Autentica o usuário via Microsoft para acesso ao ecossistema ECBT.',
        en: 'Authenticates user via Microsoft to access the ECBT ecosystem.',
        es: 'Autentica al usuario vía Microsoft para acceder al ecosistema ECBT.',
    },
    handleForgotPassword: {
        pt: 'Inicia o fluxo de recuperação de senha do usuário.',
        en: 'Starts the user password recovery flow.',
        es: 'Inicia el flujo de recuperación de contraseña del usuario.',
    },
    handleOpenAuthModal: {
        pt: 'Abre o modal de autenticação para acesso ao sistema.',
        en: 'Opens the authentication modal to access the system.',
        es: 'Abre el modal de autenticación para acceder al sistema.',
    },
    handleCloseAuthModal: {
        pt: 'Fecha o modal de autenticação do sistema.',
        en: 'Closes the system authentication modal.',
        es: 'Cierra el modal de autenticación del sistema.',
    },
    updateAuthUI: {
        pt: 'Atualiza a interface de autenticação do sistema.',
        en: 'Updates the system authentication user interface.',
        es: 'Actualiza la interfaz de autenticación del sistema.',
    },
    handleSubmitObserverObservation: {
        pt: 'Registra uma nova observação ambiental de um elemento monitorado.',
        en: 'Submits a new environmental observation for a monitored element.',
        es: 'Registra una nueva observación ambiental de un elemento monitoreado.',
    },
    handleSubmitObserverForm: {
        pt: 'Envia o formulário de observação de campo ou monitoramento ambiental.',
        en: 'Submits the environmental monitoring or field observation form.',
        es: 'Envía el formulario de monitoreo ambiental u observación de campo.',
    },
    handleSubmitObserverComment: {
        pt: 'Envia um comentário de observação para um elemento monitorado.',
        en: 'Submits an observation comment for a monitored element.',
        es: 'Envía un comentario de observación para un elemento monitoreado.',
    },
    handleSubmitObserverCommentForm: {
        pt: 'Envia o formulário de comentário do observador no monitoramento.',
        en: 'Submits the observer comment form for environmental monitoring.',
        es: 'Envía el formulario de comentario del observador en el monitoreo.',
    },
    handleApproveObservation: {
        pt: 'Aprova uma observação técnica de monitoramento no modelo.',
        en: 'Approves a technical monitoring observation in the model.',
        es: 'Aprueba una observación técnica de monitoreo en el modelo.',
    },
    handleRejectObservation: {
        pt: 'Rejeita uma observação de monitoramento em um elemento específico.',
        en: 'Rejects a monitoring observation on a specific element.',
        es: 'Rechaza una observación de monitoreo en un elemento específico.',
    },
    handleObservationVariableChange: {
        pt: 'Atualiza o valor de uma variável de observação ambiental.',
        en: 'Updates an environmental observation variable value.',
        es: 'Actualiza el valor de una variable de observación ambiental.',
    },
    handleAddObservationVariable: {
        pt: 'Adiciona uma nova variável de observação ao elemento monitorado.',
        en: 'Adds a new observation variable to the monitored element.',
        es: 'Agrega una nueva variable de observación al elemento monitoreado.',
    },
    handleRemoveObservationVariable: {
        pt: 'Remove uma variável de observação de um elemento monitorado.',
        en: 'Removes an observation variable from a monitored element.',
        es: 'Elimina una variable de observación de un elemento monitoreado.',
    },
    handleRenameObservationVariable: {
        pt: 'Renomeia uma variável de observação ambiental (ex: parâmetro de monitoramento).',
        en: 'Renames an environmental observation variable (e.g., monitoring parameter).',
        es: 'Renombra una variable de observación ambiental (ej. parámetro de monitoreo).',
    },
    toggleAreaNode: {
        pt: 'Alterna a visibilidade de um nó de área no modelo 3D.',
        en: 'Toggles the visibility of an area node in the 3D model.',
        es: 'Alterna la visibilidad de un nodo de área en el modelo 3D.',
    },
    selectAreaNode: {
        pt: 'Seleciona um nó de área específico no modelo 3D para análise.',
        en: 'Selects a specific area node in the 3D model for analysis.',
        es: 'Selecciona un nodo de área específico en el modelo 3D para análisis.',
    },
    handleOpenLibraryManager: {
        pt: 'Abre o gerenciador de bibliotecas de ativos e modelos 3D.',
        en: 'Opens the library manager for 3D assets and models.',
        es: 'Abre el gestor de bibliotecas de activos y modelos 3D.',
    },
    handleOpenMarketplace: {
        pt: 'Abre o marketplace de bibliotecas de ativos ambientais e 3D.',
        en: 'Opens the marketplace for environmental and 3D asset libraries.',
        es: 'Abre el marketplace de librerías de activos ambientales y 3D.',
    },
    handleInstallLibrary: {
        pt: 'Instala uma biblioteca de dados ou modelos ambientais no projeto.',
        en: 'Installs an environmental data or model library into the project.',
        es: 'Instala una biblioteca de datos o modelos ambientales en el proyecto.',
    },
    handleUninstallLibrary: {
        pt: 'Remove uma biblioteca de ativos ambientais do projeto.',
        en: 'Removes an environmental asset library from the project.',
        es: 'Elimina una biblioteca de activos ambientales del proyecto.',
    },
    handleActivateLibrary: {
        pt: 'Ativa uma biblioteca de ativos ou modelos ambientais específicos.',
        en: 'Activates a library of specific environmental assets or models.',
        es: 'Activa una biblioteca de activos o modelos ambientales específicos.',
    },
    handleDeactivateLibrary: {
        pt: 'Desativa uma biblioteca de dados ou ativos do projeto.',
        en: 'Deactivates a data or asset library from the project.',
        es: 'Desactiva una biblioteca de datos o activos del proyecto.',
    },
    handleImportLibraryFile: {
        pt: 'Importa arquivos de bibliotecas para o modelo 3D.',
        en: 'Imports library files into the 3D model.',
        es: 'Importa archivos de librerías al modelo 3D.',
    },
    handleExportLibrary: {
        pt: 'Exporta a biblioteca de dados e modelos ambientais selecionados.',
        en: 'Exports the selected environmental data and model library.',
        es: 'Exporta la biblioteca de datos y modelos ambientales seleccionados.',
    },
    handleSearchMarketplace: {
        pt: 'Busca bibliotecas e ativos de monitoramento no marketplace.',
        en: 'Searches for monitoring libraries and assets in the marketplace.',
        es: 'Busca bibliotecas y activos de monitoreo en el marketplace.',
    },
    handleRateLibrary: {
        pt: 'Avalia a qualidade de uma biblioteca de modelos ou dados ambientais.',
        en: 'Rates the quality of an environmental model or data library.',
        es: 'Evalúa la calidad de una biblioteca de modelos o datos ambientales.',
    },
    handleMarketOpenWizard: {
        pt: 'Abre o assistente de seleção de ativos e bibliotecas do modelo.',
        en: 'Opens the asset and library selection wizard for the model.',
        es: 'Abre el asistente de selección de activos y librerías del modelo.',
    },
    handleMarketSearch: {
        pt: 'Busca recursos e bibliotecas de ativos no marketplace do ecossistema.',
        en: 'Searches for resources and asset libraries in the ecosystem marketplace.',
        es: 'Busca recursos y librerías de activos en el marketplace del ecosistema.',
    },
    handleMarketBuyListing: {
        pt: 'Compra um item ou ativo de monitoramento no marketplace.',
        en: 'Purchases a monitoring item or asset from the marketplace.',
        es: 'Compra un ítem o activo de monitoreo en el marketplace.',
    },
    handleMarketOpenRfqPrompt: {
        pt: 'Abre prompt de RFQ para negociação de ativos ou serviços ambientais.',
        en: 'Opens RFQ prompt for trading environmental assets or services.',
        es: 'Abre prompt de RFQ para negociar activos o servicios ambientales.',
    },
    handleMarketPublishListing: {
        pt: 'Publica listagem de ativos ou dados ambientais no marketplace.',
        en: 'Publishes environmental asset or data listings to the marketplace.',
        es: 'Publica listados de activos o datos ambientales en el marketplace.',
    },
    handleMarketMarkNotificationRead: {
        pt: 'Marca uma notificação de mercado como lida.',
        en: 'Marks a market notification as read.',
        es: 'Marca una notificación de mercado como leída.',
    },
    handleMarketAdminModerate: {
        pt: 'Modera listagens de ativos ou dados no marketplace do ecossistema.',
        en: 'Moderates asset or data listings within the ecosystem marketplace.',
        es: 'Modera listados de activos o datos en el marketplace del ecosistema.',
    },
    handleMarketAdminResolveDispute: {
        pt: 'Resolve disputas de governança no marketplace de dados ambientais.',
        en: 'Resolves governance disputes in the environmental data marketplace.',
        es: 'Resuelve disputas de gobernanza en el marketplace de datos ambientales.',
    },
    handleOpenCreditsHub: {
        pt: 'Abre o hub de créditos para gestão de ativos ambientais e compensação.',
        en: 'Opens the credits hub for environmental asset and offset management.',
        es: 'Abre el hub de créditos para gestión de activos ambientales y compensación.',
    },
    handleCloseCreditsHub: {
        pt: 'Fecha o painel de gestão de créditos ambientais/blockchain.',
        en: 'Closes the environmental credits/blockchain management hub.',
        es: 'Cierra el panel de gestión de créditos ambientales/blockchain.',
    },
    handleRefreshCreditsHub: {
        pt: 'Atualiza o saldo de créditos ambientais no hub da carteira.',
        en: 'Refreshes environmental credit balances in the wallet hub.',
        es: 'Actualiza el saldo de créditos ambientales en el hub de la billetera.',
    },
    handleEnterShapeEdit: {
        pt: 'Inicia a edição da forma de um elemento no modelo 3D.',
        en: 'Starts shape editing for a 3D model element.',
        es: 'Inicia la edición de la forma de un elemento en el modelo 3D.',
    },
    handleEnterGizmoMode: {
        pt: 'Ativa o modo de manipulação 3D (Gizmo) para o elemento selecionado.',
        en: 'Activates 3D manipulation mode (Gizmo) for the selected element.',
        es: 'Activa el modo de manipulación 3D (Gizmo) para el elemento seleccionado.',
    },
    handleExitShapeEdit: {
        pt: 'Finaliza a edição de uma forma geométrica no modelo 3D.',
        en: 'Exits the geometric shape editing mode in the 3D model.',
        es: 'Finaliza la edición de una forma geométrica en el modelo 3D.',
    },
    handleToggleDrawMode: {
        pt: 'Alterna o modo de desenho para modelagem de elementos no ambiente 3D.',
        en: 'Toggles drawing mode for modeling elements in the 3D environment.',
        es: 'Alterna el modo de dibujo para modelar elementos en el entorno 3D.',
    },
    handleDeleteSelectedVertex: {
        pt: 'Remove o vértice selecionado da geometria do modelo 3D.',
        en: 'Removes the selected vertex from the 3D model geometry.',
        es: 'Elimina el vértice seleccionado de la geometría del modelo 3D.',
    },
    handleResetShape: {
        pt: 'Redefine a geometria ou forma do elemento selecionado no modelo 3D.',
        en: 'Resets the geometry or shape of the selected 3D model element.',
        es: 'Redefine la geometría o forma del elemento 3D seleccionado.',
    },
    handleToggleSnap: {
        pt: 'Alterna o modo de ajuste magnético (snap) na edição do modelo 3D.',
        en: 'Toggles the magnetic snapping mode during 3D model editing.',
        es: 'Alterna el modo de ajuste magnético (snap) en la edición 3D.',
    },
    handleSetGridSize: {
        pt: 'Define o tamanho da grade de visualização do modelo 3D.',
        en: 'Sets the grid size for the 3D model visualization.',
        es: 'Define el tamaño de la cuadrícula para la visualización 3D.',
    },
    handleSetGizmoMode: {
        pt: 'Altera o modo de manipulação do gizmo de edição no modelo 3D.',
        en: 'Changes the gizmo manipulation mode in the 3D model.',
        es: 'Cambia el modo de manipulación del gizmo en el modelo 3D.',
    },
    handleToggleGizmoSpace: {
        pt: 'Alterna a visibilidade do gizmo de manipulação espacial no modelo 3D.',
        en: 'Toggles the spatial manipulation gizmo visibility in the 3D model.',
        es: 'Alterna la visibilidad del gizmo de manipulación espacial en el modelo 3D.',
    },
    handleToggleGizmoShapeEdit: {
        pt: 'Alterna a edição de forma do gizmo para ajustar elementos 3D.',
        en: 'Toggles gizmo shape editing to adjust 3D environmental elements.',
        es: 'Alterna la edición de forma del gizmo para ajustar elementos 3D.',
    },
    handleSetCoordinate: {
        pt: 'Define a coordenada de um eixo para posicionamento de elementos 3D.',
        en: 'Sets an axis coordinate for positioning 3D environmental elements.',
        es: 'Define la coordenada de un eje para posicionar elementos 3D.',
    },
    handleZoomToElement: {
        pt: 'Foca a visualização 3D no elemento ambiental selecionado.',
        en: 'Zooms the 3D view into the selected environmental element.',
        es: 'Enfoca la vista 3D en el elemento ambiental seleccionado.',
    },
    handleZoomToFamily: {
        pt: 'Foca a visualização 3D em um grupo específico de elementos.',
        en: 'Zooms the 3D view into a specific group of elements.',
        es: 'Enfoca la vista 3D en un grupo específico de elementos.',
    },
    handleDuplicateElement: {
        pt: 'Duplica um elemento ambiental selecionado no modelo 3D.',
        en: 'Duplicates a selected environmental element in the 3D model.',
        es: 'Duplica un elemento ambiental seleccionado en el modelo 3D.',
    },
    handleShowAllFamily: {
        pt: 'Exibe todos os elementos de uma mesma família no modelo 3D.',
        en: 'Displays all elements of a specific family in the 3D model.',
        es: 'Muestra todos los elementos de una misma familia en el modelo 3D.',
    },
    handleHideAllFamily: {
        pt: 'Oculta todos os elementos de uma mesma família no modelo 3D.',
        en: 'Hides all elements of a specific family in the 3D model.',
        es: 'Oculta todos los elementos de una misma familia en el modelo 3D.',
    },
    handleToggleDetailsDock: {
        pt: 'Alterna a visibilidade do painel de detalhes do elemento selecionado.',
        en: "Toggles the visibility of the selected element's details panel.",
        es: 'Alterna la visibilidad del panel de detalles del elemento seleccionado.',
    },
    handleToggleHudCards: {
        pt: 'Alterna a visibilidade dos cartões de informações da HUD.',
        en: 'Toggles the visibility of HUD information cards.',
        es: 'Alterna la visibilidad de las tarjetas de información de la HUD.',
    },
    handleToggleHudCard: {
        pt: 'Alterna a visibilidade de um card de informações no HUD.',
        en: 'Toggles the visibility of an information card in the HUD.',
        es: 'Alterna la visibilidad de una tarjeta de información en el HUD.',
    },
    handleExpandAllHudCards: {
        pt: 'Expande todos os cartões de informações do HUD no monitoramento 3D.',
        en: 'Expands all HUD information cards in the 3D monitoring view.',
        es: 'Expande todas las tarjetas de información del HUD en el monitoreo 3D.',
    },
    handleCollapseAllHudCards: {
        pt: 'Recolhe todos os cartões de informação da interface (HUD).',
        en: 'Collapses all information cards in the HUD interface.',
        es: 'Recoge todas las tarjetas de información de la interfaz (HUD).',
    },
    handleToggleVizSettings: {
        pt: 'Alterna a visibilidade das configurações de visualização do modelo 3D.',
        en: 'Toggles the visibility of the 3D model visualization settings.',
        es: 'Alterna la visibilidad de los ajustes de visualización del modelo 3D.',
    },
    handleToggleVizSettingsCollapsed: {
        pt: 'Alterna a visibilidade do painel de configurações de visualização 3D.',
        en: 'Toggles the visibility of the 3D visualization settings panel.',
        es: 'Alterna la visibilidad del panel de ajustes de visualización 3D.',
    },
    handleApplyVizPreset: {
        pt: 'Aplica um preset de visualização ao modelo 3D e dados ambientais.',
        en: 'Applies a visualization preset to the 3D model and environmental data.',
        es: 'Aplica un preset de visualización al modelo 3D y datos ambientales.',
    },
    handleVizSettingChange: {
        pt: 'Altera configurações de visualização do modelo 3D e monitoramento.',
        en: 'Changes 3D model and monitoring visualization settings.',
        es: 'Cambia la configuración de visualización del modelo 3D y monitoreo.',
    },
    handleSaveVizPreset: {
        pt: 'Salva as configurações de visualização do modelo 3D.',
        en: 'Saves the 3D model visualization settings.',
        es: 'Guarda la configuración de visualización del modelo 3D.',
    },
    handleDeleteVizPreset: {
        pt: 'Remove um preset de visualização das configurações de cena.',
        en: 'Removes a visualization preset from the scene settings.',
        es: 'Elimina un preset de visualización de la configuración de escena.',
    },
    handleResetVizSettings: {
        pt: 'Redefine as configurações de visualização do modelo 3D.',
        en: 'Resets the 3D model visualization settings.',
        es: 'Restablece la configuración de visualización del modelo 3D.',
    },
    handleOpenClipPlanes: {
        pt: 'Abre os planos de corte para visualização interna da pluma ou solo.',
        en: 'Opens clip planes to view internal plumes or soil layers.',
        es: 'Abre los planos de corte para ver la pluma o el suelo interno.',
    },
    handleCloseClipPlanes: {
        pt: 'Fecha os planos de corte da visualização 3D do modelo.',
        en: 'Closes the 3D model clip planes visualization.',
        es: 'Cierra los planos de corte de la visualización 3D.',
    },
    handleAddClipPlane: {
        pt: 'Adiciona um plano de corte para visualização interna do modelo 3D.',
        en: 'Adds a clip plane for internal 3D model visualization.',
        es: 'Agrega un plano de corte para visualización interna del modelo 3D.',
    },
    handleRemoveClipPlane: {
        pt: 'Remove o plano de corte da visualização 3D da cena.',
        en: 'Removes the clip plane from the 3D scene visualization.',
        es: 'Elimina el plano de corte de la visualización 3D de la escena.',
    },
    handleDuplicateClipPlane: {
        pt: 'Duplica o plano de corte da visualização 3D do modelo.',
        en: "Duplicates the 3D model's clip plane for visualization.",
        es: 'Duplica el plano de corte de la visualización 3D del modelo.',
    },
    handleToggleClipPlane: {
        pt: 'Alterna a visualização do plano de corte no modelo 3D.',
        en: 'Toggles the clip plane visibility in the 3D model.',
        es: 'Alterna la visibilidad del plano de corte en el modelo 3D.',
    },
    handleUpdateClipPlaneField: {
        pt: 'Atualiza o campo de plano de corte para visualização da área 3D.',
        en: 'Updates the clip plane field for 3D area visualization.',
        es: 'Actualiza el campo del plano de corte para visualización 3D.',
    },
    handleSetClipPlaneScope: {
        pt: 'Define o escopo do plano de corte para visualização 3D da área.',
        en: 'Sets the clip plane scope for 3D area visualization.',
        es: 'Define el alcance del plano de corte para visualización 3D.',
    },
    handleToggleClipPlaneElement: {
        pt: 'Alterna a visibilidade de um elemento no plano de corte 3D.',
        en: 'Toggles visibility of an element in the 3D clip plane.',
        es: 'Alterna la visibilidad de un elemento en el plano de corte 3D.',
    },
    handleToggleInspector: {
        pt: 'Alterna a visibilidade do painel de inspeção de dados ambientais.',
        en: 'Toggles the visibility of the environmental data inspector panel.',
        es: 'Alterna la visibilidad del panel de inspección de datos ambientales.',
    },
    handleToggleNode: {
        pt: 'Alterna a visibilidade de um nó no inspetor de elementos 3D.',
        en: 'Toggles the visibility of a node in the 3D element inspector.',
        es: 'Alterna la visibilidad de un nodo en el inspector de elementos 3D.',
    },
    handleStartEdit: {
        pt: 'Inicia a edição de um elemento ou parâmetro no inspetor.',
        en: 'Starts editing an element or parameter in the inspector.',
        es: 'Inicia la edición de un elemento o parámetro en el inspector.',
    },
    handleConfirmEdit: {
        pt: 'Confirma a edição de um elemento ou parâmetro no inspetor.',
        en: 'Confirms the editing of an element or parameter in the inspector.',
        es: 'Confirma la edición de un elemento o parámetro en el inspector.',
    },
    handleExpandAllNodes: {
        pt: 'Expande todos os nós da árvore de inspeção do modelo 3D.',
        en: 'Expands all nodes in the 3D model inspection tree.',
        es: 'Expande todos los nodos del árbol de inspección del modelo 3D.',
    },
    handleCollapseAllNodes: {
        pt: 'Recolhe todos os nós da árvore de inspeção do modelo 3D.',
        en: 'Collapses all nodes in the 3D model inspection tree.',
        es: 'Contrae todos los nodos del árbol de inspección del modelo 3D.',
    },
    handleInspectorSearch: {
        pt: 'Busca inspetores ou agentes de monitoramento ambiental via query.',
        en: 'Searches for environmental inspectors or monitoring agents via query.',
        es: 'Busca inspectores o agentes de monitoreo ambiental mediante consulta.',
    },
    handleCopyPath: {
        pt: 'Copia o caminho do elemento selecionado no inspetor do modelo 3D.',
        en: "Copies the selected element's path in the 3D model inspector.",
        es: 'Copia la ruta del elemento seleccionado en el inspector 3D.',
    },
    handleTogglePerfMonitor: {
        pt: 'Alterna a exibição do monitor de performance do sistema.',
        en: 'Toggles the system performance monitor display.',
        es: 'Alterna la visualización del monitor de rendimiento del sistema.',
    },
    handleToggleFocusMode: {
        pt: 'Alterna o modo de foco na visualização do modelo 3D.',
        en: 'Toggles the focus mode in the 3D model view.',
        es: 'Alterna el modo de enfoque en la vista del modelo 3D.',
    },
    handleCaptureSnapshot: {
        pt: 'Captura um snapshot da visualização 3D do cenário ambiental.',
        en: 'Captures a 3D snapshot of the environmental scene view.',
        es: 'Captura una instantánea de la vista 3D del escenario ambiental.',
    },
    toggleConstellationCollapse: {
        pt: 'Alterna a expansão/recolhimento da constelação de dados no visualizador.',
        en: 'Toggles the expansion/collapse of the data constellation in the viewer.',
        es: 'Alterna la expansión/colapso de la constelación de datos en el visor.',
    },
    handleImportBorehole: {
        pt: 'Importa dados de poços de monitoramento para o modelo 3D.',
        en: 'Imports borehole monitoring data into the 3D model.',
        es: 'Importa datos de pozos de monitoreo al modelo 3D.',
    },
    handleValidateBorehole: {
        pt: 'Valida os dados técnicos de um poço de monitoramento.',
        en: 'Validates technical data of a monitoring borehole.',
        es: 'Valida los datos técnicos de un pozo de monitoreo.',
    },
    handleImportBoreholeFromText: {
        pt: 'Importa dados de poços de monitoramento a partir de texto.',
        en: 'Imports borehole monitoring data from text.',
        es: 'Importa datos de pozos de monitoreo desde texto.',
    },
    handleOpenPipelineManager: {
        pt: 'Abre o gerenciador de pipelines de processamento de dados ambientais.',
        en: 'Opens the environmental data processing pipeline manager.',
        es: 'Abre el gestor de pipelines de procesamiento de datos ambientales.',
    },
    handleNewPipeline: {
        pt: 'Inicia um novo pipeline de processamento de dados ambientais.',
        en: 'Starts a new environmental data processing pipeline.',
        es: 'Inicia un nuevo pipeline de procesamiento de datos ambientales.',
    },
    handleEditPipeline: {
        pt: 'Edita o pipeline de processamento de dados ambientais.',
        en: 'Edits the environmental data processing pipeline.',
        es: 'Edita el pipeline de procesamiento de datos ambientales.',
    },
    handleRunPipeline: {
        pt: 'Executa o pipeline de processamento de dados do modelo.',
        en: "Executes the model's data processing pipeline.",
        es: 'Ejecuta el pipeline de procesamiento de datos del modelo.',
    },
    handleDeletePipeline: {
        pt: 'Remove um pipeline de processamento de dados ambientais.',
        en: 'Removes an environmental data processing pipeline.',
        es: 'Elimina un pipeline de procesamiento de datos ambientales.',
    },
    handleCreateIssueAtPosition: {
        pt: 'Registra uma ocorrência ou anomalia ambiental em uma coordenada 3D.',
        en: 'Registers an environmental issue or anomaly at a 3D position.',
        es: 'Registra una incidencia o anomalía ambiental en una posición 3D.',
    },
    handleResolveIssue: {
        pt: 'Resolve uma inconformidade ou problema identificado no monitoramento.',
        en: 'Resolves a non-compliance or issue identified in the monitoring.',
        es: 'Resuelve una inconformidad o problema identificado en el monitoreo.',
    },
    handleDeleteIssue: {
        pt: 'Remove um problema/não-conformidade (ação destrutiva).',
        en: 'Removes an issue or non-compliance (destructive action).',
        es: 'Elimina un problema o incumplimiento (acción destructiva).',
    },
    handleFocusIssue: {
        pt: 'Foca em um problema ambiental específico no modelo 3D.',
        en: 'Focuses on a specific environmental issue within the 3D model.',
        es: 'Enfoca un problema ambiental específico en el modelo 3D.',
    },
    handleOpenIssuesPanel: {
        pt: 'Abre o painel de ocorrências e inconformidades ambientais.',
        en: 'Opens the environmental issues and non-compliance panel.',
        es: 'Abre el panel de incidencias e no conformidades ambientales.',
    },
    handleGetIssues: {
        pt: 'Recupera a lista de inconformidades e problemas ambientais detectados.',
        en: 'Retrieves the list of detected environmental issues and non-compliances.',
        es: 'Recupera la lista de problemas e inconformidades ambientales detectadas.',
    },
    handleGetOpenIssueCount: {
        pt: 'Recupera a contagem de pendências de conformidade ou monitoramento abertas.',
        en: 'Retrieves the count of open compliance or monitoring issues.',
        es: 'Recupera el conteo de incidencias de cumplimiento o monitoreo abiertas.',
    },
    handleCreateIssuesFromValidation: {
        pt: 'Cria ocorrências de conformidade a partir de validações de dados.',
        en: 'Creates compliance issues based on data validation results.',
        es: 'Crea incidencias de cumplimiento basadas en validaciones de datos.',
    },
    handleOpenBountyPanel: {
        pt: 'Abre o painel de recompensas (bounties) para monitoramento ou dados.',
        en: 'Opens the bounty panel for monitoring or data tasks.',
        es: 'Abre el panel de recompensas para monitoreo o datos.',
    },
    handleCreateBounty: {
        pt: 'Cria uma recompensa (bounty) para tarefas de monitoramento ou coleta.',
        en: 'Creates a bounty for monitoring or data collection tasks.',
        es: 'Crea una recompensa para tareas de monitoreo o recolección.',
    },
    handleClaimBounty: {
        pt: 'Resgata recompensa de bounty vinculada a um issue específico.',
        en: 'Claims a bounty reward linked to a specific issue.',
        es: 'Reclama una recompensa de bounty vinculada a un issue específico.',
    },
    handleSubmitBountyResolution: {
        pt: 'Finaliza a resolução de uma recompensa (bounty) de monitoramento.',
        en: 'Submits the resolution of a monitoring bounty.',
        es: 'Envía la resolución de una recompensa de monitoreo.',
    },
    handleVerifyBountyResolution: {
        pt: 'Verifica a resolução de recompensas (bounties) de monitoramento.',
        en: 'Verifies the resolution of environmental monitoring bounties.',
        es: 'Verifica la resolución de recompensas de monitoreo ambiental.',
    },
    handleGetLeaderboard: {
        pt: 'Recupera o ranking de recompensas (bounties) do ecossistema.',
        en: 'Retrieves the bounty leaderboard for the ecosystem.',
        es: 'Recupera el ranking de recompensas (bounties) del ecosistema.',
    },
    handleGetOpenBountyCount: {
        pt: 'Recupera a contagem de recompensas (bounties) abertas no sistema.',
        en: 'Retrieves the count of open bounties in the system.',
        es: 'Recupera el recuento de recompensas (bounties) abiertas en el sistema.',
    },
    handleCaptureBountyScreenshot: {
        pt: 'Captura print da evidência para validação de bounty ambiental.',
        en: 'Captures screenshot of evidence for environmental bounty validation.',
        es: 'Captura captura de pantalla de evidencia para validación de bounty.',
    },
    handleCreateServiceRequest: {
        pt: 'Cria uma nova solicitação de serviço de bounty no sistema.',
        en: 'Creates a new bounty service request in the system.',
        es: 'Crea una nueva solicitud de servicio de bounty en el sistema.',
    },
    handlePublishServiceRequest: {
        pt: 'Publica uma solicitação de serviço de bounty para o ecossistema.',
        en: 'Publishes a bounty service request to the ecosystem.',
        es: 'Publica una solicitud de servicio de bounty al ecosistema.',
    },
    handleFeedbackLike: {
        pt: 'Registra uma curtida no feedback da interface ou análise de dados.',
        en: 'Registers a like on UI feedback or data analysis.',
        es: "Registra un 'like' en el feedback de la interfaz o análisis de datos.",
    },
    handleFeedbackDislike: {
        pt: 'Registra feedback negativo sobre uma interação ou análise da interface.',
        en: 'Registers negative feedback on a UI interaction or analysis.',
        es: 'Registra feedback negativo sobre una interacción o análisis de la UI.',
    },
});

export function getActionDescription(actionName: string, locale: 'pt' | 'en' | 'es' = 'pt'): string {
    const entry = ACTION_DESCRIPTIONS[actionName];
    if (!entry) return '';
    return entry[locale] || entry.pt || '';
}
