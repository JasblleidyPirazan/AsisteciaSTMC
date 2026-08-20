/**
 * Data dictionary — single source of truth, written in English.
 *
 * Describes every table, column and enum of the PostgreSQL database behind the
 * tennis academy attendance system. Two consumers read this file:
 *
 *   1. `scripts/generate-data-dictionary.js` → regenerates `docs/database-dictionary.md`
 *   2. `services/databaseExport.js` → the "export the whole database" button
 *      (first sheet of the workbook + column order + redaction of secrets)
 *
 * Keeping both on the same metadata means the exported workbook is always
 * self-documenting and the markdown never drifts from the code. A unit test
 * (`tests/unit/dataDictionary.test.js`) parses `schema.prisma` and fails if a
 * model/field is added, renamed or removed without updating this file.
 *
 * Field reference:
 *   model      Prisma model name
 *   table      physical PostgreSQL table name (@@map)
 *   delegate   Prisma Client accessor (prisma.<delegate>)
 *   group      logical area, used to group the markdown/summary sheet
 *   columns[]  { column (SQL), field (Prisma), type, nullable, key, sensitive, description }
 *   sensitive  true → value is NEVER written to an export (replaced by "[REDACTED]")
 */

const ENUMS = [
  {
    name: 'Role',
    description: 'Access level of a user account.',
    values: [
      ['SUPERADMIN', 'Top role, strict superset of ADMIN. Only role allowed to create ADMIN/SUPERADMIN accounts, wipe class data and export the database.'],
      ['ADMIN', 'Full management: payroll, accounting, configuration, catalogue. Read-only on attendance reports.'],
      ['TEACHER', 'Professor. Reports attendance for the groups they own and sees their own pay.'],
      ['ASSISTANT', 'Assistant. Confirms the classes they accompanied and sees their own pay.'],
      ['PARENT', 'Guardian. Read-only portal for their own children.'],
      ['PHYSICAL_TRAINER', 'Shown as "Coordinador" in the UI. Operational management without access to money.'],
      ['RECEPTION', 'Front desk: creates/edits students and registers their payments.'],
    ],
  },
  {
    name: 'PaymentMethod',
    description: 'How a student payment was received.',
    values: [
      ['TRANSFERENCIA', 'Bank transfer.'],
      ['EFECTIVO', 'Cash.'],
      ['WOMPI', 'Wompi payment gateway.'],
      ['BOLD', 'Bold payment gateway.'],
    ],
  },
  {
    name: 'EnrollmentType',
    description: 'Weight of a student ↔ group link.',
    values: [
      ['PRIMARY', 'Main group of the student.'],
      ['SECONDARY', 'Additional group.'],
    ],
  },
  {
    name: 'SessionKind',
    description: 'Nature of a class session.',
    values: [
      ['REGULAR', 'Ordinary class of a group (has group_id, dual report applies).'],
      ['MAKEUP', 'Group make-up class (no group_id; participants in makeup_participants).'],
      ['FESTIVAL', 'Festival: several professors, flat equal pay per professor.'],
    ],
  },
  {
    name: 'SessionStatus',
    description: 'Lifecycle state of a class session.',
    values: [
      ['PROGRAMADA', 'Scheduled — not reported yet (or waiting for the second report).'],
      ['REALIZADA', 'Taught and consolidated. Only this state (and the legacy half state) generates cost records.'],
      ['CANCELADA', 'Cancelled, with a structured reason.'],
      ['CANCELADA_MITAD', 'Legacy "half cancelled" state of the removed double-class model. No longer produced.'],
    ],
  },
  {
    name: 'CancellationCategory',
    description: 'Structured reason why a session was cancelled.',
    values: [
      ['LLUVIA', 'Rain. Counted by the rain alert per group.'],
      ['SIN_ESTUDIANTES', 'No students showed up.'],
      ['OTRA', 'Other — free-text reason required.'],
    ],
  },
  {
    name: 'ClassReporterType',
    description: 'Which side of the dual report a staging report belongs to.',
    values: [
      ['PROFESSOR', 'Report filed by the teacher.'],
      ['COORDINATOR', 'Report filed by the coordinator (PHYSICAL_TRAINER).'],
    ],
  },
  {
    name: 'ConsolidationStatus',
    description: 'Result of comparing the professor report against the coordinator report.',
    values: [
      ['PENDING', 'Only one of the two reports has arrived. No attendance, no cost yet.'],
      ['MATCHED', 'Both reports agree → attendance_records written, session set to REALIZADA, pay enabled.'],
      ['MISMATCH', 'Reports disagree → conflict alert; attendance and costs are removed until both converge.'],
    ],
  },
  {
    name: 'AttendanceStatus',
    description: 'Attendance mark of a student in one session.',
    values: [
      ['PRESENTE', 'Present. Consumes one class of the package and counts towards the professor pay bracket.'],
      ['AUSENTE', 'Absent. Only counts as a used class in festivals, and only from the student class start date.'],
      ['JUSTIFICADA', 'Excused absence. Never counts as a used class.'],
      ['NO_APLICA', 'Not applicable: the student bought fewer days than the group meets. Counts neither as attendance nor absence and subtracts one expected class in the alerts.'],
    ],
  },
  {
    name: 'AttendanceType',
    description: 'Whether the student belongs to the session roster or is catching up.',
    values: [
      ['REGULAR', 'Student of the group (or assigned participant of a make-up/festival).'],
      ['REPOSICION', 'Student added to this session as a make-up.'],
    ],
  },
  {
    name: 'PayeeType',
    description: 'Who is paid by a cost record.',
    values: [
      ['PROFESSOR', 'Professor — bracket rate by number of present students.'],
      ['ASSISTANT', 'Assistant — fixed rate per class.'],
    ],
  },
  {
    name: 'PayStatus',
    description: 'Whether a cost record can be paid.',
    values: [
      ['PAYABLE', 'Enabled for payment.'],
      ['SUSPENDED_LATE', 'Held because the class was reported after its own day. Only an ADMIN can unlock it; on closing it is carried over to the next period.'],
      ['PENDING_MATCH', 'Assistant pay waiting for the triple match (assistant + professor + coordinator).'],
    ],
  },
  {
    name: 'MakeupType',
    description: 'Legacy make-up class shape (superseded by class_sessions with kind = MAKEUP).',
    values: [
      ['INDIVIDUAL', 'One-to-one make-up.'],
      ['GRUPAL', 'Group make-up.'],
    ],
  },
  {
    name: 'PayrollLogAction',
    description: 'Audited action on a payroll period.',
    values: [
      ['CLOSE', 'Period closed and locked.'],
      ['REOPEN', 'Period unlocked again.'],
      ['MARK_PAID', 'A cost record was marked as paid.'],
      ['UNMARK_PAID', 'The paid mark was removed.'],
      ['UNLOCK_LATE', 'A late-report suspension was released by an ADMIN.'],
      ['CARRY_OVER', 'Suspended records moved to the next period during the closing.'],
      ['APPROVE', 'A cost record was validated for payment.'],
      ['UNAPPROVE', 'The validation was withdrawn.'],
      ['HOLD', 'A cost record was held back and excluded from the payout.'],
      ['UNHOLD', 'The hold was released.'],
      ['BULK_APPROVE', 'Bulk validation.'],
      ['BULK_UNAPPROVE', 'Bulk withdrawal of validation.'],
      ['BULK_HOLD', 'Bulk hold.'],
      ['BULK_PAY', 'Bulk payment mark.'],
    ],
  },
];

