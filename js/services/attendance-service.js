/**
 * SERVICIO DE ASISTENCIAS - VERSIÓN INTEGRADA Y CORREGIDA
 * =======================================================
 * ✅ Integra correcciones de ID_Clase del primer archivo
 * ✅ Mantiene mejoras de formateo del segundo archivo
 * ✅ Elimina doble formateo y conserva nombres correctos de campos
 * ✅ Incluye validaciones mejoradas y manejo híbrido online/offline
 */

const AttendanceService = {
    // Tipos de asistencia
    ATTENDANCE_TYPES: {
        REGULAR: 'Regular',
        MAKEUP: 'Reposición',
        CANCELLED: 'Cancelada',
        SPECIAL: 'Especial'
    },

    // Estados de asistencia
    ATTENDANCE_STATUS: {
        PRESENT: 'Presente',
        ABSENT: 'Ausente',
        JUSTIFIED: 'Justificada',
        CANCELLED: 'Cancelada'
    },

    // Tipos de justificación
    JUSTIFICATION_TYPES: {
        MEDICAL: 'Médica',
        PERSONAL: 'Personal',
        ACADEMIC: 'Académica',
        FAMILY: 'Familiar',
        OTHER: 'Otra'
    },

    /**
     * ✅ INTEGRADO: Crea un registro de asistencia individual
     * Combina las mejoras de ID_Clase del primer archivo con el formato correcto del segundo
     */
    createAttendanceRecord(studentId, groupCode, status, options = {}) {
        try {
            // Validaciones básicas
            if (!studentId || !groupCode || !status) {
                throw new Error('Parámetros requeridos faltantes: studentId, groupCode, status');
            }
            
            // Validar estado
            if (!Object.values(this.ATTENDANCE_STATUS).includes(status)) {
                throw new Error(`Estado de asistencia inválido: ${status}`);
            }
            
            // ✅ INTEGRADO: Usar options.idClase correctamente (mejora del primer archivo)
            const idClase = options.idClase || '';
            
            // ✅ VERIFICACIÓN: Log para debugging
            if (!idClase) {
                console.warn(`AttendanceService: ⚠️ ID_Clase vacío para estudiante ${studentId}`);
            } else {
                debugLog(`AttendanceService: ✅ Creando registro con ID_Clase: ${idClase}`);
            }
            
            // Crear registro completo con formato correcto (del segundo archivo)
            const record = {
                ID: DataUtils.generateId('AST'),
                ID_Clase: idClase, // ✅ INTEGRADO: Usar valor correcto del parámetro
                Fecha: options.date || DateUtils.getCurrentDate(),
                Estudiante_ID: studentId,
                Grupo_Codigo: groupCode,
                Tipo_Clase: options.classType || this.ATTENDANCE_TYPES.REGULAR,
                Estado: status,
                Justificacion: options.justification || '',
                Descripcion: options.description || '',
                Enviado_Por: options.sentBy || window.AppState.user?.email || 'usuario',
                Timestamp: DateUtils.getCurrentTimestamp()
            };
            
            // ✅ VERIFICACIÓN FINAL: Comprobar que ID_Clase no está vacío
            if (!record.ID_Clase) {
                console.error('❌ AttendanceService: Registro creado SIN ID_Clase:', record);
            }
            
            debugLog('AttendanceService: Registro de asistencia creado:', record);
            return record;
            
        } catch (error) {
            console.error('AttendanceService: Error creando registro de asistencia:', error);
            throw new Error(`Error creando registro: ${error.message}`);
        }
    },

    /**
     * ✅ INTEGRADO: Crea registros de asistencia para un grupo completo
     * Combina las mejoras de ID_Clase con el manejo de errores mejorado
     */
    createGroupAttendanceRecords(attendanceData, options = {}) {
        debugLog('AttendanceService: Creando registros grupales de asistencia CON ID_CLASE INTEGRADO');
        
        try {
            // ✅ INTEGRADO: Extraer idClase de options (mejora del primer archivo)
            const { idClase, groupCode, date, classType, sentBy } = options;
            
            // Validar que tenemos idClase
            if (!idClase) {
                console.warn('AttendanceService: ⚠️ idClase no proporcionado en options:', options);
            }
            
            const records = [];
            const errors = [];
            
            if (!attendanceData || typeof attendanceData !== 'object') {
                throw new Error('Datos de asistencia inválidos');
            }
            
            // Procesar cada registro de asistencia
            Object.values(attendanceData).forEach((record, index) => {
                try {
                    // Validar estructura del registro
                    if (!record.studentId || !record.status) {
                        throw new Error(`Registro ${index}: ID de estudiante o estado faltante`);
                    }
                    
                    // ✅ INTEGRADO: Pasar idClase en options a createAttendanceRecord
                    const attendanceRecord = this.createAttendanceRecord(
                        record.studentId,
                        groupCode,
                        record.status,
                        {
                            date,
                            classType,
                            justification: record.justification,
                            description: record.description,
                            idClase: idClase, // ✅ INTEGRADO: Pasar ID de clase
                            sentBy
                        }
                    );
                    
                    records.push(attendanceRecord);
                    
                } catch (recordError) {
                    console.error(`AttendanceService: Error procesando registro ${index}:`, recordError);
                    errors.push({
                        index,
                        studentId: record.studentId,
                        error: recordError.message
                    });
                }
            });
            
            debugLog(`AttendanceService: ${records.length} registros creados, ${errors.length} errores`);
            
            // ✅ VERIFICACIÓN: Comprobar que todos los registros tienen ID_Clase
            const recordsWithoutClass = records.filter(r => !r.ID_Clase);
            if (recordsWithoutClass.length > 0) {
                console.error('❌ AttendanceService: Registros sin ID_Clase detectados:', recordsWithoutClass);
            } else {
                debugLog('✅ AttendanceService: Todos los registros tienen ID_Clase asignado');
            }
            
            return {
                records,
                errors,
                summary: {
                    total: records.length,
                    successful: records.length,
                    failed: errors.length,
                    classId: idClase
                }
            };
            
        } catch (error) {
            console.error('AttendanceService: Error en createGroupAttendanceRecords:', error);
            throw new Error(`Error creando registros de asistencia: ${error.message}`);
        }
    },

    /**
     * ✅ INTEGRADO: Formato para backend - mantiene objetos correctos
     * No convierte a arrays (mejora del segundo archivo)
     */
    formatForBackend(attendanceRecords) {
        debugLog(`AttendanceService: Registros ya están en formato correcto - ${attendanceRecords.length} registros`);

        // ✅ VERIFICACIÓN: Asegurar que todos tienen ID_Clase antes de enviar
        const recordsWithoutClass = attendanceRecords.filter(record => !record.ID_Clase);
        if (recordsWithoutClass.length > 0) {
            console.error('❌ AttendanceService: Registros sin ID_Clase al formatear:', recordsWithoutClass);
        }

        // No convertir a arrays, los registros ya están en el formato correcto
        return attendanceRecords;
    },

    /**
     * ✅ INTEGRADO: Guarda registros de asistencia con lógica híbrida mejorada
     * Combina las verificaciones de ID_Clase con el manejo híbrido online/offline
     */
    async saveAttendance(attendanceRecords, options = {}) {
        debugLog(`AttendanceService: Guardando ${attendanceRecords.length} registros`);

        try {
            // ✅ INTEGRADO: Validar que todos los registros tengan ID_Clase (del primer archivo)
            const invalidRecords = attendanceRecords.filter(record => !record.ID_Clase);
            if (invalidRecords.length > 0) {
                console.error('AttendanceService: Registros sin ID_Clase encontrados:', invalidRecords);
                throw new Error(`${invalidRecords.length} registros sin ID_Clase`);
            }

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

            // ✅ INTEGRADO: No formatear para backend - mantener objetos como están
            const formattedData = this.formatForBackend(attendanceRecords);

            // ✅ INTEGRADO: Lógica híbrida mejorada
            try {
                debugLog('AttendanceService: Intentando guardado online directo...');
                
                // Intentar petición directa
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
     * ✅ INTEGRADO: Convierte registros a formato de array para casos específicos
     * Mantiene verificaciones de ID_Clase del primer archivo
     */
    convertRecordsToArrayFormat(records) {
        debugLog('AttendanceService: Convirtiendo registros a formato array');
        
        try {
            const arrayRecords = records.map(record => {
                // ✅ VERIFICACIÓN: Asegurar que ID_Clase existe antes de convertir
                if (!record.ID_Clase) {
                    console.error('❌ AttendanceService: Registro sin ID_Clase al convertir:', record);
                }
                
                return [
                    record.ID,
                    record.ID_Clase, // ✅ Posición [1] - crítica para backend
                    record.Fecha,
                    record.Estudiante_ID,
                    record.Grupo_Codigo,
                    record.Tipo_Clase,
                    record.Estado,
                    record.Justificacion,
                    record.Descripcion,
                    record.Enviado_Por,
                    record.Timestamp
                ];
            });
            
            // ✅ VERIFICACIÓN FINAL: Comprobar que posición [1] no esté vacía
            const recordsWithEmptyClassId = arrayRecords.filter(arr => !arr[1]);
            if (recordsWithEmptyClassId.length > 0) {
                console.error('❌ AttendanceService: Arrays con ID_Clase vacío en posición [1]:', recordsWithEmptyClassId);
            } else {
                debugLog('✅ AttendanceService: Todos los arrays tienen ID_Clase en posición [1]');
            }
            
            return arrayRecords;
            
        } catch (error) {
            console.error('AttendanceService: Error convirtiendo a arrays:', error);
            throw new Error(`Error en conversión: ${error.message}`);
        }
    },

    /**
     * Crea registro de clase cancelada para todos los estudiantes de un grupo
     */
    async saveCancellation(groupCode, reason, description = '', date = null, students = [], idClase = null) {
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
                        description: description,
                        idClase: idClase // ✅ INTEGRADO: Pasar ID de clase
                    }
                )
            );

            // Guardar registros usando la lógica híbrida
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
    async saveRepositionAttendance(selectedStudents, attendanceData, date = null, idClase = null) {
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
                            classType: this.ATTENDANCE_TYPES.MAKEUP,
                            justification: studentAttendance.justification,
                            description: studentAttendance.description,
                            idClase: idClase // ✅ INTEGRADO: Pasar ID de clase
                        }
                    );
                    repositionRecords.push(record);
                }
            });

            // Guardar registros usando la lógica híbrida
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
     * ✅ INTEGRADO: Validación mejorada de registro completo
     * Incluye validación de ID_Clase del primer archivo
     */
    validateAttendanceRecord(record) {
        const errors = [];

        if (!record || typeof record !== 'object') {
            errors.push('Registro de asistencia requerido');
            return { valid: false, errors };
        }

        // Campos requeridos con nombres correctos
        const requiredFields = [
            'ID', 'Fecha', 'Estudiante_ID', 'Grupo_Codigo', 
            'Tipo_Clase', 'Estado', 'Timestamp'
        ];

        requiredFields.forEach(field => {
            if (!record[field] || record[field].toString().trim() === '') {
                errors.push(`Campo requerido: ${field}`);
            }
        });

        // ✅ INTEGRADO: Validación de ID_Clase del primer archivo
        if (!record.ID_Clase) {
            errors.push('ID de clase requerido');
        }

        // Validar fecha
        if (record.Fecha && !ValidationUtils.isValidDate(record.Fecha)) {
            errors.push('Formato de fecha inválido');
        }

        // Validar estado
        if (record.Estado && !Object.values(this.ATTENDANCE_STATUS).includes(record.Estado)) {
            errors.push('Estado de asistencia inválido');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Calcula estadísticas de asistencia
     */
    calculateAttendanceStats(attendanceRecords) {
        try {
            if (!Array.isArray(attendanceRecords)) {
                attendanceRecords = Object.values(attendanceRecords || {});
            }
            
            const stats = {
                total: attendanceRecords.length,
                present: 0,
                absent: 0,
                justified: 0,
                cancelled: 0,
                percentage: 0
            };
            
            attendanceRecords.forEach(record => {
                switch (record.status || record.Estado) {
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
            
            // Calcular porcentaje de asistencia efectiva
            const effectiveTotal = stats.total - stats.cancelled;
            const effectivePresent = stats.present + stats.justified;
            stats.percentage = effectiveTotal > 0 ? Math.round((effectivePresent / effectiveTotal) * 100) : 0;
            
            return stats;
            
        } catch (error) {
            console.error('AttendanceService: Error calculando estadísticas:', error);
            return {
                total: 0,
                present: 0,
                absent: 0,
                justified: 0,
                cancelled: 0,
                percentage: 0
            };
        }
    },

    /**
     * ✅ INTEGRADO: Métodos de sincronización del primer archivo
     */
    async syncPendingRecords() {
        debugLog('AttendanceService: Sincronizando registros pendientes');
        
        try {
            const pendingRecords = StorageUtils.get('pending_attendance', []);
            
            if (pendingRecords.length === 0) {
                debugLog('AttendanceService: No hay registros pendientes para sincronizar');
                return { success: true, syncedCount: 0 };
            }
            
            if (!NetworkUtils.isOnline()) {
                throw new Error('Sin conexión para sincronización');
            }
            
            // Limpiar metadatos locales
            const cleanRecords = pendingRecords.map(record => {
                const { _localSave, _saveTimestamp, ...cleanRecord } = record;
                return cleanRecord;
            });
            
            // Intentar sincronizar
            const result = await this.saveAttendance(cleanRecords);
            
            if (result.success) {
                // Limpiar registros pendientes
                StorageUtils.remove('pending_attendance');
                debugLog(`AttendanceService: ${cleanRecords.length} registros sincronizados exitosamente`);
            }
            
            return {
                success: result.success,
                syncedCount: cleanRecords.length,
                method: 'sync'
            };
            
        } catch (error) {
            console.error('AttendanceService: Error en sincronización:', error);
            throw error;
        }
    },

    /**
     * Obtiene el conteo de registros pendientes
     */
    getPendingRecordsCount() {
        const pendingRecords = StorageUtils.get('pending_attendance', []);
        return pendingRecords.length;
    },

    /**
     * Limpia registros pendientes (usar con precaución)
     */
    clearPendingRecords() {
        StorageUtils.remove('pending_attendance');
        debugLog('AttendanceService: Registros pendientes limpiados');
    },

    // ===========================================
    // MÉTODOS PRIVADOS
    // ===========================================

    /**
     * ✅ INTEGRADO: Guarda registros offline con verificaciones mejoradas
     */
    _saveOffline(attendanceRecords, options = {}) {
        debugLog('AttendanceService: Guardando registros offline');

        let savedCount = 0;

        attendanceRecords.forEach(record => {
            try {
                // ✅ VERIFICACIÓN: Asegurar que el registro tenga ID_Clase antes de guardar offline
                if (!record.ID_Clase) {
                    console.warn('AttendanceService: ⚠️ Guardando registro sin ID_Clase offline:', record);
                }

                StorageUtils.savePendingAttendance({
                    data: record,
                    groupCode: record.Grupo_Codigo,
                    date: record.Fecha,
                    type: options.type || 'attendance',
                    originalOptions: options,
                    _localSave: true,
                    _saveTimestamp: DateUtils.getCurrentTimestamp()
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

debugLog('AttendanceService INTEGRADO Y CORREGIDO - Versión final con todas las mejoras ✅');
