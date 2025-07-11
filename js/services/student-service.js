/**
 * SERVICIO DE ESTUDIANTES - NORMALIZACIÓN DE IDs CORREGIDA
 * =========================================================
 * SOLUCIÓN: Garantizar que todos los IDs sean strings desde el origen
 */

const StudentService = {
    // Cache interno
    _cache: {
        allStudents: [],
        lastUpdate: null,
        cacheTimeout: 5 * 60 * 1000 // 5 minutos
    },

    /**
     * Obtiene todos los estudiantes desde el backend
     */
    async getAllStudents(forceRefresh = false) {
        debugLog('StudentService: Obteniendo todos los estudiantes...');
        
        try {
            // Verificar cache primero
            if (!forceRefresh && this._isCacheValid()) {
                debugLog('StudentService: Usando datos del cache');
                return this._cache.allStudents;
            }

            // Cargar desde backend
            const students = await SheetsAPI.getStudents();
            
            if (!Array.isArray(students)) {
                throw new Error('Respuesta inválida del servidor');
            }

            debugLog(`StudentService: Datos brutos recibidos - ${students.length} estudiantes`);

            // ✅ MEJORA: Log de algunos ejemplos para debugging
            if (students.length > 0 && window.APP_CONFIG?.DEBUG) {
                debugLog('StudentService: Muestra de datos brutos (primeros 3):', 
                    students.slice(0, 3).map(s => ({
                        id: s.id,
                        id_type: typeof s.id,
                        nombre: s.nombre
                    }))
                );
            }

            // Validar y limpiar datos con normalización mejorada
            const validStudents = students
                .map((student, index) => {
                    const normalized = this._normalizeStudent(student, index);
                    if (!normalized) {
                        debugLog(`StudentService: Estudiante ${index} no se pudo normalizar:`, student);
                    }
                    return normalized;
                })
                .filter(student => {
                    if (!student) return false;
                    const isValid = this._isValidStudent(student);
                    if (!isValid) {
                        debugLog(`StudentService: Estudiante rechazado en validación:`, student);
                    }
                    return isValid;
                });

            // ✅ NUEVO: Verificar normalización de IDs después del procesamiento
            const idTypeCheck = validStudents.slice(0, 3).map(s => ({
                id: s.id,
                type: typeof s.id,
                isString: typeof s.id === 'string'
            }));
            debugLog('StudentService: Verificación de tipos de ID después de normalización:', idTypeCheck);

            // Actualizar cache
            this._updateCache(validStudents);
            
            debugLog(`StudentService: ${validStudents.length} estudiantes válidos de ${students.length} totales`);
            return validStudents;

        } catch (error) {
            console.error('StudentService: Error al cargar estudiantes:', error);
            
            // Fallback: intentar cache local o localStorage
            const fallbackStudents = this._getFallbackStudents();
            if (fallbackStudents.length > 0) {
                UIUtils.showWarning('Usando datos de estudiantes guardados localmente');
                return fallbackStudents;
            }
            
            throw error;
        }
    },

    /**
     * Obtiene solo estudiantes activos
     */
    async getActiveStudents(forceRefresh = false) {
        debugLog('StudentService: Obteniendo estudiantes activos...');
        
        try {
            const allStudents = await this.getAllStudents(forceRefresh);
            const activeStudents = allStudents.filter(student => student.activo);
            
            debugLog(`StudentService: ${activeStudents.length} estudiantes activos`);
            return activeStudents;

        } catch (error) {
            console.error('StudentService: Error al filtrar estudiantes activos:', error);
            throw error;
        }
    },

    /**
     * Obtiene estudiantes de un grupo específico
     */
    async getStudentsByGroup(groupCode, forceRefresh = false) {
        debugLog(`StudentService: Obteniendo estudiantes del grupo ${groupCode}`);
        
        try {
            const allStudents = await this.getAllStudents(forceRefresh);
            
            const groupStudents = allStudents.filter(student => {
                return student.activo && (
                    student.grupo_principal === groupCode || 
                    student.grupo_secundario === groupCode
                );
            });

            debugLog(`StudentService: ${groupStudents.length} estudiantes en grupo ${groupCode}`);
            return groupStudents;

        } catch (error) {
            console.error(`StudentService: Error al obtener estudiantes del grupo ${groupCode}:`, error);
            throw error;
        }
    },

    /**
     * ✅ CORREGIDO: Busca un estudiante por ID con normalización
     */
    async getStudentById(studentId, forceRefresh = false) {
        debugLog(`StudentService: Buscando estudiante ${studentId}`);
        
        try {
            const allStudents = await this.getAllStudents(forceRefresh);
            
            // ✅ FIX: Normalizar ID para búsqueda
            const normalizedSearchId = String(studentId);
            const student = allStudents.find(s => String(s.id) === normalizedSearchId);
            
            if (!student) {
                throw new Error(`Estudiante ${studentId} no encontrado`);
            }
            
            return student;

        } catch (error) {
            console.error(`StudentService: Error al buscar estudiante ${studentId}:`, error);
            throw error;
        }
    },

    /**
     * Busca estudiantes por nombre (para reposición individual)
     */
    async searchStudentsByName(searchTerm, forceRefresh = false) {
        debugLog(`StudentService: Buscando estudiantes por nombre: "${searchTerm}"`);
        
        try {
            const allStudents = await this.getActiveStudents(forceRefresh);
            
            if (!searchTerm || searchTerm.trim() === '') {
                return allStudents;
            }
            
            const term = searchTerm.toLowerCase().trim();
            const matchingStudents = allStudents.filter(student => {
                return student.nombre.toLowerCase().includes(term) ||
                       String(student.id).toLowerCase().includes(term); // ✅ FIX: Normalizar ID
            });

            debugLog(`StudentService: ${matchingStudents.length} estudiantes encontrados`);
            return matchingStudents;

        } catch (error) {
            console.error('StudentService: Error en búsqueda de estudiantes:', error);
            throw error;
        }
    },

    /**
     * Obtiene estudiantes disponibles para reposición (todos menos los de un grupo específico)
     */
    async getStudentsForReposition(excludeGroupCode = null, forceRefresh = false) {
        debugLog(`StudentService: Obteniendo estudiantes para reposición (excluir: ${excludeGroupCode})`);
        
        try {
            const allStudents = await this.getActiveStudents(forceRefresh);
            
            if (!excludeGroupCode) {
                return allStudents;
            }
            
            // Excluir estudiantes del grupo especificado
            const availableStudents = allStudents.filter(student => {
                return student.grupo_principal !== excludeGroupCode && 
                       student.grupo_secundario !== excludeGroupCode;
            });

            debugLog(`StudentService: ${availableStudents.length} estudiantes disponibles para reposición`);
            return availableStudents;

        } catch (error) {
            console.error('StudentService: Error al obtener estudiantes para reposición:', error);
            throw error;
        }
    },

    /**
     * Obtiene estadísticas de estudiantes
     */
    async getStudentStats(forceRefresh = false) {
        try {
            const allStudents = await this.getAllStudents(forceRefresh);
            
            const stats = {
                total: allStudents.length,
                active: allStudents.filter(s => s.activo).length,
                inactive: allStudents.filter(s => !s.activo).length,
                withSecondaryGroup: allStudents.filter(s => s.grupo_secundario && s.grupo_secundario.trim() !== '').length,
                byMainGroup: {},
                bySecondaryGroup: {}
            };

            // Estadísticas por grupo principal
            allStudents.forEach(student => {
                if (student.grupo_principal) {
                    const group = student.grupo_principal;
                    stats.byMainGroup[group] = (stats.byMainGroup[group] || 0) + 1;
                }
            });

            // Estadísticas por grupo secundario
            allStudents.forEach(student => {
                if (student.grupo_secundario && student.grupo_secundario.trim() !== '') {
                    const group = student.grupo_secundario;
                    stats.bySecondaryGroup[group] = (stats.bySecondaryGroup[group] || 0) + 1;
                }
            });

            return stats;

        } catch (error) {
            console.error('StudentService: Error al calcular estadísticas:', error);
            throw error;
        }
    },

    /**
     * Valida los datos de un estudiante
     */
    validateStudentData(student) {
        const errors = [];
        
        if (!student) {
            errors.push('Datos de estudiante requeridos');
            return { valid: false, errors };
        }

        if (!student.id || student.id.toString().trim() === '') {
            errors.push('ID de estudiante requerido');
        }

        if (!student.nombre || student.nombre.toString().trim() === '') {
            errors.push('Nombre de estudiante requerido');
        }

        if (!student.grupo_principal || student.grupo_principal.toString().trim() === '') {
            errors.push('Grupo principal requerido');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Fuerza la actualización del cache
     */
    async refresh() {
        debugLog('StudentService: Forzando actualización del cache');
        return this.getAllStudents(true);
    },

    /**
     * ✅ NUEVO: Obtiene el estado del servicio para debugging
     */
    getState() {
        return {
            cacheSize: this._cache.allStudents.length,
            lastUpdate: this._cache.lastUpdate,
            cacheValid: this._isCacheValid(),
            sampleIds: this._cache.allStudents.slice(0, 3).map(s => ({
                id: s.id,
                type: typeof s.id
            }))
        };
    },

    // ===========================================
    // MÉTODOS PRIVADOS CORREGIDOS
    // ===========================================

    /**
     * ✅ CORREGIDO: Normaliza un estudiante desde el backend con IDs consistentes
     */
    _normalizeStudent(rawStudent, index = -1) {
        if (!rawStudent || typeof rawStudent !== 'object') {
            debugLog(`StudentService: rawStudent inválido en índice ${index}:`, rawStudent);
            return null;
        }

        // ✅ DEBUG: Log detallado del estudiante que estamos normalizando
        if (window.APP_CONFIG?.DEBUG && index < 3) {
            debugLog(`StudentService: Normalizando estudiante ${index}:`, {
                id: rawStudent.id,
                id_type: typeof rawStudent.id,
                nombre: rawStudent.nombre
            });
        }

        // ✅ FIX CRÍTICO: Asegurar que el ID sea siempre string
        let normalizedId = '';
        if (rawStudent.id !== null && rawStudent.id !== undefined) {
            normalizedId = String(rawStudent.id).trim();
        }

        // Si no hay ID válido, rechazar el estudiante
        if (!normalizedId) {
            debugLog(`StudentService: Estudiante sin ID válido en índice ${index}:`, rawStudent);
            return null;
        }

        const normalized = {
            id: normalizedId, // ✅ SIEMPRE STRING
            nombre: rawStudent.nombre ? String(rawStudent.nombre).trim() : '',
            grupo_principal: rawStudent.grupo_principal ? String(rawStudent.grupo_principal).trim() : '',
            grupo_secundario: rawStudent.grupo_secundario ? String(rawStudent.grupo_secundario).trim() : '',
            max_clases: parseInt(rawStudent.max_clases) || 40,
            activo: this._normalizeBoolean(rawStudent.activo, true) // Default activo
        };

        // ✅ DEBUG: Log del estudiante normalizado si es uno de los primeros
        if (window.APP_CONFIG?.DEBUG && index < 3) {
            debugLog(`StudentService: Estudiante ${index} normalizado:`, {
                id: normalized.id,
                id_type: typeof normalized.id,
                nombre: normalized.nombre
            });
        }

        return normalized;
    },

    /**
     * Normaliza valores booleanos desde diferentes formatos
     */
    _normalizeBoolean(value, defaultValue = false) {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }
        
        const str = value.toString().toLowerCase().trim();
        return str === 'true' || str === '1' || str === 'x' || str === 'yes';
    },

    /**
     * ✅ MEJORADO: Valida que un estudiante tenga la estructura mínima requerida
     */
    _isValidStudent(student) {
        if (!student) return false;
        
        const validation = this.validateStudentData(student);
        
        if (!validation.valid) {
            debugLog(`StudentService: Estudiante inválido:`, validation.errors, student);
            return false;
        }

        // ✅ NUEVA VALIDACIÓN: Verificar que el ID sea string
        if (typeof student.id !== 'string') {
            debugLog(`StudentService: ID no es string:`, {
                id: student.id,
                type: typeof student.id,
                nombre: student.nombre
            });
            return false;
        }

        return true;
    },

    /**
     * Verifica si el cache es válido
     */
    _isCacheValid() {
        if (!this._cache.lastUpdate || this._cache.allStudents.length === 0) {
            return false;
        }
        
        const now = Date.now();
        return (now - this._cache.lastUpdate) < this._cache.cacheTimeout;
    },

    /**
     * ✅ CORREGIDO: Actualiza el cache interno con normalización
     */
    _updateCache(students) {
        // ✅ NUEVO: Verificar que todos los IDs sean strings antes de guardar en cache
        const normalizedStudents = students.map(student => ({
            ...student,
            id: String(student.id) // Doble verificación
        }));

        this._cache.allStudents = normalizedStudents || [];
        this._cache.lastUpdate = Date.now();
        
        // También guardar en localStorage como backup
        StorageUtils.save('cached_students', normalizedStudents);

        debugLog(`StudentService: Cache actualizado con ${normalizedStudents.length} estudiantes`);
    },

    /**
     * ✅ CORREGIDO: Obtiene datos de fallback con normalización
     */
    _getFallbackStudents() {
        // Primero intentar cache interno
        if (this._cache.allStudents.length > 0) {
            return this._cache.allStudents;
        }
        
        // Luego intentar localStorage
        const cachedStudents = StorageUtils.get('cached_students', []);
        if (cachedStudents.length > 0) {
            // ✅ FIX: Normalizar IDs del localStorage también
            const normalizedCached = cachedStudents.map(student => ({
                ...student,
                id: String(student.id)
            }));
            
            this._cache.allStudents = normalizedCached;
            return normalizedCached;
        }
        
        return [];
    },

    /**
     * Limpia el cache
     */
    _clearCache() {
        this._cache.allStudents = [];
        this._cache.lastUpdate = null;
    }
};

// Hacer disponible globalmente
window.StudentService = StudentService;

debugLog('student-service.js CORREGIDO - Normalización consistente de IDs como strings');
