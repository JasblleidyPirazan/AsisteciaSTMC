/**
 * COMPONENTE FORMULARIO DE INSCRIPCIÓN
 * =====================================
 * Genera HTML puro para el flujo de inscripción (sin lógica de negocio):
 *  - Políticas de la Escuela
 *  - Datos del estudiante y del acudiente
 *  - Buscador de grupos por días / horas
 *  - Listado de grupos con sus atributos y cupos disponibles
 *  - Selección de grupo principal y grupo secundario (opcional)
 */

const InscriptionFormView = {
    /**
     * Renderiza la vista completa
     */
    render(data = {}) {
        const {
            policies = [],
            groups = [],
            availableHours = [],
            isLoading = false
        } = data;

        if (isLoading) {
            return `
                <div class="container">
                    <div class="bg-white rounded-lg p-8 shadow-sm text-center mt-8">
                        <div class="spinner spinner-lg mx-auto mb-4"></div>
                        <p class="text-gray-600">Cargando inscripción...</p>
                    </div>
                </div>
            `;
        }

        return `
            <div class="container">
                ${this.renderHeader()}
                ${this.renderPolicies(policies)}
                ${this.renderStudentData()}
                ${this.renderFilters(availableHours)}
                ${this.renderGroupsSection(groups)}
                ${this.renderSelectionSummary()}
            </div>
        `;
    },

    /**
     * Encabezado
     */
    renderHeader() {
        return `
            <header class="flex items-center justify-between mb-6 bg-white rounded-lg p-6 shadow-sm mt-4">
                <div class="flex items-center">
                    <button onclick="AppController.showDashboard()" class="btn btn-neutral mr-4">
                        ← Volver al Dashboard
                    </button>
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">Inscripción</h1>
                        <p class="text-gray-600">Conoce las políticas, revisa los cupos disponibles e inscribe al estudiante</p>
                    </div>
                </div>
            </header>
        `;
    },

    /**
     * Sección de políticas de la Escuela
     */
    renderPolicies(policies) {
        return `
            <section class="bg-white rounded-lg p-6 shadow-sm mb-6">
                <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
                    <span class="mr-2">📜</span> Políticas de la Escuela
                </h2>
                <div class="space-y-3 max-h-72 overflow-y-auto pr-2 border border-gray-100 rounded-lg p-4 bg-gray-50">
                    ${policies.map((p, i) => `
                        <div class="pb-3 ${i < policies.length - 1 ? 'border-b border-gray-200' : ''}">
                            <h3 class="font-semibold text-gray-800">${i + 1}. ${p.titulo}</h3>
                            <p class="text-sm text-gray-600 mt-1">${p.texto}</p>
                        </div>
                    `).join('')}
                </div>
                <label class="flex items-start mt-4 cursor-pointer">
                    <input type="checkbox"
                           id="accept-policies"
                           class="mt-1 mr-3 h-5 w-5 text-primary-600"
                           onchange="InscriptionController.togglePolicies()">
                    <span class="text-gray-700">
                        He leído y <strong>acepto las políticas de la Escuela</strong> en mi calidad de acudiente del estudiante.
                    </span>
                </label>
            </section>
        `;
    },

    /**
     * Datos del estudiante y del acudiente
     */
    renderStudentData() {
        return `
            <section class="bg-white rounded-lg p-6 shadow-sm mb-6">
                <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
                    <span class="mr-2">🧑‍🎓</span> Datos del estudiante y acudiente
                </h2>
                <form id="inscription-form" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="form-group">
                        <label class="form-label">Nombre completo del estudiante: *</label>
                        <input type="text" id="insc-nombre" name="nombre" class="form-input" placeholder="Ej: Juan Pérez Martínez" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Nombre del acudiente: *</label>
                        <input type="text" id="insc-acudiente" name="acudiente" class="form-input" placeholder="Ej: María Martínez" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Teléfono de contacto: *</label>
                        <input type="tel" id="insc-telefono" name="telefono" class="form-input" placeholder="Ej: 3001234567" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Correo electrónico (opcional):</label>
                        <input type="email" id="insc-email" name="email" class="form-input" placeholder="correo@ejemplo.com">
                    </div>
                </form>
            </section>
        `;
    },

    /**
     * Filtros de búsqueda por días y por horas
     */
    renderFilters(availableHours) {
        const days = [
            { key: 'lunes', label: 'Lunes' },
            { key: 'martes', label: 'Martes' },
            { key: 'miercoles', label: 'Miércoles' },
            { key: 'jueves', label: 'Jueves' },
            { key: 'viernes', label: 'Viernes' },
            { key: 'sabado', label: 'Sábado' },
            { key: 'domingo', label: 'Domingo' }
        ];

        return `
            <section class="bg-white rounded-lg p-6 shadow-sm mb-6">
                <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
                    <span class="mr-2">🔎</span> Buscar grupos disponibles
                </h2>

                <div class="mb-4">
                    <label class="form-label">Buscar por día:</label>
                    <div class="flex flex-wrap gap-2 mt-2">
                        ${days.map(d => `
                            <label class="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-primary-50">
                                <input type="checkbox"
                                       class="filter-day mr-2 h-4 w-4 text-primary-600"
                                       value="${d.key}"
                                       onchange="InscriptionController.applyFilters()">
                                <span class="text-sm text-gray-700">${d.label}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="form-group">
                        <label class="form-label">Buscar por hora:</label>
                        <select id="filter-hour" class="form-select" onchange="InscriptionController.applyFilters()">
                            <option value="">Todas las horas</option>
                            ${availableHours.map(h => `<option value="${h}">${h}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Búsqueda libre (profesor, nivel...):</label>
                        <input type="text" id="filter-search" class="form-input" placeholder="Ej: Brayan, Verde..."
                               oninput="InscriptionController.applyFilters()">
                    </div>
                    <div class="form-group">
                        <label class="form-label">&nbsp;</label>
                        <label class="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-primary-50 w-full">
                            <input type="checkbox" id="filter-con-cupo" class="mr-2 h-4 w-4 text-primary-600"
                                   onchange="InscriptionController.applyFilters()">
                            <span class="text-sm text-gray-700">Solo con cupos disponibles</span>
                        </label>
                    </div>
                </div>

                <div class="mt-4 flex justify-end">
                    <button type="button" onclick="InscriptionController.clearFilters()" class="btn btn-outline">
                        🧹 Limpiar filtros
                    </button>
                </div>
            </section>
        `;
    },

    /**
     * Sección con el listado de grupos
     */
    renderGroupsSection(groups) {
        return `
            <section class="mb-6">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold text-gray-900 flex items-center">
                        <span class="mr-2">🎾</span> Grupos disponibles
                    </h2>
                    <span class="text-sm text-gray-500" id="groups-count">${groups.length} grupos</span>
                </div>
                <div id="inscription-groups-container">
                    ${this.renderGroupsGrid(groups)}
                </div>
            </section>
        `;
    },

    /**
     * Grilla de grupos
     */
    renderGroupsGrid(groups) {
        if (!groups || groups.length === 0) {
            return `
                <div class="text-center py-12 bg-white rounded-lg shadow-sm">
                    <span class="text-6xl mb-4 block">🔍</span>
                    <h3 class="text-xl font-semibold text-gray-700 mb-2">No se encontraron grupos</h3>
                    <p class="text-gray-500">Ajusta los filtros de días u horas para ver más opciones.</p>
                </div>
            `;
        }

        return `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${groups.map(group => this.renderGroupCard(group)).join('')}
            </div>
        `;
    },

    /**
     * Tarjeta individual de grupo con atributos, cupos y botones de selección
     */
    renderGroupCard(group) {
        const ballClass = this.getBallLevelClass(group.bola);
        const dias = InscriptionService.getGroupDays(group);
        const sinCupo = group.cupos_disponibles <= 0;
        const cupoColor = sinCupo ? 'bg-accent-100 text-accent-700'
                        : group.cupos_disponibles <= 2 ? 'bg-secondary-100 text-secondary-700'
                        : 'bg-primary-100 text-primary-700';

        return `
            <div class="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden" data-group-card="${group.codigo}">
                <div class="bg-gradient-to-r from-primary-500 to-primary-600 p-4 text-white">
                    <div class="flex justify-between items-center">
                        <h3 class="text-base font-bold">${group.codigo}</h3>
                        <div class="ball-level ${ballClass} bg-white bg-opacity-20 text-white border-white">
                            ${group.bola || 'Verde'}
                        </div>
                    </div>
                </div>

                <div class="p-5">
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-xs font-semibold px-3 py-1 rounded-full ${cupoColor}">
                            ${sinCupo ? 'Sin cupos' : `${group.cupos_disponibles} cupos disponibles`}
                        </span>
                        <span class="text-xs text-gray-400">${group.inscritos}/${group.cupo_maximo} inscritos</span>
                    </div>

                    <ul class="space-y-2 text-sm text-gray-700 mb-4">
                        <li class="flex items-center"><span class="mr-2">📅</span><strong class="mr-1">Días:</strong> ${dias}</li>
                        <li class="flex items-center"><span class="mr-2">🕐</span><strong class="mr-1">Hora:</strong> ${group.hora || 'N/A'}</li>
                        <li class="flex items-center"><span class="mr-2">👨‍🏫</span><strong class="mr-1">Profesor:</strong> ${group.profe || 'N/A'}</li>
                        <li class="flex items-center"><span class="mr-2">🎾</span><strong class="mr-1">Cancha:</strong> ${group.cancha || 'N/A'}</li>
                        <li class="flex items-center"><span class="mr-2">🔁</span><strong class="mr-1">Frecuencia:</strong> ${group.frecuencia_semanal || 0} clases/sem</li>
                    </ul>

                    <div class="grid grid-cols-2 gap-2 pt-3 border-t border-gray-100">
                        <button type="button"
                                onclick="InscriptionController.selectPrimary('${group.codigo}')"
                                class="btn btn-primary text-sm ${sinCupo ? 'opacity-50 cursor-not-allowed' : ''}"
                                ${sinCupo ? 'disabled' : ''}>
                            ⭐ Principal
                        </button>
                        <button type="button"
                                onclick="InscriptionController.selectSecondary('${group.codigo}')"
                                class="btn btn-outline text-sm ${sinCupo ? 'opacity-50 cursor-not-allowed' : ''}"
                                ${sinCupo ? 'disabled' : ''}>
                            ➕ Secundario
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Resumen de la selección y botón de inscripción (barra inferior fija)
     */
    renderSelectionSummary() {
        return `
            <section id="inscription-summary" class="bg-white rounded-lg p-6 shadow-lg border-2 border-primary-100 mb-8 sticky bottom-4">
                <h2 class="text-lg font-bold text-gray-900 mb-3">Resumen de inscripción</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div class="p-4 rounded-lg bg-primary-50 border border-primary-100">
                        <p class="text-sm text-gray-600 mb-1">⭐ Grupo principal</p>
                        <p class="font-semibold text-gray-900" id="summary-principal">Sin seleccionar</p>
                    </div>
                    <div class="p-4 rounded-lg bg-gray-50 border border-gray-200">
                        <div class="flex justify-between items-start">
                            <div>
                                <p class="text-sm text-gray-600 mb-1">➕ Grupo secundario (opcional)</p>
                                <p class="font-semibold text-gray-900" id="summary-secundario">Sin seleccionar</p>
                            </div>
                            <button type="button" onclick="InscriptionController.clearSecondary()"
                                    class="text-xs text-accent-600 hover:underline" id="clear-secondary-btn" style="display:none;">
                                Quitar
                            </button>
                        </div>
                    </div>
                </div>
                <button type="button" id="submit-inscription-btn"
                        onclick="InscriptionController.submit()"
                        class="btn btn-primary w-full opacity-50" disabled>
                    ✅ Confirmar inscripción
                </button>
            </section>
        `;
    },

    /**
     * Actualiza solo la grilla de grupos (sin recargar toda la vista)
     */
    updateGroupsGrid(groups) {
        const container = document.getElementById('inscription-groups-container');
        if (container) {
            container.innerHTML = this.renderGroupsGrid(groups);
        }
        const count = document.getElementById('groups-count');
        if (count) {
            count.textContent = `${groups.length} grupos`;
        }
    },

    /**
     * Actualiza el resumen de selección y el estado del botón de inscripción
     */
    updateSummary(state) {
        const { selectedPrimary, selectedSecondary, policiesAccepted, groups } = state;

        const findGroup = code => groups.find(g => g.codigo === code);

        const principalEl = document.getElementById('summary-principal');
        const secundarioEl = document.getElementById('summary-secundario');
        const clearBtn = document.getElementById('clear-secondary-btn');

        if (principalEl) {
            const g = findGroup(selectedPrimary);
            principalEl.textContent = g
                ? `${g.codigo} · ${g.hora} · ${g.profe}`
                : 'Sin seleccionar';
        }

        if (secundarioEl) {
            const g = findGroup(selectedSecondary);
            secundarioEl.textContent = g
                ? `${g.codigo} · ${g.hora} · ${g.profe}`
                : 'Sin seleccionar';
        }

        if (clearBtn) {
            clearBtn.style.display = selectedSecondary ? 'block' : 'none';
        }

        // Resaltar tarjetas seleccionadas
        document.querySelectorAll('[data-group-card]').forEach(card => {
            const code = card.getAttribute('data-group-card');
            card.classList.remove('ring-2', 'ring-primary-500', 'ring-secondary-500');
            if (code === selectedPrimary) {
                card.classList.add('ring-2', 'ring-primary-500');
            } else if (code === selectedSecondary) {
                card.classList.add('ring-2', 'ring-secondary-500');
            }
        });

        // Habilitar botón si hay grupo principal y políticas aceptadas
        const submitBtn = document.getElementById('submit-inscription-btn');
        if (submitBtn) {
            const enabled = !!selectedPrimary && !!policiesAccepted;
            submitBtn.disabled = !enabled;
            submitBtn.classList.toggle('opacity-50', !enabled);
        }
    },

    /**
     * Muestra el mensaje de éxito de la inscripción
     */
    showSuccess(result) {
        const modal = document.getElementById('notification-modal');
        const content = document.getElementById('notification-content');
        if (!modal || !content) return;

        const pendingNote = result.pending
            ? '<p class="text-sm text-secondary-700 mt-2">⏳ Pendiente de sincronización con el servidor.</p>'
            : '';

        content.innerHTML = `
            <div class="text-center">
                <div class="text-6xl mb-4 text-green-500">✅</div>
                <h3 class="text-xl font-bold mb-4 text-green-900">¡Inscripción registrada!</h3>
                <div class="bg-green-50 p-4 rounded mb-4 text-left">
                    <ul class="text-sm text-green-700 space-y-1">
                        <li>• Estudiante: ${result.studentRecord.Nombre}</li>
                        <li>• Grupo principal: ${result.studentRecord.Grupo_Principal}</li>
                        <li>• Grupo secundario: ${result.studentRecord.Grupo_Secundario || 'Ninguno'}</li>
                        <li>• ID asignado: ${result.studentId}</li>
                    </ul>
                    ${pendingNote}
                </div>
                <div class="flex gap-3 justify-center">
                    <button onclick="AppController.showDashboard(); UIUtils.closeNotification();" class="btn btn-primary">
                        🏠 Ir al Dashboard
                    </button>
                    <button onclick="InscriptionController.show(); UIUtils.closeNotification();" class="btn btn-secondary">
                        ➕ Nueva inscripción
                    </button>
                </div>
            </div>
        `;
        modal.classList.remove('hidden');
    },

    /**
     * Clase CSS para el nivel de bola (igual que el dashboard)
     */
    getBallLevelClass(ballLevel) {
        const levelMap = {
            'verde': 'ball-verde',
            'amarilla': 'ball-amarilla',
            'naranja': 'ball-naranja',
            'roja': 'ball-roja'
        };
        return levelMap[ballLevel?.toLowerCase()] || 'ball-verde';
    }
};

// Hacer disponible globalmente
window.InscriptionFormView = InscriptionFormView;

debugLog('inscription-form.js (component) cargado correctamente');
