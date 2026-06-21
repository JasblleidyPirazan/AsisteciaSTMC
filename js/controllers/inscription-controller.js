/**
 * CONTROLADOR DE INSCRIPCIÓN
 * ===========================
 * Orquesta el flujo de inscripción:
 *  - Carga políticas y grupos con cupos disponibles
 *  - Aplica los filtros por días / horas / búsqueda
 *  - Gestiona la selección de grupo principal y secundario
 *  - Valida y guarda la inscripción
 */

const InscriptionController = {
    // Estado interno del controlador
    _state: {
        policies: [],
        groups: [],            // grupos enriquecidos con cupos
        filteredGroups: [],    // grupos tras aplicar filtros
        availableHours: [],
        selectedPrimary: '',
        selectedSecondary: '',
        policiesAccepted: false,
        isLoading: false
    },

    /**
     * Muestra la vista de inscripción
     */
    async show() {
        debugLog('InscriptionController: Mostrando vista de inscripción');

        try {
            // Loading inicial
            document.getElementById('app').innerHTML = InscriptionFormView.render({ isLoading: true });

            const policies = InscriptionService.getSchoolPolicies();
            const groups = await InscriptionService.getGroupsWithAvailability();
            const availableHours = InscriptionService.getAvailableHours(groups);

            this._setState({
                policies,
                groups,
                filteredGroups: groups,
                availableHours,
                selectedPrimary: '',
                selectedSecondary: '',
                policiesAccepted: false,
                isLoading: false
            });

            document.getElementById('app').innerHTML = InscriptionFormView.render({
                policies,
                groups,
                availableHours,
                isLoading: false
            });

            this._refreshSummary();

        } catch (error) {
            console.error('InscriptionController: Error al mostrar inscripción:', error);
            UIUtils.showError('Error al cargar la inscripción. Intenta nuevamente.');
            AppController.showDashboard();
        }
    },

    /**
     * Aplica los filtros de días, hora y búsqueda
     */
    applyFilters() {
        const days = Array.from(document.querySelectorAll('.filter-day:checked')).map(cb => cb.value);
        const hour = document.getElementById('filter-hour')?.value || '';
        const search = document.getElementById('filter-search')?.value || '';
        const soloConCupo = document.getElementById('filter-con-cupo')?.checked || false;

        const filtered = InscriptionService.filterGroups(this._state.groups, {
            days,
            hour,
            search,
            soloConCupo
        });

        this._setState({ filteredGroups: filtered });
        InscriptionFormView.updateGroupsGrid(filtered);
        this._refreshSummary(); // re-aplica resaltado en las tarjetas visibles
    },

    /**
     * Limpia los filtros
     */
    clearFilters() {
        document.querySelectorAll('.filter-day:checked').forEach(cb => { cb.checked = false; });
        const hour = document.getElementById('filter-hour');
        const search = document.getElementById('filter-search');
        const conCupo = document.getElementById('filter-con-cupo');
        if (hour) hour.value = '';
        if (search) search.value = '';
        if (conCupo) conCupo.checked = false;

        this.applyFilters();
    },

    /**
     * Selecciona el grupo principal
     */
    selectPrimary(groupCode) {
        const group = this._state.groups.find(g => g.codigo === groupCode);
        if (!group) return;

        if (group.cupos_disponibles <= 0) {
            UIUtils.showWarning('Este grupo no tiene cupos disponibles.');
            return;
        }

        // Si era el secundario, lo liberamos
        const selectedSecondary = this._state.selectedSecondary === groupCode
            ? ''
            : this._state.selectedSecondary;

        this._setState({ selectedPrimary: groupCode, selectedSecondary });
        UIUtils.showSuccess(`Grupo principal: ${groupCode}`);
        this._refreshSummary();
    },

    /**
     * Selecciona el grupo secundario (opcional)
     */
    selectSecondary(groupCode) {
        const group = this._state.groups.find(g => g.codigo === groupCode);
        if (!group) return;

        if (group.cupos_disponibles <= 0) {
            UIUtils.showWarning('Este grupo no tiene cupos disponibles.');
            return;
        }

        if (this._state.selectedPrimary === groupCode) {
            UIUtils.showWarning('El grupo secundario debe ser diferente al principal.');
            return;
        }

        this._setState({ selectedSecondary: groupCode });
        UIUtils.showSuccess(`Grupo secundario: ${groupCode}`);
        this._refreshSummary();
    },

    /**
     * Quita el grupo secundario
     */
    clearSecondary() {
        this._setState({ selectedSecondary: '' });
        this._refreshSummary();
    },

    /**
     * Marca/desmarca la aceptación de políticas
     */
    togglePolicies() {
        const checkbox = document.getElementById('accept-policies');
        this._setState({ policiesAccepted: !!checkbox?.checked });
        this._refreshSummary();
    },

    /**
     * Valida y guarda la inscripción
     */
    async submit() {
        debugLog('InscriptionController: Enviando inscripción');

        const data = this._collectFormData();
        const validation = InscriptionService.validateInscription(data, this._state.groups);

        if (!validation.valid) {
            UIUtils.showError(`Revisa los siguientes puntos:\n• ${validation.errors.join('\n• ')}`);
            return;
        }

        const submitBtn = document.getElementById('submit-inscription-btn');
        const originalHtml = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<div class="spinner mr-2"></div> Guardando...';
        }

        try {
            const result = await InscriptionService.saveInscription(data);
            InscriptionFormView.showSuccess(result);
        } catch (error) {
            console.error('InscriptionController: Error al guardar inscripción:', error);
            UIUtils.showError(error.message || 'No se pudo registrar la inscripción.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalHtml;
            }
        }
    },

    // ===========================================
    // MÉTODOS PRIVADOS
    // ===========================================

    /**
     * Recopila los datos del formulario y la selección actual
     */
    _collectFormData() {
        return {
            nombre: document.getElementById('insc-nombre')?.value || '',
            acudiente: document.getElementById('insc-acudiente')?.value || '',
            telefono: document.getElementById('insc-telefono')?.value || '',
            email: document.getElementById('insc-email')?.value || '',
            grupoPrincipal: this._state.selectedPrimary,
            grupoSecundario: this._state.selectedSecondary,
            politicasAceptadas: this._state.policiesAccepted
        };
    },

    /**
     * Actualiza el resumen y el resaltado de tarjetas
     */
    _refreshSummary() {
        InscriptionFormView.updateSummary({
            selectedPrimary: this._state.selectedPrimary,
            selectedSecondary: this._state.selectedSecondary,
            policiesAccepted: this._state.policiesAccepted,
            groups: this._state.groups
        });
    },

    /**
     * Actualiza el estado interno
     */
    _setState(newState) {
        this._state = { ...this._state, ...newState };
    },

    /**
     * Devuelve el estado (debugging)
     */
    getState() {
        return { ...this._state };
    }
};

// Hacer disponible globalmente
window.InscriptionController = InscriptionController;

debugLog('inscription-controller.js cargado correctamente');
