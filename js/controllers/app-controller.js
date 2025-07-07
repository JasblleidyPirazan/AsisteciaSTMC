/**
 * CONTROLADOR PRINCIPAL DE LA APLICACIÓN
 * =====================================
 * Maneja la navegación general y flujos principales
 */

const AppController = {
    // Estado interno del controlador
    _state: {
        currentView: 'date-selector',
        isLoading: false,
        lastError: null
    },

    /**
     * Inicializa la aplicación completa
     */
    async initialize() {
        debugLog('AppController: Inicializando aplicación...');
        
        try {
            this._setState({ isLoading: true });
            
            // Configurar URL de Apps Script
            SheetsAPI.setWebAppUrl(window.APP_CONFIG.APPS_SCRIPT_URL);
            
            // Probar conexión con backend
            await this._testBackendConnection();
            
            // Cargar datos iniciales
            await this._loadInitialData();
            
            // Mostrar selector de fecha como pantalla inicial
            this.showDateSelector();
            
        } catch (error) {
            console.error('AppController: Error durante inicialización:', error);
            this._handleError('Error al inicializar la aplicación', error);
        } finally {
            this._setState({ isLoading: false });
        }
    },

    /**
     * Muestra el selector de fecha
     */
    async showDateSelector() {
        debugLog('AppController: Mostrando selector de fecha');
        
        try {
            this._setState({ currentView: 'date-selector', isLoading: true });
            
            // Renderizar loading inicial
            UIUtils.showLoading('app', 'Cargando selector de fecha...');
            
            // Preparar datos para el selector
            const today = DateUtils.getCurrentDate();
            const currentDay = DateUtils.getCurrentDay();
            
            // Obtener grupos del día actual para mostrar información inicial
            const todayGroups = await GroupService.getTodayGroups();
            
            const selectorData = {
                selectedDate: today,
                currentDay: currentDay,
                groupsCount: todayGroups.length,
                isToday: true
            };
            
            // Renderizar selector de fecha
            const html = DateSelectorView.render(selectorData);
            document.getElementById('app').innerHTML = html;
            
            debugLog(`AppController: Selector de fecha mostrado (${todayGroups.length} grupos hoy)`);
            
        } catch (error) {
            console.error('AppController: Error al mostrar selector de fecha:', error);
            this._handleError('Error al cargar selector de fecha', error);
        } finally {
            this._setState({ isLoading: false });
        }
    },

    /**
     * Muestra el dashboard con grupos del día seleccionado
     */
    async showDashboard() {
        debugLog('AppController: Mostrando dashboard');
        
        try {
            this._setState({ currentView: 'dashboard', isLoading: true });
            
            // Renderizar loading
            const html = DashboardView.renderLoading('Cargando dashboard...');
            document.getElementById('app').innerHTML = html;
            
            // Obtener fecha seleccionada
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            const isToday = selectedDate === DateUtils.getCurrentDate();
            
            // Cargar datos del dashboard
            const dashboardData = await this._loadDashboardData(selectedDate);
            
            // Renderizar dashboard completo
            const dashboardHtml = DashboardView.render({
                selectedDate,
                dayGroups: dashboardData.dayGroups,
                stats: dashboardData.stats,
                isToday
            });
            
            document.getElementById('app').innerHTML = dashboardHtml;
            
            debugLog(`AppController: Dashboard mostrado para ${selectedDate}`);
            
        } catch (error) {
            console.error('AppController: Error al mostrar dashboard:', error);
            this._handleError('Error al cargar dashboard', error);
        } finally {
            this._setState({ isLoading: false });
        }
    },

    /**
     * Actualiza los datos de la aplicación
     */
    async refreshData() {
        debugLog('AppController: Actualizando datos...');
        
        try {
            UIUtils.showInfo('Actualizando datos...');
            
            // Forzar actualización de servicios
            await Promise.all([
                GroupService.refresh(),
                StudentService.refresh()
            ]);
            
            // Recargar vista actual
            await this._reloadCurrentView();
            
            UIUtils.showSuccess('Datos actualizados correctamente');
            
        } catch (error) {
            console.error('AppController: Error al actualizar datos:', error);
            UIUtils.showError('Error al actualizar datos');
        }
    },

    /**
     * Maneja errores globales de la aplicación
     */
    handleGlobalError(error, context = 'general') {
        console.error(`AppController: Error global en ${context}:`, error);
        
        // Determinar tipo de error y acción
        if (error.message && error.message.includes('network')) {
            UIUtils.updateConnectionStatus('offline');
            UIUtils.showWarning('Problema de conexión. Trabajando en modo offline.');
        } else if (error.message && error.message.includes('auth')) {
            this._handleAuthError(error);
        } else {
            this._handleError('Error inesperado', error);
        }
    },

    /**
     * Navega a una vista específica con parámetros
     */
    async navigateTo(view, params = {}) {
        debugLog(`AppController: Navegando a ${view}`, params);
        
        try {
            switch (view) {
                case 'date-selector':
                    await this.showDateSelector();
                    break;
                    
                case 'dashboard':
                    window.AppState.selectedDate = params.date || DateUtils.getCurrentDate();
                    await this.showDashboard();
                    break;
                    
                case 'attendance':
                    if (params.groupCode) {
                        await AttendanceController.selectGroup(params.groupCode);
                    } else {
                        throw new Error('Código de grupo requerido para asistencia');
                    }
                    break;
                    
                case 'reposition':
                    await RepositionController.showSelector();
                    break;
                    
                default:
                    throw new Error(`Vista desconocida: ${view}`);
            }
            
        } catch (error) {
            console.error(`AppController: Error al navegar a ${view}:`, error);
            this._handleError(`Error al navegar a ${view}`, error);
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
        debugLog('AppController: Estado actualizado:', this._state);
    },

    /**
     * Prueba la conexión con el backend
     */
    async _testBackendConnection() {
        debugLog('AppController: Probando conexión con backend...');
        
        try {
            const connectionTest = await SheetsAPI.testConnection();
            
            if (connectionTest.success) {
                UIUtils.updateConnectionStatus('online');
                debugLog('AppController: Conexión con backend exitosa');
            } else {
                throw new Error(connectionTest.error || 'Error de conexión desconocido');
            }
            
        } catch (error) {
            debugLog('AppController: Error de conexión, trabajando offline');
            UIUtils.updateConnectionStatus('offline');
            // No lanzar error, continuar en modo offline
        }
    },

    /**
     * Carga datos iniciales de la aplicación
     */
    async _loadInitialData() {
        debugLog('AppController: Cargando datos iniciales...');
        
        try {
            // Cargar grupos y estudiantes en paralelo
            const [grupos, estudiantes] = await Promise.all([
                GroupService.getAllGroups(),
                StudentService.getAllStudents()
            ]);
            
            // Actualizar estado global
            window.AppState.grupos = grupos;
            window.AppState.estudiantes = estudiantes;
            
            debugLog(`AppController: Datos iniciales cargados - ${grupos.length} grupos, ${estudiantes.length} estudiantes`);
            
        } catch (error) {
            // En caso de error, intentar cargar desde cache
            debugLog('AppController: Error cargando datos, intentando cache...');
            
            const cachedGroups = StorageUtils.get('cached_groups', []);
            const cachedStudents = StorageUtils.get('cached_students', []);
            
            if (cachedGroups.length > 0 || cachedStudents.length > 0) {
                window.AppState.grupos = cachedGroups;
                window.AppState.estudiantes = cachedStudents;
                UIUtils.showWarning('Usando datos guardados localmente');
            } else {
                throw error;
            }
        }
    },

    /**
     * Carga datos específicos para el dashboard
     */
    async _loadDashboardData(selectedDate) {
        debugLog(`AppController: Cargando datos del dashboard para ${selectedDate}`);
        
        try {
            const dayName = DateUtils.getDayFromDate(selectedDate);
            
            // Obtener grupos del día seleccionado
            const dayGroups = await GroupService.getGroupsByDay(dayName);
            
            // Calcular estadísticas
            const stats = {
                dayGroups: dayGroups.length,
                totalStudents: window.AppState.estudiantes.length,
                pendingSync: StorageUtils.getPendingAttendance().length
            };
            
            return { dayGroups, stats };
            
        } catch (error) {
            console.error('AppController: Error cargando datos del dashboard:', error);
            throw error;
        }
    },

    /**
     * Recarga la vista actual
     */
    async _reloadCurrentView() {
        const currentView = this._state.currentView;
        
        switch (currentView) {
            case 'date-selector':
                await this.showDateSelector();
                break;
            case 'dashboard':
                await this.showDashboard();
                break;
            default:
                debugLog(`AppController: No se puede recargar vista: ${currentView}`);
        }
    },

    /**
     * Maneja errores generales
     */
    _handleError(message, error) {
        this._setState({ lastError: error });
        
        // Mostrar pantalla de error
        const errorHtml = this._generateErrorScreen(message, error);
        document.getElementById('app').innerHTML = errorHtml;
        
        // También mostrar notificación
        UIUtils.showError(message);
    },

    /**
     * Maneja errores de autenticación
     */
    _handleAuthError(error) {
        debugLog('AppController: Error de autenticación:', error);
        
        // Limpiar estado de usuario
        window.AppState.user = null;
        window.AppState.isAuthenticated = false;
        
        // Mostrar mensaje y redirigir a login si es necesario
        UIUtils.showError('Error de autenticación. Por favor, recarga la página.');
    },

    /**
     * Genera HTML para pantalla de error
     */
    _generateErrorScreen(message, error) {
        return `
            <div class="container">
                <div class="min-h-screen flex items-center justify-center">
                    <div class="text-center max-w-md">
                        <span class="text-6xl mb-4 block">⚠️</span>
                        <h2 class="text-2xl font-bold text-gray-900 mb-4">Error en la Aplicación</h2>
                        <p class="text-gray-600 mb-4">${message}</p>
                        
                        ${window.APP_CONFIG.DEBUG ? `
                            <details class="text-left bg-gray-100 p-4 rounded mb-4">
                                <summary class="cursor-pointer font-medium">Detalles técnicos</summary>
                                <pre class="text-xs mt-2 text-red-600">${error.stack || error.message}</pre>
                            </details>
                        ` : ''}
                        
                        <div class="space-y-3">
                            <button onclick="AppController.refreshData()" class="btn btn-primary w-full">
                                🔄 Reintentar
                            </button>
                            <button onclick="AppController.showDateSelector()" class="btn btn-outline w-full">
                                🏠 Ir al Inicio
                            </button>
                            <button onclick="location.reload()" class="btn btn-neutral w-full">
                                ↻ Recargar Página
                            </button>
                        </div>
                        
                        <div class="mt-6 text-xs text-gray-500">
                            <p>Si el problema persiste, contacta al administrador</p>
                            <p>Timestamp: ${new Date().toISOString()}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
};

// Hacer disponible globalmente
window.AppController = AppController;

debugLog('app-controller.js cargado correctamente');
