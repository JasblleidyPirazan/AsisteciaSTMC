/**
 * SERVICIO DE GRUPOS - VERSIÓN CORREGIDA
 * =======================================
 * Corrección de normalización para manejar mejor los datos del backend
 */

const GroupService = {
    // Cache interno
    _cache: {
        allGroups: [],
        lastUpdate: null,
        cacheTimeout: 5 * 60 * 1000 // 5 minutos
    },

    /**
     * Obtiene todos los grupos desde el backend
     */
    async getAllGroups(forceRefresh = false) {
        debugLog('GroupService: Obteniendo todos los grupos...');
        
        try {
            // Verificar cache primero
            if (!forceRefresh && this._isCacheValid()) {
                debugLog('GroupService: Usando datos del cache');
                return this._cache.allGroups;
            }

            // Cargar desde backend
            const groups = await SheetsAPI.getGroups();
            
            if (!Array.isArray(groups)) {
                throw new Error('Respuesta inválida del servidor');
            }

            debugLog(`GroupService: Datos brutos recibidos - ${groups.length} grupos`);
            
            // DEBUG: Mostrar algunos ejemplos de datos brutos
            if (groups.length > 0) {
                debugLog('GroupService: Muestra de datos brutos:', groups.slice(0, 2));
            }

            // Validar y limpiar datos
            const validGroups = groups
                .map((group, index) => {
                    const normalized = this._normalizeGroup(group, index);
                    if (!normalized) {
                        debugLog(`GroupService: Grupo ${index} no se pudo normalizar:`, group);
                    }
                    return normalized;
                })
                .filter(group => {
                    if (!group) return false;
                    const isValid = this._isValidGroup(group);
                    if (!isValid) {
                        debugLog(`GroupService: Grupo rechazado en validación:`, group);
                    }
                    return isValid;
                });

            // Actualizar cache
            this._updateCache(validGroups);
            
            debugLog(`GroupService: ${validGroups.length} grupos válidos de ${groups.length} totales`);
            return validGroups;

        } catch (error) {
            console.error('GroupService: Error al cargar grupos:', error);
            
            // Fallback: intentar cache local o localStorage
            const fallbackGroups = this._getFallbackGroups();
            if (fallbackGroups.length > 0) {
                UIUtils.showWarning('Usando datos guardados localmente');
                return fallbackGroups;
            }
            
            throw error;
        }
    },

    /**
     * Obtiene grupos activos del día especificado
     */
    async getGroupsByDay(dayName, forceRefresh = false) {
        debugLog(`GroupService: Obteniendo grupos para ${dayName}`);
        
        try {
            const allGroups = await this.getAllGroups(forceRefresh);
            
            // Filtrar por día usando las columnas booleanas
            const dayGroups = allGroups.filter(group => {
                return this._isGroupActiveOnDay(group, dayName);
            });

            debugLog(`GroupService: ${dayGroups.length} grupos encontrados para ${dayName}`);
            return dayGroups;

        } catch (error) {
            console.error(`GroupService: Error al filtrar grupos por día ${dayName}:`, error);
            throw error;
        }
    },

    /**
     * Obtiene grupos del día actual
     */
    async getTodayGroups(forceRefresh = false) {
        const today = DateUtils.getCurrentDay();
        return this.getGroupsByDay(today, forceRefresh);
    },

    /**
     * Busca un grupo por código
     */
    async getGroupByCode(codigo, forceRefresh = false) {
        debugLog(`GroupService: Buscando grupo ${codigo}`);
        
        try {
            const allGroups = await this.getAllGroups(forceRefresh);
            const group = allGroups.find(g => g.codigo === codigo);
            
            if (!group) {
                throw new Error(`Grupo ${codigo} no encontrado`);
            }
            
            return group;

        } catch (error) {
            console.error(`GroupService: Error al buscar grupo ${codigo}:`, error);
            throw error;
        }
    },

    /**
     * Obtiene estadísticas de grupos
     */
    async getGroupStats(forceRefresh = false) {
        try {
            const allGroups = await this.getAllGroups(forceRefresh);
            
            const stats = {
                total: allGroups.length,
                active: allGroups.filter(g => g.activo).length,
                byLevel: {},
                byProfessor: {},
                byDay: {}
            };

            // Estadísticas por nivel de bola
            allGroups.forEach(group => {
                const level = group.bola || 'Sin nivel';
                stats.byLevel[level] = (stats.byLevel[level] || 0) + 1;
            });

            // Estadísticas por profesor
            allGroups.forEach(group => {
                const prof = group.profe || 'Sin profesor';
                stats.byProfessor[prof] = (stats.byProfessor[prof] || 0) + 1;
            });

            // Estadísticas por día
            const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
            days.forEach(day => {
                stats.byDay[day] = allGroups.filter(group => 
                    this._isGroupActiveOnDay(group, day)
                ).length;
            });

            return stats;

        } catch (error) {
            console.error('GroupService: Error al calcular estadísticas:', error);
            throw error;
        }
    },

    /**
     * Fuerza la actualización del cache
     */
    async refresh() {
        debugLog('GroupService: Forzando actualización del cache');
        return this.getAllGroups(true);
    },

    /**
     * Obtiene el estado del servicio para debugging
     */
    getState() {
        return {
            cacheSize: this._cache.allGroups.length,
            lastUpdate: this._cache.lastUpdate,
            cacheValid: this._isCacheValid()
        };
    },

    // ===========================================
    // MÉTODOS PRIVADOS MEJORADOS
    // ===========================================

    /**
     * Normaliza un grupo desde el backend - VERSIÓN MEJORADA
     */
    _normalizeGroup(rawGroup, index = -1) {
        if (!rawGroup || typeof rawGroup !== 'object') {
            debugLog(`GroupService: rawGroup inválido en índice ${index}:`, rawGroup);
            return null;
        }

        // DEBUG: Log detallado del grupo que estamos normalizando
        if (window.APP_CONFIG?.DEBUG && index < 3) {
            debugLog(`GroupService: Normalizando grupo ${index}:`, rawGroup);
        }

        // MEJORADO: Mejor extracción del código del grupo
        let codigo = '';
        
        // Intentar diferentes campos para el código
        if (rawGroup.codigo && rawGroup.codigo.toString().trim() !== '') {
            codigo = rawGroup.codigo.toString().trim();
        } else if (rawGroup.código && rawGroup.código.toString().trim() !== '') {
            codigo = rawGroup.código.toString().trim();
        } else if (rawGroup.Codigo && rawGroup.Codigo.toString().trim() !== '') {
            codigo = rawGroup.Codigo.toString().trim();
        } else if (rawGroup.Código && rawGroup.Código.toString().trim() !== '') {
            codigo = rawGroup.Código.toString().trim();
        } else {
            // Si no hay código válido, intentar generar uno o rechazar
            debugLog(`GroupService: Grupo sin código válido en índice ${index}:`, rawGroup);
            return null;
        }

        // MEJORADO: Mejor extracción de otros campos críticos
        let hora = '';
        if (rawGroup.hora && rawGroup.hora.toString().trim() !== '') {
            hora = rawGroup.hora.toString().trim();
        } else if (rawGroup.Hora && rawGroup.Hora.toString().trim() !== '') {
            hora = rawGroup.Hora.toString().trim();
        }

        let profe = '';
        if (rawGroup.profe && rawGroup.profe.toString().trim() !== '') {
            profe = rawGroup.profe.toString().trim();
        } else if (rawGroup.Profe && rawGroup.Profe.toString().trim() !== '') {
            profe = rawGroup.Profe.toString().trim();
        } else if (rawGroup.profesor && rawGroup.profesor.toString().trim() !== '') {
            profe = rawGroup.profesor.toString().trim();
        } else if (rawGroup.Profesor && rawGroup.Profesor.toString().trim() !== '') {
            profe = rawGroup.Profesor.toString().trim();
        }

        // Si falta información crítica, rechazar el grupo
        if (!codigo || !hora || !profe) {
            debugLog(`GroupService: Grupo ${index} rechazado - faltan campos críticos:`, {
                codigo: codigo || '(vacío)',
                hora: hora || '(vacío)',
                profe: profe || '(vacío)',
                rawGroup: rawGroup
            });
            return null;
        }

        const normalized = {
            codigo: codigo,
            dias: this._extractStringField(rawGroup, ['dias', 'Dias']),
            lunes: this._normalizeBoolean(rawGroup.lunes || rawGroup.Lunes),
            martes: this._normalizeBoolean(rawGroup.martes || rawGroup.Martes),
            miercoles: this._normalizeBoolean(rawGroup.miercoles || rawGroup.Miercoles || rawGroup.miércoles || rawGroup.Miércoles),
            jueves: this._normalizeBoolean(rawGroup.jueves || rawGroup.Jueves),
            viernes: this._normalizeBoolean(rawGroup.viernes || rawGroup.Viernes),
            sabado: this._normalizeBoolean(rawGroup.sabado || rawGroup.Sabado || rawGroup.sábado || rawGroup.Sábado),
            domingo: this._normalizeBoolean(rawGroup.domingo || rawGroup.Domingo),
            hora: hora,
            profe: profe,
            cancha: this._extractStringField(rawGroup, ['cancha', 'Cancha']) || '',
            frecuencia_semanal: this._extractIntField(rawGroup, ['frecuencia_semanal', 'frecuenciaSemanal', 'Frecuencia_Semanal']) || 0,
            bola: this._extractStringField(rawGroup, ['bola', 'Bola', 'nivel', 'Nivel']) || 'Verde',
            descriptor: this._extractStringField(rawGroup, ['descriptor', 'Descriptor', 'descripcion', 'Descripcion']) || '',
            activo: this._normalizeBoolean(rawGroup.activo || rawGroup.Activo, true) // Default activo
        };

        // DEBUG: Log del grupo normalizado si es uno de los primeros
        if (window.APP_CONFIG?.DEBUG && index < 3) {
            debugLog(`GroupService: Grupo ${index} normalizado:`, normalized);
        }

        return normalized;
    },

    /**
     * NUEVO: Extrae un campo string probando diferentes variaciones
     */
    _extractStringField(obj, fieldNames) {
        for (const fieldName of fieldNames) {
            if (obj[fieldName] && obj[fieldName].toString().trim() !== '') {
                return obj[fieldName].toString().trim();
            }
        }
        return '';
    },

    /**
     * NUEVO: Extrae un campo entero probando diferentes variaciones
     */
    _extractIntField(obj, fieldNames) {
        for (const fieldName of fieldNames) {
            if (obj[fieldName] !== null && obj[fieldName] !== undefined) {
                const parsed = parseInt(obj[fieldName]);
                if (!isNaN(parsed)) {
                    return parsed;
                }
            }
        }
        return 0;
    },

    /**
     * Normaliza valores booleanos desde diferentes formatos - MEJORADA
     */
    _normalizeBoolean(value, defaultValue = false) {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }
        
        // Si ya es booleano, devolverlo tal como está
        if (typeof value === 'boolean') {
            return value;
        }
        
        const str = value.toString().toLowerCase().trim();
        
        // Valores que consideramos "true"
        const truthyValues = ['true', '1', 'x', 'yes', 'si', 'sí', 'y', 'on', 'activo'];
        
        return truthyValues.includes(str);
    },

    /**
     * Valida que un grupo tenga la estructura mínima requerida - MEJORADA
     */
    _isValidGroup(group) {
        if (!group) {
            return false;
        }
        
        // Campos absolutamente requeridos
        const required = ['codigo', 'hora', 'profe'];
        const hasRequired = required.every(field => {
            const value = group[field];
            const isValid = value && value.toString().trim() !== '';
            
            if (!isValid) {
                debugLog(`GroupService: Grupo inválido - campo '${field}' faltante o vacío:`, {
                    campo: field,
                    valor: value,
                    grupo: group.codigo || '(sin código)'
                });
            }
            
            return isValid;
        });
        
        if (!hasRequired) {
            return false;
        }

        // Validación adicional: debe tener al menos un día activo O una descripción de días
        const hasDayInfo = this._hasValidDayInfo(group);
        
        if (!hasDayInfo) {
            debugLog(`GroupService: Grupo inválido - sin información de días válida:`, {
                codigo: group.codigo,
                dias: group.dias,
                diasBoleanos: {
                    lunes: group.lunes,
                    martes: group.martes,
                    miercoles: group.miercoles,
                    jueves: group.jueves,
                    viernes: group.viernes,
                    sabado: group.sabado,
                    domingo: group.domingo
                }
            });
            return false;
        }

        return true;
    },

    /**
     * NUEVO: Verifica que el grupo tenga información válida de días
     */
    _hasValidDayInfo(group) {
        // Verificar si tiene columnas booleanas de días activas
        const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
        const hasActiveDays = days.some(day => group[day] === true);
        
        if (hasActiveDays) {
            return true;
        }
        
        // Verificar si tiene información en la columna "dias"
        if (group.dias && group.dias.toString().trim() !== '') {
            return true;
        }
        
        return false;
    },

    /**
     * Verifica si un grupo está activo en un día específico
     */
    _isGroupActiveOnDay(group, dayName) {
        if (!group || !group.activo) {
            return false;
        }

        const normalizedDay = dayName.toLowerCase().trim();
        
        // Verificar usando columnas booleanas (método preferido)
        if (group.hasOwnProperty(normalizedDay)) {
            return group[normalizedDay] === true;
        }
        
        // Fallback: verificar columna "dias" si existe
        if (group.dias) {
            const groupDays = group.dias.toLowerCase()
                .split(',')
                .map(d => d.trim())
                .map(d => d.replace('é', 'e').replace('á', 'a')); // Normalizar tildes
            
            return groupDays.includes(normalizedDay);
        }
        
        return false;
    },

    /**
     * Verifica si el cache es válido
     */
    _isCacheValid() {
        if (!this._cache.lastUpdate || this._cache.allGroups.length === 0) {
            return false;
        }
        
        const now = Date.now();
        return (now - this._cache.lastUpdate) < this._cache.cacheTimeout;
    },

    /**
     * Actualiza el cache interno
     */
    _updateCache(groups) {
        this._cache.allGroups = groups || [];
        this._cache.lastUpdate = Date.now();
        
        // También guardar en localStorage como backup
        StorageUtils.save('cached_groups', groups);
    },

    /**
     * Obtiene datos de fallback en caso de error
     */
    _getFallbackGroups() {
        // Primero intentar cache interno
        if (this._cache.allGroups.length > 0) {
            return this._cache.allGroups;
        }
        
        // Luego intentar localStorage
        const cachedGroups = StorageUtils.get('cached_groups', []);
        if (cachedGroups.length > 0) {
            this._cache.allGroups = cachedGroups;
            return cachedGroups;
        }
        
        return [];
    },

    /**
     * Limpia el cache
     */
    _clearCache() {
        this._cache.allGroups = [];
        this._cache.lastUpdate = null;
    }
};

// Hacer disponible globalmente
window.GroupService = GroupService;

debugLog('group-service.js (versión corregida) cargado correctamente');
