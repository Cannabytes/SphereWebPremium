CREATE TABLE IF NOT EXISTS plugin_exchange_lots (
  id BIGINT NOT NULL AUTO_INCREMENT,
  server_id BIGINT NOT NULL,
  seller_user_id BIGINT NOT NULL,
  original_owner_id BIGINT NOT NULL,
  object_id BIGINT NOT NULL,
  item_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  item_icon VARCHAR(255) NOT NULL DEFAULT '',
  item_category VARCHAR(32) NOT NULL DEFAULT 'other',
  item_grade VARCHAR(16) NOT NULL DEFAULT '',
  item_count BIGINT NOT NULL DEFAULT 1,
  enchant_level INT NOT NULL DEFAULT 0,
  augmentation VARCHAR(255) NOT NULL DEFAULT '',
  item_snapshot_json LONGTEXT NOT NULL,
  price DECIMAL(16,2) NOT NULL,
  currency VARCHAR(8) NOT NULL,
  normalized_usd DECIMAL(16,2) NOT NULL DEFAULT 0,
  seller_country VARCHAR(8) NOT NULL DEFAULT '',
  payment_methods_json LONGTEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'freezing',
  active_order_id BIGINT NULL,
  created_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL,
  closed_at VARCHAR(64) NULL,
  PRIMARY KEY (id),
  KEY idx_plugin_exchange_lot_object (server_id, object_id, status),
  KEY idx_plugin_exchange_lots_catalog (status, server_id, normalized_usd, id),
  KEY idx_plugin_exchange_lots_seller (seller_user_id, status, id),
  KEY idx_plugin_exchange_lots_item (item_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plugin_exchange_orders (
  id BIGINT NOT NULL AUTO_INCREMENT,
  lot_id BIGINT NOT NULL,
  buyer_user_id BIGINT NOT NULL,
  seller_user_id BIGINT NOT NULL,
  commission_coins BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'payment_pending',
  admin_requested TINYINT(1) NOT NULL DEFAULT 0,
  dispute_reason TEXT NULL,
  assigned_admin_user_id BIGINT NULL,
  closed_by_user_id BIGINT NULL,
  created_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL,
  closed_at VARCHAR(64) NULL,
  cleanup_at VARCHAR(64) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plugin_exchange_order_lot (lot_id),
  KEY idx_plugin_exchange_orders_buyer (buyer_user_id, status, updated_at),
  KEY idx_plugin_exchange_orders_seller (seller_user_id, status, updated_at),
  KEY idx_plugin_exchange_orders_admin (admin_requested, status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plugin_exchange_messages (
  id BIGINT NOT NULL AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  sender_user_id BIGINT NULL,
  sender_kind VARCHAR(24) NOT NULL,
  body LONGTEXT NOT NULL,
  attachments_json LONGTEXT NOT NULL,
  created_at VARCHAR(64) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_plugin_exchange_messages_order (order_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plugin_exchange_payment_profiles (
  user_id BIGINT NOT NULL,
  methods_json LONGTEXT NOT NULL,
  created_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plugin_exchange_access_overrides (
  user_id BIGINT NOT NULL,
  access_state VARCHAR(16) NOT NULL DEFAULT 'deny',
  reason TEXT NULL,
  expires_at VARCHAR(64) NULL,
  updated_by_user_id BIGINT NOT NULL,
  created_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL,
  PRIMARY KEY (user_id),
  KEY idx_plugin_exchange_access_state (access_state, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plugin_exchange_balance_ledger (
  id BIGINT NOT NULL AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  operation VARCHAR(32) NOT NULL,
  amount BIGINT NOT NULL,
  balance_before BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  actor_user_id BIGINT NULL,
  created_at VARCHAR(64) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plugin_exchange_ledger_key (idempotency_key),
  KEY idx_plugin_exchange_ledger_order (order_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plugin_exchange_operations (
  id BIGINT NOT NULL AUTO_INCREMENT,
  lot_id BIGINT NULL,
  order_id BIGINT NULL,
  operation_key VARCHAR(128) NOT NULL,
  operation_type VARCHAR(32) NOT NULL,
  status VARCHAR(24) NOT NULL,
  payload_json LONGTEXT NOT NULL,
  last_error LONGTEXT NULL,
  created_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plugin_exchange_operation_key (operation_key),
  KEY idx_plugin_exchange_operations_status (status, operation_type, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
