/**
 * CONTROLADOR DE ASISTENCIA
 * =========================
 * Maneja toda la lógica de registro de asistencias, cancelaciones y reposiciones
 */

const AttendanceController = {
    // Estado interno del controlador
    _state: {
        currentGroup: null,
        currentStudents: [],
        attendanceData: {},
        attendanceType: 'regular', // 'regular' | 'reposition'
        isProcessing: false
    },

    /**
     * Selecciona un grupo y muestra la pregunta inicial
     */
    async selectGroup(groupCode) {
        debugLog(`AttendanceController: Seleccionando grupo ${groupCode}`);
        
        try {
            this._setState({ isProcessing: true });
            
            // Encontrar el grupo
            const group = await GroupService.getGroupByCode(groupCode);
            this._setState({ currentGroup: group });
            
            // Mostrar pregunta sobre estado de la clase
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
     * Muestra la pregunta inicial sobre el estado de la clase
     */
    async showClassStatusQuestion(groupCode) {
        debugLog(`AttendanceController: Mostrando pregunta de estado para ${groupCode}`);
        
        try {
            const group = this._state.currentGroup || await GroupService.getGroupByCode(groupCode);
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            
            const html = AttendanceFormView.renderClassStatusQuestion({
                group,
                selectedDate
            });
            
            document.getElementById('app').innerHTML = html;
            
        } catch (error) {
            console.error('AttendanceController: Error mostrando pregunta de estado:', error);
            UIUtils.showError('Error al cargar la información del grupo');
        }
    },

    /**
     * La clase se realizó - proceder con registro de asistencia
     */
    async classWasHeld(groupCode) {
        debugLog(`AttendanceController: Clase realizada para grupo ${groupCode}`);
        
        try {
            this._setState({ isProcessing: true, attendanceType: 'regular' });
            
            UIUtils.showLoading('app', 'Cargando estudiantes...');
            
            // Obtener grupo y estudiantes
            const group = await GroupService.getGroupByCode(groupCode);
            const students = await StudentService.getStudentsByGroup(groupCode);
            
            if (students.length === 0) {
                UIUtils.showWarning('No hay estudiantes registrados en este grupo');
                await this.showClassStatusQuestion(groupCode);
                return;
            }
            
            // Inicializar estado de asistencia
            this._setState({
                currentGroup: group,
                currentStudents: students,
                attendanceData: {}
            });
            
            // Mostrar formulario de asistencia
            await this._showAttendanceForm(group, students, 'regular');
            
        } catch (error) {
            console.error('AttendanceController: Error al procesar clase realizada:', error);
            UIUtils.showError('Error al cargar estudiantes');
            await this.showClassStatusQuestion(groupCode);
        } finally {
            this._setState({ isProcessing: false });
        }
    },

    /**
     * La clase fue cancelada - registrar cancelación
     */
    async classWasCancelled(groupCode) {
        debugLog(`AttendanceController: Clase cancelada para grupo ${groupCode}`);
        
        try {
            const group = await GroupService.getGroupByCode(groupCode);
            this._setState({ currentGroup: group });
            
            // Mostrar formulario de cancelación
            const html = AttendanceFormView.renderCancellationForm({
                group,
                selectedDate: window.AppState.selectedDate || DateUtils.getCurrentDate()
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
            // Buscar información del estudiante
            const student = this._findStudent(studentId);
            if (!student) {
                UIUtils.showError('Estudiante no encontrado');
                return;
            }
            
            // Si es justificada, abrir modal
            if (status === 'Justificada') {
                this._openJustificationModal(studentId, student.nombre);
                return;
            }
            
            // Registrar asistencia
            this._recordAttendance(studentId, status);
            
            // Actualizar UI
            this._updateStudentUI(studentId, status);
            this._updateAttendanceSummary();
            
            // Feedback
            UIUtils.showSuccess(`${student.nombre} marcado como ${status.toLowerCase()}`);
            
        } catch (error) {
            console.error('AttendanceController: Error al marcar asistencia:', error);
            UIUtils.showError('Error al registrar asistencia');
        }
    },

    /**
     * Marca asistencia masiva para todos los estudiantes
     */
    markAllAttendance(status) {
        debugLog(`AttendanceController: Marcando todos como ${status}`);
        
        try {
            if (status === 'Justificada') {
                UIUtils.showInfo('Para justificaciones, marca estudiantes individualmente');
                return;
            }
            
            const students = this._state.currentStudents;
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
            
            // Confirmar acción
            ModalsController.showConfirmation({
                title: 'Limpiar Asistencia',
                message: `¿Estás seguro de que quieres limpiar ${attendanceCount} registros de asistencia?`,
                icon: '🗑️',
                type: 'warning'
            }, () => {
                // Limpiar datos
                this._setState({ attendanceData: {} });
                
                // Actualizar UI
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
     * Guarda los datos de asistencia
     */
    async saveAttendanceData(groupCode) {
        debugLog('AttendanceController: Guardando datos de asistencia');
        
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
            
            // Crear registros de asistencia
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const { records, errors } = AttendanceService.createGroupAttendanceRecords(
                attendanceData,
                {
                    groupCode,
                    date: selectedDate,
                    classType: this._state.attendanceType,
                    sentBy: window.AppState.user?.email || 'usuario'
                }
            );
            
            if (errors.length > 0) {
                console.warn('AttendanceController: Errores en algunos registros:', errors);
            }
            
            // Guardar registros
            const result = await AttendanceService.saveAttendance(records);
            
            // Cerrar loading
            ModalsController.hideLoading();
            
            // Mostrar resultado
            const successData = {
                title: 'Asistencia Guardada',
                message: result.method === 'offline' ? result.message : 'Datos guardados correctamente en Google Sheets',
                details: [
                    `Grupo: ${groupCode}`,
                    `Fecha: ${DateUtils.formatDate(selectedDate)}`,
                    `Registros guardados: ${result.saved}`,
                    `Método: ${result.method === 'offline' ? 'Offline (se sincronizará automáticamente)' : 'Online'}`
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
                currentStudents: []
            });
            
        } catch (error) {
            ModalsController.hideLoading();
            console.error('AttendanceController: Error al guardar asistencia:', error);
            UIUtils.showError('Error al guardar asistencia');
        } finally {
            this._setState({ isProcessing: false });
        }
    },

    /**
     * Guarda la cancelación de una clase
     */
    async saveCancellation(groupCode) {
        debugLog('AttendanceController: Guardando cancelación');
        
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
            
            this._setState({ isProcessing: true });
            
            // Deshabilitar botón
            const saveBtn = document.getElementById('save-cancellation-btn');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<div class="spinner mr-3"></div>Guardando...';
            }
            
            // Obtener estudiantes del grupo
            const students = await StudentService.getStudentsByGroup(groupCode);
            
            // Guardar cancelación
            const result = await AttendanceService.saveCancellation(
                groupCode,
                reason,
                description,
                selectedDate,
                students
            );
            
            // Mostrar resultado
            const message = result.method === 'offline' 
                ? `Cancelación guardada offline (${students.length} estudiantes). Se sincronizará cuando haya conexión.`
                : `Cancelación registrada para ${students.length} estudiantes`;
            
            UIUtils.showSuccess(message);
            
            // Volver al dashboard después de un momento
            setTimeout(() => {
                AppController.showDashboard();
            }, 2000);
            
        } catch (error) {
            console.error('AttendanceController: Error al guardar cancelación:', error);
            UIUtils.showError('Error al guardar la cancelación');
            
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
     * Muestra vista previa de la asistencia
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
            
            // Calcular estadísticas
            const stats = AttendanceService.calculateAttendanceStats(Object.values(attendanceData));
            
            // Generar contenido de vista previa
            const previewData = {
                groupCode,
                selectedDate: window.AppState.selectedDate || DateUtils.getCurrentDate(),
                attendance: attendanceData,
                stats,
                attendanceType: this._state.attendanceType
            };
            
            const previewContent = ModalsView.getAttendancePreviewContent(previewData);
            ModalsController.showPreview(previewContent);
            
        } catch (error) {
            console.error('AttendanceController: Error en vista previa:', error);
            UIUtils.showError('Error al generar vista previa');
        }
    },

    /**
     * Muestra estadísticas de asistencia actual
     */
    showAttendanceStats() {
        debugLog('AttendanceController: Mostrando estadísticas');
        
        try {
            const students = this._state.currentStudents;
            const attendanceData = this._state.attendanceData;
            
            const statsData = {
                totalStudents: students.length,
                attendanceRecords: attendanceData,
                groupInfo: this._state.currentGroup
            };
            
            ModalsController.showAttendanceStats(statsData);
            
        } catch (error) {
            console.error('AttendanceController: Error mostrando estadísticas:', error);
            UIUtils.showError('Error al mostrar estadísticas');
        }
    },

    /**
     * Guarda una justificación
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
            
            // Registrar asistencia justificada
            this._recordAttendance(studentId, 'Justificada', type, description);
            
            // Actualizar UI
            this._updateStudentUI(studentId, 'Justificada');
            this._updateAttendanceSummary();
            
            // Cerrar modal
            ModalsController.close('justification-modal');
            
            const student = this._findStudent(studentId);
            UIUtils.showSuccess(`Justificación guardada para ${student?.nombre || studentId}`);
            
        } catch (error) {
            console.error('AttendanceController: Error guardando justificación:', error);
            UIUtils.showError('Error al guardar justificación');
        }
    },

    /**
     * Exporta los datos de asistencia (placeholder)
     */
    exportAttendance(groupCode) {
        UIUtils.showInfo('Función de exportación en desarrollo');
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
     * Muestra el formulario de asistencia
     */
    async _showAttendanceForm(group, students, type) {
        const html = AttendanceFormView.renderAttendanceForm({
            group,
            students,
            selectedDate: window.AppState.selectedDate || DateUtils.getCurrentDate(),
            attendanceType: type
        });
        
        document.getElementById('app').innerHTML = html;
        
        // Agregar modales necesarios
        document.body.insertAdjacentHTML('beforeend', ModalsView.renderJustificationModal());
    },

    /**
     * Registra un dato de asistencia
     */
    _recordAttendance(studentId, status, justification = '', description = '') {
        const attendanceData = { ...this._state.attendanceData };
        
        attendanceData[studentId] = {
            studentId,
            status,
            justification,
            description,
            timestamp: DateUtils.getCurrentTimestamp()
        };
        
        this._setState({ attendanceData });
    },

    /**
     * Busca un estudiante por ID
     */
    _findStudent(studentId) {
        return this._state.currentStudents.find(s => s.id === studentId) ||
               window.AppState.estudiantes.find(s => s.id === studentId);
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
    }
};

// Hacer disponible globalmente
window.AttendanceController = AttendanceController;

debugLog('attendance-controller.js cargado correctamente');
