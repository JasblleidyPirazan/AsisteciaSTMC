/**
 * SISTEMA DE ASISTENCIA TENIS - UTILIDADES
 * ==========================================
 * Funciones auxiliares y helpers para el sistema
 */

// ===========================================
// UTILIDADES DE FECHA Y TIEMPO
// ===========================================

const DateUtils = {
    /**
     * Obtiene la fecha actual en formato YYYY-MM-DD
     */
    getCurrentDate() {
        return new Date().toISOString().split('T')[0];
    },

    /**
     * Obtiene el timestamp actual en formato ISO
     */
    getCurrentTimestamp() {
        return new Date().toISOString();
    },

    /**
     * Obtiene el día de la semana actual en español (zona horaria local, SIN TILDES)
     */
    getCurrentDay() {
        // SIN TILDES para coincidir con los datos del maestro
        const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        const now = new Date();
        // Usar zona horaria local en lugar de UTC
        return days[now.getDay()];
    },

    /**
     * Obtiene el día de la semana de una fecha específica (zona horaria local, SIN TILDES)
     */
    getDayFromDate(dateString) {
        // SIN TILDES para coincidir con los datos del maestro
        const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        // Crear fecha en zona horaria local
        const [year, month, day] = dateString.split('-');
        const date = new Date(year, month - 1, day); // month es 0-indexado
        return days[date.getDay()];
    },

    /**
     * Convierte fecha a formato legible en español (zona horaria local)
     */
    formatDate(dateString) {
        const [year, month, day] = dateString.split('-');
        const date = new Date(year, month - 1, day); // Crear en zona horaria local
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        return date.toLocaleDateString('es-ES', options);
    },

    /**
     * Verifica si una fecha es hoy
     */
    isToday(dateString) {
        return dateString === this.getCurrentDate();
    },

    /**
     * Obtiene los días de la semana de un grupo usando columnas booleanas
     * Maneja estructura: Lunes | Martes | Miercoles | Jueves | Viernes | Sabado | Domingo
     */
    getGroupDays(group) {
        if (!group) return [];
        
        const days = [];
        const dayColumns = [
            { key: 'lunes', name: 'lunes' },
            { key: 'martes', name: 'martes' },
            { key: 'miercoles', name: 'miercoles' },
            { key: 'jueves', name: 'jueves' },
            { key: 'viernes', name: 'viernes' },
            { key: 'sabado', name: 'sabado' },
            { key: 'domingo', name: 'domingo' }
        ];
        
        dayColumns.forEach(day => {
            const value = group[day.key];
            // Verificar si está marcado: X, x, YES, yes, TRUE, true, 1
            if (value && (
                value.toString().toLowerCase() === 'x' ||
                value.toString().toLowerCase() === 'yes' ||
                value.toString().toLowerCase() === 'true' ||
                value.toString() === '1'
            )) {
                days.push(day.name);
            }
        });
        
        return days;
    },

    /**
     * DEPRECATED: Mantener por compatibilidad, pero ahora usa getGroupDays
     * Obtiene los días de la semana que contiene una cadena (SIN TILDES)
     */
    parseDays(daysString) {
        if (!daysString) return [];
        
        // Si es un objeto (nuevo formato), usar getGroupDays
        if (typeof daysString === 'object') {
            return this.getGroupDays(daysString);
        }
        
        // Fallback para formato anterior (string con comas)
        const dayMap = {
            'lunes': 'lunes',
            'martes': 'martes',
            'miercoles': 'miercoles',
            'miércoles': 'miercoles',
            'jueves': 'jueves',
            'viernes': 'viernes',
            'sabado': 'sabado',
            'sábado': 'sabado',
            'domingo': 'domingo'
        };

        const days = daysString.toLowerCase()
            .split(',')
            .map(day => day.trim())
            .map(day => dayMap[day])
            .filter(Boolean);
            
        return days;
    }
};

// ===========================================
// UTILIDADES DE DATOS
// ===========================================

