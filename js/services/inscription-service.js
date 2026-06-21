/**
 * SERVICIO DE INSCRIPCIÓN
 * =============================================================================
 * Permite a los padres/acudientes:
 *  ✅ Conocer las políticas de la Escuela
 *  ✅ Ver los grupos disponibles con sus cupos disponibles
 *  ✅ Buscar/filtrar grupos por días o por horas
 *  ✅ Inscribirse a un grupo principal y, opcionalmente, a un grupo secundario
 *
 * NOTA: Los cupos disponibles se calculan como (cupo_maximo - inscritos),
 * donde "inscritos" es la cantidad de estudiantes activos que tienen el grupo
 * como grupo principal o secundario.
 */

const InscriptionService = {
    // Cupo máximo por defecto cuando el grupo no define uno en la base de datos
    DEFAULT_CAPACITY: 8,

    /**
     * Políticas de la Escuela que el acudiente debe aceptar antes de inscribirse.
     * Se pueden editar libremente para reflejar el reglamento vigente.
     */
    _policies: [
        {
            titulo: 'Asistencia y puntualidad',
            texto: 'El estudiante debe presentarse puntualmente a sus clases. La tolerancia máxima es de 15 minutos; pasado este tiempo el profesor podrá no permitir el ingreso a la cancha por seguridad.'
        },
        {
            titulo: 'Inasistencias y reposiciones',
            texto: 'Las inasistencias deben justificarse con anticipación. Solo se programarán reposiciones para clases justificadas o canceladas por la Escuela (lluvia, festivos, etc.).'
        },
        {
            titulo: 'Cupos disponibles',
            texto: 'La inscripción está sujeta a la disponibilidad de cupos del grupo. Un grupo sin cupos disponibles no podrá recibir nuevas inscripciones.'
        },
        {
            titulo: 'Pagos y permanencia',
            texto: 'El valor de la mensualidad debe cancelarse dentro de los primeros cinco (5) días de cada mes. El no pago oportuno puede generar la pérdida del cupo.'
        },
        {
            titulo: 'Implementos y uniforme',
            texto: 'El estudiante debe asistir con ropa deportiva adecuada, calzado para cancha y su propia raqueta. La Escuela suministra las pelotas de entrenamiento.'
        },
        {
            titulo: 'Comportamiento y cuidado',
            texto: 'Se espera respeto hacia profesores, compañeros y las instalaciones. El uso indebido de los implementos o el mal comportamiento podrá ocasionar la suspensión.'
        },
        {
            titulo: 'Autorización de imagen',
            texto: 'El acudiente autoriza el uso de fotografías y videos tomados durante las actividades de la Escuela con fines pedagógicos y de difusión.'
        }
    ],

    /**
     * Devuelve las políticas de la Escuela
     */
    getSchoolPolicies() {
        return this._policies.map(p => ({ ...p }));
    },

    /**
     * Obtiene todos los grupos activos enriquecidos con la información de cupos.
     * Cada grupo incluye: cupo_maximo, inscritos y cupos_disponibles.
     */
    async getGroupsWithAvailability(forceRefresh = false) {
        debugLog('InscriptionService: Obteniendo grupos con disponibilidad de cupos...');

        try {
            const [allGroups, allStudents] = await Promise.all([
                GroupService.getAllGroups(forceRefresh),
                StudentService.getAllStudents(forceRefresh)
            ]);

            const activeGroups = allGroups.filter(group => group.activo);

            const enrichedGroups = activeGroups.map(group => {
                const capacity = this._getGroupCapacity(group);
                const inscritos = this._countEnrolled(group.codigo, allStudents);
                const disponibles = Math.max(capacity - inscritos, 0);

                return {
                    ...group,
                    cupo_maximo: capacity,
                    inscritos: inscritos,
                    cupos_disponibles: disponibles
                };
            });

            debugLog(`InscriptionService: ${enrichedGroups.length} grupos con disponibilidad calculada`);
            return enrichedGroups;

        } catch (error) {
            console.error('InscriptionService: Error al obtener grupos con disponibilidad:', error);
            throw error;
        }
    },

    /**
     * Cuenta los estudiantes activos inscritos en un grupo (principal o secundario)
     */
    _countEnrolled(groupCode, students) {
        if (!Array.isArray(students)) return 0;

        return students.filter(student => {
            return student.activo && (
                student.grupo_principal === groupCode ||
                student.grupo_secundario === groupCode
            );
        }).length;
    },

    /**
     * Determina el cupo máximo de un grupo (usa el valor de la base de datos o el default)
     */
    _getGroupCapacity(group) {
        const capacity = parseInt(group.cupo_maximo);
        if (!isNaN(capacity) && capacity > 0) {
            return capacity;
        }
        return this.DEFAULT_CAPACITY;
    },

    /**
     * Obtiene la lista de horarios disponibles (únicos y ordenados) para el filtro por hora
     */
    getAvailableHours(groups) {
        if (!Array.isArray(groups)) return [];

        const hours = groups
            .map(group => (group.hora || '').trim())
            .filter(hora => hora !== '');

        return [...new Set(hours)].sort();
    },

    /**
     * Filtra grupos por días, hora y término de búsqueda.
     * @param {Array} groups - grupos enriquecidos
     * @param {Object} filters - { days: [], hour: '', search: '', soloConCupo: bool }
     */
    filterGroups(groups, filters = {}) {
        if (!Array.isArray(groups)) return [];

        const {
            days = [],
            hour = '',
            search = '',
            soloConCupo = false
        } = filters;

        const searchTerm = search.toLowerCase().trim();

        return groups.filter(group => {
            // Filtro por días: el grupo debe estar activo en TODOS los días seleccionados
            if (days.length > 0) {
                const matchesDays = days.every(day => group[day] === true);
                if (!matchesDays) return false;
            }

            // Filtro por hora exacta
            if (hour && hour.trim() !== '') {
                if ((group.hora || '').trim() !== hour.trim()) return false;
            }

            // Filtro por búsqueda libre (código, profesor, nivel, descriptor)
            if (searchTerm) {
                const haystack = [
                    group.codigo,
                    group.profe,
                    group.bola,
                    group.descriptor,
                    group.hora
                ].join(' ').toLowerCase();

                if (!haystack.includes(searchTerm)) return false;
            }

            // Filtro: solo grupos con cupos disponibles
            if (soloConCupo && group.cupos_disponibles <= 0) {
                return false;
            }

            return true;
        });
    },

    /**
     * Devuelve los días en los que está activo un grupo (legible)
     */
    getGroupDays(group) {
        const dayMap = [
            { key: 'lunes', label: 'Lun' },
            { key: 'martes', label: 'Mar' },
            { key: 'miercoles', label: 'Mié' },
            { key: 'jueves', label: 'Jue' },
            { key: 'viernes', label: 'Vie' },
            { key: 'sabado', label: 'Sáb' },
            { key: 'domingo', label: 'Dom' }
        ];

        const activeDays = dayMap.filter(d => group[d.key] === true).map(d => d.label);

        if (activeDays.length > 0) {
            return activeDays.join(', ');
        }

        // Fallback a la columna "dias" si existe
        return group.dias || 'Sin días definidos';
    },

    /**
     * Valida los datos de una inscripción.
     * @param {Object} data - datos del formulario de inscripción
     * @param {Array} groups - grupos enriquecidos (para validar cupos)
     */
    validateInscription(data, groups = []) {
        const errors = [];

        if (!data) {
            return { valid: false, errors: ['Datos de inscripción requeridos'] };
        }

        // Datos del estudiante
        if (!data.nombre || data.nombre.trim() === '') {
            errors.push('El nombre del estudiante es obligatorio');
        }

        // Datos del acudiente
        if (!data.acudiente || data.acudiente.trim() === '') {
            errors.push('El nombre del acudiente es obligatorio');
        }

        if (!data.telefono || data.telefono.trim() === '') {
            errors.push('El teléfono de contacto es obligatorio');
        }

        // Grupo principal
        if (!data.grupoPrincipal || data.grupoPrincipal.trim() === '') {
            errors.push('Debe seleccionar un grupo principal');
        }

        // Grupo secundario distinto al principal
        if (data.grupoSecundario && data.grupoSecundario === data.grupoPrincipal) {
            errors.push('El grupo secundario debe ser diferente al grupo principal');
        }

        // Validar cupos disponibles
        const findGroup = code => groups.find(g => g.codigo === code);

        if (data.grupoPrincipal) {
            const principal = findGroup(data.grupoPrincipal);
            if (principal && principal.cupos_disponibles <= 0) {
                errors.push(`El grupo principal "${data.grupoPrincipal}" no tiene cupos disponibles`);
            }
        }

        if (data.grupoSecundario) {
            const secundario = findGroup(data.grupoSecundario);
            if (secundario && secundario.cupos_disponibles <= 0) {
                errors.push(`El grupo secundario "${data.grupoSecundario}" no tiene cupos disponibles`);
            }
        }

        // Aceptación de políticas
        if (!data.politicasAceptadas) {
            errors.push('Debe aceptar las políticas de la Escuela para continuar');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Guarda una inscripción.
     * Construye el registro del estudiante según la hoja "Estudiantes" e intenta
     * enviarlo al backend. Si no hay conexión o el backend no responde, la
     * inscripción se guarda localmente como pendiente.
     */
    async saveInscription(data) {
        debugLog('InscriptionService: Guardando inscripción...', data);

        const studentId = DataUtils.generateId('EST');

        const studentRecord = {
            ID: studentId,
            Nombre: data.nombre.trim(),
            Grupo_Principal: data.grupoPrincipal,
            Grupo_Secundario: data.grupoSecundario || '',
            Max_Clases: parseInt(data.maxClases) || 40,
            Activo: true
        };

        const inscriptionMeta = {
            acudiente: data.acudiente.trim(),
            telefono: data.telefono.trim(),
            email: (data.email || '').trim(),
            politicas_aceptadas: true,
            fecha_inscripcion: DateUtils.getCurrentDate(),
            enviado_por: window.AppState.user?.email || 'inscripcion-web',
            timestamp: DateUtils.getCurrentTimestamp()
        };

        const payload = { studentRecord, inscriptionMeta };

        try {
            const result = await SheetsAPI.saveInscription(payload);
            debugLog('InscriptionService: Inscripción guardada en el backend', result);

            return {
                success: true,
                pending: false,
                studentId,
                studentRecord,
                inscriptionMeta
            };

        } catch (error) {
            console.error('InscriptionService: Error al guardar inscripción en backend:', error);

            // Guardar localmente para no perder la inscripción
            this._savePendingInscription(payload);

            UIUtils.showWarning('La inscripción se guardó localmente y se sincronizará cuando haya conexión con el servidor.');

            return {
                success: true,
                pending: true,
                studentId,
                studentRecord,
                inscriptionMeta
            };
        }
    },

    /**
     * Guarda una inscripción pendiente en localStorage
     */
    _savePendingInscription(payload) {
        const pending = StorageUtils.get('pending_inscriptions', []);
        pending.push({
            id: DataUtils.generateId('INS'),
            data: payload,
            timestamp: DateUtils.getCurrentTimestamp()
        });
        StorageUtils.save('pending_inscriptions', pending);
        debugLog(`InscriptionService: Inscripción guardada como pendiente (${pending.length} en cola)`);
    },

    /**
     * Obtiene las inscripciones pendientes de sincronización
     */
    getPendingInscriptions() {
        return StorageUtils.get('pending_inscriptions', []);
    }
};

// Hacer disponible globalmente
window.InscriptionService = InscriptionService;

debugLog('inscription-service.js cargado correctamente');
