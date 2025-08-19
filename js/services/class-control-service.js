/**
 * SERVICIO DE CONTROL DE CLASES - CORREGIDO CON FIX CRÍTICO
 * =========================================================
 * Fix para comunicación correcta con backend
 * FIX CRÍTICO: Cambio de id_clase por ID_Clase (PascalCase)
 */

const ClassControlService = {
    /**
     * Estados válidos para clases
     */
    CLASS_STATES: {
        REALIZADA: 'Realizada',
        CANCELADA: 'Cancelada'
    },

    /**
     * Genera un ID único para una clase
     */
    generateClassId(fecha, grupoData) {
        // Formato: CLS_YYYY-MM-DD_HH-MM_GRUPO-CODIGO
        const fechaFormat = fecha; // Ya viene en formato YYYY-MM-DD
        const horaFormat = grupoData.hora.replace(/[:-]/g, '-').replace(/\s+/g, ''); // 15:45-16:30 -> 15-45-16-30
        const grupoFormat = grupoData.codigo.replace(/[^a-zA-Z0-9]/g, '-'); // Limpiar caracteres especiales
        
        return `CLS_${fechaFormat}_${horaFormat}_${grupoFormat}`;
    },

    /**
     * FIX: Verifica si una clase ya fue reportada con validación mejorada
     */
    async checkClassExists(fecha, groupCode) {
        debugLog(`ClassControlService: Verificando si clase existe - ${fecha}, ${groupCode}`);
        
        try {
            // Validar parámetros de entrada
            if (!fecha || fecha === undefined || fecha === null) {
                throw new Error('Parámetro "fecha" es requerido');
            }
            
            if (!groupCode || groupCode === undefined || groupCode === null) {
                throw new Error('Parámetro "groupCode" es requerido');
            }
            
            debugLog(`ClassControlService: Parámetros validados - fecha: ${fecha}, groupCode: ${groupCode}`);
            
            // Primero obtener los datos del grupo para tener la hora
            debugLog(`ClassControlService: Obteniendo datos del grupo ${groupCode}...`);
            
            const groupResult = await GroupService.getGroupByCode(groupCode);
            
            if (!groupResult || !groupResult.hora) {
                throw new Error(`No se pudo obtener información del grupo ${groupCode} o falta la hora`);
            }
            
            const groupData = groupResult;
            debugLog(`ClassControlService: Datos del grupo obtenidos:`, {
                codigo: groupData.codigo,
                hora: groupData.hora
            });
            
            // Verificar en el backend con parámetros explícitos
            debugLog(`ClassControlService: Llamando SheetsAPI.checkClassExists con:`, {
                fecha: fecha,
                groupCode: groupCode, 
                hora: groupData.hora
            });
            
            const result = await SheetsAPI.checkClassExists(fecha, groupCode, groupData.hora);
            
            debugLog(`ClassControlService: Resultado de SheetsAPI:`, result);
            
            // Validar estructura de respuesta
            if (!result || typeof result !== 'object') {
                throw new Error('Respuesta inválida del backend - no es un objeto válido');
            }
            
            if (result.success === undefined) {
                throw new Error('Respuesta inválida del backend - falta campo "success"');
            }
            
            if (!result.success) {
                throw new Error(`Error del backend: ${result.error || 'Error desconocido'}`);
            }
            
            debugLog(`ClassControlService: Verificación completada exitosamente:`, {
                exists: result.exists,
                classId: result.classId || result.classData?.id
            });
            
            return result;
            
        } catch (error) {
            console.error('ClassControlService: Error verificando clase existente:', error);
            
            // Re-lanzar con más contexto
            const enhancedError = new Error(`Error verificando clase ${groupCode} del ${fecha}: ${error.message}`);
            enhancedError.originalError = error;
            throw enhancedError;
        }
    },

    /**
     * Crea un registro de clase con validación mejorada
     */
    async createClassRecord(fecha, groupCode, estado, options = {}) {
        debugLog(`ClassControlService: Creando registro de clase - ${fecha}, ${groupCode}, ${estado}`);
        
        try {
            // Validar parámetros básicos
            if (!fecha || !groupCode || !estado) {
                throw new Error('Parámetros fecha, groupCode y estado son requeridos');
            }
            
            // Validar estado
            if (!Object.values(this.CLASS_STATES).includes(estado)) {
                throw new Error(`Estado de clase inválido: ${estado}. Estados válidos: ${Object.values(this.CLASS_STATES).join(', ')}`);
            }
            
            // Obtener datos del grupo para la hora
            debugLog(`ClassControlService: Obteniendo datos del grupo ${groupCode} para creación...`);
            
            const groupResult = await GroupService.getGroupByCode(groupCode);
            if (!groupResult || !groupResult.hora) {
                throw new Error(`No se pudo obtener información del grupo ${groupCode} o falta la hora`);
            }
            
            const groupData = groupResult;
            
            // Verificar que no exista (con manejo de errores mejorado)
            debugLog(`ClassControlService: Verificando que no exista clase previa...`);
            
            let existCheck;
            try {
                existCheck = await this.checkClassExists(fecha, groupCode);
            } catch (error) {
                // Si falla la verificación, asumir que no existe y continuar
                console.warn('ClassControlService: Error verificando clase existente, asumiendo que no existe:', error.message);
                existCheck = { exists: false };
            }
            
            if (existCheck.exists) {
                throw new Error(`La clase ${groupCode} del ${fecha} ya fue reportada como "${existCheck.classData.estado}"`);
            }
            
            // Crear registro en backend
            debugLog(`ClassControlService: Creando registro en backend...`);
            
            const createData = {
                fecha: fecha,
                grupo_codigo: groupCode,
                hora_grupo: groupData.hora,
                estado: estado,
                motivo_cancelacion: options.motivoCancelacion || '',
                asistente_id: options.asistenteId || '',
                creado_por: options.creadoPor || window.AppState?.user?.email || 'usuario'
            };
            
            debugLog(`ClassControlService: Datos para crear registro:`, createData);
            
            const result = await SheetsAPI.createClassRecord(createData);
            
            if (!result || !result.success) {
                throw new Error(`Error creando registro: ${result?.error || 'Error desconocido'}`);
            }
            
            debugLog(`ClassControlService: Clase creada exitosamente:`, result.data);
            return result.data;
            
        } catch (error) {
            console.error('ClassControlService: Error creando registro de clase:', error);
            throw error;
        }
    },

    /**
     * Valida que se pueda reportar una clase
     */
    async validateClassReport(fecha, groupCode) {
        debugLog(`ClassControlService: Validando reporte de clase - ${fecha}, ${groupCode}`);
        
        try {
            // Validar parámetros básicos
            if (!fecha || !groupCode) {
                return {
                    valid: false,
                    error: 'Fecha y código de grupo son requeridos'
                };
            }
            
            // Validar fecha
            if (!ValidationUtils.isValidDate(fecha)) {
                return {
                    valid: false,
                    error: 'Fecha inválida'
                };
            }
            
            // Validar que la fecha no sea futura (más de 7 días)
            const inputDate = new Date(fecha);
            const today = new Date();
            const maxFutureDate = new Date(today);
            maxFutureDate.setDate(today.getDate() + 7);
            
            if (inputDate > maxFutureDate) {
                return {
                    valid: false,
                    error: 'No se pueden reportar clases con más de 7 días de anticipación'
                };
            }
            
            // Validar que el grupo existe
            try {
                const groupData = await GroupService.getGroupByCode(groupCode);
                if (!groupData) {
                    return {
                        valid: false,
                        error: `Grupo ${groupCode} no encontrado`
                    };
                }
            } catch (error) {
                return {
                    valid: false,
                    error: `Error validando grupo ${groupCode}: ${error.message}`
                };
            }
            
            // Verificar que no esté ya reportada
            try {
                const existCheck = await this.checkClassExists(fecha, groupCode);
                if (existCheck.exists) {
                    return {
                        valid: false,
                        error: `La clase ${groupCode} del ${fecha} ya fue reportada`,
                        existingClass: existCheck.classData
                    };
                }
                
                return {
                    valid: true,
                    classId: existCheck.classId
                };
                
            } catch (error) {
                // Si falla la verificación, permitir continuar pero con advertencia
                console.warn('ClassControlService: Error verificando clase existente durante validación:', error.message);
                return {
                    valid: true,
                    warning: `No se pudo verificar si la clase ya existe: ${error.message}`
                };
            }
            
        } catch (error) {
            console.error('ClassControlService: Error validando reporte de clase:', error);
            return {
                valid: false,
                error: error.message
            };
        }
    },

    /**
     * 🔧 FIX CRÍTICO: Prepara los datos de asistencia con ID de clase en PascalCase
     */
    prepareAttendanceWithClassId(attendanceData, classId) {
        debugLog(`ClassControlService: Preparando asistencia con ID de clase: ${classId}`);
        
        if (!attendanceData || typeof attendanceData !== 'object') {
            throw new Error('Datos de asistencia inválidos');
        }
        
        if (!classId) {
            throw new Error('ID de clase es requerido');
        }
        
        // ✅ CORREGIDO: Usar ID_Clase en lugar de id_clase
        return Object.values(attendanceData).map(record => ({
            ...record,
            ID_Clase: classId  // PascalCase - Compatible con backend
        }));
    },

    /**
     * 🔧 FIX CRÍTICO: Maneja el flujo completo de reporte de clase realizada
     */
    async handleClassRealized(fecha, groupCode, attendanceData, asistenteId) {
        debugLog(`ClassControlService: Manejando clase realizada - ${groupCode}, ${fecha}`);
        
        try {
            // 1. Validar que se pueda reportar
            const validation = await this.validateClassReport(fecha, groupCode);
            if (!validation.valid) {
                throw new Error(validation.error);
            }
            
            if (validation.warning) {
                console.warn('ClassControlService: Advertencia en validación:', validation.warning);
            }
            
            // 2. Crear registro de clase
            const classRecord = await this.createClassRecord(fecha, groupCode, this.CLASS_STATES.REALIZADA, {
                asistenteId: asistenteId
            });
            
            if (!classRecord || !classRecord.id) {
                throw new Error('No se pudo crear el registro de clase o falta el ID');
            }
            
            // 3. Crear registros de asistencia formateados
            const { records, errors } = AttendanceService.createGroupAttendanceRecords(
                attendanceData,
                {
                    groupCode: groupCode,
                    date: fecha,
                    classType: 'Regular',
                    sentBy: window.AppState?.user?.email || 'usuario'
                }
            );
            
            // 4. ✅ CORREGIDO: Agregar ID_Clase a cada registro (PascalCase)
            records.forEach(record => {
                record.ID_Clase = classRecord.id;
            });
            
            // 5. Guardar asistencias
            const saveResult = await AttendanceService.saveAttendance(records);
            
            return {
                success: true,
                classRecord: classRecord,
                attendanceResult: saveResult,
                errors: errors
            };
            
        } catch (error) {
            console.error('ClassControlService: Error en flujo de clase realizada:', error);
            throw error;
        }
    },

    /**
     * 🔧 FIX CRÍTICO: Maneja el flujo completo de reporte de clase cancelada
     */
    async handleClassCancelled(fecha, groupCode, motivoCancelacion, descripcion, asistenteId) {
        debugLog(`ClassControlService: Manejando clase cancelada - ${groupCode}, ${fecha}`);
        
        try {
            // 1. Validar que se pueda reportar
            const validation = await this.validateClassReport(fecha, groupCode);
            if (!validation.valid) {
                throw new Error(validation.error);
            }
            
            if (validation.warning) {
                console.warn('ClassControlService: Advertencia en validación:', validation.warning);
            }
            
            // 2. Crear registro de clase cancelada
            const classRecord = await this.createClassRecord(fecha, groupCode, this.CLASS_STATES.CANCELADA, {
                motivoCancelacion: motivoCancelacion,
                asistenteId: asistenteId
            });
            
            if (!classRecord || !classRecord.id) {
                throw new Error('No se pudo crear el registro de clase cancelada o falta el ID');
            }
            
            // 3. Obtener estudiantes del grupo
            const students = await StudentService.getStudentsByGroup(groupCode);
            
            // 4. ✅ CORREGIDO: Crear registros con ID_Clase directamente
            const cancellationRecords = students.map(student => 
                AttendanceService.createAttendanceRecord(
                    student.id,
                    groupCode,
                    AttendanceService.ATTENDANCE_STATUS.CANCELLED,
                    {
                        date: fecha,
                        classType: AttendanceService.ATTENDANCE_TYPES.REGULAR,
                        justification: motivoCancelacion,
                        description: descripcion,
                        ID_Clase: classRecord.id  // ✅ CORREGIDO: Usar ID_Clase directamente
                    }
                )
            );
            
            // 5. ✅ CORREGIDO: Agregar ID_Clase a cada registro (PascalCase)
            cancellationRecords.forEach(record => {
                record.ID_Clase = classRecord.id;
            });
            
            // 6. Guardar registros de cancelación
            const saveResult = await AttendanceService.saveAttendance(cancellationRecords);
            
            return {
                success: true,
                classRecord: classRecord,
                attendanceResult: saveResult,
                studentsAffected: students.length
            };
            
        } catch (error) {
            console.error('ClassControlService: Error en flujo de clase cancelada:', error);
            throw error;
        }
    },

    /**
     * Obtiene información de una clase existente
     */
    async getClassInfo(fecha, groupCode) {
        debugLog(`ClassControlService: Obteniendo información de clase - ${fecha}, ${groupCode}`);
        
        try {
            const existCheck = await this.checkClassExists(fecha, groupCode);
            
            if (!existCheck.exists) {
                return {
                    exists: false,
                    classId: existCheck.classId
                };
            }
            
            return {
                exists: true,
                classData: existCheck.classData
            };
            
        } catch (error) {
            console.error('ClassControlService: Error obteniendo información de clase:', error);
            throw error;
        }
    }
};

// Hacer disponible globalmente
window.ClassControlService = ClassControlService;

debugLog('class-control-service.js (CORREGIDO CON FIX CRÍTICO PascalCase) cargado correctamente');
