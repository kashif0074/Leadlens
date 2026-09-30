ALTER TABLE `EmailAccount`
    DROP COLUMN `appPassword`,
    ADD COLUMN `access_token` TEXT NULL,
    ADD COLUMN `refresh_token` TEXT NULL,
    ADD COLUMN `token_expires_at` DATETIME(3) NULL,
    ADD COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'reconnect_required';

ALTER TABLE `campaigns`
    ADD COLUMN `email_account_id` VARCHAR(191) NULL,
    ADD INDEX `campaigns_email_account_id_idx` (`email_account_id`),
    ADD CONSTRAINT `campaigns_email_account_id_fkey`
        FOREIGN KEY (`email_account_id`) REFERENCES `EmailAccount` (`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;