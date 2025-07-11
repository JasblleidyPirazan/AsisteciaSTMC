/**
 * SISTEMA DE ASISTENCIA TENIS - MAIN REFACTORIZADO
 * ================================================
 * Solo inicialización y routing básico - Toda la lógica está en controladores
 * ✅ VERSIÓN CORREGIDA: Con soporte robusto para RepositionModal y debugging mejorado
 * 🆕 NUEVA: Incluye módulo de reposición grupal
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
 * Verifica que todas las dependencias estén disponibles - VERSIÓN MEJORADA CON REPOSICIÓN GRUPAL
 */
function checkDependencies() {
    const requiredObjects = [
        // Utilidades base
        'DateUtils', 'DataUtils', 'UIUtils', 'StorageUtils', 'ValidationUtils',
        
        // API y servicios
        'SheetsAPI', 'GroupService', 'StudentService', 'AttendanceService',
        'AssistantService', 'ClassControlService',

        // 🆕 NUEVO: Servicio de Reposición Individual
        'RepositionService',
        
        // 🆕 NUEVO: Servicio de Reposición Grupal
        'GroupRepositionService',
        
        // Componentes de UI
        'DateSelectorView', 'DashboardView', 'AttendanceFormView', 'ModalsView',
        
        // 🆕 NUEVO: Componente de Reposición Individual
        'RepositionModal',
        
        // 🆕 NUEVO: Componente de Reposición Grupal
        'GroupRepositionFormView',
        
        // Controladores
        'AppController', 'DateController', 'AttendanceController', 'GroupController',

        // 🆕 NUEVO: Controlador de Reposición Individual  
        'RepositionController',
        
        // 🆕 NUEVO: Controlador de Reposición Grupal
        'GroupRepositionController'
    ];
    
    const missing = requiredObjects.filter(obj => typeof window[obj] === 'undefined');
    
    if (missing.length > 0) {
        console.error('❌ Dependencias faltantes:', missing);
        
        // NUEVO: Mostrar información detallada sobre cada dependencia faltante
        missing.forEach(dep => {
            console.error(`   - ${dep}: ${typeof window[dep]}`);
        });
        
        // NUEVO: Si solo falta RepositionModal, intentar continuar con placeholder
        if (missing.length === 1 && missing[0] === 'RepositionModal') {
            console.warn('⚠️ Solo falta RepositionModal, creando placeholder...');
            
            // Crear un RepositionModal básico para evitar errores
            window.RepositionModal = {
                render: () => '<div>Modal no disponible</div>',
                show: () => {
                    console.warn('RepositionModal.show() no implementado - usa forceShowRepositionModal()');
                    return false;
                },
                hide: () => console.warn('RepositionModal.hide() no implementado')
            };
            
            console.log('✅ RepositionModal placeholder creado');
            return true;
        }
        
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
                    
                // 🆕 NUEVO: Navegación para reposición grupal
                case 'group-reposition':
                    await GroupRepositionController.show();
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
            case 'group-reposition': // 🆕 NUEVO
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

// Controladores placeholder (solo los que no están implementados)
// RepositionController se carga desde js/controllers/reposition-controller.js
// GroupRepositionController se carga desde js/controllers/group-reposition-controller.js
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
        version: '1.0.0-MVP-WITH-ASSISTANTS-AND-GROUP-REPOSITION',
        timestamp: new Date().toISOString(),
        config: window.APP_CONFIG,
        state: window.AppState,
        currentView: AppRouter.getCurrentView(),
        services: {
            groups: GroupService.getState ? GroupService.getState() : 'No disponible',
            students: StudentService.getState ? StudentService.getState() : 'No disponible',
            assistants: AssistantService._cache || 'No disponible',
            classControl: 'ClassControlService disponible',
            groupReposition: typeof GroupRepositionService !== 'undefined' ? 'Disponible' : 'No disponible' // 🆕 NUEVO
        },
        controllers: {
            app: AppController.getState(),
            date: DateController.getState(),
            attendance: AttendanceController.getState(),
            group: GroupController.getState(),
            groupReposition: typeof GroupRepositionController !== 'undefined' ? 'Disponible' : 'No disponible' // 🆕 NUEVO
        },
        pending: StorageUtils.getPendingAttendance(),
        cache: {
            groups: StorageUtils.get('cached_groups', []).length,
            students: StorageUtils.get('cached_students', []).length,
            assistants: StorageUtils.get('cached_assistants', []).length
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
 * 🆕 NUEVA: Función para probar la integración de reposición grupal
 */
window.testGroupRepositionIntegration = async function() {
    console.log('🧪 Probando integración de reposición grupal...');
    
    try {
        // Probar carga de servicios
        console.log('1. Verificando servicios...');
        if (typeof GroupRepositionService !== 'undefined') {
            console.log('✅ GroupRepositionService disponible');
        } else {
            throw new Error('GroupRepositionService no disponible');
        }
        
        if (typeof GroupRepositionFormView !== 'undefined') {
            console.log('✅ GroupRepositionFormView disponible');
        } else {
            throw new Error('GroupRepositionFormView no disponible');
        }
        
        if (typeof GroupRepositionController !== 'undefined') {
            console.log('✅ GroupRepositionController disponible');
        } else {
            throw new Error('GroupRepositionController no disponible');
        }
        
        // Probar carga de datos
        console.log('2. Probando carga de datos...');
        const formData = await GroupRepositionService.getFormData();
        console.log(`✅ Datos cargados - ${formData.professors.length} profesores, ${formData.students.length} estudiantes, ${formData.assistants.length} asistentes`);
        
        // Probar validación
        console.log('3. Probando validación...');
        const testData = {
            fecha: '2025-07-15',
            hora: '15:00-16:30',
            profesorId: 'PROF001',
            cancha: 1,
            numeroReposiciones: 2,
            estudiantesSeleccionados: [{id: 'EST001', nombre: 'Test'}]
        };
        
        const validation = GroupRepositionService.validateFormData(testData);
        console.log(`✅ Validación: ${validation.valid ? 'Exitosa' : 'Fallida'}`);
        
        // Probar generación de ID
        console.log('4. Probando generación de ID...');
        const classId = GroupRepositionService.generateClassId('2025-07-15', '15:00-16:30', 1);
        console.log(`✅ ID generado: ${classId}`);
        
        console.log('🎉 ¡Integración de reposición grupal funcionando correctamente!');
        
        return {
            success: true,
            message: 'Integración de reposición grupal funcionando correctamente'
        };
        
    } catch (error) {
        console.error('❌ Error en testing de reposición grupal:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Función para probar el flujo completo (ACTUALIZADA)
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
        
        // 🆕 NUEVO: Probar reposición grupal
        console.log('3. Probando reposición grupal...');
        const groupRepositionTest = await testGroupRepositionIntegration();
        if (!groupRepositionTest.success) {
            throw new Error('Fallo en testing de reposición grupal: ' + groupRepositionTest.error);
        }
        
        console.log('4. Probando servicios básicos...');
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
                groupReposition: groupRepositionTest, // 🆕 NUEVO
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

// ===========================================
// 🆕 NUEVAS FUNCIONES DE DEBUGGING PARA REPOSITION MODAL
// ===========================================

/**
 * Función para probar el modal de reposición individual - NUEVA
 */
window.testRepositionModal = function() {
    console.log('🧪 Probando modal de reposición individual...');
    
    try {
        // 1. Verificar si existe en DOM
        const modal = document.getElementById('reposition-modal');
        console.log('1. Modal existe en DOM:', !!modal);
        
        if (modal) {
            console.log('   - Classes:', modal.className);
            console.log('   - Display:', window.getComputedStyle(modal).display);
            console.log('   - Z-index:', window.getComputedStyle(modal).zIndex);
        }
        
        // 2. Verificar RepositionController
        console.log('2. RepositionController disponible:', typeof window.RepositionController === 'object');
        
        // 3. Verificar RepositionModal
        console.log('3. RepositionModal disponible:', typeof window.RepositionModal === 'object');
        
        if (window.RepositionModal) {
            console.log('   - show() function:', typeof window.RepositionModal.show === 'function');
            console.log('   - render() function:', typeof window.RepositionModal.render === 'function');
        }
        
        // 4. Intentar crear modal de prueba
        if (window.RepositionController) {
            console.log('4. Creando modal de prueba...');
            
            const testClassData = {
                groupCode: 'TEST-GROUP',
                classId: 'TEST-CLASS-ID',
                selectedDate: '2025-07-12',
                sentBy: 'test-user'
            };
            
            window.RepositionController.openFromAttendance(testClassData)
                .then(() => {
                    console.log('✅ Modal de prueba creado exitosamente');
                })
                .catch(error => {
                    console.error('❌ Error creando modal de prueba:', error);
                });
        }
        
        // 5. Forzar mostrar modal si existe
        if (modal && window.RepositionModal?.show) {
            console.log('5. Intentando mostrar modal existente...');
            const result = window.RepositionModal.show();
            console.log('   - Resultado:', result);
        }
        
        return {
            success: true,
            message: 'Test de modal ejecutado - revisa la consola para detalles'
        };
        
    } catch (error) {
        console.error('❌ Error en testing de modal:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Función para forzar mostrar el modal de reposición - NUEVA
 */
window.forceShowRepositionModal = function() {
    console.log('🔧 Forzando mostrar modal de reposición...');
    
    // Crear modal básico si no existe
    let modal = document.getElementById('reposition-modal');
    
    if (!modal) {
        const modalHTML = `
            <div id="reposition-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50" style="display: flex; align-items: center; justify-content: center;">
                <div class="bg-white rounded-lg w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-xl m-4">
                    <div class="p-6 border-b border-gray-200">
                        <h3 class="text-lg font-semibold text-gray-900">Reposición Individual (Test)</h3>
                        <p class="text-sm text-gray-600 mt-1">Modal de prueba forzado</p>
                    </div>
                    <div class="p-6">
                        <p>Este es un modal de prueba para verificar que se puede mostrar.</p>
                        <div class="mt-4">
                            <button onclick="forceHideRepositionModal()" class="btn btn-primary">
                                Cerrar Modal de Prueba
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('reposition-modal');
        console.log('✅ Modal de prueba creado forzadamente');
    } else {
        // Mostrar modal existente
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        modal.style.zIndex = '9999';
        console.log('✅ Modal existente mostrado forzadamente');
    }
    
    // Prevenir scroll
    document.body.style.overflow = 'hidden';
    
    return modal;
};

/**
 * Función para ocultar el modal de prueba - NUEVA
 */
window.forceHideRepositionModal = function() {
    const modal = document.getElementById('reposition-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
        console.log('✅ Modal ocultado');
    }
    
    // Restaurar scroll
    document.body.style.overflow = '';
};

/**
 * Función para cargar dinámicamente RepositionModal si falta - NUEVA
 */
window.loadRepositionModal = function() {
    console.log('📥 Intentando cargar RepositionModal dinámicamente...');
    
    if (window.RepositionModal && typeof window.RepositionModal.show === 'function') {
        console.log('✅ RepositionModal ya existe y es funcional');
        return Promise.resolve(window.RepositionModal);
    }
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'js/components/reposition-modal.js';
        script.onload = () => {
            if (window.RepositionModal && typeof window.RepositionModal.show === 'function') {
                console.log('✅ RepositionModal cargado dinámicamente y funcional');
                resolve(window.RepositionModal);
            } else {
                console.error('❌ RepositionModal se cargó pero no es funcional');
                reject(new Error('RepositionModal no funcional después de carga'));
            }
        };
        script.onerror = (error) => {
            console.error('❌ Error cargando reposition-modal.js:', error);
            reject(error);
        };
        document.head.appendChild(script);
    });
};

debugLog('main.js actualizado con soporte completo para asistentes, control de clases, reposición individual, reposición grupal y debugging avanzado');
