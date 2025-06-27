# Estructura de Base de Datos - Sistema de Asistencia de Tenis

## Archivo Principal en Google Sheets
**Nombre sugerido:** `SistemaAsistenciaTenis_2025`

---

## 📋 HOJA 1: Grupos

### Propósito
Almacenar información de todos los grupos de tenis con sus horarios, profesores y características.

### Estructura de Columnas

| Columna | Tipo | Descripción | Ejemplo |
|---------|------|-------------|---------|
| **Código** | Texto | Identificador único del grupo | `LM-15:45-Brayan-Verde` |
| **Días** | Texto | Días de la semana separados por comas | `Lunes,Miércoles` |
| **Hora** | Texto | Rango horario en formato HH:MM-HH:MM | `15:45-16:30` |
| **Profe** | Texto | Nombre del profesor asignado | `Brayan` |
| **Cancha** | Número | Número de cancha asignada | `2` |
| **Frecuencia_Semanal** | Número | Clases por semana | `2` |
| **Bola** | Texto | Nivel/tipo de pelota | `Verde` |
| **Descriptor** | Texto | Descripción completa del grupo | `Lunes,Miércoles-15:45-16:30-Brayan-Verde` |
| **Activo** | Booleano | Estado del grupo (TRUE/FALSE) | `TRUE` |

### Datos de Ejemplo
```
LM-15:45-Brayan-Verde | Lunes,Miércoles | 15:45-16:30 | Brayan | 2 | 2 | Verde | Lunes,Miércoles-15:45-16:30-Brayan-Verde | TRUE
MJ-16:30-Ricardo-Amarilla | Martes,Jueves | 16:30-17:15 | Ricardo | 1 | 2 | Amarilla | Martes,Jueves-16:30-17:15-Ricardo-Amarilla | TRUE
VSD-09:00-Carlos-Naranja | Viernes,Sábado,Domingo | 09:00-10:30 | Carlos | 3 | 3 | Naranja | Viernes,Sábado,Domingo-09:00-10:30-Carlos-Naranja | TRUE
```

---

## 👥 HOJA 2: Estudiantes

### Propósito
Registro completo de estudiantes con sus asignaciones de grupos y límites de clases.

### Estructura de Columnas

| Columna | Tipo | Descripción | Ejemplo |
|---------|------|-------------|---------|
| **ID** | Texto | Identificador único del estudiante | `EST001` |
| **Nombre** | Texto | Nombre completo del estudiante | `Juan Pérez Martínez` |
| **Grupo_Principal** | Texto | Código del grupo principal | `LM-15:45-Brayan-Verde` |
| **Grupo_Secundario** | Texto | Código del grupo secundario (opcional) | `MJ-16:30-Ricardo-Amarilla` |
| **Max_Clases** | Número | Límite máximo de clases por período | `40` |
| **Activo** | Booleano | Estado del estudiante (TRUE/FALSE) | `TRUE` |

### Datos de Ejemplo
```
EST001 | Juan Pérez Martínez | LM-15:45-Brayan-Verde | MJ-16:30-Ricardo-Amarilla | 40 | TRUE
EST002 | María González López | LM-15:45-Brayan-Verde |  | 40 | TRUE
EST003 | Carlos Rodríguez | VSD-09:00-Carlos-Naranja |  | 60 | TRUE
EST004 | Ana Sofía Méndez | MJ-16:30-Ricardo-Amarilla | LM-15:45-Brayan-Verde | 40 | FALSE
```

---

## 👨‍🏫 HOJA 3: Profesores

### Propósito
Catálogo de profesores del sistema.

### Estructura de Columnas

| Columna | Tipo | Descripción | Ejemplo |
|---------|------|-------------|---------|
| **ID** | Texto | Identificador único del profesor | `PROF001` |
| **Nombre** | Texto | Nombre completo del profesor | `Brayan Rodríguez` |
| **Activo** | Booleano | Estado del profesor (TRUE/FALSE) | `TRUE` |

### Datos de Ejemplo
```
PROF001 | Brayan Rodríguez | TRUE
PROF002 | Ricardo Martínez | TRUE
PROF003 | Carlos Mendoza | TRUE
PROF004 | Laura Sánchez | FALSE
```

---

## ✅ HOJA 4: Asistencias

### Propósito
Registro detallado de todas las asistencias de estudiantes a clases.

### Estructura de Columnas

| Columna | Tipo | Descripción | Ejemplo |
|---------|------|-------------|---------|
| **ID** | Texto | Identificador único de asistencia | `AST001` |
| **Fecha** | Fecha | Fecha de la clase (YYYY-MM-DD) | `2025-06-27` |
| **Estudiante_ID** | Texto | ID del estudiante | `EST001` |
| **Grupo_Codigo** | Texto | Código del grupo | `LM-15:45-Brayan-Verde` |
| **Tipo_Clase** | Texto | Regular, Reposición | `Regular` |
| **Estado** | Texto | Presente, Ausente, Justificada | `Presente` |
| **Justificacion** | Texto | Tipo de justificación (Médica, Personal, etc.) | `Médica` |
| **Descripcion** | Texto | Detalles de la justificación | `Cita médica de control` |

