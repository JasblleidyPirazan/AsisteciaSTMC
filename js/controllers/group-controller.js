/**
 * CONTROLADOR DE GRUPOS
 * =====================
 * Maneja la lógica relacionada con grupos (navegación, selección, información)
 */

const GroupController = {
    // Estado interno del controlador
    _state: {
        allGroups: [],
        filteredGroups: [],
        currentFilters: {},
        isLoading: false
    },

    /**
     * Selecciona un grupo y navega al flujo de asistencia
     */
    async selectGroup(groupCode) {
        debugLog(`GroupController: Seleccionando grupo ${groupCode}`);
        
        try {
            // Validar que el grupo existe
            const group = await GroupService.getGroupByCode(groupCode);
            
            if (!group.activo) {
                UIUtils.showWarning('Este grupo no está activo');
                return;
            }
            
            // Navegar al controlador de asistencia
            await AttendanceController.selectGroup(groupCode);
            
        } catch (error) {
            console.error(`GroupController: Error al seleccionar grupo ${groupCode}:`, error);
            UIUtils.showError('Error al seleccionar el grupo');
        }
    },

    /**
     * Muestra todos los grupos disponibles
     */
    async showAll() {
        debugLog('GroupController: Mostrando todos los grupos');
        
        try {
            this._setState({ isLoading: true });
            
            UIUtils.showLoading('app', 'Cargando todos los grupos...');
            
            // Cargar todos los grupos
            const allGroups = await GroupService.getAllGroups();
            this._setState({ allGroups, filteredGroups: allGroups });
            
            // Renderizar vista de todos los grupos
            await this._renderAllGroupsView(allGroups);
            
        } catch (error) {
            console.error('GroupController: Error mostrando todos los grupos:', error);
            UIUtils.showError('Error al cargar los grupos');
            AppController.showDashboard();
        } finally {
            this._setState({ isLoading: false });
        }
    },

    /**
     * Filtra grupos por criterios específicos
     */
    async filterGroups(filters = {}) {
        debugLog('GroupController: Filtrando grupos', filters);
        
        try {
            const allGroups = this._state.allGroups;
            let filteredGroups = [...allGroups];
            
            // Aplicar filtros
            if (filters.day) {
                filteredGroups = filteredGroups.filter(group => 
                    GroupService._isGroupActiveOnDay(group, filters.day)
                );
            }
            
            if (filters.professor) {
                filteredGroups = filteredGroups.filter(group => 
                    group.profe.toLowerCase().includes(filters.professor.toLowerCase())
                );
            }
            
            if (filters.level) {
                filteredGroups = filteredGroups.filter(group => 
                    group.bola.toLowerCase() === filters.level.toLowerCase()
                );
            }
            
            if (filters.search) {
                const searchTerm = filters.search.toLowerCase();
                filteredGroups = filteredGroups.filter(group => 
                    group.codigo.toLowerCase().includes(searchTerm) ||
                    group.descriptor.toLowerCase().includes(searchTerm) ||
                    group.profe.toLowerCase().includes(searchTerm)
                );
            }
            
            this._setState({ filteredGroups, currentFilters: filters });
            
            // Actualizar vista
            this._updateGroupsDisplay(filteredGroups);
            
        } catch (error) {
            console.error('GroupController: Error filtrando grupos:', error);
            UIUtils.showError('Error al filtrar grupos');
        }
    },

    /**
     * Obtiene información detallada de un grupo
     */
    async getGroupDetails(groupCode) {
        debugLog(`GroupController: Obteniendo detalles del grupo ${groupCode}`);
        
        try {
            // Información del grupo
            const group = await GroupService.getGroupByCode(groupCode);
            
            // Estudiantes del grupo
            const students = await StudentService.getStudentsByGroup(groupCode);
            
            // Estadísticas básicas (aquí podrías agregar más datos como asistencias históricas)
            const details = {
                group,
                students,
                stats: {
                    totalStudents: students.length,
                    activeStudents: students.filter(s => s.activo).length
                }
            };
            
            return details;
            
        } catch (error) {
            console.error(`GroupController: Error obteniendo detalles del grupo ${groupCode}:`, error);
            throw error;
        }
    },

    /**
     * Muestra estadísticas de grupos
     */
    async showGroupStats() {
        debugLog('GroupController: Mostrando estadísticas de grupos');
        
        try {
            UIUtils.showLoading('app', 'Calculando estadísticas...');
            
            const stats = await GroupService.getGroupStats();
            
            // Aquí podrías renderizar una vista de estadísticas
            // Por ahora, mostrar en modal
            const statsContent = this._generateStatsContent(stats);
            ModalsController.showPreview(statsContent);
            
        } catch (error) {
            console.error('GroupController: Error mostrando estadísticas:', error);
            UIUtils.showError('Error al calcular estadísticas');
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
        debugLog('GroupController: Estado actualizado:', this._state);
    },

    /**
     * Renderiza la vista de todos los grupos
     */
    async _renderAllGroupsView(groups) {
        debugLog(`GroupController: Renderizando vista de ${groups.length} grupos`);
        
        const html = `
            <div class="container">
                <!-- Header -->
                <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 bg-white rounded-lg p-6 shadow-sm">
                    <div class="flex items-center">
                        <button onclick="AppController.showDashboard()" class="btn btn-neutral mr-4">
                            ← Volver al Dashboard
                        </button>
                        <div>
                            <h1 class="text-2xl font-bold text-gray-900">Todos los Grupos</h1>
                            <p class="text-gray-600">${groups.length} grupos disponibles</p>
                        </div>
                    </div>
                    <div class="flex gap-3 mt-4 sm:mt-0">
                        <button onclick="GroupController.showGroupStats()" class="btn btn-secondary">
                            📊 Estadísticas
                        </button>
                        <button onclick="GroupService.refresh().then(() => GroupController.showAll())" class="btn btn-outline">
                            🔄 Actualizar
                        </button>
                    </div>
                </header>

                <!-- Filtros -->
                ${this._renderFilters()}

                <!-- Lista de grupos -->
                ${this._renderGroupsList(groups)}
            </div>
        `;
        
        document.getElementById('app').innerHTML = html;
    },

    /**
     * Renderiza los filtros de grupos
     */
    _renderFilters() {
        const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
        const levels = ['Verde', 'Amarilla', 'Naranja', 'Roja'];
        
        return `
            <div class="bg-white rounded-lg p-6 mb-6 shadow-sm">
                <h3 class="text-lg font-semibold mb-4">Filtros</h3>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <!-- Búsqueda -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Buscar:</label>
                        <input 
                            type="text" 
                            id="search-filter"
                            placeholder="Código, profesor, descripción..."
                            class="w-full border border-gray-300 rounded-md px-3 py-2"
                            onkeyup="GroupController._applyFilters()"
                        />
                    </div>
                    
                    <!-- Día -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Día:</label>
                        <select id="day-filter" class="w-full border border-gray-300 rounded-md px-3 py-2" onchange="GroupController._applyFilters()">
                            <option value="">Todos los días</option>
                            ${days.map(day => `<option value="${day}">${capitalize(day)}</option>`).join('')}
                        </select>
                    </div>
                    
                    <!-- Nivel -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Nivel:</label>
                        <select id="level-filter" class="w-full border border-gray-300 rounded-md px-3 py-2" onchange="GroupController._applyFilters()">
                            <option value="">Todos los niveles</option>
                            ${levels.map(level => `<option value="${level}">${level}</option>`).join('')}
                        </select>
                    </div>
                    
                    <!-- Profesor -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Profesor:</label>
                        <input 
                            type="text" 
                            id="professor-filter"
                            placeholder="Nombre del profesor..."
                            class="w-full border border-gray-300 rounded-md px-3 py-2"
                            onkeyup="GroupController._applyFilters()"
                        />
                    </div>
                </div>
                
                <div class="mt-4 flex justify-between items-center">
                    <div class="text-sm text-gray-600" id="filter-results">
                        ${groups.length} grupos mostrados
                    </div>
                    <button onclick="GroupController._clearFilters()" class="btn btn-outline btn-sm">
                        🗑️ Limpiar Filtros
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Renderiza la lista completa de grupos
     */
    _renderGroupsList(groups) {
        if (groups.length === 0) {
            return `
                <div class="text-center py-12 bg-white rounded-lg shadow-sm">
                    <span class="text-6xl mb-4 block">🔍</span>
                    <h3 class="text-xl font-semibold text-gray-700 mb-2">No se encontraron grupos</h3>
                    <p class="text-gray-500">Intenta ajustar los filtros de búsqueda</p>
                </div>
            `;
        }
        
        // Agrupar por día para mejor organización
        const groupsByDay = this._groupByDay(groups);
        
        return `
            <div id="groups-list">
                ${Object.entries(groupsByDay).map(([day, dayGroups]) => `
                    <div class="mb-8">
                        <h3 class="text-lg font-semibold mb-4 text-gray-800">
                            ${capitalize(day)} (${dayGroups.length} grupos)
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            ${dayGroups.map(group => this._renderGroupCard(group)).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Renderiza una tarjeta de grupo con información detallada
     */
    _renderGroupCard(group) {
        const ballClass = this._getBallLevelClass(group.bola);
        
        return `
            <div class="group-card border border-gray-200 hover:border-primary-300 transition-colors" 
                 onclick="GroupController.selectGroup('${group.codigo}')">
                <div class="group-info">
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="font-bold text-gray-900">${group.codigo}</h4>
                        <div class="ball-level ${ballClass} text-xs">${group.bola}</div>
                    </div>
                    <p class="text-sm text-gray-600 mb-3">${group.descriptor}</p>
                </div>
                
                <div class="group-details space-y-2">
                    <div class="group-detail">
                        <span class="icon">👨‍🏫</span>
                        <span>Prof. ${group.profe}</span>
                    </div>
                    <div class="group-detail">
                        <span class="icon">🕐</span>
                        <span>${group.hora}</span>
                    </div>
                    <div class="group-detail">
                        <span class="icon">🎾</span>
                        <span>Cancha ${group.cancha}</span>
                    </div>
                    <div class="group-detail">
                        <span class="icon">📅</span>
                        <span>${group.frecuencia_semanal} clases/semana</span>
                    </div>
                </div>
                
                <!-- Estado del grupo -->
                <div class="mt-3 pt-3 border-t border-gray-200">
                    <div class="flex justify-between items-center text-xs">
                        <span class="text-gray-500">Estado:</span>
                        <span class="px-2 py-1 rounded ${group.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                            ${group.activo ? 'Activo' : 'Inactivo'}
                        </span>
                    </div>
                </div>
                
                <!-- Overlay de acción -->
                <div class="absolute inset-0 bg-primary-500 bg-opacity-0 hover:bg-opacity-10 transition-all duration-200 rounded-lg flex items-center justify-center">
                    <span class="text-primary-700 font-semibold opacity-0 hover:opacity-100 transition-opacity">
                        👆 Tomar Asistencia
                    </span>
                </div>
            </div>
        `;
    },

    /**
     * Aplica los filtros actuales
     */
    _applyFilters() {
        const filters = {
            search: document.getElementById('search-filter')?.value || '',
            day: document.getElementById('day-filter')?.value || '',
            level: document.getElementById('level-filter')?.value || '',
            professor: document.getElementById('professor-filter')?.value || ''
        };
        
        this.filterGroups(filters);
    },

    /**
     * Limpia todos los filtros
     */
    _clearFilters() {
        document.getElementById('search-filter').value = '';
        document.getElementById('day-filter').value = '';
        document.getElementById('level-filter').value = '';
        document.getElementById('professor-filter').value = '';
        
        this.filterGroups({});
    },

    /**
     * Actualiza la visualización de grupos filtrados
     */
    _updateGroupsDisplay(filteredGroups) {
        const groupsList = document.getElementById('groups-list');
        const filterResults = document.getElementById('filter-results');
        
        if (groupsList) {
            const groupsByDay = this._groupByDay(filteredGroups);
            
            if (filteredGroups.length === 0) {
                groupsList.innerHTML = `
                    <div class="text-center py-12 bg-white rounded-lg shadow-sm">
                        <span class="text-6xl mb-4 block">🔍</span>
                        <h3 class="text-xl font-semibold text-gray-700 mb-2">No se encontraron grupos</h3>
                        <p class="text-gray-500">Intenta ajustar los filtros de búsqueda</p>
                    </div>
                `;
            } else {
                groupsList.innerHTML = Object.entries(groupsByDay).map(([day, dayGroups]) => `
                    <div class="mb-8">
                        <h3 class="text-lg font-semibold mb-4 text-gray-800">
                            ${capitalize(day)} (${dayGroups.length} grupos)
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            ${dayGroups.map(group => this._renderGroupCard(group)).join('')}
                        </div>
                    </div>
                `).join('');
            }
        }
        
        if (filterResults) {
            filterResults.textContent = `${filteredGroups.length} grupos mostrados`;
        }
    },

    /**
     * Agrupa los grupos por día de la semana
     */
    _groupByDay(groups) {
        const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
        const groupsByDay = {};
        
        // Inicializar días
        days.forEach(day => {
            groupsByDay[day] = [];
        });
        
        // Clasificar grupos por días
        groups.forEach(group => {
            days.forEach(day => {
                if (group[day] === true) {
                    groupsByDay[day].push(group);
                }
            });
        });
        
        // Remover días sin grupos
        Object.keys(groupsByDay).forEach(day => {
            if (groupsByDay[day].length === 0) {
                delete groupsByDay[day];
            }
        });
        
        return groupsByDay;
    },

    /**
     * Obtiene la clase CSS para el nivel de bola
     */
    _getBallLevelClass(ballLevel) {
        const levelMap = {
            'verde': 'ball-verde',
            'amarilla': 'ball-amarilla',
            'naranja': 'ball-naranja',
            'roja': 'ball-roja'
        };
        
        return levelMap[ballLevel?.toLowerCase()] || 'ball-verde';
    },

    /**
     * Genera contenido de estadísticas para modal
     */
    _generateStatsContent(stats) {
        return `
            <div>
                <h4 class="font-bold text-lg mb-4">Estadísticas de Grupos</h4>
                
                <!-- Resumen general -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div class="text-center p-4 bg-blue-50 rounded">
                        <div class="text-2xl font-bold text-blue-600">${stats.total}</div>
                        <div class="text-sm text-blue-600">Total Grupos</div>
                    </div>
                    <div class="text-center p-4 bg-green-50 rounded">
                        <div class="text-2xl font-bold text-green-600">${stats.active}</div>
                        <div class="text-sm text-green-600">Activos</div>
                    </div>
                    <div class="text-center p-4 bg-gray-50 rounded">
                        <div class="text-2xl font-bold text-gray-600">${stats.total - stats.active}</div>
                        <div class="text-sm text-gray-600">Inactivos</div>
                    </div>
                    <div class="text-center p-4 bg-yellow-50 rounded">
                        <div class="text-2xl font-bold text-yellow-600">${Math.round((stats.active / stats.total) * 100)}%</div>
                        <div class="text-sm text-yellow-600">% Activos</div>
                    </div>
                </div>

                <!-- Por nivel de bola -->
                <div class="mb-6">
                    <h5 class="font-semibold mb-3">Distribución por Nivel:</h5>
                    <div class="space-y-2">
                        ${Object.entries(stats.byLevel).map(([level, count]) => `
                            <div class="flex items-center justify-between">
                                <span class="flex items-center">
                                    <span class="ball-level ball-${level.toLowerCase()} mr-2">${level}</span>
                                </span>
                                <div class="flex items-center flex-1 mx-4">
                                    <div class="flex-1 bg-gray-200 rounded h-4 overflow-hidden">
                                        <div class="bg-primary-500 h-full transition-all duration-300" 
                                             style="width: ${stats.total > 0 ? (count / stats.total) * 100 : 0}%"></div>
                                    </div>
                                    <span class="ml-2 text-sm font-medium">${count}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Por día de la semana -->
                <div class="mb-6">
                    <h5 class="font-semibold mb-3">Distribución por Día:</h5>
                    <div class="space-y-2">
                        ${Object.entries(stats.byDay).map(([day, count]) => `
                            <div class="flex items-center justify-between">
                                <span class="capitalize font-medium">${day === 'miercoles' ? 'miércoles' : day === 'sabado' ? 'sábado' : day}</span>
                                <div class="flex items-center flex-1 mx-4">
                                    <div class="flex-1 bg-gray-200 rounded h-4 overflow-hidden">
                                        <div class="bg-secondary-500 h-full transition-all duration-300" 
                                             style="width: ${stats.total > 0 ? (count / stats.total) * 100 : 0}%"></div>
                                    </div>
                                    <span class="ml-2 text-sm font-medium">${count}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Por profesor -->
                <div class="mb-6">
                    <h5 class="font-semibold mb-3">Grupos por Profesor:</h5>
                    <div class="max-h-40 overflow-y-auto space-y-1">
                        ${Object.entries(stats.byProfessor).map(([professor, count]) => `
                            <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                                <span class="font-medium">${professor}</span>
                                <span class="text-sm bg-primary-100 text-primary-700 px-2 py-1 rounded">${count} grupos</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Información adicional -->
                <div class="bg-blue-50 p-4 rounded">
                    <h6 class="font-medium text-blue-800 mb-2">📊 Resumen:</h6>
                    <ul class="text-sm text-blue-700 space-y-1">
                        <li>• Promedio de grupos por día: ${(stats.total / 7).toFixed(1)}</li>
                        <li>• Nivel más común: ${this._getMostCommonLevel(stats.byLevel)}</li>
                        <li>• Profesor con más grupos: ${this._getMostActiveProfessor(stats.byProfessor)}</li>
                        <li>• Día con más actividad: ${this._getMostActiveDay(stats.byDay)}</li>
                    </ul>
                </div>
            </div>
        `;
    },

    /**
     * Obtiene el nivel más común
     */
    _getMostCommonLevel(byLevel) {
        const entries = Object.entries(byLevel);
        if (entries.length === 0) return 'N/A';
        
        const [level, count] = entries.reduce((max, current) => 
            current[1] > max[1] ? current : max
        );
        
        return `${level} (${count} grupos)`;
    },

    /**
     * Obtiene el profesor más activo
     */
    _getMostActiveProfessor(byProfessor) {
        const entries = Object.entries(byProfessor);
        if (entries.length === 0) return 'N/A';
        
        const [professor, count] = entries.reduce((max, current) => 
            current[1] > max[1] ? current : max
        );
        
        return `${professor} (${count} grupos)`;
    },

    /**
     * Obtiene el día más activo
     */
    _getMostActiveDay(byDay) {
        const entries = Object.entries(byDay);
        if (entries.length === 0) return 'N/A';
        
        const [day, count] = entries.reduce((max, current) => 
            current[1] > max[1] ? current : max
        );
        
        const readableDay = day === 'miercoles' ? 'miércoles' : day === 'sabado' ? 'sábado' : day;
        return `${capitalize(readableDay)} (${count} grupos)`;
    }
};

// Hacer disponible globalmente
window.GroupController = GroupController;

debugLog('group-controller.js cargado correctamente');
