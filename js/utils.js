
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
     * Obtiene el día de la semana actual en español
     */
    getCurrentDay() {
        const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        return days[new Date().getDay()];
    },

    /**
     * Convierte fecha a formato legible en español
     */
    formatDate(dateString) {
        const date = new Date(dateString);
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
     * Obtiene los días de la semana que contiene una cadena
     */
    parseDays(daysString) {
        if (!daysString) return [];
        
        const dayMap = {
            'lunes': 'lunes',
            'martes': 'martes',
            'miércoles': 'miércoles',
            'miercoles': 'miércoles', // Sin tilde
            'jueves': 'jueves',
            'viernes': 'viernes',
            'sábado': 'sábado',
            'sabado': 'sábado', // Sin tilde
            'domingo': 'domingo'
        };

        const days = daysString.toLowerCase().split(',').map(day => day.trim());
        return days.map(day => dayMap[day]).filter(Boolean);
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
            if (!group.dias) return false;
            const groupDays = DateUtils.parseDays(group.dias);
            return groupDays.includes(today);
        });
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
     * Formatea datos de asistencia para Google Sheets
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
                // Convertir header a formato camelCase y limpiar
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
     * Sistema de notificaciones
     */
    showNotification(message, type = 'info', duration = 3000) {
        const modal = document.getElementById('notification-modal');
        const content = document.getElementById('notification-content');
        
        if (!modal || !content) {
            console.warn('Modal de notificaciones no encontrado');
            return;
        }

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        content.innerHTML = `
            <div class="notification notification-${type}">
                <span class="icon">${icons[type]}</span>
                <div>
                    <p class="font-medium">${message}</p>
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
    }
};

// ===========================================
// UTILIDADES DE ALMACENAMIENTO LOCAL
// ===========================================

const StorageUtils = {
    /**
     * Guarda datos en localStorage
     */
    save(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
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
            const item = localStorage.getItem(key);
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
            localStorage.removeItem(key);
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
                if (key.startsWith('tennis_')) {
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
        const pending = this.get('tennis_pending_attendance', []);
        pending.push({
            ...data,
            id: DataUtils.generateId('PENDING'),
            timestamp: DateUtils.getCurrentTimestamp()
        });
        return this.save('tennis_pending_attendance', pending);
    },

    /**
     * Obtiene asistencias pendientes de sincronizar
     */
    getPendingAttendance() {
        return this.get('tennis_pending_attendance', []);
    },

    /**
     * Elimina asistencia pendiente después de sincronizar
     */
    removePendingAttendance(pendingId) {
        const pending = this.getPendingAttendance();
        const filtered = pending.filter(item => item.id !== pendingId);
        return this.save('tennis_pending_attendance', filtered);
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
    }
};

// ===========================================
// FUNCIONES GLOBALES DE UTILIDAD
// ===========================================

/**
 * Función global para cerrar notificaciones
 */
function closeNotification() {
    UIUtils.closeNotification();
}

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

// ===========================================
// EVENTOS DE CONEXIÓN
// ===========================================

// Detectar cambios en la conexión
window.addEventListener('online', () => {
    UIUtils.updateConnectionStatus('online');
    UIUtils.showSuccess('Conexión restaurada');
    
    // Intentar sincronizar datos pendientes
    if (window.SyncManager && typeof window.SyncManager.syncPendingData === 'function') {
        window.SyncManager.syncPendingData();
    }
});

window.addEventListener('offline', () => {
    UIUtils.updateConnectionStatus('offline');
    UIUtils.showWarning('Sin conexión a internet. Los datos se guardarán localmente.');
});

// Inicializar estado de conexión
document.addEventListener('DOMContentLoaded', () => {
    const status = checkConnection() ? 'online' : 'offline';
    UIUtils.updateConnectionStatus(status);
});
