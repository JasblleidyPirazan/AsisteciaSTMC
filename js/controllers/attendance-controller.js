/**
 * CONTROLADOR DE ASISTENCIA - VERSIÓN OPTIMIZADA
 * ======================================================
 * ✅ Toda la funcionalidad preservada
 * ✅ Debugging removido para mejor rendimiento
 * ✅ Solo logs críticos de error mantenidos
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
        try {
            const assistants = await AssistantService.getActiveAssistants();
            this._setState({ availableAssistants: assistants });
        } catch (error) {
            console.error('AttendanceController: Error al inicializar:', error);
            this._setState({ availableAssistants: [] });
        }
    },

    /**
     * Selecciona un grupo y va DIRECTO a pregunta de estado
     */
    async selectGroup(groupCode) {
        try {
            this._setState({ isProcessing: true });
            
            const group = await GroupService.getGroupByCode(groupCode);
            this._setState({ currentGroup: group });
            
            if (this._state.availableAssistants.length === 0) {
                await this.initialize();
            }
            
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
        try {
            const group = this._state.currentGroup || await GroupService.getGroupByCode(groupCode);
            this._setState({ currentGroup: group });
            
            const selectedAssistant = this._state.selectedAssistant;
            
            const html = AttendanceFormView.renderClassStatusQuestion({
                group,
                selectedDate: window.AppState.selectedDate || DateUtils.getCurrentDate(),
                selectedAssistant
            });
            
            document.getElementById('app').innerHTML = html;
            
        } catch (error) {
            console.error('AttendanceController: Error mostrando pregunta de estado:', error);
            UIUtils.showError('Error al cargar la información del grupo');
            AppController.showDashboard();
        }
    },

    /**
     * La clase se realizó - pregunta por asistente
     */
    async classWasHeld(groupCode) {
        try {
            this._setState({ isProcessing: true, attendanceType: 'regular' });
            
            UIUtils.showLoading('app', 'Cargando estudiantes...');
            
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            
            // Validar que se pueda reportar la clase
            const validation = await ClassControlService.validateClassReport(selectedDate, groupCode);
            
            if (!validation.valid) {
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
            
            // Obtener grupo y estudiantes
            const group = await GroupService.getGroupByCode(groupCode);
            const students = await StudentService.getStudentsByGroup(groupCode);
            
            if (students.length === 0) {
                UIUtils.showWarning('No hay estudiantes registrados en este grupo');
                await this.showClassStatusQuestion(groupCode);
                return;
            }
            
            this._setState({
                currentGroup: group,
                currentStudents: students,
                attendanceData: {}
            });
            
            // Preguntar por asistente
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
     * Muestra el selector de asistentes para asistencia
     */
    async showAssistantSelectorForAttendance(groupCode) {
        try {
            const group = this._state.currentGroup || await GroupService.getGroupByCode(groupCode);
            const assistants = this._state.availableAssistants;
            
            const html = AttendanceFormView.renderAssistantSelector({
                group,
                assistants,
                selectedDate: window.AppState.selectedDate || DateUtils.getCurrentDate()
            });
            
            document.getElementById('app').innerHTML = html;
            
        } catch (error) {
            console.error('AttendanceController: Error mostrando selector de asistente:', error);
            UIUtils.showError('Error al cargar selector de asistente');
            await this.showClassStatusQuestion(groupCode);
        }
    },

    /**
     * Selecciona asistente - solo guarda en memoria
     */
    async selectAssistantForAttendance(assistantId) {
        try {
            const assistant = this._state.availableAssistants.find(a => a.id === assistantId);
            if (!assistant) {
                throw new Error(`Asistente ${assistantId} no encontrado`);
            }
            
            this._setState({ selectedAssistant: assistant });
            
            // Generar classId temporal
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const groupCode = this._state.currentGroup.codigo;
            const tempClassId = this._generateTemporaryClassId(selectedDate, groupCode);
            this._setState({ classId: tempClassId });
            
            await this.showAttendanceFormDirect();
            
        } catch (error) {
            console.error('AttendanceController: Error al seleccionar asistente:', error);
            UIUtils.showError(`Error: ${error.message}`);
            await this.showAssistantSelectorForAttendance(this._state.currentGroup.codigo);
        }
    },

    /**
     * Wrapper para seleccionar asistente
     */
    async selectAssistant(assistantId) {
        await this.selectAssistantForAttendance(assistantId);
    },

    /**
     * Continúa sin asistente
     */
    async continueToAttendanceWithoutAssistant(groupCode) {
        try {
            this._setState({ selectedAssistant: null });
            
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const tempClassId = this._generateTemporaryClassId(selectedDate, groupCode);
            this._setState({ classId: tempClassId });
            
            await this.showAttendanceFormDirect();
            
        } catch (error) {
            console.error('AttendanceController: Error al continuar sin asistente:', error);
            UIUtils.showError(`Error: ${error.message}`);
            await this.showAssistantSelectorForAttendance(groupCode);
        }
    },

    /**
     * Wrapper para continuar sin asistente
     */
    async continueWithoutAssistant(groupCode) {
        await this.continueToAttendanceWithoutAssistant(groupCode);
    },

    /**
     * Genera ID temporal
     */
    _generateTemporaryClassId(fecha, groupCode) {
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `TEMP_${fecha}_${groupCode}_${timestamp}_${randomSuffix}`;
    },

    /**
     * Muestra el formulario de asistencia
     */
    async showAttendanceFormDirect() {
        try {
            const group = this._state.currentGroup;
            const students = this._state.currentStudents;
            const selectedAssistant = this._state.selectedAssistant;
            
            if (!group || !students || students.length === 0) {
                throw new Error('Datos de grupo o estudiantes no disponibles');
            }
            
            const html = AttendanceFormView.renderAttendanceForm({
                group,
                students,
                selectedDate: window.AppState.selectedDate || DateUtils.getCurrentDate(),
                attendanceType: this._state.attendanceType,
                selectedAssistant
            });
            
            document.getElementById('app').innerHTML = html;
            
            this._setState({ attendanceData: {} });
            
        } catch (error) {
            console.error('AttendanceController: Error mostrando formulario de asistencia:', error);
            UIUtils.showError('Error al cargar formulario de asistencia');
            AppController.showDashboard();
        }
    },

    /**
     * La clase fue cancelada
     */
    async classWasCancelled(groupCode) {
        try {
            const group = this._state.currentGroup || await GroupService.getGroupByCode(groupCode);
            const selectedAssistant = this._state.selectedAssistant;
            
            const html = AttendanceFormView.renderCancellationForm({
                group,
                selectedDate: window.AppState.selectedDate || DateUtils.getCurrentDate(),
                selectedAssistant
            });
            
            document.getElementById('app').innerHTML = html;
            
        } catch (error) {
            console.error('AttendanceController: Error procesando clase cancelada:', error);
            UIUtils.showError('Error al procesar cancelación');
            await this.showClassStatusQuestion(groupCode);
        }
    },

    /**
     * Guarda la cancelación
     */
    async saveCancellation(groupCode) {
        try {
            const reasonRadios = document.querySelectorAll('input[name="cancellation-reason"]');
            let selectedReason = '';
            
            reasonRadios.forEach(radio => {
                if (radio.checked) {
                    selectedReason = radio.value;
                }
            });
            
            if (!selectedReason) {
                UIUtils.showWarning('Por favor selecciona un motivo de cancelación');
                return;
            }
            
            const description = document.getElementById('cancellation-description')?.value || '';
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const selectedAssistant = this._state.selectedAssistant;
            
            this._showLoadingModal('Guardando cancelación...', 'Procesando...');
            
            const result = await ClassControlService.handleClassCancelled(
                selectedDate,
                groupCode,
                selectedReason,
                description,
                selectedAssistant?.id || ''
            );
            
            this._hideLoadingModal();
            
            this._showSuccessModal(result, groupCode, selectedDate, 0, selectedAssistant, 'cancelacion');
            
        } catch (error) {
            this._hideLoadingModal();
            console.error('AttendanceController: Error guardando cancelación:', error);
            UIUtils.showError(`Error al guardar cancelación: ${error.message}`);
        }
    },

    /**
     * Marca la asistencia de un estudiante
     */
    markAttendance(studentId, status) {
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
     * Marca toda la asistencia como un estado específico
     */
    markAllAttendance(status) {
        const students = this._state.currentStudents;
        students.forEach(student => {
            this._recordAttendance(student.id, status);
            this._updateStudentUI(student.id, status);
        });
        
        this._updateAttendanceSummary();
        UIUtils.showSuccess(`Todos los estudiantes marcados como ${status.toLowerCase()}`);
    },

    /**
     * Limpia toda la asistencia
     */
    clearAllAttendance() {
        this._setState({ attendanceData: {} });
        
        const studentItems = document.querySelectorAll('.student-item');
        studentItems.forEach(item => {
            item.className = 'student-item';
            
            const buttons = item.querySelectorAll('button');
            buttons.forEach(btn => {
                btn.className = btn.className.replace(/btn-primary|btn-danger|btn-secondary/, 'btn-outline');
            });
        });
        
        this._updateAttendanceSummary();
        UIUtils.showSuccess('Asistencia limpiada');
    },

    /**
     * Muestra estadísticas de asistencia
     */
    showAttendanceStats() {
        const attendanceData = this._state.attendanceData;
        const groupInfo = this._state.currentGroup;
        const selectedAssistant = this._state.selectedAssistant;
        const totalStudents = this._state.currentStudents.length;
        
        const statsData = {
            totalStudents,
            attendanceRecords: attendanceData,
            groupInfo,
            selectedAssistant
        };
        
        ModalsController.showAttendanceStats(statsData);
    },

    /**
     * Guarda los datos de asistencia
     */
    async saveAttendanceData(groupCode) {
        if (!this._state.classId) {
            console.error('Error crítico: ID de clase faltante');
            UIUtils.showError('Error crítico: ID de clase faltante. Por favor, reinicia el proceso.');
            await this.showClassStatusQuestion(groupCode);
            return;
        }
        
        const attendanceData = this._state.attendanceData;
        const attendanceCount = Object.keys(attendanceData).length;
        
        if (attendanceCount === 0) {
            UIUtils.showError('No hay asistencia registrada. Por favor marca la asistencia de los estudiantes.');
            return;
        }
        
        const invalidRecords = Object.values(attendanceData).filter(record => 
            !record || !record.studentId || !record.status
        );
        
        if (invalidRecords.length > 0) {
            UIUtils.showError(`Se encontraron ${invalidRecords.length} registros inválidos. Por favor, revisa la asistencia.`);
            return;
        }
        
        this._saveDraftToLocalStorage();
        await this.confirmFinalSave();
    },

    /**
     * Confirma y guarda usando ClassControlService
     */
    async confirmFinalSave() {
        try {
            this._closePreviewModal();
            
            const attendanceData = this._state.attendanceData;
            const attendanceCount = Object.keys(attendanceData).length;
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const groupCode = this._state.currentGroup.codigo;
            const selectedAssistant = this._state.selectedAssistant;
            
            if (attendanceCount === 0) {
                UIUtils.showWarning('No hay asistencia registrada para guardar');
                return;
            }
            
            const invalidRecords = Object.values(attendanceData).filter(record => 
                !record || !record.studentId || !record.status
            );
            
            if (invalidRecords.length > 0) {
                throw new Error(`${invalidRecords.length} registros tienen datos incompletos`);
            }
            
            this._setState({ isProcessing: true });
            this._showLoadingModal('Guardando clase y asistencias...', 'Procesando...');
            
            const result = await ClassControlService.handleClassRealized(
                selectedDate,
                groupCode,
                attendanceData,
                selectedAssistant?.id || ''
            );
            
            this._hideLoadingModal();
            
            this._clearDraftFromLocalStorage();
            
            this._showSuccessModal(
                result.attendanceResult, 
                groupCode, 
                selectedDate, 
                result.summary.attendanceRecords,
                selectedAssistant
            );
            
        } catch (error) {
            this._hideLoadingModal();
            console.error('Error en confirmFinalSave:', error);
            
            this._saveDraftToLocalStorage();
            UIUtils.showError(`Error al guardar: ${error.message}. Los datos se guardaron como borrador.`);
            
        } finally {
            this._setState({ isProcessing: false });
        }
    },

    /**
     * Abre modal de justificación
     */
    _openJustificationModal(studentId, studentName) {
        const studentNameElement = document.getElementById('justification-student-name');
        if (studentNameElement) {
            studentNameElement.textContent = studentName;
        }
        
        const typeSelect = document.getElementById('justification-type');
        const descriptionTextarea = document.getElementById('justification-description');
        
        if (typeSelect) typeSelect.value = '';
        if (descriptionTextarea) descriptionTextarea.value = '';
        
        this._justificationStudentId = studentId;
        
        ModalsController.open('justification-modal', '#justification-type');
    },

    /**
     * Guarda justificación
     */
    saveJustification() {
        const studentId = this._justificationStudentId;
        const type = document.getElementById('justification-type')?.value;
        const description = document.getElementById('justification-description')?.value || '';
        
        if (!studentId) {
            UIUtils.showError('Error: ID de estudiante no encontrado');
            return;
        }
        
        if (!type) {
            UIUtils.showWarning('Por favor selecciona un tipo de justificación');
            return;
        }
        
        const justification = type + (description ? `: ${description}` : '');
        
        this._recordAttendance(studentId, 'Justificada', justification);
        this._updateStudentUI(studentId, 'Justificada');
        this._updateAttendanceSummary();
        
        ModalsController.close('justification-modal');
        
        const student = this._findStudent(studentId);
        UIUtils.showSuccess(`${student?.nombre || studentId} marcado como justificada`);
    },

    /**
     * Abre modal de reposición individual
     */
    async openRepositionModal() {
        try {
            const classData = {
                groupCode: this._state.currentGroup.codigo,
                classId: this._state.classId,
                selectedDate: window.AppState.selectedDate || DateUtils.getCurrentDate(),
                sentBy: window.AppState.user?.email || 'usuario'
            };
            
            await RepositionController.openFromAttendance(classData);
            
        } catch (error) {
            console.error('AttendanceController: Error abriendo modal de reposición:', error);
            UIUtils.showError('Error al abrir reposición individual');
        }
    },

    /**
     * Exporta asistencia
     */
    exportAttendance(groupCode) {
        UIUtils.showInfo('Función de exportación en desarrollo');
    },

    /**
     * Actualiza la UI de un estudiante
     */
    _updateStudentUI(studentId, status) {
        const studentItem = document.querySelector(`[data-student-id="${studentId}"]`);
        if (!studentItem) return;
        
        studentItem.className = studentItem.className.replace(/status-\w+/g, '');
        studentItem.classList.add(`status-${status.toLowerCase()}`);
        
        const buttons = studentItem.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.className = btn.className.replace(/btn-primary|btn-danger|btn-secondary/, 'btn-outline');
            
            if (btn.textContent.includes(status)) {
                if (status === 'Presente') btn.className = btn.className.replace('btn-outline', 'btn-primary');
                else if (status === 'Ausente') btn.className = btn.className.replace('btn-outline', 'btn-danger');
                else if (status === 'Justificada') btn.className = btn.className.replace('btn-outline', 'btn-secondary');
            }
        });
    },

    /**
     * Actualiza el resumen de asistencia
     */
    _updateAttendanceSummary() {
        const attendanceData = this._state.attendanceData;
        const stats = AttendanceService.calculateAttendanceStats(Object.values(attendanceData));
        
        const summaryElement = document.getElementById('attendance-summary');
        if (summaryElement) {
            if (stats.total === 0) {
                summaryElement.textContent = 'Sin registros';
            } else {
                summaryElement.innerHTML = `
                    <span class="text-green-600">${stats.present} presentes</span> • 
                    <span class="text-red-600">${stats.absent} ausentes</span> • 
                    <span class="text-yellow-600">${stats.justified} justificadas</span>
                    <span class="text-gray-500">(${stats.total} total)</span>
                `;
            }
        }
    },

    /**
     * Muestra vista previa final
     */
    showFinalPreview() {
        const groupCode = this._state.currentGroup.codigo;
        const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
        const attendanceData = this._state.attendanceData;
        const selectedAssistant = this._state.selectedAssistant;
        const stats = AttendanceService.calculateAttendanceStats(Object.values(attendanceData));
        
        const previewData = {
            groupCode,
            selectedDate,
            attendance: attendanceData,
            stats,
            selectedAssistant,
            attendanceType: this._state.attendanceType
        };
        
        const content = ModalsView.getAttendancePreviewContent(previewData);
        this._showPreviewModal(content);
    },

    /**
     * Muestra modal de vista previa
     */
    _showPreviewModal(content) {
        let modal = document.getElementById('custom-preview-modal');
        if (!modal) {
            const modalHTML = `
                <div id="custom-preview-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50" style="display: none;">
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
                            
                            <div class="p-6 overflow-y-auto max-h-96" id="custom-preview-content">
                                <!-- Contenido -->
                            </div>
                            
                            <div class="p-6 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
                                <button onclick="AttendanceController._closePreviewModal()" 
                                        class="btn btn-outline">
                                    ❌ Cancelar
                                </button>
                                <button onclick="AttendanceController.confirmFinalSave()" 
                                        class="btn btn-primary btn-lg">
                                    ✅ Confirmar y Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('custom-preview-modal');
        }
        
        const contentDiv = document.getElementById('custom-preview-content');
        if (contentDiv) {
            contentDiv.innerHTML = content;
        }
        
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    /**
     * Cierra modal de vista previa
     */
    _closePreviewModal() {
        const modal = document.getElementById('custom-preview-modal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    },

    /**
     * Muestra modal de loading
     */
    _showLoadingModal(title, message) {
        ModalsController.showLoading(title, message);
    },

    /**
     * Oculta modal de loading
     */
    _hideLoadingModal() {
        ModalsController.hideLoading();
    },

    /**
     * Muestra modal de éxito
     */
    _showSuccessModal(result, groupCode, selectedDate, attendanceCount, selectedAssistant, type = 'asistencia') {
        const formattedDate = DateUtils.formatDate(selectedDate);
        
        let title, message, details = [];
        
        if (type === 'cancelacion') {
            title = '✅ Cancelación Registrada';
            message = `La clase ${groupCode} del ${formattedDate} fue cancelada correctamente`;
            details = [
                `Grupo: ${groupCode}`,
                `Fecha: ${formattedDate}`,
                `Estado: Cancelada`,
                selectedAssistant ? `Asistente: ${selectedAssistant.nombre}` : 'Sin asistente'
            ];
        } else {
            title = '✅ Asistencia Guardada';
            message = `Se guardaron ${attendanceCount} registros de asistencia correctamente`;
            details = [
                `Grupo: ${groupCode}`,
                `Fecha: ${formattedDate}`,
                `Registros: ${attendanceCount}`,
                `Método: ${result.method || 'desconocido'}`,
                selectedAssistant ? `Asistente: ${selectedAssistant.nombre}` : 'Sin asistente'
            ];
        }
        
        const actions = [
            {
                label: '🏠 Ir al Dashboard',
                handler: 'AppController.showDashboard(); AttendanceController._closeAllModals();',
                class: 'btn-primary'
            },
            {
                label: '📋 Nueva Asistencia',
                handler: 'AppController.showDashboard(); AttendanceController._closeAllModals();',
                class: 'btn-secondary'
            }
        ];
        
        const content = ModalsView.getSuccessContent({
            title,
            message,
            details,
            actions
        });
        
        const modal = document.getElementById('notification-modal');
        const modalContent = document.getElementById('notification-content');
        
        if (modal && modalContent) {
            modalContent.innerHTML = content;
            modal.classList.remove('hidden');
            document.body.classList.add('no-scroll');
        }
    },

    /**
     * Cierra todos los modales
     */
    _closeAllModals() {
        this._closePreviewModal();
        ModalsController.hideLoading();
        UIUtils.closeNotification();
    },

    /**
     * Registra asistencia
     */
    _recordAttendance(studentId, status, justification = '', description = '') {
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
        
        if (!student) {
            const studentIdStr = studentId.toString();
            student = this._state.currentStudents.find(s => s.id.toString() === studentIdStr) ||
                      window.AppState.estudiantes.find(s => s.id.toString() === studentIdStr);
        }
        
        return student;
    },

    /**
     * Actualiza el estado interno
     */
    _setState(newState) {
        this._state = { ...this._state, ...newState };
    },

    /**
     * Guarda borrador en localStorage
     */
    _saveDraftToLocalStorage() {
        const draftData = {
            groupCode: this._state.currentGroup?.codigo,
            fecha: window.AppState.selectedDate,
            attendanceData: this._state.attendanceData,
            selectedAssistant: this._state.selectedAssistant,
            tempClassId: this._state.classId,
            timestamp: DateUtils.getCurrentTimestamp(),
            version: 'v2'
        };
        
        StorageUtils.save('attendance_draft', draftData);
    },

    /**
     * Limpia borrador de localStorage
     */
    _clearDraftFromLocalStorage() {
        StorageUtils.remove('attendance_draft');
    },

    /**
     * Recupera borrador
     */
    async recoverDraft() {
        const draft = StorageUtils.get('attendance_draft');
        
        if (!draft || draft.version !== 'v2') {
            return false;
        }
        
        const draftTime = new Date(draft.timestamp);
        const now = new Date();
        const hoursDiff = (now - draftTime) / (1000 * 60 * 60);
        
        if (hoursDiff > 24) {
            this._clearDraftFromLocalStorage();
            return false;
        }
        
        try {
            this._setState({
                currentGroup: await GroupService.getGroupByCode(draft.groupCode),
                attendanceData: draft.attendanceData,
                selectedAssistant: draft.selectedAssistant,
                classId: draft.tempClassId
            });
            
            window.AppState.selectedDate = draft.fecha;
            
            UIUtils.showInfo('Borrador recuperado. Puedes continuar editando y guardar.');
            return true;
            
        } catch (error) {
            console.error('Error recuperando borrador:', error);
            this._clearDraftFromLocalStorage();
            return false;
        }
    }
};

// Hacer disponible globalmente
window.AttendanceController = AttendanceController;
