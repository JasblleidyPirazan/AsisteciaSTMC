const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Importa la pre-inscripción 2026-2 (Escuela Santa María) directamente en la BD.
 *
 * Fuente: PreInscripci_n_2026II.xlsx (hojas "Resumen" y "Consolidado Matrícula").
 *
 * Crea/actualiza:
 *   - Profesores (find-or-create por nombre)
 *   - Grupos (upsert por `code`): días, horario, duración y classUnits
 *   - Estudiantes (find-or-create por nombre) + inscripciones (StudentEnrollment)
 *
 * Es IDEMPOTENTE: re-ejecutarlo no duplica grupos, profesores ni inscripciones.
 *
 * Notas:
 *   - La edad del Excel NO se almacena (el modelo Student no tiene ese campo).
 *   - court / ballLevel quedan en null (no vienen confiables en la fuente).
 *   - "Martin Bachenheimer" aparece en 2 grupos -> 1 estudiante con doble
 *     inscripción (PRIMARY el primero, SECONDARY el segundo).
 *
 * Uso (requiere DATABASE_URL en el entorno, p.ej. shell de Railway):
 *   node src/scripts/importPreinscripcion2026II.js
 *   node src/scripts/importPreinscripcion2026II.js --dry-run
 */

const DRY_RUN = process.argv.includes('--dry-run');

const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

