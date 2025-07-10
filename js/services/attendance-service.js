/**
 * SERVICIO DE ASISTENCIAS - SOLUCIÓN HÍBRIDA
 * ==========================================
 * FIX: Intenta guardado online primero, offline como fallback
 * Elimina dependencia de window.AppState.connectionStatus poco confiable
 */

const AttendanceService = {
    /**
     * Tipos de asistencia válidos
     */
    ATTENDANCE_TYPES: {
        REGULAR: 'Regular',
        REPOSITION: 'Reposición'
    },

    /**
     * Estados de asistencia válidos
     */
    ATTENDANCE_STATUS: {
        PRESENT: 'Presente',
        ABSENT: 'Ausente',
        JUSTIFIED: 'Justificada',
        CANCELLED: 'Cancelada'
    },

    /**
     * Tipos de justificación válidos
     */
    JUSTIFICATION_TYPES: {
        MEDICAL: 'Médica',
        PERSONAL: 'Personal',
        FAMILY: 'Familiar',
        ACADEMIC: 'Académica',
        OTHER: 'Otra'
    },

    /**
     * Crea un nuevo registro de asistencia
     */
    createAttendanceRecord(studentId, groupCode, status, options = {}) {
        debugLog(`AttendanceService: Creando registro - ${studentId}: ${status}`);

        const validation = this.validateAttendanceData({
            studentId,
            groupCode,
            status,
            ...options
        });

        if (!validation.valid) {
            throw new Error(`Datos de asistencia inválidos: ${validation.errors.join(', ')}`);
        }

        return {
            id: DataUtils.generateId('AST'),
            fecha: options.date || DateUtils.getCurrentDate(),
            estudiante_id: studentId,
            grupo_codigo: groupCode,
            tipo_clase: options.classType || this.ATTENDANCE_TYPES.REGULAR,
            estado: status,
            justificacion: options.justification || '',
            descripcion: options.description || '',
            tarde: options.late || false,
            enviado_por: options.sentBy || window.AppState.user?.email || 'usuario',
            timestamp: DateUtils.getCurrentTimestamp()
        };
    },

    /**
     * Crea múltiples registros de asistencia para un grupo
     */
    createGroupAttendanceRecords(attendanceData, options = {}) {
        debugLog(`AttendanceService: Creando ${Object.keys(attendanceData).length} registros de grupo`);

        const records = [];
        const errors = [];

        Object.values(attendanceData).forEach(record => {
            try {
                const attendanceRecord = this.createAttendanceRecord(
                    record.studentId,
                    options.groupCode,
                    record.status,
                    {
                        date: options.date,
                        classType: options.classType,
                        justification: record.justification,
                        description: record.description,
                        late: record.late,
                        sentBy: options.sentBy
                    }
                );
                records.push(attendanceRecord);
            } catch (error) {
                errors.push(`Error con estudiante ${record.studentId}: ${error.message}`);
            }
        });

        if (errors.length > 0) {
            debugLog('AttendanceService: Errores en creación de registros:', errors);
        }

        debugLog(`AttendanceService: ${records.length} registros creados exitosamente`);
        return { records, errors };
    },

    /**
     * Convierte registros de asistencia al formato esperado por Google Sheets
     */
    formatForBackend(attendanceRecords) {
        debugLog(`AttendanceService: Formateando ${attendanceRecords.length} registros para backend`);

        return attendanceRecords.map(record => [
            record.id,
            record.fecha,
            record.estudiante_id,
            record.grupo_codigo,
            record.tipo_clase,
            record.estado,
            record.justificacion,
            record.descripcion,
            record.enviado_por,
            record.timestamp
        ]);
    },

    /**
     * SOLUCIÓN HÍBRIDA: Guarda registros de asistencia
     * Intenta online primero, offline como fallback
     */
    async saveAttendance(attendanceRecords, options = {}) {
        debugLog(`AttendanceService: Guardando ${attendanceRecords.length} registros`);

        try {
            // Validar que todos los registros sean válidos
            const validationErrors = [];
            attendanceRecords.forEach((record, index) => {
                const validation = this.validateAttendanceRecord(record);
                if (!validation.valid) {
                    validationErrors.push(`Registro ${index + 1}: ${validation.errors.join(', ')}`);
                }
            });

            if (validationErrors.length > 0) {
                throw new Error(`Errores de validación: ${validationErrors.join('; ')}`);
            }

            // Formatear para backend
            const formattedData = this.formatForBackend(attendanceRecords);

            // SOLUCIÓN HÍBRIDA: Intentar online primero SIEMPRE
            try {
                debugLog('AttendanceService: Intentando guardado online directo...');
                
                // Intentar petición directa (como ClassControlService)
                const result = await SheetsAPI.saveAttendance(formattedData);
                
                // Si llegamos aquí, el guardado online fue exitoso
                UIUtils.updateConnectionStatus('online');
                debugLog('AttendanceService: Guardado online exitoso');
                
                return {
                    success: true,
                    saved: attendanceRecords.length,
                    method: 'online',
                    result
                };

            } catch (onlineError) {
                // Si falla online, usar fallback offline
                debugLog('AttendanceService: Guardado online falló, usando fallback offline:', onlineError.message);
                
                UIUtils.updateConnectionStatus('offline');
                
                const savedCount = this._saveOffline(attendanceRecords, options);
                
                return {
                    success: true,
                    saved: savedCount,
                    method: 'offline',
                    message: 'Datos guardados localmente. Se sincronizarán cuando haya conexión.',
                    onlineError: onlineError.message
                };
            }

        } catch (error) {
            console.error('AttendanceService: Error al guardar asistencia:', error);
            
            // En caso de error de validación, intentar guardar offline como backup
            try {
                const savedCount = this._saveOffline(attendanceRecords, options);
                return {
                    success: false,
                    error: error.message,
                    backupSaved: savedCount,
                    message: 'Error al guardar. Datos guardados localmente como respaldo.'
                };
            } catch (backupError) {
                throw new Error(`Error al guardar: ${error.message}. Error en respaldo: ${backupError.message}`);
            }
        }
    },

    /**
     * Crea registro de clase cancelada para todos los estudiantes de un grupo
     */
    async saveCancellation(groupCode, reason, description = '', date = null, students = []) {
        debugLog(`AttendanceService: Creando cancelación para grupo ${groupCode}`);

        try {
            const cancellationDate = date || DateUtils.getCurrentDate();
            
            // Crear registros de cancelación para cada estudiante
            const cancellationRecords = students.map(student => 
                this.createAttendanceRecord(
                    student.id,
                    groupCode,
                    this.ATTENDANCE_STATUS.CANCELLED,
                    {
                        date: cancellationDate,
                        classType: this.ATTENDANCE_TYPES.REGULAR,
                        justification: reason,
                        description: description
                    }
                )
            );

            // Guardar registros usando la nueva lógica híbrida
            const result = await this.saveAttendance(cancellationRecords, {
                type: 'cancellation',
                groupCode,
                date: cancellationDate
            });

            debugLog(`AttendanceService: Cancelación guardada para ${students.length} estudiantes`);
            return result;

        } catch (error) {
            console.error('AttendanceService: Error al guardar cancelación:', error);
            throw error;
        }
    },

    /**
     * Crea registro de reposición individual
     */
    async saveRepositionAttendance(selectedStudents, attendanceData, date = null) {
        debugLog(`AttendanceService: Creando reposición individual para ${selectedStudents.length} estudiantes`);

        try {
            const repositionDate = date || DateUtils.getCurrentDate();
            
            // Crear registros de reposición
            const repositionRecords = [];
            
            selectedStudents.forEach(student => {
                const studentAttendance = attendanceData[student.id];
                if (studentAttendance) {
                    const record = this.createAttendanceRecord(
                        student.id,
                        `REPOSICION-${repositionDate}`, // Código especial para reposiciones
                        studentAttendance.status,
                        {
                            date: repositionDate,
                            classType: this.ATTENDANCE_TYPES.REPOSITION,
                            justification: studentAttendance.justification,
                            description: studentAttendance.description
                        }
                    );
                    repositionRecords.push(record);
                }
            });

            // Guardar registros usando la nueva lógica híbrida
            const result = await this.saveAttendance(repositionRecords, {
                type: 'reposition',
                date: repositionDate
            });

            debugLog(`AttendanceService: Reposición guardada para ${repositionRecords.length} estudiantes`);
            return result;

        } catch (error) {
            console.error('AttendanceService: Error al guardar reposición:', error);
            throw error;
        }
    },

    /**
     * Valida los datos de asistencia
     */
    validateAttendanceData(data) {
        const errors = [];

        if (!data.studentId || data.studentId.toString().trim() === '') {
            errors.push('ID de estudiante requerido');
        }

        if (!data.groupCode || data.groupCode.toString().trim() === '') {
            errors.push('Código de grupo requerido');
        }

        if (!data.status || !Object.values(this.ATTENDANCE_STATUS).includes(data.status)) {
            errors.push(`Estado de asistencia inválido. Debe ser: ${Object.values(this.ATTENDANCE_STATUS).join(', ')}`);
        }

        if (data.justification && !Object.values(this.JUSTIFICATION_TYPES).includes(data.justification)) {
            debugLog('AttendanceService: Tipo de justificación no estándar:', data.justification);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Valida un registro de asistencia completo
     */
    validateAttendanceRecord(record) {
        const errors = [];

        if (!record || typeof record !== 'object') {
            errors.push('Registro de asistencia requerido');
            return { valid: false, errors };
        }

        const requiredFields = [
            'id', 'fecha', 'estudiante_id', 'grupo_codigo', 
            'tipo_clase', 'estado', 'timestamp'
        ];

        requiredFields.forEach(field => {
            if (!record[field] || record[field].toString().trim() === '') {
                errors.push(`Campo requerido: ${field}`);
            }
        });

        // Validar fecha
        if (record.fecha && !ValidationUtils.isValidDate(record.fecha)) {
            errors.push('Formato de fecha inválido');
        }

        // Validar estado
        if (record.estado && !Object.values(this.ATTENDANCE_STATUS).includes(record.estado)) {
            errors.push('Estado de asistencia inválido');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Obtiene estadísticas de un conjunto de registros de asistencia
     */
    calculateAttendanceStats(attendanceRecords) {
        if (!Array.isArray(attendanceRecords) || attendanceRecords.length === 0) {
            return {
                total: 0,
                present: 0,
                absent: 0,
                justified: 0,
                cancelled: 0,
                percentage: 0
            };
        }

        const stats = {
            total: attendanceRecords.length,
            present: 0,
            absent: 0,
            justified: 0,
            cancelled: 0
        };

        attendanceRecords.forEach(record => {
            switch (record.estado || record.status) {
                case this.ATTENDANCE_STATUS.PRESENT:
                    stats.present++;
                    break;
                case this.ATTENDANCE_STATUS.ABSENT:
                    stats.absent++;
                    break;
                case this.ATTENDANCE_STATUS.JUSTIFIED:
                    stats.justified++;
                    break;
                case this.ATTENDANCE_STATUS.CANCELLED:
                    stats.cancelled++;
                    break;
            }
        });

        // Calcular porcentaje de asistencia (presente + justificada vs total - canceladas)
        const effectiveTotal = stats.total - stats.cancelled;
        const effectivePresent = stats.present + stats.justified;
        stats.percentage = effectiveTotal > 0 ? Math.round((effectivePresent / effectiveTotal) * 100) : 0;

        return stats;
    },

    // ===========================================
    // MÉTODOS PRIVADOS
    // ===========================================

    /**
     * Guarda registros de asistencia offline
     */
    _saveOffline(attendanceRecords, options = {}) {
        debugLog('AttendanceService: Guardando registros offline');

        let savedCount = 0;

        attendanceRecords.forEach(record => {
            try {
                StorageUtils.savePendingAttendance({
                    data: record,
                    groupCode: record.grupo_codigo,
                    date: record.fecha,
                    type: options.type || 'attendance',
                    originalOptions: options
                });
                savedCount++;
            } catch (error) {
                console.error('AttendanceService: Error al guardar registro offline:', error);
            }
        });

        debugLog(`AttendanceService: ${savedCount} registros guardados offline`);
        return savedCount;
    }
};

// Hacer disponible globalmente
window.AttendanceService = AttendanceService;

debugLog('attendance-service.js SOLUCIONADO - Lógica híbrida implementada');
