/**
 * SISTEMA DE ASISTENCIA TENIS - MAIN REFACTORIZADO
 * ================================================
 * Solo inicialización y routing básico - Toda la lógica está en controladores
 */

// ===========================================
// INICIALIZACIÓN PRINCIPAL
// ===========================================

/**
 * Función principal de inicialización
 */
async function initApp() {
    debugLog('🚀 Iniciando Sistema de Asistencia Tenis...');
    
    try {
        // Verificar dependencias críticas
        if (!checkDependencies()) {
            throw new Error('Dependencias críticas no disponibles');
        }
        
        // Inicializar controladores
        await initializeControllers();
        
        // Inicializar aplicación principal
        await AppController.initialize();
        
        debugLog('✅ Sistema iniciado correctamente');
        
    } catch (error) {
        console.error('❌ Error fatal al inicializar:', error);
        showFatalError(error);
    }
}

/**
 * Verifica que todas las dependencias estén disponibles
 */
function checkDependencies() {
    const requiredObjects = [
        // Utilidades base
        'DateUtils', 'DataUtils', 'UIUtils', 'StorageUtils', 'ValidationUtils',
        
        // API y servicios
        'SheetsAPI', 'GroupService', 'StudentService', 'AttendanceService',
        'AssistantService', 'ClassControlService', // NUEVOS

        // 🆕 NUEVO: Servicio de Reposición Individual
        'RepositionService',
        
        // Componentes de UI
        'DateSelectorView', 'DashboardView', 'AttendanceFormView', 'ModalsView',
        
        // 🆕 NUEVO: Componente de Reposición Individual
        'RepositionModal',
        
        // Controladores
        'AppController', 'DateController', 'AttendanceController', 'GroupController',

        // 🆕 NUEVO: Controlador de Reposición Individual  
        'RepositionController'
    ];
    
    const missing = requiredObjects.filter(obj => typeof window[obj] === 'undefined');
    
    if (missing.length > 0) {
        console.error('❌ Dependencias faltantes:', missing);
        return false;
    }
    
    debugLog('✅ Todas las dependencias verificadas');
    return true;
}

/**
 * Inicializa todos los controladores
 */
async function initializeControllers() {
    debugLog('🎮 Inicializando controladores...');
    
    try {
        // Inicializar AttendanceController (NUEVO)
        if (window.AttendanceController && typeof window.AttendanceController.initialize === 'function') {
            debugLog('Inicializando AttendanceController...');
            await window.AttendanceController.initialize();
        } else {
            debugLog('AttendanceController no disponible o no tiene método initialize');
        }
        
        // Inicializar DateController si existe
        if (window.DateController && typeof window.DateController.initialize === 'function') {
            debugLog('Inicializando DateController...');
            await window.DateController.initialize();
        }
        
        // Aquí podrías agregar otros controladores en el futuro
        
        debugLog('✅ Controladores inicializados');
        
    } catch (error) {
        console.error('❌ Error inicializando controladores:', error);
        // No lanzar error para permitir que la app continúe
        debugLog('⚠️ Algunos controladores no se pudieron inicializar, continuando...');
    }
}

// ===========================================
// ROUTER GLOBAL Y NAVEGACIÓN
// ===========================================

/**
 * Router global para manejar navegación entre vistas
 */
const AppRouter = {
    currentView: null,
    
    /**
     * Navega a una vista específica
     */
    async navigateTo(view, params = {}) {
        debugLog(`🧭 Navegando a: ${view}`, params);
        
        try {
            switch (view) {
                case 'date-selector':
                    await AppController.showDateSelector();
                    break;
                    
                case 'dashboard':
                    if (params.date) {
                        window.AppState.selectedDate = params.date;
                    }
                    await AppController.showDashboard();
                    break;
                    
                case 'group-attendance':
                    if (!params.groupCode) {
                        throw new Error('Código de grupo requerido');
                    }
                    await AttendanceController.selectGroup(params.groupCode);
                    break;
                    
                case 'all-groups':
                    await GroupController.showAll();
                    break;
                    
                case 'reposition':
                    await RepositionController.showSelector();
                    break;
                    
                case 'reports':
                    await ReportsController.show();
                    break;
                    
                default:
                    console.warn(`Vista desconocida: ${view}`);
                    await AppController.showDateSelector();
            }
            
            this.currentView = view;
            
        } catch (error) {
            console.error(`Error navegando a ${view}:`, error);
            AppController.handleGlobalError(error, `navigation-${view}`);
        }
    },
    
    /**
     * Obtiene la vista actual
     */
    getCurrentView() {
        return this.currentView;
    },
    
    /**
     * Navega hacia atrás
     */
    async goBack() {
        // Lógica básica de navegación hacia atrás
        switch (this.currentView) {
            case 'dashboard':
                await this.navigateTo('date-selector');
                break;
            case 'group-attendance':
            case 'all-groups':
                await this.navigateTo('dashboard');
                break;
            default:
                await this.navigateTo('date-selector');
        }
    }
};

