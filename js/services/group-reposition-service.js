/**
 * SERVICIO DE REPOSICIÓN GRUPAL
 * ==============================
 * Maneja toda la lógica de reposiciones grupales/clases especiales
 */

const GroupRepositionService = {
    /**
     * Obtiene datos necesarios para el formulario
     */
    async getFormData() {
        debugLog('GroupRepositionService: Cargando datos del formulario...');
        
        try {
            const [professors, students, assistants] = await Promise.all([
                SheetsAPI.getProfessors(),
                StudentService.getActiveStudents(),
                AssistantService.getActiveAssistants()
            ]);
            
            return {
                professors: professors.filter(p => p.activo),
                students: students,
                assistants: assistants
            };
            
        } catch (error) {
            console.error('GroupRepositionService: Error cargando datos:', error);
            throw error;
        }
    },

    /**
     * Valida los datos del formulario
     */
    validateFormData(formData) {
        const errors = [];
        
        if (!formData.fecha || !ValidationUtils.isValidDate(formData.fecha)) {
            errors.push('Fecha es requerida y debe ser válida');
        }
        
        if (!formData.hora || !this._isValidTimeFormat(formData.hora)) {
            errors.push('Hora debe tener formato HH:MM-HH:MM (ej: 15:00-16:30)');
        }
        
        if (!formData.profesorId) {
            errors.push('Profesor es requerido');
        }
        
        if (!formData.cancha || formData.cancha < 1 || formData.cancha > 5) {
            errors.push('Cancha debe ser entre 1 y 5');
        }
        
        if (!formData.estudiantesSeleccionados || formData.estudiantesSeleccionados.length === 0) {
            errors.push('Debe seleccionar al menos un estudiante');
        }
        
        if (!formData.numeroReposiciones || formData.numeroReposiciones < 1 || formData.numeroReposiciones > 5) {
            errors.push('Número de reposiciones debe ser entre 1 y 5');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Crea el ID de la clase especial
     */
    generateClassId(fecha, hora, cancha) {
        const fechaFormat = fecha;
        const horaFormat = hora.replace(/[:-]/g, '-').replace(/\s+/g, '');
        return `REP_${fechaFormat}_${horaFormat}_C${cancha}`;
    },

    /**
     * Crea el registro principal de reposición grupal
     */
    createRepositionRecord(formData, classId) {
        const estudiantesIds = formData.estudiantesSeleccionados.map(s => s.id).join(',');
        
        return {
            ID: DataUtils.generateId('REP'),
            Fecha: formData.fecha,
            Estudiantes_IDs: estudiantesIds,
            Tipo: 'Grupal',
            Profesor: formData.profesorNombre,
            Asistente_ID: formData.asistenteId || '',
            Descripcion: `Reposición grupal - ${formData.hora} - Cancha ${formData.cancha} - ${formData.estudiantesSeleccionados.length} estudiantes`,
            Creado_por: window.AppState.user?.email || 'usuario',
            Timestamp: DateUtils.getCurrentTimestamp()
        };
    },

    /**
     * Crea registros de asistencia múltiples según número de reposiciones
     */
    createAttendanceRecords(formData, classId) {
        const records = [];
        const numeroReposiciones = parseInt(formData.numeroReposiciones);
        
        // Para cada estudiante, crear tantos registros como reposiciones
        formData.estudiantesSeleccionados.forEach(student => {
            for (let i = 0; i < numeroReposiciones; i++) {
                records.push(AttendanceService.createAttendanceRecord(
                    student.id,
                    classId, // Usar el ID de clase como grupo
                    AttendanceService.ATTENDANCE_STATUS.PRESENT,
                    {
                        date: formData.fecha,
                        classType: 'Reposicion Grupal',
                        idClase: classId,
                        description: `Reposición grupal ${i + 1}/${numeroReposiciones} - Grupo original: ${student.grupo_principal}`,
                        sentBy: window.AppState.user?.email || 'usuario'
                    }
                ));
            }
        });
        
        return records;
    },

    /**
     * Guarda la reposición grupal completa
     */
    async saveGroupReposition(formData) {
        debugLog('GroupRepositionService: Guardando reposición grupal...');
        
        try {
            // Validar datos
            const validation = this.validateFormData(formData);
            if (!validation.valid) {
                throw new Error(`Datos inválidos: ${validation.errors.join(', ')}`);
            }
            
            // Generar ID de clase
            const classId = this.generateClassId(formData.fecha, formData.hora, formData.cancha);
            
            // Crear registro principal
            const repositionRecord = this.createRepositionRecord(formData, classId);
            
            // Crear registros de asistencia múltiples
            const attendanceRecords = this.createAttendanceRecords(formData, classId);
            
            // Guardar en backend
            const result = await SheetsAPI.saveGroupReposition({
                repositionRecord,
                attendanceRecords
            });
            
            debugLog(`GroupRepositionService: ${attendanceRecords.length} registros de asistencia creados`);
            
            return {
                success: true,
                classId: classId,
                studentsCount: formData.estudiantesSeleccionados.length,
                totalAttendanceRecords: attendanceRecords.length,
                result: result
            };
            
        } catch (error) {
            console.error('GroupRepositionService: Error guardando reposición grupal:', error);
            throw error;
        }
    },

    /**
     * Valida formato de hora
     */
    _isValidTimeFormat(hora) {
        // Formato esperado: HH:MM-HH:MM
        const regex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]-([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
        return regex.test(hora);
    }
};

// Hacer disponible globalmente
window.GroupRepositionService = GroupRepositionService;

debugLog('group-reposition-service.js cargado correctamente');
