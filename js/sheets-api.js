/**
 * SISTEMA DE ASISTENCIA TENIS - API GOOGLE APPS SCRIPT (CON PROXY)
 * =================================================================
 * Funciones para interactuar con Google Apps Script a través de Netlify Functions
 * VERSIÓN CORREGIDA: Incluye fix para checkClassExists
 */

// ===========================================
// CONFIGURACIÓN DE APPS SCRIPT API
// ===========================================

const SheetsAPI = {
    // URL del proxy de Netlify (ya no la URL directa de Apps Script)
    webAppUrl: '/api/sheets-proxy',
    
    // Configuración
    timeout: 30000, // 30 segundos
    retryAttempts: 3,

    /**
     * Configura la URL del Web App (ya no necesario, pero mantenemos compatibilidad)
     */
    setWebAppUrl(url) {
        // Si es la URL directa de Apps Script, la ignoramos porque usamos proxy
        if (url.includes('script.google.com')) {
            debugLog('Usando proxy de Netlify en lugar de URL directa de Apps Script');
            return;
        }
        this.webAppUrl = url;
        debugLog('URL de proxy configurada:', url);
    },

    /**
     * Realiza una petición GET al Apps Script a través del proxy
     */
    async makeGetRequest(action, params = {}) {
        const url = new URL(this.webAppUrl, window.location.origin);
        url.searchParams.append('action', action);
        
        // Agregar parámetros adicionales
        Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined) {
                url.searchParams.append(key, params[key]);
            }
        });

        debugLog(`Petición GET: ${action}`, params);

        try {
            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();
            debugLog(`Respuesta GET ${action}:`, result);

            if (!result.success) {
                throw new Error(result.error || 'Error desconocido del servidor');
            }

            return result.data;

        } catch (error) {
            console.error(`Error en petición GET ${action}:`, error);
            throw error;
        }
    },

    /**
     * Realiza una petición POST al Apps Script a través del proxy
     */
    async makePostRequest(action, data = {}) {
        debugLog(`Petición POST: ${action}`, data);

        try {
            const response = await this.fetchWithRetry(this.webAppUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: action,
                    ...data
                })
            });

            const result = await response.json();
            debugLog(`Respuesta POST ${action}:`, result);

            if (!result.success) {
                throw new Error(result.error || 'Error desconocido del servidor');
            }

            return result;

        } catch (error) {
            console.error(`Error en petición POST ${action}:`, error);
            throw error;
        }
    },

    /**
     * Fetch con reintentos automáticos
     */
    async fetchWithRetry(url, options, attempt = 1) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);
            
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                // Si es un error 502 o 504, podría ser temporal, intentar de nuevo
                if ([502, 504].includes(response.status) && attempt < this.retryAttempts) {
                    debugLog(`Error ${response.status}, reintentando...`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    return this.fetchWithRetry(url, options, attempt + 1);
                }
                
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response;

        } catch (error) {
            if (attempt < this.retryAttempts && error.name !== 'AbortError') {
                debugLog(`Reintentando petición (intento ${attempt + 1}/${this.retryAttempts})`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                return this.fetchWithRetry(url, options, attempt + 1);
            }
            throw error;
        }
    },

    // ===========================================
    // FUNCIONES ESPECÍFICAS PARA CADA ENDPOINT
    // ===========================================
    
    /**
     * Obtiene todos los grupos
     */
    async getGroups() {
        debugLog('Obteniendo grupos...');
        
        try {
            const groups = await this.makeGetRequest('getGroups');
            debugLog(`Grupos obtenidos: ${groups ? groups.length : 0}`);
            
            // Guardar en cache para uso offline
            if (groups && groups.length > 0) {
                StorageUtils.save('cached_groups', groups);
            }
            
            return groups || [];
            
        } catch (error) {
            console.error('Error al obtener grupos:', error);
            
            // Si estamos offline, intentar usar datos en cache
            if (!navigator.onLine) {
                const cachedGroups = StorageUtils.get('cached_groups', []);
                if (cachedGroups.length > 0) {
                    UIUtils.showWarning('Usando datos guardados localmente (sin conexión)');
                    return cachedGroups;
                }
            }
            
            throw error;
        }
    },

    /**
     * Obtiene grupos del día actual
     */
    async getTodayGroups() {
        debugLog('Obteniendo grupos del día actual...');
        
        try {
            const result = await this.makeGetRequest('getTodayGroups');
            debugLog(`Grupos de hoy: ${result ? result.length : 0}`);
            return result || [];
            
        } catch (error) {
            console.error('Error al obtener grupos de hoy:', error);
            
            // Fallback: obtener todos los grupos y filtrar localmente
            try {
                const allGroups = await this.getGroups();
                const todayGroups = DataUtils.getTodayGroups(allGroups);
                return todayGroups;
            } catch (fallbackError) {
                throw error; // Lanzar el error original
            }
        }
    },
    
    /**
     * Obtiene todos los estudiantes
     */
    async getStudents() {
        debugLog('Obteniendo estudiantes...');
        
        try {
            const students = await this.makeGetRequest('getStudents');
            debugLog(`Estudiantes obtenidos: ${students ? students.length : 0}`);
            
            // Guardar en cache para uso offline
            if (students && students.length > 0) {
                StorageUtils.save('cached_students', students);
            }
            
            return students || [];
            
        } catch (error) {
            console.error('Error al obtener estudiantes:', error);
            
            // Si estamos offline, intentar usar datos en cache
            if (!navigator.onLine) {
                const cachedStudents = StorageUtils.get('cached_students', []);
                if (cachedStudents.length > 0) {
                    UIUtils.showWarning('Usando datos guardados localmente (sin conexión)');
                    return cachedStudents;
                }
            }
            
            throw error;
        }
    },
    
    /**
     * Obtiene estudiantes de un grupo específico
     */
    async getStudentsByGroup(groupCode) {
        debugLog(`Obteniendo estudiantes del grupo: ${groupCode}`);
        
        try {
            const students = await this.makeGetRequest('getStudentsByGroup', { groupCode });
            debugLog(`Estudiantes del grupo ${groupCode}: ${students ? students.length : 0}`);
            return students || [];
            
        } catch (error) {
            console.error(`Error al obtener estudiantes del grupo ${groupCode}:`, error);
            
            // Fallback: obtener todos los estudiantes y filtrar localmente
            try {
                const allStudents = await this.getStudents();
                const groupStudents = DataUtils.getStudentsByGroup(allStudents, groupCode);
                return groupStudents;
            } catch (fallbackError) {
                throw error;
            }
        }
    },
    
    /**
     * Obtiene todos los profesores
     */
    async getProfessors() {
        debugLog('Obteniendo profesores...');
        
        try {
            const professors = await this.makeGetRequest('getProfessors');
            debugLog(`Profesores obtenidos: ${professors ? professors.length : 0}`);
            return professors || [];
            
        } catch (error) {
            console.error('Error al obtener profesores:', error);
            throw error;
        }
    },

    /**
     * Obtiene todos los asistentes activos
     */
    async getAssistants() {
        debugLog('Obteniendo asistentes...');
        
        try {
            const assistants = await this.makeGetRequest('getAssistants');
            debugLog(`Asistentes obtenidos: ${assistants ? assistants.length : 0}`);
            
            // Guardar en cache para uso offline
            if (assistants && assistants.length > 0) {
                StorageUtils.save('cached_assistants', assistants);
            }
            
            return assistants || [];
            
        } catch (error) {
            console.error('Error al obtener asistentes:', error);
            
            // Si estamos offline, intentar usar datos en cache
            if (!navigator.onLine) {
                const cachedAssistants = StorageUtils.get('cached_assistants', []);
                if (cachedAssistants.length > 0) {
                    UIUtils.showWarning('Usando datos de asistentes guardados localmente (sin conexión)');
                    return cachedAssistants;
                }
            }
            
            throw error;
        }
    },

    /**
     * Busca un asistente por ID
     */
    async getAssistantById(assistantId) {
        debugLog(`Obteniendo asistente: ${assistantId}`);
        
        try {
            const allAssistants = await this.getAssistants();
            const assistant = allAssistants.find(a => a.id === assistantId);
            
            if (!assistant) {
                throw new Error(`Asistente ${assistantId} no encontrado`);
            }
            
            debugLog(`Asistente encontrado:`, assistant);
            return assistant;
            
        } catch (error) {
            console.error(`Error al obtener asistente ${assistantId}:`, error);
            throw error;
        }
    },

    /**
     * Guarda asistencia en Google Sheets (ACTUALIZADA CON ID_CLASE)
     */
    async saveAttendance(attendanceDataArray) {
        debugLog('Guardando asistencia con ID de clase:', attendanceDataArray);
        
        try {
            if (!Array.isArray(attendanceDataArray) || attendanceDataArray.length === 0) {
                throw new Error('Datos de asistencia inválidos');
            }

            // Convertir formato del frontend al formato esperado por Apps Script
            // NUEVO FORMATO: Incluye ID_Clase en la posición 1
            const formattedData = attendanceDataArray.map(record => ({
                ID: record.ID || DataUtils.generateId('AST'),
                ID_Clase: record.ID_Clase || '',  // NUEVO: ID de la clase
                Fecha: record.Fecha || DateUtils.getCurrentDate(),
                Estudiante_ID: record.Estudiante_ID,
                Grupo_Codigo: record.Grupo_Codigo,
                Tipo_Clase: record.Tipo_Clase || 'Regular',
                Estado: record.Estado,
                Justificacion: record.Justificacion || '',
                Descripcion: record.Descripcion || '',
                Enviado_por: record.Enviado_por || window.AppState.user?.email || 'usuario',
                Timestamp: record.Timestamp || DateUtils.getCurrentTimestamp()
            }));

            const result = await this.makePostRequest('saveAttendance', {
                attendanceData: formattedData
            });

            debugLog(`Asistencia guardada: ${result.count || 'desconocido'} registros`);
            return result;
            
        } catch (error) {
            console.error('Error al guardar asistencia:', error);
            throw error;
        }
    },
    
    /**
     * Obtiene asistencias por rango de fechas
     */
    async getAttendanceByDateRange(startDate, endDate) {
        debugLog(`Obteniendo asistencias del ${startDate} al ${endDate}`);
        
        try {
            const attendances = await this.makeGetRequest('getAttendanceByDateRange', {
                startDate,
                endDate
            });
            
            debugLog(`Asistencias filtradas: ${attendances ? attendances.length : 0}`);
            return attendances || [];
            
        } catch (error) {
            console.error('Error al obtener asistencias por fecha:', error);
            throw error;
        }
    },
    
    /**
     * Obtiene asistencias de un estudiante específico
     */
    async getAttendanceByStudent(studentId) {
        debugLog(`Obteniendo asistencias del estudiante: ${studentId}`);
        
        try {
            const attendances = await this.makeGetRequest('getAttendanceByStudent', {
                studentId
            });
            
            debugLog(`Asistencias del estudiante ${studentId}: ${attendances ? attendances.length : 0}`);
            return attendances || [];
            
        } catch (error) {
            console.error(`Error al obtener asistencias del estudiante ${studentId}:`, error);
            throw error;
        }
    },
    
    /**
     * Crea una clase programada
     */
    async createScheduledClass(classData) {
        debugLog('Creando clase programada:', classData);
        
        try {
            const result = await this.makePostRequest('createScheduledClass', {
                classData
            });
            
            debugLog('Clase programada creada correctamente');
            return result;
            
        } catch (error) {
            console.error('Error al crear clase programada:', error);
            throw error;
        }
    },
    
    /**
     * Crea una clase de reposición
     */
    async createRepositionClass(repositionData) {
        debugLog('Creando clase de reposición:', repositionData);
        
        try {
            const result = await this.makePostRequest('createRepositionClass', {
                repositionData
            });
            
            debugLog('Clase de reposición creada correctamente');
            return result;
            
        } catch (error) {
            console.error('Error al crear clase de reposición:', error);
            throw error;
        }
    },
    
    /**
     * Guarda una clase programada/realizada/cancelada
     */
    async saveScheduledClass(classData) {
        debugLog('Guardando clase programada:', classData);
        
        try {
            const result = await this.makePostRequest('saveScheduledClass', {
                classData
            });
            
            debugLog('Clase guardada correctamente');
            return result;
            
        } catch (error) {
            console.error('Error al guardar clase:', error);
            throw error;
        }
    },
    
    /**
     * Verifica la conectividad con Google Apps Script
     */
    async testConnection() {
        debugLog('Probando conexión con Google Apps Script...');
        
        try {
            const result = await this.makeGetRequest('testConnection');
            debugLog('Conexión exitosa:', result);
            return {
                success: true,
                message: result.message || 'Conexión exitosa',
                timestamp: result.timestamp || new Date().toISOString()
            };
            
        } catch (error) {
            console.error('Error de conectividad:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    /**
     * Obtiene información del spreadsheet
     */
    async getSpreadsheetInfo() {
        debugLog('Obteniendo información del spreadsheet...');
        
        try {
            const info = await this.makeGetRequest('getSpreadsheetInfo');
            debugLog('Información del spreadsheet:', info);
            return info || {};
            
        } catch (error) {
            console.error('Error al obtener información del spreadsheet:', error);
            throw error;
        }
    },

    // ===========================================
    // NUEVOS ENDPOINTS PARA CONTROL DE CLASES - CORREGIDOS
    // ===========================================

    /**
     * CORREGIDO: Verifica si una clase ya fue reportada
     */
    async checkClassExists(fecha, grupoCode, horaGrupo) {
        debugLog(`SheetsAPI.checkClassExists llamado con:`, {
            fecha: fecha,
            grupoCode: grupoCode, 
            horaGrupo: horaGrupo
        });
        
        // VALIDAR PARÁMETROS ANTES DE ENVIAR
        if (!fecha || fecha === undefined || fecha === null) {
            throw new Error('Parámetro "fecha" es requerido para checkClassExists');
        }
        
        if (!grupoCode || grupoCode === undefined || grupoCode === null) {
            throw new Error('Parámetro "grupoCode" es requerido para checkClassExists');
        }
        
        if (!horaGrupo || horaGrupo === undefined || horaGrupo === null) {
            throw new Error('Parámetro "horaGrupo" es requerido para checkClassExists');
        }
        
        try {
            // HACER PETICIÓN GET CON PARÁMETROS EXPLÍCITOS
            const url = new URL(this.webAppUrl, window.location.origin);
            url.searchParams.append('action', 'checkClassExists');
            url.searchParams.append('fecha', fecha);
            url.searchParams.append('grupo_codigo', grupoCode);
            url.searchParams.append('hora_grupo', horaGrupo);

            debugLog(`SheetsAPI checkClassExists URL:`, url.toString());

            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();
            debugLog(`SheetsAPI.checkClassExists respuesta raw:`, result);

            // VALIDAR ESTRUCTURA DE RESPUESTA
            if (typeof result !== 'object' || result === null) {
                throw new Error('Respuesta inválida del servidor - no es un objeto');
            }
            
            if (result.success === undefined) {
                throw new Error('Respuesta inválida del servidor - falta campo "success"');
            }

            if (!result.success) {
                throw new Error(`Error del backend: ${result.error || 'Error desconocido'}`);
            }

            debugLog(`SheetsAPI.checkClassExists resultado final:`, result);
            return result;
            
        } catch (error) {
            console.error('SheetsAPI.checkClassExists error:', error);
            
            // RETORNAR ESTRUCTURA CONSISTENTE EN CASO DE ERROR
            return {
                success: false,
                error: error.message,
                details: 'Error en comunicación con backend'
            };
        }
    },

    /**
     * Crea un registro de clase programada
     */
    async createClassRecord(classData) {
        debugLog('Creando registro de clase:', classData);
        
        try {
            const result = await this.makePostRequest('createClassRecord', {
                fecha: classData.fecha,
                grupo_codigo: classData.grupo_codigo,
                hora_grupo: classData.hora_grupo,
                estado: classData.estado,
                motivo_cancelacion: classData.motivo_cancelacion || '',
                asistente_id: classData.asistente_id || '',
                creado_por: classData.creado_por || window.AppState.user?.email || 'usuario'
            });
            
            debugLog('Clase creada correctamente:', result);
            return result;
            
        } catch (error) {
            console.error('Error al crear registro de clase:', error);
            throw error;
        }
    },

    /**
     * Obtiene un grupo específico por código
     */
    async getGroupByCode(groupCode) {
        debugLog(`Obteniendo grupo por código: ${groupCode}`);
        
        try {
            const result = await this.makeGetRequest('getGroupByCode', {
                groupCode
            });
            
            debugLog(`Grupo obtenido:`, result);
            return result;
            
        } catch (error) {
            console.error(`Error al obtener grupo ${groupCode}:`, error);
            
            // Fallback: buscar en cache local
            try {
                const cachedGroups = StorageUtils.get('cached_groups', []);
                const group = cachedGroups.find(g => g.codigo === groupCode);
                
                if (group) {
                    UIUtils.showWarning('Usando datos de grupo guardados localmente');
                    return { success: true, data: group };
                }
            } catch (fallbackError) {
                // Ignorar error de fallback
            }
            
            throw error;
        }
    },

    // ===========================================
    // MÉTODOS AUXILIARES PARA VALIDACIÓN
    // ===========================================

    /**
     * Función auxiliar para verificar si el endpoint GET es válido
     */
    _isValidEndpoint(action) {
        const validEndpoints = [
            'getGroups', 'getTodayGroups', 'getStudents', 'getStudentsByGroup',
            'getProfessors', 'getAssistants', 'getGroupByCode', 'checkClassExists',
            'getSpreadsheetInfo', 'testConnection', 'getAttendanceByDateRange',
            'getAttendanceByStudent'
        ];
        
        return validEndpoints.includes(action);
    },

    /**
     * Función auxiliar para verificar si el endpoint POST es válido
     */
    _isValidPostEndpoint(action) {
        const validPostEndpoints = [
            'saveAttendance', 'createClassRecord', 'createScheduledClass',
            'createRepositionClass', 'saveScheduledClass'
        ];
        
        return validPostEndpoints.includes(action);
    }
};

// ===========================================
// MANAGER DE SINCRONIZACIÓN ACTUALIZADO
// ===========================================

const SyncManager = {
    isSyncing: false,
    
    /**
     * Sincroniza datos pendientes cuando hay conexión
     */
    async syncPendingData() {
        if (this.isSyncing) {
            debugLog('Sincronización ya en progreso...');
            return;
        }
        
        this.isSyncing = true;
        UIUtils.updateConnectionStatus('syncing');
        
        try {
            const pendingData = StorageUtils.getPendingAttendance();
            
            if (pendingData.length === 0) {
                debugLog('No hay datos pendientes para sincronizar');
                return;
            }
            
            debugLog(`Sincronizando ${pendingData.length} registros pendientes...`);
            
            let syncedCount = 0;
            for (const item of pendingData) {
                try {
                    // Convertir datos al formato correcto
                    const formattedData = [item.data];
                    await SheetsAPI.saveAttendance(formattedData);
                    
                    StorageUtils.removePendingAttendance(item.id);
                    syncedCount++;
                    debugLog(`Registro ${item.id} sincronizado correctamente`);
                } catch (error) {
                    console.error(`Error al sincronizar registro ${item.id}:`, error);
                    // Continuar con el siguiente registro
                }
            }
            
            const remainingPending = StorageUtils.getPendingAttendance();
            
            if (remainingPending.length === 0) {
                UIUtils.showSuccess(`Todos los datos se sincronizaron correctamente (${syncedCount} registros)`);
            } else {
                UIUtils.showWarning(`Se sincronizaron ${syncedCount} registros. Quedan ${remainingPending.length} pendientes.`);
            }
            
        } catch (error) {
            console.error('Error durante la sincronización:', error);
            UIUtils.showError('Error durante la sincronización de datos');
        } finally {
            this.isSyncing = false;
            UIUtils.updateConnectionStatus('online');
        }
    }
};

// ===========================================
// EXPORTAR AL OBJETO GLOBAL WINDOW
// ===========================================

// CRÍTICO: Hacer SheetsAPI disponible globalmente
window.SheetsAPI = SheetsAPI;
window.SyncManager = SyncManager;

// ===========================================
// INICIALIZACIÓN Y CONFIGURACIÓN
// ===========================================

// Ya no necesitamos configurar URL externa porque usamos proxy interno
document.addEventListener('DOMContentLoaded', () => {
    debugLog('sheets-api.js configurado para usar proxy de Netlify');
});

debugLog('sheets-api.js (Netlify Proxy version - CORREGIDO) cargado correctamente');
