/**
 * SISTEMA DE ASISTENCIA TENIS - LÓGICA PRINCIPAL
 * ===============================================
 * Archivo principal que maneja la lógica de la aplicación
 */

// ===========================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ===========================================

/**
 * Función principal de inicialización
 */
async function initApp() {
    debugLog('Iniciando aplicación...');
    
    try {
        // Mostrar loading inicial
        UIUtils.showLoading('app', 'Inicializando Sistema de Asistencia...');
        
        // Inicializar Google APIs
        if (typeof gapi !== 'undefined') {
            await initGoogleAPIs();
        } else {
            console.warn('Google APIs no disponibles');
        }
        
        // Verificar autenticación
        if (window.GoogleAuth && GoogleAuth.isSignedIn()) {
            debugLog('Usuario ya autenticado');
            await loadUserData();
            showDashboard();
        } else {
            debugLog('Usuario no autenticado');
            showLoginScreen();
        }
        
    } catch (error) {
        console.error('Error al inicializar aplicación:', error);
        showErrorScreen('Error al inicializar la aplicación. Por favor, recarga la página.');
    }
}

/**
 * Inicializa las APIs de Google
 */
async function initGoogleAPIs() {
    return new Promise((resolve, reject) => {
        gapi.load('auth2', {
            callback: () => {
                debugLog('Google Auth2 cargado');
                resolve();
            },
            onerror: () => {
                console.error('Error al cargar Google Auth2');
                reject(new Error('Error al cargar Google Auth2'));
            }
        });
    });
}

// ===========================================
// PANTALLAS PRINCIPALES
// ===========================================

/**
 * Muestra la pantalla de login
 */
