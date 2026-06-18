# Esquema de Aplicación Web - Sistema de Asistencia de Tenis
## Enfoque Progresivo: De Simple a Avanzado

---

> **Nota (v2):** La nueva versión del sistema (MVP v2) está implementada según el
> documento de especificación e historias de usuario v2:
> - **Backend:** [`server/`](server/) — **Node.js + Express + PostgreSQL + Prisma**.
>   Cubre Inscripción, Grupos, Asistencia (motor de costos), Liquidación y
>   Administración. Ver [`server/README.md`](server/README.md) para el mapa de
>   Historias de Usuario → Endpoints.
> - **Frontend:** [`client/`](client/) — **React + Vite mobile-first**. Incluye
>   inscripción pública, login, grupos del día, el flujo de asistencia de 5
>   pantallas con cálculo de pago, modo offline, flujo del asistente, liquidación
>   propia y el panel de administración.
>
> Las 16 historias de usuario v2 están cubiertas de punta a punta. El contenido
> anterior de este README describe la arquitectura original (Vanilla JS + Google
> Sheets), conservada como referencia histórica.

---

## 🎯 **Estrategia de Desarrollo**

### **FASE 1: Prototipo Funcional (2-3 semanas)**
- HTML + JavaScript + CSS
- Funcionalidad básica online
- Conexión directa a Google Sheets
- Interfaz optimizada para tablets

### **FASE 2: Mejoras Intermedias (3-4 semanas)**
- Funcionalidad offline básica
- Mejores validaciones
- Reportes simples

### **FASE 3: Versión Avanzada (opcional)**
- Migración a React si es necesario
- Funcionalidades avanzadas
- Optimizaciones de rendimiento

---

## 🏗️ **FASE 1: Arquitectura Simple**

### Stack Tecnológico Inicial
- **Frontend:** HTML5 + Vanilla JavaScript + CSS3
- **Estilos:** Tailwind CSS (via CDN)
- **Backend:** Google Sheets API
- **Autenticación:** Google OAuth 2.0 (biblioteca simple)
- **Despliegue:** Netlify (archivos estáticos)

### Estructura de Archivos FASE 1
```
proyecto/
├── index.html              # Página principal
├── css/
│   └── styles.css         # Estilos personalizados
├── js/
│   ├── main.js           # Lógica principal
│   ├── google-auth.js    # Autenticación Google
│   ├── sheets-api.js     # Conexión Google Sheets
│   └── utils.js          # Funciones auxiliares
├── docs/                 # Documentación existente
└── README.md
```

---

## 📱 **Páginas y Funcionalidades FASE 1**

### 1. **Página Principal (index.html)**
```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sistema Asistencia Tenis</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Google APIs -->
    <script src="https://apis.google.com/js/api.js"></script>
</head>
<body>
    <!-- Contenido dinámico se carga aquí -->
    <div id="app"></div>
    
    <!-- Scripts -->
    <script src="js/utils.js"></script>
    <script src="js/google-auth.js"></script>
    <script src="js/sheets-api.js"></script>
    <script src="js/main.js"></script>
</body>
</html>
```

### 2. **Funcionalidades Principales**

#### **Login Simple**
```javascript
// js/google-auth.js
const GoogleAuth = {
    async init() {
        // Inicializar Google Auth
    },
    
    async signIn() {
        // Proceso de login
    },
    
    async signOut() {
        // Cerrar sesión
    }
};
```

#### **Dashboard Básico**
```javascript
// Mostrar:
// - Grupos del día actual
// - Botón para registrar asistencia
// - Acceso a reportes simples
```

#### **Registro de Asistencia**
```javascript
// js/main.js - Funciones principales
function showAttendanceForm(groupCode) {
    // 1. Cargar estudiantes del grupo
    // 2. Mostrar lista con checkboxes
    // 3. Permitir justificaciones
    // 4. Guardar en Google Sheets
}

function saveAttendance(attendanceData) {
    // Enviar datos a Google Sheets
    // Mostrar confirmación
}
```

---

## 🔌 **Integración Google Sheets API (Simplificada)**

