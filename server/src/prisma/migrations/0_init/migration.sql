-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEACHER', 'ASSISTANT', 'PARENT', 'PHYSICAL_TRAINER', 'RECEPTION');

-- CreateEnum
CREATE TYPE "EnrollmentType" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('REGULAR', 'MAKEUP', 'FESTIVAL');

-- CreateEnum
CREATE TYPE "CancellationCategory" AS ENUM ('LLUVIA', 'SIN_ESTUDIANTES', 'OTRA');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PROGRAMADA', 'REALIZADA', 'CANCELADA', 'CANCELADA_MITAD');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENTE', 'AUSENTE', 'JUSTIFICADA');

-- CreateEnum
CREATE TYPE "AttendanceType" AS ENUM ('REGULAR', 'REPOSICION');

-- CreateEnum
CREATE TYPE "PayeeType" AS ENUM ('PROFESSOR', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "PayStatus" AS ENUM ('PAYABLE', 'SUSPENDED_LATE', 'PENDING_MATCH');

-- CreateEnum
CREATE TYPE "MakeupType" AS ENUM ('INDIVIDUAL', 'GRUPAL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'TEACHER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "policies_accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professors" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "parent_user_id" TEXT,
    "classes_acquired" INTEGER NOT NULL DEFAULT 0,
    "payment_complete" BOOLEAN NOT NULL DEFAULT false,
    "suspended_from" DATE,
    "suspended_until" DATE,
    "suspension_reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactivation_reason" TEXT,
    "deactivated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "professor_id" TEXT NOT NULL,
    "lunes" BOOLEAN NOT NULL DEFAULT false,
    "martes" BOOLEAN NOT NULL DEFAULT false,
    "miercoles" BOOLEAN NOT NULL DEFAULT false,
    "jueves" BOOLEAN NOT NULL DEFAULT false,
    "viernes" BOOLEAN NOT NULL DEFAULT false,
    "sabado" BOOLEAN NOT NULL DEFAULT false,
    "domingo" BOOLEAN NOT NULL DEFAULT false,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "class_units" DECIMAL(3,1) NOT NULL,
    "court" INTEGER,
    "ball_level" TEXT,
    "sub_level" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactivation_reason" TEXT,
    "deactivated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_enrollments" (
    "student_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "enrollment_type" "EnrollmentType" NOT NULL DEFAULT 'PRIMARY',
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("student_id","group_id")
);

-- CreateTable
CREATE TABLE "class_sessions" (
    "id" TEXT NOT NULL,
    "group_id" TEXT,
    "kind" "SessionKind" NOT NULL DEFAULT 'REGULAR',
    "title" TEXT,
    "makeup_professor_id" TEXT,
    "date" DATE NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'PROGRAMADA',
    "effective_units" DECIMAL(3,1) NOT NULL,
    "cancellation_reason" TEXT,
    "cancellation_category" "CancellationCategory",
    "dictated_by_owner" BOOLEAN NOT NULL DEFAULT true,
    "not_dictated_note" TEXT,
    "substitute_professor_id" TEXT,
    "assistant_id" TEXT,
    "reported_by_id" TEXT,
    "first_reported_at" TIMESTAMP(3),
    "payment_unlocked_by_id" TEXT,
    "payment_unlocked_at" TIMESTAMP(3),
    "assistant_confirmed_id" TEXT,
    "assistant_confirmed_at" TIMESTAMP(3),
    "coordinator_validated_by_id" TEXT,
    "coordinator_validated_at" TIMESTAMP(3),
    "festival_rate" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "festival_professors" (
    "session_id" TEXT NOT NULL,
    "professor_id" TEXT NOT NULL,

    CONSTRAINT "festival_professors_pkey" PRIMARY KEY ("session_id","professor_id")
);

-- CreateTable
CREATE TABLE "makeup_participants" (
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,

    CONSTRAINT "makeup_participants_pkey" PRIMARY KEY ("session_id","student_id")
);

-- CreateTable
CREATE TABLE "session_edit_logs" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "edited_by_id" TEXT,
    "edited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous_state" JSONB,
    "new_state" JSONB,

    CONSTRAINT "session_edit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "attendance_type" "AttendanceType" NOT NULL DEFAULT 'REGULAR',
    "justification" TEXT,
    "reported_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_records" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "professor_id" TEXT,
    "assistant_id" TEXT,
    "payee_type" "PayeeType" NOT NULL,
    "present_count" INTEGER NOT NULL DEFAULT 0,
    "effective_units" DECIMAL(3,1) NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "period" TEXT NOT NULL,
    "pay_status" "PayStatus" NOT NULL DEFAULT 'PAYABLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "makeup_classes" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "MakeupType" NOT NULL,
    "professor_id" TEXT,
    "assistant_id" TEXT,
    "student_count" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "makeup_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "makeup_enrollments" (
    "makeup_class_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,

    CONSTRAINT "makeup_enrollments_pkey" PRIMARY KEY ("makeup_class_id","student_id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "professor_id" TEXT NOT NULL,
    "fixed_rate" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_requests" (
    "id" TEXT NOT NULL,
    "student_name" TEXT NOT NULL,
    "birth_date" DATE,
    "parent_name" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "eps" TEXT,
    "payment_date" DATE,
    "payment_proof" TEXT,
    "notes" TEXT,
    "preferred_group_id" TEXT,
    "preferred_secondary_group_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "student_group_history" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "from_group_id" TEXT,
    "to_group_id" TEXT,
    "action_type" TEXT NOT NULL,
    "reason" TEXT,
    "changed_by_id" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_group_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semesters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semester_exclusions" (
    "id" TEXT NOT NULL,
    "semester_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semester_exclusions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_approvals" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_by_name" TEXT,
    "total_payable" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_retained" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "professors_user_id_key" ON "professors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "assistants_user_id_key" ON "assistants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "groups_code_key" ON "groups"("code");

-- CreateIndex
CREATE UNIQUE INDEX "class_sessions_group_id_date_key" ON "class_sessions"("group_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_session_id_student_id_key" ON "attendance_records"("session_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_approvals_period_key" ON "payroll_approvals"("period");

-- AddForeignKey
ALTER TABLE "professors" ADD CONSTRAINT "professors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistants" ADD CONSTRAINT "assistants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_makeup_professor_id_fkey" FOREIGN KEY ("makeup_professor_id") REFERENCES "professors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_substitute_professor_id_fkey" FOREIGN KEY ("substitute_professor_id") REFERENCES "professors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_assistant_id_fkey" FOREIGN KEY ("assistant_id") REFERENCES "assistants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_assistant_confirmed_id_fkey" FOREIGN KEY ("assistant_confirmed_id") REFERENCES "assistants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "festival_professors" ADD CONSTRAINT "festival_professors_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "festival_professors" ADD CONSTRAINT "festival_professors_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_participants" ADD CONSTRAINT "makeup_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_participants" ADD CONSTRAINT "makeup_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_edit_logs" ADD CONSTRAINT "session_edit_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_edit_logs" ADD CONSTRAINT "session_edit_logs_edited_by_id_fkey" FOREIGN KEY ("edited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_assistant_id_fkey" FOREIGN KEY ("assistant_id") REFERENCES "assistants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_classes" ADD CONSTRAINT "makeup_classes_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_classes" ADD CONSTRAINT "makeup_classes_assistant_id_fkey" FOREIGN KEY ("assistant_id") REFERENCES "assistants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_enrollments" ADD CONSTRAINT "makeup_enrollments_makeup_class_id_fkey" FOREIGN KEY ("makeup_class_id") REFERENCES "makeup_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_enrollments" ADD CONSTRAINT "makeup_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_group_history" ADD CONSTRAINT "student_group_history_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_group_history" ADD CONSTRAINT "student_group_history_from_group_id_fkey" FOREIGN KEY ("from_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_group_history" ADD CONSTRAINT "student_group_history_to_group_id_fkey" FOREIGN KEY ("to_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semester_exclusions" ADD CONSTRAINT "semester_exclusions_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