const GROUPS = [
  {
    "code": "J1314",
    "professor": "Wilman",
    "days": [
      "martes",
      "jueves"
    ],
    "startTime": "15:45",
    "endTime": "16:30",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "MJ1324",
    "professor": "Yeison",
    "days": [
      "martes",
      "jueves"
    ],
    "startTime": "15:45",
    "endTime": "16:30",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "MJ1742",
    "professor": "José Palacio",
    "days": [
      "martes",
      "jueves"
    ],
    "startTime": "17:15",
    "endTime": "18:00",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "MJ1743",
    "professor": "Ricardo",
    "days": [
      "martes",
      "jueves"
    ],
    "startTime": "17:15",
    "endTime": "18:00",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "MJ1715",
    "professor": "Stivens",
    "days": [
      "martes",
      "jueves"
    ],
    "startTime": "17:15",
    "endTime": "18:00",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "MJ1724",
    "professor": "Wilman",
    "days": [
      "martes",
      "jueves"
    ],
    "startTime": "17:15",
    "endTime": "18:00",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "MJ1932",
    "professor": "José Palacio",
    "days": [
      "martes",
      "jueves"
    ],
    "startTime": "18:00",
    "endTime": "18:45",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "MJ1933",
    "professor": "Ricardo",
    "days": [
      "martes",
      "jueves"
    ],
    "startTime": "18:00",
    "endTime": "18:45",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "MJ1924",
    "professor": "Wilman",
    "days": [
      "martes",
      "jueves"
    ],
    "startTime": "18:00",
    "endTime": "18:45",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "MJ1941",
    "professor": "Yeison",
    "days": [
      "martes",
      "jueves"
    ],
    "startTime": "18:00",
    "endTime": "18:45",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "MJ2213",
    "professor": "José Palacio",
    "days": [
      "martes",
      "jueves"
    ],
    "startTime": "18:45",
    "endTime": "19:30",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "MJ2243",
    "professor": "Ricardo",
    "days": [
      "martes",
      "jueves"
    ],
    "startTime": "18:45",
    "endTime": "19:30",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "MJ2211",
    "professor": "Stivens",
    "days": [
      "martes",
      "jueves"
    ],
    "startTime": "18:45",
    "endTime": "19:30",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "V1623",
    "professor": "José Palacio",
    "days": [
      "viernes"
    ],
    "startTime": "16:30",
    "endTime": "18:00",
    "durationMinutes": 90,
    "classUnits": 2.0
  },
  {
    "code": "S1241",
    "professor": "José Palacio",
    "days": [
      "sabado"
    ],
    "startTime": "10:30",
    "endTime": "12:00",
    "durationMinutes": 90,
    "classUnits": 2.0
  },
  {
    "code": "S541",
    "professor": "Wilman",
    "days": [
      "sabado"
    ],
    "startTime": "7:30",
    "endTime": "9:00",
    "durationMinutes": 90,
    "classUnits": 2.0
  },
  {
    "code": "LM1314",
    "professor": "Ricardo",
    "days": [
      "lunes",
      "miercoles"
    ],
    "startTime": "15:45",
    "endTime": "16:30",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "LM1332",
    "professor": "Wilman",
    "days": [
      "lunes",
      "miercoles"
    ],
    "startTime": "15:45",
    "endTime": "16:30",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "LM1315",
    "professor": "Yeison",
    "days": [
      "lunes",
      "miercoles"
    ],
    "startTime": "15:45",
    "endTime": "16:30",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "LM1544",
    "professor": "Stivens",
    "days": [
      "lunes",
      "miercoles"
    ],
    "startTime": "16:30",
    "endTime": "18:00",
    "durationMinutes": 90,
    "classUnits": 2.0
  },
  {
    "code": "LM1922",
    "professor": "José Palacio",
    "days": [
      "lunes",
      "miercoles"
    ],
    "startTime": "18:00",
    "endTime": "18:45",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "LM1943",
    "professor": "Ricardo",
    "days": [
      "lunes",
      "miercoles"
    ],
    "startTime": "18:00",
    "endTime": "18:45",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "LM1921",
    "professor": "Stivens",
    "days": [
      "lunes",
      "miercoles"
    ],
    "startTime": "18:00",
    "endTime": "18:45",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "LM1924",
    "professor": "Wilman",
    "days": [
      "lunes",
      "miercoles"
    ],
    "startTime": "18:00",
    "endTime": "18:45",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "LM2222",
    "professor": "José Palacio",
    "days": [
      "lunes",
      "miercoles"
    ],
    "startTime": "18:45",
    "endTime": "19:30",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "LM2243",
    "professor": "Ricardo",
    "days": [
      "lunes",
      "miercoles"
    ],
    "startTime": "18:45",
    "endTime": "19:30",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "LM2225",
    "professor": "Wilman",
    "days": [
      "lunes",
      "miercoles"
    ],
    "startTime": "18:45",
    "endTime": "19:30",
    "durationMinutes": 45,
    "classUnits": 1.0
  },
  {
    "code": "LM2234",
    "professor": "Yeison",
    "days": [
      "lunes",
      "miercoles"
    ],
    "startTime": "18:45",
    "endTime": "19:30",
    "durationMinutes": 45,
    "classUnits": 1.0
  }
];

