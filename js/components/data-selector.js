/**
 * COMPONENTE SELECTOR DE FECHA
 * ============================
 * Genera HTML puro para el selector de fecha (sin lógica)
 */

const DateSelectorView = {
    /**
     * Renderiza la pantalla principal del selector de fecha
     */
    render(data = {}) {
        const {
            selectedDate = DateUtils.getCurrentDate(),
            currentDay = DateUtils.getCurrentDay(),
            groupsCount = 0,
            isToday = true
        } = data;

        return `
            <div class="container">
                <!-- Header -->
                <header class="bg-white rounded-lg p-6 shadow-sm mb-6">
                    <div class="text-center">
                        <h1 class="text-3xl font-bold text-gray-900 mb-2">Sistema de Asistencia Tenis</h1>
                        <p class="text-gray-600">Selecciona la fecha para reportar asistencias</p>
                    </div>
                </header>

                <!-- Selector de Fecha Principal -->
                ${this.renderDateSelector(selectedDate, currentDay, groupsCount)}

                <!-- Accesos Rápidos -->
                ${this.renderQuickAccess(currentDay)}
            </div>
        `;
    },

    /**
     * Renderiza el selector de fecha principal
     */
    renderDateSelector(selectedDate, currentDay, groupsCount) {
        const formattedDate = DateUtils.formatDate(selectedDate);

        return `
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
                            value="${selectedDate}"
                            class="w-full border border-gray-300 rounded-md px-4 py-3 text-lg"
                            onchange="DateController.onDateChange()"
                        />
                    </div>
                    
                    <!-- Información del día seleccionado -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-3">
                            Información del día:
                        </label>
                        <div id="date-info" class="bg-gray-50 rounded-md p-4">
                            <p class="font-semibold" id="selected-day-name">${capitalize(currentDay)}</p>
                            <p class="text-sm text-gray-600" id="selected-date-formatted">${formattedDate}</p>
                            <div class="mt-2" id="groups-count">
                                ${this.renderGroupsCount(groupsCount, currentDay)}
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Botón para continuar -->
                <div class="mt-6">
                    ${this.renderContinueButton(groupsCount)}
                </div>
            </div>
        `;
    },

    /**
     * Renderiza el contador de grupos
     */
    renderGroupsCount(count, dayName) {
        if (count > 0) {
            return `
                <p class="text-sm text-green-600 font-medium">
                    <span class="text-lg">✅</span> ${count} grupos programados
                </p>
            `;
        } else {
            const readableDayName = dayName === 'miercoles' ? 'miércoles' : 
                                   dayName === 'sabado' ? 'sábados' : 
                                   dayName + 's';
            return `
                <p class="text-sm text-gray-500">
                    <span class="text-lg">📅</span> No hay grupos programados para los ${readableDayName}
                </p>
            `;
        }
    },

    /**
     * Renderiza el botón de continuar
     */
    renderContinueButton(groupsCount) {
        const hasGroups = groupsCount > 0;
        
        return `
            <button 
                onclick="DateController.loadSelectedDate()" 
                class="btn btn-primary btn-lg w-full ${!hasGroups ? 'opacity-50' : ''}"
                id="continue-btn"
                ${!hasGroups ? 'disabled' : ''}
            >
                ${hasGroups 
                    ? `📋 Ver ${groupsCount} Grupos de este Día`
                    : '❌ No hay grupos este día'
                }
            </button>
        `;
    },

    /**
     * Renderiza los accesos rápidos a fechas
     */
    renderQuickAccess(currentDay) {
        return `
            <div class="bg-white rounded-lg p-6 shadow-sm">
                <h3 class="text-lg font-semibold mb-4">Accesos Rápidos</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    ${this.renderQuickButton('today', '📅', 'Hoy', capitalize(currentDay))}
                    ${this.renderQuickButton('yesterday', '⏮️', 'Ayer', '')}
                    ${this.renderQuickButton('tomorrow', '⏭️', 'Mañana', '')}
                    ${this.renderQuickButton('reports', '📊', 'Reportes', '', 'ReportsController.show()')}
                </div>
            </div>
        `;
    },

    /**
     * Renderiza un botón de acceso rápido
     */
    renderQuickButton(type, icon, title, subtitle, customAction = null) {
        const action = customAction || `DateController.selectQuickDate('${type}')`;
        
        return `
            <button onclick="${action}" class="btn btn-outline p-4 text-center">
                <div class="text-lg mb-1">${icon}</div>
                <div class="text-sm font-medium">${title}</div>
                ${subtitle ? `<div class="text-xs text-gray-500">${subtitle}</div>` : ''}
            </button>
        `;
    },

    /**
     * Actualiza solo la información del día seleccionado
     */
    updateDateInfo(data = {}) {
        const {
            selectedDate,
            dayName,
            groupsCount = 0
        } = data;

        const formattedDate = DateUtils.formatDate(selectedDate);

        // Actualizar elementos específicos
        const dayNameElement = document.getElementById('selected-day-name');
        const dateFormattedElement = document.getElementById('selected-date-formatted');
        const groupsCountElement = document.getElementById('groups-count');
        const continueBtn = document.getElementById('continue-btn');

        if (dayNameElement) {
            dayNameElement.textContent = capitalize(dayName);
        }

        if (dateFormattedElement) {
            dateFormattedElement.textContent = formattedDate;
        }

        if (groupsCountElement) {
            groupsCountElement.innerHTML = this.renderGroupsCount(groupsCount, dayName);
        }

        if (continueBtn) {
            const hasGroups = groupsCount > 0;
            continueBtn.disabled = !hasGroups;
            continueBtn.className = `btn btn-primary btn-lg w-full ${!hasGroups ? 'opacity-50' : ''}`;
            continueBtn.innerHTML = hasGroups 
                ? `📋 Ver ${groupsCount} Grupos de este Día`
                : '❌ No hay grupos este día';
        }
    },

    /**
     * Renderiza loading para el selector de fecha
     */
    renderLoading() {
        return `
            <div class="container">
                <div class="flex items-center justify-center min-h-screen">
                    <div class="text-center">
                        <div class="spinner spinner-lg mx-auto mb-4"></div>
                        <p class="text-gray-600 text-lg">Cargando sistema...</p>
                        <p class="text-gray-500 text-sm mt-2">Verificando grupos disponibles...</p>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza error en el selector de fecha
     */
    renderError(errorMessage) {
        return `
            <div class="container">
                <div class="min-h-screen flex items-center justify-center">
                    <div class="text-center max-w-md">
                        <span class="text-6xl mb-4 block">⚠️</span>
                        <h2 class="text-2xl font-bold text-gray-900 mb-4">Error al cargar</h2>
                        <p class="text-gray-600 mb-6">${errorMessage}</p>
                        <div class="space-y-3">
                            <button onclick="DateController.retry()" class="btn btn-primary w-full">
                                🔄 Reintentar
                            </button>
                            <button onclick="location.reload()" class="btn btn-outline w-full">
                                ↻ Recargar Página
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
};

// Hacer disponible globalmente
window.DateSelectorView = DateSelectorView;

debugLog('date-selector.js (component) cargado correctamente');