function showLoginScreen() {
    debugLog('Mostrando pantalla de login');
    
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100">
            <div class="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
                <div class="text-center mb-8">
                    <div class="mx-auto w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center mb-4">
                        <span class="text-2xl">🎾</span>
                    </div>
                    <h1 class="text-3xl font-bold text-gray-900 mb-2">Sistema de Asistencia</h1>
                    <p class="text-gray-600">Academia de Tenis</p>
                </div>
                
                <div class="space-y-4">
                    <button 
                        onclick="handleGoogleSignIn()" 
                        class="w-full btn btn-primary btn-lg flex items-center justify-center"
                        id="google-signin-btn"
                    >
                        <svg class="w-5 h-5 mr-3" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Iniciar Sesión con Google
                    </button>
                    
                    <div class="text-center">
                        <button 
                            onclick="showDemoMode()" 
                            class="text-sm text-primary-600 hover:text-primary-800 underline"
                        >
                            Ver demo sin autenticación
                        </button>
                    </div>
                </div>
                
                <div class="mt-8 text-center text-sm text-gray-500">
                    <p>Versión 1.0 - Fase de Desarrollo</p>
                </div>
            </div>
        </div>
    `;
}

/**
 * Muestra el dashboard principal
 */
async function showDashboard() {
    debugLog('Mostrando dashboard');
    
    try {
        UIUtils.showLoading('app', 'Cargando dashboard...');
        
        // Cargar datos de grupos
        await loadGroupsData();
        
        const todayGroups = DataUtils.getTodayGroups(window.AppState.grupos);
        const today = DateUtils.formatDate(DateUtils.getCurrentDate());
        const todayName = DateUtils.getCurrentDay();
        
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="container">
                <!-- Header -->
                <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 bg-white rounded-lg p-6 shadow-sm">
                    <div>
                        <h1 class="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
                        <p class="text-gray-600">${today}</p>
                        <div class="connection-status status-indicator ${window.AppState.connectionStatus} mt-2">
                            ${window.AppState.connectionStatus === 'online' ? 'En línea' : 'Sin conexión'}
                        </div>
                    </div>
                    <div class="flex gap-3 mt-4 sm:mt-0">
                        <button onclick="showSettings()" class="btn btn-neutral">
                            ⚙️ Configuración
                        </button>
                        <button onclick="handleSignOut()" class="btn btn-outline">
                            🚪 Cerrar Sesión
                        </button>
                    </div>
                </header>

                <!-- Estadísticas rápidas -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div class="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
                        <div class="flex items-center">
                            <div class="p-3 bg-primary-100 rounded-lg">
                                <span class="text-2xl">📅</span>
                            </div>
                            <div class="ml-4">
                                <p class="text-sm text-gray-600">Grupos Hoy</p>
                                <p class="text-2xl font-bold text-gray-900">${todayGroups.length}</p>
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
                                <p class="text-2xl font-bold text-gray-900">${window.AppState.estudiantes.length}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
                        <div class="flex items-center">
                            <div class="p-3 bg-accent-100 rounded-lg">
                                <span class="text-2xl">✅</span>
                            </div>
                            <div class="ml-4">
                                <p class="text-sm text-gray-600">Pendientes Sync</p>
                                <p class="text-2xl font-bold text-gray-900">${StorageUtils.getPendingAttendance().length}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Grupos del día -->
                <div class="mb-8">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold text-gray-900">
                            Grupos de ${capitalize(todayName)}
                        </h2>
                        <button onclick="refreshData()" class="btn btn-outline">
                            🔄 Actualizar
                        </button>
                    </div>
                    
                    <div id="groups-container">
                        ${todayGroups.length > 0 ? `
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                ${todayGroups.map(group => UIUtils.createGroupCard(group)).join('')}
                            </div>
                        ` : `
                            <div class="text-center py-12 bg-white rounded-lg shadow-sm">
                                <span class="text-6xl mb-4 block">📅</span>
                                <h3 class="text-xl font-semibold text-gray-700 mb-2">No hay clases programadas hoy</h3>
                                <p class="text-gray-500">Los ${todayName}s no hay grupos programados</p>
                            </div>
                        `}
                    </div>
                </div>

                <!-- Acciones rápidas -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <button onclick="showAllGroups()" class="btn btn-outline p-6 h-auto flex-col text-center">
                        <span class="text-3xl mb-2 block">🗓️</span>
                        <span class="font-semibold">Todos los Grupos</span>
                        <span class="text-sm opacity-75">Ver todos los horarios</span>
                    </button>
                    
                    <button onclick="showReports()" class="btn btn-secondary p-6 h-auto flex-col text-center">
                        <span class="text-3xl mb-2 block">📊</span>
                        <span class="font-semibold">Reportes</span>
                        <span class="text-sm opacity-75">Ver estadísticas</span>
                    </button>
                    
                    <button onclick="showCreateReposition()" class="btn btn-primary p-6 h-auto flex-col text-center">
                        <span class="text-3xl mb-2 block">➕</span>
                        <span class="font-semibold">Crear Reposición</span>
                        <span class="text-sm opacity-75">Clase especial</span>
                    </button>
                    
                    <button onclick="showPendingSync()" class="btn btn-neutral p-6 h-auto flex-col text-center">
                        <span class="text-3xl mb-2 block">⏳</span>
                        <span class="font-semibold">Pendientes</span>
                        <span class="text-sm opacity-75">Datos por sincronizar</span>
                    </button>
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('Error al cargar dashboard:', error);
        showErrorScreen('Error al cargar el dashboard');
    }
}

/**
 * Muestra la pantalla de error
 */
function showErrorScreen(message) {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="min-h-screen flex items-center justify-center">
            <div class="text-center max-w-md">
                <span class="text-6xl mb-4 block">❌</span>
                <h2 class="text-2xl font-bold text-gray-900 mb-4">Error</h2>
                <p class="text-gray-600 mb-6">${message}</p>
                <button onclick="location.reload()" class="btn btn-primary">
                    🔄 Recargar Página
                </button>
            </div>
        </div>
    `;
}

// ===========================================
// GESTIÓN DE AUTENTICACIÓN
// ===========================================

/**
 * Maneja el inicio de sesión con Google
 */
