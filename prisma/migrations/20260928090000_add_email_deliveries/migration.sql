ALTER TABLE `campaigns`
    ADD COLUMN `sent_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `failed_count` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `email_deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NOT NULL,
    `lead_id` VARCHAR(191) NOT NULL,
    `step` INTEGER NOT NULL,
    `recipient` VARCHAR(191) NOT NULL,
    `subject` TEXT NOT NULL,
    `body` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Sending',
    `message_id` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `email_deliveries_campaign_id_lead_id_step_key` (`campaign_id`, `lead_id`, `step`),
    INDEX `email_deliveries_campaign_id_status_idx` (`campaign_id`, `status`),
    CONSTRAINT `email_deliveries_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;