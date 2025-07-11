/**
 * CONTROLADOR DE REPOSICIÓN GRUPAL
 * =================================
 * Maneja toda la lógica de reposiciones grupales
 */

const GroupRepositionController = {
    // Estado interno del controlador
    _state: {
        professors: [],
        students: [],
        assistants: [],
        selectedStudents: [],
        formData: {},
        isLoading: false
    },

    /**
     * Muestra el formulario de reposición grupal
     */
    async show() {
        debugLog('GroupRepositionController: Mostrando formulario de reposición grupal');
        
        try {
            this._setState({ isLoading: true });
            
            // Mostrar loading inicial
            const loadingHtml = GroupRepositionFormView.render({ isLoading: true });
            document.getElementById('app').innerHTML = loadingHtml;
            
            // Cargar datos necesarios
            const formData = await GroupRepositionService.getFormData();
            
            this._setState({
                professors: formData.professors,
                students: formData.students,
                assistants: formData.assistants,
                selectedStudents: [],
                formData: {},
                isLoading: false
            });
            
            // Renderizar formulario completo
            const html = GroupRepositionFormView.render({
                professors: formData.professors,
                students: formData.students,
                assistants: formData.assistants,
                isLoading: false
            });
            
            document.getElementById('app').innerHTML = html;
            
            // Configurar eventos del formulario
            this._setupFormEvents();
            
        } catch (error) {
            console.error('GroupRepositionController: Error mostrando formulario:', error);
            UIUtils.showError('Error al cargar el formulario de reposición grupal');
            AppController.showDashboard();
        }
    },

    /**
     * Alterna la selección de un estudiante
     */
    toggleStudent(studentId) {
        debugLog(`GroupRepositionController: Alternando selección de estudiante ${studentId}`);
        
        const student = this._state.students.find(s => s.id === studentId);
        if (!student) return;
        
        let selectedStudents = [...this._state.selectedStudents];
        const isSelected = selectedStudents.some(s => s.id === studentId);
        
        if (isSelected) {
            selectedStudents = selectedStudents.filter(s => s.id !== studentId);
        } else {
            selectedStudents.push(student);
        }
        
        this._setState({ selectedStudents });
        this._updateUI();
    },

    /**
     * Filtra estudiantes por búsqueda
     */
    filterStudents() {
        const searchInput = document.getElementById('student-search');
        const searchTerm = searchInput ? searchInput.value : '';
        
        GroupRepositionFormView.filterStudents(searchTerm);
    },

    /**
     * Guarda la reposición grupal
     */
    async saveReposition() {
        debugLog('GroupRepositionController: Guardando reposición grupal');
        
        try {
            // Recopilar datos del formulario
            const formData = this._collectFormData();
            
            // Validar datos
            const validation = GroupRepositionService.validateFormData(formData);
            if (!validation.valid) {
                UIUtils.showError(`Datos incompletos:\n${validation.errors.join('\n')}`);
                return;
            }
            
            // Mostrar loading
            this._showSaveLoading(true);
            
            // Guardar reposición
            const result = await GroupRepositionService.saveGroupReposition(formData);
            
            // Mostrar éxito
            this._showSuccessMessage(result);
            
        } catch (error) {
            console.error('GroupRepositionController: Error guardando reposición:', error);
            UIUtils.showError(error.message || 'Error al guardar la reposición grupal');
        } finally {
            this._showSaveLoading(false);
        }
    },

    /**
     * Resetea el formulario
     */
    resetForm() {
        debugLog('GroupRepositionController: Reseteando formulario');
        
        // Limpiar estado
        this._setState({
            selectedStudents: [],
            formData: {}
        });
        
        // Limpiar formulario HTML
        const form = document.getElementById('group-reposition-form');
        if (form) {
            form.reset();
        }
        
        // Limpiar checkboxes de estudiantes
        const checkboxes = document.querySelectorAll('#students-list input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
        
        // Actualizar UI
        this._updateUI();
        
        UIUtils.showSuccess('Formulario limpiado');
    },

    // ===========================================
    // MÉTODOS PRIVADOS
    // ===========================================

    /**
     * Actualiza el estado interno
     */
    _setState(newState) {
        this._state = { ...this._state, ...newState };
        debugLog('GroupRepositionController: Estado actualizado:', this._state);
    },

    /**
     * Configura eventos del formulario
     */
    _setupFormEvents() {
        debugLog('GroupRepositionController: Configurando eventos del formulario');
        
        // Eventos de cambio en campos del formulario
        const fields = ['reposition-date', 'reposition-time', 'reposition-professor', 'reposition-court', 'reposition-count', 'reposition-assistant'];
        
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('change', () => this._updateUI());
            }
        });
    },

    /**
     * Actualiza la UI (resumen y botón)
     */
    _updateUI() {
        const formData = this._collectFormData();
        const selectedStudents = this._state.selectedStudents;
        
        // Actualizar resumen
        GroupRepositionFormView.updateSummary(formData, selectedStudents);
        
        // Habilitar/deshabilitar botón de guardar
        const saveBtn = document.getElementById('save-reposition-btn');
        if (saveBtn) {
            const isValid = this._isFormValid(formData, selectedStudents);
            saveBtn.disabled = !isValid;
            saveBtn.classList.toggle('opacity-50', !isValid);
        }
    },

    /**
     * Recopila datos del formulario
     */
    _collectFormData() {
        const professorSelect = document.getElementById('reposition-professor');
        const professorOption = professorSelect?.selectedOptions[0];
        
        const assistantSelect = document.getElementById('reposition-assistant');
        const assistantOption = assistantSelect?.selectedOptions[0];
        
        return {
            fecha: document.getElementById('reposition-date')?.value || '',
            hora: document.getElementById('reposition-time')?.value || '',
            profesorId: document.getElementById('reposition-professor')?.value || '',
            profesorNombre: professorOption?.dataset.name || '',
            cancha: parseInt(document.getElementById('reposition-court')?.value) || 0,
            numeroReposiciones: parseInt(document.getElementById('reposition-count')?.value) || 0,
            asistenteId: document.getElementById('reposition-assistant')?.value || '',
            asistenteNombre: assistantOption?.dataset.name || '',
            estudiantesSeleccionados: this._state.selectedStudents
        };
    },

    /**
     * Valida si el formulario está completo
     */
    _isFormValid(formData, selectedStudents) {
        return formData.fecha && 
               formData.hora && 
               formData.profesorId && 
               formData.cancha > 0 && 
               formData.numeroReposiciones > 0 && 
               selectedStudents.length > 0;
    },

    /**
     * Muestra/oculta loading en botón de guardar
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
            saveBtn.innerHTML = '💾 Crear Reposición Grupal';
            this._updateUI(); // Restaurar estado del botón
        }
    },

    /**
     * Muestra mensaje de éxito con opción de ir al dashboard
     */
    _showSuccessMessage(result) {
        const message = `
            Reposición grupal creada exitosamente:
            
            • ${result.studentsCount} estudiantes
            • ${result.totalAttendanceRecords} registros de asistencia
            • ID de clase: ${result.classId}
        `;
        
        const modal = document.getElementById('notification-modal');
        const content = document.getElementById('notification-content');
        
        if (modal && content) {
            content.innerHTML = `
                <div class="text-center">
                    <div class="text-6xl mb-4 text-green-500">✅</div>
                    <h3 class="text-xl font-bold mb-4 text-green-900">¡Reposición Grupal Creada!</h3>
                    <div class="bg-green-50 p-4 rounded mb-6 text-left">
                        <h5 class="font-medium text-green-800 mb-2">Detalles:</h5>
                        <ul class="text-sm text-green-700 space-y-1">
                            <li>• ${result.studentsCount} estudiantes registrados</li>
                            <li>• ${result.totalAttendanceRecords} registros de asistencia</li>
                            <li>• ID de clase: ${result.classId}</li>
                        </ul>
                    </div>
                    <div class="flex gap-3 justify-center">
                        <button onclick="AppController.showDashboard(); UIUtils.closeNotification();" 
                                class="btn btn-primary">
                            🏠 Ir al Dashboard
                        </button>
                        <button onclick="GroupRepositionController.resetForm(); UIUtils.closeNotification();" 
                                class="btn btn-secondary">
                            ➕ Crear Otra Reposición
                        </button>
                    </div>
                </div>
            `;
            modal.classList.remove('hidden');
        }
    }
};

// Hacer disponible globalmente
window.GroupRepositionController = GroupRepositionController;

debugLog('group-reposition-controller.js cargado correctamente');