// Shorthand builders keep the table definitions readable.
const col = (column, field, type, nullable, description, extra = {}) =>
  ({ column, field, type, nullable, description, ...extra });
const pk = (description = 'Primary key. Collision-free id generated by the application (cuid).') =>
  col('id', 'id', 'text', false, description, { key: 'PK' });
const createdAt = (column = 'created_at', field = 'createdAt', description = 'Row creation timestamp.') =>
  col(column, field, 'timestamp', false, description);

const TABLES = [
  // ─────────────────────────── Identity & access ───────────────────────────
  {
    model: 'User',
    table: 'users',
    delegate: 'user',
    group: 'Identity & access',
    description:
      'Login accounts. One row per person who can sign in. Professors, assistants and parents are linked to their domain row (professors / assistants / students.parent_user_id). Deactivating a user (active = false) revokes access on the very next request, without waiting for the JWT to expire.',
    columns: [
      pk(),
      col('email', 'email', 'text', false, 'Login email. Unique across the system.', { key: 'UQ' }),
      col('password_hash', 'passwordHash', 'text', false, 'bcrypt hash of the password (10 rounds on creation, 12 on change). Never leaves the server: redacted in every export.', { sensitive: true }),
      col('role', 'role', 'Role', false, 'Access level. Default TEACHER.'),
      col('active', 'active', 'boolean', false, 'Soft delete. false = account blocked. Default true.'),
      col('policies_accepted_at', 'policiesAcceptedAt', 'timestamp', true, 'When the user accepted the academy policies (blocking modal on the parent portal).'),
      createdAt(),
      col('updated_at', 'updatedAt', 'timestamp', false, 'Last update, maintained by Prisma.'),
    ],
    keys: { primary: ['id'], unique: [['email']] },
    relations: [
      ['professor', 'Professor', 'Professor profile of this account, if any.'],
      ['assistant', 'Assistant', 'Assistant profile of this account, if any.'],
      ['parentOf', 'Student[]', 'Children linked to this guardian account.'],
      ['reportedSessions', 'ClassSession[]', 'Sessions whose last report was filed by this user.'],
      ['reportedAttendance', 'AttendanceRecord[]', 'Consolidated attendance rows attributed to this user.'],
      ['sessionEdits', 'SessionEditLog[]', 'Report edits made by this user.'],
      ['classReports', 'ClassReport[]', 'Staging reports filed by this user.'],
      ['paymentsReceived', 'StudentPayment[]', 'Student payments registered by this user.'],
    ],
  },
  {
    model: 'Professor',
    table: 'professors',
    delegate: 'professor',
    group: 'People',
    description:
      'Teaching staff. A professor may exist without a login account; linking one (user_id) lets them report their own groups and see their own payroll.',
    columns: [
      pk(),
      col('user_id', 'userId', 'text', true, 'Login account of this professor, if created. Unique.', { key: 'FK → users.id (UQ)' }),
      col('name', 'name', 'text', false, 'Full name shown across the app.'),
      col('active', 'active', 'boolean', false, 'Soft delete. Default true.'),
      createdAt(),
    ],
    keys: { primary: ['id'], unique: [['user_id']] },
    relations: [
      ['groups', 'Group[]', 'Groups where this professor is the owner.'],
      ['substitutedSessions', 'ClassSession[]', 'Sessions taught as a substitute.'],
      ['makeupSessions', 'ClassSession[]', 'Make-up sessions assigned to this professor.'],
      ['festivalSessions', 'FestivalProfessor[]', 'Festivals this professor took part in.'],
      ['costRecords', 'CostRecord[]', 'Payroll rows owed to this professor.'],
      ['events', 'Event[]', 'Tournaments/clinics assigned to this professor.'],
    ],
  },
  {
    model: 'Assistant',
    table: 'assistants',
    delegate: 'assistant',
    group: 'People',
    description:
      'Assistants who accompany classes. Paid a fixed rate per class, released only when the triple match (assistant, professor, coordinator) agrees.',
    columns: [
      pk(),
      col('user_id', 'userId', 'text', true, 'Login account of this assistant, if created. Unique.', { key: 'FK → users.id (UQ)' }),
      col('name', 'name', 'text', false, 'Full name.'),
      col('active', 'active', 'boolean', false, 'Soft delete. Default true.'),
      createdAt(),
    ],
    keys: { primary: ['id'], unique: [['user_id']] },
    relations: [
      ['sessions', 'ClassSession[]', 'Sessions where the professor declared this assistant.'],
      ['confirmedSessions', 'ClassSession[]', 'Sessions this assistant confirmed having accompanied.'],
      ['costRecords', 'CostRecord[]', 'Payroll rows owed to this assistant.'],
    ],
  },
  {
    model: 'Student',
    table: 'students',
    delegate: 'student',
    group: 'People',
    description:
      'Students of the academy. The commercial status (trial / pre-enrolled / enrolled / fully paid / suspended / inactive) is NOT stored: it is derived on the server from payments, attendance and the tuition rates. classes_acquired + previous_classes is the size of the package the student may consume.',
    columns: [
      pk(),
      col('name', 'name', 'text', false, 'Full name.'),
      col('email', 'email', 'text', true, 'Contact email (guardian).'),
      col('document', 'document', 'text', true, 'National id document. Used as the key of the public data-validation flow.'),
      col('phone', 'phone', 'text', true, 'Contact phone / WhatsApp.'),
      col('guardian_name', 'guardianName', 'text', true, 'Guardian name.'),
      col('birth_date', 'birthDate', 'date', true, 'Date of birth. Drives the tuition category (adult from tuition_adult_age, child below). A regular active student without it is flagged with a data error.'),
      col('parent_user_id', 'parentUserId', 'text', true, 'Guardian account that can see this student in the parent portal.', { key: 'FK → users.id' }),
      col('classes_start_date', 'classesStartDate', 'date', true, 'Day the student starts (or started) classes. Floor for the expected classes in the attendance alerts; absences before it do not count.'),
      col('is_trial', 'isTrial', 'boolean', false, 'Trial class: prospect created from the attendance flow with only a name and no groups. Default false.'),
      col('classes_acquired', 'classesAcquired', 'integer', false, 'Classes bought for the current semester. Basis of the expected tuition amount. Default 0.'),
      col('previous_classes', 'previousClasses', 'integer', false, 'Classes carried over from the previous semester. Added to the available package but NOT to the tuition owed (already paid). Default 0.'),
      col('payment_complete', 'paymentComplete', 'boolean', false, 'Legacy manual flag. Unused — the paid status is derived from student_payments.'),
      col('suspended_from', 'suspendedFrom', 'date', true, 'Start of a temporary suspension.'),
      col('suspended_until', 'suspendedUntil', 'date', true, 'End of the suspension. While inside the window the student disappears from the rosters and reappears automatically afterwards.'),
      col('suspension_reason', 'suspensionReason', 'text', true, 'Reason of the suspension (required when suspending).'),
      col('active', 'active', 'boolean', false, 'Soft delete. Default true.'),
      col('deactivation_reason', 'deactivationReason', 'text', true, 'Reason given when deactivating (required).'),
      col('deactivated_at', 'deactivatedAt', 'timestamp', true, 'When the student was deactivated.'),
      col('validated_at', 'validatedAt', 'timestamp', true, 'When the guardian confirmed the contact data through the public validation page.'),
      col('policies_accepted_at', 'policiesAcceptedAt', 'timestamp', true, 'When the guardian accepted the policies for this student.'),
      createdAt(),
    ],
    keys: { primary: ['id'] },
    relations: [
      ['parentUser', 'User', 'Guardian account.'],
      ['enrollments', 'StudentEnrollment[]', 'Groups the student belongs to.'],
      ['attendanceRecords', 'AttendanceRecord[]', 'Consolidated attendance history.'],
      ['classReportAttendance', 'ClassReportAttendance[]', 'Marks in the staging reports.'],
      ['makeupParticipations', 'MakeupParticipant[]', 'Make-up / festival sessions the student was assigned to.'],
      ['groupHistory', 'StudentGroupHistory[]', 'Group transfers.'],
      ['payments', 'StudentPayment[]', 'Payments received.'],
    ],
  },
  {
    model: 'StudentPayment',
    table: 'student_payments',
    delegate: 'studentPayment',
    group: 'Money in',
    description:
      'Payments made by a student, registered by reception/admin. Independent history: it does not mutate any status column — the "fully paid" state is derived by comparing the accumulated amount against the expected tuition. Verification (verified_at) is the accounting reconciliation against the bank statement or the cash count.',
    columns: [
      pk(),
      col('student_id', 'studentId', 'text', false, 'Student who paid.', { key: 'FK → students.id' }),
      col('payment_date', 'paymentDate', 'date', false, 'Date the money was received.'),
      col('method', 'method', 'PaymentMethod', false, 'Payment method.'),
      col('amount', 'amount', 'numeric(12,2)', false, 'Amount in COP.'),
      col('received_by_id', 'receivedById', 'text', true, 'User who registered the payment.', { key: 'FK → users.id' }),
      col('received_by_name', 'receivedByName', 'text', true, 'Name of that user, frozen at registration time.'),
      col('note', 'note', 'text', true, 'Free note.'),
      col('verified_at', 'verifiedAt', 'timestamp', true, 'When the payment was reconciled by an admin.'),
      col('verified_by_id', 'verifiedById', 'text', true, 'User who verified it.'),
      col('verified_by_name', 'verifiedByName', 'text', true, 'Name of the verifier, frozen.'),
      createdAt(),
    ],
    keys: { primary: ['id'], indexes: [['student_id']] },
    relations: [
      ['student', 'Student', 'Payer.'],
      ['receivedBy', 'User', 'Who registered it.'],
    ],
  },

  // ──────────────────────────── Catalogue ────────────────────────────
  {
    model: 'Group',
    table: 'groups',
    delegate: 'group',
    group: 'Catalogue',
    description:
      'Class groups: weekly schedule, court, level and owner professor. The seven weekday booleans are the calendar used to derive the expected sessions of a semester.',
    columns: [
      pk(),
      col('code', 'code', 'text', false, 'Unique human code of the group (e.g. "G12"). Sorted alphanumerically across the app.', { key: 'UQ' }),
      col('name', 'name', 'text', true, 'Optional descriptive name.'),
      col('professor_id', 'professorId', 'text', false, 'Owner professor. Defines who may report this group.', { key: 'FK → professors.id' }),
      col('lunes', 'lunes', 'boolean', false, 'Meets on Monday. Default false.'),
      col('martes', 'martes', 'boolean', false, 'Meets on Tuesday. Default false.'),
      col('miercoles', 'miercoles', 'boolean', false, 'Meets on Wednesday. Default false.'),
      col('jueves', 'jueves', 'boolean', false, 'Meets on Thursday. Default false.'),
      col('viernes', 'viernes', 'boolean', false, 'Meets on Friday. Default false.'),
      col('sabado', 'sabado', 'boolean', false, 'Meets on Saturday. Default false.'),
      col('domingo', 'domingo', 'boolean', false, 'Meets on Sunday. Default false.'),
      col('start_time', 'startTime', 'text', false, 'Start time as "HH:MM".'),
      col('end_time', 'endTime', 'text', false, 'End time as "HH:MM".'),
      col('duration_minutes', 'durationMinutes', 'integer', false, 'Length of the class in minutes.'),
      col('class_units', 'classUnits', 'numeric(3,1)', false, 'Legacy weight of a class. Always 1.0 since double groups were removed; kept for historical rows.'),
      col('court', 'court', 'integer', true, 'Court number.'),
      col('ball_level', 'ballLevel', 'text', true, 'Level: Roja / Naranja / Verde / Amarilla / Intermedio / Avanzado.'),
      col('sub_level', 'subLevel', 'text', true, 'Informative sub-level A/B/C (only for the four colour levels).'),
      col('capacity', 'capacity', 'integer', false, 'Maximum number of students (occupancy base). Default 8.'),
      col('active', 'active', 'boolean', false, 'Soft delete. Default true.'),
      col('deactivation_reason', 'deactivationReason', 'text', true, 'Reason given when deactivating (required).'),
      col('deactivated_at', 'deactivatedAt', 'timestamp', true, 'When the group was deactivated.'),
      createdAt(),
    ],
    keys: { primary: ['id'], unique: [['code']] },
    relations: [
      ['professor', 'Professor', 'Owner professor.'],
      ['enrollments', 'StudentEnrollment[]', 'Students of the group.'],
      ['sessions', 'ClassSession[]', 'Class sessions of the group.'],
      ['historyFrom / historyTo', 'StudentGroupHistory[]', 'Transfers out of / into this group.'],
    ],
  },
  {
    model: 'StudentEnrollment',
    table: 'student_enrollments',
    delegate: 'studentEnrollment',
    group: 'Catalogue',
    description: 'Membership of a student in a group. Composite primary key (student, group): a student can belong to several groups, one of them PRIMARY.',
    columns: [
      col('student_id', 'studentId', 'text', false, 'Student.', { key: 'PK, FK → students.id' }),
      col('group_id', 'groupId', 'text', false, 'Group.', { key: 'PK, FK → groups.id' }),
      col('enrollment_type', 'enrollmentType', 'EnrollmentType', false, 'PRIMARY or SECONDARY. Default PRIMARY.'),
      col('enrolled_at', 'enrolledAt', 'timestamp', false, 'Enrollment date. Floor for the expected classes of this student in this group.'),
    ],
    keys: { primary: ['student_id', 'group_id'] },
    relations: [
      ['student', 'Student', ''],
      ['group', 'Group', ''],
    ],
  },
  {
    model: 'Semester',
    table: 'semesters',
    delegate: 'semester',
    group: 'Catalogue',
    description: 'Academic semesters. Exactly one may be active: activating one deactivates the rest. The active semester scopes the statistics, alerts and the strategic dashboard.',
    columns: [
      pk(),
      col('name', 'name', 'text', false, 'Display name (e.g. "Semestre 2026-1").'),
      col('start_date', 'startDate', 'date', false, 'First day of the semester.'),
      col('end_date', 'endDate', 'date', false, 'Last day of the semester.'),
      col('active', 'active', 'boolean', false, 'Only one active semester at a time. Default false.'),
      createdAt(),
    ],
    keys: { primary: ['id'] },
    relations: [['exclusions', 'SemesterExclusion[]', 'Dates with no classes.']],
  },
  {
    model: 'SemesterExclusion',
    table: 'semester_exclusions',
    delegate: 'semesterExclusion',
    group: 'Catalogue',
    description: 'Dates excluded from a semester (public holidays, breaks). Removed from the expected class calendar of every group.',
    columns: [
      pk(),
      col('semester_id', 'semesterId', 'text', false, 'Semester.', { key: 'FK → semesters.id' }),
      col('date', 'date', 'date', false, 'Excluded date.'),
      col('reason', 'reason', 'text', true, 'Reason (e.g. "Festivo").'),
      createdAt(),
    ],
    keys: { primary: ['id'] },
    relations: [['semester', 'Semester', '']],
  },
  {
    model: 'SystemConfig',
    table: 'system_config',
    delegate: 'systemConfig',
    group: 'Catalogue',
    description:
      'Key/value configuration. Holds the pay brackets (rate_2_students … rate_5plus_students), the fixed assistant rate, the tuition plan (tuition_adult_total, tuition_child_total, tuition_plan_classes, tuition_adult_age), the rain alert threshold and the start date of the assistant triple-match rule.',
    columns: [
      col('key', 'key', 'text', false, 'Configuration key.', { key: 'PK' }),
      col('value', 'value', 'text', false, 'Value, stored as text and parsed by the consumer.'),
      col('updated_at', 'updatedAt', 'timestamp', false, 'Last change.'),
      col('updated_by', 'updatedBy', 'text', true, 'Who changed it.'),
    ],
    keys: { primary: ['key'] },
    relations: [],
  },

  // ──────────────────────────── Classes ────────────────────────────
  {
    model: 'ClassSession',
    table: 'class_sessions',
    delegate: 'classSession',
    group: 'Classes',
    description:
      'A class on a given date. Three kinds share this table: REGULAR (a group class), MAKEUP (group make-up, no group_id, participants in makeup_participants) and FESTIVAL (several professors, flat rate each). The unique constraint (group_id, date) prevents duplicated sessions for a group on the same day. A regular session only becomes REALIZADA when the professor and the coordinator reports match.',
    columns: [
      pk(),
      col('group_id', 'groupId', 'text', true, 'Group of a REGULAR session. Null for make-ups and festivals.', { key: 'FK → groups.id' }),
      col('kind', 'kind', 'SessionKind', false, 'REGULAR / MAKEUP / FESTIVAL. Default REGULAR.'),
      col('title', 'title', 'text', true, 'Title of a make-up or festival.'),
      col('makeup_professor_id', 'makeupProfessorId', 'text', true, 'Professor assigned to a make-up.', { key: 'FK → professors.id' }),
      col('date', 'date', 'date', false, 'Date of the class (America/Bogota).'),
      col('status', 'status', 'SessionStatus', false, 'Lifecycle state. Default PROGRAMADA.'),
      col('effective_units', 'effectiveUnits', 'numeric(3,1)', false, 'How many attendances this session is worth. 1.0 for every regular class; configurable for make-ups.'),
      col('cancellation_reason', 'cancellationReason', 'text', true, 'Free-text reason, required when the category is OTRA.'),
      col('cancellation_category', 'cancellationCategory', 'CancellationCategory', true, 'Structured cancellation reason.'),
      col('dictated_by_owner', 'dictatedByOwner', 'boolean', false, 'false = the owner professor did not teach it. Default true.'),
      col('not_dictated_note', 'notDictatedNote', 'text', true, 'Mandatory note when dictated_by_owner is false.'),
      col('substitute_professor_id', 'substituteProfessorId', 'text', true, 'Professor who actually taught, if not the owner.', { key: 'FK → professors.id' }),
      col('assistant_id', 'assistantId', 'text', true, 'Assistant declared in the consolidated report.', { key: 'FK → assistants.id' }),
      col('reported_by_id', 'reportedById', 'text', true, 'User of the last report.', { key: 'FK → users.id' }),
      col('first_reported_at', 'firstReportedAt', 'timestamp', true, 'Timestamp of the FIRST report, whoever filed it. Reporting after the class day suspends the pay; editing later never re-suspends. Null on historical rows, which are therefore never late.'),
      col('payment_unlocked_by_id', 'paymentUnlockedById', 'text', true, 'ADMIN who released a late-report suspension.'),
      col('payment_unlocked_at', 'paymentUnlockedAt', 'timestamp', true, 'When the suspension was released.'),
      col('assistant_confirmed_id', 'assistantConfirmedId', 'text', true, 'Assistant who confirmed having accompanied the class (their own claim).', { key: 'FK → assistants.id' }),
      col('assistant_confirmed_at', 'assistantConfirmedAt', 'timestamp', true, 'When the assistant confirmed.'),
      col('coordinator_validated_by_id', 'coordinatorValidatedById', 'text', true, 'Coordinator/admin who validated the assistant. Stamped automatically when their own report is the source.'),
      col('coordinator_validated_at', 'coordinatorValidatedAt', 'timestamp', true, 'When the assistant was validated.'),
      col('festival_rate', 'festivalRate', 'numeric(12,2)', true, 'Flat amount paid to EACH professor of a festival.'),
      col('consolidation_status', 'consolidationStatus', 'ConsolidationStatus', false, 'PENDING / MATCHED / MISMATCH of the dual report. Default PENDING.'),
      col('consolidation_diff', 'consolidationDiff', 'jsonb', true, 'Detail of the disagreement per student when the status is MISMATCH.'),
      col('consolidated_at', 'consolidatedAt', 'timestamp', true, 'When both reports matched.'),
      createdAt(),
    ],
    keys: { primary: ['id'], unique: [['group_id', 'date']] },
    relations: [
      ['group', 'Group', 'Group of a regular session.'],
      ['makeupProfessor / substituteProfessor', 'Professor', 'Professors of a make-up or substitution.'],
      ['assistant / assistantConfirmed', 'Assistant', 'Declared vs. self-confirmed assistant.'],
      ['reports', 'ClassReport[]', 'The two staging reports.'],
      ['attendanceRecords', 'AttendanceRecord[]', 'Consolidated attendance (source of truth).'],
      ['makeupParticipants', 'MakeupParticipant[]', 'Participants of a make-up/festival.'],
      ['festivalProfessors', 'FestivalProfessor[]', 'Professors of a festival.'],
      ['costRecords', 'CostRecord[]', 'Money generated by this session.'],
      ['editLogs', 'SessionEditLog[]', 'Audit of report edits.'],
    ],
  },
  {
    model: 'ClassReport',
    table: 'class_reports',
    delegate: 'classReport',
    group: 'Classes',
    description:
      'Staging report of one side of the dual report. At most two rows per session (PROFESSOR and COORDINATOR). Deleted in cascade with the session. When both agree the consolidation writes attendance_records and enables the pay.',
    columns: [
      pk(),
      col('session_id', 'sessionId', 'text', false, 'Session being reported. ON DELETE CASCADE.', { key: 'FK → class_sessions.id' }),
      col('reporter_type', 'reporterType', 'ClassReporterType', false, 'PROFESSOR or COORDINATOR. Unique together with session_id.', { key: 'UQ' }),
      col('reported_by_id', 'reportedById', 'text', true, 'User who filed it.', { key: 'FK → users.id' }),
      col('dictated_by_owner', 'dictatedByOwner', 'boolean', false, 'Whether this report says the owner taught the class. Compared between both reports. Default true.'),
      col('dictating_professor_id', 'dictatingProfessorId', 'text', true, 'Professor this report says taught the class. Loose id (no FK): staging data compared by identity only.'),
      col('not_dictated_note', 'notDictatedNote', 'text', true, 'Mandatory note when the owner did not teach.'),
      col('assistant_id', 'assistantId', 'text', true, 'Assistant declared in this report. Compared between both reports.'),
      col('submitted_at', 'submittedAt', 'timestamp', false, 'First submission of this report.'),
      col('updated_at', 'updatedAt', 'timestamp', false, 'Last edit of this report.'),
    ],
    keys: { primary: ['id'], unique: [['session_id', 'reporter_type']] },
    relations: [
      ['session', 'ClassSession', ''],
      ['reportedBy', 'User', ''],
      ['attendance', 'ClassReportAttendance[]', 'Marks per student of this report.'],
    ],
  },
  {
    model: 'ClassReportAttendance',
    table: 'class_report_attendance',
    delegate: 'classReportAttendance',
    group: 'Classes',
    description:
      'Attendance mark of one student inside one staging report. The consolidation compares status and attendance type student by student; the justification text is deliberately NOT compared.',
    columns: [
      pk(),
      col('class_report_id', 'classReportId', 'text', false, 'Report this mark belongs to. ON DELETE CASCADE.', { key: 'FK → class_reports.id' }),
      col('student_id', 'studentId', 'text', false, 'Student. Unique together with the report.', { key: 'FK → students.id (UQ)' }),
      col('status', 'status', 'AttendanceStatus', false, 'P / A / J / N-A as reported by this side.'),
      col('attendance_type', 'attendanceType', 'AttendanceType', false, 'REGULAR or REPOSICION. Default REGULAR.'),
      col('justification', 'justification', 'text', true, 'Reason of an excused absence. Carried to the consolidated record; never compared.'),
    ],
    keys: { primary: ['id'], unique: [['class_report_id', 'student_id']] },
    relations: [
      ['report', 'ClassReport', ''],
      ['student', 'Student', ''],
    ],
  },
  {
    model: 'AttendanceRecord',
    table: 'attendance_records',
    delegate: 'attendanceRecord',
    group: 'Classes',
    description:
      'Consolidated attendance — the single source of truth for reports, statistics and the cost engine. Written only when both reports match (or directly for make-ups and festivals). One row per session and student.',
    columns: [
      pk(),
      col('session_id', 'sessionId', 'text', false, 'Session.', { key: 'FK → class_sessions.id' }),
      col('student_id', 'studentId', 'text', false, 'Student. Unique together with the session.', { key: 'FK → students.id (UQ)' }),
      col('status', 'status', 'AttendanceStatus', false, 'Final mark.'),
      col('attendance_type', 'attendanceType', 'AttendanceType', false, 'REGULAR or REPOSICION. Default REGULAR.'),
      col('justification', 'justification', 'text', true, 'Reason of an excused absence.'),
      col('reported_by_id', 'reportedById', 'text', true, 'User whose report produced this row.', { key: 'FK → users.id' }),
      createdAt(),
    ],
    keys: { primary: ['id'], unique: [['session_id', 'student_id']] },
    relations: [
      ['session', 'ClassSession', ''],
      ['student', 'Student', ''],
      ['reportedBy', 'User', ''],
    ],
  },
  {
    model: 'MakeupParticipant',
    table: 'makeup_participants',
    delegate: 'makeupParticipant',
    group: 'Classes',
    description: 'Students assigned to a group make-up or to a festival. Composite key (session, student); deleted in cascade with the session.',
    columns: [
      col('session_id', 'sessionId', 'text', false, 'Make-up / festival session.', { key: 'PK, FK → class_sessions.id' }),
      col('student_id', 'studentId', 'text', false, 'Participant.', { key: 'PK, FK → students.id' }),
    ],
    keys: { primary: ['session_id', 'student_id'] },
    relations: [['session', 'ClassSession', ''], ['student', 'Student', '']],
  },
  {
    model: 'FestivalProfessor',
    table: 'festival_professors',
    delegate: 'festivalProfessor',
    group: 'Classes',
    description: 'Professors taking part in a festival. Each one earns the session festival_rate (equal pay). Composite key (session, professor).',
    columns: [
      col('session_id', 'sessionId', 'text', false, 'Festival session.', { key: 'PK, FK → class_sessions.id' }),
      col('professor_id', 'professorId', 'text', false, 'Participating professor.', { key: 'PK, FK → professors.id' }),
    ],
    keys: { primary: ['session_id', 'professor_id'] },
    relations: [['session', 'ClassSession', ''], ['professor', 'Professor', '']],
  },
  {
    model: 'SessionEditLog',
    table: 'session_edit_logs',
    delegate: 'sessionEditLog',
    group: 'Audit',
    description: 'Audit trail of edits to an already filed attendance report. Keeps the whole previous and new state as JSON, shown in Reports → Class.',
    columns: [
      pk(),
      col('session_id', 'sessionId', 'text', false, 'Edited session.', { key: 'FK → class_sessions.id' }),
      col('edited_by_id', 'editedById', 'text', true, 'User who edited.', { key: 'FK → users.id' }),
      col('edited_at', 'editedAt', 'timestamp', false, 'When the edit happened.'),
      col('previous_state', 'previousState', 'jsonb', true, 'Snapshot before the edit.'),
      col('new_state', 'newState', 'jsonb', true, 'Snapshot after the edit.'),
    ],
    keys: { primary: ['id'] },
    relations: [['session', 'ClassSession', ''], ['editedBy', 'User', '']],
  },
  {
    model: 'StudentGroupHistory',
    table: 'student_group_history',
    delegate: 'studentGroupHistory',
    group: 'Audit',
    description: 'History of group changes of a student. Also used to explain report conflicts caused by a transfer that happened between the two reports.',
    columns: [
      pk(),
      col('student_id', 'studentId', 'text', false, 'Student.', { key: 'FK → students.id' }),
      col('from_group_id', 'fromGroupId', 'text', true, 'Origin group.', { key: 'FK → groups.id' }),
      col('to_group_id', 'toGroupId', 'text', true, 'Destination group.', { key: 'FK → groups.id' }),
      col('action_type', 'actionType', 'text', false, 'TRANSFER | ADD_GROUP | REMOVE_GROUP.'),
      col('reason', 'reason', 'text', true, 'Reason of the change.'),
      col('changed_by_id', 'changedById', 'text', true, 'User who made the change.'),
      col('changed_at', 'changedAt', 'timestamp', false, 'When it happened.'),
    ],
    keys: { primary: ['id'] },
    relations: [['student', 'Student', ''], ['fromGroup / toGroup', 'Group', '']],
  },

  // ──────────────────────────── Payroll ────────────────────────────
  {
    model: 'CostRecord',
    table: 'cost_records',
    delegate: 'costRecord',
    group: 'Payroll',
    description:
      'Money owed for one session to one payee. Produced by the cost engine when a session is consolidated: professor = bracket rate by present students × effective units; assistant = fixed rate × units; festival = flat rate per participating professor. professor_id and assistant_id are mutually exclusive (payee_type decides which one is set). Flow: pay_status PAYABLE → approved_at (validated) → paid_at (paid); held_at excludes the row from the payout.',
    columns: [
      pk(),
      col('session_id', 'sessionId', 'text', false, 'Session that generated the cost.', { key: 'FK → class_sessions.id' }),
      col('professor_id', 'professorId', 'text', true, 'Payee when payee_type = PROFESSOR.', { key: 'FK → professors.id' }),
      col('assistant_id', 'assistantId', 'text', true, 'Payee when payee_type = ASSISTANT.', { key: 'FK → assistants.id' }),
      col('payee_type', 'payeeType', 'PayeeType', false, 'Which of the two id columns is in use.'),
      col('present_count', 'presentCount', 'integer', false, 'Present students used to pick the bracket. Default 0.'),
      col('effective_units', 'effectiveUnits', 'numeric(3,1)', false, 'Units of the session at the time of the calculation.'),
      col('rate', 'rate', 'numeric(12,2)', false, 'Applied rate: flat bracket amount per session (professor), fixed rate (assistant) or festival rate.'),
      col('total', 'total', 'numeric(12,2)', false, 'rate × effective units. Amount owed in COP.'),
      col('period', 'period', 'text', false, 'Fortnight the class belongs to, as "YYYY-MM-1" (days 1-15) or "YYYY-MM-2" (16-end).'),
      col('pay_status', 'payStatus', 'PayStatus', false, 'PAYABLE / SUSPENDED_LATE / PENDING_MATCH. Default PAYABLE.'),
      col('approved_at', 'approvedAt', 'timestamp', true, 'When an admin validated the row for payment. Required before paying.'),
      col('approved_by_id', 'approvedById', 'text', true, 'Admin who validated it.'),
      col('held_at', 'heldAt', 'timestamp', true, 'When the row was held back, excluding it from the payout.'),
      col('held_by_id', 'heldById', 'text', true, 'Admin who held it.'),
      col('paid_at', 'paidAt', 'timestamp', true, 'When the money was actually handed over.'),
      col('paid_by_id', 'paidById', 'text', true, 'Admin who marked it as paid.'),
      col('carried_from_period', 'carriedFromPeriod', 'text', true, 'Set when a suspended row was carried over from an earlier fortnight during a closing.'),
      createdAt(),
    ],
    keys: { primary: ['id'] },
    relations: [
      ['session', 'ClassSession', ''],
      ['professor', 'Professor', ''],
      ['assistant', 'Assistant', ''],
    ],
  },
  {
    model: 'PayrollClosure',
    table: 'payroll_closures',
    delegate: 'payrollClosure',
    group: 'Payroll',
    description:
      'Closing of a fortnight. One row per period. While locked = true no report or cost of that period can be edited (the guard answers 409). Reopening unlocks it but does not undo the carry-overs.',
    columns: [
      pk(),
      col('period', 'period', 'text', false, 'Fortnight, e.g. "2026-08-1". Unique.', { key: 'UQ' }),
      col('closed_by_id', 'closedById', 'text', true, 'Admin who closed it.'),
      col('closed_by_name', 'closedByName', 'text', true, 'Name of that admin, frozen.'),
      col('closed_at', 'closedAt', 'timestamp', false, 'When it was closed.'),
      col('reopened_by_id', 'reopenedById', 'text', true, 'Admin who reopened it.'),
      col('reopened_at', 'reopenedAt', 'timestamp', true, 'When it was reopened.'),
      col('locked', 'locked', 'boolean', false, 'true = period frozen. Default true.'),
    ],
    keys: { primary: ['id'], unique: [['period']] },
    relations: [['lines', 'PayrollClosureLine[]', 'Frozen totals per payee.']],
  },
  {
    model: 'PayrollClosureLine',
    table: 'payroll_closure_lines',
    delegate: 'payrollClosureLine',
    group: 'Payroll',
    description: 'Frozen snapshot of one payee inside a closing: how many classes, how much was paid and how much was carried over. Deleted in cascade with the closure.',
    columns: [
      pk(),
      col('closure_id', 'closureId', 'text', false, 'Closing this line belongs to. ON DELETE CASCADE.', { key: 'FK → payroll_closures.id' }),
      col('payee_type', 'payeeType', 'PayeeType', false, 'PROFESSOR or ASSISTANT.'),
      col('payee_id', 'payeeId', 'text', false, 'Id of the professor or assistant (loose id, no FK: it is a snapshot).'),
      col('payee_name', 'payeeName', 'text', true, 'Name frozen at closing time.'),
      col('class_count', 'classCount', 'integer', false, 'Classes included. Default 0.'),
      col('total_paid', 'totalPaid', 'numeric(12,2)', false, 'Amount settled in this period. Default 0.'),
      col('total_carried', 'totalCarried', 'numeric(12,2)', false, 'Amount carried over to the next period. Default 0.'),
      col('snapshot', 'snapshot', 'jsonb', true, 'Raw detail of the lines at closing time.'),
    ],
    keys: { primary: ['id'] },
    relations: [['closure', 'PayrollClosure', '']],
  },
  {
    model: 'PayrollLog',
    table: 'payroll_logs',
    delegate: 'payrollLog',
    group: 'Audit',
    description: 'Audit trail of every payroll action on a period: closings, reopenings, approvals, holds, payments and carry-overs.',
    columns: [
      pk(),
      col('period', 'period', 'text', false, 'Fortnight the action refers to.'),
      col('action', 'action', 'PayrollLogAction', false, 'Action performed.'),
      col('actor_id', 'actorId', 'text', true, 'User who performed it.'),
      col('actor_name', 'actorName', 'text', true, 'Name of that user, frozen.'),
      col('at', 'at', 'timestamp', false, 'When it happened.'),
      col('detail', 'detail', 'jsonb', true, 'Extra payload (affected ids, totals).'),
    ],
    keys: { primary: ['id'] },
    relations: [],
  },
  {
    model: 'PayrollApproval',
    table: 'payroll_approvals',
    delegate: 'payrollApproval',
    group: 'Payroll',
    description: 'Legacy single approval per fortnight, superseded by the per-class approval flow and the closing. Kept for historical rows.',
    legacy: true,
    columns: [
      pk(),
      col('period', 'period', 'text', false, 'Fortnight. Unique.', { key: 'UQ' }),
      col('approved_by_id', 'approvedById', 'text', true, 'Admin who approved.'),
      col('approved_by_name', 'approvedByName', 'text', true, 'Name of that admin, frozen.'),
      col('total_payable', 'totalPayable', 'numeric(12,2)', false, 'Payable total at approval time. Default 0.'),
      col('total_retained', 'totalRetained', 'numeric(12,2)', false, 'Retained total at approval time. Default 0.'),
      col('note', 'note', 'text', true, 'Free note.'),
      col('approved_at', 'approvedAt', 'timestamp', false, 'When it was approved.'),
    ],
    keys: { primary: ['id'], unique: [['period']] },
    relations: [],
  },

  // ──────────────────────────── Other ────────────────────────────
  {
    model: 'Event',
    table: 'events',
    delegate: 'event',
    group: 'Other',
    description: 'Tournaments and clinics with a flat fee for the professor in charge.',
    columns: [
      pk(),
      col('name', 'name', 'text', false, 'Event name.'),
      col('date', 'date', 'date', false, 'Date of the event.'),
      col('professor_id', 'professorId', 'text', false, 'Professor in charge.', { key: 'FK → professors.id' }),
      col('fixed_rate', 'fixedRate', 'numeric(12,2)', false, 'Flat fee in COP.'),
      col('description', 'description', 'text', true, 'Description.'),
      col('active', 'active', 'boolean', false, 'Soft delete. Default true.'),
      createdAt(),
    ],
    keys: { primary: ['id'] },
    relations: [['professor', 'Professor', '']],
  },
  {
    model: 'EnrollmentRequest',
    table: 'enrollment_requests',
    delegate: 'enrollmentRequest',
    group: 'Other',
    description: 'Submissions of the public enrollment form. Superseded by the data-validation flow, kept for the historical requests.',
    legacy: true,
    columns: [
      pk(),
      col('student_name', 'studentName', 'text', false, 'Student name as typed by the applicant.'),
      col('birth_date', 'birthDate', 'date', true, 'Date of birth.'),
      col('parent_name', 'parentName', 'text', true, 'Guardian name.'),
      col('email', 'email', 'text', false, 'Contact email.'),
      col('phone', 'phone', 'text', true, 'Contact phone.'),
      col('eps', 'eps', 'text', true, 'Health provider.'),
      col('payment_date', 'paymentDate', 'date', true, 'Declared payment date.'),
      col('payment_proof', 'paymentProof', 'text', true, 'Payment proof (long text / data URL).'),
      col('notes', 'notes', 'text', true, 'Free notes.'),
      col('preferred_group_id', 'preferredGroupId', 'text', true, 'Requested main group.'),
      col('preferred_secondary_group_id', 'preferredSecondaryGroupId', 'text', true, 'Requested secondary group.'),
      col('status', 'status', 'text', false, 'PENDING | APPROVED | REJECTED. Default PENDING.'),
      col('submitted_at', 'submittedAt', 'timestamp', false, 'Submission timestamp.'),
    ],
    keys: { primary: ['id'] },
    relations: [],
  },
  {
    model: 'MakeupClass',
    table: 'makeup_classes',
    delegate: 'makeupClass',
    group: 'Other',
    description: 'Legacy make-up model. Group make-ups now live in class_sessions with kind = MAKEUP; this table is kept for historical rows only.',
    legacy: true,
    columns: [
      pk(),
      col('date', 'date', 'date', false, 'Date of the make-up.'),
      col('type', 'type', 'MakeupType', false, 'INDIVIDUAL or GRUPAL.'),
      col('professor_id', 'professorId', 'text', true, 'Professor.', { key: 'FK → professors.id' }),
      col('assistant_id', 'assistantId', 'text', true, 'Assistant.', { key: 'FK → assistants.id' }),
      col('student_count', 'studentCount', 'integer', false, 'Number of students. Default 0.'),
      col('description', 'description', 'text', true, 'Description.'),
      col('created_by', 'createdBy', 'text', true, 'Who created it.'),
      createdAt(),
    ],
    keys: { primary: ['id'] },
    relations: [['professor', 'Professor', ''], ['assistant', 'Assistant', ''], ['enrollments', 'MakeupEnrollment[]', '']],
  },
  {
    model: 'MakeupEnrollment',
    table: 'makeup_enrollments',
    delegate: 'makeupEnrollment',
    group: 'Other',
    description: 'Students of a legacy make-up class. Composite key (makeup class, student).',
    legacy: true,
    columns: [
      col('makeup_class_id', 'makeupClassId', 'text', false, 'Legacy make-up class.', { key: 'PK, FK → makeup_classes.id' }),
      col('student_id', 'studentId', 'text', false, 'Student.', { key: 'PK, FK → students.id' }),
    ],
    keys: { primary: ['makeup_class_id', 'student_id'] },
    relations: [['makeupClass', 'MakeupClass', ''], ['student', 'Student', '']],
  },
];

const REDACTED = '[REDACTED]';

function tableByModel(model) {
  return TABLES.find((t) => t.model === model) || null;
}

function sensitiveColumns(table) {
  return table.columns.filter((c) => c.sensitive).map((c) => c.field);
}

module.exports = { ENUMS, TABLES, REDACTED, tableByModel, sensitiveColumns };
