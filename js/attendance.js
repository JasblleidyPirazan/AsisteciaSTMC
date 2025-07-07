/**
 * COMPONENTE ASISTENCIA
 * =====================
 * Maneja formularios y lógica de registro de asistencia
 */

const AttendanceComponent = {
    /**
     * Muestra la pregunta sobre el estado de la clase
     */
    showClassStatusQuestion(group) {
        debugLog(`Preguntando estado de clase para grupo: ${group.codigo}`);
        
        const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
        const formattedDate = DateUtils.formatDate(selectedDate);
        
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="container">
                <!-- Header -->
                <header class="flex items-center justify-between mb-6 bg-white rounded-lg p-6 shadow-sm">
                    <div class="flex items-center">
                        <button onclick="AppController.showDashboard()" class="btn btn-neutral mr-4">
                            ← Volver al Dashboard
                        </button>
                        <div>
                            <h1 class="text-2xl font-bold text-gray-900">Estado de la Clase</h1>
                            <p class="text-gray-600">${formattedDate}</p>
                        </div>
                    </div>
                </header>

                <!-- Información del Grupo -->
                ${this.renderGroupInfo(group)}

                <!-- Pregunta Principal -->
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
                                onclick="AttendanceController.classWasHeld('${group.codigo}')" 
                                class="w-full btn btn-primary btn-lg p-6 flex items-center justify-center"
                            >
                                <span class="text-3xl mr-4">✅</span>
                                <div class="text-left">
                                    <div class="font-bold">Sí, se realizó</div>
                                    <div class="text-sm opacity-90">Registrar asistencia de estudiantes</div>
                                </div>
                            </button>
                            
                            <button 
                                onclick="AttendanceController.classWasCancelled('${group.codigo}')" 
                                class="w-full btn btn-danger btn-lg p-6 flex items-center justify-center"
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
            </div>
        `;
    },

    /**
     * Muestra el formulario de registro de asistencia
     */
    showAttendanceForm(group, students) {
        debugLog(`Mostrando formulario de asistencia para grupo: ${group.codigo}`);
        
        const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
        const formattedDate = DateUtils.formatDate(selectedDate);
        const studentCount = students.length;
        
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="container">
                <!-- Header -->
                <header class="flex items-center justify-between mb-6 bg-white rounded-lg p-6 shadow-sm">
                    <div class="flex items-center">
                        <button onclick="AttendanceController.showClassStatusQuestion('${group.codigo}')" class="btn btn-neutral mr-4">
                            ← Volver
                        </button>
                        <div>
                            <h1 class="text-2xl font-bold text-gray-900">Registro de Asistencia</h1>
                            <p class="text-gray-600">${formattedDate}</p>
                        </div>
                    </div>
                    <div class="connection-status status-indicator ${window.AppState.connectionStatus}">
                        ${window.AppState.connectionStatus === 'online' ? 'En línea' : 'Sin conexión'}
                    </div>
                </header>

                <!-- Información del Grupo -->
                ${this.renderGroupInfo(group, studentCount)}

                <!-- Controles de Asistencia Masiva -->
                ${this.renderMassControls()}

                <!-- Lista de Estudiantes -->
                ${this.renderStudentsList(students)}

                <!-- Acciones Finales -->
                ${this.renderFinalActions(group.codigo)}
            </div>

            <!-- Modales -->
            ${ModalsComponent.renderJustificationModal()}
            ${ModalsComponent.renderAddStudentModal()}
        `;
        
        // Actualizar resumen inicial
        this.updateAttendanceSummary();
        this.updateTotalStudentsCount();
    },

    /**
     * Muestra el formulario para registrar una cancelación
     */
    showCancellationForm(group) {
        debugLog(`Mostrando formulario de cancelación para grupo: ${group.codigo}`);
        
        const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
        const formattedDate = DateUtils.formatDate(selectedDate);
        
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="container">
                <!-- Header -->
                <header class="flex items-center justify-between mb-6 bg-white rounded-lg p-6 shadow-sm">
                    <div class="flex items-center">
                        <button onclick="AttendanceController.showClassStatusQuestion('${group.codigo}')" class="btn btn-neutral mr-4">
                            ← Volver
                        </button>
                        <div>
                            <h1 class="text-2xl font-bold text-gray-900">Registrar Cancelación</h1>
                            <p class="text-gray-600">${formattedDate}</p>
                        </div>
                    </div>
                </header>

                <!-- Información del Grupo -->
                <div class="bg-gradient-to-r from-red-500 to-red-600 rounded-lg p-6 mb-6 text-white">
                    <div class="text-center">
                        <h2 class="text-xl font-bold mb-2">${group.descriptor}</h2>
                        <p class="opacity-90">Clase cancelada</p>
                    </div>
                </div>

                <!-- Formulario de Cancelación -->
                ${this.renderCancellationForm(group.codigo)}
            </div>
        `;
    },

    /**
     * Renderiza la información del grupo
     */
    renderGroupInfo(group, studentCount = null) {
        const bgColor = studentCount !== null ? 
            'bg-gradient-to-r from-primary-500 to-primary-600' : 
            'bg-gradient-to-r from-primary-500 to-primary-600';
        
        return `
            <div class="${bgColor} rounded-lg p-6 mb-6 text-white">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-xl font-bold mb-2">${group.descriptor}</h2>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div class="flex items-center">
                                <span class="mr-2">👨‍🏫</span>
                                <span>Prof. ${group.profe}</span>
                            </div>
                            <div class="flex items-center">
                                <span class="mr-2">🕐</span>
                                <span>${group.hora}</span>
                            </div>
                            <div class="flex items-center">
                                <span class="mr-2">🎾</span>
                                <span>Cancha ${group.cancha}</span>
                            </div>
                            <div class="flex items-center">
                                <span class="mr-2">🏆</span>
                                <span>Nivel ${group.bola}</span>
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
     * Renderiza controles masivos de asistencia
     */
    renderMassControls() {
        return `
            <div class="bg-white rounded-lg p-6 mb-6 shadow-sm">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-semibold">Controles Rápidos</h3>
                    <button onclick="AttendanceController.showAddStudentModal()" class="btn btn-secondary">
                        ➕ Agregar Estudiante de Otro Grupo
                    </button>
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
    renderStudentsList(students) {
        return `
            <div class="bg-white rounded-lg shadow-sm mb-6">
                <div class="p-6 border-b border-gray-200">
                    <div class="flex justify-between items-center">
                        <h3 class="text-lg font-semibold">Lista de Estudiantes</h3>
                        <div id="attendance-summary" class="text-sm text-gray-600">
                            Sin registros
                        </div>
                    </div>
                </div>
                
                <!-- Estudiantes del grupo -->
                <div class="divide-y divide-gray-200">
                    <div class="p-4 bg-gray-50">
                        <h4 class="font-medium text-gray-700 text-sm">Estudiantes del Grupo Principal</h4>
                    </div>
                    <div id="main-students-list">
                        ${students.map(student => UIUtils.createStudentItem(student)).join('')}
                    </div>
                </div>
                
                <!-- Estudiantes adicionales -->
                <div id="additional-students-section" class="hidden">
                    <div class="divide-y divide-gray-200">
                        <div class="p-4 bg-blue-50">
                            <h4 class="font-medium text-blue-700 text-sm">Estudiantes de Otros Grupos</h4>
                        </div>
                        <div id="additional-students-list">
                            <!-- Se llenan dinámicamente -->
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza las acciones finales
     */
    renderFinalActions(groupCode) {
        return `
            <div class="bg-white rounded-lg p-6 shadow-sm">
                <div class="flex flex-col md:flex-row gap-4">
                    <button 
                        onclick="AttendanceController.saveAttendanceData('${groupCode}')" 
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
     * Renderiza el formulario de cancelación
     */
    renderCancellationForm(groupCode) {
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
                                <label class="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
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
                    
                    <!-- Información de estudiantes afectados -->
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
     * Actualiza el resumen de asistencia
     */
    updateAttendanceSummary() {
        const summary = document.getElementById('attendance-summary');
        if (!summary) return;
        
        const attendance = window.AppState.currentAttendance;
        const total = Object.keys(attendance).length;
        
        if (total === 0) {
            summary.textContent = 'Sin registros';
            return;
        }
        
        const presente = Object.values(attendance).filter(a => a.status === 'Presente').length;
        const ausente = Object.values(attendance).filter(a => a.status === 'Ausente').length;
        const justificada = Object.values(attendance).filter(a => a.status === 'Justificada').length;
        
        summary.innerHTML = `
            <span class="font-medium">${total} registrados:</span>
            <span class="text-green-600">${presente} presentes</span> •
            <span class="text-red-600">${ausente} ausentes</span> •
            <span class="text-yellow-600">${justificada} justificadas</span>
        `;
        
        // Actualizar botón de guardar
        const saveBtn = document.getElementById('save-attendance-btn');
        if (saveBtn && total > 0) {
            saveBtn.classList.remove('opacity-50');
            saveBtn.disabled = false;
        }
    },

    /**
     * Actualiza el contador total de estudiantes
     */
    updateTotalStudentsCount() {
        const counter = document.getElementById('total-students-count');
        if (!counter) return;
        
        const currentGroupCode = AttendanceController.getCurrentGroupCode();
        const mainGroupStudents = DataUtils.getStudentsByGroup(window.AppState.estudiantes, currentGroupCode);
        const additionalStudents = window.AppState.additionalStudents || [];
        
        const totalCount = mainGroupStudents.length + additionalStudents.length;
        counter.textContent = totalCount;
    },

    /**
     * Actualiza la lista de estudiantes adicionales en la UI
     */
    updateAdditionalStudentsList() {
        const section = document.getElementById('additional-students-section');
        const container = document.getElementById('additional-students-list');
        
        if (!section || !container) return;
        
        const additionalStudents = window.AppState.additionalStudents || [];
        
        if (additionalStudents.length === 0) {
            section.classList.add('hidden');
            return;
        }
        
        section.classList.remove('hidden');
        container.innerHTML = additionalStudents.map(student => {
            const studentItemHtml = UIUtils.createStudentItem(student);
            // Agregar botón para remover estudiante adicional
            return studentItemHtml.replace(
                '</div>',
                `<button onclick="AttendanceController.removeAdditionalStudent('${student.id}')" 
                         class="btn btn-sm btn-outline text-red-600 border-red-300 hover:bg-red-50 ml-2">
                    🗑️ Remover
                </button></div>`
            );
        }).join('');
    }
};

debugLog('attendance.js cargado correctamente');
