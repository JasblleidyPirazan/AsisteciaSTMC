/**
 * CONTROLADOR DE REPOSICIÓN INDIVIDUAL - CORREGIDO COMPLETAMENTE
 * ===============================================================
 * SOLUCIÓN: Normalización de IDs y mejor manejo de eventos
 */

const RepositionController = {
    // Estado interno del controlador
    _state: {
        isOpen: false,
        allStudents: [],
        selectedStudents: [],
        searchTerm: '',
        isLoading: false,
        currentClassData: null
    },

    /**
     * ✅ CORREGIDO: Abre modal desde AttendanceController
     */
    async openFromAttendance(classData) {
        debugLog('RepositionController: Abriendo modal de reposición individual - VERSIÓN COMPLETAMENTE CORREGIDA');
        
        try {
            // 1. LIMPIAR ESTADO COMPLETAMENTE
            this._setState({
                isOpen: true,
                isLoading: true,
                currentClassData: classData,
                selectedStudents: [],
                searchTerm: '',
                allStudents: []
            });
    
            // 2. CREAR MODAL FRESCO
            this._createFreshModal();
            
            // 3. MOSTRAR MODAL (usar método más confiable)
            this._forceShowModal();
            
            // 4. CARGAR ESTUDIANTES
            await this._loadStudents();
            
        } catch (error) {
            console.error('RepositionController: Error abriendo modal:', error);
            UIUtils.showError('Error al cargar estudiantes para reposición');
            this.closeModal();
        }
    },

    /**
     * ✅ NUEVO: Método más confiable para mostrar modal
     */
    _forceShowModal() {
        const modal = document.getElementById('reposition-modal');
        if (!modal) {
            console.error('Modal no encontrado después de creación');
            return false;
        }
        
        // Aplicar estilos directamente para garantizar visualización
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
        
        document.body.style.overflow = 'hidden';
        
        // Focus en buscador
        setTimeout(() => {
            const searchInput = document.getElementById('reposition-search');
            if (searchInput) {
                searchInput.focus();
            }
        }, 100);
        
        debugLog('RepositionController: Modal forzado a mostrarse correctamente');
        return true;
    },
    
    /**
     * ✅ CORREGIDO: Carga estudiantes con normalización de IDs
     */
    async _loadStudents() {
        debugLog('RepositionController: Cargando estudiantes...');
        
        try {
            const allStudents = await RepositionService.getAvailableStudents();
            
            // ✅ FIX CRÍTICO: Normalizar IDs a string para consistencia
            const normalizedStudents = allStudents.map(student => ({
                ...student,
                id: String(student.id) // Asegurar que ID sea string
            }));
            
            this._setState({
                allStudents: normalizedStudents,
                isLoading: false
            });
            
            // Re-renderizar modal con datos
            this._renderModal();
            
            debugLog(`RepositionController: ${normalizedStudents.length} estudiantes cargados y normalizados`);
            
        } catch (error) {
            console.error('RepositionController: Error cargando estudiantes:', error);
            this._setState({ isLoading: false });
            UIUtils.showError('Error al cargar la lista de estudiantes');
        }
    },

    /**
     * ✅ CORREGIDO: Maneja cambios en búsqueda con debounce
     */
    onSearchChange() {
        const searchInput = document.getElementById('reposition-search');
        if (!searchInput) return;
        
        const newSearchTerm = searchInput.value.trim();
        
        this._setState({ searchTerm: newSearchTerm });
        
        // Debounce para mejor rendimiento
        clearTimeout(this._searchTimeout);
        this._searchTimeout = setTimeout(() => {
            this._updateStudentsList();
        }, 300);
        
        debugLog(`RepositionController: Búsqueda actualizada: "${newSearchTerm}"`);
    },

    /**
     * ✅ CORREGIDO: Limpia búsqueda correctamente
     */
    clearSearch() {
        this._setState({ searchTerm: '' });
        
        const searchInput = document.getElementById('reposition-search');
        if (searchInput) {
            searchInput.value = '';
        }
        
        // Limpiar timeout si existe
        clearTimeout(this._searchTimeout);
        
        this._updateStudentsList();
        
        debugLog('RepositionController: Búsqueda limpiada');
    },

    /**
     * ✅ CORREGIDO COMPLETAMENTE: Alterna selección con normalización de IDs
     */
    toggleStudent(studentId) {
        debugLog(`RepositionController: Alternando selección de estudiante ${studentId}`);
        
        // ✅ FIX CRÍTICO: Normalizar studentId a string
        const normalizedStudentId = String(studentId);
        
        const currentSelected = this._state.selectedStudents;
        
        // ✅ FIX: Buscar con comparación normalizada
        const student = this._state.allStudents.find(s => String(s.id) === normalizedStudentId);
        
        if (!student) {
            console.error(`RepositionController: Estudiante ${normalizedStudentId} no encontrado`);
            debugLog('RepositionController: IDs disponibles (primeros 5):', 
                this._state.allStudents.slice(0, 5).map(s => ({
                    id: s.id, 
                    tipo: typeof s.id,
                    nombre: s.nombre
                }))
            );
            
            // ✅ NUEVO: Mostrar error visual al usuario
            UIUtils.showWarning(`No se pudo seleccionar el estudiante. ID: ${normalizedStudentId}`);
            return;
        }
        
        // ✅ FIX: Verificar selección actual con IDs normalizados
        const isCurrentlySelected = currentSelected.some(s => String(s.id) === normalizedStudentId);
        
        let newSelected;
        if (isCurrentlySelected) {
            // Remover de selección
            newSelected = currentSelected.filter(s => String(s.id) !== normalizedStudentId);
            debugLog(`RepositionController: Removiendo estudiante ${normalizedStudentId}`);
        } else {
            // Agregar a selección
            newSelected = [...currentSelected, student];
            debugLog(`RepositionController: Agregando estudiante ${normalizedStudentId} (${student.nombre})`);
        }
        
        this._setState({ selectedStudents: newSelected });
        
        // Actualizar UI
        this._updateStudentSelection(normalizedStudentId, !isCurrentlySelected);
        this._updateSelectionCount();
        
        debugLog(`RepositionController: ${newSelected.length} estudiantes seleccionados total`);
    },

    /**
     * ✅ CORREGIDO: Guarda reposición con validación mejorada
     */
    async saveReposition() {
        debugLog('RepositionController: Guardando reposición individual');
        
        try {
            const selectedStudents = this._state.selectedStudents;
            const classData = this._state.currentClassData;
            
            // Validar selección
            if (selectedStudents.length === 0) {
                UIUtils.showWarning('Debe seleccionar al menos un estudiante');
                return;
            }
            
            // Validar datos de clase
            if (!classData || !classData.groupCode || !classData.classId) {
                throw new Error('Datos de clase incompletos para reposición');
            }
            
            // Mostrar confirmación antes de guardar
            const confirmMessage = `¿Confirmar reposición individual para ${selectedStudents.length} estudiante(s)?`;
            
            if (!confirm(confirmMessage)) {
                return;
            }
            
            // Mostrar loading
            this._showSaveLoading(true);
            
            // ✅ NUEVO: Validar que todos los estudiantes tengan IDs válidos
            const invalidStudents = selectedStudents.filter(s => !s.id || !s.nombre);
            if (invalidStudents.length > 0) {
                throw new Error(`${invalidStudents.length} estudiantes tienen datos incompletos`);
            }
            
            // Guardar reposición
            const result = await RepositionService.saveRepositionIndividual(selectedStudents, classData);
            
            if (result.success) {
                // Mostrar éxito
                UIUtils.showSuccess(result.message);
                
                // Cerrar modal después de un momento
                setTimeout(() => {
                    this.closeModal();
                }, 1500);
                
                debugLog('RepositionController: Reposición guardada exitosamente');
                
            } else {
                throw new Error(result.error || 'Error desconocido al guardar');
            }
            
        } catch (error) {
            console.error('RepositionController: Error guardando reposición:', error);
            UIUtils.showError(error.message || 'Error al guardar la reposición individual');
        } finally {
            this._showSaveLoading(false);
        }
    },

    /**
     * ✅ CORREGIDO: Cierra modal correctamente
     */
    closeModal() {
        debugLog('RepositionController: Cerrando modal');
        
        const modal = document.getElementById('reposition-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
        
        // Limpiar timeouts
        clearTimeout(this._searchTimeout);
        
        // Limpiar estado
        this._setState({
            isOpen: false,
            allStudents: [],
            selectedStudents: [],
            searchTerm: '',
            isLoading: false,
            currentClassData: null
        });
        
        debugLog('RepositionController: Modal cerrado y estado limpiado');
    },

    /**
     * Obtiene el estado actual del controlador
     */
    getState() {
        return { ...this._state };
    },

    // ===========================================
    // MÉTODOS PRIVADOS CORREGIDOS
    // ===========================================

    /**
     * Actualiza el estado interno
     */
    _setState(newState) {
        this._state = { ...this._state, ...newState };
        debugLog('RepositionController: Estado actualizado:', this._state);
    },

    /**
     * ✅ CORREGIDO: Crea modal fresco con mejor estructura
     */
    _createFreshModal() {
        debugLog('RepositionController: Creando modal fresco');
        
        // Remover modal existente
        const existingModal = document.getElementById('reposition-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Crear modal básico de loading
        const modalHtml = `
            <div id="reposition-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50 hidden">
                <div class="flex items-center justify-center min-h-screen p-4">
                    <div class="bg-white rounded-lg w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-xl">
                        <div class="p-6 text-center">
                            <div class="spinner spinner-lg mx-auto mb-4"></div>
                            <p class="text-gray-600">Cargando estudiantes...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        debugLog('RepositionController: Modal fresco creado');
    },
    
    /**
     * ✅ CORREGIDO: Renderiza modal con datos actuales
     */
    _renderModal() {
        const modal = document.getElementById('reposition-modal');
        if (!modal) return;
        
        const modalData = {
            allStudents: this._state.allStudents,
            selectedStudents: this._state.selectedStudents,
            searchTerm: this._state.searchTerm,
            isLoading: this._state.isLoading
        };
        
        // Usar RepositionModal para generar contenido
        modal.outerHTML = RepositionModal.render(modalData);
        
        // Re-aplicar estilos de visualización
        const newModal = document.getElementById('reposition-modal');
        if (newModal) {
            this._forceShowModal();
        }
        
        debugLog('RepositionController: Modal renderizado con datos actuales');
    },

    /**
     * ✅ CORREGIDO: Actualiza lista de estudiantes con mejor manejo
     */
    _updateStudentsList() {
        try {
            const filteredStudents = RepositionService.searchStudentsByName(
                this._state.allStudents, 
                this._state.searchTerm
            );
            
            // Verificar que el container existe
            const listContainer = document.querySelector('#reposition-students-list, .max-h-96');
            if (!listContainer) {
                debugLog('RepositionController: Container de lista no encontrado, re-renderizando modal completo');
                this._renderModal();
                return;
            }
            
            // Actualizar solo la lista
            RepositionModal.updateStudentsList(
                this._state.allStudents,
                this._state.selectedStudents,
                this._state.searchTerm
            );
            
        } catch (error) {
            console.error('RepositionController: Error actualizando lista de estudiantes:', error);
            // Fallback: re-renderizar modal completo
            this._renderModal();
        }
    },

    /**
     * ✅ CORREGIDO: Actualiza selección visual con IDs normalizados
     */
    _updateStudentSelection(studentId, isSelected) {
        const normalizedId = String(studentId);
        
        // Actualizar checkbox
        const checkbox = document.getElementById(`student-checkbox-${normalizedId}`);
        if (checkbox) {
            checkbox.checked = isSelected;
        }
        
        // Actualizar estilo del item
        const item = document.querySelector(`[data-student-id="${normalizedId}"]`);
        if (item) {
            if (isSelected) {
                item.classList.add('bg-primary-50', 'border-primary-200');
            } else {
                item.classList.remove('bg-primary-50', 'border-primary-200');
            }
        }
        
        // Actualizar label
        const label = document.querySelector(`label[for="student-checkbox-${normalizedId}"]`);
        if (label) {
            label.textContent = isSelected ? 'Seleccionado' : 'Seleccionar';
        }
    },

    /**
     * Actualiza el contador de seleccionados
     */
    _updateSelectionCount() {
        RepositionModal.updateSelectionCount(this._state.selectedStudents.length);
    },

    /**
     * ✅ CORREGIDO: Muestra/oculta loading en botón de guardar
     */
    _showSaveLoading(isLoading) {
        const saveBtn = document.getElementById('save-reposition-btn');
        if (!saveBtn) return;
        
        if (isLoading) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = `
                <div class="spinner mr-2"></div>
                <span>Guardando...</span>
            `;
        } else {
            const count = this._state.selectedStudents.length;
            saveBtn.disabled = count === 0;
            saveBtn.innerHTML = `
                <span class="text-lg">💾</span>
                <span>Guardar ${count > 0 ? `(${count})` : ''}</span>
            `;
        }
    }
};

// Hacer disponible globalmente
window.RepositionController = RepositionController;

debugLog('reposition-controller.js COMPLETAMENTE CORREGIDO - Normalización de IDs, mejor manejo de eventos y UI mejorada');
