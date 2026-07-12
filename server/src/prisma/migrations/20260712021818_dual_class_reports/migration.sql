-- CreateEnum
CREATE TYPE "ClassReporterType" AS ENUM ('PROFESSOR', 'COORDINATOR');

-- CreateEnum
CREATE TYPE "ConsolidationStatus" AS ENUM ('PENDING', 'MATCHED', 'MISMATCH');

-- AlterTable
ALTER TABLE "class_sessions" ADD COLUMN     "consolidated_at" TIMESTAMP(3),
ADD COLUMN     "consolidation_diff" JSONB,
ADD COLUMN     "consolidation_status" "ConsolidationStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "class_reports" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "reporter_type" "ClassReporterType" NOT NULL,
    "reported_by_id" TEXT,
    "dictated_by_owner" BOOLEAN NOT NULL DEFAULT true,
    "dictating_professor_id" TEXT,
    "not_dictated_note" TEXT,
    "assistant_id" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_report_attendance" (
    "id" TEXT NOT NULL,
    "class_report_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "attendance_type" "AttendanceType" NOT NULL DEFAULT 'REGULAR',
    "justification" TEXT,

    CONSTRAINT "class_report_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_reports_session_id_reporter_type_key" ON "class_reports"("session_id", "reporter_type");

-- CreateIndex
CREATE UNIQUE INDEX "class_report_attendance_class_report_id_student_id_key" ON "class_report_attendance"("class_report_id", "student_id");

-- AddForeignKey
ALTER TABLE "class_reports" ADD CONSTRAINT "class_reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_reports" ADD CONSTRAINT "class_reports_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_report_attendance" ADD CONSTRAINT "class_report_attendance_class_report_id_fkey" FOREIGN KEY ("class_report_id") REFERENCES "class_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_report_attendance" ADD CONSTRAINT "class_report_attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