const DataUtils = {
    /**
     * Genera un ID único simple
     */
    generateId(prefix = 'ID') {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 5);
        return `${prefix}${timestamp}${random}`.toUpperCase();
    },

    /**
     * Filtra grupos por el día actual
     */
    getTodayGroups(allGroups) {
        if (!Array.isArray(allGroups)) return [];
        
        const today = DateUtils.getCurrentDay();
        
        return allGroups.filter(group => {
            // NUEVO: Si el grupo tiene columnas por día (lunes, martes, etc.)
            if (group.hasOwnProperty(today.toLowerCase())) {
                const dayValue = group[today.toLowerCase()];
                return dayValue && (
                    dayValue.toString().toLowerCase() === 'x' ||
                    dayValue.toString().toLowerCase() === 'yes' ||
                    dayValue.toString().toLowerCase() === 'true' ||
                    dayValue.toString() === '1'
                );
            }
            
            // FALLBACK: Formato anterior con columna "dias"
            if (group.dias) {
                const groupDays = DateUtils.parseDays(group.dias);
                return groupDays.includes(today);
            }
            
            return false;
        }).filter(group => group.activo === true || group.activo === 'TRUE');
    },

    /**
     * Filtra grupos por un día específico (NUEVO: soporta columnas booleanas)
     */
    getGroupsByDay(allGroups, dayName) {
        if (!Array.isArray(allGroups)) return [];
        
        return allGroups.filter(group => {
            if (!group) return false;
            
            // NUEVO: Si el grupo tiene columnas por día (lunes, martes, etc.)
            if (group.hasOwnProperty(dayName.toLowerCase())) {
                const dayValue = group[dayName.toLowerCase()];
                return dayValue && (
                    dayValue.toString().toLowerCase() === 'x' ||
                    dayValue.toString().toLowerCase() === 'yes' ||
                    dayValue.toString().toLowerCase() === 'true' ||
                    dayValue.toString() === '1'
                );
            }
            
            // FALLBACK: Formato anterior con columna "dias"
            if (group.dias) {
                const groupDays = DateUtils.parseDays(group.dias);
                return groupDays.includes(dayName.toLowerCase());
            }
            
            return false;
        }).filter(group => group.activo === true || group.activo === 'TRUE');
    },

    /**
     * Filtra estudiantes por código de grupo
     */
    getStudentsByGroup(allStudents, groupCode) {
        if (!Array.isArray(allStudents)) return [];
        
        return allStudents.filter(student => 
            student.grupo_principal === groupCode || 
            student.grupo_secundario === groupCode
        ).filter(student => student.activo === true || student.activo === 'TRUE');
    },

    /**
     * Formatea datos de asistencia para Google Sheets (fecha actual)
     */
    formatAttendanceData(studentId, groupCode, status, justification = '', description = '') {
        return [
            this.generateId('AST'),
            DateUtils.getCurrentDate(),
            studentId,
            groupCode,
            'Regular',
            status,
            justification,
            description,
            window.AppState.user?.email || 'usuario',
            DateUtils.getCurrentTimestamp()
        ];
    },

    /**
     * Formatea datos de asistencia para Google Sheets con fecha específica
     */
    formatAttendanceDataForDate(studentId, groupCode, status, justification = '', description = '', dateString) {
        return [
            this.generateId('AST'),
            dateString, // Usar fecha específica
            studentId,
            groupCode,
            'Regular',
            status,
            justification,
            description,
            window.AppState.user?.email || 'usuario',
            DateUtils.getCurrentTimestamp()
        ];
    },

    /**
     * Convierte datos de Google Sheets a objetos JavaScript
     */
    sheetsToObjects(values, headers = null) {
        if (!values || values.length === 0) return [];
        
        // Si no se proporcionan headers, usar la primera fila
        const headerRow = headers || values[0];
        const dataRows = headers ? values : values.slice(1);
        
        return dataRows.map(row => {
            const obj = {};
            headerRow.forEach((header, index) => {
                // Convertir header a formato snake_case y limpiar
                const key = header.toLowerCase()
                    .replace(/[^a-z0-9]/g, '_')
                    .replace(/_+/g, '_')
                    .replace(/^_|_$/g, '');
                obj[key] = row[index] || '';
            });
            return obj;
        });
    },

    /**
     * Valida estructura de datos requeridos
     */
    validateRequiredFields(obj, requiredFields) {
        const missing = [];
        requiredFields.forEach(field => {
            if (!obj[field] || obj[field].toString().trim() === '') {
                missing.push(field);
            }
        });
        return missing;
    },

    /**
     * Obtiene estadísticas de asistencia
     */
    getAttendanceStats(attendanceRecords) {
        if (!Array.isArray(attendanceRecords)) return { total: 0, presente: 0, ausente: 0, justificada: 0 };
        
        const stats = {
            total: attendanceRecords.length,
            presente: 0,
            ausente: 0,
            justificada: 0
        };
        
        attendanceRecords.forEach(record => {
            if (record.status === 'Presente') stats.presente++;
            else if (record.status === 'Ausente') stats.ausente++;
            else if (record.status === 'Justificada') stats.justificada++;
        });
        
        return stats;
    }
};

