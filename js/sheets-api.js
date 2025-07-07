/**
 * SISTEMA DE ASISTENCIA TENIS - API GOOGLE APPS SCRIPT (CON PROXY)
 * =================================================================
 * Funciones para interactuar con Google Apps Script a través de Netlify Functions
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
     * Guarda asistencia en Google Sheets
     */
    async saveAttendance(attendanceDataArray) {
        debugLog('Guardando asistencia:', attendanceDataArray);
        
        try {
            if (!Array.isArray(attendanceDataArray) || attendanceDataArray.length === 0) {
                throw new Error('Datos de asistencia inválidos');
            }

            // Convertir formato del frontend al formato esperado por Apps Script
            const formattedData = attendanceDataArray.map(record => ({
                id: record[0],
                fecha: record[1],
                estudiante_id: record[2],
                grupo_codigo: record[3],
                tipo_clase: record[4],
                estado: record[5],
                justificacion: record[6],
                descripcion: record[7],
                enviado_por: record[8],
                timestamp: record[9]
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

debugLog('sheets-api.js (Netlify Proxy version) cargado correctamente');
