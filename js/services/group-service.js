/**
 * SERVICIO DE GRUPOS
 * ==================
 * Maneja toda la lógica relacionada con grupos de tenis
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

            // Validar y limpiar datos
            const validGroups = groups
                .map(group => this._normalizeGroup(group))
                .filter(group => this._isValidGroup(group));

            // Actualizar cache
            this._updateCache(validGroups);
            
            debugLog(`GroupService: ${validGroups.length} grupos cargados`);
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

    // ===========================================
    // MÉTODOS PRIVADOS
    // ===========================================

    /**
     * Normaliza un grupo desde el backend
     */
    _normalizeGroup(rawGroup) {
        if (!rawGroup || typeof rawGroup !== 'object') {
            return null;
        }

        return {
            codigo: rawGroup.codigo || rawGroup.código || '',
            dias: rawGroup.dias || '',
            lunes: this._normalizeBoolean(rawGroup.lunes),
            martes: this._normalizeBoolean(rawGroup.martes),
            miercoles: this._normalizeBoolean(rawGroup.miercoles),
            jueves: this._normalizeBoolean(rawGroup.jueves),
            viernes: this._normalizeBoolean(rawGroup.viernes),
            sabado: this._normalizeBoolean(rawGroup.sabado),
            domingo: this._normalizeBoolean(rawGroup.domingo),
            hora: rawGroup.hora || '',
            profe: rawGroup.profe || '',
            cancha: rawGroup.cancha || '',
            frecuencia_semanal: parseInt(rawGroup.frecuencia_semanal) || 0,
            bola: rawGroup.bola || 'Verde',
            descriptor: rawGroup.descriptor || '',
            activo: this._normalizeBoolean(rawGroup.activo, true) // Default activo
        };
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
     * Valida que un grupo tenga la estructura mínima requerida
     */
    _isValidGroup(group) {
        if (!group) return false;
        
        const required = ['codigo', 'hora', 'profe'];
        const hasRequired = required.every(field => 
            group[field] && group[field].toString().trim() !== ''
        );
        
        if (!hasRequired) {
            debugLog(`GroupService: Grupo inválido - faltan campos requeridos:`, group);
            return false;
        }

        return true;
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

debugLog('group-service.js cargado correctamente');
