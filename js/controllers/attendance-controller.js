/**
 * CONTROLADOR DE ASISTENCIA - VERSIÓN DEBUG PARA DIAGNÓSTICO
 * ===========================================================
 * OBJETIVO: Identificar exactamente dónde falla el guardado de estudiantes
 */

const AttendanceControllerDebug = {
    /**
     * ✅ MÉTODO DE DEBUG: Confirmación final con logging extensivo
     */
    async confirmFinalSaveDebug() {
        console.log('🔍 DEBUG: === INICIANDO CONFIRMACIÓN FINAL ===');
        
        try {
            // 1. VERIFICAR ESTADO ANTES DE GUARDAR
            const attendanceData = this._state.attendanceData;
            const attendanceCount = Object.keys(attendanceData).length;
            
            console.log('🔍 DEBUG: Estado inicial:', {
                attendanceCount: attendanceCount,
                attendanceData: attendanceData,
                currentGroup: this._state.currentGroup,
                selectedAssistant: this._state.selectedAssistant,
                draftSession: this._state.draftSession
            });
            
            if (attendanceCount === 0) {
                throw new Error('No hay asistencia registrada para guardar');
            }
            
            // 2. VERIFICAR DATOS NECESARIOS
            const selectedDate = this._state.draftSession?.fecha || window.AppState.selectedDate || DateUtils.getCurrentDate();
            const groupCode = this._state.draftSession?.groupCode || this._state.currentGroup?.codigo;
            const selectedAssistant = this._state.selectedAssistant;
            
            console.log('🔍 DEBUG: Datos para guardado:', {
                selectedDate: selectedDate,
                groupCode: groupCode,
                selectedAssistant: selectedAssistant
            });
            
            if (!groupCode) {
                throw new Error('Código de grupo no disponible');
            }
            
            // 3. CREAR REGISTRO DE CLASE PASO A PASO
            console.log('🔍 DEBUG: === CREANDO REGISTRO DE CLASE ===');
            
            const classRecord = await ClassControlService.createClassRecord(
                selectedDate, 
                groupCode, 
                'Realizada', 
                {
                    asistenteId: selectedAssistant?.id || ''
                }
            );
            
            console.log('🔍 DEBUG: Registro de clase creado:', classRecord);
            
            if (!classRecord || !classRecord.id) {
                throw new Error('No se pudo crear el registro de clase o falta el ID');
            }
            
            // 4. CREAR REGISTROS DE ASISTENCIA CON DEBUG
            console.log('🔍 DEBUG: === CREANDO REGISTROS DE ASISTENCIA ===');
            
            const options = {
                groupCode: groupCode,
                date: selectedDate,
                classType: 'Regular',
                idClase: classRecord.id, // ✅ CRÍTICO: Pasar ID aquí
                sentBy: window.AppState?.user?.email || 'usuario'
            };
            
            console.log('🔍 DEBUG: Options para createGroupAttendanceRecords:', options);
            
            const { records, errors } = AttendanceService.createGroupAttendanceRecords(
                attendanceData,
                options
            );
            
            console.log('🔍 DEBUG: Resultado de createGroupAttendanceRecords:', {
                recordsCount: records.length,
                errorsCount: errors.length,
                sampleRecord: records[0],
                errors: errors
            });
            
            // 5. VERIFICAR QUE TODOS LOS REGISTROS TIENEN ID_CLASE
            const recordsWithoutClass = records.filter(r => !r.ID_Clase);
            console.log('🔍 DEBUG: Verificación ID_Clase:', {
                totalRecords: records.length,
                recordsWithoutClass: recordsWithoutClass.length,
                recordsWithClass: records.length - recordsWithoutClass.length
            });
            
            if (recordsWithoutClass.length > 0) {
                console.error('❌ DEBUG: Registros sin ID_Clase:', recordsWithoutClass);
                throw new Error(`${recordsWithoutClass.length} registros sin ID_Clase`);
            }
            
            // 6. GUARDAR ASISTENCIAS CON DEBUG
            console.log('🔍 DEBUG: === GUARDANDO ASISTENCIAS ===');
            console.log('🔍 DEBUG: Enviando a AttendanceService.saveAttendance:', {
                recordsToSave: records.length,
                firstRecordSample: records[0]
            });
            
            const saveResult = await AttendanceService.saveAttendance(records);
            
            console.log('🔍 DEBUG: Resultado de saveAttendance:', saveResult);
            
            // 7. VERIFICAR GUARDADO EXITOSO
            if (!saveResult.success) {
                throw new Error(`Error al guardar asistencias: ${saveResult.error}`);
            }
            
            console.log('✅ DEBUG: === GUARDADO EXITOSO ===');
            console.log('✅ DEBUG: Resumen final:', {
                classId: classRecord.id,
                attendanceRecords: records.length,
                method: saveResult.method,
                assistantId: selectedAssistant?.id || 'Sin asistente'
            });
            
            // 8. MOSTRAR ÉXITO Y LIMPIAR
            this._clearDraftFromLocalStorage();
            this._showSuccessModal({
                classRecord: classRecord,
                attendanceResult: saveResult
            }, groupCode, selectedDate, attendanceCount, selectedAssistant);
            
            return {
                success: true,
                classRecord: classRecord,
                attendanceResult: saveResult,
                debug: 'Guardado completado exitosamente'
            };
            
        } catch (error) {
            console.error('❌ DEBUG: Error en confirmación final:', error);
            console.error('❌ DEBUG: Stack trace:', error.stack);
            
            // Mostrar modal de error con detalles
            const errorHTML = `
                <div id="error-debug-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50">
                    <div class="flex items-center justify-center min-h-screen p-4">
                        <div class="bg-white rounded-lg p-8 max-w-2xl w-full max-h-96 overflow-y-auto">
                            <h3 class="text-xl font-bold text-red-900 mb-4">❌ Error en Guardado (DEBUG)</h3>
                            <div class="bg-red-50 p-4 rounded mb-4">
                                <p class="text-red-800 font-medium">Error:</p>
                                <p class="text-red-700">${error.message}</p>
                            </div>
                            <div class="bg-gray-50 p-4 rounded mb-4">
                                <p class="text-gray-800 font-medium">Estado del sistema:</p>
                                <pre class="text-xs text-gray-600 mt-2">${JSON.stringify({
                                    attendanceCount: Object.keys(this._state.attendanceData).length,
                                    groupCode: this._state.currentGroup?.codigo,
                                    selectedDate: window.AppState.selectedDate,
                                    assistantId: this._state.selectedAssistant?.id
                                }, null, 2)}</pre>
                            </div>
                            <div class="flex gap-3">
                                <button onclick="AttendanceController._closeErrorDebugModal()" class="btn btn-primary">
                                    Cerrar
                                </button>
                                <button onclick="console.log('DEBUG State:', AttendanceController.getState())" class="btn btn-outline">
                                    Log Estado Completo
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', errorHTML);
            
            throw error;
        }
    },

    /**
     * ✅ MÉTODO AUXILIAR: Cierra modal de error debug
     */
    _closeErrorDebugModal() {
        const modal = document.getElementById('error-debug-modal');
        if (modal) {
            modal.remove();
        }
    },

    /**
     * ✅ MÉTODO DE DEBUG: Verifica flujo completo paso a paso
     */
    async debugCompleteFlow() {
        console.log('🔍 DEBUG: === VERIFICACIÓN COMPLETA DEL FLUJO ===');
        
        try {
            // 1. Verificar AttendanceService
            console.log('🔍 DEBUG: 1. Verificando AttendanceService...');
            const testRecord = AttendanceService.createAttendanceRecord(
                'TEST_STUDENT',
                'TEST_GROUP', 
                'Presente',
                {
                    date: '2025-07-15',
                    classType: 'Regular',
                    idClase: 'TEST_CLASS_ID'
                }
            );
            
            console.log('✅ DEBUG: AttendanceService funcional, registro de prueba:', testRecord);
            
            // 2. Verificar ClassControlService
            console.log('🔍 DEBUG: 2. Verificando ClassControlService...');
            
            if (typeof ClassControlService.createClassRecord === 'function') {
                console.log('✅ DEBUG: ClassControlService.createClassRecord disponible');
            } else {
                throw new Error('ClassControlService.createClassRecord no disponible');
            }
            
            // 3. Verificar SheetsAPI
            console.log('🔍 DEBUG: 3. Verificando SheetsAPI...');
            
            if (typeof SheetsAPI.saveAttendance === 'function') {
                console.log('✅ DEBUG: SheetsAPI.saveAttendance disponible');
            } else {
                throw new Error('SheetsAPI.saveAttendance no disponible');
            }
            
            // 4. Verificar estado actual
            console.log('🔍 DEBUG: 4. Estado actual del controlador:');
            const currentState = AttendanceController.getState();
            console.log('📊 Estado:', currentState);
            
            console.log('✅ DEBUG: Verificación completa exitosa');
            
            return {
                success: true,
                attendanceService: 'OK',
                classControlService: 'OK',
                sheetsAPI: 'OK',
                currentState: currentState
            };
            
        } catch (error) {
            console.error('❌ DEBUG: Error en verificación:', error);
            throw error;
        }
    },

    /**
     * ✅ MÉTODO DE DEBUG: Simula guardado completo sin backend
     */
    async simulateFullSave() {
        console.log('🔍 SIMULACIÓN: === GUARDADO COMPLETO SIN BACKEND ===');
        
        try {
            const attendanceData = AttendanceController._state.attendanceData;
            const groupCode = AttendanceController._state.currentGroup?.codigo || 'TEST_GROUP';
            const selectedDate = window.AppState.selectedDate || DateUtils.getCurrentDate();
            
            console.log('🔍 SIMULACIÓN: Datos de entrada:', {
                attendanceCount: Object.keys(attendanceData).length,
                groupCode: groupCode,
                selectedDate: selectedDate
            });
            
            // Simular creación de clase
            const mockClassRecord = {
                id: `MOCK_CLASS_${Date.now()}`,
                fecha: selectedDate,
                grupo_codigo: groupCode,
                estado: 'Realizada'
            };
            
            console.log('🔍 SIMULACIÓN: Clase simulada:', mockClassRecord);
            
            // Crear registros de asistencia
            const options = {
                groupCode: groupCode,
                date: selectedDate,
                classType: 'Regular',
                idClase: mockClassRecord.id,
                sentBy: 'test-user'
            };
            
            const { records, errors } = AttendanceService.createGroupAttendanceRecords(
                attendanceData,
                options
            );
            
            console.log('🔍 SIMULACIÓN: Registros creados:', {
                count: records.length,
                errors: errors.length,
                sample: records[0]
            });
            
            // Verificar ID_Clase
            const recordsWithClass = records.filter(r => r.ID_Clase);
            console.log('🔍 SIMULACIÓN: Verificación ID_Clase:', {
                totalRecords: records.length,
                recordsWithClass: recordsWithClass.length,
                percentage: Math.round((recordsWithClass.length / records.length) * 100)
            });
            
            if (recordsWithClass.length === records.length) {
                console.log('✅ SIMULACIÓN: ¡Todos los registros tienen ID_Clase!');
            } else {
                console.error('❌ SIMULACIÓN: Algunos registros sin ID_Clase');
            }
            
            console.log('✅ SIMULACIÓN: Simulación completada exitosamente');
            
            return {
                success: true,
                mockClassRecord: mockClassRecord,
                attendanceRecords: records.length,
                allHaveClassId: recordsWithClass.length === records.length
            };
            
        } catch (error) {
            console.error('❌ SIMULACIÓN: Error:', error);
            throw error;
        }
    }
};

// Agregar métodos debug al controlador principal
Object.assign(AttendanceController, AttendanceControllerDebug);

// Funciones globales para testing
window.debugAttendanceFlow = AttendanceControllerDebug.debugCompleteFlow;
window.simulateAttendanceSave = AttendanceControllerDebug.simulateFullSave;
window.debugConfirmSave = () => AttendanceController.confirmFinalSaveDebug();

console.log('🔍 AttendanceController Debug cargado - Nuevas funciones disponibles:');
console.log('  - debugAttendanceFlow() - Verifica todo el flujo');
console.log('  - simulateAttendanceSave() - Simula guardado sin backend');
console.log('  - debugConfirmSave() - Confirmación con logging extensivo');