// ===========================================
// CONTROLADORES PLACEHOLDER PARA FUNCIONES FUTURAS
// ===========================================

/**
 * Controlador de reposiciones (placeholder)
 */
const RepositionController = {
    async showSelector() {
        debugLog('RepositionController: Funcionalidad en desarrollo');
        
        const html = `
            <div class="container">
                <div class="min-h-screen flex items-center justify-center">
                    <div class="text-center max-w-md">
                        <span class="text-6xl mb-4 block">🚧</span>
                        <h2 class="text-2xl font-bold text-gray-900 mb-4">Función en Desarrollo</h2>
                        <p class="text-gray-600 mb-6">La función de reposiciones individuales estará disponible pronto.</p>
                        <button onclick="AppController.showDashboard()" class="btn btn-primary">
                            🏠 Volver al Dashboard
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('app').innerHTML = html;
    },

    async create() {
        await this.showSelector();
    }
};

/**
 * Controlador de reportes (placeholder)
 */
const ReportsController = {
    async show() {
        debugLog('ReportsController: Funcionalidad en desarrollo');
        
        const html = `
            <div class="container">
                <div class="min-h-screen flex items-center justify-center">
                    <div class="text-center max-w-md">
                        <span class="text-6xl mb-4 block">📊</span>
                        <h2 class="text-2xl font-bold text-gray-900 mb-4">Reportes y Estadísticas</h2>
                        <p class="text-gray-600 mb-6">Los reportes detallados estarán disponibles en la próxima versión.</p>
                        <div class="space-y-3">
                            <button onclick="AppController.showDashboard()" class="btn btn-primary w-full">
                                🏠 Volver al Dashboard
                            </button>
                            <button onclick="GroupController.showGroupStats()" class="btn btn-secondary w-full">
                                📈 Ver Estadísticas de Grupos
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('app').innerHTML = html;
    }
};

/**
 * Controlador de sincronización (placeholder)
 */
