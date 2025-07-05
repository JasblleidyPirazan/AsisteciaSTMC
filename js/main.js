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
        
        // Configurar URL de Apps Script
        SheetsAPI.setWebAppUrl(window.APP_CONFIG.APPS_SCRIPT_URL);
        
        // Probar conexión con Apps Script
        const connectionTest = await SheetsAPI.testConnection();
        if (connectionTest.success) {
            debugLog('Conexión con Apps Script exitosa');
            UIUtils.showSuccess('Conectado con Google Sheets');
        } else {
            debugLog('Error de conexión:', connectionTest.error);
            UIUtils.showError('Error de conexión. Verifica la configuración.');
        }
        
        // Cargar datos iniciales
        await loadUserData();
        
        // Ir directamente al selector de fecha
        showDateSelector();
        
    } catch (error) {
        console.error('Error al inicializar aplicación:', error);
        showErrorScreen('Error al inicializar la aplicación. Verifica la configuración del backend.');
    }
}

// ===========================================
// PANTALLAS PRINCIPALES
// ===========================================

/**
 * Muestra el selector de fecha para reportar asistencia
 */
function showDateSelector() {
    debugLog('Mostrando selector de fecha');
    debugLog(`Grupos disponibles en AppState: ${window.AppState.grupos.length}`);
    
    const today = DateUtils.getCurrentDate();
    const currentDay = DateUtils.getCurrentDay();
    
    debugLog(`Fecha actual: ${today} (${currentDay})`);
    
    const app = document.getElementById('app');
    app.innerHTML = `
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
                            onchange="updateDateSelection()"
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
                        onclick="loadGroupsForSelectedDate()" 
                        class="btn btn-primary btn-lg w-full"
                        id="continue-btn"
                    >
                        📋 Ver Grupos de este Día
                    </button>
                </div>
            </div>

            <!-- Accesos rápidos a fechas comunes -->
            <div class="bg-white rounded-lg p-6 shadow-sm">
                <h3 class="text-lg font-semibold mb-4">Accesos Rápidos</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <button onclick="selectQuickDate('today')" class="btn btn-outline p-4 text-center">
                        <div class="text-lg mb-1">📅</div>
                        <div class="text-sm">Hoy</div>
                        <div class="text-xs text-gray-500">${capitalize(currentDay)}</div>
                    </button>
                    <button onclick="selectQuickDate('yesterday')" class="btn btn-outline p-4 text-center">
                        <div class="text-lg mb-1">⏮️</div>
                        <div class="text-sm">Ayer</div>
                    </button>
                    <button onclick="selectQuickDate('tomorrow')" class="btn btn-outline p-4 text-center">
                        <div class="text-lg mb-1">⏭️</div>
                        <div class="text-sm">Mañana</div>
                    </button>
                    <button onclick="showReports()" class="btn btn-secondary p-4 text-center">
                        <div class="text-lg mb-1">📊</div>
                        <div class="text-sm">Reportes</div>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Cargar información inicial del día después de que el DOM se actualice
    setTimeout(() => {
        debugLog('DOM actualizado, ejecutando updateDateSelection...');
        updateDateSelection();
    }, 100);
}

/**
 * Muestra el dashboard principal
 */
async function showDashboard() {
    debugLog('Mostrando dashboard');
    
    try {
        UIUtils.showLoading('app', 'Cargando dashboard...');
        
        // Usar fecha seleccionada o fecha actual
        const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
        const selectedDay = DateUtils.getDayFromDate(selectedDate);
        const formattedDate = DateUtils.formatDate(selectedDate);
        
        // Obtener grupos para el día seleccionado
        const dayGroups = DataUtils.getGroupsByDay(window.AppState.grupos, selectedDay);
        
        const app = document.getElementById('app');
        app.innerHTML = `
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
                        <button onclick="showDateSelector()" class="btn btn-outline">
                            📅 Cambiar Fecha
                        </button>
                        <button onclick="showReports()" class="btn btn-secondary">
                            📊 Reportes
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
                                <p class="text-sm text-gray-600">Grupos ${capitalize(selectedDay)}</p>
                                <p class="text-2xl font-bold text-gray-900">${dayGroups.length}</p>
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
                                <span class="text-2xl">⏳</span>
                            </div>
                            <div class="ml-4">
                                <p class="text-sm text-gray-600">Pendientes Sync</p>
                                <p class="text-2xl font-bold text-gray-900">${StorageUtils.getPendingAttendance().length}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Grupos del día seleccionado -->
                <div class="mb-8">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold text-gray-900">
                            Grupos - ${capitalize(selectedDay)} ${selectedDate === DateUtils.getCurrentDate() ? '(Hoy)' : ''}
                        </h2>
                        <button onclick="refreshData()" class="btn btn-outline">
                            🔄 Actualizar
                        </button>
                    </div>
                    
                    <div id="groups-container">
                        ${dayGroups.length > 0 ? `
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                ${dayGroups.map(group => UIUtils.createGroupCard(group)).join('')}
                            </div>
                        ` : `
                            <div class="text-center py-12 bg-white rounded-lg shadow-sm">
                                <span class="text-6xl mb-4 block">📅</span>
                                <h3 class="text-xl font-semibold text-gray-700 mb-2">No hay clases programadas</h3>
                                <p class="text-gray-500 mb-4">Los ${selectedDay} no hay grupos programados</p>
                                <button onclick="showDateSelector()" class="btn btn-primary">
                                    📅 Seleccionar Otra Fecha
                                </button>
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
// FUNCIONES DEL SELECTOR DE FECHA
// ===========================================

/**
 * Actualiza la información cuando cambia la fecha seleccionada
 */
function updateDateSelection() {
    const dateInput = document.getElementById('selected-date');
    const selectedDate = dateInput.value;
    
    if (!selectedDate) return;
    
    // Actualizar información del día
    const dayName = DateUtils.getDayFromDate(selectedDate);
    const formattedDate = DateUtils.formatDate(selectedDate);
    
    debugLog(`Fecha seleccionada: ${selectedDate} -> ${dayName}`);
    debugLog(`Grupos en AppState: ${window.AppState.grupos.length}`);
    
    document.getElementById('selected-day-name').textContent = capitalize(dayName);
    document.getElementById('selected-date-formatted').textContent = formattedDate;
    
    // Contar grupos para ese día
    updateGroupsCount(selectedDate);
}

/**
 * Actualiza el conteo de grupos para la fecha seleccionada
 */
function updateGroupsCount(selectedDate) {
    const dayName = DateUtils.getDayFromDate(selectedDate);
    
    debugLog(`\n🔍 DEBUGGING updateGroupsCount:`);
    debugLog(`📅 Fecha: ${selectedDate}`);
    debugLog(`📅 Día: ${dayName}`);
    debugLog(`📊 Total grupos disponibles: ${window.AppState.grupos.length}`);
    
    const groupsForDay = DataUtils.getGroupsByDay(window.AppState.grupos, dayName);
    
    debugLog(`Actualizando conteo para ${selectedDate} (${dayName}): ${groupsForDay.length} grupos`);
    
    const countElement = document.getElementById('groups-count');
    if (!countElement) {
        debugLog('ERROR: Elemento groups-count no encontrado');
        return;
    }
    
    if (groupsForDay.length > 0) {
        countElement.innerHTML = `
            <span class="text-green-600 font-medium">${groupsForDay.length} grupos programados</span>
        `;
        debugLog(`✅ Mostrando ${groupsForDay.length} grupos programados`);
    } else {
        // Mostrar nombre del día legible (con tildes) para el usuario
        const readableDayName = dayName === 'miercoles' ? 'miércoles' : 
                               dayName === 'sabado' ? 'sábados' : 
                               dayName + 's';
        
        countElement.innerHTML = `
            <span class="text-gray-500">No hay grupos programados para los ${readableDayName}</span>
        `;
        debugLog(`❌ No hay grupos para ${dayName}`);
    }
    
    // Habilitar/deshabilitar botón continuar
    const continueBtn = document.getElementById('continue-btn');
    if (continueBtn) {
        continueBtn.disabled = groupsForDay.length === 0;
        if (groupsForDay.length === 0) {
            continueBtn.classList.add('opacity-50');
            continueBtn.innerHTML = '❌ No hay grupos este día';
        } else {
            continueBtn.classList.remove('opacity-50');
            continueBtn.innerHTML = `📋 Ver ${groupsForDay.length} Grupos de este Día`;
        }
        debugLog(`Botón continuar: ${groupsForDay.length === 0 ? 'deshabilitado' : 'habilitado'}`);
    } else {
        debugLog('WARNING: Botón continue-btn no encontrado');
    }
}

/**
 * Selecciona fecha rápida (hoy, ayer, mañana)
 */
function selectQuickDate(type) {
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
    updateDateSelection();
}

/**
 * Carga los grupos para la fecha seleccionada y muestra el dashboard
 */
async function loadGroupsForSelectedDate() {
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
        
        // Mostrar dashboard con grupos de la fecha seleccionada
        showDashboard();
        
    } catch (error) {
        console.error('Error al cargar grupos:', error);
        UIUtils.showError('Error al cargar los grupos');
    }
}

// ===========================================
// CARGA DE DATOS
// ===========================================

/**
 * Carga los datos del usuario desde Apps Script
 */
async function loadUserData() {
    debugLog('Cargando datos del usuario...');
    
    try {
        // Cargar datos reales desde Apps Script
        await loadGroupsData();
        await loadStudentsData();
        
    } catch (error) {
        console.error('Error al cargar datos del usuario:', error);
        UIUtils.showWarning('Error al cargar algunos datos.');
        throw error;
    }
}

/**
 * Carga datos de grupos desde Apps Script
 */
async function loadGroupsData() {
    debugLog('Cargando datos de grupos...');
    
    try {
        // Cargar desde Apps Script
        const groupsData = await SheetsAPI.getGroups();
        
        debugLog(`Grupos recibidos desde API: ${groupsData ? groupsData.length : 0}`);
        if (groupsData && groupsData.length > 0) {
            debugLog('Primeros 3 grupos:', groupsData.slice(0, 3));
        }
        
        window.AppState.grupos = groupsData || [];
        
        // Guardar en cache para uso offline
        StorageUtils.save('cached_groups', groupsData);
        
        debugLog(`Grupos cargados en AppState: ${window.AppState.grupos.length}`);
        
    } catch (error) {
        console.error('Error al cargar grupos:', error);
        
        // Fallback: intentar usar datos en cache
        const cachedGroups = StorageUtils.get('cached_groups', []);
        if (cachedGroups.length > 0) {
            window.AppState.grupos = cachedGroups;
            debugLog(`Usando grupos en cache: ${cachedGroups.length}`);
            UIUtils.showWarning('Usando datos de grupos guardados localmente');
        } else {
            throw error;
        }
    }
}

/**
 * Carga datos de estudiantes desde Apps Script
 */
async function loadStudentsData() {
    debugLog('Cargando datos de estudiantes...');
    
    try {
        // Cargar desde Apps Script
        const studentsData = await SheetsAPI.getStudents();
        
        debugLog(`Estudiantes recibidos desde API: ${studentsData ? studentsData.length : 0}`);
        if (studentsData && studentsData.length > 0) {
            debugLog('Primeros 3 estudiantes:', studentsData.slice(0, 3));
        }
        
        window.AppState.estudiantes = studentsData || [];
        
        // Guardar en cache para uso offline
        StorageUtils.save('cached_students', studentsData);
        
        debugLog(`Estudiantes cargados en AppState: ${window.AppState.estudiantes.length}`);
        
    } catch (error) {
        console.error('Error al cargar estudiantes:', error);
        
        // Fallback: intentar usar datos en cache
        const cachedStudents = StorageUtils.get('cached_students', []);
        if (cachedStudents.length > 0) {
            window.AppState.estudiantes = cachedStudents;
            debugLog(`Usando estudiantes en cache: ${cachedStudents.length}`);
            UIUtils.showWarning('Usando datos de estudiantes guardados localmente');
        } else {
            throw error;
        }
    }
}

// ===========================================
// FUNCIONES DE NAVEGACIÓN
// ===========================================

/**
 * Selecciona un grupo y pregunta si la clase se realizó
 */
async function selectGroup(groupCode) {
    debugLog(`Seleccionando grupo: ${groupCode}`);
    
    try {
        // Encontrar el grupo
        const group = window.AppState.grupos.find(g => g.codigo === groupCode);
        if (!group) {
            throw new Error('Grupo no encontrado');
        }
        
        // Mostrar pregunta inicial: ¿Se realizó la clase?
        showClassStatusQuestion(group);
        
    } catch (error) {
        console.error('Error al seleccionar grupo:', error);
        UIUtils.showError('Error al cargar el grupo');
        showDashboard();
    }
}

/**
 * Muestra la pregunta sobre el estado de la clase
 */
function showClassStatusQuestion(group) {
    debugLog(`Preguntando estado de clase para grupo: ${group.codigo}`);
    
    const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
    const formattedDate = DateUtils.formatDate(selectedDate);
    
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="container">
            <!-- Header -->
            <header class="flex items-center justify-between mb-6 bg-white rounded-lg p-6 shadow-sm">
                <div class="flex items-center">
                    <button onclick="showDashboard()" class="btn btn-neutral mr-4">
                        ← Volver al Dashboard
                    </button>
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">Estado de la Clase</h1>
                        <p class="text-gray-600">${formattedDate}</p>
                    </div>
                </div>
            </header>

            <!-- Información del Grupo -->
            <div class="bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg p-6 mb-8 text-white">
                <div class="text-center">
                    <h2 class="text-2xl font-bold mb-2">${group.descriptor}</h2>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4">
                        <div class="flex items-center justify-center">
                            <span class="mr-2">👨‍🏫</span>
                            <span>Prof. ${group.profe}</span>
                        </div>
                        <div class="flex items-center justify-center">
                            <span class="mr-2">🕐</span>
                            <span>${group.hora}</span>
                        </div>
                        <div class="flex items-center justify-center">
                            <span class="mr-2">🎾</span>
                            <span>Cancha ${group.cancha}</span>
                        </div>
                        <div class="flex items-center justify-center">
                            <span class="mr-2">🏆</span>
                            <span>Nivel ${group.bola}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Pregunta Principal -->
            <div class="bg-white rounded-lg p-8 shadow-sm text-center">
                <div class="max-w-md mx-auto">
                    <div class="text-6xl mb-6">❓</div>
                    <h3 class="text-2xl font-bold text-gray-900 mb-4">
                        ¿Se realizó esta clase?
                    </h3>
                    <p class="text-gray-600 mb-8">
                        Indica si la clase se llevó a cabo normalmente o si fue cancelada
                    </p>
                    
                    <!-- Opciones -->
                    <div class="space-y-4">
                        <button 
                            onclick="classWasHeld('${group.codigo}')" 
                            class="w-full btn btn-primary btn-lg p-6 flex items-center justify-center"
                        >
                            <span class="text-3xl mr-4">✅</span>
                            <div class="text-left">
                                <div class="font-bold">Sí, se realizó</div>
                                <div class="text-sm opacity-90">Registrar asistencia de estudiantes</div>
                            </div>
                        </button>
                        
                        <button 
                            onclick="classWasCancelled('${group.codigo}')" 
                            class="w-full btn btn-danger btn-lg p-6 flex items-center justify-center"
                        >
                            <span class="text-3xl mr-4">❌</span>
                            <div class="text-left">
                                <div class="font-bold">No, fue cancelada</div>
                                <div class="text-sm opacity-90">Registrar motivo de cancelación</div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * La clase se realizó - proceder con registro de asistencia
 */
async function classWasHeld(groupCode) {
    debugLog(`Clase realizada para grupo: ${groupCode}`);
    
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
        
        // Limpiar asistencia actual e inicializar estado
        window.AppState.currentAttendance = {};
        window.AppState.additionalStudents = [];
        window.AppState.classStatus = 'realizada';
        
        showAttendanceForm(group, students);
        
    } catch (error) {
        console.error('Error al cargar estudiantes:', error);
        UIUtils.showError('Error al cargar estudiantes');
        showClassStatusQuestion(window.AppState.grupos.find(g => g.codigo === groupCode));
    }
}

/**
 * La clase fue cancelada - registrar cancelación
 */
async function classWasCancelled(groupCode) {
    debugLog(`Clase cancelada para grupo: ${groupCode}`);
    
    try {
        // Encontrar el grupo
        const group = window.AppState.grupos.find(g => g.codigo === groupCode);
        if (!group) {
            throw new Error('Grupo no encontrado');
        }
        
        showCancellationForm(group);
        
    } catch (error) {
        console.error('Error al mostrar formulario de cancelación:', error);
        UIUtils.showError('Error al procesar cancelación');
        showDashboard();
    }
}

/**
 * Muestra el formulario para registrar una cancelación
 */
function showCancellationForm(group) {
    debugLog(`Mostrando formulario de cancelación para grupo: ${group.codigo}`);
    
    const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
    const formattedDate = DateUtils.formatDate(selectedDate);
    
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="container">
            <!-- Header -->
            <header class="flex items-center justify-between mb-6 bg-white rounded-lg p-6 shadow-sm">
                <div class="flex items-center">
                    <button onclick="showClassStatusQuestion(${JSON.stringify(group).replace(/"/g, '&quot;')})" class="btn btn-neutral mr-4">
                        ← Volver
                    </button>
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">Registrar Cancelación</h1>
                        <p class="text-gray-600">${formattedDate}</p>
                    </div>
                </div>
            </header>

            <!-- Información del Grupo -->
            <div class="bg-gradient-to-r from-red-500 to-red-600 rounded-lg p-6 mb-6 text-white">
                <div class="text-center">
                    <h2 class="text-xl font-bold mb-2">${group.descriptor}</h2>
                    <p class="opacity-90">Clase cancelada</p>
                </div>
            </div>

            <!-- Formulario de Cancelación -->
            <div class="bg-white rounded-lg p-6 shadow-sm">
                <h3 class="text-lg font-semibold mb-4">Motivo de la Cancelación</h3>
                
                <div class="space-y-6">
                    <!-- Motivos predefinidos -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-3">
                            Seleccionar motivo:
                        </label>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <label class="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                                <input type="radio" name="cancellation-reason" value="Lluvia" class="mr-3">
                                <div>
                                    <div class="font-medium">🌧️ Lluvia</div>
                                    <div class="text-sm text-gray-500">Condiciones climáticas</div>
                                </div>
                            </label>
                            
                            <label class="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                                <input type="radio" name="cancellation-reason" value="Festivo" class="mr-3">
                                <div>
                                    <div class="font-medium">🎉 Festivo</div>
                                    <div class="text-sm text-gray-500">Día feriado</div>
                                </div>
                            </label>
                            
                            <label class="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                                <input type="radio" name="cancellation-reason" value="Mantenimiento" class="mr-3">
                                <div>
                                    <div class="font-medium">🔧 Mantenimiento</div>
                                    <div class="text-sm text-gray-500">Cancha en reparación</div>
                                </div>
                            </label>
                            
                            <label class="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                                <input type="radio" name="cancellation-reason" value="Enfermedad Profesor" class="mr-3">
                                <div>
                                    <div class="font-medium">🤒 Profesor enfermo</div>
                                    <div class="text-sm text-gray-500">Incapacidad médica</div>
                                </div>
                            </label>
                            
                            <label class="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                                <input type="radio" name="cancellation-reason" value="Emergencia" class="mr-3">
                                <div>
                                    <div class="font-medium">🚨 Emergencia</div>
                                    <div class="text-sm text-gray-500">Situación imprevista</div>
                                </div>
                            </label>
                            
                            <label class="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                                <input type="radio" name="cancellation-reason" value="Otro" class="mr-3">
                                <div>
                                    <div class="font-medium">📝 Otro motivo</div>
                                    <div class="text-sm text-gray-500">Especificar abajo</div>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <!-- Descripción adicional -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            Descripción adicional (opcional):
                        </label>
                        <textarea 
                            id="cancellation-description" 
                            class="w-full border border-gray-300 rounded-md px-3 py-2 h-24"
                            placeholder="Detalles adicionales sobre la cancelación..."></textarea>
                    </div>
                    
                    <!-- Información de estudiantes afectados -->
                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <h4 class="font-medium text-yellow-800 mb-2">ℹ️ Información importante</h4>
                        <p class="text-sm text-yellow-700">
                            Esta cancelación se aplicará automáticamente a todos los estudiantes del grupo. 
                            No contará como clase cumplida para ningún estudiante.
                        </p>
                    </div>
                </div>
                
                <!-- Botones -->
                <div class="mt-8 flex flex-col md:flex-row gap-4">
                    <button 
                        onclick="saveCancellation('${group.codigo}')" 
                        class="btn btn-danger flex-1 btn-lg"
                        id="save-cancellation-btn"
                    >
                        💾 Registrar Cancelación
                    </button>
                    <button 
                        onclick="showClassStatusQuestion(${JSON.stringify(group).replace(/"/g, '&quot;')})" 
                        class="btn btn-neutral"
                    >
                        ❌ Cancelar
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Guarda el registro de cancelación
 */
async function saveCancellation(groupCode) {
    debugLog('Guardando cancelación...');
    
    const selectedReason = document.querySelector('input[name="cancellation-reason"]:checked');
    if (!selectedReason) {
        UIUtils.showWarning('Por favor selecciona un motivo de cancelación');
        return;
    }
    
    const reason = selectedReason.value;
    const description = document.getElementById('cancellation-description').value.trim();
    const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
    
    const saveBtn = document.getElementById('save-cancellation-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<div class="spinner mr-3"></div>Guardando...';
    }
    
    try {
        // Obtener estudiantes del grupo para registrar la cancelación
        const students = DataUtils.getStudentsByGroup(window.AppState.estudiantes, groupCode);
        
        // Crear registros de asistencia como "Cancelada" para cada estudiante
        const attendanceData = students.map(student => {
            return DataUtils.formatAttendanceDataForDate(
                student.id,
                groupCode,
                'Cancelada',
                reason,
                description,
                selectedDate
            );
        });
        
        if (window.AppState.connectionStatus === 'online') {
            await SheetsAPI.saveAttendance(attendanceData);
            UIUtils.showSuccess(`Cancelación registrada para ${students.length} estudiantes`);
        } else {
            // Guardar offline
            attendanceData.forEach(record => {
                StorageUtils.savePendingAttendance({
                    data: record,
                    groupCode: groupCode,
                    date: selectedDate,
                    type: 'cancellation'
                });
            });
            UIUtils.showWarning(`Cancelación guardada offline (${students.length} estudiantes). Se sincronizará cuando haya conexión.`);
        }
        
        // Volver al dashboard después de un momento
        setTimeout(() => {
            showDashboard();
        }, 2000);
        
    } catch (error) {
        console.error('Error al guardar cancelación:', error);
        UIUtils.showError('Error al guardar la cancelación');
        
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '💾 Registrar Cancelación';
        }
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
// FORMULARIO DE ASISTENCIA
// ===========================================

/**
 * Muestra el formulario de registro de asistencia
 */
function showAttendanceForm(group, students) {
    debugLog(`Mostrando formulario de asistencia para grupo: ${group.codigo}`);
    
    const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
    const formattedDate = DateUtils.formatDate(selectedDate);
    const studentCount = students.length;
    
    // Inicializar lista de estudiantes adicionales
    if (!window.AppState.additionalStudents) {
        window.AppState.additionalStudents = [];
    }
    
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="container">
            <!-- Header -->
            <header class="flex items-center justify-between mb-6 bg-white rounded-lg p-6 shadow-sm">
                <div class="flex items-center">
                    <button onclick="showClassStatusQuestion(${JSON.stringify(group).replace(/"/g, '&quot;')})" class="btn btn-neutral mr-4">
                        ← Volver
                    </button>
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">Registro de Asistencia</h1>
                        <p class="text-gray-600">${formattedDate}</p>
                    </div>
                </div>
                <div class="connection-status status-indicator ${window.AppState.connectionStatus}">
                    ${window.AppState.connectionStatus === 'online' ? 'En línea' : 'Sin conexión'}
                </div>
            </header>

            <!-- Información del Grupo -->
            <div class="bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg p-6 mb-6 text-white">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-xl font-bold mb-2">${group.descriptor}</h2>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div class="flex items-center">
                                <span class="mr-2">👨‍🏫</span>
                                <span>Prof. ${group.profe}</span>
                            </div>
                            <div class="flex items-center">
                                <span class="mr-2">🕐</span>
                                <span>${group.hora}</span>
                            </div>
                            <div class="flex items-center">
                                <span class="mr-2">🎾</span>
                                <span>Cancha ${group.cancha}</span>
                            </div>
                            <div class="flex items-center">
                                <span class="mr-2">🏆</span>
                                <span>Nivel ${group.bola}</span>
                            </div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-3xl font-bold" id="total-students-count">${studentCount}</div>
                        <div class="text-sm opacity-90">Estudiantes</div>
                    </div>
                </div>
            </div>

            <!-- Controles de Asistencia Masiva -->
            <div class="bg-white rounded-lg p-6 mb-6 shadow-sm">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-semibold">Controles Rápidos</h3>
                    <button onclick="showAddStudentModal()" class="btn btn-secondary">
                        ➕ Agregar Estudiante de Otro Grupo
                    </button>
                </div>
                <div class="flex flex-wrap gap-3">
                    <button onclick="markAllAttendance('Presente')" class="btn btn-primary">
                        ✅ Marcar Todos Presentes
                    </button>
                    <button onclick="markAllAttendance('Ausente')" class="btn btn-danger">
                        ❌ Marcar Todos Ausentes
                    </button>
                    <button onclick="clearAllAttendance()" class="btn btn-neutral">
                        🔄 Limpiar Todo
                    </button>
                    <button onclick="showAttendanceStats()" class="btn btn-outline">
                        📊 Ver Estadísticas
                    </button>
                </div>
            </div>

            <!-- Lista de Estudiantes -->
            <div class="bg-white rounded-lg shadow-sm mb-6">
                <div class="p-6 border-b border-gray-200">
                    <div class="flex justify-between items-center">
                        <h3 class="text-lg font-semibold">Lista de Estudiantes</h3>
                        <div id="attendance-summary" class="text-sm text-gray-600">
                            Sin registros
                        </div>
                    </div>
                </div>
                
                <!-- Estudiantes del grupo -->
                <div class="divide-y divide-gray-200">
                    <div class="p-4 bg-gray-50">
                        <h4 class="font-medium text-gray-700 text-sm">Estudiantes del Grupo Principal</h4>
                    </div>
                    <div id="main-students-list">
                        ${students.map(student => UIUtils.createStudentItem(student)).join('')}
                    </div>
                </div>
                
                <!-- Estudiantes adicionales -->
                <div id="additional-students-section" class="hidden">
                    <div class="divide-y divide-gray-200">
                        <div class="p-4 bg-blue-50">
                            <h4 class="font-medium text-blue-700 text-sm">Estudiantes de Otros Grupos</h4>
                        </div>
                        <div id="additional-students-list">
                            <!-- Se llenan dinámicamente -->
                        </div>
                    </div>
                </div>
            </div>

            <!-- Acciones Finales -->
            <div class="bg-white rounded-lg p-6 shadow-sm">
                <div class="flex flex-col md:flex-row gap-4">
                    <button 
                        onclick="saveAttendanceData('${group.codigo}')" 
                        class="btn btn-primary flex-1 btn-lg"
                        id="save-attendance-btn"
                    >
                        💾 Guardar Asistencia
                    </button>
                    <button onclick="previewAttendance('${group.codigo}')" class="btn btn-secondary">
                        👁️ Vista Previa
                    </button>
                    <button onclick="exportAttendance('${group.codigo}')" class="btn btn-outline">
                        📄 Exportar
                    </button>
                </div>
                
                <div class="mt-4 text-sm text-gray-500 text-center">
                    <p>💡 Los datos se guardan automáticamente en modo offline si no hay conexión</p>
                </div>
            </div>
        </div>

        <!-- Modal para Justificaciones -->
        <div id="justification-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
            <div class="flex items-center justify-center min-h-screen p-4">
                <div class="bg-white rounded-lg p-6 max-w-md w-full">
                    <h3 class="text-lg font-semibold mb-4">Agregar Justificación</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">
                                Estudiante: <span id="justification-student-name" class="font-semibold"></span>
                            </label>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Tipo de Justificación</label>
                            <select id="justification-type" class="w-full border border-gray-300 rounded-md px-3 py-2">
                                <option value="">Seleccionar...</option>
                                <option value="Médica">Médica</option>
                                <option value="Personal">Personal</option>
                                <option value="Familiar">Familiar</option>
                                <option value="Académica">Académica</option>
                                <option value="Otra">Otra</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Descripción (opcional)</label>
                            <textarea 
                                id="justification-description" 
                                class="w-full border border-gray-300 rounded-md px-3 py-2 h-20"
                                placeholder="Detalles adicionales..."></textarea>
                        </div>
                    </div>
                    <div class="mt-6 flex gap-3">
                        <button onclick="saveJustification()" class="btn btn-primary flex-1">
                            ✅ Guardar
                        </button>
                        <button onclick="closeJustificationModal()" class="btn btn-neutral">
                            ❌ Cancelar
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Modal para Agregar Estudiantes -->
        <div id="add-student-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
            <div class="flex items-center justify-center min-h-screen p-4">
                <div class="bg-white rounded-lg p-6 max-w-lg w-full max-h-90vh overflow-y-auto">
                    <h3 class="text-lg font-semibold mb-4">Agregar Estudiante de Otro Grupo</h3>
                    
                    <!-- Buscador -->
                    <div class="mb-4">
                        <input 
                            type="text" 
                            id="student-search" 
                            placeholder="Buscar por nombre o ID..."
                            class="w-full border border-gray-300 rounded-md px-3 py-2"
                            onkeyup="filterAvailableStudents()"
                        />
                    </div>
                    
                    <!-- Lista de estudiantes disponibles -->
                    <div class="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                        <div id="available-students-list">
                            <!-- Se llena dinámicamente -->
                        </div>
                    </div>
                    
                    <div class="mt-6 flex gap-3">
                        <button onclick="closeAddStudentModal()" class="btn btn-neutral flex-1">
                            ❌ Cerrar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Actualizar resumen inicial
    updateAttendanceSummary();
    updateTotalStudentsCount();
}

/**
 * Marca la asistencia de un estudiante individual
 */
function markAttendance(studentId, status) {
    debugLog(`Marcando asistencia: ${studentId} = ${status}`);
    
    // Buscar información del estudiante
    const student = window.AppState.estudiantes.find(s => s.id === studentId);
    if (!student) {
        UIUtils.showError('Estudiante no encontrado');
        return;
    }
    
    // Si es justificada, abrir modal para detalles
    if (status === 'Justificada') {
        openJustificationModal(studentId, student.nombre);
        return;
    }
    
    // Guardar asistencia
    window.AppState.currentAttendance[studentId] = {
        studentId: studentId,
        status: status,
        justification: '',
        description: '',
        timestamp: DateUtils.getCurrentTimestamp()
    };
    
    // Actualizar UI
    updateStudentItemUI(studentId, status);
    updateAttendanceSummary();
    
    // Feedback visual
    UIUtils.showSuccess(`${student.nombre} marcado como ${status.toLowerCase()}`);
}

/**
 * Marca asistencia masiva (incluye estudiantes adicionales)
 */
function markAllAttendance(status) {
    debugLog(`Marcando todos como: ${status}`);
    
    // Obtener estudiantes del grupo principal
    const currentGroupCode = getCurrentGroupCode();
    const mainStudents = DataUtils.getStudentsByGroup(window.AppState.estudiantes, currentGroupCode);
    
    // Obtener estudiantes adicionales
    const additionalStudents = window.AppState.additionalStudents || [];
    
    // Combinar ambas listas
    const allStudents = [...mainStudents, ...additionalStudents];
    
    allStudents.forEach(student => {
        if (status !== 'Justificada') {
            window.AppState.currentAttendance[student.id] = {
                studentId: student.id,
                status: status,
                justification: '',
                description: '',
                timestamp: DateUtils.getCurrentTimestamp()
            };
            updateStudentItemUI(student.id, status);
        }
    });
    
    updateAttendanceSummary();
    UIUtils.showSuccess(`${allStudents.length} estudiantes marcados como ${status.toLowerCase()}`);
}

/**
 * Limpia toda la asistencia (incluye estudiantes adicionales)
 */
function clearAllAttendance() {
    debugLog('Limpiando toda la asistencia');
    
    if (Object.keys(window.AppState.currentAttendance).length === 0) {
        UIUtils.showInfo('No hay asistencia para limpiar');
        return;
    }
    
    if (confirm('¿Estás seguro de que quieres limpiar toda la asistencia registrada?')) {
        window.AppState.currentAttendance = {};
        
        // Actualizar UI de todos los estudiantes (principales y adicionales)
        const studentItems = document.querySelectorAll('.student-item');
        studentItems.forEach(item => {
            item.className = 'student-item';
            const buttons = item.querySelectorAll('button:not([onclick*="removeAdditionalStudent"])');
            buttons.forEach(btn => {
                btn.classList.remove('btn-primary', 'btn-danger', 'btn-secondary');
                btn.classList.add('btn-outline');
            });
        });
        
        updateAttendanceSummary();
        UIUtils.showSuccess('Asistencia limpiada');
    }
}

/**
 * Muestra el modal para agregar estudiantes de otros grupos
 */
function showAddStudentModal() {
    debugLog('Mostrando modal para agregar estudiantes');
    
    const modal = document.getElementById('add-student-modal');
    if (modal) {
        // Cargar lista de estudiantes disponibles
        loadAvailableStudents();
        
        modal.classList.remove('hidden');
        document.body.classList.add('no-scroll');
        
        // Enfocar el buscador
        setTimeout(() => {
            const searchInput = document.getElementById('student-search');
            if (searchInput) searchInput.focus();
        }, 100);
    }
}

/**
 * Cierra el modal de agregar estudiantes
 */
function closeAddStudentModal() {
    const modal = document.getElementById('add-student-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('no-scroll');
        
        // Limpiar búsqueda
        const searchInput = document.getElementById('student-search');
        if (searchInput) searchInput.value = '';
    }
}

/**
 * Carga la lista de estudiantes disponibles (que no están ya en la clase)
 */
function loadAvailableStudents() {
    const currentGroupCode = getCurrentGroupCode();
    
    // Obtener estudiantes del grupo principal
    const mainGroupStudents = DataUtils.getStudentsByGroup(window.AppState.estudiantes, currentGroupCode);
    const mainGroupStudentIds = mainGroupStudents.map(s => s.id);
    
    // Obtener estudiantes adicionales ya agregados
    const additionalStudentIds = (window.AppState.additionalStudents || []).map(s => s.id);
    
    // Filtrar estudiantes disponibles (activos, no en grupo principal, no ya agregados)
    const availableStudents = window.AppState.estudiantes.filter(student => {
        return (student.activo === true || student.activo === 'TRUE') &&
               !mainGroupStudentIds.includes(student.id) &&
               !additionalStudentIds.includes(student.id);
    });
    
    displayAvailableStudents(availableStudents);
}

/**
 * Muestra la lista de estudiantes disponibles
 */
function displayAvailableStudents(students) {
    const container = document.getElementById('available-students-list');
    if (!container) return;
    
    if (students.length === 0) {
        container.innerHTML = `
            <div class="p-4 text-center text-gray-500">
                <p>No hay estudiantes disponibles para agregar</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = students.map(student => `
        <div class="p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer" 
             onclick="addStudentToClass('${student.id}')">
            <div class="flex justify-between items-center">
                <div>
                    <h4 class="font-medium">${student.nombre}</h4>
                    <p class="text-sm text-gray-500">ID: ${student.id}</p>
                    <p class="text-sm text-gray-500">Grupo: ${student.grupo_principal}</p>
                    ${student.grupo_secundario ? `<p class="text-xs text-gray-400">También en: ${student.grupo_secundario}</p>` : ''}
                </div>
                <button class="btn btn-sm btn-primary">
                    ➕ Agregar
                </button>
            </div>
        </div>
    `).join('');
}

/**
 * Filtra estudiantes disponibles según búsqueda
 */
function filterAvailableStudents() {
    const searchTerm = document.getElementById('student-search').value.toLowerCase();
    const currentGroupCode = getCurrentGroupCode();
    
    // Obtener estudiantes del grupo principal
    const mainGroupStudents = DataUtils.getStudentsByGroup(window.AppState.estudiantes, currentGroupCode);
    const mainGroupStudentIds = mainGroupStudents.map(s => s.id);
    
    // Obtener estudiantes adicionales ya agregados
    const additionalStudentIds = (window.AppState.additionalStudents || []).map(s => s.id);
    
    // Filtrar estudiantes disponibles
    const availableStudents = window.AppState.estudiantes.filter(student => {
        const isActive = student.activo === true || student.activo === 'TRUE';
        const notInMainGroup = !mainGroupStudentIds.includes(student.id);
        const notAlreadyAdded = !additionalStudentIds.includes(student.id);
        const matchesSearch = !searchTerm || 
                            student.nombre.toLowerCase().includes(searchTerm) ||
                            student.id.toLowerCase().includes(searchTerm);
        
        return isActive && notInMainGroup && notAlreadyAdded && matchesSearch;
    });
    
    displayAvailableStudents(availableStudents);
}

/**
 * Agrega un estudiante a la clase
 */
function addStudentToClass(studentId) {
    debugLog(`Agregando estudiante ${studentId} a la clase`);
    
    const student = window.AppState.estudiantes.find(s => s.id === studentId);
    if (!student) {
        UIUtils.showError('Estudiante no encontrado');
        return;
    }
    
    // Agregar a la lista de estudiantes adicionales
    if (!window.AppState.additionalStudents) {
        window.AppState.additionalStudents = [];
    }
    
    window.AppState.additionalStudents.push(student);
    
    // Actualizar UI
    updateAdditionalStudentsList();
    updateTotalStudentsCount();
    
    // Cerrar modal
    closeAddStudentModal();
    
    UIUtils.showSuccess(`${student.nombre} agregado a la clase`);
}

/**
 * Actualiza la lista de estudiantes adicionales en la UI
 */
function updateAdditionalStudentsList() {
    const section = document.getElementById('additional-students-section');
    const container = document.getElementById('additional-students-list');
    
    if (!section || !container) return;
    
    const additionalStudents = window.AppState.additionalStudents || [];
    
    if (additionalStudents.length === 0) {
        section.classList.add('hidden');
        return;
    }
    
    section.classList.remove('hidden');
    container.innerHTML = additionalStudents.map(student => {
        const studentItemHtml = UIUtils.createStudentItem(student);
        // Agregar botón para remover estudiante adicional
        return studentItemHtml.replace(
            '</div>',
            `<button onclick="removeAdditionalStudent('${student.id}')" 
                     class="btn btn-sm btn-outline text-red-600 border-red-300 hover:bg-red-50 ml-2">
                🗑️ Remover
            </button></div>`
        );
    }).join('');
}

/**
 * Remueve un estudiante adicional
 */
function removeAdditionalStudent(studentId) {
    debugLog(`Removiendo estudiante adicional: ${studentId}`);
    
    const student = window.AppState.estudiantes.find(s => s.id === studentId);
    
    if (confirm(`¿Remover a ${student?.nombre || studentId} de esta clase?`)) {
        // Remover de lista de estudiantes adicionales
        window.AppState.additionalStudents = (window.AppState.additionalStudents || [])
            .filter(s => s.id !== studentId);
        
        // Remover asistencia si ya estaba marcada
        if (window.AppState.currentAttendance[studentId]) {
            delete window.AppState.currentAttendance[studentId];
        }
        
        // Actualizar UI
        updateAdditionalStudentsList();
        updateTotalStudentsCount();
        updateAttendanceSummary();
        
        UIUtils.showSuccess(`${student?.nombre || studentId} removido de la clase`);
    }
}

/**
 * Actualiza el contador total de estudiantes
 */
function updateTotalStudentsCount() {
    const counter = document.getElementById('total-students-count');
    if (!counter) return;
    
    const currentGroupCode = getCurrentGroupCode();
    const mainGroupStudents = DataUtils.getStudentsByGroup(window.AppState.estudiantes, currentGroupCode);
    const additionalStudents = window.AppState.additionalStudents || [];
    
    const totalCount = mainGroupStudents.length + additionalStudents.length;
    counter.textContent = totalCount;
}

/**
 * Obtiene el código del grupo actual desde la UI
 */
function getCurrentGroupCode() {
    // Buscar en el título del grupo
    const groupTitle = document.querySelector('h2');
    if (groupTitle) {
        const titleText = groupTitle.textContent;
        // Extraer código del grupo del formato "Descriptor del grupo"
        // Por ahora, buscaremos en los grupos cargados
        const currentGroup = window.AppState.grupos.find(g => 
            titleText.includes(g.descriptor) || titleText.includes(g.codigo)
        );
        return currentGroup ? currentGroup.codigo : '';
    }
    return '';
}

/**
 * Abre modal de justificación
 */
function openJustificationModal(studentId, studentName) {
    const modal = document.getElementById('justification-modal');
    const nameSpan = document.getElementById('justification-student-name');
    
    if (modal && nameSpan) {
        nameSpan.textContent = studentName;
        modal.dataset.studentId = studentId;
        modal.classList.remove('hidden');
        document.body.classList.add('no-scroll');
    }
}

/**
 * Cierra modal de justificación
 */
function closeJustificationModal() {
    const modal = document.getElementById('justification-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('no-scroll');
        
        // Limpiar campos
        document.getElementById('justification-type').value = '';
        document.getElementById('justification-description').value = '';
    }
}

/**
 * Guarda justificación
 */
function saveJustification() {
    const modal = document.getElementById('justification-modal');
    const studentId = modal?.dataset.studentId;
    const type = document.getElementById('justification-type').value;
    const description = document.getElementById('justification-description').value;
    
    if (!studentId) {
        UIUtils.showError('Error: ID de estudiante no encontrado');
        return;
    }
    
    if (!type) {
        UIUtils.showWarning('Por favor selecciona un tipo de justificación');
        return;
    }
    
    // Guardar asistencia justificada
    window.AppState.currentAttendance[studentId] = {
        studentId: studentId,
        status: 'Justificada',
        justification: type,
        description: description.trim(),
        timestamp: DateUtils.getCurrentTimestamp()
    };
    
    // Actualizar UI
    updateStudentItemUI(studentId, 'Justificada');
    updateAttendanceSummary();
    closeJustificationModal();
    
    const student = window.AppState.estudiantes.find(s => s.id === studentId);
    UIUtils.showSuccess(`Justificación guardada para ${student?.nombre}`);
}

/**
 * Actualiza la UI de un estudiante específico
 */
function updateStudentItemUI(studentId, status) {
    const studentItem = document.querySelector(`[data-student-id="${studentId}"]`);
    if (!studentItem) return;
    
    // Limpiar clases de estado previas
    studentItem.classList.remove('status-presente', 'status-ausente', 'status-justificada');
    
    // Agregar nueva clase de estado
    studentItem.classList.add(`status-${status.toLowerCase()}`);
    
    // Actualizar botones
    const buttons = studentItem.querySelectorAll('button:not([onclick*="removeAdditionalStudent"])');
    buttons.forEach(btn => {
        btn.classList.remove('btn-primary', 'btn-danger', 'btn-secondary');
        btn.classList.add('btn-outline');
    });
    
    // Resaltar botón activo
    const activeButton = studentItem.querySelector(`button[onclick*="'${status}'"]`);
    if (activeButton) {
        activeButton.classList.remove('btn-outline');
        switch (status) {
            case 'Presente':
                activeButton.classList.add('btn-primary');
                break;
            case 'Ausente':
                activeButton.classList.add('btn-danger');
                break;
            case 'Justificada':
                activeButton.classList.add('btn-secondary');
                break;
        }
    }
}

/**
 * Actualiza el resumen de asistencia
 */
function updateAttendanceSummary() {
    const summary = document.getElementById('attendance-summary');
    if (!summary) return;
    
    const attendance = window.AppState.currentAttendance;
    const total = Object.keys(attendance).length;
    
    if (total === 0) {
        summary.textContent = 'Sin registros';
        return;
    }
    
    const presente = Object.values(attendance).filter(a => a.status === 'Presente').length;
    const ausente = Object.values(attendance).filter(a => a.status === 'Ausente').length;
    const justificada = Object.values(attendance).filter(a => a.status === 'Justificada').length;
    
    summary.innerHTML = `
        <span class="font-medium">${total} registrados:</span>
        <span class="text-green-600">${presente} presentes</span> •
        <span class="text-red-600">${ausente} ausentes</span> •
        <span class="text-yellow-600">${justificada} justificadas</span>
    `;
    
    // Actualizar botón de guardar
    const saveBtn = document.getElementById('save-attendance-btn');
    if (saveBtn && total > 0) {
        saveBtn.classList.remove('opacity-50');
        saveBtn.disabled = false;
    }
}

/**
 * Guarda los datos de asistencia con la fecha seleccionada (incluye estudiantes adicionales)
 */
async function saveAttendanceData(groupCode) {
    debugLog('Guardando datos de asistencia...');
    
    const attendance = window.AppState.currentAttendance;
    const attendanceCount = Object.keys(attendance).length;
    
    if (attendanceCount === 0) {
        UIUtils.showWarning('No hay asistencia registrada para guardar');
        return;
    }
    
    const saveBtn = document.getElementById('save-attendance-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<div class="spinner mr-3"></div>Guardando...';
    }
    
    try {
        // Usar la fecha seleccionada en lugar de la fecha actual
        const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
        
        // Convertir asistencia a formato para backend
        const attendanceData = Object.values(attendance).map(record => {
            return DataUtils.formatAttendanceDataForDate(
                record.studentId,
                groupCode,
                record.status,
                record.justification,
                record.description,
                selectedDate // Usar fecha seleccionada
            );
        });
        
        // Crear registro de clase realizada
        const classData = {
            id: DataUtils.generateId('CLS'),
            fecha: selectedDate,
            grupo_codigo: groupCode,
            estado: 'Realizada',
            motivo_cancelacion: '',
            descripcion: `Clase realizada con ${attendanceCount} estudiantes registrados`,
            creado_por: window.AppState.user?.email || 'usuario',
            timestamp: DateUtils.getCurrentTimestamp()
        };
        
        // Información adicional para logs
        const mainGroupStudents = DataUtils.getStudentsByGroup(window.AppState.estudiantes, groupCode);
        const additionalStudents = window.AppState.additionalStudents || [];
        const totalStudents = mainGroupStudents.length + additionalStudents.length;
        
        debugLog(`Guardando asistencia para ${totalStudents} estudiantes (${mainGroupStudents.length} principales + ${additionalStudents.length} adicionales)`);
        
        // Guardar en Google Sheets via Apps Script
        if (window.AppState.connectionStatus === 'online') {
            await SheetsAPI.saveAttendance(attendanceData);
            
            // TODO: También guardar el registro de clase realizada si el backend lo soporta
            // await SheetsAPI.saveScheduledClass(classData);
            
            UIUtils.showSuccess(`Asistencia guardada en Google Sheets (${attendanceCount} registros)`);
        } else {
            // Guardar offline
            attendanceData.forEach(record => {
                StorageUtils.savePendingAttendance({
                    data: record,
                    groupCode: groupCode,
                    date: selectedDate,
                    type: 'attendance'
                });
            });
            
            // También guardar registro de clase offline
            StorageUtils.savePendingAttendance({
                data: classData,
                groupCode: groupCode,
                date: selectedDate,
                type: 'class_realized'
            });
            
            UIUtils.showWarning(`Asistencia guardada offline (${attendanceCount} registros). Se sincronizará cuando haya conexión.`);
        }
        
        // Limpiar estado actual
        window.AppState.currentAttendance = {};
        window.AppState.additionalStudents = [];
        window.AppState.classStatus = null;
        
        // Mostrar resumen final
        setTimeout(() => {
            const modal = document.getElementById('notification-modal');
            const content = document.getElementById('notification-content');
            
            if (modal && content) {
                content.innerHTML = `
                    <div class="text-center">
                        <div class="text-6xl mb-4">✅</div>
                        <h3 class="text-xl font-bold mb-4">Asistencia Guardada</h3>
                        <div class="space-y-2 text-left">
                            <p><strong>Grupo:</strong> ${groupCode}</p>
                            <p><strong>Fecha:</strong> ${DateUtils.formatDate(selectedDate)}</p>
                            <p><strong>Registros guardados:</strong> ${attendanceCount}</p>
                            <p><strong>Estudiantes principales:</strong> ${mainGroupStudents.length}</p>
                            ${additionalStudents.length > 0 ? `<p><strong>Estudiantes adicionales:</strong> ${additionalStudents.length}</p>` : ''}
                        </div>
                        <div class="mt-6">
                            <button onclick="closeNotification(); showDashboard();" class="btn btn-primary">
                                ✅ Continuar
                            </button>
                        </div>
                    </div>
                `;
                modal.classList.remove('hidden');
            } else {
                // Fallback si no hay modal
                setTimeout(() => {
                    showDashboard();
                }, 1000);
            }
        }, 1000);
        
    } catch (error) {
        console.error('Error al guardar asistencia:', error);
        
        // En caso de error, guardar offline como backup
        const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
        const attendanceData = Object.values(attendance).map(record => {
            return DataUtils.formatAttendanceDataForDate(
                record.studentId,
                groupCode,
                record.status,
                record.justification,
                record.description,
                selectedDate
            );
        });
        
        attendanceData.forEach(record => {
            StorageUtils.savePendingAttendance({
                data: record,
                groupCode: groupCode,
                date: selectedDate,
                type: 'attendance_backup'
            });
        });
        
        UIUtils.showError(`Error al guardar online. Guardado offline (${attendanceCount} registros)`);
        
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '💾 Guardar Asistencia';
        }
    }
}

