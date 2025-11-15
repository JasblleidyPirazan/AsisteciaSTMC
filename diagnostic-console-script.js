/**
 * SCRIPT DE DIAGNÓSTICO STANDALONE
 * =================================
 * COPIA Y PEGA ESTE SCRIPT COMPLETO EN LA CONSOLA DEL NAVEGADOR
 * Para ejecutarlo: diagnosisS41() o diagnosisS942() o diagnosis("código_grupo")
 */

// Función principal de diagnóstico
async function diagnosis(groupCode) {
    console.log(`\n🔍 ========================================`);
    console.log(`🔍 DIAGNÓSTICO DEL GRUPO: ${groupCode}`);
    console.log(`🔍 ========================================\n`);

    const results = {
        groupCode,
        timestamp: new Date().toISOString(),
        checks: []
    };

    try {
        // 1. Verificar en datos raw del backend
        console.log('1️⃣  Verificando datos en el backend...');
        const rawGroups = await SheetsAPI.getGroups();
        console.log(`   Total grupos en backend: ${rawGroups.length}`);

        const rawGroup = rawGroups.find(g => {
            const codigo = String(g.codigo || g.Codigo || g.CODIGO || g.código || '').trim();
            return codigo === groupCode;
        });

        if (!rawGroup) {
            console.error(`❌ Grupo ${groupCode} NO encontrado en backend`);
            console.log('\n   📋 Códigos encontrados en backend:');
            const allCodes = rawGroups
                .map(g => String(g.codigo || g.Codigo || g.CODIGO || g.código || '').trim())
                .filter(c => c)
                .sort();
            console.log(`   ${allCodes.slice(0, 20).join(', ')}...`);
            results.checks.push({ name: 'Backend', status: '❌ NO ENCONTRADO' });
            return results;
        }

        console.log(`✅ Grupo encontrado en backend`);
        console.log('   Datos raw:', JSON.stringify(rawGroup, null, 2));
        results.checks.push({ name: 'Backend', status: '✅ OK', data: rawGroup });

        // 2. Verificar campos críticos
        console.log('\n2️⃣  Verificando campos críticos...');
        const codigo = rawGroup.codigo || rawGroup.Codigo || rawGroup.código || '';
        const hora = rawGroup.hora || rawGroup.Hora || rawGroup.horario || '';
        const profe = rawGroup.profe || rawGroup.Profe || rawGroup.profesor || '';

        console.log(`   codigo: "${codigo}" ${!codigo ? '❌ FALTANTE' : '✅'}`);
        console.log(`   hora: "${hora}" ${!hora ? '❌ FALTANTE' : '✅'}`);
        console.log(`   profe: "${profe}" ${!profe ? '❌ FALTANTE' : '✅'}`);

        const missingFields = [];
        if (!codigo) missingFields.push('codigo');
        if (!hora) missingFields.push('hora');
        if (!profe) missingFields.push('profe');

        if (missingFields.length > 0) {
            console.error(`❌ Campos faltantes: ${missingFields.join(', ')}`);
            console.log('\n💡 SOLUCIÓN: Agregar estos campos en Google Sheets para el grupo');
            results.checks.push({
                name: 'Campos Críticos',
                status: '❌ FALTANTES',
                missing: missingFields
            });
            return results;
        }

        results.checks.push({ name: 'Campos Críticos', status: '✅ OK' });

        // 3. Verificar normalización
        console.log('\n3️⃣  Verificando normalización...');
        const allGroups = await GroupService.getAllGroups(true);
        const normalizedGroup = allGroups.find(g => g.codigo === groupCode);

        if (!normalizedGroup) {
            console.error(`❌ Grupo ${groupCode} SE PERDIÓ durante la normalización`);
            console.log('   Esto NO debería pasar si tiene todos los campos críticos');
            results.checks.push({ name: 'Normalización', status: '❌ PERDIDO' });
            return results;
        }

        console.log(`✅ Grupo normalizado correctamente`);
        console.log('   Datos normalizados:', normalizedGroup);
        results.checks.push({ name: 'Normalización', status: '✅ OK' });

        // 4. Verificar estado activo
        console.log('\n4️⃣  Verificando estado activo...');
        const activoRaw = rawGroup.activo || rawGroup.Activo || '';
        const activoNormalized = normalizedGroup.activo;

        console.log(`   Valor raw: "${activoRaw}"`);
        console.log(`   Valor normalizado: ${activoNormalized}`);

        if (!activoNormalized) {
            console.error(`❌ Grupo está INACTIVO`);
            console.log('\n💡 SOLUCIÓN: Cambiar columna "activo" a "TRUE" o "1" o "X" en Google Sheets');
            results.checks.push({ name: 'Estado Activo', status: '❌ INACTIVO' });
        } else {
            console.log(`✅ Grupo está activo`);
            results.checks.push({ name: 'Estado Activo', status: '✅ ACTIVO' });
        }

        // 5. Verificar días de la semana
        console.log('\n5️⃣  Verificando días de la semana...');
        const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
        const activeDays = days.filter(day => normalizedGroup[day] === true);

        console.log('\n   📋 Valores de días:');
        days.forEach(day => {
            const dayValue = normalizedGroup[day];
            const rawValue = rawGroup[day] || rawGroup[day.charAt(0).toUpperCase() + day.slice(1)] || '';
            console.log(`      ${day}: ${dayValue ? '✅' : '❌'} (raw: "${rawValue}")`);
        });

        if (activeDays.length === 0) {
            console.error(`\n❌ NO tiene días activos`);
            console.log('💡 SOLUCIÓN: Marcar al menos un día como "TRUE" o "X" en Google Sheets');
            results.checks.push({ name: 'Días Activos', status: '❌ SIN DÍAS' });
        } else {
            console.log(`\n✅ Días activos: ${activeDays.join(', ')}`);
            results.checks.push({ name: 'Días Activos', status: '✅ OK', days: activeDays });
        }

        // 6. Verificar en dashboard de hoy
        console.log('\n6️⃣  Verificando dashboard de hoy...');
        const today = DateUtils.getCurrentDay();
        const todayGroups = await GroupService.getTodayGroups();
        const appearsToday = todayGroups.some(g => g.codigo === groupCode);

        console.log(`   Hoy es: ${today}`);
        console.log(`   Aparece en dashboard: ${appearsToday ? '✅ SÍ' : '❌ NO'}`);

        if (!appearsToday && normalizedGroup[today]) {
            console.warn('   ⚠️  Debería aparecer pero no aparece - posible filtro activo');
        }

        results.checks.push({
            name: 'Dashboard Hoy',
            status: appearsToday ? '✅ VISIBLE' : '❌ NO VISIBLE',
            today
        });

        // Resumen final
        console.log('\n\n📊 ========================================');
        console.log('📊 RESUMEN DEL DIAGNÓSTICO');
        console.log('📊 ========================================\n');

        results.checks.forEach(check => {
            console.log(`${check.status.includes('✅') ? '✅' : '❌'} ${check.name}: ${check.status}`);
        });

        const hasErrors = results.checks.some(c => c.status.includes('❌'));

        if (hasErrors) {
            console.log('\n\n⚠️  PROBLEMAS ENCONTRADOS - Ver soluciones arriba ⚠️');
        } else {
            console.log('\n\n✅ Grupo configurado correctamente');
        }

    } catch (error) {
        console.error(`\n❌ Error durante diagnóstico:`, error);
        results.checks.push({ name: 'Error', status: '❌', message: error.message });
    }

    return results;
}

