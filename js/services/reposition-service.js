/**
 * SERVICIO DE REPOSICIÓN INDIVIDUAL
 * ==================================
 * Maneja la lógica de reposiciones individuales dentro de una clase
 */

const RepositionService = {
    /**
     * Obtiene todos los estudiantes disponibles para reposición
     */
    async getAvailableStudents() {
        debugLog('RepositionService: Obteniendo estudiantes disponibles para reposición');
        
        try {
            // Obtener todos los estudiantes activos
            const allStudents = await StudentService.getActiveStudents();
            
            debugLog(`RepositionService: ${allStudents.length} estudiantes disponibles`);
            return allStudents;
            
        } catch (error) {
            console.error('RepositionService: Error al obtener estudiantes disponibles:', error);
            throw error;
        }
    },

    /**
     * Busca estudiantes por nombre
     */
    searchStudentsByName(allStudents, searchTerm) {
        debugLog(`RepositionService: Buscando estudiantes por "${searchTerm}"`);
        
        if (!searchTerm || searchTerm.trim() === '') {
            return allStudents;
        }
        
        const term = searchTerm.toLowerCase().trim();
        const matchingStudents = allStudents.filter(student => {
            return student.nombre.toLowerCase().includes(term);
        });
        
        debugLog(`RepositionService: ${matchingStudents.length} estudiantes encontrados`);
        return matchingStudents;
    },

    /**
     * Valida la selección de estudiantes para reposición
     */
    validateSelection(selectedStudents) {
        const errors = [];
        
        if (!Array.isArray(selectedStudents)) {
            errors.push('Lista de estudiantes inválida');
            return { valid: false, errors };
        }
        
        if (selectedStudents.length === 0) {
            errors.push('Debe seleccionar al menos un estudiante');
            return { valid: false, errors };
        }
        
        // Validar duplicados por ID
        const uniqueIds = new Set();
        const duplicates = [];
        
        selectedStudents.forEach(student => {
            if (uniqueIds.has(student.id)) {
                duplicates.push(student.id);
            } else {
                uniqueIds.add(student.id);
            }
        });
        
        if (duplicates.length > 0) {
            errors.push(`Estudiantes duplicados: ${duplicates.join(', ')}`);
        }
        
        // Validar que cada estudiante tenga los campos necesarios
        selectedStudents.forEach(student => {
            if (!student.id || !student.nombre) {
                errors.push(`Estudiante con datos incompletos: ${student.id || 'ID faltante'}`);
            }
        });
        
        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Crea registros de asistencia para reposición individual
     */
    createRepositionRecords(selectedStudents, classData) {
        debugLog('RepositionService: Creando registros de reposición individual');
        
        try {
            const {
                groupCode,
                classId,
                selectedDate,
                sentBy
            } = classData;
            
            // Validar datos de clase
            if (!groupCode || !classId || !selectedDate) {
                throw new Error('Datos de clase incompletos para reposición');
            }
            
            // Crear registros de asistencia para cada estudiante seleccionado
            const repositionRecords = selectedStudents.map(student => {
                return AttendanceService.createAttendanceRecord(
                    student.id,
                    groupCode, // Mismo grupo de la clase actual
                    AttendanceService.ATTENDANCE_STATUS.PRESENT, // Por defecto presente
                    {
                        date: selectedDate, // Misma fecha de la clase
                        classType: 'Reposicion Individual', // Tipo específico
                        idClase: classId, // Mismo ID de clase
                        description: `Reposición individual - Grupo original: ${student.grupo_principal}`,
                        sentBy: sentBy
                    }
                );
            });
            
            debugLog(`RepositionService: ${repositionRecords.length} registros de reposición creados`);
            return repositionRecords;
            
        } catch (error) {
            console.error('RepositionService: Error creando registros de reposición:', error);
            throw error;
        }
    },

    /**
     * Guarda la reposición individual completa
     */
    async saveRepositionIndividual(selectedStudents, classData) {
        debugLog('RepositionService: Guardando reposición individual completa');
        
        try {
            // Validar selección
            const validation = this.validateSelection(selectedStudents);
            if (!validation.valid) {
                throw new Error(`Selección inválida: ${validation.errors.join(', ')}`);
            }
            
            // Crear registros
            const repositionRecords = this.createRepositionRecords(selectedStudents, classData);
            
            // Guardar usando AttendanceService
            const saveResult = await AttendanceService.saveAttendance(repositionRecords, {
                type: 'reposition_individual',
                groupCode: classData.groupCode,
                date: classData.selectedDate
            });
            
            debugLog('RepositionService: Reposición individual guardada exitosamente');
            
            return {
                success: true,
                studentsCount: selectedStudents.length,
                saveResult: saveResult,
                message: `Reposición individual guardada para ${selectedStudents.length} estudiante(s)`
            };
            
        } catch (error) {
            console.error('RepositionService: Error guardando reposición individual:', error);
            throw error;
        }
    },

    /**
     * Obtiene estadísticas de reposición individual
     */
    getRepositionStats(selectedStudents) {
        if (!Array.isArray(selectedStudents) || selectedStudents.length === 0) {
            return {
                total: 0,
                byGroup: {},
                uniqueGroups: 0
            };
        }
        
        const stats = {
            total: selectedStudents.length,
            byGroup: {},
            uniqueGroups: 0
        };
        
        // Contar por grupo principal
        selectedStudents.forEach(student => {
            const group = student.grupo_principal || 'Sin grupo';
            stats.byGroup[group] = (stats.byGroup[group] || 0) + 1;
        });
        
        stats.uniqueGroups = Object.keys(stats.byGroup).length;
        
        return stats;
    }
};

// Hacer disponible globalmente
window.RepositionService = RepositionService;

debugLog('reposition-service.js cargado correctamente');
