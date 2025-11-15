# 🔍 Guía de Diagnóstico de Grupos

## Problema
Los grupos **S41** y **S942** no aparecen en la interfaz aunque existen en los datos.

---

## ✅ Solución Rápida - Usar Script de Consola

### Paso 1: Refrescar la Página
1. **Abre la aplicación** en tu navegador
2. **Presiona Ctrl+Shift+R** (Windows/Linux) o **Cmd+Shift+R** (Mac) para refrescar sin caché

### Paso 2: Abrir la Consola del Navegador
1. **Presiona F12** o **Clic derecho → Inspeccionar**
2. Ve a la pestaña **"Console"** (Consola)

### Paso 3: Copiar y Pegar el Script
1. **Abre el archivo:** `diagnostic-console-script.js`
2. **Copia TODO el contenido**
3. **Pégalo en la consola** del navegador
4. **Presiona Enter**

Deberías ver:
```
✅ Script de diagnóstico cargado

📋 Comandos disponibles:
   diagnosis("S41")     - Diagnosticar grupo S41
   diagnosisS41()       - Atajo para S41
   diagnosisS942()      - Atajo para S942
   findAllProblems()    - Buscar todos los grupos con problemas
```

### Paso 4: Ejecutar el Diagnóstico
En la consola, escribe:

```javascript
diagnosisS41()
```

O para S942:
```javascript
diagnosisS942()
```

O para ambos:
```javascript
await diagnosis("S41")
await diagnosis("S942")
```

---

## 📊 Interpretando los Resultados

El diagnóstico verificará 6 puntos críticos:

### ✅ 1. Backend Data
- **✅ OK:** El grupo existe en Google Sheets
- **❌ NO ENCONTRADO:** El grupo no existe - verificar nombre exacto

### ✅ 2. Campos Críticos
Verifica que el grupo tenga estos 3 campos obligatorios:
- `codigo` - Código del grupo (ej: "S41")
- `hora` - Horario (ej: "10:00-11:00")
- `profe` - Nombre del profesor

**Si falta alguno:** El grupo será excluido silenciosamente

### ✅ 3. Normalización
- **✅ OK:** El grupo pasó el proceso de normalización
- **❌ PERDIDO:** Se perdió durante normalización (revisar campos críticos)

### ✅ 4. Estado Activo
La columna `activo` debe contener uno de estos valores:
- `TRUE` ✅
- `1` ✅
- `X` ✅
- `x` ✅
- `yes` ✅

**Cualquier otro valor:** El grupo se marca como inactivo

### ✅ 5. Días Activos
El grupo debe tener **al menos un día** marcado como activo:
- `lunes`, `martes`, `miercoles`, `jueves`, `viernes`, `sabado`, `domingo`

Cada día debe tener valor `TRUE` o `X` en Google Sheets

**Si todos los días están vacíos:** El grupo no aparecerá en ningún dashboard

### ✅ 6. Dashboard Visibilidad
- **✅ VISIBLE:** El grupo aparece en el dashboard del día actual
- **❌ NO VISIBLE:** No aparece (revisar si hoy es un día activo para el grupo)

---

## 🛠️ Soluciones Comunes

### Problema: "❌ Campos Críticos FALTANTES"

**Solución en Google Sheets:**
1. Abre la hoja de grupos
2. Busca la fila del grupo (S41 o S942)
3. Verifica que tenga valores en estas columnas:
   - `codigo` → "S41"
   - `hora` → "10:00-11:00" (ejemplo)
   - `profe` → "Nombre del Profesor"

### Problema: "❌ Estado INACTIVO"

**Solución en Google Sheets:**
1. Busca la columna `activo`
2. Cambia el valor a `TRUE` (o `1` o `X`)

### Problema: "❌ Sin días activos"

**Solución en Google Sheets:**
1. Marca al menos un día de la semana con `TRUE`
2. Ejemplo: Si la clase es los lunes y miércoles:
   - Columna `lunes` → `TRUE`
   - Columna `miercoles` → `TRUE`

### Problema: "Grupo SE PERDIÓ durante normalización"

**Causas:**
1. Falta algún campo crítico (codigo, hora, o profe)
2. Los nombres de las columnas en Google Sheets tienen caracteres especiales

**Solución:**
1. Verifica que las columnas se llamen exactamente: `codigo`, `hora`, `profe`
2. Agrega los valores faltantes
3. Refresca la aplicación (Ctrl+Shift+R)

---

## 🔧 Comando para Encontrar TODOS los Problemas

Para ver todos los grupos que tienen problemas:

```javascript
findAllProblems()
```

Esto mostrará una lista de todos los grupos con:
- Grupos perdidos en normalización
- Grupos inactivos
- Grupos sin días activos

---

## 📝 Ejemplo de Salida Exitosa

```
🔍 ========================================
🔍 DIAGNÓSTICO DEL GRUPO: S41
🔍 ========================================

1️⃣  Verificando datos en el backend...
✅ Grupo encontrado en backend

2️⃣  Verificando campos críticos...
   codigo: "S41" ✅
   hora: "10:00-11:00" ✅
   profe: "Juan Pérez" ✅

3️⃣  Verificando normalización...
✅ Grupo normalizado correctamente

4️⃣  Verificando estado activo...
   Valor raw: "TRUE"
   Valor normalizado: true
✅ Grupo está activo

5️⃣  Verificando días de la semana...
   lunes: ✅ (raw: "TRUE")
   martes: ❌ (raw: "")
   miercoles: ✅ (raw: "TRUE")
   ...
✅ Días activos: lunes, miercoles

6️⃣  Verificando dashboard de hoy...
   Hoy es: lunes
   Aparece en dashboard: ✅ SÍ

📊 ========================================
📊 RESUMEN DEL DIAGNÓSTICO
📊 ========================================

✅ Backend: ✅ OK
✅ Campos Críticos: ✅ OK
✅ Normalización: ✅ OK
✅ Estado Activo: ✅ ACTIVO
✅ Días Activos: ✅ OK
✅ Dashboard Hoy: ✅ VISIBLE

✅ Grupo configurado correctamente
```

---

## 🚨 Si Nada Funciona

Si después de corregir en Google Sheets el grupo sigue sin aparecer:

1. **Limpia la caché del navegador:**
   - Ctrl+Shift+Delete
   - Selecciona "Caché" e "Imágenes en caché"
   - Limpia

2. **Refresca la aplicación:**
   - Ctrl+Shift+R (forzar recarga)

3. **Verifica en consola:**
   ```javascript
   // Ver todos los grupos cargados
   await GroupService.getAllGroups(true)

   // Buscar específicamente S41
   const grupos = await GroupService.getAllGroups(true)
   grupos.find(g => g.codigo === 'S41')
   ```

4. **Contacta al desarrollador** con la salida completa del diagnóstico

---

## ✨ Después de Arreglar

Después de hacer cambios en Google Sheets:

1. **En la aplicación**, presiona el botón **🔄 Actualizar**
2. O ejecuta en consola:
   ```javascript
   await GroupService.refresh()
   ```
3. Verifica que ahora aparezca:
   ```javascript
   diagnosisS41()
   ```