const SyncController = {
    async showPending() {
        debugLog('SyncController: Mostrando datos pendientes');
        
        const pendingData = StorageUtils.getPendingAttendance();
        
        if (pendingData.length === 0) {
            UIUtils.showInfo('No hay datos pendientes de sincronización');
            return;
        }
        
        const html = `
            <div class="container">
                <div class="min-h-screen flex items-center justify-center">
                    <div class="text-center max-w-md">
                        <span class="text-6xl mb-4 block">⏳</span>
                        <h2 class="text-2xl font-bold text-gray-900 mb-4">Datos Pendientes</h2>
                        <p class="text-gray-600 mb-6">Hay ${pendingData.length} registros esperando sincronización.</p>
                        <div class="space-y-3">
                            <button onclick="SyncController.forcSync()" class="btn btn-primary w-full">
                                🔄 Sincronizar Ahora
                            </button>
                            <button onclick="AppController.showDashboard()" class="btn btn-outline w-full">
                                🏠 Volver al Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('app').innerHTML = html;
    },

    async forcSync() {
        try {
            UIUtils.showInfo('Intentando sincronizar datos pendientes...');
            
            // Aquí iría la lógica de sincronización forzada
            // Por ahora, mostrar mensaje
            
            setTimeout(() => {
                UIUtils.showSuccess('Funcionalidad de sincronización en desarrollo');
                AppController.showDashboard();
            }, 2000);
            
        } catch (error) {
            console.error('Error en sincronización forzada:', error);
            UIUtils.showError('Error al sincronizar datos');
        }
    }
};

// ===========================================
// FUNCIONES GLOBALES SIMPLIFICADAS
// ===========================================

/**
 * Muestra error fatal de inicialización
 */
function showFatalError(error) {
    document.getElementById('app').innerHTML = `
        <div class="min-h-screen flex items-center justify-center bg-red-50">
            <div class="text-center max-w-md p-6">
                <span class="text-6xl mb-4 block">💥</span>
                <h2 class="text-2xl font-bold text-red-900 mb-4">Error Fatal</h2>
                <p class="text-red-700 mb-4">No se pudo inicializar el sistema:</p>
                <p class="text-red-600 text-sm mb-6 bg-red-100 p-3 rounded">${error.message}</p>
                <div class="space-y-3">
                    <button onclick="location.reload()" class="btn btn-danger w-full">
                        🔄 Recargar Página
                    </button>
                    <button onclick="console.log('Debug Info:', { error, config: window.APP_CONFIG, state: window.AppState })" class="btn btn-outline w-full text-sm">
                        🐛 Mostrar Debug en Consola
                    </button>
                </div>
                <div class="mt-6 text-xs text-red-500">
                    <p>Si el problema persiste, contacta al administrador</p>
                    <p>Error: ${error.name} - ${new Date().toISOString()}</p>
                </div>
            </div>
        </div>
    `;
}

// ===========================================
// MANEJO DE EVENTOS GLOBALES
// ===========================================

/**
 * Manejo de errores no capturados
 */
window.addEventListener('error', (event) => {
    console.error('💥 Error global no capturado:', event.error);
    
    if (window.AppController) {
        AppController.handleGlobalError(event.error, 'window-error');
    } else {
        UIUtils.showError('Error inesperado en la aplicación');
    }
});

/**
 * Manejo de promesas rechazadas
 */
window.addEventListener('unhandledrejection', (event) => {
    console.error('🚨 Promesa rechazada no manejada:', event.reason);
    
    if (window.AppController) {
        AppController.handleGlobalError(event.reason, 'unhandled-promise');
    } else {
        UIUtils.showError('Error en operación asíncrona');
    }
});

/**
 * Manejo de cambios de conexión
 */
window.addEventListener('online', () => {
    UIUtils.updateConnectionStatus('online');
    UIUtils.showSuccess('Conexión restaurada');
    
    // Intentar sincronización automática si hay datos pendientes
    const pendingData = StorageUtils.getPendingAttendance();
    if (pendingData.length > 0) {
        UIUtils.showInfo(`Hay ${pendingData.length} registros pendientes de sincronización`);
    }
});

window.addEventListener('offline', () => {
    UIUtils.updateConnectionStatus('offline');
    UIUtils.showWarning('Sin conexión. Los datos se guardarán localmente.');
});

/**
 * Detección de visibilidad de página para optimizaciones
 */
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine) {
        debugLog('🔍 Página visible y conectada - verificando actualizaciones');
        // Aquí podrías agregar lógica para refrescar datos cuando la página vuelve a ser visible
    }
});

// ===========================================
// HACER OBJETOS DISPONIBLES GLOBALMENTE
// ===========================================

// Router global
window.AppRouter = AppRouter;

// Controladores placeholder
window.RepositionController = RepositionController;
window.ReportsController = ReportsController;
window.SyncController = SyncController;

// Funciones globales simplificadas
window.initApp = initApp;

// ===========================================
// DEBUG Y UTILIDADES DE DESARROLLO
// ===========================================

/**
 * Función helper para debugging en desarrollo
 */
window.getAppDebugInfo = function() {
    return {
        version: '1.0.0-MVP-WITH-ASSISTANTS',
        timestamp: new Date().toISOString(),
        config: window.APP_CONFIG,
        state: window.AppState,
        currentView: AppRouter.getCurrentView(),
        services: {
            groups: GroupService.getState ? GroupService.getState() : 'No disponible',
            students: StudentService.getState ? StudentService.getState() : 'No disponible',
            assistants: AssistantService._cache || 'No disponible', // NUEVO
            classControl: 'ClassControlService disponible' // NUEVO
        },
        controllers: {
            app: AppController.getState(),
            date: DateController.getState(),
            attendance: AttendanceController.getState(), // ACTUALIZADO
            group: GroupController.getState()
        },
        pending: StorageUtils.getPendingAttendance(),
        cache: {
            groups: StorageUtils.get('cached_groups', []).length,
            students: StorageUtils.get('cached_students', []).length,
            assistants: StorageUtils.get('cached_assistants', []).length // NUEVO
        }
    };
};

window.clearAppData = function() {
    const confirmation = confirm('¿Estás seguro de que quieres limpiar todos los datos locales?\n\nEsto incluye:\n- Cache de grupos\n- Cache de estudiantes\n- Cache de asistentes\n- Datos de asistencia pendientes');
    
    if (confirmation) {
        console.log('🧹 Limpiando datos locales...');
        
        // Limpiar localStorage
        StorageUtils.clear();
        
        // Limpiar cache de servicios
        if (window.GroupService && window.GroupService._clearCache) {
            window.GroupService._clearCache();
        }
        if (window.StudentService && window.StudentService._clearCache) {
            window.StudentService._clearCache();
        }
        if (window.AssistantService && window.AssistantService._clearCache) {
            window.AssistantService._clearCache();
        }
        
        // Limpiar estado de controladores
        if (window.AttendanceController) {
            window.AttendanceController._setState({
                currentGroup: null,
                currentStudents: [],
                availableAssistants: [],
                selectedAssistant: null,
                attendanceData: {},
                attendanceType: 'regular',
                isProcessing: false,
                classId: null
            });
        }
        
        console.log('✅ Datos limpiados');
        
        // Preguntar si quiere recargar
        if (confirm('¿Quieres recargar la página para aplicar los cambios?')) {
            location.reload();
        }
    }
};

// ===========================================
// FUNCIONES DE TESTING PARA DESARROLLO
// ===========================================

/**
 * Función para probar la integración de asistentes
 */
window.testAssistantIntegration = async function() {
    console.log('🧪 Probando integración de asistentes...');
    
    try {
        // Probar carga de asistentes
        console.log('1. Probando carga de asistentes...');
        const assistants = await AssistantService.getActiveAssistants();
        console.log(`✅ ${assistants.length} asistentes cargados:`, assistants);
        
        // Probar inicialización de AttendanceController
        console.log('2. Probando inicialización de AttendanceController...');
        await AttendanceController.initialize();
        console.log('✅ AttendanceController inicializado');
        
        // Probar estado del AttendanceController
        console.log('3. Estado del AttendanceController:');
        const state = AttendanceController.getState();
        console.log(state);
        
        // Probar conexión con backend
        console.log('4. Probando conexión con backend...');
        const connection = await SheetsAPI.testConnection();
        console.log('✅ Conexión:', connection);
        
        // Probar endpoint de asistentes
        if (SheetsAPI.getAssistants) {
            console.log('5. Probando endpoint de asistentes...');
            const backendAssistants = await SheetsAPI.getAssistants();
            console.log(`✅ ${backendAssistants.length} asistentes desde backend:`, backendAssistants);
        } else {
            console.log('⚠️ Endpoint getAssistants no disponible');
        }
        
        console.log('🎉 Integración de asistentes funcionando correctamente');
        
    } catch (error) {
        console.error('❌ Error en testing de asistentes:', error);
        return {
            success: false,
            error: error.message
        };
    }
    
    return {
        success: true,
        message: 'Integración de asistentes funcionando correctamente'
    };
};

/**
 * Función para probar la integración de control de clases
 */
window.testClassControlIntegration = async function() {
    console.log('🧪 Probando integración de control de clases...');
    
    try {
        // Probar ClassControlService
        console.log('1. Verificando ClassControlService...');
        if (typeof ClassControlService !== 'undefined') {
            console.log('✅ ClassControlService disponible');
        } else {
            throw new Error('ClassControlService no disponible');
        }
        
        // Probar validación de fecha
        console.log('2. Probando validación de fecha...');
        const today = DateUtils.getCurrentDate();
        const validation = await ClassControlService.validateClassReport(today, 'TEST-GROUP');
        console.log('✅ Validación de fecha:', validation);
        
        // Probar endpoints de backend
        if (SheetsAPI.checkClassExists) {
            console.log('3. Probando verificación de clase existente...');
            const existsCheck = await SheetsAPI.checkClassExists(today, 'TEST-GROUP', '15:45-16:30');
            console.log('✅ Verificación de clase:', existsCheck);
        } else {
            console.log('⚠️ Endpoint checkClassExists no disponible');
        }
        
        console.log('🎉 Integración de control de clases funcionando correctamente');
        
    } catch (error) {
        console.error('❌ Error en testing de control de clases:', error);
        return {
            success: false,
            error: error.message
        };
    }
    
    return {
        success: true,
        message: 'Integración de control de clases funcionando correctamente'
    };
};

/**
 * Función para probar el flujo completo
 */
window.testCompleteFlow = async function() {
    console.log('🧪 Probando flujo completo...');
    
    try {
        // Probar todas las integraciones
        console.log('1. Probando asistentes...');
        const assistantTest = await testAssistantIntegration();
        if (!assistantTest.success) {
            throw new Error('Fallo en testing de asistentes: ' + assistantTest.error);
        }
        
        console.log('2. Probando control de clases...');
        const classControlTest = await testClassControlIntegration();
        if (!classControlTest.success) {
            throw new Error('Fallo en testing de control de clases: ' + classControlTest.error);
        }
        
        console.log('3. Probando servicios básicos...');
        const groups = await GroupService.getAllGroups();
        const students = await StudentService.getAllStudents();
        console.log(`✅ ${groups.length} grupos, ${students.length} estudiantes`);
        
        console.log('🎉 ¡FLUJO COMPLETO FUNCIONANDO CORRECTAMENTE!');
        
        return {
            success: true,
            message: 'Todas las integraciones funcionando correctamente',
            details: {
                assistants: assistantTest,
                classControl: classControlTest,
                groups: groups.length,
                students: students.length
            }
        };
        
    } catch (error) {
        console.error('❌ Error en testing completo:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

debugLog('main.js actualizado con soporte para asistentes y control de clases');
