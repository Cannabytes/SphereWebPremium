CREATE TABLE IF NOT EXISTS plugin_exchange_order_reads (
  order_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  last_read_message_id BIGINT NOT NULL DEFAULT 0,
  updated_at VARCHAR(64) NOT NULL,
  PRIMARY KEY (order_id, user_id),
  KEY idx_plugin_exchange_order_reads_user (user_id, order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