const STUDENTS = [
  {
    "name": "Emilio Penagos",
    "groups": [
      "LM1332"
    ]
  },
  {
    "name": "Pedro Penagos",
    "groups": [
      "LM1332"
    ]
  },
  {
    "name": "Victoria Hoyos Blandon",
    "groups": [
      "LM1314"
    ]
  },
  {
    "name": "Elena Valencia Montoya",
    "groups": [
      "LM1314"
    ]
  },
  {
    "name": "Sofia Hoyos Blandon",
    "groups": [
      "LM1314"
    ]
  },
  {
    "name": "Lourdes Giraldo Davalos",
    "groups": [
      "LM1315"
    ]
  },
  {
    "name": "Martin Cifuentes",
    "groups": [
      "LM1315"
    ]
  },
  {
    "name": "Arias Uscátegui",
    "groups": [
      "LM1315"
    ]
  },
  {
    "name": "Amada Lopera",
    "groups": [
      "LM1315"
    ]
  },
  {
    "name": "Sultan Sami Marin",
    "groups": [
      "LM1315"
    ]
  },
  {
    "name": "Samuel Pineda",
    "groups": [
      "LM1544"
    ]
  },
  {
    "name": "Olivia Parra",
    "groups": [
      "LM1544"
    ]
  },
  {
    "name": "Paula Rodriguez",
    "groups": [
      "LM1922"
    ]
  },
  {
    "name": "Anderson Gomez",
    "groups": [
      "LM1922"
    ]
  },
  {
    "name": "Juan David Bedoya Gutiérrez",
    "groups": [
      "LM1922"
    ]
  },
  {
    "name": "Luciana Lozada Roldan",
    "groups": [
      "LM1924"
    ]
  },
  {
    "name": "Susana Lopez Arcila",
    "groups": [
      "LM1924"
    ]
  },
  {
    "name": "Maximiliano Blanco",
    "groups": [
      "LM1924"
    ]
  },
  {
    "name": "Luisa Maria Gonzalez",
    "groups": [
      "LM1924"
    ]
  },
  {
    "name": "Rafael Agudelo Zuluaga",
    "groups": [
      "LM1943"
    ]
  },
  {
    "name": "Miguel Camacho",
    "groups": [
      "LM1943"
    ]
  },
  {
    "name": "Juan Santiago Hamid",
    "groups": [
      "LM1943"
    ]
  },
  {
    "name": "Lucas Carmona Marin",
    "groups": [
      "LM1943"
    ]
  },
  {
    "name": "Martin Sierra",
    "groups": [
      "LM1921"
    ]
  },
  {
    "name": "Martin Bachenheimer",
    "groups": [
      "LM1921",
      "MJ1715"
    ]
  },
  {
    "name": "Miguel Bedoya Arango",
    "groups": [
      "LM1921"
    ]
  },
  {
    "name": "Santiago Correa",
    "groups": [
      "LM1921"
    ]
  },
  {
    "name": "Maria Paz Velez SantaMaría",
    "groups": [
      "LM2222"
    ]
  },
  {
    "name": "Salvador Angel",
    "groups": [
      "LM2222"
    ]
  },
  {
    "name": "Salma Velez",
    "groups": [
      "LM2222"
    ]
  },
  {
    "name": "Azul Moreno",
    "groups": [
      "LM2222"
    ]
  },
  {
    "name": "Maria José Correa",
    "groups": [
      "LM2225"
    ]
  },
  {
    "name": "Mariam Caballero Cepeda",
    "groups": [
      "LM2225"
    ]
  },
  {
    "name": "Carolina Giraldo",
    "groups": [
      "LM2225"
    ]
  },
  {
    "name": "Josué Cassab",
    "groups": [
      "LM2225"
    ]
  },
  {
    "name": "Andres Pineda",
    "groups": [
      "LM2243"
    ]
  },
  {
    "name": "Francisco Mejia",
    "groups": [
      "LM2243"
    ]
  },
  {
    "name": "Julian Kepes",
    "groups": [
      "LM2243"
    ]
  },
  {
    "name": "Santiago Aristizabal",
    "groups": [
      "LM2243"
    ]
  },
  {
    "name": "Martin Londoño",
    "groups": [
      "LM2234"
    ]
  },
  {
    "name": "Jessica Zuluaga Gomez",
    "groups": [
      "LM2234"
    ]
  },
  {
    "name": "Tomas Moreno",
    "groups": [
      "LM2234"
    ]
  },
  {
    "name": "Benjamin Gomez Bedoya",
    "groups": [
      "J1314"
    ]
  },
  {
    "name": "Benjamin Ossa",
    "groups": [
      "J1314"
    ]
  },
  {
    "name": "Antonio Posada",
    "groups": [
      "J1314"
    ]
  },
  {
    "name": "Amelia Ossa",
    "groups": [
      "J1314"
    ]
  },
  {
    "name": "Roger Cendra Tejero",
    "groups": [
      "MJ1324"
    ]
  },
  {
    "name": "Ismael Cadavid",
    "groups": [
      "MJ1742"
    ]
  },
  {
    "name": "Benjamín Vásquez",
    "groups": [
      "MJ1742"
    ]
  },
  {
    "name": "Cristobal Tavarez Zapata",
    "groups": [
      "MJ1742"
    ]
  },
  {
    "name": "Maria Paz Brieva",
    "groups": [
      "MJ1724"
    ]
  },
  {
    "name": "Isabella Arias Quintero",
    "groups": [
      "MJ1724"
    ]
  },
  {
    "name": "Martina Quintero",
    "groups": [
      "MJ1724"
    ]
  },
  {
    "name": "Luciana Arteaga Echeverry",
    "groups": [
      "MJ1724"
    ]
  },
  {
    "name": "Antonia Arenas",
    "groups": [
      "MJ1743"
    ]
  },
  {
    "name": "Antonio Lopez",
    "groups": [
      "MJ1743"
    ]
  },
  {
    "name": "Simón Marin",
    "groups": [
      "MJ1743"
    ]
  },
  {
    "name": "Sophia Pérez",
    "groups": [
      "MJ1715"
    ]
  },
  {
    "name": "Valentina Aguirre",
    "groups": [
      "MJ1715"
    ]
  },
  {
    "name": "Martín González",
    "groups": [
      "MJ1715"
    ]
  },
  {
    "name": "Manuela Grajales Serna",
    "groups": [
      "MJ1932"
    ]
  },
  {
    "name": "Emilia Grajales Serna",
    "groups": [
      "MJ1932"
    ]
  },
  {
    "name": "Mathias Jaramillo",
    "groups": [
      "MJ1932"
    ]
  },
  {
    "name": "Carlos Andres Martinez",
    "groups": [
      "MJ1932"
    ]
  },
  {
    "name": "Violeta Echeverry",
    "groups": [
      "MJ1924"
    ]
  },
  {
    "name": "Martin Madrid",
    "groups": [
      "MJ1924"
    ]
  },
  {
    "name": "Jacob Soto Kitamikado",
    "groups": [
      "MJ1924"
    ]
  },
  {
    "name": "Pedro Echeverry",
    "groups": [
      "MJ1933"
    ]
  },
  {
    "name": "Matias Perez Lopera",
    "groups": [
      "MJ1933"
    ]
  },
  {
    "name": "Pedro Juan Jimenez",
    "groups": [
      "MJ1933"
    ]
  },
  {
    "name": "Gregorio Mantilla Acosta",
    "groups": [
      "MJ1933"
    ]
  },
  {
    "name": "Alejandro Restrepo",
    "groups": [
      "MJ1941"
    ]
  },
  {
    "name": "Alejantro Torres",
    "groups": [
      "MJ1941"
    ]
  },
  {
    "name": "Camilo Warren",
    "groups": [
      "MJ1941"
    ]
  },
  {
    "name": "Jeronimo Mejia",
    "groups": [
      "MJ1941"
    ]
  },
  {
    "name": "Cristina Arango",
    "groups": [
      "MJ2213"
    ]
  },
  {
    "name": "Laura Uribe Ramírez",
    "groups": [
      "MJ2213"
    ]
  },
  {
    "name": "Rosario Sferco",
    "groups": [
      "MJ2243"
    ]
  },
  {
    "name": "Mauricio Noreña",
    "groups": [
      "MJ2243"
    ]
  },
  {
    "name": "Esteban Trujillo",
    "groups": [
      "MJ2243"
    ]
  },
  {
    "name": "John Sebastian Cardenas",
    "groups": [
      "MJ2211"
    ]
  },
  {
    "name": "Nelson Bolivar",
    "groups": [
      "MJ2211"
    ]
  },
  {
    "name": "Claudia Celis",
    "groups": [
      "MJ2211"
    ]
  },
  {
    "name": "Valentina Palacios",
    "groups": [
      "V1623"
    ]
  },
  {
    "name": "Celeste Acosta",
    "groups": [
      "V1623"
    ]
  },
  {
    "name": "Santiago Toro Correa",
    "groups": [
      "S541"
    ]
  },
  {
    "name": "Samuel Diez",
    "groups": [
      "S541"
    ]
  },
  {
    "name": "Juan Guillermo Sanchez",
    "groups": [
      "S541"
    ]
  },
  {
    "name": "Andres Merchan",
    "groups": [
      "S541"
    ]
  },
  {
    "name": "Carolina Rodriguez",
    "groups": [
      "S1241"
    ]
  },
  {
    "name": "Santiago Puerta",
    "groups": [
      "S1241"
    ]
  },
  {
    "name": "Silvia Socha",
    "groups": [
      "S1241"
    ]
  },
  {
    "name": "Juan David Arroyave",
    "groups": [
      "S1241"
    ]
  }
];

