-- AlterTable
ALTER TABLE "students" ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "document" TEXT,
ADD COLUMN     "guardian_name" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "previous_classes" INTEGER NOT NULL DEFAULT 0;
