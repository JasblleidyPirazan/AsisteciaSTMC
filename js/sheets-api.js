/**
 * SISTEMA DE ASISTENCIA TENIS - API GOOGLE SHEETS
 * ================================================
 * Funciones para interactuar con Google Sheets
 */

// ===========================================
// CONFIGURACIÓN DE SHEETS API
// ===========================================

const SheetsAPI = {
    // Tu ID de spreadsheet
    spreadsheetId: '17V4XZMYxc9wzzlc9JWXdoZgTmxhlM8I_p9ZUYoJn7OI',
    
    // Rangos de las hojas (nombres exactos como aparecen en tu Google Sheets)
    ranges: {
        grupos: 'Grupos!A:I',
        estudiantes: 'Estudiantes!A:F', 
        profesores: 'Profesores!A:C',
        asistencias: 'Asistencias!A:J',
        clases_programadas: 'Clases_Programadas!A:G',
        clases_reposicion: 'Clases_Reposicion!A:H'
    },
    
    // Headers esperados para cada hoja
    headers: {
        grupos: ['Código', 'Días', 'Hora', 'Profe', 'Cancha', 'Frecuencia_Semanal', 'Bola', 'Descriptor', 'Activo'],
        estudiantes: ['ID', 'Nombre', 'Grupo_Principal', 'Grupo_Secundario', 'Max_Clases', 'Activo'],
        profesores: ['ID', 'Nombre', 'Activo'],
        asistencias: ['ID', 'Fecha', 'Estudiante_ID', 'Grupo_Codigo', 'Tipo_Clase', 'Estado', 'Justificacion', 'Descripcion', 'Enviado_Por', 'Timestamp'],
        clases_programadas: ['ID', 'Fecha', 'Grupo_Codigo', 'Estado', 'Motivo_Cancelacion', 'Creado_Por', 'Timestamp'],
        clases_reposicion: ['ID', 'Fecha', 'Estudiantes_IDs', 'Tipo', 'Profesor', 'Descripcion', 'Creado_Por', 'Timestamp']
    },

    /**
     * Realiza una petición GET a Google Sheets
     */
    async makeRequest(range) {
        debugLog(`Realizando petición a: ${range}`);
        
        try {
            // Asegurar token válido
            if (GoogleAuth.isSignedIn()) {
                await GoogleAuth.ensureValidToken();
            }
            
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueRenderOption: 'UNFORMATTED_VALUE',
                dateTimeRenderOption: 'FORMATTED_STRING'
            });
            
            debugLog(`Respuesta recibida:`, response);
            return response.result.values || [];
            
        } catch (error) {
            console.error(`Error en petición GET ${range}:`, error);
            handleGoogleApiError(error);
            throw error;
        }
    },
    
    /**
     * Realiza una petición POST para agregar datos
     */
    async appendData(range, values) {
        debugLog(`Agregando datos a: ${range}`, values);
        
        try {
            // Asegurar token válido
            if (GoogleAuth.isSignedIn()) {
                await GoogleAuth.ensureValidToken();
            }
            
            const response = await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: values
                }
            });
            
            debugLog(`Datos agregados correctamente:`, response);
            return response.result;
            
        } catch (error) {
            console.error(`Error en petición POST ${range}:`, error);
            handleGoogleApiError(error);
            throw error;
        }
    },
    
    /**
     * Actualiza datos en un rango específico
     */
    async updateData(range, values) {
        debugLog(`Actualizando datos en: ${range}`, values);
        
        try {
            // Asegurar token válido
            if (GoogleAuth.isSignedIn()) {
                await GoogleAuth.ensureValidToken();
            }
            
            const response = await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'RAW',
                resource: {
                    values: values
                }
            });
            
            debugLog(`Datos actualizados correctamente:`, response);
            return response.result;
            
        } catch (error) {
            console.error(`Error en petición UPDATE ${range}:`, error);
            handleGoogleApiError(error);
            throw error;
        }
    },

    // ===========================================
    // FUNCIONES ESPECÍFICAS PARA CADA HOJA
    // ===========================================
    
    /**
     * Obtiene todos los grupos
     */
    async getGroups() {
        debugLog('Obteniendo grupos...');
        
        try {
            const values = await this.makeRequest(this.ranges.grupos);
            
            if (!values || values.length === 0) {
                debugLog('No se encontraron grupos');
                return [];
            }
            
            // Convertir a objetos usando headers
            const groups = DataUtils.sheetsToObjects(values, this.headers.grupos);
            
            // Filtrar solo grupos activos
            const activeGroups = groups.filter(group => 
                group.activo === true || 
                group.activo === 'TRUE' || 
                group.activo === '1' ||
                group.activo === 1
            );
            
            debugLog(`Grupos obtenidos: ${activeGroups.length}`);
            return activeGroups;
            
        } catch (error) {
            console.error('Error al obtener grupos:', error);
            throw error;
        }
    },
    
    /**
     * Obtiene todos los estudiantes
     */
    async getStudents() {
        debugLog('Obteniendo estudiantes...');
        
        try {
            const values = await this.makeRequest(this.ranges.estudiantes);
            
            if (!values || values.length === 0) {
                debugLog('No se encontraron estudiantes');
                return [];
            }
            
            // Convertir a objetos usando headers
            const students = DataUtils.sheetsToObjects(values, this.headers.estudiantes);
            
            // Filtrar solo estudiantes activos
            const activeStudents = students.filter(student => 
                student.activo === true || 
                student.activo === 'TRUE' || 
                student.activo === '1' ||
                student.activo === 1
            );
            
            debugLog(`Estudiantes obtenidos: ${activeStudents.length}`);
            return activeStudents;
            
        } catch (error) {
            console.error('Error al obtener estudiantes:', error);
            throw error;
        }
    },
    
    /**
     * Obtiene estudiantes de un grupo específico
     */
    async getStudentsByGroup(groupCode) {
        debugLog(`Obteniendo estudiantes del grupo: ${groupCode}`);
        
        try {
            const allStudents = await this.getStudents();
            
            const groupStudents = allStudents.filter(student => 
                student.grupo_principal === groupCode || 
                student.grupo_secundario === groupCode
            );
            
            debugLog(`Estudiantes del grupo ${groupCode}: ${groupStudents.length}`);
            return groupStudents;
            
        } catch (error) {
            console.error(`Error al obtener estudiantes del grupo ${groupCode}:`, error);
            throw error;
        }
    },
    
    /**
     * Obtiene todos los profesores
     */
    async getProfessors() {
        debugLog('Obteniendo profesores...');
        
        try {
            const values = await this.makeRequest(this.ranges.profesores);
            
            if (!values || values.length === 0) {
                debugLog('No se encontraron profesores');
                return [];
            }
            
            // Convertir a objetos usando headers
            const professors = DataUtils.sheetsToObjects(values, this.headers.profesores);
            
            // Filtrar solo profesores activos
            const activeProfessors = professors.filter(prof => 
                prof.activo === true || 
                prof.activo === 'TRUE' || 
                prof.activo === '1' ||
                prof.activo === 1
            );
            
            debugLog(`Profesores obtenidos: ${activeProfessors.length}`);
            return activeProfessors;
            
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
            
            // Agregar datos a la hoja de asistencias
            const result = await this.appendData(this.ranges.asistencias, attendanceDataArray);
            
            debugLog(`Asistencia guardada: ${attendanceDataArray.length} registros`);
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
            const values = await this.makeRequest(this.ranges.asistencias);
            
            if (!values || values.length === 0) {
                return [];
            }
            
            // Convertir a objetos
            const attendances = DataUtils.sheetsToObjects(values, this.headers.asistencias);
            
            // Filtrar por rango de fechas
            const filtered = attendances.filter(attendance => {
                const attendanceDate = attendance.fecha;
                return attendanceDate >= startDate && attendanceDate <= endDate;
            });
            
            debugLog(`Asistencias filtradas: ${filtered.length}`);
            return filtered;
            
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
            const values = await this.makeRequest(this.ranges.asistencias);
            
            if (!values || values.length === 0) {
                return [];
            }
            
            // Convertir a objetos
            const attendances = DataUtils.sheetsToObjects(values, this.headers.asistencias);
            
            // Filtrar por estudiante
            const studentAttendances = attendances.filter(attendance => 
                attendance.estudiante_id === studentId
            );
            
            debugLog(`Asistencias del estudiante ${studentId}: ${studentAttendances.length}`);
            return studentAttendances;
            
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
            const values = [[
                classData.id || DataUtils.generateId('CLS'),
                classData.fecha,
                classData.grupo_codigo,
                classData.estado || 'Programada',
                classData.motivo_cancelacion || '',
                classData.creado_por || window.AppState.user?.email || 'sistema',
                DateUtils.getCurrentTimestamp()
            ]];
            
            const result = await this.appendData(this.ranges.clases_programadas, values);
            
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
            const values = [[
                repositionData.id || DataUtils.generateId('REP'),
                repositionData.fecha,
                repositionData.estudiantes_ids,
                repositionData.tipo || 'Grupal',
                repositionData.profesor,
                repositionData.descripcion || '',
                repositionData.creado_por || window.AppState.user?.email || 'usuario',
                DateUtils.getCurrentTimestamp()
            ]];
            
            const result = await this.appendData(this.ranges.clases_reposicion, values);
            
            debugLog('Clase de reposición creada correctamente');
            return result;
            
        } catch (error) {
            console.error('Error al crear clase de reposición:', error);
            throw error;
        }
    },
    
    /**
     * Verifica la conectividad con Google Sheets
     */
    async testConnection() {
        debugLog('Probando conexión con Google Sheets...');
        
        try {
            // Intentar obtener información básica del spreadsheet
            const response = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            
            debugLog('Conexión exitosa:', response.result.properties.title);
            return {
                success: true,
                title: response.result.properties.title,
                sheets: response.result.sheets.map(sheet => sheet.properties.title)
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
            const response = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId,
                includeGridData: false
            });
            
            const spreadsheet = response.result;
            
            const info = {
                title: spreadsheet.properties.title,
                locale: spreadsheet.properties.locale,
                timeZone: spreadsheet.properties.timeZone,
                sheets: spreadsheet.sheets.map(sheet => ({
                    title: sheet.properties.title,
                    sheetId: sheet.properties.sheetId,
                    rowCount: sheet.properties.gridProperties.rowCount,
                    columnCount: sheet.properties.gridProperties.columnCount
                }))
            };
            
            debugLog('Información del spreadsheet:', info);
            return info;
            
        } catch (error) {
            console.error('Error al obtener información del spreadsheet:', error);
            throw error;
        }
    }
};