### Configuración Básica
```javascript
// js/sheets-api.js
const SheetsAPI = {
    spreadsheetId: 'TU_SPREADSHEET_ID',
    apiKey: 'TU_API_KEY',
    
    async readData(range) {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${range}?key=${this.apiKey}`;
        const response = await fetch(url);
        return await response.json();
    },
    
    async writeData(range, values) {
        // Escribir datos usando API
    },
    
    // Funciones específicas del negocio
    async getGroups() {
        return await this.readData('Grupos!A:I');
    },
    
    async getStudents(groupCode) {
        // Filtrar estudiantes por grupo
    },
    
    async saveAttendance(data) {
        return await this.writeData('Asistencias!A:J', [data]);
    }
};
```

### Manejo de Datos Simple
```javascript
// js/utils.js
const DataUtils = {
    // Filtrar grupos por día actual
    getTodayGroups(allGroups) {
        const today = new Date().toLocaleDateString('es', {weekday: 'long'});
        return allGroups.filter(group => 
            group.dias.toLowerCase().includes(today.toLowerCase())
        );
    },
    
    // Formatear datos para Google Sheets
    formatAttendanceData(groupCode, studentId, status, justification) {
        return [
            this.generateId(),
            this.getCurrentDate(),
            studentId,
            groupCode,
            'Regular',
            status,
            justification || '',
            '', // descripción
            'user', // usuario actual
            new Date().toISOString()
        ];
    },
    
    // Generar ID único simple
    generateId() {
        return 'AST' + Date.now().toString(36).toUpperCase();
    },
    
    getCurrentDate() {
        return new Date().toISOString().split('T')[0];
    }
};
```

---

## 🎨 **Interfaz de Usuario FASE 1**

### Diseño Mobile-First para Tablets
```css
/* css/styles.css */
:root {
    --primary-color: #10b981;
    --secondary-color: #f59e0b;
    --accent-color: #ef4444;
    --neutral-color: #6b7280;
}

/* Optimización para tablets */
.container {
    max-width: 1024px;
    margin: 0 auto;
    padding: 1rem;
}

/* Botones touch-friendly */
.btn {
    min-height: 48px;
    min-width: 48px;
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-size: 1.1rem;
    cursor: pointer;
    transition: all 0.2s;
}

.btn:active {
    transform: scale(0.95);
}

/* Cards para grupos/estudiantes */
.card {
    background: white;
    border-radius: 0.75rem;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    margin-bottom: 1rem;
}

/* Lista de estudiantes */
.student-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid #e5e7eb;
}

.student-item:last-child {
    border-bottom: none;
}

