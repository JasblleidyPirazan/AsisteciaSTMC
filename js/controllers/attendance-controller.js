/**
 * CONTROLADOR DE ASISTENCIA - VERSIÓN CON DEBUG EXTENSO
 * ====================================================
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
     * ✅ NUEVO FLUJO: Muestra vista previa antes de confirmación final
     */
    async saveAttendanceData(groupCode) {
        debugLog('AttendanceController: Preparando vista previa');
        this._debugLogState('SAVE_ATTENDANCE_START', { groupCode });
        
        // 🔍 DEBUG: Verificar classId antes de guardar
        this._verifyClassIdIntegrity('BEFORE_SAVE_ATTENDANCE');
        
        try {
            const attendanceData = this._state.attendanceData;
            const attendanceCount = Object.keys(attendanceData).length;
            
            console.log('🔍 DEBUG: Datos de asistencia para guardar:', {
                attendanceCount,
                classId: this._state.classId,
                hasClassId: !!this._state.classId,
                attendanceKeys: Object.keys(attendanceData),
                firstRecord: Object.values(attendanceData)[0]
            });
            
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
            this._debugLogState('SAVE_ATTENDANCE_ERROR', { error: error.message });
            UIUtils.showError('Error al preparar vista previa');
        }
    },

    /**
     * ✅ NUEVO: Confirmación final que realmente guarda
     */
    async confirmFinalSave() {
        debugLog('AttendanceController: CONFIRMACIÓN FINAL - Guardando asistencias');
        this._debugLogState('CONFIRM_FINAL_SAVE_START');
        
        // 🔍 DEBUG: Verificación crítica antes del guardado final
        this._verifyClassIdIntegrity('BEFORE_FINAL_SAVE');
        
        try {
            // Cerrar modal de vista previa primero
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
                attendanceDataSample: Object.values(attendanceData).slice(0, 2)
            });
            
            if (attendanceCount === 0) {
                UIUtils.showWarning('No hay asistencia registrada para guardar');
                return;
            }
            
            if (!this._state.classId) {
                console.error('❌ DEBUG: classId faltante en confirmación final!');
                throw new Error('ID de clase faltante - no se puede guardar');
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
                groupCode,
                date: selectedDate,
                classType: 'Regular',
                idClase: classId, // 🔍 CRÍTICO: Verificar que se pase
                sentBy: window.AppState.user?.email || 'usuario'
            });
            
            // 🔍 DEBUG: Crear registros de asistencia usando AttendanceService
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
                recordsWithoutClassId: records.filter(r => !r.ID_Clase).length
            });
            
            // 🔍 DEBUG: Verificar que todos los registros tengan ID_Clase
            const recordsWithoutClassId = records.filter(r => !r.ID_Clase);
            if (recordsWithoutClassId.length > 0) {
                console.error('❌ DEBUG: Registros sin ID_Clase detectados:', recordsWithoutClassId);
                throw new Error(`${recordsWithoutClassId.length} registros sin ID_Clase`);
            }
            
            console.log('✅ DEBUG: Todos los registros tienen ID_Clase');
            
            // 🔍 DEBUG: Guardar usando AttendanceService
            console.log('🔥 DEBUG: Llamando AttendanceService.saveAttendance...');
            const result = await AttendanceService.saveAttendance(records);
            
            console.log('🔍 DEBUG: Resultado de saveAttendance:', result);
            
            this._hideLoadingModal();
            
            // Limpiar borrador después de éxito
            this._clearDraftFromLocalStorage();
            
            // Mostrar éxito con opción de volver al inicio
            this._showSuccessModal(result, groupCode, selectedDate, attendanceCount, selectedAssistant);
            
            this._debugLogState('CONFIRM_FINAL_SAVE_SUCCESS', { 
                savedCount: records.length,
                method: result.method 
            });
            
        } catch (error) {
            this._hideLoadingModal();
            console.error('AttendanceController: Error en confirmación final:', error);
            this._debugLogState('CONFIRM_FINAL_SAVE_ERROR', { error: error.message });
            UIUtils.showError(error.message || 'Error al guardar las asistencias');
        } finally {
            this._setState({ isProcessing: false });
        }
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

    // ===========================================
    // MÉTODOS EXISTENTES (sin cambios pero con debug añadido)
    // ===========================================

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

    // [RESTO DE MÉTODOS SIN CAMBIOS - solo adding debug donde sea crítico]
    
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

    // [Resto de métodos privados sin cambios...]
    
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

debugLog('AttendanceController - VERSIÓN CON DEBUG EXTENSO CARGADO');