| **Enviado_Por** | Texto | Usuario que registró la asistencia | `user123` |
| **Timestamp** | Fecha/Hora | Momento del registro | `2025-06-27 10:30:00` |

### Datos de Ejemplo
```
AST001 | 2025-06-27 | EST001 | LM-15:45-Brayan-Verde | Regular | Presente |  |  | user123 | 2025-06-27 10:30:00
AST002 | 2025-06-27 | EST002 | LM-15:45-Brayan-Verde | Regular | Ausente | Médica | Gripe | user123 | 2025-06-27 10:30:00
AST003 | 2025-06-27 | EST003 | VSD-09:00-Carlos-Naranja | Regular | Presente |  |  | user123 | 2025-06-27 09:15:00
```

---

## 📅 HOJA 5: Clases_Programadas

### Propósito
Control de todas las clases programadas y su estado (realizadas o canceladas).

### Estructura de Columnas

| Columna | Tipo | Descripción | Ejemplo |
|---------|------|-------------|---------|
| **ID** | Texto | Identificador único de clase | `CLS001` |
| **Fecha** | Fecha | Fecha de la clase programada | `2025-06-27` |
| **Grupo_Codigo** | Texto | Código del grupo | `LM-15:45-Brayan-Verde` |
| **Estado** | Texto | Programada, Realizada, Cancelada | `Realizada` |
| **Motivo_Cancelacion** | Texto | Razón de cancelación (Lluvia, Festivo, etc.) | `Lluvia` |
| **Creado_Por** | Texto | Usuario que registró la clase | `user123` |
| **Timestamp** | Fecha/Hora | Momento del registro | `2025-06-27 10:30:00` |

### Datos de Ejemplo
```
CLS001 | 2025-06-27 | LM-15:45-Brayan-Verde | Realizada |  | user123 | 2025-06-27 10:30:00
CLS002 | 2025-06-27 | MJ-16:30-Ricardo-Amarilla | Cancelada | Lluvia | user123 | 2025-06-27 16:15:00
CLS003 | 2025-06-28 | VSD-09:00-Carlos-Naranja | Programada |  | system | 2025-06-27 00:01:00
```

---

## 🔄 HOJA 6: Clases_Reposicion

### Propósito
Registro de clases de reposición creadas manualmente.

### Estructura de Columnas

| Columna | Tipo | Descripción | Ejemplo |
|---------|------|-------------|---------|
| **ID** | Texto | Identificador único de reposición | `REP001` |
| **Fecha** | Fecha | Fecha de la clase de reposición | `2025-06-28` |
| **Estudiantes_IDs** | Texto | IDs de estudiantes separados por comas | `EST001,EST002,EST003` |
| **Tipo** | Texto | Individual, Grupal | `Grupal` |
| **Profesor** | Texto | Nombre del profesor | `Brayan` |
| **Descripcion** | Texto | Detalles de la reposición | `Reposición por lluvia del 27/06` |
| **Creado_Por** | Texto | Usuario que creó la reposición | `user123` |
| **Timestamp** | Fecha/Hora | Momento de creación | `2025-06-27 15:00:00` |

### Datos de Ejemplo
```
REP001 | 2025-06-28 | EST001,EST002 | Individual | Brayan | Clase individual de técnica | user123 | 2025-06-27 15:00:00
REP002 | 2025-06-29 | EST003,EST004,EST005 | Grupal | Ricardo | Reposición por festivo | user123 | 2025-06-27 16:30:00
```

---

## 🔧 Configuraciones Adicionales

### Formato de Fechas
- **Estándar:** YYYY-MM-DD (ej: 2025-06-27)
- **Hora:** HH:MM:SS (ej: 10:30:00)
- **Timestamp:** YYYY-MM-DD HH:MM:SS

### Validaciones Recomendadas
1. **IDs únicos** en todas las hojas principales
2. **Estados válidos** según catálogos definidos
3. **Fechas coherentes** (no futuras para asistencias)
4. **Referencias válidas** entre hojas

### Niveles de Bola
- **Verde:** Nivel básico
- **Amarilla:** Nivel intermedio
- **Naranja:** Nivel intermedio-avanzado
- **Roja:** Nivel avanzado

### Estados del Sistema
- **Estados de Clase:** Programada, Realizada, Cancelada
- **Estados de Asistencia:** Presente, Ausente, Justificada
- **Estados de Entidad:** Activo, Inactivo

---

## 📝 Notas de Implementación

1. **Backup automático:** Google Sheets mantiene historial de versiones
2. **Permisos:** Configurar acceso solo para usuarios autorizados
3. **API:** Habilitar Google Sheets API para integración con la aplicación web
4. **Indexación:** Los IDs deben ser únicos y secuenciales para mejor rendimiento
5. **Auditoría:** Todos los registros incluyen timestamp y usuario responsable

Esta estructura permite manejar completamente el sistema de asistencia con flexibilidad para crecer y adaptarse a nuevas necesidades.
