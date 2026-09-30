ALTER TABLE `EmailAccount`
    ADD COLUMN `gmail_history_id` VARCHAR(191) NULL,
    ADD COLUMN `last_inbox_sync_at` DATETIME(3) NULL;

ALTER TABLE `email_deliveries`
    ADD COLUMN `gmail_thread_id` VARCHAR(191) NULL,
    ADD INDEX `email_deliveries_gmail_thread_id_idx` (`gmail_thread_id`);

CREATE TABLE `inbound_emails` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `email_account_id` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NOT NULL,
    `delivery_id` VARCHAR(191) NOT NULL,
    `lead_id` VARCHAR(191) NOT NULL,
    `gmail_message_id` VARCHAR(191) NOT NULL,
    `gmail_thread_id` VARCHAR(191) NOT NULL,
    `sender_email` VARCHAR(191) NOT NULL,
    `sender_name` VARCHAR(191) NULL,
    `recipient_email` VARCHAR(191) NOT NULL,
    `subject` TEXT NOT NULL,
    `body` TEXT NOT NULL,
    `received_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `inbound_emails_email_account_id_gmail_message_id_key` (`email_account_id`, `gmail_message_id`),
    INDEX `inbound_emails_user_id_received_at_idx` (`user_id`, `received_at`),
    INDEX `inbound_emails_campaign_id_gmail_thread_id_idx` (`campaign_id`, `gmail_thread_id`),
    CONSTRAINT `inbound_emails_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `inbound_emails_email_account_id_fkey` FOREIGN KEY (`email_account_id`) REFERENCES `EmailAccount` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `inbound_emails_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `inbound_emails_delivery_id_fkey` FOREIGN KEY (`delivery_id`) REFERENCES `email_deliveries` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;