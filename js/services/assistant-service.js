/**
 * SERVICIO DE ASISTENTES - VERSIÓN OPTIMIZADA
 * =======================
 * Maneja toda la lógica relacionada con asistentes (caddies)
 * ✅ Debugging removido para mejor rendimiento
 * ✅ Solo logs críticos de error mantenidos
 */

const AssistantService = {
    // Cache interno
    _cache: {
        allAssistants: [],
        lastUpdate: null,
        cacheTimeout: 5 * 60 * 1000 // 5 minutos
    },

    /**
     * Obtiene todos los asistentes desde el backend
     */
    async getAllAssistants(forceRefresh = false) {
        try {
            // Verificar cache primero
            if (!forceRefresh && this._isCacheValid()) {
                return this._cache.allAssistants;
            }

            // Cargar desde backend
            const assistants = await SheetsAPI.getAssistants();
            
            if (!Array.isArray(assistants)) {
                throw new Error('Respuesta inválida del servidor');
            }

            // Validar y limpiar datos
            const validAssistants = assistants
                .map(assistant => this._normalizeAssistant(assistant))
                .filter(assistant => this._isValidAssistant(assistant));

            // Actualizar cache
            this._updateCache(validAssistants);
            
            return validAssistants;

        } catch (error) {
            console.error('AssistantService: Error al cargar asistentes:', error);
            
            // Fallback: intentar cache local o localStorage
            const fallbackAssistants = this._getFallbackAssistants();
            if (fallbackAssistants.length > 0) {
                UIUtils.showWarning('Usando datos de asistentes guardados localmente');
                return fallbackAssistants;
            }
            
            throw error;
        }
    },

    /**
     * Obtiene solo asistentes activos
     */
    async getActiveAssistants(forceRefresh = false) {
        try {
            const allAssistants = await this.getAllAssistants(forceRefresh);
            const activeAssistants = allAssistants.filter(assistant => assistant.activo);
            
            return activeAssistants;

        } catch (error) {
            console.error('AssistantService: Error al filtrar asistentes activos:', error);
            throw error;
        }
    },

    /**
     * Busca un asistente por ID
     */
    async getAssistantById(assistantId, forceRefresh = false) {
        try {
            const allAssistants = await this.getAllAssistants(forceRefresh);
            const assistant = allAssistants.find(a => a.id === assistantId);
            
            if (!assistant) {
                throw new Error(`Asistente ${assistantId} no encontrado`);
            }
            
            return assistant;

        } catch (error) {
            console.error(`AssistantService: Error al buscar asistente ${assistantId}:`, error);
            throw error;
        }
    },

    /**
     * Busca asistentes por nombre
     */
    async searchAssistantsByName(searchTerm, forceRefresh = false) {
        try {
            const allAssistants = await this.getActiveAssistants(forceRefresh);
            
            if (!searchTerm || searchTerm.trim() === '') {
                return allAssistants;
            }
            
            const term = searchTerm.toLowerCase().trim();
            const matchingAssistants = allAssistants.filter(assistant => {
                return assistant.nombre.toLowerCase().includes(term) ||
                       assistant.id.toLowerCase().includes(term);
            });

            return matchingAssistants;

        } catch (error) {
            console.error('AssistantService: Error en búsqueda de asistentes:', error);
            throw error;
        }
    },

    /**
     * Valida los datos de un asistente
     */
    validateAssistantData(assistant) {
        const errors = [];
        
        if (!assistant) {
            errors.push('Datos de asistente requeridos');
            return { valid: false, errors };
        }

        if (!assistant.id || assistant.id.toString().trim() === '') {
            errors.push('ID de asistente requerido');
        }

        if (!assistant.nombre || assistant.nombre.toString().trim() === '') {
            errors.push('Nombre de asistente requerido');
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
        return this.getAllAssistants(true);
    },

    // ===========================================
    // MÉTODOS PRIVADOS
    // ===========================================

    /**
     * Normaliza un asistente desde el backend
     */
    _normalizeAssistant(rawAssistant) {
        if (!rawAssistant || typeof rawAssistant !== 'object') {
            return null;
        }

        return {
            id: rawAssistant.id || '',
            nombre: rawAssistant.nombre || '',
            activo: this._normalizeBoolean(rawAssistant.activo, true) // Default activo
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
     * Valida que un asistente tenga la estructura mínima requerida
     */
    _isValidAssistant(assistant) {
        if (!assistant) return false;
        
        const validation = this.validateAssistantData(assistant);
        
        if (!validation.valid) {
            return false;
        }

        return true;
    },

    /**
     * Verifica si el cache es válido
     */
    _isCacheValid() {
        if (!this._cache.lastUpdate || this._cache.allAssistants.length === 0) {
            return false;
        }
        
        const now = Date.now();
        return (now - this._cache.lastUpdate) < this._cache.cacheTimeout;
    },

    /**
     * Actualiza el cache interno
     */
    _updateCache(assistants) {
        this._cache.allAssistants = assistants || [];
        this._cache.lastUpdate = Date.now();
        
        // También guardar en localStorage como backup
        StorageUtils.save('cached_assistants', assistants);
    },

    /**
     * Obtiene datos de fallback en caso de error
     */
    _getFallbackAssistants() {
        // Primero intentar cache interno
        if (this._cache.allAssistants.length > 0) {
            return this._cache.allAssistants;
        }
        
        // Luego intentar localStorage
        const cachedAssistants = StorageUtils.get('cached_assistants', []);
        if (cachedAssistants.length > 0) {
            this._cache.allAssistants = cachedAssistants;
            return cachedAssistants;
        }
        
        return [];
    },

    /**
     * Limpia el cache
     */
    _clearCache() {
        this._cache.allAssistants = [];
        this._cache.lastUpdate = null;
    }
};

// Hacer disponible globalmente
window.AssistantService = AssistantService;
