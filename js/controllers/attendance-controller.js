/**
 * CONTROLADOR DE ASISTENCIA - VERSIÓN COMPLETA CON FIXES APLICADOS
 * ================================================================
 * 🔧 FIXES: Solución al problema "Clase se guarda pero no las asistencias"
 * 🔍 DEBUGGING: Rastrear el flujo completo del ID_Clase
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
        classId: null, // 🔍 DEBUG: Este es crítico
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
            currentGroup: this._state.currentGroup?.codigo,
            selectedAssistant: this._state.selectedAssistant?.id
        };
        
        console.log(`🔍 VERIFY CLASS ID [${context}]:`, debugInfo);
        
        if (!classId) {
            console.error(`❌ CLASS ID MISSING in ${context}!`, debugInfo);
            return false;
        }
        
        console.log(`✅ CLASS ID OK in ${context}:`, classId);
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
     * Selecciona asistente, CREA CLASE y va a asistencia
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
            
            // 2. Guardar asistente en estado
            this._setState({ selectedAssistant: assistant });
            
            // 🔍 DEBUG: Verificar que NO tengamos classId antes de crear
            this._verifyClassIdIntegrity('BEFORE_CLASS_CREATION');
            if (this._state.classId) {
                console.error('❌ DEBUG: classId ya existe antes de crear clase - PROBLEMA!');
            }
            
            // 3. 🔍 DEBUG: CREAR REGISTRO DE CLASE AQUÍ (PASO CRÍTICO)
            console.log('🔥 DEBUG: INICIANDO CREACIÓN DE CLASE...');
            await this._createClassRecord(assistantId);
            
            // 🔍 DEBUG: Verificar que TENGAMOS classId después de crear
            this._verifyClassIdIntegrity('AFTER_CLASS_CREATION');
            if (!this._state.classId) {
                console.error('❌ DEBUG: classId NO existe después de crear clase - PROBLEMA CRÍTICO!');
                throw new Error('No se pudo obtener ID de clase después de la creación');
            }
            
            console.log('✅ DEBUG: CLASE CREADA EXITOSAMENTE con ID:', this._state.classId);
            
            // 4. Ir al formulario de asistencia (ya con classId válido)
            await this.showAttendanceFormDirect();
            
        } catch (error) {
            console.error('AttendanceController: Error al seleccionar asistente para asistencia:', error);
            this._debugLogState('SELECT_ASSISTANT_ERROR', { error: error.message });
            UIUtils.showError(`Error al registrar la clase: ${error.message}`);
            // Volver al selector de asistente en caso de error
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
     * Continúa sin asistente, CREA CLASE y va a asistencia
     */
    async continueToAttendanceWithoutAssistant(groupCode) {
        debugLog('AttendanceController: Continuando sin asistente a asistencia');
        this._debugLogState('CONTINUE_WITHOUT_ASSISTANT_START');
        
        try {
            // 1. Establecer asistente como null
            this._setState({ selectedAssistant: null });
            
            // 🔍 DEBUG: Verificar estado antes de crear clase
            this._verifyClassIdIntegrity('BEFORE_CLASS_CREATION_NO_ASSISTANT');
            
            // 2. CREAR REGISTRO DE CLASE SIN ASISTENTE
            console.log('🔥 DEBUG: CREANDO CLASE SIN ASISTENTE...');
            await this._createClassRecord('');
            
            // 🔍 DEBUG: Verificar que tengamos classId
            this._verifyClassIdIntegrity('AFTER_CLASS_CREATION_NO_ASSISTANT');
            if (!this._state.classId) {
                throw new Error('No se pudo obtener ID de clase después de la creación sin asistente');
            }
            
            console.log('✅ DEBUG: CLASE SIN ASISTENTE CREADA con ID:', this._state.classId);
            
            // 3. Ir al formulario de asistencia
            await this.showAttendanceFormDirect();
            
        } catch (error) {
            console.error('AttendanceController: Error al continuar sin asistente:', error);
            this._debugLogState('CONTINUE_WITHOUT_ASSISTANT_ERROR', { error: error.message });
            UIUtils.showError(`Error al registrar la clase: ${error.message}`);
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
     * 🔍 DEBUG: Crea el registro de clase con logging extenso
     */
    async _createClassRecord(assistantId) {
        debugLog('AttendanceController: Creando registro de clase...');
        this._debugLogState('CREATE_CLASS_RECORD_START', { assistantId });
        
        try {
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const groupCode = this._state.currentGroup.codigo;
            
            console.log('🔍 DEBUG: Datos para crear clase:', {
                selectedDate,
                groupCode,
                assistantId,
                groupHour: this._state.currentGroup.hora
            });
            
            // Mostrar indicador de carga
            UIUtils.showLoading('app', 'Creando registro de clase...');
            
            // 🔍 DEBUG: Llamada al ClassControlService
            console.log('🔥 DEBUG: Llamando ClassControlService.createClassRecord...');
            const classRecord = await ClassControlService.createClassRecord(
                selectedDate,
                groupCode,
                ClassControlService.CLASS_STATES.REALIZADA,
                {
                    asistenteId: assistantId || '',
                    creadoPor: window.AppState.user?.email || 'usuario'
                }
            );
            
            console.log('🔍 DEBUG: Respuesta de ClassControlService:', classRecord);
            
            // 🔍 DEBUG: Verificar estructura de respuesta
            if (!classRecord || !classRecord.id) {
                console.error('❌ DEBUG: Respuesta inválida de ClassControlService:', classRecord);
                throw new Error('Respuesta inválida del servicio de clases');
            }
            
            // 🔍 DEBUG: Guardar ID en estado
            const oldClassId = this._state.classId;
            this._setState({ classId: classRecord.id });
            
            console.log('🔍 DEBUG: Estado de classId actualizado:', {
                oldClassId: oldClassId,
                newClassId: classRecord.id,
                stateAfterUpdate: this._state.classId
            });
            
            this._debugLogState('CREATE_CLASS_RECORD_SUCCESS', { 
                classId: classRecord.id,
                recordData: classRecord 
            });
            
            // 🔍 DEBUG: Verificación final
            if (this._state.classId !== classRecord.id) {
                console.error('❌ DEBUG: El classId en el estado no coincide con el creado!', {
                    expected: classRecord.id,
                    actual: this._state.classId
                });
            }
            
            debugLog(`AttendanceController: Clase creada con ID: ${classRecord.id}`);
            
        } catch (error) {
            console.error('AttendanceController: Error creando registro de clase:', error);
            this._debugLogState('CREATE_CLASS_RECORD_ERROR', { error: error.message });
            throw new Error(`No se pudo crear el registro de clase: ${error.message}`);
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
     * 🔧 FIX 1: Método saveAttendanceData CORREGIDO
     * Verificación inmediata y validación exhaustiva
     */
    async saveAttendanceData(groupCode) {
        debugLog('AttendanceController: Guardando asistencias - VERSIÓN CORREGIDA');
        this._debugLogState('SAVE_ATTENDANCE_START_FIXED', { groupCode });
        
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
            groupCode: this._state.currentGroup?.codigo,
            fullAttendanceData: attendanceData,
            sampleRecord: Object.values(attendanceData)[0],
            hasValidRecords: Object.values(attendanceData).every(record => 
                record && record.studentId && record.status
            )
        });
        
        // 🔧 FIX: Verificación mejorada de datos de asistencia
        if (attendanceCount === 0) {
            console.warn('⚠️ No hay registros de asistencia para guardar');
            UIUtils.showError('No hay asistencia registrada. Por favor marca la asistencia de los estudiantes.');
            return;
        }
        
        // 🔧 FIX: Verificar que los registros sean válidos
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
        
        // 🔧 FIX: Ir DIRECTO a confirmación final en lugar de vista previa
        // Comentar para probar sin vista previa:
        // this.showFinalPreview();
        
        // 🔧 FIX: Ir directo a guardado para evitar problemas con modal
        await this.confirmFinalSave();
    },

    /**
     * 🔧 FIX 2: Método confirmFinalSave MEJORADO
     * Verificaciones adicionales y mejor manejo de errores
     */
    async confirmFinalSave() {
        console.log('🔥 DEBUG: CONFIRMACIÓN FINAL - Iniciando guardado de asistencias');
        this._debugLogState('CONFIRM_FINAL_SAVE_START_FIXED');
        
        // 🔍 VERIFICACIÓN CRÍTICA: Verificar classId antes del guardado final
        this._verifyClassIdIntegrity('BEFORE_FINAL_SAVE');
        
        try {
            // Cerrar modal de vista previa si existe
            this._closePreviewModal();
            
            const attendanceData = this._state.attendanceData;
            const attendanceCount = Object.keys(attendanceData).length;
            
            console.log('🔥 DEBUG: CONFIRMACIÓN FINAL - Estado completo:', {
                attendanceCount,
                classId: this._state.classId,
                hasClassId: !!this._state.classId,
                selectedDate: window.AppState.selectedDate,
                groupCode: this._state.currentGroup?.codigo,
                selectedAssistant: this._state.selectedAssistant?.id,
                attendanceDataSample: Object.values(attendanceData).slice(0, 2),
                allAttendanceKeys: Object.keys(attendanceData)
            });
            
            // 🔧 FIX: Verificaciones adicionales
            if (attendanceCount === 0) {
                console.error('❌ No hay asistencia registrada para guardar');
                UIUtils.showWarning('No hay asistencia registrada para guardar');
                return;
            }
            
            if (!this._state.classId) {
                console.error('❌ CRITICAL: classId faltante en confirmación final!');
                throw new Error('ID de clase faltante - no se puede guardar');
            }
            
            // 🔧 FIX: Verificar integridad de cada registro de asistencia
            const recordsWithIssues = [];
            Object.entries(attendanceData).forEach(([studentId, record]) => {
                if (!record || !record.studentId || !record.status) {
                    recordsWithIssues.push({ studentId, record });
                }
            });
            
            if (recordsWithIssues.length > 0) {
                console.error('❌ Registros con problemas detectados:', recordsWithIssues);
                throw new Error(`${recordsWithIssues.length} registros tienen problemas de integridad`);
            }
            
            this._setState({ isProcessing: true });
            
            // Mostrar modal de carga
            this._showLoadingModal('Guardando asistencias...', 'Procesando registros...');
            
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const groupCode = this._state.currentGroup.codigo;
            const selectedAssistant = this._state.selectedAssistant;
            const classId = this._state.classId;
            
            console.log('🔥 DEBUG: Parámetros para AttendanceService.createGroupAttendanceRecords:', {
                attendanceDataKeys: Object.keys(attendanceData),
                attendanceDataCount: Object.keys(attendanceData).length,
                groupCode,
                date: selectedDate,
                classType: 'Regular',
                idClase: classId, // 🔍 CRÍTICO: Verificar que se pase
                sentBy: window.AppState.user?.email || 'usuario'
            });
            
            // 🔧 FIX: Crear registros de asistencia usando AttendanceService con logging extenso
            console.log('🔥 DEBUG: Llamando AttendanceService.createGroupAttendanceRecords...');
            const { records, errors } = AttendanceService.createGroupAttendanceRecords(
                attendanceData,
                {
                    groupCode,
                    date: selectedDate,
                    classType: 'Regular',
                    idClase: classId, // 🔍 CRÍTICO: Pasar ID de clase
                    sentBy: window.AppState.user?.email || 'usuario'
                }
            );
            
            console.log('🔍 DEBUG: Registros creados por AttendanceService:', {
                recordsCount: records.length,
                errorsCount: errors.length,
                firstRecordSample: records[0],
                recordsWithClassId: records.filter(r => r.ID_Clase).length,
                recordsWithoutClassId: records.filter(r => !r.ID_Clase).length,
                allRecordsHaveClassId: records.every(r => r.ID_Clase),
                classIdFromFirstRecord: records[0]?.ID_Clase
            });
            
            // 🔧 FIX: Verificación CRÍTICA - todos los registros deben tener ID_Clase
            const recordsWithoutClassId = records.filter(r => !r.ID_Clase);
            if (recordsWithoutClassId.length > 0) {
                console.error('❌ CRITICAL: Registros sin ID_Clase detectados:', recordsWithoutClassId);
                throw new Error(`CRÍTICO: ${recordsWithoutClassId.length} registros sin ID_Clase. Verifica AttendanceService.createGroupAttendanceRecords.`);
            }
            
            // 🔧 FIX: Verificar que NO haya errores en la creación
            if (errors.length > 0) {
                console.error('❌ Errores en creación de registros:', errors);
                throw new Error(`Errores en ${errors.length} registros: ${errors.join(', ')}`);
            }
            
            console.log('✅ DEBUG: Todos los registros tienen ID_Clase y son válidos');
            
            // 🔧 FIX: Guardar usando AttendanceService con manejo de errores mejorado
            console.log('🔥 DEBUG: Llamando AttendanceService.saveAttendance...');
            const result = await AttendanceService.saveAttendance(records);
            
            console.log('🔍 DEBUG: Resultado de saveAttendance:', {
                success: !!result,
                method: result?.method,
                message: result?.message,
                fullResult: result
            });
            
            // 🔧 FIX: Verificar que el resultado sea válido
            if (!result) {
                throw new Error('AttendanceService.saveAttendance devolvió resultado nulo');
            }
            
            this._hideLoadingModal();
            
            // Limpiar borrador después de éxito
            this._clearDraftFromLocalStorage();
            
            // Mostrar éxito con opción de volver al inicio
            this._showSuccessModal(result, groupCode, selectedDate, attendanceCount, selectedAssistant);
            
            this._debugLogState('CONFIRM_FINAL_SAVE_SUCCESS', { 
                savedCount: records.length,
                method: result.method 
            });
            
            console.log('✅ DEBUG: GUARDADO EXITOSO - Proceso completado');
            
        } catch (error) {
            this._hideLoadingModal();
            console.error('❌ AttendanceController: Error CRÍTICO en confirmación final:', error);
            console.error('❌ Stack trace:', error.stack);
            this._debugLogState('CONFIRM_FINAL_SAVE_ERROR', { 
                error: error.message,
                stack: error.stack 
            });
            
            // 🔧 FIX: Mensaje de error más específico
            const errorMessage = error.message || 'Error desconocido al guardar las asistencias';
            UIUtils.showError(`Error al guardar: ${errorMessage}`);
            
        } finally {
            this._setState({ isProcessing: false });
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
     * 🔧 FIX 3: Método getState para debugging externo
     */
    getState() {
        return {
            ...this._state,
            debugInfo: this.getDebugInfo()
        };
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
            classId: this._state.classId, // 🔍 DEBUG: Incluir classId en borrador
            timestamp: DateUtils.getCurrentTimestamp()
        };
        
        console.log('🔍 DEBUG: Guardando borrador con classId:', draftData.classId);
        
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

// 🔍 DEBUG: Función global para debugging
window.debugAttendanceController = function() {
    console.log('🔍 DEBUGGING ATTENDANCE CONTROLLER:');
    console.log('Current State:', AttendanceController.getDebugInfo());
    
    // Verificar integridad
    AttendanceController._verifyClassIdIntegrity('MANUAL_DEBUG_CHECK');
    
    return AttendanceController.getDebugInfo();
};

// 🔧 FIX 4: Función global para debugging de asistencia específicamente
window.debugAttendanceData = function() {
    const state = AttendanceController.getState();
    const attendanceData = state.attendanceData;
    
    console.log('🔍 DEBUG ASISTENCIA - Estado completo:', {
        classId: state.classId,
        hasClassId: !!state.classId,
        attendanceCount: Object.keys(attendanceData).length,
        attendanceKeys: Object.keys(attendanceData),
        sampleRecord: Object.values(attendanceData)[0],
        allRecords: attendanceData,
        groupCode: state.currentGroup?.codigo,
        selectedDate: window.AppState.selectedDate
    });
    
    return {
        classId: state.classId,
        attendanceData: attendanceData,
        summary: {
            total: Object.keys(attendanceData).length,
            hasClassId: !!state.classId,
            validRecords: Object.values(attendanceData).filter(r => r && r.studentId && r.status).length
        }
    };
};

debugLog('AttendanceController - VERSIÓN COMPLETA CON FIXES APLICADOS CARGADO');
