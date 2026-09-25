CREATE TABLE `campaigns` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `prompt` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Ready',
    `selectedLeadIds` JSON NOT NULL,
    `selectedLeads` JSON NOT NULL,
    `emails` JSON NOT NULL,
    `connectedEmail` VARCHAR(191) NULL,
    `provider` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `campaigns_updated_at_idx` ON `campaigns`(`updated_at`);
