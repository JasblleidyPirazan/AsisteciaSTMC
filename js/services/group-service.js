/**
 * SERVICIO DE GRUPOS - VERSIÓN CORREGIDA PARA HEADERS CON CARACTERES ESPECIALES
 * =============================================================================
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
            
            // DEBUG: Mostrar las claves reales del primer grupo
            if (groups.length > 0) {
                console.log('🔍 DEBUG: Claves del primer grupo:', Object.keys(groups[0]));
                console.log('🔍 DEBUG: Primer grupo completo:', groups[0]);
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
                .filter(group => group !== null && group !== undefined);

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
     * 🔧 CORREGIDO: Normaliza un grupo manejando headers con caracteres especiales
     */
    _normalizeGroup(rawGroup, index = -1) {
        if (!rawGroup || typeof rawGroup !== 'object') {
            debugLog(`GroupService: rawGroup inválido en índice ${index}:`, rawGroup);
            return null;
        }

        // 🔧 FIX: Función helper para buscar campos con diferentes variaciones
        const findField = (obj, variations) => {
            for (const key of Object.keys(obj)) {
                // Normalizar la clave quitando caracteres especiales y espacios
                const normalizedKey = key.toLowerCase()
                    .replace(/[áàäâ]/g, 'a')
                    .replace(/[éèëê]/g, 'e')
                    .replace(/[íìïî]/g, 'i')
                    .replace(/[óòöô]/g, 'o')
                    .replace(/[úùüû]/g, 'u')
                    .replace(/ñ/g, 'n')
                    .replace(/[^a-z0-9]/g, ''); // Quitar caracteres especiales
                
                for (const variation of variations) {
                    const normalizedVariation = variation.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (normalizedKey === normalizedVariation) {
                        return obj[key];
                    }
                }
            }
            return null;
        };

        // Buscar campos críticos con múltiples variaciones
        const codigo = findField(rawGroup, ['codigo', 'código', 'code', 'cod']) || '';
        const hora = findField(rawGroup, ['hora', 'horario', 'time']) || '';
        const profe = findField(rawGroup, ['profe', 'profesor', 'teacher']) || '';
        
        // Si falta información crítica, rechazar el grupo
        if (!codigo || !hora || !profe) {
            debugLog(`GroupService: Grupo ${index} rechazado - faltan campos críticos:`, {
                codigo: codigo || '(vacío)',
                hora: hora || '(vacío)',
                profe: profe || '(vacío)',
                camposDisponibles: Object.keys(rawGroup)
            });
            return null;
        }

        // Normalizar el resto de campos
        const normalized = {
            codigo: String(codigo).trim(),
            dias: findField(rawGroup, ['dias', 'días', 'days']) || '',
            lunes: this._normalizeBoolean(findField(rawGroup, ['lunes', 'monday'])),
            martes: this._normalizeBoolean(findField(rawGroup, ['martes', 'tuesday'])),
            miercoles: this._normalizeBoolean(findField(rawGroup, ['miercoles', 'miércoles', 'wednesday'])),
            jueves: this._normalizeBoolean(findField(rawGroup, ['jueves', 'thursday'])),
            viernes: this._normalizeBoolean(findField(rawGroup, ['viernes', 'friday'])),
            sabado: this._normalizeBoolean(findField(rawGroup, ['sabado', 'sábado', 'saturday'])),
            domingo: this._normalizeBoolean(findField(rawGroup, ['domingo', 'sunday'])),
            hora: String(hora).trim(),
            profe: String(profe).trim(),
            cancha: findField(rawGroup, ['cancha', 'court']) || '',
            frecuencia_semanal: parseInt(findField(rawGroup, ['frecuencia_semanal', 'frecuenciasemanal', 'weekly_frequency'])) || 0,
            bola: findField(rawGroup, ['bola', 'ball', 'nivel', 'level']) || 'Verde',
            descriptor: findField(rawGroup, ['descriptor', 'descripcion', 'description']) || '',
            activo: this._normalizeBoolean(findField(rawGroup, ['activo', 'active']), true)
        };

        // DEBUG: Log del grupo normalizado si es uno de los primeros
        if (window.APP_CONFIG?.DEBUG && index < 3) {
            debugLog(`GroupService: Grupo ${index} normalizado:`, normalized);
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
        
        if (typeof value === 'boolean') {
            return value;
        }
        
        const str = value.toString().toLowerCase().trim();
        const truthyValues = ['true', '1', 'x', 'yes', 'si', 'sí', 'y', 'on', 'activo'];
        
        return truthyValues.includes(str);
    },

    // ... resto de métodos sin cambios ...
    
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
                // Intentar una vez más con refresh forzado
                debugLog(`GroupService: Grupo ${codigo} no encontrado, intentando con refresh...`);
                const refreshedGroups = await this.getAllGroups(true);
                const refreshedGroup = refreshedGroups.find(g => g.codigo === codigo);
                
                if (!refreshedGroup) {
                    throw new Error(`Grupo ${codigo} no encontrado`);
                }
                
                return refreshedGroup;
            }
            
            return group;

        } catch (error) {
            console.error(`GroupService: Error al buscar grupo ${codigo}:`, error);
            throw error;
        }
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
                .map(d => d.replace('é', 'e').replace('á', 'a'));
            
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
    },

    /**
     * Fuerza la actualización del cache
     */
    async refresh() {
        debugLog('GroupService: Forzando actualización del cache');
        return this.getAllGroups(true);
    }
};

// Hacer disponible globalmente
window.GroupService = GroupService;

debugLog('group-service.js (VERSIÓN CORREGIDA - Manejo de headers con caracteres especiales) cargado correctamente');
