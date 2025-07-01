
/**
 * SISTEMA DE ASISTENCIA TENIS - AUTENTICACIÓN GOOGLE
 * ===================================================
 * Manejo de autenticación con Google OAuth 2.0
 */

// ===========================================
// CONFIGURACIÓN DE GOOGLE AUTH
// ===========================================

const GoogleAuth = {
    // Configuración
    clientId: null,
    apiKey: null,
    discoveryDoc: 'https://sheets.googleapis.com/$discovery/rest?version=v4',
    scopes: 'https://www.googleapis.com/auth/spreadsheets',
    
    // Estado
    isInitialized: false,
    authInstance: null,
    currentUser: null,

    /**
     * Inicializa Google Auth y APIs
     */
    async init() {
        debugLog('Inicializando Google Auth...');
        
        try {
            // Obtener configuración
            this.clientId = window.APP_CONFIG?.GOOGLE_CLIENT_ID;
            this.apiKey = window.APP_CONFIG?.GOOGLE_API_KEY;
            
            if (!this.clientId || !this.apiKey) {
                console.warn('Configuración de Google incompleta, usando modo demo');
                return false;
            }
            
            // Inicializar gapi
            await this.loadGapi();
            await this.initializeGapi();
            
            // Verificar si ya está autenticado
            if (this.authInstance && this.authInstance.isSignedIn.get()) {
                this.currentUser = this.authInstance.currentUser.get();
                this.updateAppState();
                debugLog('Usuario ya autenticado:', this.getCurrentUserEmail());
                return true;
            }
            
            this.isInitialized = true;
            debugLog('Google Auth inicializado correctamente');
            return true;
            
        } catch (error) {
            console.error('Error al inicializar Google Auth:', error);
            return false;
        }
    },
    
    /**
     * Carga la biblioteca gapi
     */
    async loadGapi() {
        return new Promise((resolve, reject) => {
            if (typeof gapi !== 'undefined') {
                resolve();
                return;
            }
            
            // Si gapi no está disponible, usar modo demo
            console.warn('Google API no disponible');
            reject(new Error('Google API no disponible'));
        });
    },
    
    /**
     * Inicializa gapi con nuestras configuraciones
     */
    async initializeGapi() {
        debugLog('Inicializando gapi...');
        
        return new Promise((resolve, reject) => {
            gapi.load('auth2:client', {
                callback: async () => {
                    try {
                        // Inicializar cliente
                        await gapi.client.init({
                            apiKey: this.apiKey,
                            clientId: this.clientId,
                            discoveryDocs: [this.discoveryDoc],
                            scope: this.scopes
                        });
                        
                        // Obtener instancia de auth
                        this.authInstance = gapi.auth2.getAuthInstance();
                        
                        debugLog('gapi inicializado correctamente');
                        resolve();
                        
                    } catch (error) {
                        console.error('Error al inicializar gapi:', error);
                        reject(error);
                    }
                },
                onerror: (error) => {
                    console.error('Error al cargar gapi:', error);
                    reject(error);
                }
            });
        });
    },
    
    /**
     * Inicia sesión con Google
     */
    async signIn() {
        debugLog('Iniciando proceso de login...');
        
        if (!this.isInitialized) {
            const initialized = await this.init();
            if (!initialized) {
                throw new Error('No se pudo inicializar Google Auth');
            }
        }
        
        try {
            if (!this.authInstance) {
                throw new Error('Auth instance no disponible');
            }
            
            // Realizar login
            const user = await this.authInstance.signIn();
            this.currentUser = user;
            
            // Actualizar estado de la app
            this.updateAppState();
            
            debugLog('Login exitoso:', this.getCurrentUserEmail());
            
            // Cargar datos del usuario y mostrar dashboard
            await loadUserData();
            showDashboard();
            
            UIUtils.showSuccess(`Bienvenido, ${this.getCurrentUserName()}`);
            
        } catch (error) {
            console.error('Error en login:', error);
            
            if (error.error === 'popup_closed_by_user') {
                UIUtils.showWarning('Inicio de sesión cancelado');
            } else {
                UIUtils.showError('Error al iniciar sesión. Intenta de nuevo.');
            }
            
            throw error;
        }
    },
    
    /**
     * Cierra sesión
     */
    async signOut() {
        debugLog('Cerrando sesión...');
        
        try {
            if (this.authInstance) {
                await this.authInstance.signOut();
            }
            
            this.currentUser = null;
            this.clearAppState();
            
            debugLog('Sesión cerrada correctamente');
            
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            throw error;
        }
    },
    
    /**
     * Verifica si el usuario está autenticado
     */
    isSignedIn() {
        if (!this.authInstance) {
            return false;
        }
        
        return this.authInstance.isSignedIn.get();
    },
    
    /**
     * Obtiene el token de acceso actual
     */
    getAccessToken() {
        if (!this.currentUser) {
            return null;
        }
        
        const authResponse = this.currentUser.getAuthResponse();
        return authResponse ? authResponse.access_token : null;
    },
    
    /**
     * Obtiene el email del usuario actual
     */
    getCurrentUserEmail() {
        if (!this.currentUser) {
            return null;
        }
        
        const profile = this.currentUser.getBasicProfile();
        return profile ? profile.getEmail() : null;
    },
    
    /**
     * Obtiene el nombre del usuario actual
     */
    getCurrentUserName() {
        if (!this.currentUser) {
            return null;
        }
        
        const profile = this.currentUser.getBasicProfile();
        return profile ? profile.getName() : null;
    },
    
    /**
     * Obtiene la foto del usuario actual
     */
    getCurrentUserPicture() {
        if (!this.currentUser) {
            return null;
        }
        
        const profile = this.currentUser.getBasicProfile();
        return profile ? profile.getImageUrl() : null;
    },
    
    /**
     * Verifica si el token es válido y lo renueva si es necesario
     */
    async ensureValidToken() {
        if (!this.currentUser) {
            throw new Error('Usuario no autenticado');
        }
        
        const authResponse = this.currentUser.getAuthResponse();
        const expiresIn = authResponse.expires_in;
        const expiresAt = authResponse.expires_at;
        const now = Date.now();
        
        // Si el token expira en menos de 5 minutos, renovarlo
        if (expiresAt - now < 5 * 60 * 1000) {
            debugLog('Renovando token de acceso...');
            
            try {
                const newAuthResponse = await this.currentUser.reloadAuthResponse();
                debugLog('Token renovado correctamente');
                return newAuthResponse.access_token;
            } catch (error) {
                console.error('Error al renovar token:', error);
                throw new Error('Error al renovar token de acceso');
            }
        }
        
        return authResponse.access_token;
    },
    
    /**
     * Actualiza el estado de la aplicación con datos del usuario
     */
    updateAppState() {
        if (!this.currentUser) {
            return;
        }
        
        const profile = this.currentUser.getBasicProfile();
        
        window.AppState.user = {
            email: profile.getEmail(),
            name: profile.getName(),
            picture: profile.getImageUrl(),
            id: profile.getId()
        };
        
        window.AppState.isAuthenticated = true;
        
        debugLog('Estado de la app actualizado:', window.AppState.user);
    },
    
    /**
     * Limpia el estado de la aplicación
     */
    clearAppState() {
        window.AppState.user = null;
        window.AppState.isAuthenticated = false;
        window.AppState.currentPage = 'login';
        window.AppState.grupos = [];
        window.AppState.estudiantes = [];
        window.AppState.currentAttendance = {};
    },
    
    /**
     * Maneja errores de autenticación
     */
    handleAuthError(error) {
        console.error('Error de autenticación:', error);
        
        // Códigos de error comunes
        const errorMessages = {
            'popup_closed_by_user': 'Inicio de sesión cancelado por el usuario',
            'access_denied': 'Acceso denegado por el usuario',
            'immediate_failed': 'Error de autenticación silenciosa',
            'network_error': 'Error de conexión. Verifica tu internet.',
            'invalid_client': 'Configuración de cliente inválida'
        };
        
        const userMessage = errorMessages[error.error] || 'Error de autenticación desconocido';
        
        UIUtils.showError(userMessage);
        
        // Si es un error crítico, limpiar estado
        if (['invalid_client', 'access_denied'].includes(error.error)) {
            this.clearAppState();
        }
    },
    
    /**
     * Configura listeners para cambios de autenticación
     */
    setupAuthListeners() {
        if (!this.authInstance) {
            return;
        }
        
        // Listener para cambios en el estado de autenticación
        this.authInstance.isSignedIn.listen((isSignedIn) => {
            debugLog('Estado de autenticación cambió:', isSignedIn);
            
            if (isSignedIn) {
                this.currentUser = this.authInstance.currentUser.get();
                this.updateAppState();
            } else {
                this.clearAppState();
                showLoginScreen();
            }
        });
        
        // Listener para cambios en el usuario actual
        this.authInstance.currentUser.listen((user) => {
            debugLog('Usuario actual cambió:', user ? user.getBasicProfile().getEmail() : 'null');
            this.currentUser = user;
            
            if (user && user.isSignedIn()) {
                this.updateAppState();
            } else {
                this.clearAppState();
            }
        });
    }
};

