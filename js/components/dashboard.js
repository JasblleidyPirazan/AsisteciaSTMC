/**
 * COMPONENTE DASHBOARD
 * ====================
 * Genera HTML puro para el dashboard principal (sin lógica)
 */

const DashboardView = {
    /**
     * Renderiza el dashboard completo
     */
    render(data = {}) {
        const {
            selectedDate = DateUtils.getCurrentDate(),
            dayGroups = [],
            stats = {},
            isToday = false
        } = data;

        const dayName = DateUtils.getDayFromDate(selectedDate);
        const formattedDate = DateUtils.formatDate(selectedDate);

        return `
            <div class="container">
                <!-- Header -->
                ${this.renderHeader(formattedDate, isToday)}

                <!-- Estadísticas rápidas -->
                ${this.renderStats(stats, dayName)}

                <!-- Grupos del día seleccionado -->
                ${this.renderGroupsSection(dayGroups, dayName, selectedDate, isToday)}

                <!-- Acciones rápidas -->
                ${this.renderQuickActions()}
            </div>
        `;
    },

    /**
     * Renderiza el header del dashboard
     */
    renderHeader(formattedDate, isToday) {
        return `
            <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 bg-white rounded-lg p-6 shadow-sm">
                <div>
                    <h1 class="text-3xl font-bold text-gray-900 mb-2">Dashboard de Asistencias</h1>
                    <p class="text-gray-600">${formattedDate}</p>
                    <div class="connection-status status-indicator ${window.AppState.connectionStatus} mt-2">
                        ${window.AppState.connectionStatus === 'online' ? 'En línea' : 'Sin conexión'}
                    </div>
                </div>
                <div class="flex gap-3 mt-4 sm:mt-0">
                    <button onclick="AppController.showDateSelector()" class="btn btn-outline">
                        📅 Cambiar Fecha
                    </button>
                    <button onclick="ReportsController.show()" class="btn btn-secondary">
                        📊 Reportes
                    </button>
                    <button onclick="AppController.refreshData()" class="btn btn-neutral">
                        🔄 Actualizar
                    </button>
                </div>
            </header>
        `;
    },

    /**
     * Renderiza las estadísticas del dashboard
     */
    renderStats(stats, dayName) {
        const {
            dayGroups = 0,
            totalStudents = 0,
            pendingSync = 0
        } = stats;

        return `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <!-- Grupos del día -->
                <div class="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
                    <div class="flex items-center">
                        <div class="p-3 bg-primary-100 rounded-lg">
                            <span class="text-2xl">📅</span>
                        </div>
                        <div class="ml-4">
                            <p class="text-sm text-gray-600">Grupos ${capitalize(dayName)}</p>
                            <p class="text-2xl font-bold text-gray-900" data-stat="day-groups">${dayGroups}</p>
                        </div>
                    </div>
                </div>
                
                <!-- Total estudiantes -->
                <div class="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
                    <div class="flex items-center">
                        <div class="p-3 bg-secondary-100 rounded-lg">
                            <span class="text-2xl">👥</span>
                        </div>
                        <div class="ml-4">
                            <p class="text-sm text-gray-600">Total Estudiantes</p>
                            <p class="text-2xl font-bold text-gray-900" data-stat="total-students">${totalStudents}</p>
                        </div>
                    </div>
                </div>
                
                <!-- Pendientes de sincronización -->
                <div class="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
                    <div class="flex items-center">
                        <div class="p-3 bg-accent-100 rounded-lg">
                            <span class="text-2xl">⏳</span>
                        </div>
                        <div class="ml-4">
                            <p class="text-sm text-gray-600">Pendientes Sync</p>
                            <p class="text-2xl font-bold text-gray-900" data-stat="pending-sync">${pendingSync}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza la sección de grupos
     */
    renderGroupsSection(groups, dayName, selectedDate, isToday) {
        const todayLabel = isToday ? ' (Hoy)' : '';
        
        return `
            <div class="mb-8">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900">
                        Grupos - ${capitalize(dayName)}${todayLabel}
                    </h2>
                    <div class="flex gap-3">
                        <button onclick="GroupController.showAll()" class="btn btn-outline">
                            📋 Todos los Grupos
                        </button>
                        <button onclick="AppController.refreshData()" class="btn btn-outline">
                            🔄 Actualizar
                        </button>
                    </div>
                </div>
                
                <div id="groups-container">
                    ${this.renderGroupsGrid(groups, dayName)}
                </div>
            </div>
        `;
    },

    /**
     * Renderiza la grilla de grupos
     */
    renderGroupsGrid(groups, dayName) {
        if (groups.length > 0) {
            return `
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${groups.map(group => this.renderGroupCard(group)).join('')}
                </div>
            `;
        } else {
            return this.renderEmptyGroupsState(dayName);
        }
    },

    /**
     * Renderiza una tarjeta de grupo individual MEJORADA
     */
    renderGroupCard(group) {
        const ballClass = this.getBallLevelClass(group.bola);
        
        return `
            <div class="group-card bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 cursor-pointer" 
                 onclick="GroupController.selectGroup('${group.codigo}')">
                
                <!-- Header con código y nivel -->
                <div class="bg-gradient-to-r from-primary-500 to-primary-600 p-4 text-white">
                    <div class="flex justify-between items-center">
                        <h3 class="text-lg font-bold">${group.codigo}</h3>
                        <div class="ball-level ${ballClass} bg-white bg-opacity-20 text-white border-white">
                            ${group.bola || 'Verde'}
                        </div>
                    </div>
                    <p class="text-primary-100 text-sm mt-1">${group.descriptor || 'Grupo sin nombre'}</p>
                </div>

                <!-- Contenido principal -->
                <div class="p-6">
                    <!-- Información principal -->
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div class="group-detail">
                            <div class="flex items-center text-gray-600 mb-1">
                                <span class="icon text-lg mr-2">👨‍🏫</span>
                                <span class="text-sm font-medium">Profesor</span>
                            </div>
                            <p class="text-gray-900 font-semibold">${group.profe || 'Sin profesor'}</p>
                        </div>
                        
                        <div class="group-detail">
                            <div class="flex items-center text-gray-600 mb-1">
                                <span class="icon text-lg mr-2">🕐</span>
                                <span class="text-sm font-medium">Horario</span>
                            </div>
                            <p class="text-gray-900 font-semibold">${group.hora || 'Sin horario'}</p>
                        </div>
                    </div>

                    <!-- Información secundaria -->
                    <div class="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                        <div class="group-detail">
                            <div class="flex items-center text-gray-600 mb-1">
                                <span class="icon text-lg mr-2">🎾</span>
                                <span class="text-sm font-medium">Cancha</span>
                            </div>
                            <p class="text-gray-900 font-semibold">Cancha ${group.cancha || 'N/A'}</p>
                        </div>
                        
                        <div class="group-detail">
                            <div class="flex items-center text-gray-600 mb-1">
                                <span class="icon text-lg mr-2">📅</span>
                                <span class="text-sm font-medium">Frecuencia</span>
                            </div>
                            <p class="text-gray-900 font-semibold">${group.frecuencia_semanal || 0} clases/sem</p>
                        </div>
                    </div>

                    <!-- Call to action -->
                    <div class="mt-6 pt-4 border-t border-gray-100">
                        <div class="flex items-center justify-center text-primary-600 font-semibold">
                            <span class="mr-2">👆</span>
                            <span>Tomar Asistencia</span>
                        </div>
                    </div>
                </div>

                <!-- Indicador de hover -->
                <div class="absolute inset-0 bg-primary-500 bg-opacity-0 hover:bg-opacity-5 transition-all duration-300 rounded-xl pointer-events-none"></div>
            </div>
        `;
    },

    /**
     * Renderiza el estado vacío cuando no hay grupos
     */
    renderEmptyGroupsState(dayName) {
        const readableDayName = dayName === 'miercoles' ? 'miércoles' : 
                               dayName === 'sabado' ? 'sábados' : 
                               dayName + 's';

        return `
            <div class="text-center py-16 bg-white rounded-lg shadow-sm">
                <span class="text-8xl mb-6 block">📅</span>
                <h3 class="text-2xl font-semibold text-gray-700 mb-3">No hay clases programadas</h3>
                <p class="text-gray-500 mb-6 text-lg">Los ${readableDayName} no hay grupos programados</p>
                <div class="space-y-3">
                    <button onclick="AppController.showDateSelector()" class="btn btn-primary btn-lg">
                        📅 Seleccionar Otra Fecha
                    </button>
                    <button onclick="RepositionController.create()" class="btn btn-secondary">
                        ➕ Crear Clase de Reposición
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza las acciones rápidas
     */
    renderQuickActions() {
        return `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <!-- Ver todos los grupos -->
                <button onclick="GroupController.showAll()" class="btn btn-outline p-6 h-auto flex-col text-center hover:shadow-md transition-shadow">
                    <span class="text-4xl mb-3 block">🗓️</span>
                    <span class="font-semibold text-lg">Todos los Grupos</span>
                    <span class="text-sm opacity-75 mt-1">Ver todos los horarios</span>
                </button>
                
                <!-- Reportes -->
                <button onclick="ReportsController.show()" class="btn btn-secondary p-6 h-auto flex-col text-center hover:shadow-md transition-shadow">
                    <span class="text-4xl mb-3 block">📊</span>
                    <span class="font-semibold text-lg">Reportes</span>
                    <span class="text-sm opacity-75 mt-1">Ver estadísticas</span>
                </button>
                
                <!-- Crear reposición -->
                <button onclick="RepositionController.create()" class="btn btn-primary p-6 h-auto flex-col text-center hover:shadow-md transition-shadow">
                    <span class="text-4xl mb-3 block">➕</span>
                    <span class="font-semibold text-lg">Crear Reposición</span>
                    <span class="text-sm opacity-75 mt-1">Clase especial</span>
                </button>
                
                <!-- Pendientes de sincronización -->
                <button onclick="SyncController.showPending()" class="btn btn-neutral p-6 h-auto flex-col text-center hover:shadow-md transition-shadow">
                    <span class="text-4xl mb-3 block">⏳</span>
                    <span class="font-semibold text-lg">Pendientes</span>
                    <span class="text-sm opacity-75 mt-1">Datos por sincronizar</span>
                </button>
            </div>
        `;
    },

    /**
     * Actualiza solo la sección de grupos sin recargar todo
     */
    updateGroupsSection(groups, dayName, isToday = false) {
        const container = document.getElementById('groups-container');
        if (container) {
            container.innerHTML = this.renderGroupsGrid(groups, dayName);
        }

        // Actualizar título de la sección
        const sectionTitle = document.querySelector('h2');
        if (sectionTitle) {
            const todayLabel = isToday ? ' (Hoy)' : '';
            sectionTitle.textContent = `Grupos - ${capitalize(dayName)}${todayLabel}`;
        }
    },

    /**
     * Actualiza las estadísticas
     */
    updateStats(stats) {
        const elements = {
            dayGroups: document.querySelector('[data-stat="day-groups"]'),
            totalStudents: document.querySelector('[data-stat="total-students"]'),
            pendingSync: document.querySelector('[data-stat="pending-sync"]')
        };

        if (elements.dayGroups) elements.dayGroups.textContent = stats.dayGroups || 0;
        if (elements.totalStudents) elements.totalStudents.textContent = stats.totalStudents || 0;
        if (elements.pendingSync) elements.pendingSync.textContent = stats.pendingSync || 0;
    },

    /**
     * Renderiza loading para el dashboard
     */
    renderLoading(message = 'Cargando dashboard...') {
        return `
            <div class="container">
                <div class="flex items-center justify-center min-h-screen">
                    <div class="text-center">
                        <div class="spinner spinner-lg mx-auto mb-4"></div>
                        <p class="text-gray-600 text-lg">${message}</p>
                        <p class="text-gray-500 text-sm mt-2">Cargando grupos y estadísticas...</p>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza error en el dashboard
     */
    renderError(errorMessage) {
        return `
            <div class="container">
                <div class="min-h-screen flex items-center justify-center">
                    <div class="text-center max-w-md">
                        <span class="text-6xl mb-4 block">❌</span>
                        <h2 class="text-2xl font-bold text-gray-900 mb-4">Error en el Dashboard</h2>
                        <p class="text-gray-600 mb-6">${errorMessage}</p>
                        <div class="space-y-3">
                            <button onclick="AppController.refreshData()" class="btn btn-primary w-full">
                                🔄 Reintentar
                            </button>
                            <button onclick="AppController.showDateSelector()" class="btn btn-outline w-full">
                                📅 Cambiar Fecha
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // ===========================================
    // MÉTODOS AUXILIARES
    // ===========================================

    /**
     * Obtiene la clase CSS para el nivel de bola
     */
    getBallLevelClass(ballLevel) {
        const levelMap = {
            'verde': 'ball-verde',
            'amarilla': 'ball-amarilla',
            'naranja': 'ball-naranja',
            'roja': 'ball-roja'
        };
        
        return levelMap[ballLevel?.toLowerCase()] || 'ball-verde';
    }
};

// Hacer disponible globalmente
window.DashboardView = DashboardView;

debugLog('dashboard.js (component) cargado correctamente');