// ===========================================
// UTILIDADES DE UI
// ===========================================

const UIUtils = {
    /**
     * Muestra loading en el elemento especificado
     */
    showLoading(elementId = 'app', message = 'Cargando...') {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `
                <div class="flex items-center justify-center min-h-screen">
                    <div class="text-center">
                        <div class="spinner spinner-lg mx-auto mb-4"></div>
                        <p class="text-gray-600 text-lg">${message}</p>
                    </div>
                </div>
            `;
        }
    },

    /**
     * Muestra notificación de éxito
     */
    showSuccess(message, duration = 3000) {
        this.showNotification(message, 'success', duration);
    },

    /**
     * Muestra notificación de error
     */
    showError(message, duration = 5000) {
        this.showNotification(message, 'error', duration);
    },

    /**
     * Muestra notificación de advertencia
     */
    showWarning(message, duration = 4000) {
        this.showNotification(message, 'warning', duration);
    },

    /**
     * Muestra notificación de información
     */
    showInfo(message, duration = 3000) {
        this.showNotification(message, 'info', duration);
    },

    /**
     * Sistema de notificaciones mejorado
     */
    showNotification(message, type = 'info', duration = 3000) {
        // Remover notificación existente si existe
        this.closeNotification();
        
        const modal = document.getElementById('notification-modal');
        const content = document.getElementById('notification-content');
        
        if (!modal || !content) {
            console.warn('Modal de notificaciones no encontrado');
            // Fallback: usar console
            console.log(`${type.toUpperCase()}: ${message}`);
            return;
        }

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const colors = {
            success: 'border-green-200 bg-green-50 text-green-800',
            error: 'border-red-200 bg-red-50 text-red-800',
            warning: 'border-yellow-200 bg-yellow-50 text-yellow-800',
            info: 'border-blue-200 bg-blue-50 text-blue-800'
        };

        content.innerHTML = `
            <div class="notification ${colors[type]} border rounded-lg p-4">
                <div class="flex items-center">
                    <span class="text-2xl mr-3">${icons[type]}</span>
                    <div>
                        <p class="font-medium">${message}</p>
                    </div>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
        document.body.classList.add('no-scroll');

        // Auto-cerrar después del tiempo especificado
        if (duration > 0) {
            setTimeout(() => {
                this.closeNotification();
            }, duration);
        }
    },

    /**
     * Cierra notificación
     */
    closeNotification() {
        const modal = document.getElementById('notification-modal');
        if (modal) {
            modal.classList.add('hidden');
            document.body.classList.remove('no-scroll');
        }
    },

    /**
     * Crea card de grupo
     */
    createGroupCard(group) {
        const ballClass = `ball-${group.bola?.toLowerCase() || 'verde'}`;
        
        return `
            <div class="group-card" onclick="selectGroup('${group.codigo}')">
                <div class="group-info">
                    <h3>${group.descriptor || 'Grupo sin nombre'}</h3>
                    <div class="ball-level ${ballClass}">${group.bola || 'Verde'}</div>
                </div>
                <div class="group-details">
                    <div class="group-detail">
                        <span class="icon">👨‍🏫</span>
                        <span>${group.profe || 'Sin profesor'}</span>
                    </div>
                    <div class="group-detail">
                        <span class="icon">🕐</span>
                        <span>${group.hora || 'Sin horario'}</span>
                    </div>
                    <div class="group-detail">
                        <span class="icon">🎾</span>
                        <span>Cancha ${group.cancha || 'N/A'}</span>
                    </div>
                    <div class="group-detail">
                        <span class="icon">📅</span>
                        <span>${group.frecuencia_semanal || 0} clases/sem</span>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Crea item de estudiante para asistencia
     */
    createStudentItem(student) {
        const studentId = student.id;
        const currentStatus = window.AppState.currentAttendance[studentId] || null;
        
        return `
            <div class="student-item ${currentStatus ? `status-${currentStatus.status.toLowerCase()}` : ''}" 
                 data-student-id="${studentId}">
                <div class="student-info">
                    <h4>${student.nombre || 'Sin nombre'}</h4>
                    <p>ID: ${studentId}</p>
                    ${student.grupo_secundario ? `<p class="text-xs text-gray-500">También en: ${student.grupo_secundario}</p>` : ''}
                </div>
                <div class="student-actions">
                    <button class="btn btn-sm ${currentStatus?.status === 'Presente' ? 'btn-primary' : 'btn-outline'}" 
                            onclick="markAttendance('${studentId}', 'Presente')">
                        ✅ Presente
                    </button>
                    <button class="btn btn-sm ${currentStatus?.status === 'Ausente' ? 'btn-danger' : 'btn-outline'}" 
                            onclick="markAttendance('${studentId}', 'Ausente')">
                        ❌ Ausente
                    </button>
                    <button class="btn btn-sm ${currentStatus?.status === 'Justificada' ? 'btn-secondary' : 'btn-outline'}" 
                            onclick="markAttendance('${studentId}', 'Justificada')">
                        📝 Justificada
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Actualiza el indicador de conexión
     */
    updateConnectionStatus(status) {
        const indicators = document.querySelectorAll('.connection-status');
        const statusText = {
            'online': 'En línea',
            'offline': 'Sin conexión',
            'syncing': 'Sincronizando'
        };

        indicators.forEach(indicator => {
            indicator.className = `status-indicator ${status}`;
            indicator.textContent = statusText[status] || status;
        });

        window.AppState.connectionStatus = status;
    },

    /**
     * Crea elemento de carga inline
     */
    createInlineLoader(text = 'Cargando...') {
        return `
            <div class="inline-flex items-center">
                <div class="spinner mr-2"></div>
                <span>${text}</span>
            </div>
        `;
    },

    /**
     * Formatea estadísticas de asistencia
     */
    formatAttendanceStats(stats) {
        const total = stats.total || 0;
        if (total === 0) return 'Sin datos';
        
        const percentage = total > 0 ? Math.round((stats.presente / total) * 100) : 0;
        
        return `
            <div class="text-sm">
                <span class="font-medium">${stats.presente}/${total} presentes</span>
                <span class="text-gray-500">(${percentage}%)</span>
            </div>
        `;
    }
};

// ===========================================
// UTILIDADES DE ALMACENAMIENTO LOCAL
// ===========================================

const StorageUtils = {
    /**
     * Prefijo para las claves del sistema
     */
    PREFIX: 'tennis_',

    /**
     * Guarda datos en localStorage
     */
    save(key, data) {
        try {
            localStorage.setItem(this.PREFIX + key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Error al guardar en localStorage:', error);
            return false;
        }
    },

    /**
     * Obtiene datos de localStorage
     */
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(this.PREFIX + key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Error al leer de localStorage:', error);
            return defaultValue;
        }
    },

    /**
     * Elimina datos de localStorage
     */
    remove(key) {
        try {
            localStorage.removeItem(this.PREFIX + key);
            return true;
        } catch (error) {
            console.error('Error al eliminar de localStorage:', error);
            return false;
        }
    },

    /**
     * Limpia todo el localStorage del sistema
     */
    clear() {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(this.PREFIX)) {
                    localStorage.removeItem(key);
                }
            });
            return true;
        } catch (error) {
            console.error('Error al limpiar localStorage:', error);
            return false;
        }
    },

    /**
     * Guarda datos de asistencia pendientes
     */
    savePendingAttendance(data) {
        const pending = this.get('pending_attendance', []);
        pending.push({
            ...data,
            id: DataUtils.generateId('PENDING'),
            timestamp: DateUtils.getCurrentTimestamp()
        });
        return this.save('pending_attendance', pending);
    },

    /**
     * Obtiene asistencias pendientes de sincronizar
     */
    getPendingAttendance() {
        return this.get('pending_attendance', []);
    },

    /**
     * Elimina asistencia pendiente después de sincronizar
     */
    removePendingAttendance(pendingId) {
        const pending = this.getPendingAttendance();
        const filtered = pending.filter(item => item.id !== pendingId);
        return this.save('pending_attendance', filtered);
    },

    /**
     * Guarda configuración de usuario
     */
    saveUserSettings(settings) {
        return this.save('user_settings', settings);
    },

    /**
     * Obtiene configuración de usuario
     */
    getUserSettings() {
        return this.get('user_settings', {
            autoSync: true,
            notifications: true,
            lastSelectedDate: null
        });
    }
};

// ===========================================
// UTILIDADES DE VALIDACIÓN
// ===========================================

const ValidationUtils = {
    /**
     * Valida email
     */
    isValidEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    },

    /**
     * Valida que no esté vacío
     */
    isNotEmpty(value) {
        return value !== null && value !== undefined && value.toString().trim() !== '';
    },

    /**
     * Valida fecha en formato YYYY-MM-DD
     */
    isValidDate(dateString) {
        const regex = /^\d{4}-\d{2}-\d{2}$/;
        if (!regex.test(dateString)) return false;
        
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    },

    /**
     * Valida que la fecha no sea futura (para asistencias)
     */
    isValidAttendanceDate(dateString) {
        if (!this.isValidDate(dateString)) return false;
        
        const inputDate = new Date(dateString);
        const today = new Date();
        today.setHours(23, 59, 59, 999); // Fin del día actual
        
        return inputDate <= today;
    },

    /**
     * Valida estructura de grupo
     */
    validateGroup(group) {
        const required = ['codigo', 'dias', 'hora', 'profe'];
        return DataUtils.validateRequiredFields(group, required);
    },

    /**
     * Valida estructura de estudiante
     */
    validateStudent(student) {
        const required = ['id', 'nombre', 'grupo_principal'];
        return DataUtils.validateRequiredFields(student, required);
    },

    /**
     * Valida datos de asistencia
     */
    validateAttendanceData(attendance) {
        const required = ['studentId', 'status'];
        const missing = DataUtils.validateRequiredFields(attendance, required);
        
        if (missing.length > 0) return { valid: false, errors: missing };
        
        // ACTUALIZAR: Agregar "Cancelada" a los estados válidos
        const validStatuses = ['Presente', 'Ausente', 'Justificada', 'Cancelada'];
        if (!validStatuses.includes(attendance.status)) {
            return { valid: false, errors: ['Estado de asistencia inválido'] };
        }
        
        return { valid: true, errors: [] };
    }
};

// ===========================================
// EXPORTAR TODO AL OBJETO GLOBAL WINDOW
// ===========================================

// CRÍTICO: Hacer las utilidades disponibles globalmente
window.DateUtils = DateUtils;
window.DataUtils = DataUtils;
window.UIUtils = UIUtils;
window.StorageUtils = StorageUtils;
window.ValidationUtils = ValidationUtils;

// ===========================================
// FUNCIONES GLOBALES DE UTILIDAD
// ===========================================

/**
 * Debug helper - solo en desarrollo
 */
function debugLog(...args) {
    if (window.APP_CONFIG?.DEBUG) {
        console.log('🐛 DEBUG:', ...args);
    }
}

/**
 * Función para formatear números
 */
function formatNumber(num, decimals = 0) {
    return new Intl.NumberFormat('es-ES', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(num);
}

/**
 * Función para capitalizar texto
 */
function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Detecta si está en dispositivo móvil/tablet
 */
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Función para detectar conexión a internet
 */
function checkConnection() {
    return navigator.onLine;
}

/**
 * Función para obtener información del dispositivo
 */
function getDeviceInfo() {
    return {
        isMobile: isMobileDevice(),
        isOnline: checkConnection(),
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform
    };
}

/**
 * Función para generar colores aleatorios (para gráficos)
 */
function generateColors(count) {
    const colors = [
        '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6',
        '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1'
    ];
    
    if (count <= colors.length) {
        return colors.slice(0, count);
    }
    
    // Generar colores adicionales si se necesitan más
    const additionalColors = [];
    for (let i = colors.length; i < count; i++) {
        const hue = (i * 137.508) % 360; // Golden angle
        additionalColors.push(`hsl(${hue}, 70%, 50%)`);
    }
    
    return [...colors, ...additionalColors];
}

// EXPORTAR FUNCIONES GLOBALES
window.debugLog = debugLog;
window.formatNumber = formatNumber;
window.capitalize = capitalize;
window.isMobileDevice = isMobileDevice;
window.checkConnection = checkConnection;
window.getDeviceInfo = getDeviceInfo;
window.generateColors = generateColors;

// ===========================================
// EVENTOS DE CONEXIÓN Y SINCRONIZACIÓN
// ===========================================

// Detectar cambios en la conexión
window.addEventListener('online', () => {
    UIUtils.updateConnectionStatus('online');
    UIUtils.showSuccess('Conexión restaurada');
    
    // Intentar sincronizar datos pendientes
    if (window.SyncManager && typeof window.SyncManager.syncPendingData === 'function') {
        setTimeout(() => {
            window.SyncManager.syncPendingData();
        }, 1000); // Esperar un segundo antes de sincronizar
    }
});

window.addEventListener('offline', () => {
    UIUtils.updateConnectionStatus('offline');
    UIUtils.showWarning('Sin conexión a internet. Los datos se guardarán localmente.');
});

// Detectar cuando la página pierde/gana el foco (para pausar/reanudar sincronización)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && checkConnection()) {
        // La página volvió a estar visible y hay conexión
        debugLog('Página visible, verificando sincronización...');
        
        if (window.SyncManager && typeof window.SyncManager.syncPendingData === 'function') {
            setTimeout(() => {
                window.SyncManager.syncPendingData();
            }, 2000);
        }
    }
});

// Inicializar estado de conexión
document.addEventListener('DOMContentLoaded', () => {
    const status = checkConnection() ? 'online' : 'offline';
    UIUtils.updateConnectionStatus(status);
    
    debugLog('Sistema inicializado:', {
        conexion: status,
        dispositivo: getDeviceInfo(),
        pendientes: StorageUtils.getPendingAttendance().length
    });
});

// Manejar errores de red globalmente
window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && event.reason.message && event.reason.message.includes('fetch')) {
        debugLog('Error de red detectado:', event.reason);
        UIUtils.updateConnectionStatus('offline');
    }
});

// ===========================================
// UTILIDADES GLOBALES AGREGADAS - CORRECCIONES
// ===========================================
// 🔧 FUNCIONES GLOBALES para normalización y validación consistente

/**
 * 🔧 AGREGADO: Función global para normalizar IDs de estudiantes consistentemente
 */
function normalizeStudentId(id) {
    if (id === null || id === undefined || id === '') {
        return '';
    }
    return String(id).trim();
}

/**
 * 🔧 AGREGADO: Función global para normalizar cualquier ID
 */
function normalizeId(id) {
    if (id === null || id === undefined || id === '') {
        return '';
    }
    return String(id).trim();
}

/**
 * 🔧 AGREGADO: Función global para validar registro de asistencia
 */
function validateAttendanceRecord(record) {
    const errors = [];
    
    if (!record || typeof record !== 'object') {
        errors.push('Registro de asistencia requerido');
        return { valid: false, errors };
    }
    
    // Validar ID_Clase (campo crítico)
    if (!record.ID_Clase || record.ID_Clase.toString().trim() === '') {
        errors.push('ID_Clase es requerido y no puede estar vacío');
    }
    
    // Validar ID de estudiante
    if (!record.Estudiante_ID || record.Estudiante_ID.toString().trim() === '') {
        errors.push('Estudiante_ID es requerido');
    }
    
    // Validar código de grupo
    if (!record.Grupo_Codigo || record.Grupo_Codigo.toString().trim() === '') {
        errors.push('Grupo_Codigo es requerido');
    }
    
    // Validar estado
    const validStates = ['Presente', 'Ausente', 'Justificada', 'Cancelada'];
    if (!record.Estado || !validStates.includes(record.Estado)) {
        errors.push(`Estado inválido: ${record.Estado}. Estados válidos: ${validStates.join(', ')}`);
    }
    
    // Validar fecha
    if (!record.Fecha) {
        errors.push('Fecha es requerida');
    } else if (!ValidationUtils.isValidDate(record.Fecha)) {
        errors.push('Formato de fecha inválido');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * 🔧 AGREGADO: Función para validar integridad de grupo de registros de asistencia
 */
function validateAttendanceGroup(records, expectedClassId = null) {
    console.log('🔍 Validando grupo de registros de asistencia...');
    
    if (!Array.isArray(records)) {
        return {
            valid: false,
            errors: ['Los registros deben ser un array'],
            summary: { total: 0, valid: 0, invalid: 0 }
        };
    }
    
    const results = {
        total: records.length,
        valid: 0,
        invalid: 0,
        errors: [],
        invalidRecords: []
    };
    
    records.forEach((record, index) => {
        const validation = validateAttendanceRecord(record);
        
        if (validation.valid) {
            results.valid++;
            
            // Validar ID_Clase específico si se proporciona
            if (expectedClassId && record.ID_Clase !== expectedClassId) {
                results.errors.push(`Registro ${index + 1}: ID_Clase no coincide (esperado: ${expectedClassId}, actual: ${record.ID_Clase})`);
                results.invalid++;
                results.valid--;
                results.invalidRecords.push({ index, record, errors: [`ID_Clase no coincide`] });
            }
        } else {
            results.invalid++;
            results.errors.push(`Registro ${index + 1}: ${validation.errors.join(', ')}`);
            results.invalidRecords.push({ index, record, errors: validation.errors });
        }
    });
    
    const isValid = results.invalid === 0;
    
    console.log(isValid ? '✅ Grupo de registros válido' : '❌ Grupo de registros inválido', {
        total: results.total,
        valid: results.valid,
        invalid: results.invalid,
        errorsCount: results.errors.length
    });
    
    return {
        valid: isValid,
        summary: results,
        errors: results.errors
    };
}

/**
 * 🔧 AGREGADO: Función para limpiar y normalizar datos de asistencia
 */
function cleanAttendanceData(rawData) {
    if (!rawData || typeof rawData !== 'object') {
        return {};
    }
    
    const cleaned = {};
    
    Object.entries(rawData).forEach(([studentId, record]) => {
        if (record && record.studentId && record.status) {
            cleaned[normalizeStudentId(studentId)] = {
                studentId: normalizeStudentId(record.studentId),
                status: record.status,
                justification: record.justification || '',
                description: record.description || '',
                timestamp: record.timestamp || DateUtils.getCurrentTimestamp()
            };
        }
    });
    
    return cleaned;
}

/**
 * 🔧 AGREGADO: Función para verificar consistencia del sistema
 */
function checkSystemConsistency() {
    console.log('🔍 Verificando consistencia del sistema...');
    
    const checks = {
        timestamp: new Date().toISOString(),
        services: {
            AttendanceService: {
                exists: !!window.AttendanceService,
                hasCreateRecord: typeof AttendanceService?.createAttendanceRecord === 'function',
                hasCreateGroup: typeof AttendanceService?.createGroupAttendanceRecords === 'function',
                hasSave: typeof AttendanceService?.saveAttendance === 'function'
            },
            ClassControlService: {
                exists: !!window.ClassControlService,
                hasHandleRealized: typeof ClassControlService?.handleClassRealized === 'function',
                hasValidate: typeof ClassControlService?.validateClassReport === 'function'
            },
            StudentService: {
                exists: !!window.StudentService,
                hasGetAll: typeof StudentService?.getAllStudents === 'function',
                hasNormalize: typeof StudentService?._normalizeStudent === 'function'
            }
        },
        controllers: {
            AttendanceController: {
                exists: !!window.AttendanceController,
                hasConfirmSave: typeof AttendanceController?.confirmFinalSave === 'function',
                hasValidateFlow: typeof AttendanceController?.validateAttendanceFlow === 'function'
            }
        },
        utils: {
            normalizeId: typeof normalizeId === 'function',
            normalizeStudentId: typeof normalizeStudentId === 'function',
            validateRecord: typeof validateAttendanceRecord === 'function',
            validateGroup: typeof validateAttendanceGroup === 'function',
            cleanData: typeof cleanAttendanceData === 'function'
        },
        appState: {
            exists: !!window.AppState,
            hasSelectedDate: !!window.AppState?.selectedDate,
            hasUser: !!window.AppState?.user
        }
    };
    
    // Verificar que todos los servicios críticos estén disponibles
    const criticalServices = [
        checks.services.AttendanceService.exists,
        checks.services.ClassControlService.exists,
        checks.services.StudentService.exists,
        checks.controllers.AttendanceController.exists,
        checks.appState.exists
    ];
    
    const allCriticalOK = criticalServices.every(Boolean);
    
    // Verificar funciones de utilidad
    const utilsOK = Object.values(checks.utils).every(Boolean);
    
    const systemOK = allCriticalOK && utilsOK;
    
    console.log(systemOK ? '✅ Sistema consistente' : '❌ Sistema inconsistente');
    console.log('📋 Detalles de verificación:', checks);
    
    return {
        consistent: systemOK,
        criticalServices: allCriticalOK,
        utilities: utilsOK,
        details: checks
    };
}

/**
 * 🔧 AGREGADO: Función de prueba para el flujo completo de asistencia
 */
async function testAttendanceFlow() {
    console.log('🧪 Probando flujo de asistencia...');
    
    try {
        // Verificar consistencia del sistema primero
        const consistency = checkSystemConsistency();
        if (!consistency.consistent) {
            throw new Error('Sistema inconsistente - verifique servicios');
        }
        
        // Datos de prueba
        const testData = {
            'EST001': { studentId: 'EST001', status: 'Presente' },
            'EST002': { studentId: 'EST002', status: 'Ausente' },
            'EST003': { studentId: 'EST003', status: 'Justificada', justification: 'Médica' }
        };
        
        // Limpiar datos
        const cleanedData = cleanAttendanceData(testData);
        console.log('📋 Datos limpiados:', cleanedData);
        
        // Simular creación de registros
        const testOptions = {
            idClase: 'TEST_CLASS_ID_12345',
            groupCode: 'TEST_GROUP',
            date: DateUtils.getCurrentDate(),
            classType: 'Regular',
            sentBy: 'test-user'
        };
        
        console.log('📝 Probando AttendanceService.createGroupAttendanceRecords...');
        const result = AttendanceService.createGroupAttendanceRecords(cleanedData, testOptions);
        
        console.log('📊 Resultado de prueba:', result.summary);
        
        // Validar registros creados
        const validation = validateAttendanceGroup(result.records, testOptions.idClase);
        console.log('✅ Validación:', validation.valid ? 'EXITOSA' : 'FALLIDA');
        
        if (!validation.valid) {
            console.error('❌ Errores de validación:', validation.errors);
        }
        
        return {
            success: validation.valid,
            records: result.records.length,
            errors: result.errors.length,
            validation: validation
        };
        
    } catch (error) {
        console.error('❌ Error en prueba de flujo:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ===========================================
// EXPORTAR FUNCIONES GLOBALMENTE
// ===========================================

// Hacer las funciones disponibles globalmente
window.normalizeStudentId = normalizeStudentId;
window.normalizeId = normalizeId;
window.validateAttendanceRecord = validateAttendanceRecord;
window.validateAttendanceGroup = validateAttendanceGroup;
window.cleanAttendanceData = cleanAttendanceData;
window.checkSystemConsistency = checkSystemConsistency;
window.testAttendanceFlow = testAttendanceFlow;

// ===========================================
// FUNCIONES DE DEBUGGING MEJORADAS
// ===========================================

/**
 * 🔧 MEJORADO: Información de debugging extendida
 */
window.getExtendedDebugInfo = function() {
    const basicInfo = typeof window.getAppDebugInfo === 'function' ? 
                     window.getAppDebugInfo() : {};
    
    const extendedInfo = {
        ...basicInfo,
        consistency: checkSystemConsistency(),
        pendingData: {
            attendance: StorageUtils.getPendingAttendance().length,
            drafts: StorageUtils.get('attendance_draft') ? 1 : 0
        },
        currentSession: {
            selectedDate: window.AppState?.selectedDate,
            connectionStatus: window.AppState?.connectionStatus,
            lastUpdate: new Date().toISOString()
        },
        validationTest: null
    };
    
    // Ejecutar prueba de validación si es seguro
    try {
        extendedInfo.validationTest = testAttendanceFlow();
    } catch (error) {
        extendedInfo.validationTest = { error: error.message };
    }
    
    return extendedInfo;
};

console.log('🔧 UTILIDADES GLOBALES CORREGIDAS AGREGADAS');
console.log('📋 Funciones disponibles:');
console.log('   - normalizeStudentId(id)');
console.log('   - normalizeId(id)');
console.log('   - validateAttendanceRecord(record)');
console.log('   - validateAttendanceGroup(records, expectedClassId)');
console.log('   - cleanAttendanceData(rawData)');
console.log('   - checkSystemConsistency()');
console.log('   - testAttendanceFlow()');
console.log('   - getExtendedDebugInfo()');

debugLog('utils.js - FUNCIONES GLOBALES DE CORRECCIÓN agregadas correctamente');
debugLog('utils.js cargado correctamente');
