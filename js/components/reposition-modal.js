/**
 * MODAL DE REPOSICIÓN INDIVIDUAL
 * ===============================
 * Componente modal para seleccionar estudiantes para reposición individual
 */

const RepositionModal = {
    /**
     * Renderiza el modal completo de reposición individual
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
     * Renderiza la sección de búsqueda
     */
    renderSearchSection(searchTerm, selectedCount) {
        return `
            <div class="p-6 border-b border-gray-200">
                <!-- Buscador -->
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
                        class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-md text-base focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
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
     * Renderiza la lista de estudiantes
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
     * Renderiza un item individual de estudiante
     */
    renderStudentItem(student, isSelected) {
        return `
            <div class="reposition-student-item p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${isSelected ? 'bg-primary-50 border-primary-200' : ''}"
                 data-student-id="${student.id}"
                 onclick="RepositionController.toggleStudent('${student.id}')">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <h4 class="font-medium text-gray-900">${student.nombre}</h4>
                        <p class="text-sm text-gray-500">ID: ${student.id}</p>
                        <p class="text-sm text-gray-500">Grupo: ${student.grupo_principal || 'Sin grupo'}</p>
                        ${student.grupo_secundario ? `<p class="text-xs text-blue-600">También en: ${student.grupo_secundario}</p>` : ''}
                    </div>
                    <div class="flex items-center ml-4">
                        <input
                            type="checkbox"
                            id="student-checkbox-${student.id}"
                            ${isSelected ? 'checked' : ''}
                            onchange="RepositionController.toggleStudent('${student.id}')"
                            class="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <label for="student-checkbox-${student.id}" class="ml-2 text-sm text-gray-700">
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
     * Renderiza el estado vacío
     */
    renderEmptyState(searchTerm) {
        if (searchTerm) {
            return `
                <div class="p-8 text-center text-gray-500">
                    <span class="text-6xl mb-4 block">🔍</span>
                    <h4 class="text-lg font-medium mb-2">No se encontraron estudiantes</h4>
                    <p class="text-sm">No hay estudiantes que coincidan con "${searchTerm}"</p>
                    <button 
                        onclick="RepositionController.clearSearch()" 
                        class="mt-4 btn btn-outline btn-sm"
                    >
                        Limpiar búsqueda
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
     * Renderiza el footer con acciones
     */
    renderFooter(selectedCount) {
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
                            Cancelar
                        </button>
                        
                        <button 
                            onclick="RepositionController.saveReposition()"
                            id="save-reposition-btn"
                            class="btn btn-primary flex items-center gap-2 ${selectedCount === 0 ? 'opacity-50 cursor-not-allowed' : ''}"
                            ${selectedCount === 0 ? 'disabled' : ''}
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
     * Actualiza solo la lista de estudiantes (para búsqueda en tiempo real)
     */
    updateStudentsList(allStudents, selectedStudents, searchTerm) {
        const listContainer = document.getElementById('reposition-students-list');
        if (!listContainer) return;

        const filteredStudents = RepositionService.searchStudentsByName(allStudents, searchTerm);
        
        if (filteredStudents.length === 0) {
            listContainer.outerHTML = this.renderEmptyState(searchTerm);
        } else {
            listContainer.innerHTML = filteredStudents.map(student => 
                this.renderStudentItem(student, this.isStudentSelected(student.id, selectedStudents))
            ).join('');
        }
    },

    /**
     * Actualiza el contador de seleccionados
     */
    updateSelectionCount(selectedCount) {
        // Actualizar botón de guardar
        const saveBtn = document.getElementById('save-reposition-btn');
        if (saveBtn) {
            saveBtn.disabled = selectedCount === 0;
            saveBtn.className = `btn btn-primary flex items-center gap-2 ${selectedCount === 0 ? 'opacity-50 cursor-not-allowed' : ''}`;
            
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
    },

    /**
     * Verifica si un estudiante está seleccionado
     */
    isStudentSelected(studentId, selectedStudents) {
        return selectedStudents.some(student => student.id === studentId);
    },

  /**
 * ✅ MÉTODO SHOW() CORREGIDO - Reemplaza la versión defectuosa
 */
show() {
    debugLog('RepositionModal.show() - VERSIÓN CORREGIDA FUNCIONANDO');
    
    const modal = document.getElementById('reposition-modal');
    if (!modal) {
        console.error('RepositionModal: Modal no encontrado en DOM');
        return false;
    }
    
    debugLog('RepositionModal: Modal encontrado, mostrando...');
    
    // Usar el patrón simple que funciona en otros modales
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.right = '0';
    modal.style.bottom = '0';
    modal.style.zIndex = '9999';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.padding = '1rem';
    
    // Prevenir scroll del body
    document.body.classList.add('no-scroll');
    document.body.style.overflow = 'hidden';
    
    // Focus en el buscador
    setTimeout(() => {
        const searchInput = document.getElementById('reposition-search');
        if (searchInput) {
            searchInput.focus();
            debugLog('RepositionModal: Focus establecido en buscador');
        }
    }, 100);
    
    debugLog('RepositionModal: Modal mostrado exitosamente');
    return true;
},

/**
 * ✅ MÉTODO HIDE() CORREGIDO - Reemplaza la versión defectuosa
 */
hide() {
    debugLog('RepositionModal.hide() - VERSIÓN CORREGIDA');
    
    const modal = document.getElementById('reposition-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        
        // Restaurar scroll del body
        document.body.classList.remove('no-scroll');
        document.body.style.overflow = '';
        
        debugLog('RepositionModal: Modal ocultado exitosamente');
    }
}

// 2. SEGUNDO: Forzar la sobrescritura del objeto RepositionModal
debugLog('Sobrescribiendo métodos defectuosos de RepositionModal...');

// Verificar si RepositionModal existe
if (window.RepositionModal) {
    // Sobrescribir solo los métodos problemáticos
    window.RepositionModal.show = function() {
        debugLog('RepositionModal.show() - VERSIÓN CORREGIDA FUNCIONANDO');
        
        const modal = document.getElementById('reposition-modal');
        if (!modal) {
            console.error('RepositionModal: Modal no encontrado en DOM');
            return false;
        }
        
        debugLog('RepositionModal: Modal encontrado, mostrando...');
        
        // Usar el patrón simple que funciona
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.right = '0';
        modal.style.bottom = '0';
        modal.style.zIndex = '9999';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.padding = '1rem';
        
        // Prevenir scroll del body
        document.body.classList.add('no-scroll');
        document.body.style.overflow = 'hidden';
        
        // Focus en el buscador
        setTimeout(() => {
            const searchInput = document.getElementById('reposition-search');
            if (searchInput) {
                searchInput.focus();
                debugLog('RepositionModal: Focus establecido en buscador');
            }
        }, 100);
        
        debugLog('RepositionModal: Modal mostrado exitosamente');
        return true;
    };

    window.RepositionModal.hide = function() {
        debugLog('RepositionModal.hide() - VERSIÓN CORREGIDA');
        
        const modal = document.getElementById('reposition-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
            
            // Restaurar scroll del body
            document.body.classList.remove('no-scroll');
            document.body.style.overflow = '';
            
            debugLog('RepositionModal: Modal ocultado exitosamente');
        }
    };

    debugLog('✅ Métodos RepositionModal.show() y hide() sobrescritos exitosamente');
} else {
    console.error('❌ RepositionModal no existe para sobrescribir');
}

// 3. TERCERO: Código alternativo directo para RepositionController

/**
 * ✅ ALTERNATIVA: Método para usar directamente en RepositionController
 * En caso de que la sobrescritura no funcione
 */
window.showRepositionModalDirect = function() {
    debugLog('showRepositionModalDirect() - Método directo alternativo');
    
    const modal = document.getElementById('reposition-modal');
    if (!modal) {
        console.error('Modal de reposición no encontrado');
        return false;
    }
    
    // Mostrar modal directamente
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.zIndex = '9999';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.padding = '1rem';
    
    document.body.style.overflow = 'hidden';
    
    setTimeout(() => {
        const searchInput = document.getElementById('reposition-search');
        if (searchInput) searchInput.focus();
    }, 100);
    
    debugLog('Modal mostrado con método directo');
    return true;
};

// Hacer disponible globalmente
window.RepositionModal = RepositionModal;

debugLog('reposition-modal.js cargado correctamente');
