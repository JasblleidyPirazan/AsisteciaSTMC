/**
 * DIAGNÓSTICO ESPECÍFICO PARA GRUPOS
 * ===================================
 * Herramienta para diagnosticar problemas con grupos específicos como S41 y S942
 */

const GroupDiagnostics = {
    /**
     * Diagnostica un grupo específico
     */
    async diagnoseGroup(groupCode) {
        console.log(`\n🔍 ========================================`);
        console.log(`🔍 DIAGNÓSTICO DEL GRUPO: ${groupCode}`);
        console.log(`🔍 ========================================\n`);

        const diagnosticResults = {
            groupCode,
            timestamp: new Date().toISOString(),
            checks: [],
            recommendations: []
        };

        try {
            // 1. Buscar grupo en datos raw del backend
            console.log('1️⃣  Verificando datos en el backend...');
            const rawGroups = await SheetsAPI.getGroups();
            const rawGroup = rawGroups.find(g =>
                String(g.codigo || g.Codigo || g.CODIGO || '').trim() === groupCode ||
                String(g.código || '').trim() === groupCode
            );

            if (!rawGroup) {
                console.error(`❌ Grupo ${groupCode} NO encontrado en backend`);
                diagnosticResults.checks.push({
                    name: 'Backend Data',
                    status: 'FAILED',
                    message: 'Grupo no existe en Google Sheets'
                });
                diagnosticResults.recommendations.push(
                    'Verificar que el grupo existe en la hoja de Google Sheets'
                );
            } else {
                console.log(`✅ Grupo encontrado en backend`);
                console.log('   Datos raw:', rawGroup);
                diagnosticResults.checks.push({
                    name: 'Backend Data',
                    status: 'OK',
                    data: rawGroup
                });
            }

            // 2. Verificar normalización
            console.log('\n2️⃣  Verificando normalización de datos...');
            const allGroups = await GroupService.getAllGroups(true); // Force refresh
            const normalizedGroup = allGroups.find(g => g.codigo === groupCode);

            if (!normalizedGroup && rawGroup) {
                console.error(`❌ Grupo ${groupCode} SE PERDIÓ durante la normalización`);
                diagnosticResults.checks.push({
                    name: 'Normalization',
                    status: 'FAILED',
                    message: 'El grupo fue excluido durante la normalización'
                });

                // Verificar campos críticos
                const codigo = rawGroup.codigo || rawGroup.Codigo || rawGroup.código || '';
                const hora = rawGroup.hora || rawGroup.Hora || rawGroup.horario || '';
                const profe = rawGroup.profe || rawGroup.Profe || rawGroup.profesor || '';

                console.log('\n   📋 Campos críticos encontrados:');
                console.log(`      codigo: "${codigo}" ${!codigo ? '❌ FALTANTE' : '✅'}`);
                console.log(`      hora: "${hora}" ${!hora ? '❌ FALTANTE' : '✅'}`);
                console.log(`      profe: "${profe}" ${!profe ? '❌ FALTANTE' : '✅'}`);

                if (!codigo) {
                    diagnosticResults.recommendations.push(
                        `Agregar columna "codigo" con valor "${groupCode}" en Google Sheets`
                    );
                }
                if (!hora) {
                    diagnosticResults.recommendations.push(
                        'Agregar columna "hora" con el horario del grupo (ej: "10:00-11:00")'
                    );
                }
                if (!profe) {
                    diagnosticResults.recommendations.push(
                        'Agregar columna "profe" con el nombre del profesor'
                    );
                }
            } else if (normalizedGroup) {
                console.log(`✅ Grupo normalizado correctamente`);
                console.log('   Datos normalizados:', normalizedGroup);
                diagnosticResults.checks.push({
                    name: 'Normalization',
                    status: 'OK',
                    data: normalizedGroup
                });
            }

            // 3. Verificar estado activo
            console.log('\n3️⃣  Verificando estado activo...');
            if (normalizedGroup) {
                if (!normalizedGroup.activo) {
                    console.warn(`⚠️  Grupo ${groupCode} está INACTIVO`);
                    diagnosticResults.checks.push({
                        name: 'Active Status',
                        status: 'WARNING',
                        message: 'Grupo marcado como inactivo'
                    });

                    const activoRaw = rawGroup?.activo || rawGroup?.Activo || '';
                    console.log(`   Valor raw de "activo": "${activoRaw}"`);
                    diagnosticResults.recommendations.push(
                        'Cambiar columna "activo" a "TRUE" o "1" o "X" en Google Sheets'
                    );
                } else {
                    console.log(`✅ Grupo está activo`);
                    diagnosticResults.checks.push({
                        name: 'Active Status',
                        status: 'OK'
                    });
                }
            }

            // 4. Verificar días de la semana
            console.log('\n4️⃣  Verificando días de la semana...');
            if (normalizedGroup) {
                const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
                const activeDays = days.filter(day => normalizedGroup[day] === true);

                if (activeDays.length === 0) {
                    console.error(`❌ Grupo ${groupCode} NO tiene días activos`);
                    diagnosticResults.checks.push({
                        name: 'Active Days',
                        status: 'FAILED',
                        message: 'Ningún día de la semana está marcado como activo'
                    });

                    console.log('\n   📋 Valores de días en datos raw:');
                    days.forEach(day => {
                        const dayValue = rawGroup?.[day] || rawGroup?.[day.charAt(0).toUpperCase() + day.slice(1)] || '';
                        console.log(`      ${day}: "${dayValue}"`);
                    });

                    diagnosticResults.recommendations.push(
                        'Marcar al menos un día de la semana como "TRUE" o "X" en Google Sheets'
                    );
                } else {
                    console.log(`✅ Días activos: ${activeDays.join(', ')}`);
                    diagnosticResults.checks.push({
                        name: 'Active Days',
                        status: 'OK',
                        activeDays
                    });
                }
            }

            // 5. Verificar si aparece en el día de hoy
            console.log('\n5️⃣  Verificando si aparece en el dashboard...');
            const today = DateUtils.getCurrentDay();
            const todayGroups = await GroupService.getTodayGroups();
            const appearsToday = todayGroups.some(g => g.codigo === groupCode);

            if (appearsToday) {
                console.log(`✅ Grupo aparece en el dashboard de hoy (${today})`);
                diagnosticResults.checks.push({
                    name: 'Dashboard Visibility Today',
                    status: 'OK'
                });
            } else {
                console.warn(`⚠️  Grupo NO aparece en el dashboard de hoy (${today})`);
                diagnosticResults.checks.push({
                    name: 'Dashboard Visibility Today',
                    status: 'WARNING',
                    message: `No programado para ${today}`
                });

                if (normalizedGroup) {
                    const todayActive = normalizedGroup[today];
                    console.log(`   El grupo está marcado para hoy (${today}): ${todayActive ? 'SÍ' : 'NO'}`);
                }
            }

            // 6. Buscar en todos los días
            console.log('\n6️⃣  Verificando en qué días aparece...');
            const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
            const daysFound = [];

            for (const day of days) {
                const dayGroups = await GroupService.getGroupsByDay(day);
                if (dayGroups.some(g => g.codigo === groupCode)) {
                    daysFound.push(day);
                }
            }

            if (daysFound.length > 0) {
                console.log(`✅ Grupo aparece en: ${daysFound.join(', ')}`);
                diagnosticResults.checks.push({
                    name: 'Weekly Schedule',
                    status: 'OK',
                    days: daysFound
                });
            } else {
                console.error(`❌ Grupo NO aparece en ningún día de la semana`);
                diagnosticResults.checks.push({
                    name: 'Weekly Schedule',
                    status: 'FAILED',
                    message: 'No programado para ningún día'
                });
            }

        } catch (error) {
            console.error(`\n❌ Error durante el diagnóstico:`, error);
            diagnosticResults.checks.push({
                name: 'Diagnostic Error',
                status: 'ERROR',
                message: error.message
            });
        }

        // Generar reporte final
        this.generateDiagnosticReport(diagnosticResults);

        return diagnosticResults;
    },

    /**
     * Diagnostica múltiples grupos
     */
    async diagnoseMultipleGroups(groupCodes) {
        console.log(`\n🔍 Diagnóstico de ${groupCodes.length} grupos...`);
        const results = [];

        for (const code of groupCodes) {
            const result = await this.diagnoseGroup(code);
            results.push(result);
        }

        return results;
    },

    /**
     * Genera reporte final del diagnóstico
     */
    generateDiagnosticReport(diagnosticResults) {
        console.log(`\n\n📊 ========================================`);
        console.log(`📊 REPORTE DE DIAGNÓSTICO`);
        console.log(`📊 ========================================\n`);

        const passedChecks = diagnosticResults.checks.filter(c => c.status === 'OK').length;
        const failedChecks = diagnosticResults.checks.filter(c => c.status === 'FAILED').length;
        const warningChecks = diagnosticResults.checks.filter(c => c.status === 'WARNING').length;

        console.log(`✅ Verificaciones exitosas: ${passedChecks}`);
        console.log(`❌ Verificaciones fallidas: ${failedChecks}`);
        console.log(`⚠️  Advertencias: ${warningChecks}`);

        if (diagnosticResults.recommendations.length > 0) {
            console.log(`\n\n💡 RECOMENDACIONES:`);
            console.log(`==================`);
            diagnosticResults.recommendations.forEach((rec, index) => {
                console.log(`\n${index + 1}. ${rec}`);
            });
        }

        console.log(`\n\n📋 Detalles completos guardados en:`);
        console.log(`   GroupDiagnostics.lastDiagnostic`);

        this.lastDiagnostic = diagnosticResults;

        return diagnosticResults;
    },

    /**
     * Verifica todos los grupos con problemas potenciales
     */
    async findProblematicGroups() {
        console.log(`\n🔍 Buscando grupos con problemas potenciales...\n`);

        const rawGroups = await SheetsAPI.getGroups();
        const normalizedGroups = await GroupService.getAllGroups(true);

        const problematic = [];

        // Grupos que existen en raw pero no en normalized
        rawGroups.forEach(rawGroup => {
            const codigo = rawGroup.codigo || rawGroup.Codigo || rawGroup.código || '';
            if (codigo) {
                const normalized = normalizedGroups.find(g => g.codigo === codigo);
                if (!normalized) {
                    problematic.push({
                        codigo,
                        issue: 'Perdido en normalización',
                        rawData: rawGroup
                    });
                }
            }
        });

        // Grupos normalizados pero inactivos
        normalizedGroups.forEach(group => {
            if (!group.activo) {
                problematic.push({
                    codigo: group.codigo,
                    issue: 'Inactivo',
                    data: group
                });
            }
        });

        // Grupos sin días activos
        normalizedGroups.forEach(group => {
            const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
            const hasActiveDays = days.some(day => group[day] === true);
            if (!hasActiveDays && group.activo) {
                problematic.push({
                    codigo: group.codigo,
                    issue: 'Sin días activos',
                    data: group
                });
            }
        });

        console.log(`\n📊 Encontrados ${problematic.length} grupos con problemas:`);
        console.log(`=====================================\n`);

        problematic.forEach((p, index) => {
            console.log(`${index + 1}. ${p.codigo} - ${p.issue}`);
        });

        return problematic;
    }
};

