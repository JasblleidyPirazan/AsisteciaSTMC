/**
 * COMPONENTE MODALES
 * ==================
 * Genera HTML puro para modales reutilizables (sin lógica)
 */

const ModalsView = {
    /**
     * Renderiza el modal de justificación
     */
    renderJustificationModal() {
        return `
            <div id="justification-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
                <div class="flex items-center justify-center min-h-screen p-4">
                    <div class="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-semibold">Agregar Justificación</h3>
                            <button onclick="ModalsController.close('justification-modal')" class="text-gray-400 hover:text-gray-600">
                                ✕
                            </button>
                        </div>
                        
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    Estudiante: <span id="justification-student-name" class="font-semibold text-primary-600"></span>
                                </label>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Tipo de Justificación</label>
                                <select id="justification-type" class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500">
                                    <option value="">Seleccionar tipo...</option>
                                    <option value="Médica">🏥 Médica</option>
                                    <option value="Personal">👤 Personal</option>
                                    <option value="Familiar">👨‍👩‍👧‍👦 Familiar</option>
                                    <option value="Académica">📚 Académica</option>
                                    <option value="Otra">📝 Otra</option>
                                </select>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Descripción (opcional)</label>
                                <textarea 
                                    id="justification-description" 
                                    class="w-full border border-gray-300 rounded-md px-3 py-2 h-20 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="Detalles adicionales de la justificación..."></textarea>
                            </div>
                        </div>
                        
                        <div class="mt-6 flex gap-3">
                            <button onclick="AttendanceController.saveJustification()" class="btn btn-primary flex-1">
                                ✅ Guardar Justificación
                            </button>
                            <button onclick="ModalsController.close('justification-modal')" class="btn btn-neutral">
                                ❌ Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza el modal de confirmación genérico
     */
    renderConfirmationModal() {
        return `
            <div id="confirmation-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
                <div class="flex items-center justify-center min-h-screen p-4">
                    <div class="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
                        <div id="confirmation-content">
                            <!-- Contenido dinámico -->
                        </div>
                        <div class="mt-6 flex gap-3">
                            <button id="confirmation-confirm" class="btn btn-primary flex-1">
                                ✅ Confirmar
                            </button>
                            <button id="confirmation-cancel" class="btn btn-neutral" onclick="ModalsController.close('confirmation-modal')">
                                ❌ Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza el modal de vista previa
     */
    renderPreviewModal() {
        return `
            <div id="preview-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
                <div class="flex items-center justify-center min-h-screen p-4">
                    <div class="bg-white rounded-lg max-w-4xl w-full max-h-90vh overflow-hidden shadow-xl">
                        <div class="flex justify-between items-center p-6 border-b border-gray-200">
                            <h3 class="text-lg font-semibold">Vista Previa</h3>
                            <button onclick="ModalsController.close('preview-modal')" class="text-gray-400 hover:text-gray-600">
                                ✕
                            </button>
                        </div>
                        <div class="p-6 overflow-y-auto max-h-96" id="preview-content">
                            <!-- Contenido dinámico -->
                        </div>
                        <div class="p-6 border-t border-gray-200 text-right">
                            <button onclick="ModalsController.close('preview-modal')" class="btn btn-neutral">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza el modal de loading
     */
    renderLoadingModal() {
        return `
            <div id="loading-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
                <div class="flex items-center justify-center min-h-screen p-4">
                    <div class="bg-white rounded-lg p-8 text-center shadow-xl">
                        <div class="spinner spinner-lg mx-auto mb-4"></div>
                        <h3 class="text-lg font-semibold mb-2" id="loading-title">Procesando...</h3>
                        <p class="text-gray-600" id="loading-message">Por favor espera...</p>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza el modal de notificaciones (ya existe en HTML principal)
     */
    renderNotificationModal() {
        return `
            <div id="notification-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
                <div class="flex items-center justify-center min-h-screen p-4">
                    <div class="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
                        <div id="notification-content">
                            <!-- Contenido dinámico -->
                        </div>
                        <div class="mt-4 text-right">
                            <button onclick="ModalsController.close('notification-modal')" class="btn btn-neutral">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza el modal de estadísticas de asistencia
     */
    renderAttendanceStatsModal() {
        return `
            <div id="attendance-stats-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
                <div class="flex items-center justify-center min-h-screen p-4">
                    <div class="bg-white rounded-lg max-w-2xl w-full shadow-xl">
                        <div class="flex justify-between items-center p-6 border-b border-gray-200">
                            <h3 class="text-lg font-semibold">Estadísticas de Asistencia</h3>
                            <button onclick="ModalsController.close('attendance-stats-modal')" class="text-gray-400 hover:text-gray-600">
                                ✕
                            </button>
                        </div>
                        <div class="p-6" id="attendance-stats-content">
                            <!-- Contenido dinámico -->
                        </div>
                        <div class="p-6 border-t border-gray-200 text-right">
                            <button onclick="ModalsController.close('attendance-stats-modal')" class="btn btn-neutral">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza todos los modales en un solo string (para agregar al HTML principal)
     */
    renderAllModals() {
        return `
            ${this.renderJustificationModal()}
            ${this.renderConfirmationModal()}
            ${this.renderPreviewModal()}
            ${this.renderLoadingModal()}
            ${this.renderAttendanceStatsModal()}
        `;
    },

    // ===========================================
    // CONTENIDO ESPECÍFICO PARA MODALES
    // ===========================================

    /**
     * Genera contenido para modal de confirmación
     */
    getConfirmationContent(data = {}) {
        const {
            title = 'Confirmar Acción',
            message = '¿Estás seguro de que quieres continuar?',
            icon = '❓',
            type = 'info'
        } = data;

        const iconColors = {
            info: 'text-blue-500',
            warning: 'text-yellow-500',
            danger: 'text-red-500',
            success: 'text-green-500'
        };

        return `
            <div class="text-center">
                <div class="text-6xl mb-4 ${iconColors[type] || iconColors.info}">${icon}</div>
                <h3 class="text-lg font-semibold mb-4">${title}</h3>
                <p class="text-gray-600">${message}</p>
            </div>
        `;
    },

    /**
     * Genera contenido para vista previa de asistencia
     */
    getAttendancePreviewContent(data = {}) {
        const {
            groupCode = '',
            selectedDate = '',
            attendance = {},
            stats = {}
        } = data;

        const formattedDate = DateUtils.formatDate(selectedDate);
        const attendanceEntries = Object.values(attendance);

        return `
            <div>
                <div class="mb-6">
                    <h4 class="font-bold text-lg mb-2">Resumen de Asistencia</h4>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div><strong>Grupo:</strong> ${groupCode}</div>
                        <div><strong>Fecha:</strong> ${formattedDate}</div>
                        <div><strong>Total registros:</strong> ${attendanceEntries.length}</div>
                        <div><strong>Tipo:</strong> ${data.attendanceType === 'reposition' ? 'Reposición Individual' : 'Clase Regular'}</div>
                    </div>
                </div>

                <!-- Estadísticas -->
                <div class="grid grid-cols-3 gap-4 mb-6">
                    <div class="bg-green-100 p-3 rounded text-center">
                        <div class="font-bold text-green-800 text-xl">${stats.present || 0}</div>
                        <div class="text-sm text-green-600">Presentes</div>
                    </div>
                    <div class="bg-red-100 p-3 rounded text-center">
                        <div class="font-bold text-red-800 text-xl">${stats.absent || 0}</div>
                        <div class="text-sm text-red-600">Ausentes</div>
                    </div>
                    <div class="bg-yellow-100 p-3 rounded text-center">
                        <div class="font-bold text-yellow-800 text-xl">${stats.justified || 0}</div>
                        <div class="text-sm text-yellow-600">Justificadas</div>
                    </div>
                </div>

                <!-- Lista detallada -->
                <div class="space-y-2">
                    <h5 class="font-semibold mb-3">Detalle por Estudiante:</h5>
                    ${attendanceEntries.map(record => `
                        <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                            <span class="font-medium">${this._getStudentName(record.studentId)}</span>
                            <div class="flex items-center">
                                <span class="mr-2">${this._getStatusIcon(record.status)}</span>
                                <span class="font-medium">${record.status}</span>
                                ${record.justification ? `<span class="text-xs text-gray-500 ml-2">(${record.justification})</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },
    /**
     * Genera contenido para vista previa de asistencia (ACTUALIZADA CON ASISTENTE)
     */
    ModalsView.getAttendancePreviewContent = function(data = {}) {
        const {
            groupCode = '',
            selectedDate = '',
            attendance = {},
            stats = {},
            selectedAssistant = null,
            attendanceType = 'regular'
        } = data;
    
        const formattedDate = DateUtils.formatDate(selectedDate);
        const attendanceEntries = Object.values(attendance);
    
        return `
            <div>
                <div class="mb-6">
                    <h4 class="font-bold text-lg mb-2">Resumen de Asistencia</h4>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div><strong>Grupo:</strong> ${groupCode}</div>
                        <div><strong>Fecha:</strong> ${formattedDate}</div>
                        <div><strong>Total registros:</strong> ${attendanceEntries.length}</div>
                        <div><strong>Tipo:</strong> ${attendanceType === 'reposition' ? 'Reposición Individual' : 'Clase Regular'}</div>
                    </div>
                    
                    ${selectedAssistant ? `
                        <div class="mt-3 p-3 bg-blue-50 rounded-lg">
                            <div class="flex items-center text-blue-800">
                                <span class="text-xl mr-2">👨‍🏫</span>
                                <div>
                                    <strong>Asistente:</strong> ${selectedAssistant.nombre}
                                    <div class="text-sm text-blue-600">ID: ${selectedAssistant.id}</div>
                                </div>
                            </div>
                        </div>
                    ` : `
                        <div class="mt-3 p-3 bg-gray-50 rounded-lg">
                            <div class="flex items-center text-gray-600">
                                <span class="text-xl mr-2">👤</span>
                                <span><strong>Asistente:</strong> No especificado</span>
                            </div>
                        </div>
                    `}
                </div>
    
                <!-- Estadísticas -->
                <div class="grid grid-cols-3 gap-4 mb-6">
                    <div class="bg-green-100 p-3 rounded text-center">
                        <div class="font-bold text-green-800 text-xl">${stats.present || 0}</div>
                        <div class="text-sm text-green-600">Presentes</div>
                    </div>
                    <div class="bg-red-100 p-3 rounded text-center">
                        <div class="font-bold text-red-800 text-xl">${stats.absent || 0}</div>
                        <div class="text-sm text-red-600">Ausentes</div>
                    </div>
                    <div class="bg-yellow-100 p-3 rounded text-center">
                        <div class="font-bold text-yellow-800 text-xl">${stats.justified || 0}</div>
                        <div class="text-sm text-yellow-600">Justificadas</div>
                    </div>
                </div>
    
                <!-- Lista detallada -->
                <div class="space-y-2">
                    <h5 class="font-semibold mb-3">Detalle por Estudiante:</h5>
                    ${attendanceEntries.length > 0 ? attendanceEntries.map(record => `
                        <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                            <span class="font-medium">${this._getStudentName(record.studentId)}</span>
                            <div class="flex items-center">
                                <span class="mr-2">${this._getStatusIcon(record.status)}</span>
                                <span class="font-medium">${record.status}</span>
                                ${record.justification ? `<span class="text-xs text-gray-500 ml-2">(${record.justification})</span>` : ''}
                            </div>
                        </div>
                    `).join('') : `
                        <div class="text-center py-4 text-gray-500">
                            <p>No hay registros de asistencia</p>
                        </div>
                    `}
                </div>
    
                <!-- Información adicional -->
                <div class="mt-6 pt-4 border-t border-gray-200">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                        <div>
                            <strong>Porcentaje de asistencia:</strong> 
                            ${attendanceEntries.length > 0 ? Math.round(((stats.present || 0) / attendanceEntries.length) * 100) : 0}%
                        </div>
                        <div>
                            <strong>Total procesado:</strong> 
                            ${attendanceEntries.length} de ${attendanceEntries.length} estudiantes
                        </div>
                    </div>
                </div>
    
                <!-- Nota importante -->
                <div class="mt-4 p-3 bg-blue-50 rounded-lg">
                    <div class="flex items-start">
                        <span class="text-blue-500 mr-2">ℹ️</span>
                        <div class="text-sm text-blue-700">
                            <strong>Nota:</strong> Esta vista previa muestra los datos tal como se van a guardar. 
                            Una vez guardados, los datos no podrán ser modificados.
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    
    /**
     * Genera contenido para estadísticas de asistencia
     */
    getAttendanceStatsContent(data = {}) {
        const {
            totalStudents = 0,
            attendanceRecords = {},
            groupInfo = {}
        } = data;

        const registeredCount = Object.keys(attendanceRecords).length;
        const stats = AttendanceService.calculateAttendanceStats(Object.values(attendanceRecords));

        return `
            <div>
                <!-- Resumen general -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div class="text-center p-4 bg-blue-50 rounded">
                        <div class="text-2xl font-bold text-blue-600">${totalStudents}</div>
                        <div class="text-sm text-blue-600">Total Estudiantes</div>
                    </div>
                    <div class="text-center p-4 bg-gray-50 rounded">
                        <div class="text-2xl font-bold text-gray-600">${registeredCount}</div>
                        <div class="text-sm text-gray-600">Registrados</div>
                    </div>
                    <div class="text-center p-4 bg-green-50 rounded">
                        <div class="text-2xl font-bold text-green-600">${stats.present}</div>
                        <div class="text-sm text-green-600">Presentes</div>
                    </div>
                    <div class="text-center p-4 bg-yellow-50 rounded">
                        <div class="text-2xl font-bold text-yellow-600">${Math.round((registeredCount / totalStudents) * 100)}%</div>
                        <div class="text-sm text-yellow-600">Progreso</div>
                    </div>
                </div>

                <!-- Gráfico de barras simple -->
                <div class="mb-6">
                    <h5 class="font-semibold mb-3">Distribución de Asistencia:</h5>
                    <div class="space-y-2">
                        <div class="flex items-center">
                            <div class="w-20 text-sm">Presentes:</div>
                            <div class="flex-1 bg-gray-200 rounded h-6 overflow-hidden">
                                <div class="bg-green-500 h-full transition-all duration-300" style="width: ${totalStudents > 0 ? (stats.present / totalStudents) * 100 : 0}%"></div>
                            </div>
                            <div class="w-12 text-right text-sm">${stats.present}</div>
                        </div>
                        <div class="flex items-center">
                            <div class="w-20 text-sm">Ausentes:</div>
                            <div class="flex-1 bg-gray-200 rounded h-6 overflow-hidden">
                                <div class="bg-red-500 h-full transition-all duration-300" style="width: ${totalStudents > 0 ? (stats.absent / totalStudents) * 100 : 0}%"></div>
                            </div>
                            <div class="w-12 text-right text-sm">${stats.absent}</div>
                        </div>
                        <div class="flex items-center">
                            <div class="w-20 text-sm">Justificadas:</div>
                            <div class="flex-1 bg-gray-200 rounded h-6 overflow-hidden">
                                <div class="bg-yellow-500 h-full transition-all duration-300" style="width: ${totalStudents > 0 ? (stats.justified / totalStudents) * 100 : 0}%"></div>
                            </div>
                            <div class="w-12 text-right text-sm">${stats.justified}</div>
                        </div>
                        <div class="flex items-center">
                            <div class="w-20 text-sm">Sin registrar:</div>
                            <div class="flex-1 bg-gray-200 rounded h-6 overflow-hidden">
                                <div class="bg-gray-400 h-full transition-all duration-300" style="width: ${totalStudents > 0 ? ((totalStudents - registeredCount) / totalStudents) * 100 : 0}%"></div>
                            </div>
                            <div class="w-12 text-right text-sm">${totalStudents - registeredCount}</div>
                        </div>
                    </div>
                </div>

                <!-- Información adicional -->
                <div class="bg-blue-50 p-4 rounded">
                    <h6 class="font-medium text-blue-800 mb-2">💡 Información:</h6>
                    <ul class="text-sm text-blue-700 space-y-1">
                        <li>• Completa el registro de todos los estudiantes antes de guardar</li>
                        <li>• Las justificaciones requieren especificar el tipo y motivo</li>
                        <li>• Los datos se sincronizan automáticamente cuando hay conexión</li>
                    </ul>
                </div>
            </div>
        `;
    },

    /**
     * Genera contenido para modal de éxito después de guardar
     */
    getSuccessContent(data = {}) {
        const {
            title = 'Operación Exitosa',
            message = 'Los datos se han guardado correctamente',
            details = [],
            actions = []
        } = data;

        return `
            <div class="text-center">
                <div class="text-6xl mb-4 text-green-500">✅</div>
                <h3 class="text-xl font-bold mb-4">${title}</h3>
                <p class="text-gray-600 mb-4">${message}</p>
                
                ${details.length > 0 ? `
                    <div class="bg-green-50 p-4 rounded mb-4 text-left">
                        <h5 class="font-medium text-green-800 mb-2">Detalles:</h5>
                        <ul class="text-sm text-green-700 space-y-1">
                            ${details.map(detail => `<li>• ${detail}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                
                ${actions.length > 0 ? `
                    <div class="flex gap-3 justify-center">
                        ${actions.map(action => `
                            <button onclick="${action.handler}" class="btn ${action.class || 'btn-primary'}">
                                ${action.label}
                            </button>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    },

    // ===========================================
    // MÉTODOS AUXILIARES PRIVADOS
    // ===========================================

    /**
     * Obtiene el nombre de un estudiante por ID
     */
    _getStudentName(studentId) {
        const student = window.AppState.estudiantes.find(s => s.id === studentId);
        return student ? student.nombre : studentId;
    },

    /**
     * Obtiene el icono para un estado de asistencia
     */
    _getStatusIcon(status) {
        const icons = {
            'Presente': '✅',
            'Ausente': '❌',
            'Justificada': '📝',
            'Cancelada': '🚫'
        };
        return icons[status] || '❓';
    }
};

/**
 * CONTROLADOR DE MODALES
 * ======================
 * Maneja la apertura, cierre y comportamiento de modales
 */
const ModalsController = {
    /**
     * Abre un modal
     */
    open(modalId, focusElement = null) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            document.body.classList.add('no-scroll');
            
            // Auto-focus en elemento específico
            if (focusElement) {
                setTimeout(() => {
                    const element = modal.querySelector(focusElement);
                    if (element) element.focus();
                }, 100);
            }
            
            debugLog(`Modal abierto: ${modalId}`);
        }
    },

    /**
     * Cierra un modal
     */
    close(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
            document.body.classList.remove('no-scroll');
            
            // Limpiar formularios si existen
            this._clearModalForms(modal);
            
            debugLog(`Modal cerrado: ${modalId}`);
        }
    },


        /**
     * Genera contenido para estadísticas de asistencia (ACTUALIZADA CON ASISTENTE)
     */
    ModalsView.getAttendanceStatsContent = function(data = {}) {
        const {
            totalStudents = 0,
            attendanceRecords = {},
            groupInfo = {},
            selectedAssistant = null
        } = data;
    
        const registeredCount = Object.keys(attendanceRecords).length;
        const stats = AttendanceService.calculateAttendanceStats(Object.values(attendanceRecords));
    
        return `
            <div>
                <!-- Información del responsable -->
                ${selectedAssistant ? `
                    <div class="mb-6 p-4 bg-blue-50 rounded-lg">
                        <div class="flex items-center">
                            <span class="text-2xl mr-3">👨‍🏫</span>
                            <div>
                                <h5 class="font-semibold text-blue-800">Asistente Responsable</h5>
                                <p class="text-blue-600">${selectedAssistant.nombre} (ID: ${selectedAssistant.id})</p>
                            </div>
                        </div>
                    </div>
                ` : `
                    <div class="mb-6 p-4 bg-gray-50 rounded-lg">
                        <div class="flex items-center">
                            <span class="text-2xl mr-3">👤</span>
                            <div>
                                <h5 class="font-semibold text-gray-700">Asistente Responsable</h5>
                                <p class="text-gray-600">No especificado</p>
                            </div>
                        </div>
                    </div>
                `}
    
                <!-- Resumen general -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div class="text-center p-4 bg-blue-50 rounded">
                        <div class="text-2xl font-bold text-blue-600">${totalStudents}</div>
                        <div class="text-sm text-blue-600">Total Estudiantes</div>
                    </div>
                    <div class="text-center p-4 bg-gray-50 rounded">
                        <div class="text-2xl font-bold text-gray-600">${registeredCount}</div>
                        <div class="text-sm text-gray-600">Registrados</div>
                    </div>
                    <div class="text-center p-4 bg-green-50 rounded">
                        <div class="text-2xl font-bold text-green-600">${stats.present}</div>
                        <div class="text-sm text-green-600">Presentes</div>
                    </div>
                    <div class="text-center p-4 bg-yellow-50 rounded">
                        <div class="text-2xl font-bold text-yellow-600">${Math.round((registeredCount / totalStudents) * 100)}%</div>
                        <div class="text-sm text-yellow-600">Progreso</div>
                    </div>
                </div>
    
                <!-- Gráfico de barras simple -->
                <div class="mb-6">
                    <h5 class="font-semibold mb-3">Distribución de Asistencia:</h5>
                    <div class="space-y-2">
                        <div class="flex items-center">
                            <div class="w-20 text-sm">Presentes:</div>
                            <div class="flex-1 bg-gray-200 rounded h-6 overflow-hidden">
                                <div class="bg-green-500 h-full transition-all duration-300" style="width: ${totalStudents > 0 ? (stats.present / totalStudents) * 100 : 0}%"></div>
                            </div>
                            <div class="w-12 text-right text-sm">${stats.present}</div>
                        </div>
                        <div class="flex items-center">
                            <div class="w-20 text-sm">Ausentes:</div>
                            <div class="flex-1 bg-gray-200 rounded h-6 overflow-hidden">
                                <div class="bg-red-500 h-full transition-all duration-300" style="width: ${totalStudents > 0 ? (stats.absent / totalStudents) * 100 : 0}%"></div>
                            </div>
                            <div class="w-12 text-right text-sm">${stats.absent}</div>
                        </div>
                        <div class="flex items-center">
                            <div class="w-20 text-sm">Justificadas:</div>
                            <div class="flex-1 bg-gray-200 rounded h-6 overflow-hidden">
                                <div class="bg-yellow-500 h-full transition-all duration-300" style="width: ${totalStudents > 0 ? (stats.justified / totalStudents) * 100 : 0}%"></div>
                            </div>
                            <div class="w-12 text-right text-sm">${stats.justified}</div>
                        </div>
                        <div class="flex items-center">
                            <div class="w-20 text-sm">Sin registrar:</div>
                            <div class="flex-1 bg-gray-200 rounded h-6 overflow-hidden">
                                <div class="bg-gray-400 h-full transition-all duration-300" style="width: ${totalStudents > 0 ? ((totalStudents - registeredCount) / totalStudents) * 100 : 0}%"></div>
                            </div>
                            <div class="w-12 text-right text-sm">${totalStudents - registeredCount}</div>
                        </div>
                    </div>
                </div>
    
                <!-- Información del grupo -->
                ${groupInfo.descriptor ? `
                    <div class="mb-6 p-4 bg-primary-50 rounded-lg">
                        <h5 class="font-semibold text-primary-800 mb-2">Información del Grupo:</h5>
                        <div class="grid grid-cols-2 gap-2 text-sm text-primary-700">
                            <div><strong>Grupo:</strong> ${groupInfo.descriptor}</div>
                            <div><strong>Profesor:</strong> ${groupInfo.profe || 'N/A'}</div>
                            <div><strong>Horario:</strong> ${groupInfo.hora || 'N/A'}</div>
                            <div><strong>Cancha:</strong> ${groupInfo.cancha || 'N/A'}</div>
                        </div>
                    </div>
                ` : ''}
    
                <!-- Información adicional -->
                <div class="bg-blue-50 p-4 rounded">
                    <h6 class="font-medium text-blue-800 mb-2">💡 Información:</h6>
                    <ul class="text-sm text-blue-700 space-y-1">
                        <li>• Completa el registro de todos los estudiantes antes de guardar</li>
                        <li>• Las justificaciones requieren especificar el tipo y motivo</li>
                        <li>• Los datos se sincronizan automáticamente cuando hay conexión</li>
                        ${selectedAssistant ? `<li>• Asistente responsable: ${selectedAssistant.nombre}</li>` : `<li>• No se especificó asistente responsable</li>`}
                    </ul>
                </div>
            </div>
        `;
    };

    /**
     * Muestra modal de confirmación
     */
    showConfirmation(data = {}, onConfirm = null) {
        const content = ModalsView.getConfirmationContent(data);
        const contentDiv = document.getElementById('confirmation-content');
        const confirmBtn = document.getElementById('confirmation-confirm');
        
        if (contentDiv) {
            contentDiv.innerHTML = content;
        }
        
        if (confirmBtn && onConfirm) {
            confirmBtn.onclick = () => {
                this.close('confirmation-modal');
                onConfirm();
            };
        }
        
        this.open('confirmation-modal');
    },

    /**
     * Muestra modal de vista previa
     */
    showPreview(content) {
        const contentDiv = document.getElementById('preview-content');
        if (contentDiv) {
            contentDiv.innerHTML = content;
        }
        this.open('preview-modal');
    },

    /**
     * Muestra modal de loading
     */
    showLoading(title = 'Procesando...', message = 'Por favor espera...') {
        const titleElement = document.getElementById('loading-title');
        const messageElement = document.getElementById('loading-message');
        
        if (titleElement) titleElement.textContent = title;
        if (messageElement) messageElement.textContent = message;
        
        const modal = document.getElementById('loading-modal');
        if (modal) {
            modal.classList.remove('hidden');
            // No agregar no-scroll para loading
        }
    },

    /**
     * Oculta modal de loading
     */
    hideLoading() {
        this.close('loading-modal');
    },

    /**
     * Muestra modal de estadísticas
     */
    showAttendanceStats(data = {}) {
        const content = ModalsView.getAttendanceStatsContent(data);
        const contentDiv = document.getElementById('attendance-stats-content');
        
        if (contentDiv) {
            contentDiv.innerHTML = content;
        }
        
        this.open('attendance-stats-modal');
    },

    // ===========================================
    // MÉTODOS PRIVADOS
    // ===========================================

    /**
     * Limpia formularios dentro de un modal
     */
    _clearModalForms(modal) {
        const inputs = modal.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            if (input.type !== 'button' && input.type !== 'submit') {
                if (input.type === 'checkbox' || input.type === 'radio') {
                    input.checked = false;
                } else {
                    input.value = '';
                }
            }
        });
    }
};

// Cerrar modales al hacer clic fuera
document.addEventListener('click', (event) => {
    if (event.target.classList.contains('fixed') && event.target.classList.contains('inset-0')) {
        const modalId = event.target.id;
        if (modalId && modalId.includes('modal')) {
            ModalsController.close(modalId);
        }
    }
});

// Cerrar modales con Escape
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        const visibleModals = document.querySelectorAll('.fixed.inset-0:not(.hidden)');
        visibleModals.forEach(modal => {
            if (modal.id && modal.id.includes('modal')) {
                ModalsController.close(modal.id);
            }
        });
    }
});

// Hacer disponibles globalmente
window.ModalsView = ModalsView;
window.ModalsController = ModalsController;

debugLog('modals.js (component) cargado correctamente');
