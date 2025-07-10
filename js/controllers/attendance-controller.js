/**
 * CONTROLADOR DE ASISTENCIA - FLUJO CORREGIDO
 * ============================================
 * FIX: Elimina duplicidad de pregunta de asistente
 * SOLUCIÓN: Pregunta asistente SOLO después de confirmar que clase se realizó
 */

const AttendanceController = {
    // Estado interno del controlador (SIN CAMBIOS)
    _state: {
        currentGroup: null,
        currentStudents: [],
        availableAssistants: [],
        selectedAssistant: null,
        attendanceData: {},
        attendanceType: 'regular',
        isProcessing: false,
        classId: null
    },

    /**
     * Inicializa el controlador y carga asistentes (SIN CAMBIOS)
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
     * ✨ CORREGIDO: Selecciona un grupo y va DIRECTO a pregunta de estado
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
            
            // ✨ FIX: Ir DIRECTO a pregunta de estado (eliminar primer selector de asistente)
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
     * Muestra selector de asistente (MANTENER para uso futuro si es necesario)
     */
    async showAssistantSelector(groupCode) {
        debugLog(`AttendanceController: Mostrando selector de asistente para ${groupCode}`);
        
        try {
            const group = this._state.currentGroup;
            const assistants = this._state.availableAssistants;
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            
            const html = AttendanceFormView.renderAssistantSelector({
                group,
                assistants,
                selectedDate
            });
            
            document.getElementById('app').innerHTML = html;
            
        } catch (error) {
            console.error('AttendanceController: Error mostrando selector de asistente:', error);
            UIUtils.showError('Error al cargar selector de asistente');
        }
    },

    /**
     * Selecciona un asistente y continúa con la pregunta de estado (MANTENER para compatibilidad)
     */
    async selectAssistant(assistantId) {
        debugLog(`AttendanceController: Seleccionando asistente ${assistantId}`);
        
        try {
            // Buscar asistente
            const assistant = this._state.availableAssistants.find(a => a.id === assistantId);
            if (!assistant) {
                throw new Error(`Asistente ${assistantId} no encontrado`);
            }
            
            this._setState({ selectedAssistant: assistant });
            
            // Continuar con pregunta de estado de clase
            await this.showClassStatusQuestion(this._state.currentGroup.codigo);
            
        } catch (error) {
            console.error('AttendanceController: Error al seleccionar asistente:', error);
            UIUtils.showError('Error al seleccionar asistente');
        }
    },

    /**
     * Continúa sin seleccionar asistente (MANTENER para compatibilidad)
     */
    async continueWithoutAssistant(groupCode) {
        debugLog('AttendanceController: Continuando sin asistente seleccionado');
        
        try {
            // Establecer asistente como null y continuar
            this._setState({ selectedAssistant: null });
            
            // Continuar con pregunta de estado de clase
            await this.showClassStatusQuestion(groupCode);
            
        } catch (error) {
            console.error('AttendanceController: Error al continuar sin asistente:', error);
            UIUtils.showError('Error al continuar');
        }
    },

    /**
     * ✨ CORREGIDO: Muestra la pregunta inicial sobre el estado de la clase (SIN asistente)
     */
    async showClassStatusQuestion(groupCode) {
        debugLog(`AttendanceController: Mostrando pregunta de estado para ${groupCode}`);
        
        try {
            const group = this._state.currentGroup || await GroupService.getGroupByCode(groupCode);
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            
            // ✨ FIX: NO pasar selectedAssistant porque aún no se ha seleccionado
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
     * ✨ CORREGIDO: La clase se realizó - AHORA pregunta por asistente por primera vez
     */
    async classWasHeld(groupCode) {
        debugLog(`AttendanceController: Clase realizada para grupo ${groupCode} - NUEVO FLUJO CORREGIDO`);
        
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
            
            // ✨ FIX: AHORA SÍ preguntar por asistente (primera y única vez)
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
     * ✨ NUEVO: Selector de asistente PARA ASISTENCIA (única vez en el flujo)
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
     * ✨ NUEVO: Opciones de asistente para asistencia
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
     * ✨ NUEVO: Selecciona asistente y va directo a asistencia
     */
    async selectAssistantForAttendance(assistantId) {
        debugLog(`AttendanceController: Asistente seleccionado para asistencia: ${assistantId}`);
        
        try {
            // Buscar asistente
            const assistant = this._state.availableAssistants.find(a => a.id === assistantId);
            if (!assistant) {
                throw new Error(`Asistente ${assistantId} no encontrado`);
            }
            
            this._setState({ selectedAssistant: assistant });
            
            // Ir DIRECTAMENTE al formulario de asistencia
            await this.showAttendanceFormDirect();
            
        } catch (error) {
            console.error('AttendanceController: Error al seleccionar asistente para asistencia:', error);
            UIUtils.showError('Error al seleccionar asistente');
        }
    },

    /**
     * ✨ NUEVO: Continúa sin asistente y va directo a asistencia
     */
    async continueToAttendanceWithoutAssistant(groupCode) {
        debugLog('AttendanceController: Continuando sin asistente a asistencia');
        
        try {
            this._setState({ selectedAssistant: null });
            await this.showAttendanceFormDirect();
            
        } catch (error) {
            console.error('AttendanceController: Error al continuar sin asistente:', error);
            UIUtils.showError('Error al continuar');
        }
    },

    /**
     * ✨ NUEVO: Muestra formulario de asistencia directamente
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
     * Abre el modal de reposición individual
     */
    async openRepositionModal() {
        debugLog('AttendanceController: Abriendo modal de reposición individual');
        
        try {
            const currentGroup = this._state.currentGroup;
            const classId = this._state.classId;
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const selectedAssistant = this._state.selectedAssistant;
            
            // Validar que estemos en una clase válida
            if (!currentGroup || !currentGroup.codigo) {
                UIUtils.showError('Error: No hay grupo seleccionado para la reposición');
                return;
            }
            
            // Preparar datos de la clase para el modal
            const classData = {
                groupCode: currentGroup.codigo,
                classId: classId, // Puede ser null, se manejará en el servicio
                selectedDate: selectedDate,
                sentBy: window.AppState.user?.email || 'usuario',
                groupData: currentGroup,
                assistantData: selectedAssistant
            };
            
            debugLog('AttendanceController: Datos de clase para reposición:', classData);
            
            // Abrir modal de reposición
            await RepositionController.openFromAttendance(classData);
            
        } catch (error) {
            console.error('AttendanceController: Error abriendo modal de reposición:', error);
            UIUtils.showError('Error al abrir el selector de reposición individual');
        }
    },

    /**
     * La clase fue cancelada - usar ClassControlService (SIN CAMBIOS)
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
     * Marca la asistencia de un estudiante individual (SIN CAMBIOS)
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
     * Marca asistencia masiva (SIN CAMBIOS)
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
     * Limpia toda la asistencia registrada (SIN CAMBIOS)
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
     * Guarda datos de asistencia con botón "Volver al Inicio" (SIN CAMBIOS)
     */
    async saveAttendanceData(groupCode) {
        debugLog('AttendanceController: Guardando datos de asistencia con flujo simplificado');
        
        try {
            const attendanceData = this._state.attendanceData;
            const attendanceCount = Object.keys(attendanceData).length;
            
            if (attendanceCount === 0) {
                UIUtils.showWarning('No hay asistencia registrada para guardar');
                return;
            }
            
            this._setState({ isProcessing: true });
            
            ModalsController.showLoading('Guardando asistencia...', 'Procesando datos...');
            
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const selectedAssistant = this._state.selectedAssistant;
            
            // 1. Crear registro de clase
            const classRecord = await ClassControlService.createClassRecord(
                selectedDate,
                groupCode,
                ClassControlService.CLASS_STATES.REALIZADA,
                {
                    asistenteId: selectedAssistant?.id || '',
                    creadoPor: window.AppState.user?.email || 'usuario'
                }
            );
            
            // 2. Crear registros de asistencia
            const { records, errors } = AttendanceService.createGroupAttendanceRecords(
                attendanceData,
                {
                    groupCode,
                    date: selectedDate,
                    classType: 'Regular',
                    sentBy: window.AppState.user?.email || 'usuario'
                }
            );
            
            // 3. Agregar ID de clase
            records.forEach(record => {
                record.ID_Clase = classRecord.id;
            });
            
            // 4. Guardar asistencias
            const result = await AttendanceService.saveAttendance(records);
            
            ModalsController.hideLoading();
            
            // 5. Mostrar éxito con botón para volver al inicio
            let message, details;
            
            if (result.method === 'online') {
                message = 'Asistencia guardada correctamente';
                details = [
                    `Grupo: ${groupCode}`,
                    `Fecha: ${DateUtils.formatDate(selectedDate)}`,
                    `Asistente: ${selectedAssistant?.nombre || 'No especificado'}`,
                    `Registros guardados: ${attendanceCount}`,
                    `✅ Guardado en línea exitoso`
                ];
                UIUtils.updateConnectionStatus('online');
            } else {
                message = 'Asistencia guardada localmente';
                details = [
                    `Grupo: ${groupCode}`,
                    `Fecha: ${DateUtils.formatDate(selectedDate)}`,
                    `Asistente: ${selectedAssistant?.nombre || 'No especificado'}`,
                    `Registros guardados: ${attendanceCount}`,
                    `⏳ Se sincronizará automáticamente`
                ];
                UIUtils.updateConnectionStatus('offline');
            }
            
            // Modal de éxito con botón para volver al inicio
            const successData = {
                title: '🎉 ¡Asistencia Guardada!',
                message: message,
                details: details,
                actions: [{
                    label: '🏠 Volver al Inicio',
                    handler: 'AppController.showDateSelector()',
                    class: 'btn-primary'
                }]
            };
            
            const successHtml = ModalsView.getSuccessContent(successData);
            const modal = document.getElementById('notification-modal');
            const content = document.getElementById('notification-content');
            
            if (modal && content) {
                content.innerHTML = successHtml;
                modal.classList.remove('hidden');
            }
            
            // Limpiar estado
            this._setState({
                attendanceData: {},
                currentGroup: null,
                currentStudents: [],
                selectedAssistant: null,
                classId: null
            });
            
        } catch (error) {
            ModalsController.hideLoading();
            console.error('AttendanceController: Error al guardar asistencia:', error);
            UIUtils.showError(error.message || 'Error al guardar asistencia');
        } finally {
            this._setState({ isProcessing: false });
        }
    },

    /**
     * Guarda la cancelación usando ClassControlService (SIN CAMBIOS)
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
     * Muestra vista previa (SIN CAMBIOS)
     */
    previewAttendance(groupCode) {
        debugLog('AttendanceController: Mostrando vista previa');
        
        try {
            const attendanceData = this._state.attendanceData;
            const count = Object.keys(attendanceData).length;
            
            if (count === 0) {
                UIUtils.showInfo('No hay asistencia para previsualizar');
                return;
            }
            
            const stats = AttendanceService.calculateAttendanceStats(Object.values(attendanceData));
            const selectedAssistant = this._state.selectedAssistant;
            
            const previewData = {
                groupCode,
                selectedDate: window.AppState.selectedDate || DateUtils.getCurrentDate(),
                attendance: attendanceData,
                stats,
                attendanceType: this._state.attendanceType,
                selectedAssistant
            };
            
            const previewContent = ModalsView.getAttendancePreviewContent(previewData);
            ModalsController.showPreview(previewContent);
            
        } catch (error) {
            console.error('AttendanceController: Error en vista previa:', error);
            UIUtils.showError('Error al generar vista previa');
        }
    },

    /**
     * Muestra estadísticas de asistencia (SIN CAMBIOS)
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
     * Guarda justificación (SIN CAMBIOS)
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
     * Exporta la asistencia (SIN CAMBIOS)
     */
    exportAttendance(groupCode) {
        debugLog('AttendanceController: Exportando asistencia');
        
        try {
            const attendanceData = this._state.attendanceData;
            const count = Object.keys(attendanceData).length;
            
            if (count === 0) {
                UIUtils.showInfo('No hay asistencia para exportar');
                return;
            }
            
            // Crear datos para exportar
            const exportData = {
                grupo: groupCode,
                fecha: DateUtils.formatDate(window.AppState.selectedDate || DateUtils.getCurrentDate()),
                asistente: this._state.selectedAssistant?.nombre || 'No especificado',
                registros: Object.values(attendanceData).map(record => {
                    const student = this._findStudent(record.studentId);
                    return {
                        estudiante: student?.nombre || record.studentId,
                        estado: record.status,
                        justificacion: record.justification || '',
                        descripcion: record.description || ''
                    };
                })
            };
            
            // Simular exportación (en una implementación real, esto generaría un archivo)
            console.log('Datos para exportar:', exportData);
            
            UIUtils.showInfo('Función de exportación en desarrollo. Datos mostrados en consola.');
            
        } catch (error) {
            console.error('AttendanceController: Error al exportar:', error);
            UIUtils.showError('Error al exportar datos');
        }
    },

    /**
     * Obtiene el estado actual del controlador (SIN CAMBIOS)
     */
    getState() {
        return { ...this._state };
    },

    // ===========================================
    // MÉTODOS PRIVADOS (SIN CAMBIOS)
    // ===========================================

    /**
     * Actualiza el estado interno (SIN CAMBIOS)
     */
    _setState(newState) {
        this._state = { ...this._state, ...newState };
        debugLog('AttendanceController: Estado actualizado:', this._state);
    },

    /**
     * Muestra el formulario de asistencia (SIN CAMBIOS)
     */
    async _showAttendanceForm(group, students, type) {
        debugLog(`AttendanceController: Mostrando formulario para ${students.length} estudiantes`);
        
        const selectedAssistant = this._state.selectedAssistant;
        
        const html = AttendanceFormView.renderAttendanceForm({
            group,
            students,
            selectedDate: window.AppState.selectedDate || DateUtils.getCurrentDate(),
            attendanceType: type,
            selectedAssistant
        });
        
        document.getElementById('app').innerHTML = html;
        
        // Agregar modales necesarios si no existen
        if (!document.getElementById('justification-modal')) {
            document.body.insertAdjacentHTML('beforeend', ModalsView.renderJustificationModal());
        }
    },

    /**
     * Registra un dato de asistencia (SIN CAMBIOS)
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
     * Busca un estudiante por ID (SIN CAMBIOS)
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
     * Abre el modal de justificación (SIN CAMBIOS)
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
     * Actualiza la UI de un estudiante específico (SIN CAMBIOS)
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
     * Limpia la UI de todos los estudiantes (SIN CAMBIOS)
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
     * Actualiza el resumen de asistencia (SIN CAMBIOS)
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
    }
};

// Hacer disponible globalmente
window.AttendanceController = AttendanceController;

debugLog('AttendanceController - FLUJO CORREGIDO: Una sola pregunta de asistente (después de confirmar clase)');
