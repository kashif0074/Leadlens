ALTER TABLE `EmailAccount`
    ADD COLUMN `display_name` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `send_lock_until` DATETIME(3) NULL;

ALTER TABLE `email_deliveries`
    ADD COLUMN `sender_email` VARCHAR(191) NULL;

CREATE TABLE `email_suppressions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `email_suppressions_user_id_email_key` (`user_id`, `email`),
    INDEX `email_suppressions_email_idx` (`email`),
    CONSTRAINT `email_suppressions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;