async function handleGoogleSignIn() {
    debugLog('Iniciando proceso de login...');
    
    const btn = document.getElementById('google-signin-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner mr-3"></div>Iniciando sesión...';
    }
    
    try {
        if (window.GoogleAuth) {
            await GoogleAuth.signIn();
        } else {
            // Modo demo si no hay Google Auth
            showDemoMode();
        }
    } catch (error) {
        console.error('Error en login:', error);
        UIUtils.showError('Error al iniciar sesión. Por favor, intenta de nuevo.');
        
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Iniciar Sesión con Google';
        }
    }
}

/**
 * Maneja el cierre de sesión
 */
async function handleSignOut() {
    debugLog('Cerrando sesión...');
    
    try {
        if (window.GoogleAuth) {
            await GoogleAuth.signOut();
        }
        
        // Limpiar estado de la aplicación
        window.AppState = {
            user: null,
            isAuthenticated: false,
            currentPage: 'login',
            grupos: [],
            estudiantes: [],
            currentAttendance: {},
            connectionStatus: checkConnection() ? 'online' : 'offline'
        };
        
        // Mostrar pantalla de login
        showLoginScreen();
        
        UIUtils.showSuccess('Sesión cerrada correctamente');
        
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
        UIUtils.showError('Error al cerrar sesión');
    }
}

/**
 * Modo demo para desarrollo
 */
function showDemoMode() {
    debugLog('Activando modo demo');
    
    // Simular usuario demo
    window.AppState.user = {
        email: 'demo@academia-tenis.com',
        name: 'Usuario Demo',
        picture: null
    };
    window.AppState.isAuthenticated = true;
    
    UIUtils.showInfo('Modo demo activado - Los datos no se guardarán realmente');
    
    // Cargar datos demo
    loadDemoData();
    showDashboard();
}

// ===========================================
// CARGA DE DATOS
// ===========================================

/**
 * Carga los datos del usuario autenticado
 */
async function loadUserData() {
    debugLog('Cargando datos del usuario...');
    
    try {
        // Aquí cargarías datos específicos del usuario
        // Por ahora, solo cargar datos generales
        await loadGroupsData();
        await loadStudentsData();
        
    } catch (error) {
        console.error('Error al cargar datos del usuario:', error);
        UIUtils.showWarning('Error al cargar algunos datos');
    }
}

/**
 * Carga datos de grupos desde Google Sheets
 */
async function loadGroupsData() {
    debugLog('Cargando datos de grupos...');
    
    try {
        if (window.SheetsAPI) {
            const groupsData = await SheetsAPI.getGroups();
            window.AppState.grupos = groupsData || [];
        } else {
            // Usar datos demo si no hay API
            loadDemoGroups();
        }
        
        debugLog(`Grupos cargados: ${window.AppState.grupos.length}`);
        
    } catch (error) {
        console.error('Error al cargar grupos:', error);
        loadDemoGroups(); // Fallback a datos demo
    }
}

/**
 * Carga datos de estudiantes desde Google Sheets
 */
async function loadStudentsData() {
    debugLog('Cargando datos de estudiantes...');
    
    try {
        if (window.SheetsAPI) {
            const studentsData = await SheetsAPI.getStudents();
            window.AppState.estudiantes = studentsData || [];
        } else {
            loadDemoStudents();
        }
        
        debugLog(`Estudiantes cargados: ${window.AppState.estudiantes.length}`);
        
    } catch (error) {
        console.error('Error al cargar estudiantes:', error);
        loadDemoStudents(); // Fallback a datos demo
    }
}

/**
 * Carga datos demo para desarrollo
 */
function loadDemoData() {
    loadDemoGroups();
    loadDemoStudents();
}

