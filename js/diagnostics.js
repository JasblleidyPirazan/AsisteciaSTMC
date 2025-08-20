/**
 * SISTEMA DE DIAGNÓSTICO COMPLETO - ASISTENCIA TENIS
 * ===================================================
 * Diagnóstico exhaustivo para problemas de guardado de asistencias
 */

const AttendanceDiagnostics = {
    testResults: [],
    currentTestSession: null,

    /**
     * EJECUTA DIAGNÓSTICO COMPLETO
     */
    async runFullDiagnostics() {
        console.log('🔍 ========================================');
        console.log('🔍 INICIANDO DIAGNÓSTICO COMPLETO');
        console.log('🔍 ========================================');
        
        this.testResults = [];
        this.currentTestSession = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            tests: []
        };

        try {
            // 1. Verificar conexión con backend
            await this.testBackendConnection();
            
            // 2. Verificar estructura de datos
            await this.testDataStructures();
            
            // 3. Verificar flujo de creación de clase
            await this.testClassCreation();
            
            // 4. Verificar flujo de asistencia
            await this.testAttendanceFlow();
            
            // 5. Verificar guardado en backend
            await this.testBackendSave();
            
            // 6. Verificar sincronización
            await this.testSyncProcess();
            
            // 7. Generar reporte
            this.generateReport();
            
        } catch (error) {
            console.error('❌ Error crítico en diagnóstico:', error);
            this.addTestResult('CRITICAL_ERROR', false, error.message);
            this.generateReport();
        }
    },

    /**
     * TEST 1: Conexión con Backend
     */
    async testBackendConnection() {
        console.log('\\n📡 TEST 1: CONEXIÓN CON BACKEND');
        console.log('================================');
        
        const tests = [
            // Test básico de conexión
            {
                name: 'Conexión básica',
                test: async () => {
                    const result = await SheetsAPI.testConnection();
                    return result.success;
                }
            },
            
            // Test de endpoints críticos
            {
                name: 'Endpoint getGroups',
                test: async () => {
                    const groups = await SheetsAPI.getGroups();
                    return Array.isArray(groups) && groups.length > 0;
                }
            },
            
            // Test de endpoint saveAttendance
            {
                name: 'Endpoint saveAttendance disponible',
                test: async () => {
                    // Crear datos de prueba mínimos
                    const testData = [{
                        ID: 'TEST_' + Date.now(),
                        ID_Clase: 'TEST_CLASS_123',
                        Fecha: '2025-01-01',
                        Estudiante_ID: 'TEST_STUDENT',
                        Grupo_Codigo: 'TEST_GROUP',
                        Tipo_Clase: 'Test',
                        Estado: 'Presente',
                        Justificacion: '',
                        Descripcion: 'Test de diagnóstico',
                        Enviado_Por: 'diagnostics',
                        Timestamp: new Date().toISOString()
                    }];
                    
                    try {
                        // Intentar guardar pero capturar cualquier error
                        await SheetsAPI.saveAttendance(testData);
                        return true;
                    } catch (error) {
                        // Si el error es de validación del backend, el endpoint funciona
                        if (error.message.includes('validation') || 
                            error.message.includes('duplicate') ||
                            error.message.includes('test')) {
                            return true;
                        }
                        console.error('Error en endpoint:', error.message);
                        return false;
                    }
                }
            }
        ];

        for (const test of tests) {
            try {
                const result = await test.test();
                this.addTestResult(`BACKEND_${test.name}`, result, 
                    result ? 'OK' : 'FALLÓ');
                console.log(`  ${result ? '✅' : '❌'} ${test.name}`);
            } catch (error) {
                this.addTestResult(`BACKEND_${test.name}`, false, error.message);
                console.log(`  ❌ ${test.name}: ${error.message}`);
            }
        }
    },

    /**
     * TEST 2: Estructura de Datos
     */
    async testDataStructures() {
        console.log('\\n📊 TEST 2: ESTRUCTURA DE DATOS');
        console.log('================================');
        
        // Verificar AttendanceController
        const controllerState = AttendanceController.getState();
        console.log('📋 Estado del AttendanceController:', {
            hasClassId: !!controllerState.classId,
            classId: controllerState.classId,
            attendanceCount: Object.keys(controllerState.attendanceData || {}).length,
            hasGroup: !!controllerState.currentGroup,
            hasStudents: controllerState.currentStudents?.length > 0
        });
        
        this.addTestResult('DATA_ControllerState', 
            !!controllerState, 
            JSON.stringify(controllerState, null, 2));

        // Verificar estructura de un registro de asistencia
        const testRecord = AttendanceService.createAttendanceRecord(
            'TEST_STUDENT',
            'TEST_GROUP',
            'Presente',
            {
                idClase: 'TEST_CLASS_ID',
                date: '2025-01-01',
                classType: 'Regular',
                sentBy: 'test'
            }
        );

        console.log('📋 Estructura de registro de prueba:', testRecord);
        
        // Verificar campos críticos
        const criticalFields = ['ID', 'ID_Clase', 'Estudiante_ID', 'Grupo_Codigo', 'Estado'];
        const missingFields = criticalFields.filter(field => !testRecord[field]);
        
        if (missingFields.length > 0) {
            console.error('❌ Campos críticos faltantes:', missingFields);
            this.addTestResult('DATA_CriticalFields', false, 
                `Faltantes: ${missingFields.join(', ')}`);
        } else {
            console.log('✅ Todos los campos críticos presentes');
            this.addTestResult('DATA_CriticalFields', true, 'OK');
        }
    },

    /**
     * TEST 3: Flujo de Creación de Clase
     */
    async testClassCreation() {
        console.log('\\n🏫 TEST 3: CREACIÓN DE CLASE');
        console.log('================================');
        
        const testDate = '2025-01-01';
        const testGroup = 'TEST_DIAG_' + Date.now();
        
        try {
            // Verificar si la clase ya existe
            console.log('  1. Verificando existencia de clase...');
            const existCheck = await ClassControlService.checkClassExists(
                testDate, 
                testGroup
            );
            
            console.log('  Resultado:', existCheck);
            this.addTestResult('CLASS_ExistCheck', true, 
                `Exists: ${existCheck.exists}`);
            
            // Si no existe, intentar crear
            if (!existCheck.exists) {
                console.log('  2. Creando clase de prueba...');
                const classRecord = await ClassControlService.createClassRecord(
                    testDate,
                    testGroup,
                    'Realizada',
                    {
                        asistenteId: 'TEST_ASSISTANT',
                        creadoPor: 'diagnostics'
                    }
                );
                
                console.log('  Clase creada:', classRecord);
                this.addTestResult('CLASS_Creation', true, 
                    `ID: ${classRecord?.id}`);
                
                // Guardar ID para pruebas posteriores
                this.testClassId = classRecord?.id;
            }
            
        } catch (error) {
            console.error('❌ Error en creación de clase:', error);
            this.addTestResult('CLASS_Creation', false, error.message);
        }
    },

    /**
     * TEST 4: Flujo Completo de Asistencia
     */
    async testAttendanceFlow() {
        console.log('\\n📝 TEST 4: FLUJO DE ASISTENCIA');
        console.log('================================');
        
        // Crear datos de prueba
        const testAttendanceData = {
            'TEST_001': {
                studentId: 'TEST_001',
                status: 'Presente',
                justification: '',
                description: 'Test diagnóstico'
            },
            'TEST_002': {
                studentId: 'TEST_002',
                status: 'Ausente',
                justification: '',
                description: 'Test diagnóstico'
            }
        };

        const testOptions = {
            idClase: this.testClassId || 'TEST_CLASS_' + Date.now(),
            groupCode: 'TEST_GROUP',
            date: '2025-01-01',
            classType: 'Regular',
            sentBy: 'diagnostics'
        };

        console.log('📋 Datos de prueba:', {
            attendanceCount: Object.keys(testAttendanceData).length,
            classId: testOptions.idClase
        });

        try {
            // 1. Crear registros usando AttendanceService
            console.log('  1. Creando registros de asistencia...');
            const result = AttendanceService.createGroupAttendanceRecords(
                testAttendanceData,
                testOptions
            );
            
            console.log('  Registros creados:', {
                total: result.records.length,
                errors: result.errors.length,
                firstRecord: result.records[0]
            });
            
            this.addTestResult('ATTENDANCE_CreateRecords', 
                result.records.length > 0,
                `Created: ${result.records.length}, Errors: ${result.errors.length}`);
            
            // 2. Verificar que todos tienen ID_Clase
            const recordsWithoutClass = result.records.filter(r => !r.ID_Clase);
            if (recordsWithoutClass.length > 0) {
                console.error('❌ Registros sin ID_Clase:', recordsWithoutClass);
                this.addTestResult('ATTENDANCE_ClassIdCheck', false,
                    `${recordsWithoutClass.length} sin ID_Clase`);
            } else {
                console.log('✅ Todos los registros tienen ID_Clase');
                this.addTestResult('ATTENDANCE_ClassIdCheck', true, 'OK');
            }
            
            // Guardar registros para siguiente prueba
            this.testAttendanceRecords = result.records;
            
        } catch (error) {
            console.error('❌ Error en flujo de asistencia:', error);
            this.addTestResult('ATTENDANCE_Flow', false, error.message);
        }
    },

    /**
     * TEST 5: Guardado en Backend
     */
    async testBackendSave() {
        console.log('\\n💾 TEST 5: GUARDADO EN BACKEND');
        console.log('================================');
        
        if (!this.testAttendanceRecords || this.testAttendanceRecords.length === 0) {
            console.log('⚠️ No hay registros de prueba para guardar');
            this.addTestResult('SAVE_Backend', false, 'No test records');
            return;
        }

        try {
            console.log('  Intentando guardar registros...');
            console.log('  Registros a guardar:', this.testAttendanceRecords.length);
            
            // Log detallado del primer registro
            console.log('  Primer registro completo:', 
                JSON.stringify(this.testAttendanceRecords[0], null, 2));
            
            const saveResult = await AttendanceService.saveAttendance(
                this.testAttendanceRecords,
                { type: 'diagnostic_test' }
            );
            
            console.log('  Resultado del guardado:', saveResult);
            
            if (saveResult.success) {
                console.log('✅ Guardado exitoso');
                this.addTestResult('SAVE_Backend', true, 
                    `Method: ${saveResult.method}, Saved: ${saveResult.saved}`);
            } else {
                console.error('❌ Guardado falló:', saveResult.error);
                this.addTestResult('SAVE_Backend', false, saveResult.error);
            }
            
        } catch (error) {
            console.error('❌ Error al guardar:', error);
            this.addTestResult('SAVE_Backend', false, error.message);
            
            // Analizar el error
            if (error.message.includes('network')) {
                console.log('🔍 Problema de red detectado');
            } else if (error.message.includes('validation')) {
                console.log('🔍 Problema de validación de datos');
            } else if (error.message.includes('permission')) {
                console.log('🔍 Problema de permisos');
            }
        }
    },

    /**
     * TEST 6: Proceso de Sincronización
     */
    async testSyncProcess() {
        console.log('\\n🔄 TEST 6: SINCRONIZACIÓN');
        console.log('================================');
        
        // Verificar datos pendientes
        const pendingData = StorageUtils.getPendingAttendance();
        console.log(`  Datos pendientes: ${pendingData.length}`);
        
        this.addTestResult('SYNC_PendingData', true, 
            `Pending: ${pendingData.length}`);
        
        if (pendingData.length > 0) {
            console.log('  Primeros datos pendientes:', 
                pendingData.slice(0, 2));
            
            // Intentar sincronizar uno
            try {
                const firstPending = pendingData[0];
                console.log('  Intentando sincronizar primer registro...');
                
                const formattedData = [firstPending.data];
                const syncResult = await SheetsAPI.saveAttendance(formattedData);
                
                console.log('  Resultado sincronización:', syncResult);
                this.addTestResult('SYNC_TestSync', true, 'OK');
                
            } catch (error) {
                console.error('  Error en sincronización:', error.message);
                this.addTestResult('SYNC_TestSync', false, error.message);
            }
        }
    },

    /**
     * Agregar resultado de prueba
     */
    addTestResult(testName, success, details) {
        const result = {
            test: testName,
            success: success,
            details: details,
            timestamp: new Date().toISOString()
        };
        
        this.testResults.push(result);
        this.currentTestSession.tests.push(result);
    },

    /**
     * Generar reporte final
     */
    generateReport() {
        console.log('\\n📊 ========================================');
        console.log('📊 REPORTE DE DIAGNÓSTICO');
        console.log('📊 ========================================\\n');
        
        const successCount = this.testResults.filter(r => r.success).length;
        const failCount = this.testResults.filter(r => !r.success).length;
        
        console.log(`✅ Pruebas exitosas: ${successCount}`);
        console.log(`❌ Pruebas fallidas: ${failCount}`);
        console.log(`📊 Total de pruebas: ${this.testResults.length}`);
        
        if (failCount > 0) {
            console.log('\\n⚠️ PRUEBAS FALLIDAS:');
            console.log('====================');
            this.testResults
                .filter(r => !r.success)
                .forEach(r => {
                    console.log(`\\n❌ ${r.test}`);
                    console.log(`   Detalles: ${r.details}`);
                });
        }
        
        // Diagnóstico específico del problema
        console.log('\\n🔍 DIAGNÓSTICO ESPECÍFICO:');
        console.log('==========================');
        
        const classCreated = this.testResults.find(r => 
            r.test.includes('CLASS_Creation'))?.success;
        const attendanceCreated = this.testResults.find(r => 
            r.test.includes('ATTENDANCE_CreateRecords'))?.success;
        const backendSave = this.testResults.find(r => 
            r.test.includes('SAVE_Backend'))?.success;
        
        if (classCreated && !backendSave) {
            console.log('🔍 PROBLEMA IDENTIFICADO: La clase se crea pero las asistencias no se guardan');
            console.log('   Posibles causas:');
            console.log('   1. Formato incorrecto de datos de asistencia');
            console.log('   2. Problema en el endpoint saveAttendance del backend');
            console.log('   3. Validación fallida en el backend');
            console.log('   4. Problema de permisos en Google Sheets');
        }
        
        if (!attendanceCreated) {
            console.log('🔍 PROBLEMA: No se pueden crear registros de asistencia');
            console.log('   Verificar AttendanceService.createGroupAttendanceRecords()');
        }
        
        // Guardar reporte
        StorageUtils.save('diagnostic_report_' + Date.now(), this.currentTestSession);
        
        console.log('\\n💾 Reporte guardado en localStorage');
        console.log('📋 Para ver detalles completos: AttendanceDiagnostics.testResults');
        
        return this.currentTestSession;
    }
};

