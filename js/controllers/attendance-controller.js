/**
 * CONTROLADOR DE ASISTENCIA - ACTUALIZADO CON CLASSCONTROLSERVICE
 * ===============================================================
 * Integración completa con control de clases y asistentes
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
        classId: null // NUEVO: ID de la clase generada
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
     * Selecciona un grupo y muestra selector de asistente
     */
    async selectGroup(groupCode) {
        debugLog(`AttendanceController: Seleccionando grupo ${groupCode}`);
        
        try {
            this._setState({ isProcessing: true });
            
            // Encontrar el grupo
            const group = await GroupService.getGroupByCode(groupCode);
            this._setState({ currentGroup: group });
            
            // Inicializar si no se ha hecho
            if (this._state.availableAssistants.length === 0) {
                await this.initialize();
            }
            
            // Mostrar selector de asistente
            await this.showAssistantSelector(groupCode);
            
        } catch (error) {
            console.error('AttendanceController: Error al seleccionar grupo:', error);
            UIUtils.showError('Error al cargar el grupo');
            AppController.showDashboard();
        } finally {
            this._setState({ isProcessing: false });
        }
    },

    /**
     * Muestra selector de asistente
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
     * Selecciona un asistente y continúa con la pregunta de estado
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
     * Muestra la pregunta inicial sobre el estado de la clase
     */
    async showClassStatusQuestion(groupCode) {
        debugLog(`AttendanceController: Mostrando pregunta de estado para ${groupCode}`);
        
        try {
            const group = this._state.currentGroup || await GroupService.getGroupByCode(groupCode);
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const selectedAssistant = this._state.selectedAssistant;
            
            const html = AttendanceFormView.renderClassStatusQuestion({
                group,
                selectedDate,
                selectedAssistant
            });
            
            document.getElementById('app').innerHTML = html;
            
        } catch (error) {
            console.error('AttendanceController: Error mostrando pregunta de estado:', error);
            UIUtils.showError('Error al cargar la información del grupo');
        }
    },

    /**
     * La clase se realizó - usar ClassControlService
     */
    async classWasHeld(groupCode) {
        debugLog(`AttendanceController: Clase realizada para grupo ${groupCode}`);
        
        try {
            this._setState({ isProcessing: true, attendanceType: 'regular' });
            
            UIUtils.showLoading('app', 'Validando clase...');
            
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const selectedAssistant = this._state.selectedAssistant;
            
            // Validar que se pueda reportar la clase
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
            
            // Crear registro de clase
            const classRecord = await ClassControlService.createClassRecord(
                selectedDate,
                groupCode,
                ClassControlService.CLASS_STATES.REALIZADA,
                {
                    asistenteId: selectedAssistant?.id || '',
                    creadoPor: window.AppState.user?.email || 'usuario'
                }
            );
            
            this._setState({ classId: classRecord.id });
            
            UIUtils.showLoading('app', 'Cargando estudiantes...');
            
            // Obtener grupo y estudiantes
            const group = await GroupService.getGroupByCode(groupCode);
            const students = await StudentService.getStudentsByGroup(groupCode);
            
            if (students.length === 0) {
                UIUtils.showWarning('No hay estudiantes registrados en este grupo');
                await this.showClassStatusQuestion(groupCode);
                return;
            }
            
            // Actualizar estado
            this._setState({
                currentGroup: group,
                currentStudents: students,
                attendanceData: {}
            });
            
            // Mostrar formulario de asistencia
            await this._showAttendanceForm(group, students, 'regular');
            
        } catch (error) {
            console.error('AttendanceController: Error al procesar clase realizada:', error);
            UIUtils.showError(error.message || 'Error al procesar la clase');
            await this.showClassStatusQuestion(groupCode);
        } finally {
            this._setState({ isProcessing: false });
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
     * Guarda los datos de asistencia usando ClassControlService
     */
    async saveAttendanceData(groupCode) {
        debugLog('AttendanceController: Guardando datos de asistencia con ClassControlService');
        
        try {
            const attendanceData = this._state.attendanceData;
            const attendanceCount = Object.keys(attendanceData).length;
            
            if (attendanceCount === 0) {
                UIUtils.showWarning('No hay asistencia registrada para guardar');
                return;
            }
            
            this._setState({ isProcessing: true });
            
            // Mostrar loading
            ModalsController.showLoading('Guardando asistencia...', 'Por favor espera...');
            
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const selectedAssistant = this._state.selectedAssistant;
            const classId = this._state.classId;
            
            // Usar ClassControlService para manejar el flujo completo
            const result = await ClassControlService.handleClassRealized(
                selectedDate,
                groupCode,
                attendanceData,
                selectedAssistant?.id || ''
            );
            
            // Cerrar loading
            ModalsController.hideLoading();
            
            // Mostrar resultado
            const successData = {
                title: 'Asistencia Guardada',
                message: 'Clase y asistencia registradas correctamente',
                details: [
                    `Grupo: ${groupCode}`,
                    `Fecha: ${DateUtils.formatDate(selectedDate)}`,
                    `Asistente: ${selectedAssistant?.nombre || 'No especificado'}`,
                    `Clase ID: ${classId}`,
                    `Registros guardados: ${attendanceCount}`,
                    `Método: ${result.attendanceResult.method === 'offline' ? 'Offline (se sincronizará)' : 'Online'}`
                ],
                actions: [{
                    label: '🏠 Ir al Dashboard',
                    handler: 'AppController.showDashboard()',
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
            
            // Mostrar resultado
            const message = result.attendanceResult.method === 'offline' 
                ? `Cancelación guardada offline (${result.studentsAffected} estudiantes). Se sincronizará cuando haya conexión.`
                : `Cancelación registrada para ${result.studentsAffected} estudiantes`;
            
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

    // ===========================================
    // MÉTODOS EXISTENTES (sin cambios significativos)
    // ===========================================

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
     * Muestra vista previa
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
     * Obtiene el estado actual del controlador
     */
    getState() {
        return { ...this._state };
    },

    // ===========================================
    // MÉTODOS PRIVADOS (algunos actualizados)
    // ===========================================

    /**
     * Actualiza el estado interno
     */
    _setState(newState) {
        this._state = { ...this._state, ...newState };
        debugLog('AttendanceController: Estado actualizado:', this._state);
    },

    /**
     * Muestra el formulario de asistencia
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
        
        // Agregar modales necesarios
        document.body.insertAdjacentHTML('beforeend', ModalsView.renderJustificationModal());
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
        let student = this._state.currentStudents.find(s => s.id === studentId);
        
        if (!student) {
            student = window.AppState.estudiantes.find(s => s.id === studentId);
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
        
        studentItem.classList.remove('status-presente', 'status-ausente', 'status-justificada');
        studentItem.classList.add(`status-${status.toLowerCase()}`);
        
        const buttons = studentItem.querySelectorAll('.student-actions button');
        buttons.forEach(btn => {
            btn.classList.remove('btn-primary', 'btn-danger', 'btn-secondary');
            btn.classList.add('btn-outline');
        });
        
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
        
        const saveBtn = document.getElementById('save-attendance-btn');
        if (saveBtn) {
            saveBtn.disabled = total === 0;
            saveBtn.classList.toggle('opacity-50', total === 0);
        }
    }
};

// Hacer disponible globalmente
window.AttendanceController = AttendanceController;

debugLog('AttendanceController actualizado con ClassControlService cargado correctamente');
