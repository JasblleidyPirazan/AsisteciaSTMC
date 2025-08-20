/**
 * CONTROLADOR DE ASISTENCIA - VERSIÓN CORREGIDA COMPLETA
 * ======================================================
 * 🔧 FIXES APLICADOS:
 * ✅ Campo Grupo_Codigo agregado a registros
 * ✅ Manejo de clases duplicadas
 * ✅ Validación exhaustiva de datos
 * ✅ Limpieza de registros pendientes
 * ✅ Sistema de debugging completo
 * ✅ FIX CRÍTICO: Clase se crea solo al confirmar guardado (no antes)
 * ✅ FIX: Mejor manejo de borradores con IDs temporales
 * ✅ FIX INTEGRADO: confirmFinalSave usa ClassControlService
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
        classId: null, // 🔍 DEBUG: Este es crítico - ahora será temporal hasta confirmar
        draftSession: null,
        lastClickTimes: {},
        // 🔍 NUEVO: Estado de debugging
        debugInfo: {
            creationTimestamp: null,
            classCreationStep: null,
            lastClassId: null,
            attendanceCreationFlow: []
        }
    },

    /**
     * 🔍 DEBUG: Nuevo método para logging detallado del estado
     */
    _debugLogState(step, additionalInfo = {}) {
        const debugData = {
            step: step,
            timestamp: new Date().toISOString(),
            classId: this._state.classId,
            selectedAssistant: this._state.selectedAssistant?.id || null,
            attendanceCount: Object.keys(this._state.attendanceData).length,
            currentGroup: this._state.currentGroup?.codigo || null,
            ...additionalInfo
        };
        
        console.log(`🔍 DEBUG [${step}]:`, debugData);
        
        // Guardar en el estado para análisis posterior
        this._state.debugInfo.attendanceCreationFlow.push(debugData);
        
        return debugData;
    },

    /**
     * 🔍 DEBUG: Método para verificar integridad del ID_Clase
     */
    _verifyClassIdIntegrity(context) {
        const classId = this._state.classId;
        const debugInfo = {
            context: context,
            classId: classId,
            hasClassId: !!classId,
            classIdType: typeof classId,
            classIdLength: classId ? classId.length : 0,
            isTemporary: classId ? classId.startsWith('TEMP_') : false,
            currentGroup: this._state.currentGroup?.codigo,
            selectedAssistant: this._state.selectedAssistant?.id
        };
        
        console.log(`🔍 VERIFY CLASS ID [${context}]:`, debugInfo);
        
        if (!classId) {
            console.error(`❌ CLASS ID MISSING in ${context}!`, debugInfo);
            return false;
        }
        
        console.log(`✅ CLASS ID OK in ${context}:`, classId, debugInfo.isTemporary ? '(TEMPORAL)' : '(REAL)');
        return true;
    },

    /**
     * Inicializa el controlador y carga asistentes
     */
    async initialize() {
        debugLog('AttendanceController: Inicializando...');
        this._debugLogState('INITIALIZE_START');
        
        try {
            // Cargar asistentes disponibles
            const assistants = await AssistantService.getActiveAssistants();
            this._setState({ 
                availableAssistants: assistants,
                debugInfo: {
                    ...this._state.debugInfo,
                    creationTimestamp: new Date().toISOString()
                }
            });
            
            this._debugLogState('INITIALIZE_COMPLETE', { assistantsCount: assistants.length });
            debugLog(`AttendanceController: ${assistants.length} asistentes disponibles`);
            
        } catch (error) {
            console.error('AttendanceController: Error al inicializar:', error);
            this._debugLogState('INITIALIZE_ERROR', { error: error.message });
            this._setState({ availableAssistants: [] });
        }
    },

    /**
     * Selecciona un grupo y va DIRECTO a pregunta de estado
     */
    async selectGroup(groupCode) {
        debugLog(`AttendanceController: Seleccionando grupo ${groupCode}`);
        this._debugLogState('SELECT_GROUP_START', { groupCode });
        
        try {
            this._setState({ isProcessing: true });
            
            // Encontrar el grupo
            const group = await GroupService.getGroupByCode(groupCode);
            this._setState({ currentGroup: group });
            
            this._debugLogState('GROUP_LOADED', { 
                groupCode: group.codigo,
                groupHour: group.hora 
            });
            
            // Inicializar asistentes si no se ha hecho
            if (this._state.availableAssistants.length === 0) {
                await this.initialize();
            }
            
            // 🔍 DEBUG: Verificar estado antes de mostrar pregunta
            this._verifyClassIdIntegrity('BEFORE_SHOW_QUESTION');
            
            // Ir DIRECTO a pregunta de estado
            await this.showClassStatusQuestion(groupCode);
            
        } catch (error) {
            console.error('AttendanceController: Error al seleccionar grupo:', error);
            this._debugLogState('SELECT_GROUP_ERROR', { error: error.message });
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
        debugLog(`AttendanceController: Mostrando pregunta de estado para grupo ${groupCode}`);
        this._debugLogState('SHOW_CLASS_STATUS_QUESTION_START', { groupCode });
        
        try {
            // Obtener información del grupo si no la tenemos
            const group = this._state.currentGroup || await GroupService.getGroupByCode(groupCode);
            this._setState({ currentGroup: group });
            
            // Obtener asistente seleccionado si existe
            const selectedAssistant = this._state.selectedAssistant;
            
            // Renderizar pregunta de estado
            const html = AttendanceFormView.renderClassStatusQuestion({
                group,
                selectedDate: window.AppState.selectedDate || DateUtils.getCurrentDate(),
                selectedAssistant
            });
            
            document.getElementById('app').innerHTML = html;
            
            this._debugLogState('SHOW_CLASS_STATUS_QUESTION_SUCCESS');
            
        } catch (error) {
            console.error('AttendanceController: Error mostrando pregunta de estado:', error);
            this._debugLogState('SHOW_CLASS_STATUS_QUESTION_ERROR', { error: error.message });
            UIUtils.showError('Error al cargar la información del grupo');
            AppController.showDashboard();
        }
    },

    /**
     * La clase se realizó - AHORA pregunta por asistente por primera vez
     */
    async classWasHeld(groupCode) {
        debugLog(`AttendanceController: Clase realizada para grupo ${groupCode} - FLUJO CON DEBUG`);
        this._debugLogState('CLASS_WAS_HELD_START', { groupCode });
        
        try {
            this._setState({ isProcessing: true, attendanceType: 'regular' });
            
            UIUtils.showLoading('app', 'Cargando estudiantes...');
            
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            
            this._debugLogState('VALIDATION_START', { selectedDate });
            
            // 1. Validar que se pueda reportar la clase
            const validation = await ClassControlService.validateClassReport(selectedDate, groupCode);
            
            if (!validation.valid) {
                this._debugLogState('VALIDATION_FAILED', { 
                    error: validation.error,
                    existingClass: validation.existingClass 
                });
                
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
            
            this._debugLogState('VALIDATION_PASSED');
            
            // 2. Obtener grupo y estudiantes PRIMERO
            const group = await GroupService.getGroupByCode(groupCode);
            const students = await StudentService.getStudentsByGroup(groupCode);
            
            if (students.length === 0) {
                this._debugLogState('NO_STUDENTS_FOUND');
                UIUtils.showWarning('No hay estudiantes registrados en este grupo');
                await this.showClassStatusQuestion(groupCode);
                return;
            }
            
            this._debugLogState('STUDENTS_LOADED', { studentsCount: students.length });
            
            // 3. Actualizar estado
            this._setState({
                currentGroup: group,
                currentStudents: students,
                attendanceData: {} // 🔍 DEBUG: Limpiar asistencias previas
            });
            
            // 🔍 DEBUG: Verificar que NO tengamos classId todavía (correcto)
            this._verifyClassIdIntegrity('BEFORE_ASSISTANT_SELECTION');
            if (this._state.classId) {
                console.warn('⚠️ DEBUG: classId ya existe antes de seleccionar asistente - esto no debería pasar');
            }
            
            // 4. AHORA SÍ preguntar por asistente (primera y única vez)
            await this.showAssistantSelectorForAttendance(groupCode);
            
        } catch (error) {
            console.error('AttendanceController: Error al procesar clase realizada:', error);
            this._debugLogState('CLASS_WAS_HELD_ERROR', { error: error.message });
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
        debugLog(`AttendanceController: Mostrando selector de asistente para ${groupCode}`);
        this._debugLogState('SHOW_ASSISTANT_SELECTOR_START', { groupCode });
        
        try {
            const group = this._state.currentGroup || await GroupService.getGroupByCode(groupCode);
            const assistants = this._state.availableAssistants;
            
            const html = AttendanceFormView.renderAssistantSelector({
                group,
                assistants,
                selectedDate: window.AppState.selectedDate || DateUtils.getCurrentDate()
            });
            
            document.getElementById('app').innerHTML = html;
            
            this._debugLogState('SHOW_ASSISTANT_SELECTOR_SUCCESS');
            
        } catch (error) {
            console.error('AttendanceController: Error mostrando selector de asistente:', error);
            this._debugLogState('SHOW_ASSISTANT_SELECTOR_ERROR', { error: error.message });
            UIUtils.showError('Error al cargar selector de asistente');
            await this.showClassStatusQuestion(groupCode);
        }
    },

    /**
     * 🔧 FIX: Selecciona asistente - SOLO guarda en memoria (no crea clase todavía)
     */
    async selectAssistantForAttendance(assistantId) {
        debugLog(`AttendanceController: Asistente seleccionado para asistencia: ${assistantId}`);
        this._debugLogState('SELECT_ASSISTANT_START', { assistantId });
        
        try {
            // 1. Buscar asistente
            const assistant = this._state.availableAssistants.find(a => a.id === assistantId);
            if (!assistant) {
                throw new Error(`Asistente ${assistantId} no encontrado`);
            }
            
            this._debugLogState('ASSISTANT_FOUND', { 
                assistantId: assistant.id,
                assistantName: assistant.nombre 
            });
            
            // 2. 🔧 FIX: Solo guardar asistente en estado, NO crear clase
            this._setState({ selectedAssistant: assistant });
            
            // 3. 🔧 FIX: Generar classId temporal para usar en memoria
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const groupCode = this._state.currentGroup.codigo;
            const tempClassId = this._generateTemporaryClassId(selectedDate, groupCode);
            this._setState({ classId: tempClassId });
            
            console.log('✅ FIX: Asistente guardado en memoria, classId temporal:', tempClassId);
            
            // 4. Ir al formulario de asistencia
            await this.showAttendanceFormDirect();
            
        } catch (error) {
            console.error('AttendanceController: Error al seleccionar asistente:', error);
            UIUtils.showError(`Error: ${error.message}`);
            await this.showAssistantSelectorForAttendance(this._state.currentGroup.codigo);
        }
    },

    /**
     * Wrapper para seleccionar asistente (llamado desde UI)
     */
    async selectAssistant(assistantId) {
        debugLog(`AttendanceController: Seleccionando asistente ${assistantId}`);
        await this.selectAssistantForAttendance(assistantId);
    },

    /**
     * 🔧 FIX: Continúa sin asistente - SOLO guarda en memoria (no crea clase todavía)
     */
    async continueToAttendanceWithoutAssistant(groupCode) {
        debugLog('AttendanceController: Continuando sin asistente');
        this._debugLogState('CONTINUE_WITHOUT_ASSISTANT_START');
        
        try {
            // 1. 🔧 FIX: Solo limpiar asistente, NO crear clase
            this._setState({ selectedAssistant: null });
            
            // 2. 🔧 FIX: Generar classId temporal
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const tempClassId = this._generateTemporaryClassId(selectedDate, groupCode);
            this._setState({ classId: tempClassId });
            
            console.log('✅ FIX: Continuando sin asistente, classId temporal:', tempClassId);
            
            // 3. Ir al formulario de asistencia
            await this.showAttendanceFormDirect();
            
        } catch (error) {
            console.error('AttendanceController: Error al continuar sin asistente:', error);
            UIUtils.showError(`Error: ${error.message}`);
            await this.showAssistantSelectorForAttendance(groupCode);
        }
    },

    /**
     * Wrapper para continuar sin asistente (llamado desde UI)
     */
    async continueWithoutAssistant(groupCode) {
        debugLog('AttendanceController: Continuando sin asistente');
        await this.continueToAttendanceWithoutAssistant(groupCode);
    },

    /**
     * 🔧 CORREGIDO: Método mejorado para crear ID temporal más descriptivo
     */
    _generateTemporaryClassId(fecha, groupCode) {
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `TEMP_${fecha}_${groupCode}_${timestamp}_${randomSuffix}`;
    },

    /**
     * Muestra el formulario de asistencia directamente
     */
    async showAttendanceFormDirect() {
        debugLog('AttendanceController: Mostrando formulario de asistencia directo');
        this._debugLogState('SHOW_ATTENDANCE_FORM_START');
        
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
            
            // Inicializar estado de asistencia
            this._setState({ attendanceData: {} });
            
            this._debugLogState('SHOW_ATTENDANCE_FORM_SUCCESS');
            
        } catch (error) {
            console.error('AttendanceController: Error mostrando formulario de asistencia:', error);
            this._debugLogState('SHOW_ATTENDANCE_FORM_ERROR', { error: error.message });
            UIUtils.showError('Error al cargar formulario de asistencia');
            AppController.showDashboard();
        }
    },

    /**
     * La clase fue cancelada
     */
    async classWasCancelled(groupCode) {
        debugLog(`AttendanceController: Clase cancelada para grupo ${groupCode}`);
        this._debugLogState('CLASS_WAS_CANCELLED_START', { groupCode });
        
        try {
            const group = this._state.currentGroup || await GroupService.getGroupByCode(groupCode);
            const selectedAssistant = this._state.selectedAssistant;
            
            const html = AttendanceFormView.renderCancellationForm({
                group,
                selectedDate: window.AppState.selectedDate || DateUtils.getCurrentDate(),
                selectedAssistant
            });
            
            document.getElementById('app').innerHTML = html;
            
            this._debugLogState('CLASS_WAS_CANCELLED_SUCCESS');
            
        } catch (error) {
            console.error('AttendanceController: Error procesando clase cancelada:', error);
            this._debugLogState('CLASS_WAS_CANCELLED_ERROR', { error: error.message });
            UIUtils.showError('Error al procesar cancelación');
            await this.showClassStatusQuestion(groupCode);
        }
    },

    /**
     * Guarda la cancelación
     */
    async saveCancellation(groupCode) {
        debugLog(`AttendanceController: Guardando cancelación para grupo ${groupCode}`);
        this._debugLogState('SAVE_CANCELLATION_START', { groupCode });
        
        try {
            // Obtener datos del formulario
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
            
            // Mostrar loading
            this._showLoadingModal('Guardando cancelación...', 'Procesando...');
            
            // Usar ClassControlService para manejar cancelación
            const result = await ClassControlService.handleClassCancelled(
                selectedDate,
                groupCode,
                selectedReason,
                description,
                selectedAssistant?.id || ''
            );
            
            this._hideLoadingModal();
            
            // Mostrar éxito
            this._showSuccessModal(result, groupCode, selectedDate, 0, selectedAssistant, 'cancelacion');
            
            this._debugLogState('SAVE_CANCELLATION_SUCCESS');
            
        } catch (error) {
            this._hideLoadingModal();
            console.error('AttendanceController: Error guardando cancelación:', error);
            this._debugLogState('SAVE_CANCELLATION_ERROR', { error: error.message });
            UIUtils.showError(`Error al guardar cancelación: ${error.message}`);
        }
    },

    /**
     * Marca la asistencia de un estudiante individual
     */
    markAttendance(studentId, status) {
        debugLog(`AttendanceController: Marcando ${studentId} como ${status}`);
        this._debugLogState('MARK_ATTENDANCE', { studentId, status });
        
        // 🔍 DEBUG: Verificar classId antes de marcar asistencia
        this._verifyClassIdIntegrity('MARK_ATTENDANCE');
        
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
            
            // 🔍 DEBUG: Verificar que el registro tenga classId
            const record = this._state.attendanceData[studentId];
            console.log('🔍 DEBUG: Registro de asistencia creado:', {
                studentId,
                status,
                hasClassId: !!this._state.classId,
                classId: this._state.classId,
                isTemporary: this._state.classId?.startsWith('TEMP_'),
                record: record
            });
            
            UIUtils.showSuccess(`${student.nombre} marcado como ${status.toLowerCase()}`);
            
        } catch (error) {
            console.error('AttendanceController: Error al marcar asistencia:', error);
            this._debugLogState('MARK_ATTENDANCE_ERROR', { error: error.message });
            UIUtils.showError('Error al registrar asistencia');
        }
    },

    /**
     * Marca toda la asistencia como un estado específico
     */
    markAllAttendance(status) {
        debugLog(`AttendanceController: Marcando todos como ${status}`);
        
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
        debugLog('AttendanceController: Limpiando toda la asistencia');
        
        this._setState({ attendanceData: {} });
        
        // Limpiar UI
        const studentItems = document.querySelectorAll('.student-item');
        studentItems.forEach(item => {
            item.className = 'student-item';
            
            // Resetear botones
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
        debugLog('AttendanceController: Mostrando estadísticas de asistencia');
        
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
     * 🔧 SOLUCIÓN: Método saveAttendanceData con validación completa
     */
    async saveAttendanceData(groupCode) {
        debugLog('AttendanceController: Guardando asistencias - VERSIÓN CON SOLUCIONES');
        this._debugLogState('SAVE_ATTENDANCE_START_FINAL', { groupCode });
        
        // 🔍 VERIFICACIÓN CRÍTICA: Verificar classId antes de todo
        this._verifyClassIdIntegrity('SAVE_ATTENDANCE_DATA');
        
        if (!this._state.classId) {
            console.error('❌ CRITICAL: classId faltante en saveAttendanceData!');
            UIUtils.showError('Error crítico: ID de clase faltante. Por favor, reinicia el proceso.');
            await this.showClassStatusQuestion(groupCode);
            return;
        }
        
        const attendanceData = this._state.attendanceData;
        const attendanceCount = Object.keys(attendanceData).length;
        
        // 🔍 DEBUG EXTENSO del estado de asistencia
        console.log('🔥 SAVE ATTENDANCE DATA - Estado completo:', {
            attendanceCount,
            attendanceKeys: Object.keys(attendanceData),
            classId: this._state.classId,
            isTemporary: this._state.classId?.startsWith('TEMP_'),
            groupCode: this._state.currentGroup?.codigo,
            fullAttendanceData: attendanceData,
            sampleRecord: Object.values(attendanceData)[0],
            hasValidRecords: Object.values(attendanceData).every(record => 
                record && record.studentId && record.status
            )
        });
        
        // 🔧 SOLUCIÓN: Verificación mejorada de datos de asistencia
        if (attendanceCount === 0) {
            console.warn('⚠️ No hay registros de asistencia para guardar');
            UIUtils.showError('No hay asistencia registrada. Por favor marca la asistencia de los estudiantes.');
            return;
        }
        
        // 🔧 SOLUCIÓN: Verificar que los registros sean válidos
        const invalidRecords = Object.values(attendanceData).filter(record => 
            !record || !record.studentId || !record.status
        );
        
        if (invalidRecords.length > 0) {
            console.error('❌ Registros inválidos detectados:', invalidRecords);
            UIUtils.showError(`Se encontraron ${invalidRecords.length} registros inválidos. Por favor, revisa la asistencia.`);
            return;
        }
        
        console.log('✅ Validación pasada - procediendo con guardado');
        
        // Guardar borrador actualizado en localStorage
        this._saveDraftToLocalStorage();
        
        // 🔧 SOLUCIÓN: Ir directo a confirmación final
        await this.confirmFinalSave();
    },

    /**
     * 🔧 CORREGIDO: Confirma y guarda usando ClassControlService
     * Reemplaza el método confirmFinalSave existente en AttendanceController
     */
    async confirmFinalSave() {
        console.log('🔧 FIX: confirmFinalSave - Usando ClassControlService CORREGIDO');
        this._debugLogState('CONFIRM_FINAL_SAVE_START_CORREGIDO');
        
        try {
            this._closePreviewModal();
            
            const attendanceData = this._state.attendanceData;
            const attendanceCount = Object.keys(attendanceData).length;
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const groupCode = this._state.currentGroup.codigo;
            const selectedAssistant = this._state.selectedAssistant;
            
            console.log('🔧 FIX: Estado antes del guardado CORREGIDO:', {
                attendanceCount,
                hasClassId: !!this._state.classId,
                classId: this._state.classId,
                isTemporary: this._state.classId?.startsWith('TEMP_'),
                selectedDate,
                groupCode,
                selectedAssistant: selectedAssistant?.id,
                attendanceDataSample: Object.values(attendanceData).slice(0, 2)
            });
            
            // 🔧 CORREGIDO: Validaciones mejoradas
            if (attendanceCount === 0) {
                UIUtils.showWarning('No hay asistencia registrada para guardar');
                return;
            }
            
            // Verificar que todos los registros tengan datos válidos
            const invalidRecords = Object.values(attendanceData).filter(record => 
                !record || !record.studentId || !record.status
            );
            
            if (invalidRecords.length > 0) {
                console.error('❌ Registros inválidos detectados:', invalidRecords);
                throw new Error(`${invalidRecords.length} registros tienen datos incompletos`);
            }
            
            this._setState({ isProcessing: true });
            this._showLoadingModal('Guardando clase y asistencias...', 'Usando flujo unificado...');
            
            console.log('🔧 FIX: Usando ClassControlService.handleClassRealized');
            
            // ✅ CORREGIDO: Usar ClassControlService en lugar de crear clase manualmente
            const result = await ClassControlService.handleClassRealized(
                selectedDate,
                groupCode,
                attendanceData,
                selectedAssistant?.id || ''
            );
            
            console.log('✅ FIX: ClassControlService.handleClassRealized completado:', result);
            
            this._hideLoadingModal();
            
            // Limpiar borrador después de éxito
            this._clearDraftFromLocalStorage();
            
            // Mostrar éxito con datos del resultado unificado
            this._showSuccessModal(
                result.attendanceResult, 
                groupCode, 
                selectedDate, 
                result.summary.attendanceRecords,
                selectedAssistant
            );
            
            this._debugLogState('CONFIRM_FINAL_SAVE_SUCCESS_CORREGIDO', { 
                savedCount: result.summary.attendanceRecords,
                method: result.attendanceResult.method,
                classId: result.summary.classId
            });
            
            console.log('✅ FIX: Guardado completo exitoso usando flujo unificado');
            
        } catch (error) {
            this._hideLoadingModal();
            console.error('❌ Error en confirmFinalSave corregido:', error);
            console.error('❌ Stack trace:', error.stack);
            this._debugLogState('CONFIRM_FINAL_SAVE_ERROR_CORREGIDO', { 
                error: error.message,
                stack: error.stack 
            });
            
            // En caso de error, ofrecer guardado como borrador
            this._saveDraftToLocalStorage();
            UIUtils.showError(`Error al guardar: ${error.message}. Los datos se guardaron como borrador.`);
            
        } finally {
            this._setState({ isProcessing: false });
        }
    },

    /**
     * 🔧 CORREGIDO: Mejor validación del flujo de asistencia
     * Método adicional para debugging y validación
     */
    validateAttendanceFlow() {
        console.log('🔍 Validando flujo de asistencia...');
        
        const validation = {
            timestamp: new Date().toISOString(),
            hasCurrentGroup: !!this._state.currentGroup,
            hasStudents: this._state.currentStudents.length > 0,
            hasAttendanceData: Object.keys(this._state.attendanceData).length > 0,
            hasSelectedAssistant: !!this._state.selectedAssistant,
            classIdStatus: {
                exists: !!this._state.classId,
                value: this._state.classId,
                isTemporary: this._state.classId?.startsWith('TEMP_')
            },
            flowState: {
                currentView: this._state.currentView,
                isProcessing: this._state.isProcessing,
                attendanceType: this._state.attendanceType
            }
        };
        
        console.log('📋 Validación del flujo:', validation);
        
        const isValidForSave = validation.hasCurrentGroup && 
                              validation.hasStudents && 
                              validation.hasAttendanceData;
        
        console.log(isValidForSave ? '✅ Flujo válido para guardar' : '❌ Flujo incompleto');
        
        return {
            valid: isValidForSave,
            details: validation
        };
    },

    /**
     * 🔧 AGREGADO: Método para recuperar de errores de guardado
     */
    async retryFailedSave() {
        console.log('🔄 Reintentando guardado fallido...');
        
        try {
            // Verificar que tenemos datos para reintentar
            const validation = this.validateAttendanceFlow();
            if (!validation.valid) {
                throw new Error('No hay datos válidos para reintentar');
            }
            
            // Intentar nuevamente
            await this.confirmFinalSave();
            
        } catch (error) {
            console.error('❌ Error en reintento:', error);
            UIUtils.showError(`Error en reintento: ${error.message}`);
        }
    },

    /**
     * Abre modal de justificación
     */
    _openJustificationModal(studentId, studentName) {
        debugLog(`AttendanceController: Abriendo modal de justificación para ${studentId}`);
        
        // Actualizar nombre del estudiante en el modal
        const studentNameElement = document.getElementById('justification-student-name');
        if (studentNameElement) {
            studentNameElement.textContent = studentName;
        }
        
        // Limpiar formulario anterior
        const typeSelect = document.getElementById('justification-type');
        const descriptionTextarea = document.getElementById('justification-description');
        
        if (typeSelect) typeSelect.value = '';
        if (descriptionTextarea) descriptionTextarea.value = '';
        
        // Guardar studentId para uso posterior
        this._justificationStudentId = studentId;
        
        // Abrir modal
        ModalsController.open('justification-modal', '#justification-type');
    },

    /**
     * Guarda justificación
     */
    saveJustification() {
        debugLog('AttendanceController: Guardando justificación');
        
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
        debugLog('AttendanceController: Abriendo modal de reposición individual');
        
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
     * Exporta asistencia (placeholder)
     */
    exportAttendance(groupCode) {
        debugLog(`AttendanceController: Exportando asistencia para ${groupCode}`);
        UIUtils.showInfo('Función de exportación en desarrollo');
    },

    /**
     * Actualiza la UI de un estudiante específico
     */
    _updateStudentUI(studentId, status) {
        const studentItem = document.querySelector(`[data-student-id="${studentId}"]`);
        if (!studentItem) return;
        
        // Limpiar clases de estado anteriores
        studentItem.className = studentItem.className.replace(/status-\w+/g, '');
        
        // Agregar nueva clase de estado
        studentItem.classList.add(`status-${status.toLowerCase()}`);
        
        // Actualizar botones
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
     * Muestra modal de vista previa final
     */
    showFinalPreview() {
        debugLog('AttendanceController: Mostrando vista previa final');
        
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
        
        // Crear modal personalizado para vista previa
        this._showPreviewModal(content);
    },

    /**
     * Muestra modal de vista previa personalizado
     */
    _showPreviewModal(content) {
        // Crear modal si no existe
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
        
        // Actualizar contenido
        const contentDiv = document.getElementById('custom-preview-content');
        if (contentDiv) {
            contentDiv.innerHTML = content;
        }
        
        // Mostrar modal
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    /**
     * Cierra modal de vista previa personalizado
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
     * Muestra modal de éxito después de guardar
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
        
        // Usar modal de notificación existente
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
     * 🔍 DEBUG: Registra un dato de asistencia con logging
     */
    _recordAttendance(studentId, status, justification = '', description = '') {
        debugLog(`AttendanceController: Registrando asistencia - ${studentId}: ${status}`);
        
        // 🔍 DEBUG: Verificar classId antes de crear registro
        this._verifyClassIdIntegrity('BEFORE_RECORD_ATTENDANCE');
        
        const attendanceData = { ...this._state.attendanceData };
        
        const record = {
            studentId,
            status,
            justification,
            description,
            timestamp: DateUtils.getCurrentTimestamp()
        };
        
        console.log('🔍 DEBUG: Creando registro de asistencia:', {
            studentId,
            status,
            classId: this._state.classId,
            hasClassId: !!this._state.classId,
            isTemporary: this._state.classId?.startsWith('TEMP_'),
            record
        });
        
        attendanceData[studentId] = record;
        this._setState({ attendanceData });
        
        this._debugLogState('RECORD_ATTENDANCE', { 
            studentId, 
            status,
            totalRecords: Object.keys(attendanceData).length 
        });
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
     * Actualiza el estado interno (con debug)
     */
    _setState(newState) {
        const oldClassId = this._state.classId;
        this._state = { ...this._state, ...newState };
        
        // 🔍 DEBUG: Log cambios de classId
        if (oldClassId !== this._state.classId) {
            console.log('🔍 DEBUG: classId cambió en setState:', {
                old: oldClassId,
                new: this._state.classId,
                oldWasTemporary: oldClassId?.startsWith('TEMP_'),
                newIsTemporary: this._state.classId?.startsWith('TEMP_'),
                stackTrace: new Error().stack
            });
        }
        
        debugLog('AttendanceController: Estado actualizado');
    },

    /**
     * 🔍 DEBUG: Método para obtener información completa de debugging
     */
    getDebugInfo() {
        return {
            currentState: this._state,
            verificationResults: {
                hasClassId: !!this._state.classId,
                classId: this._state.classId,
                isTemporary: this._state.classId?.startsWith('TEMP_'),
                hasGroup: !!this._state.currentGroup,
                hasStudents: this._state.currentStudents.length > 0,
                hasAttendance: Object.keys(this._state.attendanceData).length > 0,
                hasAssistant: !!this._state.selectedAssistant
            },
            debugFlow: this._state.debugInfo.attendanceCreationFlow,
            timestamp: new Date().toISOString()
        };
    },

    /**
     * 🔧 SOLUCIÓN: Método getState para debugging externo
     */
    getState() {
        return {
            ...this._state,
            debugInfo: this.getDebugInfo()
        };
    },

    /**
     * 🔧 FIX: Mejorar guardado de borrador
     */
    _saveDraftToLocalStorage() {
        const draftData = {
            groupCode: this._state.currentGroup?.codigo,
            fecha: window.AppState.selectedDate,
            attendanceData: this._state.attendanceData,
            selectedAssistant: this._state.selectedAssistant,
            tempClassId: this._state.classId, // Guardar ID temporal
            timestamp: DateUtils.getCurrentTimestamp(),
            version: 'v2' // Para identificar nuevos borradores
        };
        
        StorageUtils.save('attendance_draft', draftData);
        console.log('📝 Borrador guardado:', draftData.tempClassId);
        debugLog('AttendanceController: Borrador guardado en localStorage');
    },

    /**
     * ✅ NUEVO: Limpia borrador de localStorage
     */
    _clearDraftFromLocalStorage() {
        StorageUtils.remove('attendance_draft');
        debugLog('AttendanceController: Borrador eliminado de localStorage');
    },

    /**
     * 🔧 FIX: Función para recuperar borrador
     */
    async recoverDraft() {
        const draft = StorageUtils.get('attendance_draft');
        
        if (!draft || draft.version !== 'v2') {
            console.log('No hay borrador válido para recuperar');
            return false;
        }
        
        // Verificar que el borrador no sea muy antiguo (24 horas)
        const draftTime = new Date(draft.timestamp);
        const now = new Date();
        const hoursDiff = (now - draftTime) / (1000 * 60 * 60);
        
        if (hoursDiff > 24) {
            this._clearDraftFromLocalStorage();
            console.log('Borrador muy antiguo, eliminado');
            return false;
        }
        
        try {
            // Recuperar estado
            this._setState({
                currentGroup: await GroupService.getGroupByCode(draft.groupCode),
                attendanceData: draft.attendanceData,
                selectedAssistant: draft.selectedAssistant,
                classId: draft.tempClassId
            });
            
            window.AppState.selectedDate = draft.fecha;
            
            UIUtils.showInfo('Borrador recuperado. Puedes continuar editando y guardar.');
            console.log('📝 Borrador recuperado exitosamente');
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

// 🔍 DEBUG: Función global para debugging
window.debugAttendanceController = function() {
    console.log('🔍 DEBUGGING ATTENDANCE CONTROLLER:');
    console.log('Current State:', AttendanceController.getDebugInfo());
    
    // Verificar integridad
    AttendanceController._verifyClassIdIntegrity('MANUAL_DEBUG_CHECK');
    
    return AttendanceController.getDebugInfo();
};

// 🔧 SOLUCIÓN: Función global para debugging de asistencia específicamente
window.debugAttendanceData = function() {
    const state = AttendanceController.getState();
    const attendanceData = state.attendanceData;
    
    console.log('🔍 DEBUG ASISTENCIA - Estado completo:', {
        classId: state.classId,
        hasClassId: !!state.classId,
        isTemporary: state.classId?.startsWith('TEMP_'),
        attendanceCount: Object.keys(attendanceData).length,
        attendanceKeys: Object.keys(attendanceData),
        sampleRecord: Object.values(attendanceData)[0],
        allRecords: attendanceData,
        groupCode: state.currentGroup?.codigo,
        selectedDate: window.AppState.selectedDate
    });
    
    return {
        classId: state.classId,
        isTemporary: state.classId?.startsWith('TEMP_'),
        attendanceData: attendanceData,
        summary: {
            total: Object.keys(attendanceData).length,
            hasClassId: !!state.classId,
            validRecords: Object.values(attendanceData).filter(r => r && r.studentId && r.status).length
        }
    };
};

console.log('🔧 AttendanceController.confirmFinalSave CORREGIDO cargado');
console.log('📋 Métodos agregados:');
console.log('   - confirmFinalSave() - Versión corregida que usa ClassControlService');
console.log('   - validateAttendanceFlow() - Validación del estado actual');
console.log('   - retryFailedSave() - Reintento en caso de error');

debugLog('AttendanceController - VERSIÓN CORREGIDA COMPLETA CON FIX INTEGRADOS');
