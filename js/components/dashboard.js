
/**
 * COMPONENTE DASHBOARD
 * ===================
 * Genera el HTML y maneja la lógica del dashboard principal
 */

const DashboardComponent = {
    /**
     * Renderiza el dashboard principal
     */
    render(data = {}) {
        const {
            selectedDate = DateUtils.getCurrentDate(),
            dayGroups = [],
            totalStudents = 0,
            pendingSync = 0
        } = data;

        const selectedDay = DateUtils.getDayFromDate(selectedDate);
        const formattedDate = DateUtils.formatDate(selectedDate);
        const isToday = selectedDate === DateUtils.getCurrentDate();

        return `
            <div class="container">
                <!-- Header -->
                <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 bg-white rounded-lg p-6 shadow-sm">
                    <div>
                        <h1 class="text-3xl font-bold text-gray-900 mb-2">Dashboard de Asistencias</h1>
                        <p class="text-gray-600">${formattedDate}</p>
                        <div class="connection-status status-indicator ${window.AppState.connectionStatus} mt-2">
                            ${window.AppState.connectionStatus === 'online' ? 'En línea' : 'Sin conexión'}
                        </div>
                    </div>
                    <div class="flex gap-3 mt-4 sm:mt-0">
                        <button onclick="DateSelectorComponent.show()" class="btn btn-outline">
                            📅 Cambiar Fecha
                        </button>
                        <button onclick="ReportsComponent.show()" class="btn btn-secondary">
                            📊 Reportes
                        </button>
                    </div>
                </header>

                <!-- Estadísticas rápidas -->
                ${this.renderStats({ dayGroups: dayGroups.length, totalStudents, pendingSync, selectedDay })}

                <!-- Grupos del día seleccionado -->
                <div class="mb-8">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold text-gray-900">
                            Grupos - ${capitalize(selectedDay)} ${isToday ? '(Hoy)' : ''}
                        </h2>
                        <button onclick="AppController.refreshData()" class="btn btn-outline">
                            🔄 Actualizar
                        </button>
                    </div>
                    
                    <div id="groups-container">
                        ${this.renderGroupsSection(dayGroups, selectedDay)}
                    </div>
                </div>

                <!-- Acciones rápidas -->
                ${this.renderQuickActions()}
            </div>
        `;
    },

    /**
     * Renderiza las estadísticas del dashboard
     */
    renderStats(stats) {
        return `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
                    <div class="flex items-center">
                        <div class="p-3 bg-primary-100 rounded-lg">
                            <span class="text-2xl">📅</span>
                        </div>
                        <div class="ml-4">
                            <p class="text-sm text-gray-600">Grupos ${capitalize(stats.selectedDay)}</p>
                            <p class="text-2xl font-bold text-gray-900">${stats.dayGroups}</p>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
                    <div class="flex items-center">
                        <div class="p-3 bg-secondary-100 rounded-lg">
                            <span class="text-2xl">👥</span>
                        </div>
                        <div class="ml-4">
                            <p class="text-sm text-gray-600">Total Estudiantes</p>
                            <p class="text-2xl font-bold text-gray-900">${stats.totalStudents}</p>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
                    <div class="flex items-center">
                        <div class="p-3 bg-accent-100 rounded-lg">
                            <span class="text-2xl">⏳</span>
                        </div>
                        <div class="ml-4">
                            <p class="text-sm text-gray-600">Pendientes Sync</p>
                            <p class="text-2xl font-bold text-gray-900">${stats.pendingSync}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza la sección de grupos
     */
    renderGroupsSection(groups, selectedDay) {
        if (groups.length > 0) {
            return `
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${groups.map(group => UIUtils.createGroupCard(group)).join('')}
                </div>
            `;
        } else {
            return `
                <div class="text-center py-12 bg-white rounded-lg shadow-sm">
                    <span class="text-6xl mb-4 block">📅</span>
                    <h3 class="text-xl font-semibold text-gray-700 mb-2">No hay clases programadas</h3>
                    <p class="text-gray-500 mb-4">Los ${selectedDay} no hay grupos programados</p>
                    <button onclick="DateSelectorComponent.show()" class="btn btn-primary">
                        📅 Seleccionar Otra Fecha
                    </button>
                </div>
            `;
        }
    },

    /**
     * Renderiza las acciones rápidas
     */
    renderQuickActions() {
        return `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <button onclick="GroupsComponent.showAll()" class="btn btn-outline p-6 h-auto flex-col text-center">
                    <span class="text-3xl mb-2 block">🗓️</span>
                    <span class="font-semibold">Todos los Grupos</span>
                    <span class="text-sm opacity-75">Ver todos los horarios</span>
                </button>
                
                <button onclick="ReportsComponent.show()" class="btn btn-secondary p-6 h-auto flex-col text-center">
                    <span class="text-3xl mb-2 block">📊</span>
                    <span class="font-semibold">Reportes</span>
                    <span class="text-sm opacity-75">Ver estadísticas</span>
                </button>
                
                <button onclick="RepositionComponent.show()" class="btn btn-primary p-6 h-auto flex-col text-center">
                    <span class="text-3xl mb-2 block">➕</span>
                    <span class="font-semibold">Crear Reposición</span>
                    <span class="text-sm opacity-75">Clase especial</span>
                </button>
                
                <button onclick="SyncController.showPending()" class="btn btn-neutral p-6 h-auto flex-col text-center">
                    <span class="text-3xl mb-2 block">⏳</span>
                    <span class="font-semibold">Pendientes</span>
                    <span class="text-sm opacity-75">Datos por sincronizar</span>
                </button>
            </div>
        `;
    },

    /**
     * Actualiza solo la sección de grupos sin recargar todo
     */
    updateGroupsSection(groups, selectedDay) {
        const container = document.getElementById('groups-container');
        if (container) {
            container.innerHTML = this.renderGroupsSection(groups, selectedDay);
        }
    },

    /**
     * Actualiza las estadísticas
     */
    updateStats(stats) {
        // Actualizar contadores individuales si existen
        const elements = {
            dayGroups: document.querySelector('[data-stat="day-groups"]'),
            totalStudents: document.querySelector('[data-stat="total-students"]'),
            pendingSync: document.querySelector('[data-stat="pending-sync"]')
        };

        if (elements.dayGroups) elements.dayGroups.textContent = stats.dayGroups || 0;
        if (elements.totalStudents) elements.totalStudents.textContent = stats.totalStudents || 0;
        if (elements.pendingSync) elements.pendingSync.textContent = stats.pendingSync || 0;
    }
};

debugLog('dashboard.js cargado correctamente');