/**
 * Muestra vista previa de la asistencia (incluye estudiantes adicionales)
 */
function previewAttendance(groupCode) {
    const attendance = window.AppState.currentAttendance;
    const count = Object.keys(attendance).length;
    
    if (count === 0) {
        UIUtils.showInfo('No hay asistencia para previsualizar');
        return;
    }
    
    const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
    const mainGroupStudents = DataUtils.getStudentsByGroup(window.AppState.estudiantes, groupCode);
    const additionalStudents = window.AppState.additionalStudents || [];
    
    let preview = `<h3 class="font-bold mb-4">Vista Previa de Asistencia</h3>`;
    preview += `<p class="mb-2"><strong>Grupo:</strong> ${groupCode}</p>`;
    preview += `<p class="mb-2"><strong>Fecha:</strong> ${DateUtils.formatDate(selectedDate)}</p>`;
    preview += `<p class="mb-4"><strong>Total registros:</strong> ${count}</p>`;
    
    // Estadísticas
    const stats = {
        presente: Object.values(attendance).filter(r => r.status === 'Presente').length,
        ausente: Object.values(attendance).filter(r => r.status === 'Ausente').length,
        justificada: Object.values(attendance).filter(r => r.status === 'Justificada').length
    };
    
    preview += `
        <div class="grid grid-cols-3 gap-4 mb-6 text-center">
            <div class="bg-green-100 p-3 rounded">
                <div class="font-bold text-green-800">${stats.presente}</div>
                <div class="text-sm text-green-600">Presentes</div>
            </div>
            <div class="bg-red-100 p-3 rounded">
                <div class="font-bold text-red-800">${stats.ausente}</div>
                <div class="text-sm text-red-600">Ausentes</div>
            </div>
            <div class="bg-yellow-100 p-3 rounded">
                <div class="font-bold text-yellow-800">${stats.justificada}</div>
                <div class="text-sm text-yellow-600">Justificadas</div>
            </div>
        </div>
    `;
    
    // Estudiantes del grupo principal
    const mainStudentsWithAttendance = Object.values(attendance).filter(record => 
        mainGroupStudents.some(s => s.id === record.studentId)
    );
    
    if (mainStudentsWithAttendance.length > 0) {
        preview += `<h4 class="font-semibold mb-3 text-gray-700">Estudiantes del Grupo Principal (${mainStudentsWithAttendance.length})</h4>`;
        preview += `<div class="space-y-2 mb-4">`;
        
        mainStudentsWithAttendance.forEach(record => {
            const student = window.AppState.estudiantes.find(s => s.id === record.studentId);
            const statusIcon = record.status === 'Presente' ? '✅' : record.status === 'Ausente' ? '❌' : '📝';
            
            preview += `
                <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span>${student?.nombre || record.studentId}</span>
                    <span>${statusIcon} ${record.status}</span>
                </div>
            `;
            
            if (record.justification) {
                preview += `<div class="text-sm text-gray-600 ml-4">Justificación: ${record.justification}</div>`;
            }
        });
        
        preview += `</div>`;
    }
    
    // Estudiantes adicionales
    const additionalStudentsWithAttendance = Object.values(attendance).filter(record => 
        additionalStudents.some(s => s.id === record.studentId)
    );
    
    if (additionalStudentsWithAttendance.length > 0) {
        preview += `<h4 class="font-semibold mb-3 text-blue-700">Estudiantes de Otros Grupos (${additionalStudentsWithAttendance.length})</h4>`;
        preview += `<div class="space-y-2 mb-4">`;
        
        additionalStudentsWithAttendance.forEach(record => {
            const student = window.AppState.estudiantes.find(s => s.id === record.studentId);
            const statusIcon = record.status === 'Presente' ? '✅' : record.status === 'Ausente' ? '❌' : '📝';
            
            preview += `
                <div class="flex justify-between items-center p-2 bg-blue-50 rounded border border-blue-200">
                    <div>
                        <span>${student?.nombre || record.studentId}</span>
                        <div class="text-xs text-blue-600">Grupo original: ${student?.grupo_principal}</div>
                    </div>
                    <span>${statusIcon} ${record.status}</span>
                </div>
            `;
            
            if (record.justification) {
                preview += `<div class="text-sm text-blue-600 ml-4">Justificación: ${record.justification}</div>`;
            }
        });
        
        preview += `</div>`;
    }
    
    const modal = document.getElementById('notification-modal');
    const content = document.getElementById('notification-content');
    
    if (modal && content) {
        content.innerHTML = preview;
        modal.classList.remove('hidden');
        document.body.classList.add('no-scroll');
    }
}

// ===========================================
// FUNCIONES PLACEHOLDER PARA DESARROLLO
// ===========================================

function exportAttendance(groupCode) {
    UIUtils.showInfo('Función de exportación en desarrollo');
}

function showAttendanceStats() {
    UIUtils.showInfo('Función de estadísticas en desarrollo');
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
    const pending = StorageUtils.getPendingAttendance();
    if (pending.length === 0) {
        UIUtils.showInfo('No hay datos pendientes de sincronización');
    } else {
        UIUtils.showInfo(`Hay ${pending.length} registros pendientes de sincronización`);
    }
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