// Hacer disponible globalmente
window.AttendanceDiagnostics = AttendanceDiagnostics;

/**
 * FUNCIÓN RÁPIDA DE DIAGNÓSTICO
 */
window.diagnoseAttendance = async function() {
    console.clear();
    console.log('🚀 Iniciando diagnóstico de asistencias...\\n');
    await AttendanceDiagnostics.runFullDiagnostics();
};

/**
 * FUNCIÓN DE PRUEBA RÁPIDA
 */
window.quickTestSave = async function() {
    console.log('🧪 Prueba rápida de guardado...\\n');
    
    const testData = [{
        ID: 'QUICK_TEST_' + Date.now(),
        ID_Clase: 'QUICK_CLASS_123',
        Fecha: DateUtils.getCurrentDate(),
        Estudiante_ID: 'QUICK_STUDENT',
        Grupo_Codigo: 'QUICK_GROUP',
        Tipo_Clase: 'Regular',
        Estado: 'Presente',
        Justificacion: '',
        Descripcion: 'Prueba rápida',
        Enviado_Por: 'quick_test',
        Timestamp: DateUtils.getCurrentTimestamp()
    }];
    
    console.log('📋 Datos a guardar:', testData);
    
    try {
        const result = await SheetsAPI.saveAttendance(testData);
        console.log('✅ Resultado:', result);
    } catch (error) {
        console.error('❌ Error:', error);
        console.log('🔍 Tipo de error:', error.name);
        console.log('🔍 Mensaje:', error.message);
        console.log('🔍 Stack:', error.stack);
    }
};

console.log('🔧 Sistema de diagnóstico cargado');
console.log('📋 Comandos disponibles:');
console.log('   - diagnoseAttendance() : Diagnóstico completo');
console.log('   - quickTestSave() : Prueba rápida de guardado');
console.log('   - AttendanceDiagnostics.testResults : Ver resultados');
