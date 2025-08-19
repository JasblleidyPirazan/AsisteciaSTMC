/**
 * CONTROLADOR DE ASISTENCIA - VERSIÓN INTEGRADA FINAL
 * ===================================================
 * FLUJO COMPLETO CORREGIDO:
 * 1. Seleccionar grupo ✅ 
 * 2. "¿Se realizó la clase?" ✅ 
 * 3. "Sí, se realizó" ✅ 
 * 4. Seleccionar asistente → CLASE CREADA AQUÍ ✅
 * 5. Formulario de asistencia (classId ya disponible) ✅ 
 * 6. Botón "Reposición Individual" → FUNCIONA ✅
 * 7. Vista previa y confirmación → GUARDADO FINAL ✅
 */

const AttendanceController = {
    // Estado interno del controlador
    _state: {
        currentGroup: null,
        currentStudents: [],
        availableAssistants: [],
        selectedAssistant: null,
        attendanceData: {},
        attendanceType: 'regular',
        isProcessing: false,
        classId: null,
        draftSession: null,
        lastClickTimes: {}
    },

    /**
     * Inicializa el controlador y carga asistentes
     */
    async initialize() {
        debugLog('AttendanceController: Inicializando...');
        
        try {
            // Cargar asistentes disponibles
            const assistants = await AssistantService.getActiveAssistants();
            this._setState({ availableAssistants: assistants });
            
            debugLog(`AttendanceController: ${assistants.length} asistentes disponibles`);
            
        } catch (error) {
            console.error('AttendanceController: Error al inicializar:', error);
            // Continuar sin asistentes si hay error
            this._setState({ availableAssistants: [] });
        }
    },

    /**
     * Selecciona un grupo y va DIRECTO a pregunta de estado
     */
    async selectGroup(groupCode) {
        debugLog(`AttendanceController: Seleccionando grupo ${groupCode}`);
        
        try {
            this._setState({ isProcessing: true });
            
            // Encontrar el grupo
            const group = await GroupService.getGroupByCode(groupCode);
            this._setState({ currentGroup: group });
            
            // Inicializar asistentes si no se ha hecho
            if (this._state.availableAssistants.length === 0) {
                await this.initialize();
            }
            
            // Ir DIRECTO a pregunta de estado (eliminar primer selector de asistente)
            await this.showClassStatusQuestion(groupCode);
            
        } catch (error) {
            console.error('AttendanceController: Error al seleccionar grupo:', error);
            UIUtils.showError('Error al cargar el grupo');
            AppController.showDashboard();
        } finally {
            this._setState({ isProcessing: false });
        }
    },

    /**
     * Muestra la pregunta inicial sobre el estado de la clase (SIN asistente)
     */
    async showClassStatusQuestion(groupCode) {
        debugLog(`AttendanceController: Mostrando pregunta de estado para ${groupCode}`);
        
        try {
            const group = this._state.currentGroup || await GroupService.getGroupByCode(groupCode);
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            
            // NO pasar selectedAssistant porque aún no se ha seleccionado
            const html = AttendanceFormView.renderClassStatusQuestion({
                group,
                selectedDate,
                selectedAssistant: null // Siempre null en esta etapa
            });
            
            document.getElementById('app').innerHTML = html;
            
        } catch (error) {
            console.error('AttendanceController: Error mostrando pregunta de estado:', error);
            UIUtils.showError('Error al cargar la información del grupo');
        }
    },

    /**
     * La clase se realizó - AHORA pregunta por asistente por primera vez
     */
    async classWasHeld(groupCode) {
        debugLog(`AttendanceController: Clase realizada para grupo ${groupCode} - FLUJO CORREGIDO`);
        
        try {
            this._setState({ isProcessing: true, attendanceType: 'regular' });
            
            UIUtils.showLoading('app', 'Cargando estudiantes...');
            
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            
            // 1. Validar que se pueda reportar la clase
            const validation = await ClassControlService.validateClassReport(selectedDate, groupCode);
            
            if (!validation.valid) {
                // Si ya existe, mostrar información
                if (validation.existingClass) {
                    const existingClass = validation.existingClass;
                    const message = `Esta clase ya fue reportada como "${existingClass.estado}" el ${DateUtils.formatDate(existingClass.fecha)}`;
                    
                    ModalsController.showConfirmation({
                        title: 'Clase Ya Reportada',
                        message: message,
                        icon: 'ℹ️',
                        type: 'info'
                    }, () => {
                        AppController.showDashboard();
                    });
                    return;
                }
                
                throw new Error(validation.error);
            }
            
            // 2. Obtener grupo y estudiantes PRIMERO
            const group = await GroupService.getGroupByCode(groupCode);
            const students = await StudentService.getStudentsByGroup(groupCode);
            
            if (students.length === 0) {
                UIUtils.showWarning('No hay estudiantes registrados en este grupo');
                await this.showClassStatusQuestion(groupCode);
                return;
            }
            
            // 3. Actualizar estado
            this._setState({
                currentGroup: group,
                currentStudents: students,
                attendanceData: {}
            });
            
            // 4. AHORA SÍ preguntar por asistente (primera y única vez)
            await this.showAssistantSelectorForAttendance(groupCode);
            
        } catch (error) {
            console.error('AttendanceController: Error al procesar clase realizada:', error);
            UIUtils.showError(error.message || 'Error al procesar la clase');
            await this.showClassStatusQuestion(groupCode);
        } finally {
            this._setState({ isProcessing: false });
        }
    },

    /**
     * Selector de asistente PARA ASISTENCIA (única vez en el flujo)
     */
    async showAssistantSelectorForAttendance(groupCode) {
        debugLog(`AttendanceController: Mostrando selector de asistente para asistencia ${groupCode}`);
        
        try {
            const group = this._state.currentGroup;
            const assistants = this._state.availableAssistants;
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            
            const html = `
                <div class="container">
                    <!-- Header -->
                    <header class="flex items-center justify-between mb-6 bg-white rounded-lg p-6 shadow-sm">
                        <div class="flex items-center">
                            <button onclick="AttendanceController.showClassStatusQuestion('${groupCode}')" class="btn btn-neutral mr-4">
                                ← Volver
                            </button>
                            <div>
                                <h1 class="text-2xl font-bold text-gray-900">Seleccionar Asistente</h1>
                                <p class="text-gray-600">${DateUtils.formatDate(selectedDate)}</p>
                            </div>
                        </div>
                    </header>

                    <!-- Información del Grupo -->
                    <div class="bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg p-6 mb-6 text-white">
                        <div class="text-center">
                            <h2 class="text-xl font-bold mb-2">${group.descriptor || 'Grupo sin nombre'}</h2>
                            <p class="opacity-90">Clase confirmada como realizada</p>
                            <p class="text-sm opacity-75 mt-2">¿Quién está tomando la asistencia hoy?</p>
                        </div>
                    </div>

                    <!-- Selector de Asistente -->
                    ${this.renderAssistantOptionsForAttendance(assistants, groupCode)}
                </div>
            `;
            
            document.getElementById('app').innerHTML = html;
            
        } catch (error) {
            console.error('AttendanceController: Error mostrando selector de asistente para asistencia:', error);
            UIUtils.showError('Error al cargar selector de asistente');
        }
    },

    /**
     * Opciones de asistente para asistencia
     */
    renderAssistantOptionsForAttendance(assistants, groupCode) {
        if (assistants.length === 0) {
            return `
                <div class="bg-white rounded-lg p-8 shadow-sm text-center">
                    <div class="text-6xl mb-6">👨‍🏫</div>
                    <h3 class="text-2xl font-bold text-gray-900 mb-4">No hay asistentes disponibles</h3>
                    <p class="text-gray-600 mb-6">No se encontraron asistentes configurados en el sistema</p>
                    <div class="space-y-3">
                        <button onclick="AttendanceController.continueToAttendanceWithoutAssistant('${groupCode}')" 
                                class="btn btn-primary w-full">
                            Continuar Sin Asistente
                        </button>
                        <button onclick="AttendanceController.showClassStatusQuestion('${groupCode}')" 
                                class="btn btn-outline w-full">
                            ← Volver
                        </button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="bg-white rounded-lg p-6 shadow-sm">
                <h3 class="text-lg font-semibold mb-6">Selecciona el asistente:</h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${assistants.map(assistant => `
                        <div class="assistant-option border-2 border-gray-200 rounded-lg p-4 hover:border-primary-300 hover:bg-primary-50 transition-colors cursor-pointer"
                             onclick="AttendanceController.selectAssistantForAttendance('${assistant.id}')">
                            <div class="flex items-center">
                                <div class="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mr-4">
                                    <span class="text-2xl">👨‍🏫</span>
                                </div>
                                <div>
                                    <h4 class="font-medium text-gray-900">${assistant.nombre}</h4>
                                    <p class="text-sm text-gray-500">ID: ${assistant.id}</p>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <div class="mt-6 pt-6 border-t border-gray-200">
                    <button onclick="AttendanceController.continueToAttendanceWithoutAssistant('${groupCode}')" 
                            class="btn btn-outline w-full">
                        Continuar Sin Asistente
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Selecciona asistente, CREA CLASE y va a asistencia
     */
    async selectAssistantForAttendance(assistantId) {
        debugLog(`AttendanceController: Asistente seleccionado para asistencia: ${assistantId}`);
        
        try {
            // 1. Buscar asistente
            const assistant = this._state.availableAssistants.find(a => a.id === assistantId);
            if (!assistant) {
                throw new Error(`Asistente ${assistantId} no encontrado`);
            }
            
            // 2. Guardar asistente en estado
            this._setState({ selectedAssistant: assistant });
            
            // 3. CREAR REGISTRO DE CLASE INMEDIATAMENTE
            await this._createClassRecord(assistantId);
            
            // 4. Ir al formulario de asistencia (ya con classId válido)
            await this.showAttendanceFormDirect();
            
        } catch (error) {
            console.error('AttendanceController: Error al seleccionar asistente para asistencia:', error);
            UIUtils.showError(`Error al registrar la clase: ${error.message}`);
            // Volver al selector de asistente en caso de error
            await this.showAssistantSelectorForAttendance(this._state.currentGroup.codigo);
        }
    },

    /**
     * Continúa sin asistente, CREA CLASE y va a asistencia
     */
    async continueToAttendanceWithoutAssistant(groupCode) {
        debugLog('AttendanceController: Continuando sin asistente a asistencia');
        
        try {
            // 1. Establecer asistente como null
            this._setState({ selectedAssistant: null });
            
            // 2. CREAR REGISTRO DE CLASE SIN ASISTENTE
            await this._createClassRecord('');
            
            // 3. Ir al formulario de asistencia (ya con classId válido)
            await this.showAttendanceFormDirect();
            
        } catch (error) {
            console.error('AttendanceController: Error al continuar sin asistente:', error);
            UIUtils.showError(`Error al registrar la clase: ${error.message}`);
            // Volver al selector de asistente en caso de error
            await this.showAssistantSelectorForAttendance(groupCode);
        }
    },

    /**
     * Crea el registro de clase inmediatamente después de seleccionar asistente
     */
    async _createClassRecord(assistantId) {
        debugLog('AttendanceController: Creando registro de clase...');
        
        try {
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const groupCode = this._state.currentGroup.codigo;
            
            // Mostrar indicador de carga
            UIUtils.showLoading('app', 'Creando registro de clase...');
            
            // Crear el registro de clase usando ClassControlService
            const classRecord = await ClassControlService.createClassRecord(
                selectedDate,
                groupCode,
                ClassControlService.CLASS_STATES.REALIZADA,
                {
                    asistenteId: assistantId || '',
                    creadoPor: window.AppState.user?.email || 'usuario'
                }
            );
            
            // Guardar el ID de clase en el estado
            this._setState({ classId: classRecord.id });
            
            debugLog(`AttendanceController: Clase creada con ID: ${classRecord.id}`);
            
        } catch (error) {
            console.error('AttendanceController: Error creando registro de clase:', error);
            throw new Error(`No se pudo crear el registro de clase: ${error.message}`);
        }
    },

    /**
     * Muestra formulario de asistencia directamente
     */
    async showAttendanceFormDirect() {
        debugLog('AttendanceController: Mostrando formulario de asistencia directamente');
        
        try {
            const group = this._state.currentGroup;
            const students = this._state.currentStudents;
            const selectedAssistant = this._state.selectedAssistant;
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            
            // Usar el componente existente
            const html = AttendanceFormView.renderAttendanceForm({
                group,
                students,
                selectedDate,
                attendanceType: 'regular',
                selectedAssistant
            });
            
            document.getElementById('app').innerHTML = html;
            
            // Agregar modales necesarios si no existen
            if (!document.getElementById('justification-modal')) {
                document.body.insertAdjacentHTML('beforeend', ModalsView.renderJustificationModal());
            }
            
        } catch (error) {
            console.error('AttendanceController: Error mostrando formulario de asistencia:', error);
            UIUtils.showError('Error al cargar formulario de asistencia');
        }
    },

    /**
     * La clase fue cancelada - usar ClassControlService
     */
    async classWasCancelled(groupCode) {
        debugLog(`AttendanceController: Clase cancelada para grupo ${groupCode}`);
        
        try {
            const group = this._state.currentGroup || await GroupService.getGroupByCode(groupCode);
            const selectedAssistant = this._state.selectedAssistant;
            
            this._setState({ currentGroup: group });
            
            // Mostrar formulario de cancelación
            const html = AttendanceFormView.renderCancellationForm({
                group,
                selectedDate: window.AppState.selectedDate || DateUtils.getCurrentDate(),
                selectedAssistant
            });
            
            document.getElementById('app').innerHTML = html;
            
        } catch (error) {
            console.error('AttendanceController: Error al procesar cancelación:', error);
            UIUtils.showError('Error al cargar formulario de cancelación');
        }
    },

    /**
     * Marca la asistencia de un estudiante individual
     */
    markAttendance(studentId, status) {
        debugLog(`AttendanceController: Marcando ${studentId} como ${status}`);
        
        try {
            if (!studentId || !status) {
                UIUtils.showError('Parámetros inválidos para marcar asistencia');
                return;
            }
            
            const student = this._findStudent(studentId);
            if (!student) {
                UIUtils.showError(`Estudiante ${studentId} no encontrado`);
                return;
            }
            
            if (status === 'Justificada') {
                this._openJustificationModal(studentId, student.nombre);
                return;
            }
            
            this._recordAttendance(studentId, status);
            this._updateStudentUI(studentId, status);
            this._updateAttendanceSummary();
            
            UIUtils.showSuccess(`${student.nombre} marcado como ${status.toLowerCase()}`);
            
        } catch (error) {
            console.error('AttendanceController: Error al marcar asistencia:', error);
            UIUtils.showError('Error al registrar asistencia');
        }
    },

    /**
     * Marca asistencia masiva
     */
    markAllAttendance(status) {
        debugLog(`AttendanceController: Marcando todos como ${status}`);
        
        try {
            if (status === 'Justificada') {
                UIUtils.showInfo('Para justificaciones, marca estudiantes individualmente');
                return;
            }
            
            const students = this._state.currentStudents;
            if (students.length === 0) {
                UIUtils.showWarning('No hay estudiantes cargados');
                return;
            }
            
            let markedCount = 0;
            students.forEach(student => {
                this._recordAttendance(student.id, status);
                this._updateStudentUI(student.id, status);
                markedCount++;
            });
            
            this._updateAttendanceSummary();
            UIUtils.showSuccess(`${markedCount} estudiantes marcados como ${status.toLowerCase()}`);
            
        } catch (error) {
            console.error('AttendanceController: Error en marcado masivo:', error);
            UIUtils.showError('Error al marcar asistencia masiva');
        }
    },

    /**
     * Limpia toda la asistencia registrada
     */
    clearAllAttendance() {
        debugLog('AttendanceController: Limpiando toda la asistencia');
        
        try {
            const attendanceCount = Object.keys(this._state.attendanceData).length;
            
            if (attendanceCount === 0) {
                UIUtils.showInfo('No hay asistencia para limpiar');
                return;
            }
            
            ModalsController.showConfirmation({
                title: 'Limpiar Asistencia',
                message: `¿Estás seguro de que quieres limpiar ${attendanceCount} registros de asistencia?`,
                icon: '🗑️',
                type: 'warning'
            }, () => {
                this._setState({ attendanceData: {} });
                this._clearAllStudentUI();
                this._updateAttendanceSummary();
                UIUtils.showSuccess('Asistencia limpiada');
            });
            
        } catch (error) {
            console.error('AttendanceController: Error al limpiar asistencia:', error);
            UIUtils.showError('Error al limpiar asistencia');
        }
    },

    /**
     * ✅ NUEVO FLUJO: Muestra vista previa antes de confirmación final
     */
    async saveAttendanceData(groupCode) {
        debugLog('AttendanceController: Preparando vista previa');
        
        try {
            const attendanceData = this._state.attendanceData;
            const attendanceCount = Object.keys(attendanceData).length;
            
            if (attendanceCount === 0) {
                UIUtils.showWarning('No hay asistencia registrada para guardar');
                return;
            }
            
            // Guardar borrador actualizado en localStorage
            this._saveDraftToLocalStorage();
            
            // Mostrar vista previa
            this.showFinalPreview();
            
        } catch (error) {
            console.error('AttendanceController: Error al preparar vista previa:', error);
            UIUtils.showError('Error al preparar vista previa');
        }
    },

    /**
     * ✅ NUEVO: Vista previa final con contenido y botones correctos
     */
    showFinalPreview() {
        debugLog('AttendanceController: Mostrando vista previa final');
        
        try {
            const attendanceData = this._state.attendanceData;
            const count = Object.keys(attendanceData).length;
            
            if (count === 0) {
                UIUtils.showWarning('No hay asistencia registrada para mostrar');
                return;
            }
            
            const stats = AttendanceService.calculateAttendanceStats(Object.values(attendanceData));
            const selectedAssistant = this._state.selectedAssistant;
            const draftSession = this._state.draftSession;
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const groupCode = this._state.currentGroup?.codigo || 'Desconocido';
            
            // Datos para la vista previa
            const previewData = {
                groupCode,
                selectedDate,
                attendance: attendanceData,
                stats,
                attendanceType: this._state.attendanceType,
                selectedAssistant
            };
            
            // Generar contenido HTML de la vista previa
            const previewContent = this._generateFinalPreviewContent(previewData);
            
            // Mostrar en modal
            this._showPreviewModal(previewContent);
            
        } catch (error) {
            console.error('AttendanceController: Error en vista previa final:', error);
            UIUtils.showError('Error al generar vista previa');
        }
    },

    /**
     * ✅ NUEVO: Método dedicado para mostrar el modal de vista previa
     */
    _showPreviewModal(content) {
        // Crear modal si no existe
        let modal = document.getElementById('preview-modal');
        if (!modal) {
            const modalHTML = `
                <div id="preview-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
                    <div class="flex items-center justify-center min-h-screen p-4">
                        <div class="bg-white rounded-lg max-w-4xl w-full max-h-90vh overflow-hidden shadow-xl">
                            <div class="flex justify-between items-center p-6 border-b border-gray-200 bg-blue-50">
                                <div>
                                    <h3 class="text-lg font-semibold text-blue-900">🔍 Vista Previa Final</h3>
                                    <p class="text-sm text-blue-700 mt-1">Revisa los datos antes de confirmar</p>
                                </div>
                                <button onclick="AttendanceController._closePreviewModal()" 
                                        class="text-gray-400 hover:text-gray-600 transition-colors">
                                    <span class="text-2xl">✕</span>
                                </button>
                            </div>
                            
                            <div class="p-6 overflow-y-auto max-h-96" id="preview-content">
                                <!-- Contenido dinámico -->
                            </div>
                            
                            <div class="p-4 border-t border-gray-200 bg-gray-50 text-center">
                                <p class="text-xs text-gray-600">
                                    💡 Una vez confirmado, los datos se guardarán permanentemente
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('preview-modal');
        }
        
        // Actualizar contenido
        const contentDiv = document.getElementById('preview-content');
        if (contentDiv) {
            contentDiv.innerHTML = content;
        }
        
        // Mostrar modal
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        debugLog('AttendanceController: Modal de vista previa mostrado');
    },

    /**
     * ✅ NUEVO: Cierra el modal de vista previa
     */
    _closePreviewModal() {
        const modal = document.getElementById('preview-modal');
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    },

    /**
     * ✅ NUEVO: Contenido mejorado de vista previa con botones funcionales
     */
    _generateFinalPreviewContent(data) {
        const {
            groupCode,
            selectedDate,
            attendance,
            stats,
            selectedAssistant
        } = data;

        const formattedDate = DateUtils.formatDate(selectedDate);
        const attendanceEntries = Object.values(attendance);

        return `
            <div>
                <!-- Información del borrador -->
                <div class="mb-6">
                    <h4 class="font-bold text-lg mb-2 text-blue-900">🔍 Confirmar Guardado Final</h4>
                    
                    <div class="bg-blue-50 p-4 rounded-lg mb-4">
                        <h5 class="font-semibold text-blue-800 mb-2">📝 Resumen de la Clase:</h5>
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div><strong>Grupo:</strong> ${groupCode}</div>
                            <div><strong>Fecha:</strong> ${formattedDate}</div>
                            <div><strong>Total registros:</strong> ${attendanceEntries.length}</div>
                            <div><strong>Clase ID:</strong> ${this._state.classId || 'N/A'}</div>
                        </div>
                    </div>
                    
                    ${selectedAssistant ? `
                        <div class="p-3 bg-green-50 rounded-lg mb-4">
                            <div class="flex items-center text-green-800">
                                <span class="text-xl mr-2">👨‍🏫</span>
                                <div>
                                    <strong>Asistente responsable:</strong> ${selectedAssistant.nombre}
                                    <div class="text-sm text-green-600">ID: ${selectedAssistant.id}</div>
                                </div>
                            </div>
                        </div>
                    ` : `
                        <div class="p-3 bg-gray-50 rounded-lg mb-4">
                            <div class="flex items-center text-gray-600">
                                <span class="text-xl mr-2">👤</span>
                                <span><strong>Asistente:</strong> No especificado</span>
                            </div>
                        </div>
                    `}
                </div>

                <!-- Estadísticas visuales -->
                <div class="grid grid-cols-3 gap-4 mb-6">
                    <div class="bg-green-100 p-4 rounded text-center">
                        <div class="font-bold text-green-800 text-2xl">${stats.present || 0}</div>
                        <div class="text-sm text-green-600">Presentes</div>
                    </div>
                    <div class="bg-red-100 p-4 rounded text-center">
                        <div class="font-bold text-red-800 text-2xl">${stats.absent || 0}</div>
                        <div class="text-sm text-red-600">Ausentes</div>
                    </div>
                    <div class="bg-yellow-100 p-4 rounded text-center">
                        <div class="font-bold text-yellow-800 text-2xl">${stats.justified || 0}</div>
                        <div class="text-sm text-yellow-600">Justificadas</div>
                    </div>
                </div>

                <!-- Lista detallada (scrolleable) -->
                <div class="space-y-2 mb-6">
                    <h5 class="font-semibold mb-3">Detalle por Estudiante:</h5>
                    <div class="max-h-48 overflow-y-auto border border-gray-200 rounded">
                        ${attendanceEntries.length > 0 ? attendanceEntries.map(record => `
                            <div class="flex justify-between items-center p-3 border-b border-gray-100 hover:bg-gray-50">
                                <span class="font-medium">${this._getStudentName(record.studentId)}</span>
                                <div class="flex items-center">
                                    <span class="mr-2">${this._getStatusIcon(record.status)}</span>
                                    <span class="font-medium text-sm px-2 py-1 rounded ${this._getStatusBadgeClass(record.status)}">${record.status}</span>
                                    ${record.justification ? `<span class="text-xs text-gray-500 ml-2">(${record.justification})</span>` : ''}
                                </div>
                            </div>
                        `).join('') : `
                            <div class="text-center py-4 text-gray-500">
                                <p>No hay registros de asistencia</p>
                            </div>
                        `}
                    </div>
                </div>

                <!-- Información adicional -->
                <div class="mb-6 pt-4 border-t border-gray-200">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                        <div>
                            <strong>Porcentaje de asistencia:</strong> 
                            ${attendanceEntries.length > 0 ? Math.round(((stats.present || 0) / attendanceEntries.length) * 100) : 0}%
                        </div>
                        <div>
                            <strong>Registros procesados:</strong> 
                            ${attendanceEntries.length}
                        </div>
                    </div>
                </div>

                <!-- BOTONES DE CONFIRMACIÓN -->
                <div class="bg-gradient-to-r from-blue-50 to-green-50 p-6 rounded-lg">
                    <div class="text-center mb-4">
                        <h6 class="font-bold text-gray-800 mb-2">⚠️ CONFIRMACIÓN FINAL</h6>
                        <p class="text-sm text-gray-600">
                            Una vez confirmado, la clase se guardará permanentemente en el sistema.
                        </p>
                    </div>
                    
                    <div class="flex flex-col sm:flex-row gap-4">
                        <button onclick="AttendanceController.confirmFinalSave()" 
                                class="btn btn-primary flex-1 font-bold text-lg py-3">
                            ✅ CONFIRMAR Y GUARDAR DEFINITIVAMENTE
                        </button>
                        <button onclick="AttendanceController._closePreviewModal()" 
                                class="btn btn-outline py-3">
                            ↩️ Volver a Ajustar
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * ✅ NUEVO: Confirmación final que realmente guarda
     */
    async confirmFinalSave() {
        debugLog('AttendanceController: CONFIRMACIÓN FINAL - Guardando asistencias');
        
        try {
            // Cerrar modal de vista previa primero
            this._closePreviewModal();
            
            const attendanceData = this._state.attendanceData;
            const attendanceCount = Object.keys(attendanceData).length;
            
            if (attendanceCount === 0) {
                UIUtils.showWarning('No hay asistencia registrada para guardar');
                return;
            }
            
            this._setState({ isProcessing: true });
            
            // Mostrar modal de carga
            this._showLoadingModal('Guardando asistencias...', 'Procesando registros...');
            
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const groupCode = this._state.currentGroup.codigo;
            const selectedAssistant = this._state.selectedAssistant;
            const classId = this._state.classId; // Ya existe desde la creación de clase
            
            // Crear registros de asistencia usando AttendanceService
            const { records, errors } = AttendanceService.createGroupAttendanceRecords(
                attendanceData,
                {
                    groupCode,
                    date: selectedDate,
                    classType: 'Regular',
                    idClase: classId, // Pasar ID de clase
                    sentBy: window.AppState.user?.email || 'usuario'
                }
            );
            
            // Guardar solo asistencias (la clase ya fue creada)
            const result = await AttendanceService.saveAttendance(records);
            
            this._hideLoadingModal();
            
            // Limpiar borrador después de éxito
            this._clearDraftFromLocalStorage();
            
            // Mostrar éxito con opción de volver al inicio
            this._showSuccessModal(result, groupCode, selectedDate, attendanceCount, selectedAssistant);
            
        } catch (error) {
            this._hideLoadingModal();
            console.error('AttendanceController: Error en confirmación final:', error);
            UIUtils.showError(error.message || 'Error al guardar las asistencias');
        } finally {
            this._setState({ isProcessing: false });
        }
    },

    /**
     * ✅ NUEVO: Modal de loading para guardado
     */
    _showLoadingModal(title, message) {
        const modalHTML = `
            <div id="saving-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50">
                <div class="flex items-center justify-center min-h-screen p-4">
                    <div class="bg-white rounded-lg p-8 text-center shadow-xl">
                        <div class="spinner spinner-xl mx-auto mb-4"></div>
                        <h3 class="text-lg font-semibold mb-2">${title}</h3>
                        <p class="text-gray-600">${message}</p>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    },

    /**
     * ✅ NUEVO: Oculta modal de loading
     */
    _hideLoadingModal() {
        const modal = document.getElementById('saving-modal');
        if (modal) {
            modal.remove();
        }
    },

    /**
     * ✅ NUEVO: Modal de éxito completo
     */
    _showSuccessModal(result, groupCode, selectedDate, attendanceCount, selectedAssistant) {
        let message, details;
        
        if (result.method === 'online') {
            message = '🎉 ¡Asistencias guardadas exitosamente!';
            details = [
                `✅ Guardado en línea exitoso`,
                `📅 Grupo: ${groupCode}`,
                `📆 Fecha: ${DateUtils.formatDate(selectedDate)}`,
                `👨‍🏫 Asistente: ${selectedAssistant?.nombre || 'No especificado'}`,
                `📝 Registros: ${attendanceCount}`,
                `🆔 ID de Clase: ${this._state.classId}`
            ];
            UIUtils.updateConnectionStatus('online');
        } else {
            message = '💾 Asistencias guardadas localmente';
            details = [
                `⏳ Se sincronizará automáticamente`,
                `📅 Grupo: ${groupCode}`,
                `📆 Fecha: ${DateUtils.formatDate(selectedDate)}`,
                `👨‍🏫 Asistente: ${selectedAssistant?.nombre || 'No especificado'}`,
                `📝 Registros: ${attendanceCount}`
            ];
            UIUtils.updateConnectionStatus('offline');
        }

        const successHTML = `
            <div id="success-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50">
                <div class="flex items-center justify-center min-h-screen p-4">
                    <div class="bg-white rounded-lg p-8 max-w-md w-full text-center shadow-xl">
                        <div class="text-6xl mb-4">🎉</div>
                        <h3 class="text-xl font-bold text-green-900 mb-4">${message}</h3>
                        
                        <div class="bg-green-50 p-4 rounded mb-6 text-left">
                            <h5 class="font-medium text-green-800 mb-2">Detalles:</h5>
                            <ul class="text-sm text-green-700 space-y-1">
                                ${details.map(detail => `<li>• ${detail}</li>`).join('')}
                            </ul>
                        </div>
                        
                        <div class="space-y-3">
                            <button onclick="AttendanceController._resetAndGoHome()" 
                                    class="btn btn-primary w-full">
                                🏠 Volver al Inicio
                            </button>
                            <button onclick="AttendanceController._closeSuccessModal()" 
                                    class="btn btn-outline w-full">
                                ❌ Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', successHTML);
    },

    /**
     * ✅ NUEVO: Cierra modal de éxito
     */
    _closeSuccessModal() {
        const modal = document.getElementById('success-modal');
        if (modal) {
            modal.remove();
        }
    },

    /**
     * ✅ NUEVO: Resetea y vuelve al inicio
     */
    _resetAndGoHome() {
        // Cerrar modales
        this._closeSuccessModal();
        this._closePreviewModal();
        
        // Limpiar estado
        this._setState({
            attendanceData: {},
            currentGroup: null,
            currentStudents: [],
            selectedAssistant: null,
            classId: null,
            draftSession: null,
            lastClickTimes: {}
        });
        
        // Ir al selector de fecha (inicio)
        AppController.showDateSelector();
    },

    /**
     * Abre el modal de reposición individual - CORREGIDO
     */
    async openRepositionModal() {
        debugLog('AttendanceController: Abriendo modal de reposición individual');
        
        try {
            const currentGroup = this._state.currentGroup;
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const selectedAssistant = this._state.selectedAssistant;
            
            // Validar que estemos en una clase válida
            if (!currentGroup || !currentGroup.codigo) {
                UIUtils.showError('Error: No hay grupo seleccionado para la reposición');
                return;
            }
            
            // Usar el ID de clase existente
            let classId = this._state.classId;
            
            // Si no hay ID de clase, crear uno temporal
            if (!classId) {
                classId = `TEMP_${selectedDate}_${currentGroup.codigo}`;
                UIUtils.showWarning('Reposición sin clase registrada - se creará registro temporal');
            }
            
            // Preparar datos de la clase para el modal
            const classData = {
                groupCode: currentGroup.codigo,
                classId: classId,
                selectedDate: selectedDate,
                sentBy: window.AppState.user?.email || 'usuario',
                groupData: currentGroup,
                assistantData: selectedAssistant
            };
            
            debugLog('AttendanceController: Datos de clase para reposición:', classData);
            
            // Llamar al RepositionController
            await RepositionController.openFromAttendance(classData);
            
        } catch (error) {
            console.error('AttendanceController: Error abriendo modal de reposición:', error);
            UIUtils.showError('Error al abrir el selector de reposición individual');
        }
    },

    /**
     * Guarda la cancelación usando ClassControlService
     */
    async saveCancellation(groupCode) {
        debugLog('AttendanceController: Guardando cancelación con ClassControlService');
        
        try {
            // Obtener motivo seleccionado
            const selectedReason = document.querySelector('input[name="cancellation-reason"]:checked');
            if (!selectedReason) {
                UIUtils.showWarning('Por favor selecciona un motivo de cancelación');
                return;
            }
            
            const reason = selectedReason.value;
            const description = document.getElementById('cancellation-description')?.value?.trim() || '';
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const selectedAssistant = this._state.selectedAssistant;
            
            this._setState({ isProcessing: true });
            
            // Deshabilitar botón
            const saveBtn = document.getElementById('save-cancellation-btn');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<div class="spinner mr-3"></div>Guardando...';
            }
            
            // Usar ClassControlService para manejar el flujo completo
            const result = await ClassControlService.handleClassCancelled(
                selectedDate,
                groupCode,
                reason,
                description,
                selectedAssistant?.id || ''
            );
            
            // Mostrar resultado basado en método real usado
            let message;
            if (result.attendanceResult.method === 'online') {
                message = `Cancelación registrada exitosamente para ${result.studentsAffected} estudiantes`;
                UIUtils.updateConnectionStatus('online');
            } else {
                message = `Cancelación guardada localmente (${result.studentsAffected} estudiantes). Se sincronizará cuando haya conexión.`;
                UIUtils.updateConnectionStatus('offline');
            }
            
            UIUtils.showSuccess(message);
            
            // Volver al dashboard después de un momento
            setTimeout(() => {
                AppController.showDashboard();
            }, 2000);
            
        } catch (error) {
            console.error('AttendanceController: Error al guardar cancelación:', error);
            UIUtils.showError(error.message || 'Error al guardar la cancelación');
            
            // Restaurar botón
            const saveBtn = document.getElementById('save-cancellation-btn');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '💾 Registrar Cancelación';
            }
        } finally {
            this._setState({ isProcessing: false });
        }
    },

    /**
     * Guarda justificación
     */
    saveJustification() {
        debugLog('AttendanceController: Guardando justificación');
        
        try {
            const modal = document.getElementById('justification-modal');
            const studentId = modal?.dataset?.studentId;
            const type = document.getElementById('justification-type')?.value;
            const description = document.getElementById('justification-description')?.value?.trim();
            
            if (!studentId) {
                UIUtils.showError('Error: ID de estudiante no encontrado');
                return;
            }
            
            if (!type) {
                UIUtils.showWarning('Por favor selecciona un tipo de justificación');
                return;
            }
            
            this._recordAttendance(studentId, 'Justificada', type, description);
            this._updateStudentUI(studentId, 'Justificada');
            this._updateAttendanceSummary();
            
            ModalsController.close('justification-modal');
            
            const student = this._findStudent(studentId);
            UIUtils.showSuccess(`Justificación guardada para ${student?.nombre || studentId}`);
            
        } catch (error) {
            console.error('AttendanceController: Error guardando justificación:', error);
            UIUtils.showError('Error al guardar justificación');
        }
    },

    /**
     * Muestra estadísticas de asistencia
     */
    showAttendanceStats() {
        debugLog('AttendanceController: Mostrando estadísticas');
        
        try {
            const students = this._state.currentStudents;
            const attendanceData = this._state.attendanceData;
            
            const statsData = {
                totalStudents: students.length,
                attendanceRecords: attendanceData,
                groupInfo: this._state.currentGroup,
                selectedAssistant: this._state.selectedAssistant
            };
            
            ModalsController.showAttendanceStats(statsData);
            
        } catch (error) {
            console.error('AttendanceController: Error mostrando estadísticas:', error);
            UIUtils.showError('Error al mostrar estadísticas');
        }
    },

    /**
     * Obtiene el estado actual del controlador
     */
    getState() {
        return { ...this._state };
    },

    // ===========================================
    // MÉTODOS PRIVADOS
    // ===========================================

    /**
     * Actualiza el estado interno
     */
    _setState(newState) {
        this._state = { ...this._state, ...newState };
        debugLog('AttendanceController: Estado actualizado:', this._state);
    },

    /**
     * Registra un dato de asistencia
     */
    _recordAttendance(studentId, status, justification = '', description = '') {
        debugLog(`AttendanceController: Registrando asistencia - ${studentId}: ${status}`);
        
        const attendanceData = { ...this._state.attendanceData };
        
        const record = {
            studentId,
            status,
            justification,
            description,
            timestamp: DateUtils.getCurrentTimestamp()
        };
        
        attendanceData[studentId] = record;
        this._setState({ attendanceData });
    },

    /**
     * Busca un estudiante por ID
     */
    _findStudent(studentId) {
        // Buscar en estudiantes actuales del controlador
        let student = this._state.currentStudents.find(s => s.id === studentId);
        
        // Si no se encuentra, buscar en estado global
        if (!student) {
            student = window.AppState.estudiantes.find(s => s.id === studentId);
        }
        
        // Buscar por ID convertido a string por si acaso
        if (!student) {
            const studentIdStr = studentId.toString();
            student = this._state.currentStudents.find(s => s.id.toString() === studentIdStr) ||
                      window.AppState.estudiantes.find(s => s.id.toString() === studentIdStr);
        }
        
        return student;
    },

    /**
     * Abre el modal de justificación
     */
    _openJustificationModal(studentId, studentName) {
        const modal = document.getElementById('justification-modal');
        const nameSpan = document.getElementById('justification-student-name');
        
        if (modal && nameSpan) {
            nameSpan.textContent = studentName;
            modal.dataset.studentId = studentId;
            ModalsController.open('justification-modal', '#justification-type');
        }
    },

    /**
     * Actualiza la UI de un estudiante específico
     */
    _updateStudentUI(studentId, status) {
        const studentItem = document.querySelector(`[data-student-id="${studentId}"]`);
        if (!studentItem) return;
        
        // Limpiar clases previas
        studentItem.classList.remove('status-presente', 'status-ausente', 'status-justificada');
        
        // Agregar nueva clase
        studentItem.classList.add(`status-${status.toLowerCase()}`);
        
        // Actualizar botones
        const buttons = studentItem.querySelectorAll('.student-actions button');
        buttons.forEach(btn => {
            btn.classList.remove('btn-primary', 'btn-danger', 'btn-secondary');
            btn.classList.add('btn-outline');
        });
        
        // Resaltar botón activo
        const activeButton = studentItem.querySelector(`button[onclick*="'${status}'"]`);
        if (activeButton) {
            activeButton.classList.remove('btn-outline');
            switch (status) {
                case 'Presente':
                    activeButton.classList.add('btn-primary');
                    break;
                case 'Ausente':
                    activeButton.classList.add('btn-danger');
                    break;
                case 'Justificada':
                    activeButton.classList.add('btn-secondary');
                    break;
            }
        }
    },

    /**
     * Limpia la UI de todos los estudiantes
     */
    _clearAllStudentUI() {
        const studentItems = document.querySelectorAll('.student-item');
        studentItems.forEach(item => {
            item.classList.remove('status-presente', 'status-ausente', 'status-justificada');
            
            const buttons = item.querySelectorAll('.student-actions button');
            buttons.forEach(btn => {
                btn.classList.remove('btn-primary', 'btn-danger', 'btn-secondary');
                btn.classList.add('btn-outline');
            });
        });
    },

    /**
     * Actualiza el resumen de asistencia
     */
    _updateAttendanceSummary() {
        const summary = document.getElementById('attendance-summary');
        if (!summary) return;
        
        const attendanceData = this._state.attendanceData;
        const total = Object.keys(attendanceData).length;
        
        if (total === 0) {
            summary.textContent = 'Sin registros';
            return;
        }
        
        const stats = AttendanceService.calculateAttendanceStats(Object.values(attendanceData));
        
        summary.innerHTML = `
            <span class="font-medium">${total} registrados:</span>
            <span class="text-green-600">${stats.present} presentes</span> •
            <span class="text-red-600">${stats.absent} ausentes</span> •
            <span class="text-yellow-600">${stats.justified} justificadas</span>
        `;
        
        // Habilitar botón de guardar si hay registros
        const saveBtn = document.getElementById('save-attendance-btn');
        if (saveBtn) {
            saveBtn.disabled = total === 0;
            saveBtn.classList.toggle('opacity-50', total === 0);
        }
    },

    /**
     * ✅ NUEVO: Obtiene clase CSS para badges de estado
     */
    _getStatusBadgeClass(status) {
        switch (status) {
            case 'Presente': return 'bg-green-100 text-green-800';
            case 'Ausente': return 'bg-red-100 text-red-800';
            case 'Justificada': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    },

    /**
     * ✅ NUEVO: Obtiene el nombre de un estudiante por ID
     */
    _getStudentName(studentId) {
        const student = this._findStudent(studentId);
        return student ? student.nombre : studentId;
    },

    /**
     * ✅ NUEVO: Obtiene el icono para un estado de asistencia
     */
    _getStatusIcon(status) {
        const icons = {
            'Presente': '✅',
            'Ausente': '❌',
            'Justificada': '📝',
            'Cancelada': '🚫'
        };
        return icons[status] || '❓';
    },

    /**
     * ✅ NUEVO: Guarda borrador en localStorage
     */
    _saveDraftToLocalStorage() {
        const draftData = {
            groupCode: this._state.currentGroup?.codigo,
            fecha: window.AppState.selectedDate,
            attendanceData: this._state.attendanceData,
            selectedAssistant: this._state.selectedAssistant,
            classId: this._state.classId,
            timestamp: DateUtils.getCurrentTimestamp()
        };
        
        StorageUtils.save('attendance_draft', draftData);
        debugLog('AttendanceController: Borrador guardado en localStorage');
    },

    /**
     * ✅ NUEVO: Limpia borrador de localStorage
     */
    _clearDraftFromLocalStorage() {
        StorageUtils.remove('attendance_draft');
        debugLog('AttendanceController: Borrador eliminado de localStorage');
    }
};

// Hacer disponible globalmente
window.AttendanceController = AttendanceController;

debugLog('AttendanceController - VERSIÓN INTEGRADA FINAL: Flujo completo con vista previa y confirmación');
