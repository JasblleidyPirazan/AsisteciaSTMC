/**
 * MODAL DE REPOSICIÓN INDIVIDUAL - CORREGIDO COMPLETAMENTE
 * =========================================================
 * SOLUCIÓN: Normalización de IDs y mejor manejo de eventos
 */

const RepositionModal = {
    /**
     * ✅ CORREGIDO: Renderiza modal con normalización de IDs
     */
    render(data = {}) {
        const {
            allStudents = [],
            selectedStudents = [],
            searchTerm = '',
            isLoading = false
        } = data;

        return `
            <div id="reposition-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
                <div class="flex items-center justify-center min-h-screen p-4">
                    <div class="bg-white rounded-lg w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-xl">
                        <!-- Header -->
                        ${this.renderHeader()}
                        
                        <!-- Search Section -->
                        ${this.renderSearchSection(searchTerm, selectedStudents.length)}
                        
                        <!-- Students List -->
                        ${this.renderStudentsList(allStudents, selectedStudents, searchTerm, isLoading)}
                        
                        <!-- Footer Actions -->
                        ${this.renderFooter(selectedStudents.length)}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza el header del modal
     */
    renderHeader() {
        return `
            <div class="flex items-center justify-between p-6 border-b border-gray-200">
                <div>
                    <h3 class="text-lg font-semibold text-gray-900">Reposición Individual</h3>
                    <p class="text-sm text-gray-600 mt-1">Selecciona estudiantes para agregar a esta clase</p>
                </div>
                <button 
                    onclick="RepositionController.closeModal()"
                    class="text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <span class="text-2xl">✕</span>
                </button>
            </div>
        `;
    },

    /**
     * ✅ CORREGIDO: Renderiza sección de búsqueda con mejor UX
     */
    renderSearchSection(searchTerm, selectedCount) {
        return `
            <div class="p-6 border-b border-gray-200">
                <!-- Buscador mejorado -->
                <div class="relative mb-4">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span class="text-gray-400 text-lg">🔍</span>
                    </div>
                    <input
                        type="text"
                        id="reposition-search"
                        placeholder="Buscar estudiante por nombre..."
                        value="${searchTerm}"
                        onkeyup="RepositionController.onSearchChange()"
                        class="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-md text-base focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    ${searchTerm ? `
                        <button 
                            onclick="RepositionController.clearSearch()"
                            class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                        >
                            <span class="text-lg">✕</span>
                        </button>
                    ` : ''}
                </div>
                
                <!-- Contador de seleccionados -->
                ${selectedCount > 0 ? `
                    <div class="p-3 bg-primary-50 border border-primary-200 rounded-md">
                        <div class="flex items-center text-primary-700">
                            <span class="text-lg mr-2">✅</span>
                            <span class="font-medium">${selectedCount} estudiante(s) seleccionado(s)</span>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    },

    /**
     * ✅ CORREGIDO: Renderiza lista con mejor manejo de estados
     */
    renderStudentsList(allStudents, selectedStudents, searchTerm, isLoading) {
        if (isLoading) {
            return this.renderLoadingState();
        }

        // Filtrar estudiantes por búsqueda
        const filteredStudents = RepositionService.searchStudentsByName(allStudents, searchTerm);

        if (filteredStudents.length === 0) {
            return this.renderEmptyState(searchTerm);
        }

        return `
            <div class="max-h-96 overflow-y-auto" id="reposition-students-list">
                ${filteredStudents.map(student => 
                    this.renderStudentItem(student, this.isStudentSelected(student.id, selectedStudents))
                ).join('')}
            </div>
        `;
    },

    /**
     * ✅ CORREGIDO: Renderiza item de estudiante con IDs normalizados
     */
    renderStudentItem(student, isSelected) {
        // ✅ FIX CRÍTICO: Normalizar ID a string para consistencia
        const normalizedId = String(student.id);
        
        return `
            <div class="reposition-student-item p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${isSelected ? 'bg-primary-50 border-primary-200' : ''}"
                 data-student-id="${normalizedId}"
                 onclick="RepositionController.toggleStudent('${normalizedId}')">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <h4 class="font-medium text-gray-900">${student.nombre}</h4>
                        <p class="text-sm text-gray-500">ID: ${normalizedId}</p>
                        <p class="text-sm text-gray-500">Grupo: ${student.grupo_principal || 'Sin grupo'}</p>
                        ${student.grupo_secundario ? `<p class="text-xs text-blue-600">También en: ${student.grupo_secundario}</p>` : ''}
                    </div>
                    <div class="flex items-center ml-4">
                        <input
                            type="checkbox"
                            id="student-checkbox-${normalizedId}"
                            ${isSelected ? 'checked' : ''}
                            onchange="RepositionController.toggleStudent('${normalizedId}')"
                            onclick="event.stopPropagation()"
                            class="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <label for="student-checkbox-${normalizedId}" class="ml-2 text-sm text-gray-700">
                            ${isSelected ? 'Seleccionado' : 'Seleccionar'}
                        </label>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza el estado de carga
     */
    renderLoadingState() {
        return `
            <div class="p-8 text-center">
                <div class="spinner spinner-lg mx-auto mb-4"></div>
                <p class="text-gray-600">Cargando estudiantes...</p>
            </div>
        `;
    },

    /**
     * ✅ CORREGIDO: Renderiza estado vacío con mejor UX
     */
    renderEmptyState(searchTerm) {
        if (searchTerm) {
            return `
                <div class="p-8 text-center text-gray-500">
                    <span class="text-6xl mb-4 block">🔍</span>
                    <h4 class="text-lg font-medium mb-2">No se encontraron estudiantes</h4>
                    <p class="text-sm mb-4">No hay estudiantes que coincidan con "<strong>${searchTerm}</strong>"</p>
                    <button 
                        onclick="RepositionController.clearSearch()" 
                        class="btn btn-outline btn-sm"
                    >
                        🗑️ Limpiar búsqueda
                    </button>
                </div>
            `;
        } else {
            return `
                <div class="p-8 text-center text-gray-500">
                    <span class="text-6xl mb-4 block">👥</span>
                    <h4 class="text-lg font-medium mb-2">No hay estudiantes disponibles</h4>
                    <p class="text-sm">No se encontraron estudiantes activos en el sistema</p>
                </div>
            `;
        }
    },

    /**
     * ✅ CORREGIDO: Renderiza footer con mejor validación
     */
    renderFooter(selectedCount) {
        const isDisabled = selectedCount === 0;
        
        return `
            <div class="p-6 border-t border-gray-200 bg-gray-50">
                <div class="flex items-center justify-between">
                    <div class="text-sm text-gray-600" id="reposition-footer-info">
                        ${selectedCount > 0 ? `${selectedCount} estudiante(s) seleccionado(s)` : 'Selecciona estudiantes para continuar'}
                    </div>
                    
                    <div class="flex gap-3">
                        <button 
                            onclick="RepositionController.closeModal()"
                            class="btn btn-outline"
                        >
                            ❌ Cancelar
                        </button>
                        
                        <button 
                            onclick="RepositionController.saveReposition()"
                            id="save-reposition-btn"
                            class="btn btn-primary flex items-center gap-2 ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}"
                            ${isDisabled ? 'disabled' : ''}
                        >
                            <span class="text-lg">💾</span>
                            <span>Guardar ${selectedCount > 0 ? `(${selectedCount})` : ''}</span>
                        </button>
                    </div>
                </div>
                
                <!-- Información adicional -->
                <div class="mt-3 text-xs text-gray-500">
                    💡 Los estudiantes seleccionados se registrarán como "Reposición Individual" en esta clase
                </div>
            </div>
        `;
    },

    /**
     * ✅ CORREGIDO: Actualiza lista con mejor manejo de errores
     */
    updateStudentsList(allStudents, selectedStudents, searchTerm) {
        try {
            const listContainer = document.getElementById('reposition-students-list');
            if (!listContainer) {
                debugLog('RepositionModal: Container de lista no encontrado');
                return;
            }

            const filteredStudents = RepositionService.searchStudentsByName(allStudents, searchTerm);
            
            if (filteredStudents.length === 0) {
                listContainer.outerHTML = `
                    <div class="max-h-96 overflow-y-auto" id="reposition-students-list">
                        ${this.renderEmptyState(searchTerm)}
                    </div>
                `;
            } else {
                listContainer.innerHTML = filteredStudents.map(student => 
                    this.renderStudentItem(student, this.isStudentSelected(student.id, selectedStudents))
                ).join('');
            }
            
        } catch (error) {
            console.error('RepositionModal: Error actualizando lista:', error);
        }
    },

    /**
     * ✅ CORREGIDO: Actualiza contador con mejor feedback visual
     */
    updateSelectionCount(selectedCount) {
        // Actualizar botón de guardar
        const saveBtn = document.getElementById('save-reposition-btn');
        if (saveBtn) {
            const isDisabled = selectedCount === 0;
            saveBtn.disabled = isDisabled;
            saveBtn.className = `btn btn-primary flex items-center gap-2 ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`;
            
            const span = saveBtn.querySelector('span:last-child');
            if (span) {
                span.textContent = `Guardar ${selectedCount > 0 ? `(${selectedCount})` : ''}`;
            }
        }
        
        // Actualizar información del footer
        const footerInfo = document.getElementById('reposition-footer-info');
        if (footerInfo) {
            footerInfo.textContent = selectedCount > 0 ? 
                `${selectedCount} estudiante(s) seleccionado(s)` : 
                'Selecciona estudiantes para continuar';
        }
        
        // ✅ NUEVO: Actualizar contador en search section si existe
        const searchSection = document.querySelector('.p-6.border-b');
        if (searchSection && selectedCount > 0) {
            let counterDiv = searchSection.querySelector('.bg-primary-50');
            if (!counterDiv && selectedCount > 0) {
                const counterHtml = `
                    <div class="p-3 bg-primary-50 border border-primary-200 rounded-md mt-4">
                        <div class="flex items-center text-primary-700">
                            <span class="text-lg mr-2">✅</span>
                            <span class="font-medium">${selectedCount} estudiante(s) seleccionado(s)</span>
                        </div>
                    </div>
                `;
                searchSection.insertAdjacentHTML('beforeend', counterHtml);
            } else if (counterDiv) {
                const span = counterDiv.querySelector('span.font-medium');
                if (span) {
                    span.textContent = `${selectedCount} estudiante(s) seleccionado(s)`;
                }
            }
        }
    },

    /**
     * ✅ CORREGIDO: Verifica selección con IDs normalizados
     */
    isStudentSelected(studentId, selectedStudents) {
        const normalizedId = String(studentId);
        return selectedStudents.some(student => String(student.id) === normalizedId);
    },

    /**
     * ✅ CORREGIDO: Método show() funcional
     */
    show() {
        debugLog('RepositionModal.show() - VERSIÓN CORREGIDA FUNCIONAL');
        
        const modal = document.getElementById('reposition-modal');
        if (!modal) {
            console.error('RepositionModal: Modal no encontrado');
            return false;
        }
        
        // Aplicar estilos directamente
        modal.classList.remove('hidden');
        modal.style.cssText = `
            display: flex !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            z-index: 99999 !important;
            background-color: rgba(0, 0, 0, 0.5) !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 1rem !important;
        `;
        
        // Prevenir scroll del body
        document.body.style.overflow = 'hidden';
        
        // Focus en el buscador
        setTimeout(() => {
            const searchInput = document.getElementById('reposition-search');
            if (searchInput) {
                searchInput.focus();
            }
        }, 100);
        
        debugLog('RepositionModal: Modal mostrado exitosamente');
        return true;
    },

    /**
     * ✅ CORREGIDO: Método hide() funcional
     */
    hide() {
        debugLog('RepositionModal.hide() - VERSIÓN CORREGIDA');
        
        const modal = document.getElementById('reposition-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
            
            // Restaurar scroll del body
            document.body.style.overflow = '';
            
            debugLog('RepositionModal: Modal ocultado exitosamente');
        }
    }
};

// ===========================================
// EXPORTAR Y FUNCIONES DE RESPALDO
// ===========================================

// Hacer disponible globalmente
window.RepositionModal = RepositionModal;

// ✅ NUEVO: Función de respaldo para casos extremos
window.forceShowRepositionModal = function() {
    console.log('🔧 Función de respaldo: forceShowRepositionModal');
    
    let modal = document.getElementById('reposition-modal');
    
    if (!modal) {
        // Crear modal básico de emergencia
        const modalHTML = `
            <div id="reposition-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50" style="display: flex; align-items: center; justify-content: center;">
                <div class="bg-white rounded-lg w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-xl m-4">
                    <div class="p-6 border-b border-gray-200">
                        <h3 class="text-lg font-semibold text-gray-900">Reposición Individual (Modo Respaldo)</h3>
                        <p class="text-sm text-gray-600 mt-1">Modal de emergencia - funcionalidad limitada</p>
                    </div>
                    <div class="p-6 text-center">
                        <p class="mb-4">Por favor, cierra este modal y vuelve a intentarlo.</p>
                        <button onclick="forceHideRepositionModal()" class="btn btn-primary">
                            Cerrar y Reintentar
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('reposition-modal');
    } else {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
    }
    
    document.body.style.overflow = 'hidden';
    return modal;
};

window.forceHideRepositionModal = function() {
    const modal = document.getElementById('reposition-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
    document.body.style.overflow = '';
};

debugLog('reposition-modal.js COMPLETAMENTE CORREGIDO - IDs normalizados, mejor UX y manejo de errores');
