ALTER TABLE `campaigns`
    ADD COLUMN `started_at` DATETIME(3) NULL;

UPDATE `campaigns` AS campaign
SET `started_at` = COALESCE(
    (
        SELECT MIN(delivery.`created_at`)
        FROM `email_deliveries` AS delivery
        WHERE delivery.`campaign_id` = campaign.`id`
    ),
    campaign.`updated_at`
)
WHERE campaign.`status` IN ('Live', 'Partially sent');