/* Estados de asistencia */
.status-presente { background-color: #dcfce7; }
.status-ausente { background-color: #fef2f2; }
.status-justificada { background-color: #fef3c7; }
```

### Componentes UI Básicos
```javascript
// js/ui-components.js
const UI = {
    // Crear card de grupo
    createGroupCard(group) {
        return `
            <div class="card cursor-pointer hover:shadow-md" onclick="selectGroup('${group.codigo}')">
                <h3 class="text-xl font-bold text-gray-800">${group.descriptor}</h3>
                <p class="text-gray-600">Profesor: ${group.profe}</p>
                <p class="text-gray-600">Horario: ${group.hora}</p>
                <p class="text-gray-600">Cancha: ${group.cancha}</p>
            </div>
        `;
    },
    
    // Crear item de estudiante
    createStudentItem(student) {
        return `
            <div class="student-item" data-student-id="${student.id}">
                <div>
                    <h4 class="font-semibold">${student.nombre}</h4>
                </div>
                <div class="flex gap-2">
                    <button class="btn btn-sm bg-green-500 text-white" onclick="markAttendance('${student.id}', 'Presente')">
                        Presente
                    </button>
                    <button class="btn btn-sm bg-red-500 text-white" onclick="markAttendance('${student.id}', 'Ausente')">
                        Ausente
                    </button>
                    <button class="btn btn-sm bg-yellow-500 text-white" onclick="markAttendance('${student.id}', 'Justificada')">
                        Justificada
                    </button>
                </div>
            </div>
        `;
    },
    
    // Mostrar loading
    showLoading(message = 'Cargando...') {
        document.getElementById('app').innerHTML = `
            <div class="flex items-center justify-center min-h-screen">
                <div class="text-center">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p class="text-gray-600">${message}</p>
                </div>
            </div>
        `;
    },
    
    // Mostrar mensaje de éxito
    showSuccess(message) {
        // Implementar toast o modal simple
    },
    
    // Mostrar error
    showError(message) {
        // Implementar toast o modal simple
    }
};
```

---

## 📊 **Flujo de Trabajo FASE 1**

### 1. **Inicio de Sesión**
```javascript
// main.js - Flujo principal
async function initApp() {
    try {
        UI.showLoading('Inicializando aplicación...');
        
        // Inicializar Google Auth
        await GoogleAuth.init();
        
        // Verificar si está logueado
        if (GoogleAuth.isSignedIn()) {
            showDashboard();
        } else {
            showLoginScreen();
        }
    } catch (error) {
        UI.showError('Error al inicializar la aplicación');
    }
}

function showLoginScreen() {
    document.getElementById('app').innerHTML = `
        <div class="min-h-screen flex items-center justify-center bg-gray-50">
            <div class="max-w-md w-full bg-white rounded-lg shadow-md p-6">
                <h1 class="text-2xl font-bold text-center mb-6">Sistema Asistencia Tenis</h1>
                <button onclick="GoogleAuth.signIn()" class="w-full btn bg-primary text-white">
                    Iniciar Sesión con Google
                </button>
            </div>
        </div>
    `;
}
```

### 2. **Dashboard Principal**
```javascript
async function showDashboard() {
    try {
        UI.showLoading('Cargando dashboard...');
        
        // Cargar grupos del día
        const allGroups = await SheetsAPI.getGroups();
        const todayGroups = DataUtils.getTodayGroups(allGroups);
        
        document.getElementById('app').innerHTML = `
            <div class="container">
                <header class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold">Dashboard</h1>
                    <button onclick="GoogleAuth.signOut()" class="btn bg-gray-500 text-white">
                        Cerrar Sesión
                    </button>
                </header>
                
                <div class="mb-6">
                    <h2 class="text-xl font-semibold mb-4">Grupos de Hoy</h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        ${todayGroups.map(group => UI.createGroupCard(group)).join('')}
                    </div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button onclick="showReports()" class="btn bg-secondary text-white p-6 text-lg">
                        📊 Ver Reportes
                    </button>
                    <button onclick="showSettings()" class="btn bg-neutral text-white p-6 text-lg">
                        ⚙️ Configuración
                    </button>
                </div>
            </div>
        `;
    } catch (error) {
        UI.showError('Error al cargar el dashboard');
    }
}
```

### 3. **Registro de Asistencia**
```javascript
async function selectGroup(groupCode) {
    try {
        UI.showLoading('Cargando estudiantes...');
        
        const students = await SheetsAPI.getStudents(groupCode);
        
        document.getElementById('app').innerHTML = `
            <div class="container">
                <header class="flex items-center mb-6">
                    <button onclick="showDashboard()" class="btn bg-gray-500 text-white mr-4">
                        ← Volver
                    </button>
                    <h1 class="text-xl font-bold">Registro de Asistencia</h1>
                </header>
                
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h2 class="text-lg font-semibold mb-4">Grupo: ${groupCode}</h2>
                    <div id="student-list">
                        ${students.map(student => UI.createStudentItem(student)).join('')}
                    </div>
                    
                    <div class="mt-6 flex gap-4">
                        <button onclick="saveAllAttendance('${groupCode}')" class="btn bg-primary text-white flex-1">
                            💾 Guardar Asistencia
                        </button>
                        <button onclick="resetAttendance()" class="btn bg-gray-500 text-white">
                            🔄 Limpiar
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Inicializar estado de asistencia
        window.currentAttendance = {};
        
    } catch (error) {
        UI.showError('Error al cargar estudiantes');
    }
}
```

---

## 🚀 **Configuración de Despliegue FASE 1**

### Netlify (Archivos Estáticos)
```toml
# netlify.toml
[build]
  publish = "."

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Variables de Entorno
```javascript
// js/config.js
const CONFIG = {
    GOOGLE_CLIENT_ID: 'tu_client_id_aqui',
    GOOGLE_API_KEY: 'tu_api_key_aqui',
    SPREADSHEET_ID: 'tu_spreadsheet_id_aqui',
    ENVIRONMENT: 'production'
};
```

---

## 📝 **Próximos Pasos**

### **Inmediatos (Esta semana):**
1. ✅ Crear estructura de archivos
2. ✅ Configurar Google Sheets API
3. ✅ Implementar login básico
4. ✅ Crear dashboard simple

### **Fase 2 (Próximas semanas):**
1. 🔄 Funcionalidad offline con localStorage
2. 📊 Reportes básicos
3. 🎨 Mejorar UI/UX
4. ✅ Validaciones y manejo de errores

### **Fase 3 (Opcional):**
1. 🚀 Migración a React (si es necesario)
2. 📱 PWA (Progressive Web App)
3. 🔔 Notificaciones
4. 📈 Analytics y métricas

---

## 💡 **Ventajas de este Enfoque**

✅ **Aprendizaje gradual** - Empiezas viendo resultados inmediatos  
✅ **Menos complejidad** - HTML/JS que puedes entender  
✅ **Funcional desde día 1** - Usable mientras mejoramos  
✅ **Despliegue simple** - Archivos estáticos en Netlify  
✅ **Escalable** - Puedes migrar a React después si quieres  

Este enfoque te permite tener un sistema funcional rápidamente mientras aprendes y mejoras gradualmente.
