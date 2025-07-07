/**
 * COMPONENTE FORMULARIO DE ASISTENCIA
 * ===================================
 * Genera HTML puro para formularios de asistencia (sin lógica)
 */

const AttendanceFormView = {
    /**
     * Renderiza la pregunta inicial sobre el estado de la clase
     */
    renderClassStatusQuestion(data = {}) {
        const {
            group = {},
            selectedDate = DateUtils.getCurrentDate()
        } = data;

        const formattedDate = DateUtils.formatDate(selectedDate);

        return `
            <div class="container">
                <!-- Header -->
                ${this.renderHeader('Estado de la Clase', formattedDate, 'AppController.showDashboard()')}

                <!-- Información del Grupo -->
                ${this.renderGroupInfo(group, 'Verificar Estado')}

                <!-- Pregunta Principal -->
                ${this.renderClassStatusOptions(group.codigo)}
            </div>
        `;
    },

    /**
     * Renderiza el formulario principal de asistencia
     */
    renderAttendanceForm(data = {}) {
        const {
            group = {},
            students = [],
            selectedDate = DateUtils.getCurrentDate(),
            attendanceType = 'regular'
        } = data;

        const formattedDate = DateUtils.formatDate(selectedDate);
        const backAction = attendanceType === 'reposition' 
            ? 'RepositionController.showSelector()' 
            : `AttendanceController.showClassStatusQuestion('${group.codigo}')`;

        return `
            <div class="container">
                <!-- Header -->
                ${this.renderHeader('Registro de Asistencia', formattedDate, backAction)}

                <!-- Información del Grupo -->
                ${this.renderGroupInfo(group, attendanceType === 'reposition' ? 'Reposición Individual' : null, students.length)}

                <!-- Controles de Asistencia Masiva -->
                ${this.renderMassControls(attendanceType)}

                <!-- Lista de Estudiantes -->
                ${this.renderStudentsList(students, attendanceType)}

                <!-- Acciones Finales -->
                ${this.renderFinalActions(group.codigo, attendanceType)}
            </div>
        `;
    },

    /**
     * Renderiza el formulario de cancelación
     */
    renderCancellationForm(data = {}) {
        const {
            group = {},
            selectedDate = DateUtils.getCurrentDate()
        } = data;

        const formattedDate = DateUtils.formatDate(selectedDate);

        return `
            <div class="container">
                <!-- Header -->
                ${this.renderHeader('Registrar Cancelación', formattedDate, `AttendanceController.showClassStatusQuestion('${group.codigo}')`)}

                <!-- Información del Grupo (Cancelada) -->
                ${this.renderCancelledGroupInfo(group)}

                <!-- Formulario de Cancelación -->
                ${this.renderCancellationOptions(group.codigo)}
            </div>
        `;
    },

    /**
     * Renderiza el selector de estudiantes para reposición
     */
    renderRepositionSelector(data = {}) {
        const {
            students = [],
            selectedDate = DateUtils.getCurrentDate()
        } = data;

        const formattedDate = DateUtils.formatDate(selectedDate);

        return `
            <div class="container">
                <!-- Header -->
                ${this.renderHeader('Reposición Individual', formattedDate, 'AppController.showDashboard()')}

                <!-- Información de Reposición -->
                ${this.renderRepositionInfo()}

                <!-- Buscador de Estudiantes -->
                ${this.renderStudentSearch()}

                <!-- Lista de Estudiantes Disponibles -->
                ${this.renderAvailableStudentsList(students)}

                <!-- Botón para continuar con seleccionados -->
                ${this.renderRepositionContinueButton()}
            </div>
        `;
    },

    // ===========================================
    // COMPONENTES REUTILIZABLES
    // ===========================================

    /**
     * Renderiza el header común
     */
    renderHeader(title, date, backAction) {
        return `
            <header class="flex items-center justify-between mb-6 bg-white rounded-lg p-6 shadow-sm">
                <div class="flex items-center">
                    <button onclick="${backAction}" class="btn btn-neutral mr-4">
                        ← Volver
                    </button>
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">${title}</h1>
                        <p class="text-gray-600">${date}</p>
                    </div>
                </div>
                <div class="connection-status status-indicator ${window.AppState.connectionStatus}">
                    ${window.AppState.connectionStatus === 'online' ? 'En línea' : 'Sin conexión'}
                </div>
            </header>
        `;
    },

    /**
     * Renderiza la información del grupo
     */
    renderGroupInfo(group, subtitle = null, studentCount = null) {
        const bgClass = subtitle === 'Reposición Individual' ? 
            'bg-gradient-to-r from-secondary-500 to-secondary-600' :
            'bg-gradient-to-r from-primary-500 to-primary-600';

        return `
            <div class="${bgClass} rounded-lg p-6 mb-6 text-white">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-xl font-bold mb-2">${group.descriptor || 'Grupo sin nombre'}</h2>
                        ${subtitle ? `<p class="opacity-90">${subtitle}</p>` : ''}
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4">
                            <div class="flex items-center">
                                <span class="mr-2">👨‍🏫</span>
                                <span>Prof. ${group.profe || 'Sin profesor'}</span>
                            </div>
                            <div class="flex items-center">
                                <span class="mr-2">🕐</span>
                                <span>${group.hora || 'Sin horario'}</span>
                            </div>
                            <div class="flex items-center">
                                <span class="mr-2">🎾</span>
                                <span>Cancha ${group.cancha || 'N/A'}</span>
                            </div>
                            <div class="flex items-center">
                                <span class="mr-2">🏆</span>
                                <span>Nivel ${group.bola || 'Verde'}</span>
                            </div>
                        </div>
                    </div>
                    ${studentCount !== null ? `
                        <div class="text-right">
                            <div class="text-3xl font-bold" id="total-students-count">${studentCount}</div>
                            <div class="text-sm opacity-90">Estudiantes</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    /**
     * Renderiza la información del grupo cancelado
     */
    renderCancelledGroupInfo(group) {
        return `
            <div class="bg-gradient-to-r from-red-500 to-red-600 rounded-lg p-6 mb-6 text-white">
                <div class="text-center">
                    <h2 class="text-xl font-bold mb-2">${group.descriptor || 'Grupo sin nombre'}</h2>
                    <p class="opacity-90">Clase cancelada</p>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza las opciones de estado de clase
     */
    renderClassStatusOptions(groupCode) {
        return `
            <div class="bg-white rounded-lg p-8 shadow-sm text-center">
                <div class="max-w-md mx-auto">
                    <div class="text-6xl mb-6">❓</div>
                    <h3 class="text-2xl font-bold text-gray-900 mb-4">
                        ¿Se realizó esta clase?
                    </h3>
                    <p class="text-gray-600 mb-8">
                        Indica si la clase se llevó a cabo normalmente o si fue cancelada
                    </p>
                    
                    <!-- Opciones -->
                    <div class="space-y-4">
                        <button 
                            onclick="AttendanceController.classWasHeld('${groupCode}')" 
                            class="w-full btn btn-primary btn-lg p-6 flex items-center justify-center hover:shadow-lg transition-shadow"
                        >
                            <span class="text-3xl mr-4">✅</span>
                            <div class="text-left">
                                <div class="font-bold">Sí, se realizó</div>
                                <div class="text-sm opacity-90">Registrar asistencia de estudiantes</div>
                            </div>
                        </button>
                        
                        <button 
                            onclick="AttendanceController.classWasCancelled('${groupCode}')" 
                            class="w-full btn btn-danger btn-lg p-6 flex items-center justify-center hover:shadow-lg transition-shadow"
                        >
                            <span class="text-3xl mr-4">❌</span>
                            <div class="text-left">
                                <div class="font-bold">No, fue cancelada</div>
                                <div class="text-sm opacity-90">Registrar motivo de cancelación</div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza controles masivos de asistencia
     */
    renderMassControls(attendanceType) {
        const extraButton = attendanceType === 'regular' ? `
            <button onclick="RepositionController.showSelector()" class="btn btn-secondary">
                ➕ Crear Reposición Individual
            </button>
        ` : '';

        return `
            <div class="bg-white rounded-lg p-6 mb-6 shadow-sm">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-semibold">Controles Rápidos</h3>
                    ${extraButton}
                </div>
                <div class="flex flex-wrap gap-3">
                    <button onclick="AttendanceController.markAllAttendance('Presente')" class="btn btn-primary">
                        ✅ Marcar Todos Presentes
                    </button>
                    <button onclick="AttendanceController.markAllAttendance('Ausente')" class="btn btn-danger">
                        ❌ Marcar Todos Ausentes
                    </button>
                    <button onclick="AttendanceController.clearAllAttendance()" class="btn btn-neutral">
                        🔄 Limpiar Todo
                    </button>
                    <button onclick="AttendanceController.showAttendanceStats()" class="btn btn-outline">
                        📊 Ver Estadísticas
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza la lista de estudiantes
     */
    renderStudentsList(students, attendanceType) {
        return `
            <div class="bg-white rounded-lg shadow-sm mb-6">
                <div class="p-6 border-b border-gray-200">
                    <div class="flex justify-between items-center">
                        <h3 class="text-lg font-semibold">
                            ${attendanceType === 'reposition' ? 'Estudiantes Seleccionados' : 'Lista de Estudiantes'}
                        </h3>
                        <div id="attendance-summary" class="text-sm text-gray-600">
                            Sin registros
                        </div>
                    </div>
                </div>
                
                <div class="divide-y divide-gray-200" id="students-list">
                    ${students.map(student => this.renderStudentItem(student, attendanceType)).join('')}
                </div>
            </div>
        `;
    },

    /**
     * Renderiza un item de estudiante
     */
    renderStudentItem(student, attendanceType = 'regular') {
        const extraInfo = attendanceType === 'reposition' && student.grupo_principal ? 
            `<p class="text-xs text-blue-600">Grupo original: ${student.grupo_principal}</p>` : '';

        const removeButton = attendanceType === 'reposition' ? `
            <button onclick="RepositionController.removeStudent('${student.id}')" 
                    class="btn btn-sm btn-outline text-red-600 border-red-300 hover:bg-red-50 ml-2">
                🗑️ Remover
            </button>
        ` : '';

        return `
            <div class="student-item p-4 hover:bg-gray-50 transition-colors" data-student-id="${student.id}">
                <div class="flex justify-between items-center">
                    <div class="student-info">
                        <h4 class="font-medium text-gray-900">${student.nombre || 'Sin nombre'}</h4>
                        <p class="text-sm text-gray-500">ID: ${student.id}</p>
                        ${extraInfo}
                    </div>
                    <div class="student-actions flex gap-2">
                        <button class="btn btn-sm btn-outline" 
                                onclick="AttendanceController.markAttendance('${student.id}', 'Presente')">
                            ✅ Presente
                        </button>
                        <button class="btn btn-sm btn-outline" 
                                onclick="AttendanceController.markAttendance('${student.id}', 'Ausente')">
                            ❌ Ausente
                        </button>
                        <button class="btn btn-sm btn-outline" 
                                onclick="AttendanceController.markAttendance('${student.id}', 'Justificada')">
                            📝 Justificada
                        </button>
                        ${removeButton}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza las acciones finales
     */
    renderFinalActions(groupCode, attendanceType) {
        const saveAction = attendanceType === 'reposition' 
            ? 'RepositionController.saveAttendance()' 
            : `AttendanceController.saveAttendanceData('${groupCode}')`;

        return `
            <div class="bg-white rounded-lg p-6 shadow-sm">
                <div class="flex flex-col md:flex-row gap-4">
                    <button 
                        onclick="${saveAction}" 
                        class="btn btn-primary flex-1 btn-lg"
                        id="save-attendance-btn"
                    >
                        💾 Guardar Asistencia
                    </button>
                    <button onclick="AttendanceController.previewAttendance('${groupCode}')" class="btn btn-secondary">
                        👁️ Vista Previa
                    </button>
                    <button onclick="AttendanceController.exportAttendance('${groupCode}')" class="btn btn-outline">
                        📄 Exportar
                    </button>
                </div>
                
                <div class="mt-4 text-sm text-gray-500 text-center">
                    <p>💡 Los datos se guardan automáticamente en modo offline si no hay conexión</p>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza las opciones de cancelación
     */
    renderCancellationOptions(groupCode) {
        const reasons = [
            { value: 'Lluvia', icon: '🌧️', title: 'Lluvia', desc: 'Condiciones climáticas' },
            { value: 'Festivo', icon: '🎉', title: 'Festivo', desc: 'Día feriado' },
            { value: 'Mantenimiento', icon: '🔧', title: 'Mantenimiento', desc: 'Cancha en reparación' },
            { value: 'Enfermedad Profesor', icon: '🤒', title: 'Profesor enfermo', desc: 'Incapacidad médica' },
            { value: 'Emergencia', icon: '🚨', title: 'Emergencia', desc: 'Situación imprevista' },
            { value: 'Otro', icon: '📝', title: 'Otro motivo', desc: 'Especificar abajo' }
        ];

        return `
            <div class="bg-white rounded-lg p-6 shadow-sm">
                <h3 class="text-lg font-semibold mb-4">Motivo de la Cancelación</h3>
                
                <div class="space-y-6">
                    <!-- Motivos predefinidos -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-3">
                            Seleccionar motivo:
                        </label>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            ${reasons.map(reason => `
                                <label class="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                                    <input type="radio" name="cancellation-reason" value="${reason.value}" class="mr-3">
                                    <div>
                                        <div class="font-medium">${reason.icon} ${reason.title}</div>
                                        <div class="text-sm text-gray-500">${reason.desc}</div>
                                    </div>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    
                    <!-- Descripción adicional -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            Descripción adicional (opcional):
                        </label>
                        <textarea 
                            id="cancellation-description" 
                            class="w-full border border-gray-300 rounded-md px-3 py-2 h-24"
                            placeholder="Detalles adicionales sobre la cancelación..."></textarea>
                    </div>
                    
                    <!-- Información importante -->
                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <h4 class="font-medium text-yellow-800 mb-2">ℹ️ Información importante</h4>
                        <p class="text-sm text-yellow-700">
                            Esta cancelación se aplicará automáticamente a todos los estudiantes del grupo. 
                            No contará como clase cumplida para ningún estudiante.
                        </p>
                    </div>
                </div>
                
                <!-- Botones -->
                <div class="mt-8 flex flex-col md:flex-row gap-4">
                    <button 
                        onclick="AttendanceController.saveCancellation('${groupCode}')" 
                        class="btn btn-danger flex-1 btn-lg"
                        id="save-cancellation-btn"
                    >
                        💾 Registrar Cancelación
                    </button>
                    <button 
                        onclick="AttendanceController.showClassStatusQuestion('${groupCode}')" 
                        class="btn btn-neutral"
                    >
                        ❌ Cancelar
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza la información de reposición
     */
    renderRepositionInfo() {
        return `
            <div class="bg-gradient-to-r from-secondary-500 to-secondary-600 rounded-lg p-6 mb-6 text-white">
                <div class="text-center">
                    <h2 class="text-xl font-bold mb-2">Reposición Individual</h2>
                    <p class="opacity-90">Selecciona estudiantes de cualquier grupo para una clase especial</p>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza el buscador de estudiantes
     */
    renderStudentSearch() {
        return `
            <div class="bg-white rounded-lg p-6 mb-6 shadow-sm">
                <h3 class="text-lg font-semibold mb-4">Buscar Estudiantes</h3>
                <div class="flex gap-4">
                    <input 
                        type="text" 
                        id="student-search" 
                        placeholder="Buscar por nombre o ID..."
                        class="flex-1 border border-gray-300 rounded-md px-4 py-2"
                        onkeyup="RepositionController.filterStudents()"
                    />
                    <button onclick="RepositionController.clearSearch()" class="btn btn-outline">
                        🔄 Limpiar
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza la lista de estudiantes disponibles
     */
    renderAvailableStudentsList(students) {
        return `
            <div class="bg-white rounded-lg shadow-sm mb-6">
                <div class="p-6 border-b border-gray-200">
                    <div class="flex justify-between items-center">
                        <h3 class="text-lg font-semibold">Estudiantes Disponibles</h3>
                        <div id="available-count" class="text-sm text-gray-600">
                            ${students.length} disponibles
                        </div>
                    </div>
                </div>
                
                <div class="max-h-96 overflow-y-auto" id="available-students-list">
                    ${students.length > 0 ? 
                        students.map(student => this.renderAvailableStudentItem(student)).join('') :
                        this.renderEmptyStudentsState()
                    }
                </div>
            </div>
        `;
    },

    /**
     * Renderiza un item de estudiante disponible
     */
    renderAvailableStudentItem(student) {
        return `
            <div class="p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors" 
                 onclick="RepositionController.toggleStudent('${student.id}')">
                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-medium text-gray-900">${student.nombre}</h4>
                        <p class="text-sm text-gray-500">ID: ${student.id}</p>
                        <p class="text-sm text-gray-500">Grupo: ${student.grupo_principal}</p>
                        ${student.grupo_secundario ? `<p class="text-xs text-gray-400">También en: ${student.grupo_secundario}</p>` : ''}
                    </div>
                    <div class="flex items-center">
                        <input type="checkbox" 
                               id="student-${student.id}" 
                               class="mr-3 w-5 h-5"
                               onchange="RepositionController.toggleStudent('${student.id}')">
                        <span class="text-sm text-gray-500">Seleccionar</span>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza estado vacío de estudiantes
     */
    renderEmptyStudentsState() {
        return `
            <div class="p-8 text-center text-gray-500">
                <span class="text-4xl mb-3 block">👥</span>
                <p>No hay estudiantes disponibles</p>
                <p class="text-sm mt-2">Intenta ajustar los filtros de búsqueda</p>
            </div>
        `;
    },

    /**
     * Renderiza el botón para continuar con reposición
     */
    renderRepositionContinueButton() {
        return `
            <div class="bg-white rounded-lg p-6 shadow-sm">
                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-medium text-gray-900">Estudiantes Seleccionados</h4>
                        <p class="text-sm text-gray-500" id="selected-count">0 estudiantes seleccionados</p>
                    </div>
                    <button 
                        onclick="RepositionController.continueWithSelected()" 
                        class="btn btn-primary btn-lg"
                        id="continue-reposition-btn"
                        disabled
                    >
                        📋 Continuar con Seleccionados
                    </button>
                </div>
            </div>
        `;
    }
};

// Hacer disponible globalmente
window.AttendanceFormView = AttendanceFormView;

debugLog('attendance-form.js (component) cargado correctamente');