// ===========================================
// FUNCIONES AUXILIARES PARA SHEETS
// ===========================================

/**
 * Valida que el formato de fecha sea correcto para Sheets
 */
function validateDateForSheets(dateString) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    return regex.test(dateString);
}

/**
 * Convierte boolean a formato que entiende Sheets
 */
function booleanToSheets(value) {
    if (typeof value === 'boolean') {
        return value ? 'TRUE' : 'FALSE';
    }
    return value;
}

/**
 * Convierte datos de Sheets a boolean
 */
function sheetsToBoolean(value) {
    if (typeof value === 'string') {
        return value.toUpperCase() === 'TRUE' || value === '1';
    }
    if (typeof value === 'number') {
        return value === 1;
    }
    return Boolean(value);
}

/**
 * Limpia datos antes de enviar a Sheets
 */
function sanitizeForSheets(data) {
    if (Array.isArray(data)) {
        return data.map(sanitizeForSheets);
    }
    
    if (typeof data === 'object' && data !== null) {
        const sanitized = {};
        for (const [key, value] of Object.entries(data)) {
            sanitized[key] = sanitizeForSheets(value);
        }
        return sanitized;
    }
    
    // Limpiar strings
    if (typeof data === 'string') {
        return data.trim();
    }
    
    // Convertir booleans
    if (typeof data === 'boolean') {
        return booleanToSheets(data);
    }
    
    return data;
}

// ===========================================
// MANAGER DE SINCRONIZACIÓN
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
            
            for (const item of pendingData) {
                try {
                    await SheetsAPI.saveAttendance([item.data]);
                    StorageUtils.removePendingAttendance(item.id);
                    debugLog(`Registro ${item.id} sincronizado correctamente`);
                } catch (error) {
                    console.error(`Error al sincronizar registro ${item.id}:`, error);
                    // Continuar con el siguiente registro
                }
            }
            
            const remainingPending = StorageUtils.getPendingAttendance();
            
            if (remainingPending.length === 0) {
                UIUtils.showSuccess('Todos los datos se sincronizaron correctamente');
            } else {
                UIUtils.showWarning(`Se sincronizaron algunos datos. Quedan ${remainingPending.length} pendientes.`);
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

debugLog('sheets-api.js cargado correctamente');
