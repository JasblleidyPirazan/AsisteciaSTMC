/**
 * CONTROLADOR DE ASISTENCIA - VERSIÓN INTEGRADA
 * ==============================================
 * Controla flujo de selección, captura y guardado de asistencias
 */

const AttendanceController = {
    _state: {
        classId: null,
        currentGroup: null,
        selectedAssistant: null,
        attendanceData: null,
        attendanceType: null,
    },

    /**
     * 🔍 Logging de depuración del estado
     */
    _debugLogState(step, extra = {}) {
        console.log(`\n📌 AttendanceController STATE (${step})`, {
            state: { ...this._state },
            extra,
        });
    },

    /**
     * 📌 Actualizar estado interno
     */
    _setState(newState) {
        this._state = { ...this._state, ...newState };
        this._debugLogState('SET_STATE', newState);
    },

    /**
     * 1️⃣ Preguntar estado de la clase
     */
    async showClassStatusQuestion(group, classId) {
        this._setState({ currentGroup: group, classId });
        console.log(`📌 Iniciando flujo de asistencia para grupo: ${group.codigo}, ID Clase: ${classId}`);

        // Lógica de render de pregunta
        await AttendanceViews.renderClassStatusQuestion(group, classId);
    },

    /**
     * 2️⃣ Selección de asistente responsable
     */
    async showAssistantSelectorForAttendance(group, classId) {
        this._setState({ currentGroup: group, classId });
        await AttendanceViews.renderAssistantSelector(group, classId);
    },

    /**
     * 3️⃣ Formulario de asistencia directa
     */
    async showAttendanceFormDirect(group, assistant, classId) {
        this._setState({ currentGroup: group, selectedAssistant: assistant, classId });
        await AttendanceViews.renderAttendanceForm(group, assistant, classId);
    },

    /**
     * 4️⃣ Guardar datos temporales antes de confirmación
     */
    captureAttendanceData(attendanceData, attendanceType) {
        this._setState({ attendanceData, attendanceType });
        console.log("✅ Datos de asistencia capturados", attendanceData);
    },

    /**
     * 5️⃣ Confirmación y guardado final
     */
    async confirmFinalSave() {
        console.log('🔍 AttendanceController: Confirmando guardado final');
        this._debugLogState('CONFIRM_FINAL_SAVE_START');

        try {
            const { currentGroup, selectedAssistant, attendanceData, attendanceType, classId } = this._state;
            const groupCode = currentGroup?.codigo;
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();

            if (!classId) {
                throw new Error('ID_Clase no definido en el estado');
            }

            // Construcción de registros con ID_Clase obligatorio
            const { records, errors } = AttendanceService.createGroupAttendanceRecords(attendanceData, {
                idClase: classId,
                groupCode,
                date: selectedDate,
                classType: attendanceType,
                sentBy: window.AppState.user?.email || 'usuario'
            });

            if (records.length === 0) {
                throw new Error('No hay registros válidos de asistencia');
            }

            // Guardado (online u offline)
            const result = await AttendanceService.saveAttendance(records, { idClase: classId });

            // Mostrar modal de éxito
            this._showSuccessModal(result, groupCode, selectedDate, records.length, selectedAssistant);

            this._debugLogState('CONFIRM_FINAL_SAVE_SUCCESS', { total: records.length, method: result.method });

        } catch (error) {
            console.error('❌ AttendanceController: Error confirmando guardado final:', error);
            this._debugLogState('CONFIRM_FINAL_SAVE_ERROR', { error: error.message });
            UIUtils.showError('Error al guardar la asistencia. Intenta nuevamente.');
        }
    },

    /**
     * 📌 Modal de confirmación
     */
    _showSuccessModal(result, groupCode, date, totalRecords, assistant) {
        const msg = `
            ✅ Asistencia guardada correctamente.
            Grupo: ${groupCode}
            Fecha: ${date}
            Registros: ${totalRecords}
            Responsable: ${assistant?.nombre || 'N/A'}
            Método: ${result.method}
        `;
        UIUtils.showSuccess(msg);
    }
};


/**
 * SERVICIO DE ASISTENCIA - DEBUG
 * ===============================
 * Encargado de construir registros y persistir (online/offline)
 */

const AttendanceService = {
    /**
     * 📌 Crear registro único
     */
    createAttendanceRecord(studentId, status, options) {
        if (!options?.idClase) {
            throw new Error('ID_Clase es obligatorio en createAttendanceRecord');
        }
        return {
            ID_Clase: options.idClase,
            StudentId: studentId,
            Status: status,
            GroupCode: options.groupCode,
            Date: options.date,
            ClassType: options.classType,
            SentBy: options.sentBy,
            SentAt: new Date().toISOString()
        };
    },

    /**
     * 📌 Crear registros en lote
     */
    createGroupAttendanceRecords(attendanceData, options) {
        const records = [];
        const errors = [];

        Object.entries(attendanceData || {}).forEach(([studentId, status]) => {
            try {
                const record = this.createAttendanceRecord(studentId, status, options);
                records.push(record);
            } catch (err) {
                errors.push({ studentId, error: err.message });
            }
        });

        console.log(`✅ ${records.length} registros creados, ❌ ${errors.length} con errores`);
        return { records, errors };
    },

    /**
     * 📌 Guardar registros en Sheets u offline
     */
    async saveAttendance(records, options) {
        try {
            await SheetsAPI.append('Attendance', records);
            return { success: true, method: 'online', recordsSaved: records.length };
        } catch (error) {
            console.warn('⚠️ Falló guardado online, guardando offline', error);
            await OfflineStorage.save('attendance_records', records, { merge: true });
            return { success: true, method: 'offline', recordsSaved: records.length };
        }
    }
};