// Funciones rápidas para S41 y S942
async function diagnosisS41() {
    return await diagnosis('S41');
}

async function diagnosisS942() {
    return await diagnosis('S942');
}

// Buscar todos los grupos con problemas
async function findAllProblems() {
    console.log('\n🔍 Buscando grupos con problemas...\n');

    const rawGroups = await SheetsAPI.getGroups();
    const normalizedGroups = await GroupService.getAllGroups(true);

    const problems = [];

    // Grupos que se perdieron
    rawGroups.forEach(rawGroup => {
        const codigo = String(rawGroup.codigo || rawGroup.Codigo || rawGroup.código || '').trim();
        if (codigo) {
            const normalized = normalizedGroups.find(g => g.codigo === codigo);
            if (!normalized) {
                problems.push({ codigo, issue: 'Perdido en normalización' });
            }
        }
    });

    // Grupos inactivos
    normalizedGroups.forEach(group => {
        if (!group.activo) {
            problems.push({ codigo: group.codigo, issue: 'Inactivo' });
        }
    });

    // Grupos sin días
    normalizedGroups.forEach(group => {
        const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
        const hasActiveDays = days.some(day => group[day] === true);
        if (!hasActiveDays && group.activo) {
            problems.push({ codigo: group.codigo, issue: 'Sin días activos' });
        }
    });

    console.log(`\n📊 Encontrados ${problems.length} grupos con problemas:\n`);
    problems.forEach((p, i) => {
        console.log(`${i + 1}. ${p.codigo} - ${p.issue}`);
    });

    return problems;
}

console.log('✅ Script de diagnóstico cargado');
console.log('\n📋 Comandos disponibles:');
console.log('   diagnosis("S41")     - Diagnosticar grupo S41');
console.log('   diagnosisS41()       - Atajo para S41');
console.log('   diagnosisS942()      - Atajo para S942');
console.log('   findAllProblems()    - Buscar todos los grupos con problemas');
console.log('\nEjemplo: diagnosisS41()\n');