// ===========================================
// FUNCIONES AUXILIARES
// ===========================================

/**
 * Función global para manejar errores de Google API
 */
function handleGoogleApiError(error) {
    console.error('Error de Google API:', error);
    
    if (error.status === 401) {
        UIUtils.showError('Sesión expirada. Por favor, inicia sesión de nuevo.');
        GoogleAuth.signOut();
    } else if (error.status === 403) {
        UIUtils.showError('No tienes permisos para acceder a esta información.');
    } else if (error.status === 429) {
        UIUtils.showWarning('Demasiadas solicitudes. Espera un momento e intenta de nuevo.');
    } else {
        UIUtils.showError('Error al conectar con Google Sheets.');
    }
}

/**
 * Verifica si Google APIs están disponibles
 */
function isGoogleApisAvailable() {
    return typeof gapi !== 'undefined' && typeof google !== 'undefined';
}

/**
 * Inicialización automática cuando se carga la página
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Esperar un poco para que se carguen todas las dependencias
    setTimeout(async () => {
        if (isGoogleApisAvailable()) {
            try {
                await GoogleAuth.init();
                GoogleAuth.setupAuthListeners();
            } catch (error) {
                console.warn('Error al inicializar Google Auth automáticamente:', error);
            }
        } else {
            console.warn('Google APIs no están disponibles');
        }
    }, 1000);
});

debugLog('google-auth.js cargado correctamente');