// Hacer disponible globalmente
window.GroupDiagnostics = GroupDiagnostics;

/**
 * FUNCIÓN RÁPIDA PARA DIAGNOSTICAR GRUPOS ESPECÍFICOS
 */
window.diagnoseGroups = async function(...groupCodes) {
    if (groupCodes.length === 0) {
        console.log('❌ Uso: diagnoseGroups("S41", "S942", ...)');
        return;
    }

    if (groupCodes.length === 1) {
        return await GroupDiagnostics.diagnoseGroup(groupCodes[0]);
    } else {
        return await GroupDiagnostics.diagnoseMultipleGroups(groupCodes);
    }
};

/**
 * FUNCIÓN PARA ENCONTRAR GRUPOS CON PROBLEMAS
 */
window.findProblematicGroups = async function() {
    return await GroupDiagnostics.findProblematicGroups();
};

console.log('🔧 Sistema de diagnóstico de grupos cargado');
console.log('📋 Comandos disponibles:');
console.log('   - diagnoseGroups("S41") : Diagnosticar grupo específico');
console.log('   - diagnoseGroups("S41", "S942") : Diagnosticar múltiples grupos');
console.log('   - findProblematicGroups() : Buscar todos los grupos con problemas');
console.log('   - GroupDiagnostics.lastDiagnostic : Ver último diagnóstico');
