/**
 * COMPONENTE SELECTOR DE FECHA
 * ============================
 * Maneja la selección de fechas para reportar asistencias
 */

const DateSelectorComponent = {
    /**
     * Muestra el selector de fecha
     */
    show() {
        debugLog('Mostrando selector de fecha');
        
        const today = DateUtils.getCurrentDate();
        const currentDay = DateUtils.getCurrentDay();
        
        const app = document.getElementById('app');
        app.innerHTML = this.render(today, currentDay);
        
        // Actualizar información inicial del día
        setTimeout(() => {
            this.updateDateSelection();
        }, 100);
    },

    /**
     * Renderiza el selector de fecha
     */
    render(today, currentDay) {
        return `
            <div class="container">
                <!-- Header -->
                <header class="bg-white rounded-lg p-6 shadow-sm mb-6">
                    <div class="text-center">
                        <h1 class="text-3xl font-bold text-gray-900 mb-2">Sistema de Asistencia Tenis</h1>
                        <p class="text-gray-600">Selecciona la fecha para reportar asistencias</p>
                    </div>
                </header>

                <!-- Selector de Fecha -->
                <div class="bg-white rounded-lg p-6 shadow-sm mb-6">
                    <h2 class="text-xl font-semibold mb-4">Seleccionar Fecha de Reporte</h2>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Fecha personalizada -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-3">
                                Fecha específica:
                            </label>
                            <input 
                                type="date" 
                                id="selected-date"
                                value="${today}"
                                class="w-full border border-gray-300 rounded-md px-4 py-3 text-lg"
                                onchange="DateSelectorComponent.updateDateSelection()"
                            />
                        </div>
                        
                        <!-- Información del día seleccionado -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-3">
                                Información del día:
                            </label>
                            <div id="date-info" class="bg-gray-50 rounded-md p-4">
                                <p class="font-semibold" id="selected-day-name">${capitalize(currentDay)}</p>
                                <p class="text-sm text-gray-600" id="selected-date-formatted">${DateUtils.formatDate(today)}</p>
                                <p class="text-sm text-gray-500 mt-2" id="groups-count">Cargando grupos...</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Botón para continuar -->
                    <div class="mt-6">
                        <button 
                            onclick="DateSelectorComponent.loadGroupsForSelectedDate()" 
                            class="btn btn-primary btn-lg w-full"
                            id="continue-btn"
                        >
                            📋 Ver Grupos de este Día
                        </button>
                    </div>
                </div>

                <!-- Accesos rápidos a fechas comunes -->
                ${this.renderQuickDates(today, currentDay)}
            </div>
        `;
    },

    /**
     * Renderiza accesos rápidos a fechas
     */
    renderQuickDates(today, currentDay) {
        return `
            <div class="bg-white rounded-lg p-6 shadow-sm">
                <h3 class="text-lg font-semibold mb-4">Accesos Rápidos</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <button onclick="DateSelectorComponent.selectQuickDate('today')" class="btn btn-outline p-4 text-center">
                        <div class="text-lg mb-1">📅</div>
                        <div class="text-sm">Hoy</div>
                        <div class="text-xs text-gray-500">${capitalize(currentDay)}</div>
                    </button>
                    <button onclick="DateSelectorComponent.selectQuickDate('yesterday')" class="btn btn-outline p-4 text-center">
                        <div class="text-lg mb-1">⏮️</div>
                        <div class="text-sm">Ayer</div>
                    </button>
                    <button onclick="DateSelectorComponent.selectQuickDate('tomorrow')" class="btn btn-outline p-4 text-center">
                        <div class="text-lg mb-1">⏭️</div>
                        <div class="text-sm">Mañana</div>
                    </button>
                    <button onclick="ReportsComponent.show()" class="btn btn-secondary p-4 text-center">
                        <div class="text-lg mb-1">📊</div>
                        <div class="text-sm">Reportes</div>
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Actualiza la información cuando cambia la fecha seleccionada
     */
    updateDateSelection() {
        const dateInput = document.getElementById('selected-date');
        const selectedDate = dateInput.value;
        
        if (!selectedDate) return;
        
        // Actualizar información del día
        const dayName = DateUtils.getDayFromDate(selectedDate);
        const formattedDate = DateUtils.formatDate(selectedDate);
        
        debugLog(`Fecha seleccionada: ${selectedDate} -> ${dayName}`);
        
        document.getElementById('selected-day-name').textContent = capitalize(dayName);
        document.getElementById('selected-date-formatted').textContent = formattedDate;
        
        // Contar grupos para ese día
        this.updateGroupsCount(selectedDate);
    },

    /**
     * Actualiza el conteo de grupos para la fecha seleccionada
     */
    updateGroupsCount(selectedDate) {
        const dayName = DateUtils.getDayFromDate(selectedDate);
        
        debugLog(`Actualizando conteo para ${selectedDate} (${dayName})`);
        
        const groupsForDay = DataUtils.getGroupsByDay(window.AppState.grupos, dayName);
        const countElement = document.getElementById('groups-count');
        const continueBtn = document.getElementById('continue-btn');
        
        if (!countElement) {
            debugLog('ERROR: Elemento groups-count no encontrado');
            return;
        }
        
        if (groupsForDay.length > 0) {
            countElement.innerHTML = `
                <span class="text-green-600 font-medium">${groupsForDay.length} grupos programados</span>
            `;
            
            if (continueBtn) {
                continueBtn.disabled = false;
                continueBtn.classList.remove('opacity-50');
                continueBtn.innerHTML = `📋 Ver ${groupsForDay.length} Grupos de este Día`;
            }
        } else {
            // Mostrar nombre del día legible para el usuario
            const readableDayName = dayName === 'miercoles' ? 'miércoles' : 
                                   dayName === 'sabado' ? 'sábados' : 
                                   dayName + 's';
            
            countElement.innerHTML = `
                <span class="text-gray-500">No hay grupos programados para los ${readableDayName}</span>
            `;
            
            if (continueBtn) {
                continueBtn.disabled = true;
                continueBtn.classList.add('opacity-50');
                continueBtn.innerHTML = '❌ No hay grupos este día';
            }
        }
    },

    /**
     * Selecciona fecha rápida (hoy, ayer, mañana)
     */
    selectQuickDate(type) {
        const dateInput = document.getElementById('selected-date');
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
                return;
        }
        
        const dateString = targetDate.toISOString().split('T')[0];
        dateInput.value = dateString;
        this.updateDateSelection();
    },

    /**
     * Carga los grupos para la fecha seleccionada y muestra el dashboard
     */
    async loadGroupsForSelectedDate() {
        const dateInput = document.getElementById('selected-date');
        const selectedDate = dateInput.value;
        
        if (!selectedDate) {
            UIUtils.showError('Por favor selecciona una fecha');
            return;
        }
        
        try {
            UIUtils.showLoading('app', 'Cargando grupos...');
            
            // Guardar la fecha seleccionada en el estado global
            window.AppState.selectedDate = selectedDate;
            
            // Ir al dashboard con la fecha seleccionada
            AppController.showDashboard();
            
        } catch (error) {
            console.error('Error al cargar grupos:', error);
            UIUtils.showError('Error al cargar los grupos');
        }
    }
};

debugLog('date-selector.js cargado correctamente');
