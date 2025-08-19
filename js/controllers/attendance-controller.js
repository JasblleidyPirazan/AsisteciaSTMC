/**
 * CONTROLADOR DE ASISTENCIA - VERSIÓN DEBUG MEJORADA
 * ===========================================================
 * OBJETIVO: Identificar y depurar fallos en el guardado de estudiantes
 */

const AttendanceControllerDebug = {
    /**
     * ✅ MÉTODO DE DEBUG: Confirmación final con logging extensivo
     */
    async confirmFinalSaveDebug() {
        console.log('🔍 DEBUG: === INICIANDO CONFIRMACIÓN FINAL ===');

        try {
            // 1. VERIFICAR ESTADO ANTES DE GUARDAR
            const attendanceData = AttendanceController._state?.attendanceData || {};
            const attendanceCount = Object.keys(attendanceData).length;

            console.log('🔍 DEBUG: Estado inicial:', {
                attendanceCount,
                attendanceData,
                currentGroup: AttendanceController._state?.currentGroup,
                selectedAssistant: AttendanceController._state?.selectedAssistant,
                draftSession: AttendanceController._state?.draftSession
            });

            if (attendanceCount === 0) {
                throw new Error('No hay asistencia registrada para guardar');
            }

            // 2. VERIFICAR DATOS NECESARIOS
            const selectedDate =
                AttendanceController._state?.draftSession?.fecha ||
                window?.AppState?.selectedDate ||
                (typeof DateUtils !== 'undefined' ? DateUtils.getCurrentDate() : new Date().toISOString().split('T')[0]);

            const groupCode =
                AttendanceController._state?.draftSession?.groupCode ||
                AttendanceController._state?.currentGroup?.codigo;

            const selectedAssistant = AttendanceController._state?.selectedAssistant;

            console.log('🔍 DEBUG: Datos para guardado:', {
                selectedDate,
                groupCode,
                selectedAssistant
            });

            if (!groupCode) {
                throw new Error('Código de grupo no disponible');
            }

            // 3. CREAR REGISTRO DE CLASE PASO A PASO
            console.log('🔍 DEBUG: === CREANDO REGISTRO DE CLASE ===');

            if (typeof ClassControlService?.createClassRecord !== 'function') {
                throw new Error('ClassControlService.createClassRecord no está disponible');
            }

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

            // 4. CREAR REGISTROS DE ASISTENCIA
            console.log('🔍 DEBUG: === CREANDO REGISTROS DE ASISTENCIA ===');

            const options = {
                groupCode,
                date: selectedDate,
                classType: 'Regular',
                ID_Clase: classRecord.id, // ✅ Usamos nombre consistente
                sentBy: window?.AppState?.user?.email || 'usuario'
            };

            console.log('🔍 DEBUG: Options para createGroupAttendanceRecords:', options);

            if (typeof AttendanceService?.createGroupAttendanceRecords !== 'function') {
                throw new Error('AttendanceService.createGroupAttendanceRecords no está disponible');
            }

            const { records, errors } = await AttendanceService.createGroupAttendanceRecords(attendanceData, options);

            console.log('🔍 DEBUG: Resultado de createGroupAttendanceRecords:', {
                recordsCount: records.length,
                errorsCount: errors.length,
                sampleRecord: records[0],
                errors
            });

            // 5. VERIFICAR QUE TODOS LOS REGISTROS TIENEN ID_Clase
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

            // 6. GUARDAR ASISTENCIAS
            console.log('🔍 DEBUG: === GUARDANDO ASISTENCIAS ===');
            console.log('🔍 DEBUG: Enviando a AttendanceService.saveAttendance:', {
                recordsToSave: records.length,
                firstRecordSample: records[0]
            });

            if (typeof AttendanceService?.saveAttendance !== 'function') {
                throw new Error('AttendanceService.saveAttendance no está disponible');
            }

            const saveResult = await AttendanceService.saveAttendance(records);

            console.log('🔍 DEBUG: Resultado de saveAttendance:', saveResult);

            // 7. VERIFICAR GUARDADO EXITOSO
            if (!saveResult?.success) {
                throw new Error(`Error al guardar asistencias: ${saveResult?.error}`);
            }

            console.log('✅ DEBUG: === GUARDADO EXITOSO ===');
            console.log('✅ DEBUG: Resumen final:', {
                classId: classRecord.id,
                attendanceRecords: records.length,
                method: saveResult.method,
                assistantId: selectedAssistant?.id || 'Sin asistente'
            });

            // 8. MOSTRAR ÉXITO Y LIMPIAR
            AttendanceController._clearDraftFromLocalStorage?.();
            AttendanceController._showSuccessModal?.({
                classRecord,
                attendanceResult: saveResult
            }, groupCode, selectedDate, attendanceCount, selectedAssistant);

            return {
                success: true,
                classRecord,
                attendanceResult: saveResult,
                debug: 'Guardado completado exitosamente'
            };

        } catch (error) {
            console.error('❌ DEBUG: Error en confirmación final:', error);
            console.error('❌ DEBUG: Stack trace:', error.stack);

            // Eliminar modal previo si existe
            const oldModal = document.getElementById('error-debug-modal');
            if (oldModal) oldModal.remove();

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
                                    attendanceCount: Object.keys(AttendanceController._state?.attendanceData || {}).length,
                                    groupCode: AttendanceController._state?.currentGroup?.codigo,
                                    selectedDate: window?.AppState?.selectedDate,
                                    assistantId: AttendanceController._state?.selectedAssistant?.id
                                }, null, 2)}</pre>
                            </div>
                            <div class="flex gap-3">
                                <button onclick="AttendanceController._closeErrorDebugModal()" class="btn btn-primary">
                                    Cerrar
                                </button>
                                <button onclick="console.log('DEBUG State:', AttendanceController.getState?.())" class="btn btn-outline">
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
        if (modal) modal.remove();
    },

    /**
     * ✅ MÉTODO DE DEBUG: Verifica flujo completo paso a paso
     */
    async debugCompleteFlow() {
        console.log('🔍 DEBUG: === VERIFICACIÓN COMPLETA DEL FLUJO ===');

        try {
            // 1. Verificar AttendanceService
            console.log('🔍 DEBUG: 1. Verificando AttendanceService...');
            if (typeof AttendanceService?.createAttendanceRecord === 'function') {
                const testRecord = AttendanceService.createAttendanceRecord(
                    'TEST_STUDENT',
                    'TEST_GROUP',
                    'Presente',
                    {
                        date: '2025-07-15',
                        classType: 'Regular',
                        ID_Clase: 'TEST_CLASS_ID'
                    }
                );
                console.log('✅ DEBUG: AttendanceService funcional:', testRecord);
            } else {
                throw new Error('AttendanceService.createAttendanceRecord no disponible');
            }

            // 2. Verificar ClassControlService
            console.log('🔍 DEBUG: 2. Verificando ClassControlService...');
            if (typeof ClassControlService?.createClassRecord === 'function') {
                console.log('✅ DEBUG: ClassControlService.createClassRecord disponible');
            } else {
                throw new Error('ClassControlService.createClassRecord no disponible');
            }

            // 3. Verificar SheetsAPI
            console.log('🔍 DEBUG: 3. Verificando SheetsAPI...');
            if (typeof SheetsAPI?.saveAttendance === 'function') {
                console.log('✅ DEBUG: SheetsAPI.saveAttendance disponible');
            } else {
                throw new Error('SheetsAPI.saveAttendance no disponible');
            }

            // 4. Verificar estado actual
            console.log('🔍 DEBUG: 4. Estado actual del controlador:');
            const currentState = AttendanceController.getState?.();
            console.log('📊 Estado:', currentState);

            console.log('✅ DEBUG: Verificación completa exitosa');

            return {
                success: true,
                attendanceService: 'OK',
                classControlService: 'OK',
                sheetsAPI: 'OK',
                currentState
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
            const attendanceData = AttendanceController._state?.attendanceData || {};
            const groupCode = AttendanceController._state?.currentGroup?.codigo || 'TEST_GROUP';
            const selectedDate = window?.AppState?.selectedDate ||
                (typeof DateUtils !== 'undefined' ? DateUtils.getCurrentDate() : new Date().toISOString().split('T')[0]);

            console.log('🔍 SIMULACIÓN: Datos de entrada:', {
                attendanceCount: Object.keys(attendanceData).length,
                groupCode,
                selectedDate
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
                groupCode,
                date: selectedDate,
                classType: 'Regular',
                ID_Clase: mockClassRecord.id,
                sentBy: 'test-user'
            };

            const { records, errors } = await AttendanceService.createGroupAttendanceRecords(attendanceData, options);

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
                mockClassRecord,
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
window.debugAttendanceFlow = () => AttendanceController.debugCompleteFlow();
window.simulateAttendanceSave = () => AttendanceController.simulateFullSave();
window.debugConfirmSave = () => AttendanceController.confirmFinalSaveDebug();

console.log('🔍 AttendanceController Debug cargado - Nuevas funciones disponibles:');
console.log('  - debugAttendanceFlow() - Verifica todo el flujo');
console.log('  - simulateAttendanceSave() - Simula guardado sin backend');
console.log('  - debugConfirmSave() - Confirmación con logging extensivo');