function dayFlags(days) {
  const flags = {};
  for (const d of DAYS) flags[d] = days.includes(d);
  return flags;
}

async function main() {
  console.log(`\n=== Importación Pre-inscripción 2026-2 ${DRY_RUN ? '(DRY RUN)' : ''} ===`);
  console.log(`Grupos: ${GROUPS.length} | Estudiantes: ${STUDENTS.length}\n`);

  // 1) Profesores (find-or-create por nombre)
  const profIds = {};
  const profNames = [...new Set(GROUPS.map((g) => g.professor))];
  for (const name of profNames) {
    let prof = await prisma.professor.findFirst({ where: { name } });
    if (!prof && !DRY_RUN) {
      prof = await prisma.professor.create({ data: { name } });
    }
    profIds[name] = prof ? prof.id : '(dry-run)';
    console.log(`Profesor ${prof && !DRY_RUN && profIds[name] ? 'OK' : 'pendiente'}: ${name}`);
  }

  // 2) Grupos (upsert por code)
  const groupIds = {};
  for (const g of GROUPS) {
    const data = {
      code: g.code,
      professorId: profIds[g.professor],
      ...dayFlags(g.days),
      startTime: g.startTime,
      endTime: g.endTime,
      durationMinutes: g.durationMinutes,
      classUnits: g.classUnits,
    };
    if (DRY_RUN) {
      groupIds[g.code] = '(dry-run)';
      console.log(`Grupo ${g.code} (${g.professor}, ${g.days.join('/')} ${g.startTime}-${g.endTime}) -> dry-run`);
      continue;
    }
    const group = await prisma.group.upsert({
      where: { code: g.code },
      update: {
        professorId: data.professorId,
        ...dayFlags(g.days),
        startTime: g.startTime,
        endTime: g.endTime,
        durationMinutes: g.durationMinutes,
        classUnits: g.classUnits,
        active: true,
      },
      create: data,
    });
    groupIds[g.code] = group.id;
    console.log(`Grupo OK: ${g.code}`);
  }

  // 3) Estudiantes + inscripciones
  let created = 0, enrolled = 0, skipped = 0;
  for (const st of STUDENTS) {
    let student = await prisma.student.findFirst({ where: { name: st.name } });
    if (!student) {
      if (DRY_RUN) {
        created++;
      } else {
        student = await prisma.student.create({ data: { name: st.name } });
        created++;
      }
    }
    for (let i = 0; i < st.groups.length; i++) {
      const code = st.groups[i];
      const groupId = groupIds[code];
      const enrollmentType = i === 0 ? 'PRIMARY' : 'SECONDARY';
      if (DRY_RUN) { enrolled++; continue; }
      const exists = await prisma.studentEnrollment.findUnique({
        where: { studentId_groupId: { studentId: student.id, groupId } },
      });
      if (exists) { skipped++; continue; }
      await prisma.studentEnrollment.create({
        data: { studentId: student.id, groupId, enrollmentType },
      });
      enrolled++;
    }
  }

  console.log(`\nResumen: estudiantes nuevos=${created}, inscripciones nuevas=${enrolled}, inscripciones ya existentes=${skipped}`);
  console.log(DRY_RUN ? 'DRY RUN — no se escribió nada en la BD.' : 'Importación completada.');
}

main()
  .catch((err) => {
    console.error('Error en la importación:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
