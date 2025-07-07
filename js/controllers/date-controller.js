/**
 * CONTROLADOR DE FECHA
 * ====================
 * Maneja toda la lógica del selector de fecha
 */

const DateController = {
    // Estado interno del controlador
    _state: {
        selectedDate: null,
        availableGroups: [],
        isLoading: false
    },

    /**
     * Inicializa el controlador de fecha
     */
    async initialize() {
        debugLog('DateController: Inicializando...');
        
        const today = DateUtils.getCurrentDate();
        this._setState({ selectedDate: today });
        
        // Cargar información inicial
        await this._loadInitialDateInfo(today);
    },

    /**
     * Maneja el cambio de fecha en el input
     */
    async onDateChange() {
        debugLog('DateController: Cambio de fecha detectado');
        
        try {
            const dateInput = document.getElementById('selected-date');
            const selectedDate = dateInput?.value;
            
            if (!selectedDate) {
                debugLog('DateController: Fecha inválida');
                return;
            }

            // Validar fecha
            if (!this._isValidDate(selectedDate)) {
                UIUtils.showWarning('Por favor selecciona una fecha válida');
                this._resetToToday();
                return;
            }
            
            this._setState({ selectedDate, isLoading: true });
            
            // Actualizar información del día
            await this._updateDateInfo(selectedDate);
            
        } catch (error) {
            console.error('DateController: Error al cambiar fecha:', error);
            UIUtils.showError('Error al procesar la fecha seleccionada');
            this._resetToToday();
        } finally {
            this._setState({ isLoading: false });
        }
    },

    /**
     * Selecciona una fecha rápida (hoy, ayer, mañana)
     */
    async selectQuickDate(type) {
        debugLog(`DateController: Selección rápida - ${type}`);
        
        try {
            const targetDate = this._calculateQuickDate(type);
            
            if (!targetDate) {
                UIUtils.showError('Tipo de fecha rápida no válido');
                return;
            }

            // Validar fecha calculada
            if (!this._isValidDate(targetDate)) {
                UIUtils.showWarning('Fecha no válida para asistencias');
                return;
            }
            
            // Actualizar input de fecha
            const dateInput = document.getElementById('selected-date');
            if (dateInput) {
                dateInput.value = targetDate;
            }
            
            // Actualizar información
            await this.onDateChange();
            
        } catch (error) {
            console.error(`DateController: Error en selección rápida ${type}:`, error);
            UIUtils.showError('Error al seleccionar fecha');
        }
    },

    /**
     * Selecciona un día específico de la semana actual
     */
    async selectDayOfWeek(dayName) {
        debugLog(`DateController: Seleccionando día de semana - ${dayName}`);
        
        try {
            const targetDate = this._getDateForDayOfWeek(dayName);
            
            if (!targetDate) {
                UIUtils.showError('No se pudo calcular la fecha para ese día');
                return;
            }

            // Actualizar input
            const dateInput = document.getElementById('selected-date');
            if (dateInput) {
                dateInput.value = targetDate;
            }
            
            // Actualizar información
            await this.onDateChange();
            
        } catch (error) {
            console.error(`DateController: Error seleccionando día ${dayName}:`, error);
            UIUtils.showError('Error al seleccionar día de la semana');
        }
    },

    /**
     * Carga los grupos para la fecha seleccionada y navega al dashboard
     */
    async loadSelectedDate() {
        debugLog('DateController: Cargando fecha seleccionada');
        
        try {
            const selectedDate = this._state.selectedDate;
            
            if (!selectedDate) {
                UIUtils.showWarning('Por favor selecciona una fecha válida');
                return;
            }

            // Validar fecha antes de continuar
            if (!this._isValidDate(selectedDate)) {
                UIUtils.showWarning('La fecha seleccionada no es válida');
                this._resetToToday();
                return;
            }
            
            // Validar que la fecha tenga grupos
            const dayName = DateUtils.getDayFromDate(selectedDate);
            const dayGroups = await GroupService.getGroupsByDay(dayName);
            
            if (dayGroups.length === 0) {
                UIUtils.showWarning(`No hay grupos programados para los ${this._getReadableDayName(dayName)}`);
                return;
            }
            
            // Guardar fecha seleccionada en estado global
            window.AppState.selectedDate = selectedDate;
            
            // Navegar al dashboard
            await AppController.showDashboard();
            
        } catch (error) {
            console.error('DateController: Error al cargar fecha seleccionada:', error);
            UIUtils.showError('Error al cargar los grupos de la fecha seleccionada');
        }
    },

    /**
     * Reintenta la carga de datos en caso de error
     */
    async retry() {
        debugLog('DateController: Reintentando carga de datos');
        
        try {
            // Recargar datos de grupos
            await GroupService.refresh();
            
            // Mostrar selector de fecha nuevamente
            await AppController.showDateSelector();
            
        } catch (error) {
            console.error('DateController: Error en reintento:', error);
            UIUtils.showError('Error al reintentar. Intenta recargar la página.');
        }
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
        debugLog('DateController: Estado actualizado:', this._state);
    },

    /**
     * Carga información inicial para una fecha
     */
    async _loadInitialDateInfo(date) {
        debugLog(`DateController: Cargando info inicial para ${date}`);
        
        try {
            const dayName = DateUtils.getDayFromDate(date);
            const dayGroups = await GroupService.getGroupsByDay(dayName);
            
            this._setState({ 
                availableGroups: dayGroups,
                selectedDate: date
            });
            
            debugLog(`DateController: ${dayGroups.length} grupos encontrados para ${dayName}`);
            
        } catch (error) {
            console.error('DateController: Error cargando info inicial:', error);
            this._setState({ availableGroups: [] });
        }
    },

    /**
     * Actualiza la información de la fecha en la UI
     */
    async _updateDateInfo(selectedDate) {
        debugLog(`DateController: Actualizando info para ${selectedDate}`);
        
        try {
            const dayName = DateUtils.getDayFromDate(selectedDate);
            const dayGroups = await GroupService.getGroupsByDay(dayName);
            
            // Actualizar estado interno
            this._setState({ 
                selectedDate,
                availableGroups: dayGroups 
            });
            
            // Actualizar UI usando el componente
            DateSelectorView.updateDateInfo({
                selectedDate,
                dayName,
                groupsCount: dayGroups.length
            });
            
            debugLog(`DateController: UI actualizada - ${dayGroups.length} grupos para ${dayName}`);
            
        } catch (error) {
            console.error('DateController: Error actualizando info de fecha:', error);
            
            // Mostrar error en UI
            DateSelectorView.updateDateInfo({
                selectedDate,
                dayName: DateUtils.getDayFromDate(selectedDate),
                groupsCount: 0
            });
        }
    },

    /**
     * Calcula la fecha para selecciones rápidas
     */
    _calculateQuickDate(type) {
        const today = new Date();
        let targetDate;
        
        switch (type) {
            case 'today':
                targetDate = today;
                break;
                
            case 'yesterday':
                targetDate = new Date(today);
                targetDate.setDate(today.getDate() - 1);
                break;
                
            case 'tomorrow':
                targetDate = new Date(today);
                targetDate.setDate(today.getDate() + 1);
                break;
                
            default:
                debugLog(`DateController: Tipo de fecha rápida desconocido: ${type}`);
                return null;
        }
        
        return targetDate.toISOString().split('T')[0];
    },

    /**
     * Obtiene la fecha para un día específico de la semana actual
     */
    _getDateForDayOfWeek(dayName) {
        const dayMap = {
            'lunes': 1,
            'martes': 2,
            'miercoles': 3,
            'jueves': 4,
            'viernes': 5,
            'sabado': 6,
            'domingo': 0
        };

        const targetDayNumber = dayMap[dayName.toLowerCase()];
        if (targetDayNumber === undefined) {
            return null;
        }

        const today = new Date();
        const currentDayNumber = today.getDay();
        
        // Calcular días de diferencia
        let dayDifference = targetDayNumber - currentDayNumber;
        
        // Si es el mismo día, mantener la fecha actual
        // Si ya pasó en la semana, ir a la próxima semana
        if (dayDifference < 0) {
            dayDifference += 7;
        }
        
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + dayDifference);
        
        return targetDate.toISOString().split('T')[0];
    },

    /**
     * Valida que una fecha sea válida para asistencias
     */
    _isValidDate(dateString) {
        if (!ValidationUtils.isValidDate(dateString)) {
            return false;
        }
        
        // Verificar que no sea muy futura (máximo 7 días)
        const inputDate = new Date(dateString);
        const today = new Date();
        const maxFutureDate = new Date(today);
        maxFutureDate.setDate(today.getDate() + 7);
        
        // Verificar que no sea muy antigua (máximo 30 días atrás)
        const minPastDate = new Date(today);
        minPastDate.setDate(today.getDate() - 30);
        
        return inputDate >= minPastDate && inputDate <= maxFutureDate;
    },

    /**
     * Resetea el selector a la fecha de hoy
     */
    _resetToToday() {
        const today = DateUtils.getCurrentDate();
        const dateInput = document.getElementById('selected-date');
        
        if (dateInput) {
            dateInput.value = today;
        }
        
        this._setState({ selectedDate: today });
        this._updateDateInfo(today);
    },

    /**
     * Convierte nombre de día a formato legible
     */
    _getReadableDayName(dayName) {
        const dayMap = {
            'lunes': 'lunes',
            'martes': 'martes',
            'miercoles': 'miércoles',
            'jueves': 'jueves',
            'viernes': 'viernes',
            'sabado': 'sábados',
            'domingo': 'domingos'
        };
        
        return dayMap[dayName] || dayName;
    },

    /**
     * Obtiene resumen de grupos para una fecha
     */
    async _getDateSummary(date) {
        try {
            const dayName = DateUtils.getDayFromDate(date);
            const dayGroups = await GroupService.getGroupsByDay(dayName);
            
            const summary = {
                date,
                dayName,
                groupsCount: dayGroups.length,
                groups: dayGroups.map(g => ({
                    codigo: g.codigo,
                    descriptor: g.descriptor,
                    profesor: g.profe,
                    hora: g.hora
                }))
            };
            
            return summary;
            
        } catch (error) {
            console.error('DateController: Error obteniendo resumen de fecha:', error);
            return {
                date,
                dayName: DateUtils.getDayFromDate(date),
                groupsCount: 0,
                groups: []
            };
        }
    }
};

// Hacer disponible globalmente
window.DateController = DateController;

debugLog('date-controller.js cargado correctamente');