function loadDemoGroups() {
    window.AppState.grupos = [
        {
            codigo: 'LM-15:45-Brayan-Verde',
            dias: 'Lunes,Miércoles',
            hora: '15:45-16:30',
            profe: 'Brayan',
            cancha: '2',
            frecuencia_semanal: '2',
            bola: 'Verde',
            descriptor: 'Lunes,Miércoles-15:45-16:30-Brayan-Verde',
            activo: true
        },
        {
            codigo: 'MJ-16:30-Ricardo-Amarilla',
            dias: 'Martes,Jueves',
            hora: '16:30-17:15',
            profe: 'Ricardo',
            cancha: '1',
            frecuencia_semanal: '2',
            bola: 'Amarilla',
            descriptor: 'Martes,Jueves-16:30-17:15-Ricardo-Amarilla',
            activo: true
        }
    ];
}

function loadDemoStudents() {
    window.AppState.estudiantes = [
        {
            id: 'EST001',
            nombre: 'Juan Pérez Martínez',
            grupo_principal: 'LM-15:45-Brayan-Verde',
            grupo_secundario: '',
            max_clases: '40',
            activo: true
        },
        {
            id: 'EST002',
            nombre: 'María González López',
            grupo_principal: 'LM-15:45-Brayan-Verde',
            grupo_secundario: '',
            max_clases: '40',
            activo: true
        }
    ];
}

// ===========================================
// FUNCIONES DE NAVEGACIÓN
// ===========================================

/**
 * Selecciona un grupo para registro de asistencia
 */
async function selectGroup(groupCode) {
    debugLog(`Seleccionando grupo: ${groupCode}`);
    
    try {
        UIUtils.showLoading('app', 'Cargando estudiantes...');
        
        // Encontrar el grupo
        const group = window.AppState.grupos.find(g => g.codigo === groupCode);
        if (!group) {
            throw new Error('Grupo no encontrado');
        }
        
        // Obtener estudiantes del grupo
        const students = DataUtils.getStudentsByGroup(window.AppState.estudiantes, groupCode);
        
        if (students.length === 0) {
            UIUtils.showWarning('No hay estudiantes registrados en este grupo');
            showDashboard();
            return;
        }
        
        // Limpiar asistencia actual
        window.AppState.currentAttendance = {};
        
        showAttendanceForm(group, students);
        
    } catch (error) {
        console.error('Error al seleccionar grupo:', error);
        UIUtils.showError('Error al cargar el grupo');
        showDashboard();
    }
}

/**
 * Actualiza los datos de la aplicación
 */
async function refreshData() {
    debugLog('Actualizando datos...');
    
    try {
        UIUtils.showInfo('Actualizando datos...');
        
        await loadGroupsData();
        await loadStudentsData();
        
        // Recargar dashboard
        showDashboard();
        
        UIUtils.showSuccess('Datos actualizados correctamente');
        
    } catch (error) {
        console.error('Error al actualizar datos:', error);
        UIUtils.showError('Error al actualizar datos');
    }
}

// ===========================================
// FUNCIONES PLACEHOLDER PARA DESARROLLO
// ===========================================

function showAttendanceForm(group, students) {
    UIUtils.showInfo('Función de asistencia en desarrollo');
    // TODO: Implementar en el siguiente archivo
}

function showAllGroups() {
    UIUtils.showInfo('Función de todos los grupos en desarrollo');
}

function showReports() {
    UIUtils.showInfo('Función de reportes en desarrollo');
}

function showCreateReposition() {
    UIUtils.showInfo('Función de reposiciones en desarrollo');
}

function showPendingSync() {
    UIUtils.showInfo('Función de sincronización en desarrollo');
}

function showSettings() {
    UIUtils.showInfo('Función de configuración en desarrollo');
}

function markAttendance(studentId, status) {
    UIUtils.showInfo('Función de marcar asistencia en desarrollo');
}

// ===========================================
// MANEJO DE ERRORES GLOBAL
// ===========================================

window.addEventListener('error', (event) => {
    console.error('Error global:', event.error);
    UIUtils.showError('Ha ocurrido un error inesperado');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Promise rechazada:', event.reason);
    UIUtils.showError('Error en operación asíncrona');
});

debugLog('main.js cargado correctamente');
