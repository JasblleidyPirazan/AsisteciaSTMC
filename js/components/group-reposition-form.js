/**
 * COMPONENTE FORMULARIO DE REPOSICIÓN GRUPAL
 * ===========================================
 * Genera HTML para el formulario de reposición grupal
 */

const GroupRepositionFormView = {
    /**
     * Renderiza el formulario completo
     */
    render(data = {}) {
        const {
            professors = [],
            students = [],
            assistants = [],
            isLoading = false
        } = data;

        return `
            <div class="container">
                ${this.renderHeader()}
                ${this.renderForm(professors, students, assistants, isLoading)}
            </div>
        `;
    },

    /**
     * Renderiza el header
     */
    renderHeader() {
        return `
            <header class="flex items-center justify-between mb-6 bg-white rounded-lg p-6 shadow-sm">
                <div class="flex items-center">
                    <button onclick="AppController.showDashboard()" class="btn btn-neutral mr-4">
                        ← Volver al Dashboard
                    </button>
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">Crear Reposición Grupal</h1>
                        <p class="text-gray-600">Clase especial con múltiples estudiantes</p>
                    </div>
                </div>
            </header>
        `;
    },

    /**
     * Renderiza el formulario principal
     */
    renderForm(professors, students, assistants, isLoading) {
        if (isLoading) {
            return `
                <div class="bg-white rounded-lg p-8 shadow-sm text-center">
                    <div class="spinner spinner-lg mx-auto mb-4"></div>
                    <p class="text-gray-600">Cargando formulario...</p>
                </div>
            `;
        }

        return `
            <form id="group-reposition-form" class="bg-white rounded-lg p-6 shadow-sm">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- Fecha -->
                    <div class="form-group">
                        <label class="form-label">Fecha de la clase:</label>
                        <input type="date" 
                               id="reposition-date" 
                               name="fecha"
                               min="${DateUtils.getCurrentDate()}"
                               class="form-input"
                               required>
                    </div>

                    <!-- Hora -->
                    <div class="form-group">
                        <label class="form-label">Horario:</label>
                        <input type="text" 
                               id="reposition-time" 
                               name="hora"
                               placeholder="15:00-16:30"
                               class="form-input"
                               required>
                        <p class="text-xs text-gray-500 mt-1">Formato: HH:MM-HH:MM</p>
                    </div>

                    <!-- Profesor -->
                    <div class="form-group">
                        <label class="form-label">Profesor:</label>
                        <select id="reposition-professor" name="profesorId" class="form-select" required>
                            <option value="">Seleccionar profesor...</option>
                            ${professors.map(prof => `
                                <option value="${prof.id}" data-name="${prof.nombre}">
                                    ${prof.nombre}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Cancha -->
                    <div class="form-group">
                        <label class="form-label">Cancha:</label>
                        <select id="reposition-court" name="cancha" class="form-select" required>
                            <option value="">Seleccionar cancha...</option>
                            ${[1, 2, 3, 4, 5].map(num => `
                                <option value="${num}">Cancha ${num}</option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Número de reposiciones -->
                    <div class="form-group">
                        <label class="form-label">Número de reposiciones por estudiante:</label>
                        <select id="reposition-count" name="numeroReposiciones" class="form-select" required>
                            <option value="">Seleccionar cantidad...</option>
                            ${[1, 2, 3, 4, 5].map(num => `
                                <option value="${num}">${num} reposición${num > 1 ? 'es' : ''}</option>
                            `).join('')}
                        </select>
                        <p class="text-xs text-gray-500 mt-1">Cada estudiante tendrá esta cantidad de registros de asistencia</p>
                    </div>

                    <!-- Asistente -->
                    <div class="form-group">
                        <label class="form-label">Asistente (opcional):</label>
                        <select id="reposition-assistant" name="asistenteId" class="form-select">
                            <option value="">Sin asistente</option>
                            ${assistants.map(asst => `
                                <option value="${asst.id}" data-name="${asst.nombre}">
                                    ${asst.nombre}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <!-- Selector de estudiantes -->
                <div class="form-group mt-8">
                    <label class="form-label">Estudiantes que asisten:</label>
                    ${this.renderStudentSelector(students)}
                </div>

                <!-- Resumen y botones -->
                <div class="mt-8 pt-6 border-t border-gray-200">
                    ${this.renderSummary()}
                    ${this.renderActions()}
                </div>
            </form>
        `;
    },

    /**
     * Renderiza el selector de estudiantes
     */
    renderStudentSelector(students) {
        return `
            <div class="bg-gray-50 rounded-lg p-4">
                <!-- Buscador -->
                <div class="mb-4">
                    <input type="text" 
                           id="student-search" 
                           placeholder="Buscar estudiante por nombre..."
                           class="form-input"
                           onkeyup="GroupRepositionController.filterStudents()">
                </div>

                <!-- Lista de estudiantes -->
                <div class="max-h-64 overflow-y-auto border border-gray-200 rounded">
                    <div id="students-list">
                        ${students.map(student => this.renderStudentOption(student)).join('')}
                    </div>
                </div>

                <!-- Contador -->
                <div class="mt-3 text-sm text-gray-600">
                    <span id="selected-students-count">0</span> estudiantes seleccionados
                </div>
            </div>
        `;
    },

    /**
     * Renderiza una opción de estudiante
     */
    renderStudentOption(student) {
        return `
            <div class="student-option p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                 data-student-id="${student.id}"
                 data-student-name="${student.nombre.toLowerCase()}"
                 onclick="GroupRepositionController.toggleStudent('${student.id}')">
                <div class="flex items-center justify-between">
                    <div>
                        <h4 class="font-medium text-gray-900">${student.nombre}</h4>
                        <p class="text-sm text-gray-500">Grupo: ${student.grupo_principal}</p>
                        ${student.grupo_secundario ? `<p class="text-xs text-blue-600">También en: ${student.grupo_secundario}</p>` : ''}
                    </div>
                    <div class="flex items-center">
                        <input type="checkbox" 
                               id="student-${student.id}" 
                               class="w-5 h-5"
                               onchange="GroupRepositionController.toggleStudent('${student.id}')">
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza el resumen dinámico
     */
    renderSummary() {
        return `
            <div id="reposition-summary" class="bg-blue-50 rounded-lg p-4 mb-6">
                <h3 class="font-semibold text-blue-900 mb-2">Resumen de la reposición:</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-blue-800">
                    <div>
                        <span class="font-medium">Fecha:</span>
                        <span id="summary-date">-</span>
                    </div>
                    <div>
                        <span class="font-medium">Hora:</span>
                        <span id="summary-time">-</span>
                    </div>
                    <div>
                        <span class="font-medium">Profesor:</span>
                        <span id="summary-professor">-</span>
                    </div>
                    <div>
                        <span class="font-medium">Cancha:</span>
                        <span id="summary-court">-</span>
                    </div>
                </div>
                <div class="mt-3 pt-3 border-t border-blue-200">
                    <p><span class="font-medium">Estudiantes:</span> <span id="summary-students">0</span></p>
                    <p><span class="font-medium">Reposiciones por estudiante:</span> <span id="summary-count">0</span></p>
                    <p><span class="font-medium">Total registros de asistencia:</span> <span id="summary-total">0</span></p>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza los botones de acción
     */
    renderActions() {
        return `
            <div class="flex gap-4">
                <button type="button" 
                        onclick="GroupRepositionController.saveReposition()" 
                        id="save-reposition-btn"
                        class="btn btn-primary flex-1 btn-lg"
                        disabled>
                    💾 Crear Reposición Grupal
                </button>
                <button type="button" 
                        onclick="GroupRepositionController.resetForm()" 
                        class="btn btn-outline">
                    🔄 Limpiar Formulario
                </button>
            </div>
        `;
    },

    /**
     * Actualiza el resumen dinámicamente
     */
    updateSummary(formData, selectedStudents) {
        const elementos = {
            date: document.getElementById('summary-date'),
            time: document.getElementById('summary-time'),
            professor: document.getElementById('summary-professor'),
            court: document.getElementById('summary-court'),
            students: document.getElementById('summary-students'),
            count: document.getElementById('summary-count'),
            total: document.getElementById('summary-total')
        };

        if (elementos.date) elementos.date.textContent = formData.fecha || '-';
        if (elementos.time) elementos.time.textContent = formData.hora || '-';
        if (elementos.professor) elementos.professor.textContent = formData.profesorNombre || '-';
        if (elementos.court) elementos.court.textContent = formData.cancha ? `Cancha ${formData.cancha}` : '-';
        if (elementos.students) elementos.students.textContent = selectedStudents.length;
        if (elementos.count) elementos.count.textContent = formData.numeroReposiciones || '0';
        
        const total = selectedStudents.length * (parseInt(formData.numeroReposiciones) || 0);
        if (elementos.total) elementos.total.textContent = total;

        // Actualizar contador de estudiantes seleccionados
        const countElement = document.getElementById('selected-students-count');
        if (countElement) {
            countElement.textContent = selectedStudents.length;
        }
    },

    /**
     * Filtra estudiantes por búsqueda
     */
    filterStudents(searchTerm) {
        const studentOptions = document.querySelectorAll('.student-option');
        const term = searchTerm.toLowerCase().trim();

        studentOptions.forEach(option => {
            const studentName = option.dataset.studentName;
            const shouldShow = !term || studentName.includes(term);
            option.style.display = shouldShow ? 'block' : 'none';
        });
    }
};

// Hacer disponible globalmente
window.GroupRepositionFormView = GroupRepositionFormView;

debugLog('group-reposition-form.js cargado correctamente');
