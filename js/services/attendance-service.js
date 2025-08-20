/**
 * SERVICIO DE ASISTENCIAS - VERSIÓN CORREGIDA
 * ==========================================
 * 🔧 CORRECCIONES APLICADAS:
 * - ID_Clase siempre presente y validado
 * - Verificación exhaustiva en createGroupAttendanceRecords
 * - Mejor logging para debugging
 */

const AttendanceService = {
    // Estados de asistencia
    ATTENDANCE_STATUS: {
        PRESENT: 'Presente',
        ABSENT: 'Ausente',
        JUSTIFIED: 'Justificada',
        CANCELLED: 'Cancelada'
    },

    // Tipos de asistencia
    ATTENDANCE_TYPES: {
        REGULAR: 'Regular',
        MAKEUP: 'Reposición',
        CANCELLED: 'Cancelada',
        SPECIAL: 'Especial'
    },

    /**
     * 🔧 CORREGIDO: Crea un registro de asistencia individual con validación mejorada
     */
    createAttendanceRecord(studentId, groupCode, status, options = {}) {
        console.log('🔥 DEBUG: AttendanceService.createAttendanceRecord CORREGIDO');
        console.log('🔍 DEBUG: Parámetros recibidos:', {
            studentId,
            groupCode,
            status,
            options
        });
        
        try {
            // Validaciones básicas
            if (!studentId || !groupCode || !status) {
                throw new Error('Parámetros requeridos faltantes: studentId, groupCode, status');
            }
            
            // Validar estado
            if (!Object.values(this.ATTENDANCE_STATUS).includes(status)) {
                throw new Error(`Estado de asistencia inválido: ${status}`);
            }
            
            // 🔧 CORREGIDO: Verificar ID_Clase con mejor manejo
            const idClase = options.idClase || options.ID_Clase || '';
            
            console.log('🔍 DEBUG: ID_Clase extraído de options:', {
                idClase: idClase,
                hasIdClase: !!idClase,
                idClaseLength: idClase.length,
                optionsKeys: Object.keys(options)
            });
            
            // 🔧 CORREGIDO: Validación más estricta de ID_Clase
            if (!idClase || idClase.toString().trim() === '') {
                console.error('❌ DEBUG: ID_Clase VACÍO en createAttendanceRecord!', {
                    studentId,
                    groupCode,
                    options
                });
                throw new Error('ID_Clase es obligatorio y no puede estar vacío');
            }
            
            console.log('✅ DEBUG: ID_Clase VÁLIDO:', idClase);
            
            // Crear registro completo
            const record = {
                ID: DataUtils.generateId('AST'),
                ID_Clase: idClase.toString().trim(), // 🔧 CORREGIDO: Asegurar string limpio
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
            
            console.log('🔍 DEBUG: Registro creado:', {
                ID: record.ID,
                ID_Clase: record.ID_Clase,
                hasID_Clase: !!record.ID_Clase,
                ID_ClaseLength: record.ID_Clase.length,
                Estudiante_ID: record.Estudiante_ID,
                Estado: record.Estado
            });
            
            // 🔧 CORREGIDO: Verificación final más robusta
            if (!record.ID_Clase || record.ID_Clase.trim() === '') {
                console.error('❌ DEBUG: Registro creado SIN ID_Clase válido:', record);
                throw new Error('CRÍTICO: Registro creado sin ID_Clase válido');
            }
            
            console.log('✅ DEBUG: Registro válido con ID_Clase:', record.ID_Clase);
            debugLog('AttendanceService: Registro de asistencia creado:', record.ID);
            return record;
            
        } catch (error) {
            console.error('❌ DEBUG: Error en createAttendanceRecord:', error);
            throw new Error(`Error creando registro: ${error.message}`);
        }
    },

    /**
     * 🔧 CORREGIDO: Crea registros de asistencia para un grupo completo con validación exhaustiva
     */
    createGroupAttendanceRecords(attendanceData, options = {}) {
        console.log('🔥 DEBUG: AttendanceService.createGroupAttendanceRecords CORREGIDO');
        console.log('🔍 DEBUG: Parámetros de entrada:', {
            attendanceDataKeys: Object.keys(attendanceData || {}),
            attendanceDataCount: Object.keys(attendanceData || {}).length,
            options: options
        });
        
        // 🔧 CORREGIDO: Validación más estricta de idClase
        const { idClase, groupCode, date, classType, sentBy } = options;
        
        console.log('🔍 DEBUG: Extracción de parámetros:', {
            idClase: idClase,
            hasIdClase: !!idClase,
            idClaseType: typeof idClase,
            idClaseLength: idClase ? idClase.length : 0,
            groupCode,
            date,
            classType,
            sentBy
        });
        
        // 🔧 CORREGIDO: Validación obligatoria de idClase
        if (!idClase || idClase.toString().trim() === '') {
            console.error('❌ DEBUG: idClase FALTANTE o VACÍO en options!', options);
            throw new Error('ID_Clase es obligatorio y no puede estar vacío para crear registros de asistencia');
        }
        
        console.log('✅ DEBUG: idClase VÁLIDO para grupo:', idClase);
        
        try {
            const records = [];
            const errors = [];
            
            if (!attendanceData || typeof attendanceData !== 'object') {
                throw new Error('Datos de asistencia inválidos');
            }
            
            const attendanceEntries = Object.values(attendanceData);
            console.log('🔍 DEBUG: Procesando registros:', {
                totalEntries: attendanceEntries.length,
                firstEntry: attendanceEntries[0]
            });
            
            // Procesar cada registro de asistencia
            attendanceEntries.forEach((record, index) => {
                try {
                    console.log(`🔍 DEBUG: Procesando registro ${index + 1}:`, record);
                    
                    // Validar estructura del registro
                    if (!record.studentId || !record.status) {
                        throw new Error(`Registro ${index}: ID de estudiante o estado faltante`);
                    }
                    
                    // 🔧 CORREGIDO: Pasar idClase explícitamente
                    const attendanceRecord = this.createAttendanceRecord(
                        record.studentId,
                        groupCode,
                        record.status,
                        {
                            date,
                            classType,
                            justification: record.justification,
                            description: record.description,
                            idClase: idClase, // 🔧 CRÍTICO: Pasar ID de clase
                            sentBy
                        }
                    );
                    
                    // 🔧 CORREGIDO: Verificar que el registro tenga ID_Clase
                    console.log(`🔍 DEBUG: Registro ${index + 1} creado:`, {
                        ID: attendanceRecord.ID,
                        ID_Clase: attendanceRecord.ID_Clase,
                        hasID_Clase: !!attendanceRecord.ID_Clase,
                        ID_ClaseLength: attendanceRecord.ID_Clase ? attendanceRecord.ID_Clase.length : 0,
                        Estudiante_ID: attendanceRecord.Estudiante_ID
                    });
                    
                    if (!attendanceRecord.ID_Clase || attendanceRecord.ID_Clase.trim() === '') {
                        console.error(`❌ DEBUG: Registro ${index + 1} SIN ID_Clase:`, attendanceRecord);
                        throw new Error(`Registro ${index + 1} sin ID_Clase válido`);
                    }
                    
                    records.push(attendanceRecord);
                    
                } catch (recordError) {
                    console.error(`❌ DEBUG: Error procesando registro ${index}:`, recordError);
                    errors.push({
                        index,
                        studentId: record.studentId,
                        error: recordError.message
                    });
                }
            });
            
            // 🔧 CORREGIDO: Verificación final exhaustiva de todos los registros
            const recordsWithClassId = records.filter(r => r.ID_Clase && r.ID_Clase.trim() !== '');
            const recordsWithoutClassId = records.filter(r => !r.ID_Clase || r.ID_Clase.trim() === '');
            
            console.log('🔍 DEBUG: Resumen final de registros creados:', {
                totalRecords: records.length,
                recordsWithClassId: recordsWithClassId.length,
                recordsWithoutClassId: recordsWithoutClassId.length,
                errors: errors.length,
                expectedClassId: idClase,
                firstRecordSample: records[0]
            });
            
            if (recordsWithoutClassId.length > 0) {
                console.error('❌ DEBUG: REGISTROS SIN ID_CLASE DETECTADOS:', recordsWithoutClassId);
                recordsWithoutClassId.forEach((record, index) => {
                    console.error(`❌ DEBUG: Registro sin ID_Clase #${index}:`, {
                        ID: record.ID,
                        ID_Clase: record.ID_Clase,
                        Estudiante_ID: record.Estudiante_ID,
                        fullRecord: record
                    });
                });
                throw new Error(`CRÍTICO: ${recordsWithoutClassId.length} registros sin ID_Clase válido detectados`);
            }
            
            console.log('✅ DEBUG: TODOS los registros tienen ID_Clase válido');
            
            debugLog(`AttendanceService: ${records.length} registros creados, ${errors.length} errores`);
            
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
            console.error('❌ DEBUG: Error en createGroupAttendanceRecords:', error);
            throw new Error(`Error creando registros de asistencia: ${error.message}`);
        }
    },

    /**
     * 🔧 CORREGIDO: Guarda registros de asistencia con validación mejorada
     */
    async saveAttendance(attendanceRecords, options = {}) {
        console.log('🔥 DEBUG: AttendanceService.saveAttendance CORREGIDO');
        console.log('🔍 DEBUG: Parámetros de entrada:', {
            recordsCount: attendanceRecords.length,
            options: options,
            firstRecordSample: attendanceRecords[0]
        });

        try {
            // 🔧 CORREGIDO: Validación exhaustiva de ID_Clase
            const recordsWithClassId = attendanceRecords.filter(record => record.ID_Clase && record.ID_Clase.trim() !== '');
            const recordsWithoutClassId = attendanceRecords.filter(record => !record.ID_Clase || record.ID_Clase.trim() === '');
            
            console.log('🔍 DEBUG: Validación de ID_Clase en saveAttendance:', {
                totalRecords: attendanceRecords.length,
                recordsWithClassId: recordsWithClassId.length,
                recordsWithoutClassId: recordsWithoutClassId.length
            });
            
            if (recordsWithoutClassId.length > 0) {
                console.error('❌ DEBUG: Registros sin ID_Clase encontrados antes de guardar:', recordsWithoutClassId);
                throw new Error(`CRÍTICO: ${recordsWithoutClassId.length} registros sin ID_Clase válido - no se puede guardar`);
            }
            
            console.log('✅ DEBUG: Todos los registros tienen ID_Clase válido');

            // Validar que todos los registros sean válidos
            const validationErrors = [];
            attendanceRecords.forEach((record, index) => {
                const validation = this.validateAttendanceRecord(record);
                if (!validation.valid) {
                    validationErrors.push(`Registro ${index + 1}: ${validation.errors.join(', ')}`);
                }
            });

            if (validationErrors.length > 0) {
                console.error('❌ DEBUG: Errores de validación:', validationErrors);
                throw new Error(`Errores de validación: ${validationErrors.join('; ')}`);
            }
            
            console.log('✅ DEBUG: Todos los registros pasaron validación');

            // Formatear datos para backend
            const formattedData = this.formatForBackend(attendanceRecords);
            
            console.log('🔍 DEBUG: Datos formateados para backend:', {
                formattedDataCount: formattedData.length,
                firstFormattedSample: formattedData[0]
            });

            // Lógica híbrida online/offline
            try {
                console.log('🔥 DEBUG: Intentando guardado ONLINE...');
                
                const result = await SheetsAPI.saveAttendance(formattedData);
                
                console.log('✅ DEBUG: Guardado ONLINE exitoso:', result);
                UIUtils.updateConnectionStatus('online');
                
                return {
                    success: true,
                    saved: attendanceRecords.length,
                    method: 'online',
                    result
                };

            } catch (onlineError) {
                console.error('❌ DEBUG: Guardado online FALLÓ:', onlineError.message);
                console.log('🔄 DEBUG: Intentando guardado OFFLINE...');
                
                UIUtils.updateConnectionStatus('offline');
                
                const savedCount = this._saveOffline(attendanceRecords, options);
                
                console.log('✅ DEBUG: Guardado offline exitoso:', savedCount);
                
                return {
                    success: true,
                    saved: savedCount,
                    method: 'offline',
                    message: 'Datos guardados localmente. Se sincronizarán cuando haya conexión.',
                    onlineError: onlineError.message
                };
            }

        } catch (error) {
            console.error('❌ DEBUG: Error general en saveAttendance:', error);
            
            // En caso de error de validación, intentar guardar offline como backup
            try {
                console.log('🔄 DEBUG: Intentando backup offline después de error...');
                const savedCount = this._saveOffline(attendanceRecords, options);
                return {
                    success: false,
                    error: error.message,
                    backupSaved: savedCount,
                    message: 'Error al guardar. Datos guardados localmente como respaldo.'
                };
            } catch (backupError) {
                console.error('❌ DEBUG: Error en backup offline:', backupError);
                throw new Error(`Error al guardar: ${error.message}. Error en respaldo: ${backupError.message}`);
            }
        }
    },

    /**
     * 🔧 CORREGIDO: Validación mejorada de registro completo
     */
    validateAttendanceRecord(record) {
        const errors = [];

        if (!record || typeof record !== 'object') {
            errors.push('Registro de asistencia requerido');
            return { valid: false, errors };
        }

        // Campos requeridos
        const requiredFields = [
            'ID', 'Fecha', 'Estudiante_ID', 'Grupo_Codigo', 
            'Tipo_Clase', 'Estado', 'Timestamp'
        ];

        requiredFields.forEach(field => {
            if (!record[field] || record[field].toString().trim() === '') {
                errors.push(`Campo requerido: ${field}`);
            }
        });

        // 🔧 CORREGIDO: Validación específica mejorada de ID_Clase
        if (!record.ID_Clase || record.ID_Clase.toString().trim() === '') {
            console.error('❌ DEBUG: Validación falló - ID_Clase faltante o vacío:', record);
            errors.push('ID de clase requerido y no puede estar vacío (ID_Clase)');
        } else {
            console.log('✅ DEBUG: Validación ID_Clase OK:', record.ID_Clase);
        }

        // Validar fecha
        if (record.Fecha && !ValidationUtils.isValidDate(record.Fecha)) {
            errors.push('Formato de fecha inválido');
        }

        // Validar estado
        if (record.Estado && !Object.values(this.ATTENDANCE_STATUS).includes(record.Estado)) {
            errors.push('Estado de asistencia inválido');
        }

        const isValid = errors.length === 0;
        
        if (!isValid) {
            console.error('❌ DEBUG: Validación falló:', {
                record: record,
                errors: errors
            });
        }

        return {
            valid: isValid,
            errors
        };
    },

    /**
     * Formato para backend (sin cambios significativos)
     */
    formatForBackend(attendanceRecords) {
        console.log('🔍 DEBUG: Formateando registros para backend...');
        
        // 🔧 CORREGIDO: Verificar que todos tengan ID_Clase antes de formatear
        const recordsWithoutClass = attendanceRecords.filter(record => !record.ID_Clase || record.ID_Clase.trim() === '');
        if (recordsWithoutClass.length > 0) {
            console.error('❌ DEBUG: Registros sin ID_Clase al formatear:', recordsWithoutClass);
            throw new Error(`${recordsWithoutClass.length} registros sin ID_Clase válido al formatear`);
        }

        console.log('✅ DEBUG: Los registros ya están en formato correcto de objetos');
        return attendanceRecords;
    },

    /**
     * Calcula estadísticas de asistencia (sin cambios)
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
     * 🔧 CORREGIDO: Guarda registros offline con verificaciones mejoradas
     */
    _saveOffline(attendanceRecords, options = {}) {
        console.log('🔍 DEBUG: Guardando registros offline...');

        let savedCount = 0;

        attendanceRecords.forEach((record, index) => {
            try {
                // 🔧 CORREGIDO: Verificar que el registro tenga ID_Clase antes de guardar offline
                if (!record.ID_Clase || record.ID_Clase.trim() === '') {
                    console.warn(`⚠️ DEBUG: Guardando registro ${index + 1} sin ID_Clase offline:`, record);
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
                
                console.log(`✅ DEBUG: Registro ${index + 1} guardado offline con ID_Clase:`, record.ID_Clase);
                
            } catch (error) {
                console.error(`❌ DEBUG: Error al guardar registro ${index + 1} offline:`, error);
            }
        });

        console.log(`✅ DEBUG: ${savedCount} de ${attendanceRecords.length} registros guardados offline`);
        return savedCount;
    }
};

// Hacer disponible globalmente
window.AttendanceService = AttendanceService;

debugLog('AttendanceService - VERSIÓN CORREGIDA CON VALIDACIONES MEJORADAS');
