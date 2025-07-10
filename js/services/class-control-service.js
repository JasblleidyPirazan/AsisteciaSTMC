/**
 * SERVICIO DE CONTROL DE CLASES
 * ==============================
 * Maneja la lógica de control de clases y validación de duplicados
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
     * Verifica si una clase ya fue reportada
     */
    async checkClassExists(fecha, groupCode) {
        debugLog(`ClassControlService: Verificando si clase existe - ${fecha}, ${groupCode}`);
        
        try {
            // Primero necesitamos obtener los datos del grupo para tener la hora
            const groupData = await GroupService.getGroupByCode(groupCode);
            
            // Verificar en el backend
            const result = await SheetsAPI.checkClassExists(fecha, groupCode, groupData.hora);
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            debugLog(`ClassControlService: Resultado verificación:`, result);
            return result;
            
        } catch (error) {
            console.error('ClassControlService: Error verificando clase existente:', error);
            throw error;
        }
    },

    /**
     * Crea un registro de clase
     */
    async createClassRecord(fecha, groupCode, estado, options = {}) {
        debugLog(`ClassControlService: Creando registro de clase - ${fecha}, ${groupCode}, ${estado}`);
        
        try {
            // Validar estado
            if (!Object.values(this.CLASS_STATES).includes(estado)) {
                throw new Error(`Estado de clase inválido: ${estado}`);
            }
            
            // Obtener datos del grupo para la hora
            const groupData = await GroupService.getGroupByCode(groupCode);
            
            // Verificar que no exista
            const existCheck = await this.checkClassExists(fecha, groupCode);
            if (existCheck.exists) {
                throw new Error(`La clase ${groupCode} del ${fecha} ya fue reportada como "${existCheck.classData.estado}"`);
            }
            
            // Crear registro en backend
            const result = await SheetsAPI.createClassRecord({
                fecha: fecha,
                grupo_codigo: groupCode,
                hora_grupo: groupData.hora,
                estado: estado,
                motivo_cancelacion: options.motivoCancelacion || '',
                asistente_id: options.asistenteId || '',
                creado_por: options.creadoPor || window.AppState.user?.email || 'usuario'
            });
            
            if (!result.success) {
                throw new Error(result.error);
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
                await GroupService.getGroupByCode(groupCode);
            } catch (error) {
                return {
                    valid: false,
                    error: `Grupo ${groupCode} no encontrado`
                };
            }
            
            // Verificar que no esté ya reportada
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
            console.error('ClassControlService: Error validando reporte de clase:', error);
            return {
                valid: false,
                error: error.message
            };
        }
    },

    /**
     * Prepara los datos de asistencia con ID de clase
     */
    prepareAttendanceWithClassId(attendanceData, classId) {
        debugLog(`ClassControlService: Preparando asistencia con ID de clase: ${classId}`);
        
        return Object.values(attendanceData).map(record => ({
            ...record,
            id_clase: classId
        }));
    },

    /**
     * Maneja el flujo completo de reporte de clase realizada
     */
    async handleClassRealized(fecha, groupCode, attendanceData, asistenteId) {
        debugLog(`ClassControlService: Manejando clase realizada - ${groupCode}, ${fecha}`);
        
        try {
            // 1. Validar que se pueda reportar
            const validation = await this.validateClassReport(fecha, groupCode);
            if (!validation.valid) {
                throw new Error(validation.error);
            }
            
            // 2. Crear registro de clase
            const classRecord = await this.createClassRecord(fecha, groupCode, this.CLASS_STATES.REALIZADA, {
                asistenteId: asistenteId
            });
            
            // 3. Preparar datos de asistencia con ID de clase
            const attendanceWithClassId = this.prepareAttendanceWithClassId(attendanceData, classRecord.id);
            
            // 4. Crear registros de asistencia formateados
            const { records, errors } = AttendanceService.createGroupAttendanceRecords(
                attendanceData,
                {
                    groupCode: groupCode,
                    date: fecha,
                    classType: 'Regular',
                    sentBy: window.AppState.user?.email || 'usuario'
                }
            );
            
            // 5. Agregar ID de clase a cada registro
            records.forEach(record => {
                record.id_clase = classRecord.id;
            });
            
            // 6. Guardar asistencias
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
     * Maneja el flujo completo de reporte de clase cancelada
     */
    async handleClassCancelled(fecha, groupCode, motivoCancelacion, descripcion, asistenteId) {
        debugLog(`ClassControlService: Manejando clase cancelada - ${groupCode}, ${fecha}`);
        
        try {
            // 1. Validar que se pueda reportar
            const validation = await this.validateClassReport(fecha, groupCode);
            if (!validation.valid) {
                throw new Error(validation.error);
            }
            
            // 2. Crear registro de clase cancelada
            const classRecord = await this.createClassRecord(fecha, groupCode, this.CLASS_STATES.CANCELADA, {
                motivoCancelacion: motivoCancelacion,
                asistenteId: asistenteId
            });
            
            // 3. Obtener estudiantes del grupo
            const students = await StudentService.getStudentsByGroup(groupCode);
            
            // 4. Crear registros de asistencia cancelada para cada estudiante
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
                        idClase: classRecord.id // Agregar ID de clase
                    }
                )
            );
            
            // 5. Agregar ID de clase a cada registro
            cancellationRecords.forEach(record => {
                record.id_clase = classRecord.id;
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

debugLog('class-control-service.js cargado correctamente');
