/**
 * CONTROLADOR DE REPOSICIÓN INDIVIDUAL
 * =====================================
 * Maneja toda la lógica de reposición individual dentro de una clase
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
 * VERSIÓN ACTUALIZADA del método openFromAttendance
 * =================================================
 * Usa múltiples fallbacks para garantizar que el modal se abra
 */

    async openFromAttendance(classData) {
        debugLog('RepositionController: Abriendo modal de reposición individual - VERSIÓN CON FALLBACKS');
        
        try {
            // 1. LIMPIAR ESTADO COMPLETAMENTE cada vez
            this._setState({
                isOpen: true,
                isLoading: true,
                currentClassData: classData,
                selectedStudents: [],
                searchTerm: '',
                allStudents: []
            });
    
            debugLog('RepositionController: Estado limpiado y configurado');
    
            // 2. CREAR MODAL FRESCO cada vez
            this._createFreshModal();
            
            // 3. INTENTAR MOSTRAR MODAL con múltiples fallbacks
            let modalShown = false;
            
            // Intento 1: Método corregido
            try {
                modalShown = RepositionModal.show();
                if (modalShown) {
                    debugLog('RepositionController: Modal mostrado con RepositionModal.show() corregido');
                }
            } catch (error) {
                debugLog('RepositionController: Error con RepositionModal.show():', error.message);
            }
            
            // Intento 2: Método directo alternativo
            if (!modalShown && window.showRepositionModalDirect) {
                try {
                    modalShown = window.showRepositionModalDirect();
                    if (modalShown) {
                        debugLog('RepositionController: Modal mostrado con showRepositionModalDirect()');
                    }
                } catch (error) {
                    debugLog('RepositionController: Error con showRepositionModalDirect():', error.message);
                }
            }
            
            // Intento 3: Fallback conocido que funciona
            if (!modalShown && window.forceShowRepositionModal) {
                try {
                    window.forceShowRepositionModal();
                    modalShown = true;
                    debugLog('RepositionController: Modal mostrado con forceShowRepositionModal()');
                } catch (error) {
                    debugLog('RepositionController: Error con forceShowRepositionModal():', error.message);
                }
            }
            
            // Intento 4: Método manual directo
            if (!modalShown) {
                try {
                    const modal = document.getElementById('reposition-modal');
                    if (modal) {
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
                        modalShown = true;
                        debugLog('RepositionController: Modal mostrado con método manual directo');
                    }
                } catch (error) {
                    debugLog('RepositionController: Error con método manual:', error.message);
                }
            }
            
            if (!modalShown) {
                throw new Error('No se pudo mostrar el modal con ningún método');
            }
    
            // 4. CARGAR ESTUDIANTES en el modal ya visible
            await this._loadStudents();
            
        } catch (error) {
            console.error('RepositionController: Error abriendo modal:', error);
            UIUtils.showError('Error al cargar estudiantes para reposición');
            this.closeModal();
        }
    },

    
    /**
     * Carga todos los estudiantes disponibles
     */
    async _loadStudents() {
        debugLog('RepositionController: Cargando estudiantes...');
        
        try {
            const allStudents = await RepositionService.getAvailableStudents();
            
            this._setState({
                allStudents: allStudents,
                isLoading: false
            });
            
            // Re-renderizar modal con datos
            this._renderModal();
            
        } catch (error) {
            console.error('RepositionController: Error cargando estudiantes:', error);
            this._setState({ isLoading: false });
            UIUtils.showError('Error al cargar la lista de estudiantes');
        }
    },

    /**
     * Maneja cambios en la búsqueda
     */
    onSearchChange() {
        const searchInput = document.getElementById('reposition-search');
        if (!searchInput) return;
        
        const newSearchTerm = searchInput.value.trim();
        
        this._setState({ searchTerm: newSearchTerm });
        
        // Actualizar lista filtrada
        this._updateStudentsList();
        
        debugLog(`RepositionController: Búsqueda actualizada: "${newSearchTerm}"`);
    },

    /**
     * Limpia la búsqueda
     */
    clearSearch() {
        this._setState({ searchTerm: '' });
        
        const searchInput = document.getElementById('reposition-search');
        if (searchInput) {
            searchInput.value = '';
        }
        
        this._updateStudentsList();
        
        debugLog('RepositionController: Búsqueda limpiada');
    },

    /**
     * Alterna la selección de un estudiante - ✅ CORREGIDO
     */
    toggleStudent(studentId) {
        debugLog(`RepositionController: Alternando selección de estudiante ${studentId}`);
        
        const currentSelected = this._state.selectedStudents;
        
        // 🔧 FIX PRINCIPAL: Buscar en allStudents, NO en selectedStudents
        const student = this._state.allStudents.find(s => s.id === studentId);
        
        if (!student) {
            console.error(`RepositionController: Estudiante ${studentId} no encontrado en allStudents`);
            debugLog('RepositionController: Primeros 3 estudiantes disponibles:', 
                this._state.allStudents.slice(0, 3).map(s => ({id: s.id, nombre: s.nombre}))
            );
            return;
        }
        
        const isCurrentlySelected = currentSelected.some(s => s.id === studentId);
        
        let newSelected;
        if (isCurrentlySelected) {
            // Remover de selección
            newSelected = currentSelected.filter(s => s.id !== studentId);
            debugLog(`RepositionController: Removiendo estudiante ${studentId} de selección`);
        } else {
            // Agregar a selección
            newSelected = [...currentSelected, student];
            debugLog(`RepositionController: Agregando estudiante ${studentId} (${student.nombre}) a selección`);
        }
        
        this._setState({ selectedStudents: newSelected });
        
        // Actualizar UI
        this._updateStudentSelection(studentId, !isCurrentlySelected);
        this._updateSelectionCount();
        
        debugLog(`RepositionController: ${newSelected.length} estudiantes seleccionados total`);
    },

    /**
     * Guarda la reposición individual
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
                throw new Error('Datos de clase incompletos');
            }
            
            // Mostrar loading
            this._showSaveLoading(true);
            
            // Guardar reposición
            const result = await RepositionService.saveRepositionIndividual(selectedStudents, classData);
            
            if (result.success) {
                // Mostrar éxito
                UIUtils.showSuccess(result.message);
                
                // Cerrar modal
                this.closeModal();
                
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
     * Cierra el modal
     */
    closeModal() {
        debugLog('RepositionController: Cerrando modal');
        
        RepositionModal.hide();
        
        // Limpiar estado
        this._setState({
            isOpen: false,
            allStudents: [],
            selectedStudents: [],
            searchTerm: '',
            isLoading: false,
            currentClassData: null
        });
    },

    /**
     * Obtiene el estado actual del controlador
     */
    getState() {
        return { ...this._state };
    },

    // ===========================================
    // MÉTODOS PRIVADOS
    // ===========================================

    /**
     * Actualiza el estado interno
     */
    _setState(newState) {
        this._state = { ...this._state, ...newState };
        debugLog('RepositionController: Estado actualizado:', this._state);
    },

    /**
     * DEPRECATED: Ya no se usa - reemplazado por _createFreshModal
     * Asegura que el modal existe en el DOM
     */
    _ensureModalExists() {
        let modal = document.getElementById('reposition-modal');
        
        if (!modal) {
            // Crear modal y agregarlo al body
            document.body.insertAdjacentHTML('beforeend', RepositionModal.render());
            debugLog('RepositionController: Modal creado en DOM');
        }
    },

        /**
     * NUEVO: Crea un modal completamente fresco eliminando el anterior
     */
    _createFreshModal() {
        debugLog('RepositionController: Creando modal fresco');
        
        // Remover modal existente si existe
        const existingModal = document.getElementById('reposition-modal');
        if (existingModal) {
            existingModal.remove();
            debugLog('RepositionController: Modal anterior eliminado');
        }
        
        // Crear modal fresco con estado inicial limpio
        const modalHtml = RepositionModal.render({
            allStudents: [],
            selectedStudents: [],
            searchTerm: '',
            isLoading: true
        });
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        debugLog('RepositionController: Modal fresco creado en DOM');
    },

    
    /**
     * Renderiza el modal con el estado actual
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
        
        modal.outerHTML = RepositionModal.render(modalData);
        
        debugLog('RepositionController: Modal renderizado');
    },

    /**
     * Actualiza solo la lista de estudiantes (para búsqueda)
     */
    _updateStudentsList() {
        RepositionModal.updateStudentsList(
            this._state.allStudents,
            this._state.selectedStudents,
            this._state.searchTerm
        );
    },

    /**
     * Actualiza la selección visual de un estudiante específico
     */
    _updateStudentSelection(studentId, isSelected) {
        // Actualizar checkbox
        const checkbox = document.getElementById(`student-checkbox-${studentId}`);
        if (checkbox) {
            checkbox.checked = isSelected;
        }
        
        // Actualizar estilo del item
        const item = document.querySelector(`[data-student-id="${studentId}"]`);
        if (item) {
            if (isSelected) {
                item.classList.add('bg-primary-50', 'border-primary-200');
            } else {
                item.classList.remove('bg-primary-50', 'border-primary-200');
            }
        }
        
        // Actualizar label
        const label = document.querySelector(`label[for="student-checkbox-${studentId}"]`);
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
     * Muestra/oculta loading en el botón de guardar
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
            saveBtn.disabled = this._state.selectedStudents.length === 0;
            const count = this._state.selectedStudents.length;
            saveBtn.innerHTML = `
                <span class="text-lg">💾</span>
                <span>Guardar ${count > 0 ? `(${count})` : ''}</span>
            `;
        }
    }
};

// Hacer disponible globalmente
window.RepositionController = RepositionController;

debugLog('reposition-controller.js cargado correctamente');
