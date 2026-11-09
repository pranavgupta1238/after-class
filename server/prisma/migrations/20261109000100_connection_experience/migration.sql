-- AlterTable
ALTER TABLE "match_requests" ADD COLUMN     "connection_mode" TEXT NOT NULL DEFAULT 'social';

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "confirmed_one_at" TIMESTAMPTZ(6),
ADD COLUMN     "confirmed_two_at" TIMESTAMPTZ(6),
ADD COLUMN     "proposed_at" TIMESTAMPTZ(6),
ADD COLUMN     "proposed_by_id" UUID,
ADD COLUMN     "proposed_location" VARCHAR(120),
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "connection_profiles" (
    "user_id" UUID NOT NULL,
    "bio" VARCHAR(240) NOT NULL DEFAULT '',
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prompt" VARCHAR(100) NOT NULL DEFAULT '',
    "answer" VARCHAR(200) NOT NULL DEFAULT '',
    "birth_date" DATE,
    "dating_enabled" BOOLEAN NOT NULL DEFAULT false,
    "dating_intent" TEXT NOT NULL DEFAULT 'relationship',
    "min_age" INTEGER NOT NULL DEFAULT 18,
    "max_age" INTEGER NOT NULL DEFAULT 30,
    "available_until" TIMESTAMPTZ(6),
    "availability_activity" VARCHAR(30) NOT NULL DEFAULT 'coffee',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "connection_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateTable
CREATE TABLE "meeting_feedback" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "outcome" VARCHAR(30) NOT NULL,
    "note" VARCHAR(400) NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_appeals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "response" VARCHAR(1000),
    "reviewer_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "verification_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "connection_profiles_available_until_idx" ON "connection_profiles"("available_until");

-- CreateIndex
CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks"("blocked_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_feedback_match_id_user_id_key" ON "meeting_feedback"("match_id", "user_id");

-- CreateIndex
CREATE INDEX "verification_appeals_user_id_status_idx" ON "verification_appeals"("user_id", "status");

-- AddForeignKey
ALTER TABLE "connection_profiles" ADD CONSTRAINT "connection_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_feedback" ADD CONSTRAINT "meeting_feedback_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_feedback" ADD CONSTRAINT "meeting_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_appeals" ADD CONSTRAINT "verification_appeals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_appeals" ADD CONSTRAINT "verification_appeals_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE connection_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_appeals ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX verification_appeals_one_pending ON verification_appeals(user_id) WHERE status = 'pending';
ALTER TABLE user_blocks ADD CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id);
ALTER TABLE connection_profiles ADD CONSTRAINT connection_profiles_age_range CHECK (min_age >= 18 AND max_age <= 100 AND min_age <= max_age);
