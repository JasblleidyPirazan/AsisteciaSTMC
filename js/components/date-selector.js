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
                            min="2024-01-01"
                            max="2025-12-31"
                            class="w-full border border-gray-300 rounded-md px-4 py-3 text-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            onchange="DateController.onDateChange()"
                        />
                        <p class="text-xs text-gray-500 mt-2">Formato: DD/MM/AAAA</p>
                    </div>
                    
                    <!-- Información del día seleccionado -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-3">
                            Información del día:
                        </label>
                        <div id="date-info" class="bg-gray-50 rounded-md p-4 border border-gray-200">
                            <p class="font-semibold text-lg" id="selected-day-name">${capitalize(currentDay)}</p>
                            <p class="text-sm text-gray-600" id="selected-date-formatted">${formattedDate}</p>
                            <div class="mt-3" id="groups-count">
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
                <div class="flex items-center text-green-600">
                    <span class="text-xl mr-2">✅</span>
                    <div>
                        <p class="font-medium">${count} grupos programados</p>
                        <p class="text-sm text-green-500">¡Perfecto para tomar asistencias!</p>
                    </div>
                </div>
            `;
        } else {
            const readableDayName = dayName === 'miercoles' ? 'miércoles' : 
                                   dayName === 'sabado' ? 'sábados' : 
                                   dayName + 's';
            return `
                <div class="flex items-center text-gray-500">
                    <span class="text-xl mr-2">📅</span>
                    <div>
                        <p class="font-medium">No hay grupos programados</p>
                        <p class="text-sm">Los ${readableDayName} no tienen clases</p>
                    </div>
                </div>
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
                class="btn btn-primary btn-lg w-full transition-all duration-300 ${!hasGroups ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-600 hover:shadow-lg'}"
                id="continue-btn"
                ${!hasGroups ? 'disabled' : ''}
            >
                ${hasGroups 
                    ? `<span class="flex items-center justify-center">
                         <span class="text-2xl mr-3">📋</span>
                         <div class="text-left">
                             <div class="font-bold">Ver ${groupsCount} Grupos</div>
                             <div class="text-sm opacity-90">Continuar al dashboard</div>
                         </div>
                       </span>`
                    : `<span class="flex items-center justify-center">
                         <span class="text-2xl mr-3">❌</span>
                         <span>No hay grupos este día</span>
                       </span>`
                }
            </button>
        `;
    },

    /**
     * Renderiza los accesos rápidos a fechas MEJORADOS
     */
    renderQuickAccess(currentDay) {
        return `
            <div class="bg-white rounded-lg p-6 shadow-sm">
                <h3 class="text-lg font-semibold mb-4">Navegación Rápida</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    ${this.renderQuickButton('today', '📅', 'Hoy', capitalize(currentDay), 'btn-primary')}
                    ${this.renderQuickButton('yesterday', '⏮️', 'Ayer', this._getRelativeDayName(-1), 'btn-outline')}
                    ${this.renderQuickButton('tomorrow', '⏭️', 'Mañana', this._getRelativeDayName(1), 'btn-outline')}
                    ${this.renderCustomButton('reports', '📊', 'Reportes', 'Ver estadísticas', 'ReportsController.show()', 'btn-secondary')}
                </div>
                
                <!-- Navegación por semana -->
                <div class="mt-6 pt-6 border-t border-gray-200">
                    <h4 class="text-md font-medium text-gray-700 mb-3">Navegación por Semana</h4>
                    <div class="flex gap-2 overflow-x-auto">
                        ${this._renderWeekNavigation()}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza un botón de acceso rápido mejorado
     */
    renderQuickButton(type, icon, title, subtitle, buttonClass = 'btn-outline') {
        return `
            <button onclick="DateController.selectQuickDate('${type}')" 
                    class="btn ${buttonClass} p-4 text-center h-auto hover:shadow-md transition-all duration-300">
                <div class="text-2xl mb-2">${icon}</div>
                <div class="text-sm font-medium">${title}</div>
                ${subtitle ? `<div class="text-xs text-gray-500 mt-1">${subtitle}</div>` : ''}
            </button>
        `;
    },

    /**
     * Renderiza un botón personalizado
     */
    renderCustomButton(type, icon, title, subtitle, action, buttonClass = 'btn-outline') {
        return `
            <button onclick="${action}" 
                    class="btn ${buttonClass} p-4 text-center h-auto hover:shadow-md transition-all duration-300">
                <div class="text-2xl mb-2">${icon}</div>
                <div class="text-sm font-medium">${title}</div>
                ${subtitle ? `<div class="text-xs text-gray-500 mt-1">${subtitle}</div>` : ''}
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
            continueBtn.className = `btn btn-primary btn-lg w-full transition-all duration-300 ${!hasGroups ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-600 hover:shadow-lg'}`;
            
            continueBtn.innerHTML = hasGroups 
                ? `<span class="flex items-center justify-center">
                     <span class="text-2xl mr-3">📋</span>
                     <div class="text-left">
                         <div class="font-bold">Ver ${groupsCount} Grupos</div>
                         <div class="text-sm opacity-90">Continuar al dashboard</div>
                     </div>
                   </span>`
                : `<span class="flex items-center justify-center">
                     <span class="text-2xl mr-3">❌</span>
                     <span>No hay grupos este día</span>
                   </span>`;
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
    },

    // ===========================================
    // MÉTODOS AUXILIARES PRIVADOS
    // ===========================================

    /**
     * Obtiene el nombre del día relativo
     */
    _getRelativeDayName(offset) {
        const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const today = new Date();
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + offset);
        const dayName = days[targetDate.getDay()];
        return capitalize(dayName);
    },

    /**
     * Renderiza navegación por semana
     */
    _renderWeekNavigation() {
        const days = [
            { key: 'lunes', name: 'Lun', icon: '📅' },
            { key: 'martes', name: 'Mar', icon: '📅' },
            { key: 'miercoles', name: 'Mié', icon: '📅' },
            { key: 'jueves', name: 'Jue', icon: '📅' },
            { key: 'viernes', name: 'Vie', icon: '📅' },
            { key: 'sabado', name: 'Sáb', icon: '📅' },
            { key: 'domingo', name: 'Dom', icon: '📅' }
        ];

        return days.map(day => `
            <button onclick="DateController.selectDayOfWeek('${day.key}')" 
                    class="btn btn-outline btn-sm px-3 py-2 flex-shrink-0 hover:bg-primary-50 transition-colors">
                <span class="text-sm mr-1">${day.icon}</span>
                <span class="text-xs font-medium">${day.name}</span>
            </button>
        `).join('');
    }
};

// Hacer disponible globalmente
window.DateSelectorView = DateSelectorView;

debugLog('date-selector.js (component) cargado correctamente');
