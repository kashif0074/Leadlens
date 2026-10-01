ALTER TABLE `email_deliveries`
    MODIFY COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'Pending',
    ADD COLUMN `attempt_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `next_attempt_at` DATETIME(3) NULL,
    ADD INDEX `email_deliveries_queue_idx` (`status`, `next_attempt_at`, `created_at`);