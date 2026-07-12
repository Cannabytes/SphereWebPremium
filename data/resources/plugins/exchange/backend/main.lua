local ACTIVE_ORDER_STATUSES = { payment_pending = true, admin_requested = true, disputed = true }
local REQUIRED_GAME_SQL = {
  "characterById", "characterByIdForUpdate", "itemWithVariationByOwner", "itemWithVariationByOwnerForUpdate", "freezeItem",
  "restoreItem", "itemOwnerForUpdate", "deliverItem", "itemOwner",
}
local AUGMENTATION_OPTIONS_PATH = "data/augmentation_options.ru.json"

local function response(body, status)
  return { status = status or 200, body = body }
end

local function failure(status, code, message)
  return response({ code = code, message = message }, status)
end

local function request(ctx)
  return ctx.request or {}
end

local function user(ctx)
  return request(ctx).user or {}
end

local function body(ctx)
  return request(ctx).body or {}
end

local function query(ctx)
  return request(ctx).query or {}
end

local function param(ctx, key)
  return ((request(ctx).params or {})[key])
end

local function as_number(value, fallback)
  local parsed = tonumber(value)
  if parsed == nil then return fallback or 0 end
  return parsed
end

local function as_integer(value, fallback)
  return math.floor(as_number(value, fallback or 0))
end

local function trim(value)
  return string.gsub(string.gsub(tostring(value or ""), "^%s+", ""), "%s+$", "")
end

local function notify_user(user_id, notification_type, title_key, title_args, body_key, body_args, link, icon)
  user_id = as_integer(user_id)
  if user_id <= 0 then return end
  local title_args_json = type(title_args) == "table" and #title_args > 0 and json_encode(title_args) or "[]"
  local body_args_json = type(body_args) == "table" and #body_args > 0 and json_encode(body_args) or "[]"
  local ok, err = pcall(function()
    db.exec([[INSERT INTO user_notifications
      (user_id, type, title_key, title_args_json, body_key, body_args_json, link, icon, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)]],
      { user_id, notification_type, title_key, title_args_json, body_key, body_args_json, link, icon or "bell", now_utc() })
  end)
  if not ok then log_error("notification for user " .. tostring(user_id) .. " failed: " .. tostring(err)) end
end

local function notify_users(user_ids, excluded_user_id, notification_type, title_key, title_args, body_key, body_args, link, icon)
  local seen = {}
  for _, user_id in ipairs(user_ids or {}) do
    user_id = as_integer(user_id)
    if user_id > 0 and user_id ~= as_integer(excluded_user_id) and not seen[user_id] then
      seen[user_id] = true
      notify_user(user_id, notification_type, title_key, title_args, body_key, body_args, link, icon)
    end
  end
end

local function notify_admins(notification_type, title_key, title_args, body_key, body_args, order_id, server_id, icon)
  local ok, admins = pcall(function()
    return db.query([[SELECT DISTINCT u.id
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id AND (ur.expires_at IS NULL OR ur.expires_at = '' OR ur.expires_at > ?)
      LEFT JOIN roles r ON r.id = ur.role_id AND r.is_active = 1
      LEFT JOIN role_permissions rp ON rp.role_id = r.id AND COALESCE(rp.effect, 'allow') <> 'deny'
      WHERE u.role = 'admin' OR r.is_super_admin = 1 OR rp.permission_code IN ('*', 'admin.*', 'admin.panel')]], { now_utc() })
  end)
  if not ok then log_error("admin notification lookup failed: " .. tostring(admins)); return end
  local link = "/admin/plugins/exchange/orders/" .. tostring(order_id) .. "?server=" .. tostring(as_integer(server_id))
  for _, admin in ipairs(admins) do
    notify_user(admin.id, notification_type, title_key, title_args, body_key, body_args, link, icon)
  end
end

local function game_sql(settings, server_id, key)
  local catalogs = settings and settings.gameSqlByServer
  local catalog = as_integer(server_id) > 0 and type(catalogs) == "table" and (catalogs[tostring(server_id)] or catalogs[server_id]) or nil
  if type(catalog) ~= "table" then catalog = settings and settings.gameSql end
  local statement = type(catalog) == "table" and trim(catalog[key]) or ""
  if statement == "" then error("exchange gameSql." .. tostring(key) .. " is not configured for server #" .. tostring(server_id)) end
  return statement
end

local function catalog_sql(server_id, code, expected_target)
  local template = game_db.query_template(server_id, code)
  local statement = trim(template and template.query)
  local target = string.lower(trim(template and template.target))
  if statement == "" then error("server query catalog " .. tostring(code) .. " is not configured") end
  if expected_target ~= nil and target ~= expected_target then
    error("server query catalog " .. tostring(code) .. " must target " .. tostring(expected_target))
  end
  return statement
end

local function bool(value)
  return value == true or value == 1 or value == "1" or value == "true"
end

local function first(rows)
  if type(rows) ~= "table" then return nil end
  return rows[1]
end

local function require_user(ctx)
  local current = user(ctx)
  if as_integer(current.id) <= 0 then return nil, failure(401, "unauthorized", "Authentication required") end
  return current, nil
end

local function is_market_active(settings)
  if not bool(settings.enabled) then return false, "Биржа выключена администратором." end
  local activation = trim(settings.activationAt)
  if activation ~= "" and activation > now_utc() then
    return false, "Биржа будет доступна " .. activation
  end
  return true, ""
end

local function access_denied(user_id)
  local row = first(db.query([[SELECT access_state, COALESCE(reason, '') AS reason, COALESCE(expires_at, '') AS expires_at
    FROM plugin_exchange_access_overrides WHERE user_id = ?]], { user_id }))
  if row == nil then return false, "" end
  if trim(row.expires_at) ~= "" and row.expires_at < now_utc() then
    db.exec("DELETE FROM plugin_exchange_access_overrides WHERE user_id = ?", { user_id })
    return false, ""
  end
  return row.access_state == "deny", trim(row.reason)
end

local function rules_accepted(ctx, settings, user_id)
  local row = first(db.query([[SELECT consent_version FROM plugin_user_consents
    WHERE plugin_id = 'exchange' AND user_id = ? AND consent_key = 'rules']], { user_id }))
  return row ~= nil and tostring(row.consent_version) == tostring(settings.rulesVersion or "1")
end

local function configured_server_ids(settings)
  local result = {}
  if type(settings.serverIds) ~= "table" then return result end
  for _, value in ipairs(settings.serverIds) do
    local server_id = as_integer(value)
    if server_id > 0 then result[#result + 1] = server_id end
  end
  return result
end

local function resolve_exchange_server(settings, current)
  local configured = configured_server_ids(settings)
  local default_server_id = as_integer(current.defaultServerId)
  if default_server_id > 0 then return default_server_id, nil end
  if #configured == 0 then
    if default_server_id > 0 then return default_server_id, nil end
    return 0, "Выберите игровой сервер в личном кабинете."
  end
  for _, server_id in ipairs(configured) do
    if server_id == default_server_id then return server_id, nil end
  end
  if #configured == 1 then return configured[1], nil end
  return 0, "Ваш сервер по умолчанию не подключён к бирже. Выберите один из настроенных серверов в личном кабинете."
end

local function exchange_server_error(server_id)
  if as_integer(server_id) <= 0 then return "Сервер биржи не выбран." end
  local ok, build = pcall(function() return string.lower(trim(game_db.build(server_id))) end)
  if not ok then return "Не удалось подключиться к серверу биржи: " .. tostring(build) end
  if build ~= "l2jlucera" and build ~= "lucera3" then return "Биржа доступна только для L2jLucera." end
  return nil
end

local function ensure_access(ctx)
  local current, err = require_user(ctx)
  if err ~= nil then return nil, err end
  local active, reason = is_market_active(ctx.settings)
  if not active then return nil, failure(403, "exchange_unavailable", reason) end
  local denied, deny_reason = access_denied(as_integer(current.id))
  if denied then return nil, failure(403, "exchange_blocked", deny_reason ~= "" and deny_reason or "Доступ к бирже заблокирован.") end
  local server_id, server_error = resolve_exchange_server(ctx.settings, current)
  if server_error == nil then server_error = exchange_server_error(server_id) end
  if server_error ~= nil then return nil, failure(403, "exchange_server_unavailable", server_error) end
  current.exchangeServerId = server_id
  return current, nil
end

local function currency_rate(settings, currency)
  local rates = settings.currencyRatesUSD or {}
  return as_number(rates[string.upper(currency)], 0)
end

local function commission(settings, normalized_usd)
  local minimum = math.max(0, as_integer(settings.commissionMinimum, 1))
  if tostring(settings.commissionMode or "fixed") == "percent" then
    return math.max(minimum, math.ceil(normalized_usd * as_number(settings.commissionPercent, 0) / 100))
  end
  return math.max(minimum, as_integer(settings.commissionFixed, minimum))
end

local function ensure_l2jlucera(server_id)
  local build = string.lower(trim(game_db.build(server_id)))
  if build ~= "l2jlucera" and build ~= "lucera3" then
    error("Биржа поддерживает только сборку L2jLucera (не Lucera 1.7). Текущая сборка: " .. build)
  end
end

local function catalog_item(server_id, item_id, locale)
  local ok, definitions = pcall(function()
    return item_catalog.lookup(server_id, { item_id }, trim(locale) ~= "" and trim(locale) or "ru")
  end)
  if not ok then
    log_error("item catalog lookup failed for " .. tostring(item_id) .. ": " .. tostring(definitions))
    return {}
  end
  return definitions[tostring(item_id)] or {}
end

local function augmentation_option(option_id)
  if as_integer(option_id) <= 0 then return nil end
  local option = plugin_data.json_get(AUGMENTATION_OPTIONS_PATH, tostring(as_integer(option_id)))
  if type(option) ~= "table" then return nil end
  return option
end

local function snapshot_augmentation(item, item_category)
  local category = string.lower(trim(item_category))
  if category ~= "weapon" and category ~= "jewelry" then return "" end
  local values, seen = {}, {}
  for _, key in ipairs({ "augmentation_stat1", "augmentation_stat2" }) do
    local option = augmentation_option(item[key])
    if option ~= nil then
      for _, description in ipairs(option) do
        description = trim(description)
        if description ~= "" and not seen[description] then
          seen[description] = true
          values[#values + 1] = description
        end
      end
    end
  end
  return table.concat(values, "\n")
end

local function character_owned(user_id, email, server_id, character_id, for_update, settings)
  local owned = false
  for _, character in ipairs(game_db.characters(server_id, as_integer(user_id), email)) do
    if as_integer(character.id) == as_integer(character_id) then owned = true break end
  end
  if not owned then return nil end
  local query_key = for_update and "characterByIdForUpdate" or "characterById"
  local row = first(game_db.query(server_id, "game", game_sql(settings, server_id, query_key), { character_id }))
  return row
end

local function public_lot(row)
  return {
    id = row.id,
    server_id = row.server_id,
    item_id = row.item_id,
    item_name = row.item_name,
    item_icon = row.item_icon,
    item_category = row.item_category,
    item_grade = row.item_grade,
    item_count = row.item_count,
    enchant_level = row.enchant_level,
    augmentation = row.augmentation,
    price = row.price,
    currency = row.currency,
    normalized_usd = row.normalized_usd,
    seller_country = row.seller_country,
    seller_rating = row.seller_rating,
    status = row.status,
    created_at = row.created_at,
  }
end

local function role_for(order, viewer_id, admin)
  if admin then return "admin" end
  if as_integer(order.buyer_user_id) == viewer_id then return "buyer" end
  if as_integer(order.seller_user_id) == viewer_id then return "seller" end
  return ""
end

local ORDER_SELECT = [[SELECT o.*, l.server_id, l.item_id, l.item_name, l.item_icon, l.item_category, l.item_grade, l.item_count,
      l.enchant_level, l.augmentation, l.price, l.currency, l.seller_country, l.item_snapshot_json,
      l.original_owner_id, l.object_id, l.payment_methods_json,
      buyer.login AS buyer_login, buyer.email AS buyer_email, seller.login AS seller_login, seller.email AS seller_email
    FROM plugin_exchange_orders o
    JOIN plugin_exchange_lots l ON l.id = o.lot_id
    JOIN users buyer ON buyer.id = o.buyer_user_id
    JOIN users seller ON seller.id = o.seller_user_id
    WHERE o.id = ?]]

local function load_order(order_id)
  return first(db.query(ORDER_SELECT, { order_id }))
end

local function load_order_locked(tx, order_id)
  return first(tx.query(ORDER_SELECT .. " FOR UPDATE", { order_id }))
end

local function present_message(message, order, admin)
  if message.sender_kind == "system" then message.sender_label = "Система"
  elseif message.sender_kind == "admin" then message.sender_label = "Администратор"
  elseif as_integer(message.sender_user_id) == as_integer(order.seller_user_id) then
    message.sender_label = admin and order.seller_login or "Продавец"
  elseif as_integer(message.sender_user_id) == as_integer(order.buyer_user_id) then
    message.sender_label = admin and order.buyer_login or "Покупатель"
  else message.sender_label = "Участник" end
  message.attachments = json_decode(message.attachments_json or "[]")
  message.attachments_json = nil
  if not admin then message.sender_user_id = nil end
  return message
end

local function present_order(order, viewer_id, admin)
  order.role = role_for(order, viewer_id, admin)
  order.item_snapshot = admin and json_decode(order.item_snapshot_json or "{}") or nil
  order.payment_methods = json_decode(order.payment_methods_json or "[]")
  order.item_snapshot_json = nil
  order.payment_methods_json = nil
  if not admin then
    order.buyer_login = nil
    order.buyer_email = nil
    order.seller_login = nil
    order.seller_email = nil
    order.buyer_user_id = nil
    order.seller_user_id = nil
    order.original_owner_id = nil
    order.object_id = nil
    order.assigned_admin_user_id = nil
    order.closed_by_user_id = nil
  end
  return order
end

local function payment_method_text(raw)
  local methods = json_decode(raw or "[]")
  local lines = { "Переведите деньги по одному из удобных реквизитов продавца и предоставьте квитанцию в PDF формате." }
  for _, method in ipairs(methods) do
    local line = "• " .. trim(method.name)
    if trim(method.details) ~= "" then line = line .. ": " .. trim(method.details)
    else line = line .. ": продавец сообщит реквизиты в диалоге" end
    lines[#lines + 1] = line
  end
  lines[#lines + 1] = "Возможно, вам стоит уточнить дополнительные детали в диалоге."
  return table.concat(lines, "\n")
end

function validate_settings(ctx)
  local settings = request(ctx).settings or {}
  for _, key in ipairs(REQUIRED_GAME_SQL) do game_sql(settings, 0, key) end
  local rates = settings.currencyRatesUSD or {}
  for _, currency in ipairs({ "USD", "UAH", "RUB" }) do
    if as_number(rates[currency], 0) <= 0 then error("Курс " .. currency .. " должен быть больше нуля") end
  end
  if as_number(settings.commissionFixed, 0) < 0 or as_number(settings.commissionPercent, 0) < 0 or as_number(settings.commissionMinimum, 0) < 0 then
    error("Комиссия не может быть отрицательной")
  end
  if as_integer(settings.orderTimeoutHours, 0) < 1 then error("Таймаут заказа должен быть не меньше одного часа") end
  if as_integer(settings.closedRetentionDays, 0) < 1 then error("Срок хранения должен быть не меньше одного дня") end
  if type(settings.gameSqlByServer) ~= "table" then error("SQL-настройки серверов биржи должны быть объектом") end
  for raw_server_id, _ in pairs(settings.gameSqlByServer) do
    local server_id = as_integer(raw_server_id)
    if server_id <= 0 then error("Invalid exchange SQL server") end
    local build = string.lower(trim(game_db.build(server_id)))
    if build ~= "l2jlucera" and build ~= "lucera3" then error("Exchange SQL server must use L2jLucera") end
    for _, key in ipairs(REQUIRED_GAME_SQL) do game_sql(settings, server_id, key) end
  end
  return { ok = true }
end

function get_summary(ctx)
  local current, err = require_user(ctx)
  if err ~= nil then return err end
  local row = first(db.query([[SELECT COUNT(*) AS open_orders FROM plugin_exchange_orders
    WHERE (buyer_user_id = ? OR seller_user_id = ?) AND status IN ('payment_pending','admin_requested','disputed')]], { current.id, current.id }))
  local unread = first(db.query([[SELECT COUNT(*) AS total
    FROM plugin_exchange_messages m
    JOIN plugin_exchange_orders o ON o.id = m.order_id
    LEFT JOIN plugin_exchange_order_reads r ON r.order_id = o.id AND r.user_id = ?
    WHERE (o.buyer_user_id = ? OR o.seller_user_id = ?)
      AND m.id > COALESCE(r.last_read_message_id, 0)
      AND (m.sender_user_id IS NULL OR m.sender_user_id <> ?)]], { current.id, current.id, current.id, current.id }))
  local my_lots = first(db.query("SELECT COUNT(*) AS total FROM plugin_exchange_lots WHERE seller_user_id = ? AND status IN ('freezing','active','ordered')", { current.id }))
  return response({ openOrders = as_integer(row and row.open_orders), myLots = as_integer(my_lots and my_lots.total), unreadMessages = as_integer(unread and unread.total) })
end

function get_state(ctx)
  local current, err = require_user(ctx)
  if err ~= nil then return err end
  local active, message = is_market_active(ctx.settings)
  local denied, deny_reason = access_denied(as_integer(current.id))
  local server_id, server_error = resolve_exchange_server(ctx.settings, current)
  if server_error == nil then server_error = exchange_server_error(server_id) end
  local locale = trim(request(ctx).locale)
  local rules = ctx.settings.rulesByLocale or {}
  local rules_html = rules[locale] or rules.ru or rules.en or ""
  local wallet = first(db.query("SELECT balance FROM users WHERE id = ?", { current.id }))
  return response({
    enabled = active and not denied and server_error == nil,
    message = denied and (deny_reason ~= "" and deny_reason or "Доступ заблокирован") or (server_error or message),
    serverId = server_id,
    activationAt = ctx.settings.activationAt,
    rulesAccepted = rules_accepted(ctx, ctx.settings, current.id),
    rulesVersion = tostring(ctx.settings.rulesVersion or "1"),
    rulesHtml = rules_html,
    balance = as_integer(wallet and wallet.balance),
    commission = { mode = ctx.settings.commissionMode, fixed = ctx.settings.commissionFixed, percent = ctx.settings.commissionPercent, minimum = ctx.settings.commissionMinimum },
    rates = ctx.settings.currencyRatesUSD,
  })
end

function accept_rules(ctx)
  local current, err = require_user(ctx)
  if err ~= nil then return err end
  local now = now_utc()
  db.exec([[INSERT INTO plugin_user_consents (plugin_id, user_id, consent_key, consent_version, ip_address, user_agent, accepted_at)
    VALUES ('exchange', ?, 'rules', ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE consent_version = VALUES(consent_version), ip_address = VALUES(ip_address), user_agent = VALUES(user_agent), accepted_at = VALUES(accepted_at)]],
    { current.id, tostring(ctx.settings.rulesVersion or "1"), request(ctx).ip or "", request(ctx).user_agent or "", now })
  return response({ accepted = true, version = tostring(ctx.settings.rulesVersion or "1") })
end

function list_lots(ctx)
  local current, err = ensure_access(ctx)
  if err ~= nil then return err end
  if not rules_accepted(ctx, ctx.settings, current.id) then return failure(428, "rules_required", "Accept the exchange rules") end
  local q = query(ctx)
  local sql = [[SELECT l.*, (SELECT COUNT(*) FROM plugin_exchange_lots completed
      WHERE completed.seller_user_id = l.seller_user_id AND completed.status = 'completed') AS seller_rating
    FROM plugin_exchange_lots l WHERE l.status = 'active' AND l.server_id = ?]]
  local args = { as_integer(current.exchangeServerId) }
  local search = trim(q.search)
  if search ~= "" then sql = sql .. " AND LOWER(l.item_name) LIKE LOWER(?)"; args[#args + 1] = "%" .. search .. "%" end
  local category = trim(q.category)
  if category ~= "" and category ~= "all" then sql = sql .. " AND l.item_category = ?"; args[#args + 1] = category end
  local grade = trim(q.grade)
  if grade ~= "" and grade ~= "all" then sql = sql .. " AND l.item_grade = ?"; args[#args + 1] = grade end
  if bool(q.enchanted) then sql = sql .. " AND l.enchant_level > 0" end
  local min_price, max_price = as_number(q.minPrice, 0), as_number(q.maxPrice, 0)
  if min_price > 0 then sql = sql .. " AND l.normalized_usd >= ?"; args[#args + 1] = min_price end
  if max_price > 0 then sql = sql .. " AND l.normalized_usd <= ?"; args[#args + 1] = max_price end
  local min_rating = as_integer(q.minRating, 0)
  if min_rating > 0 then sql = sql .. " HAVING seller_rating >= ?"; args[#args + 1] = min_rating end
  sql = sql .. " ORDER BY l.id DESC LIMIT 100"
  local rows = db.query(sql, args)
  for index, row in ipairs(rows) do rows[index] = public_lot(row) end
  return response({ items = rows })
end

function list_my_lots(ctx)
  local current, err = ensure_access(ctx)
  if err ~= nil then return err end
  local rows = db.query([[SELECT *, (SELECT COUNT(*) FROM plugin_exchange_lots completed
    WHERE completed.seller_user_id = ? AND completed.status = 'completed') AS seller_rating
    FROM plugin_exchange_lots WHERE seller_user_id = ? ORDER BY COALESCE(closed_at, updated_at, created_at) DESC, id DESC LIMIT 200]], { current.id, current.id })
  for index, row in ipairs(rows) do rows[index] = public_lot(row) end
  return response({ items = rows })
end

function list_characters(ctx)
  local current, err = ensure_access(ctx)
  if err ~= nil then return err end
  local server_id = as_integer(current.exchangeServerId)
  ensure_l2jlucera(server_id)
  local characters = game_db.characters(server_id, as_integer(current.id), current.email or "")
  return response({ items = characters, serverId = server_id })
end

function list_character_items(ctx)
  local current, err = ensure_access(ctx)
  if err ~= nil then return err end
  local character_id = as_integer(param(ctx, "id"))
  local server_id = as_integer(current.exchangeServerId)
  ensure_l2jlucera(server_id)
  local character = character_owned(current.id, current.email or "", server_id, character_id, false, ctx.settings)
  if character == nil then return failure(404, "character_not_found", "Character not found") end
  if as_integer(character.online) ~= 0 then return failure(409, "character_online", "Персонаж должен находиться в оффлайне.") end
  local catalog_rows = game_db.query(server_id, "game", catalog_sql(server_id, "character_items", "game"), { character_id })
  local rows, used_augmentation_options = {}, {}
  for _, item in ipairs(catalog_rows) do
    local location = string.upper(trim(item.location))
    if location == "INVENTORY" or location == "PAPERDOLL" then
      local object_id, item_type = item.object_id, item.item_id
      item.item_id = object_id
      item.item_type = item_type
      item.amount = item.count
      item.enchant = item.enchant_level
      rows[#rows + 1] = item
      for _, key in ipairs({ "augmentation_stat1", "augmentation_stat2" }) do
        local option_id = as_integer(item[key])
        local option = augmentation_option(option_id)
        if option ~= nil then used_augmentation_options[tostring(option_id)] = option end
      end
    end
  end
  return response({ character = character, items = rows, augmentationOptions = used_augmentation_options })
end

function get_payment_profile(ctx)
  local current, err = require_user(ctx)
  if err ~= nil then return err end
  local row = first(db.query("SELECT methods_json FROM plugin_exchange_payment_profiles WHERE user_id = ?", { current.id }))
  return response({ methods = row and json_decode(row.methods_json or "[]") or {} })
end

local function normalize_payment_methods(methods)
  if type(methods) ~= "table" or #methods == 0 then return nil, "Добавьте хотя бы один способ оплаты." end
  if #methods > 20 then return nil, "Разрешено не более 20 способов оплаты." end
  local normalized = {}
  for _, method in ipairs(methods) do
    local name = trim(method.name)
    if name == "" or #name > 120 then return nil, "Укажите название платежной системы." end
    normalized[#normalized + 1] = { name = name, details = string.sub(trim(method.details), 1, 1000) }
  end
  return normalized, nil
end

function save_payment_profile(ctx)
  local current, err = ensure_access(ctx)
  if err ~= nil then return err end
  local normalized, normalize_error = normalize_payment_methods(body(ctx).methods or {})
  if normalize_error ~= nil then return failure(400, "invalid_payment_method", normalize_error) end
  local now = now_utc()
  db.exec([[INSERT INTO plugin_exchange_payment_profiles (user_id, methods_json, created_at, updated_at)
    VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE methods_json = VALUES(methods_json), updated_at = VALUES(updated_at)]],
    { current.id, json_encode(normalized), now, now })
  return response({ methods = normalized })
end

function create_lot(ctx)
  local current, err = ensure_access(ctx)
  if err ~= nil then return err end
  if not rules_accepted(ctx, ctx.settings, current.id) then return failure(428, "rules_required", "Accept the exchange rules") end
  local input = body(ctx)
  local server_id = as_integer(current.exchangeServerId)
  ensure_l2jlucera(server_id)
  local character_id, object_id = as_integer(input.characterId), as_integer(input.objectId)
  local selected_count = as_integer(input.count, 1)
  local price = as_number(input.price, 0)
  local currency = string.upper(trim(input.currency))
  local rate = currency_rate(ctx.settings, currency)
  if character_id <= 0 or object_id == 0 or selected_count <= 0 or price <= 0 or rate <= 0 then
    return failure(400, "invalid_lot", "Проверьте предмет, количество, стоимость и валюту.")
  end
  local owned_character = character_owned(current.id, current.email or "", server_id, character_id, false, ctx.settings)
  if owned_character == nil then return failure(404, "character_not_found", "Character not found") end
  if as_integer(owned_character.online) ~= 0 then return failure(409, "character_online", "Персонаж должен находиться в оффлайне.") end
  local add_item_sql = catalog_sql(server_id, "add_item", "game")
  local methods, methods_error = normalize_payment_methods(input.paymentMethods or {})
  if methods_error ~= nil then return failure(400, "invalid_payment_method", methods_error) end
  local now = now_utc()
  local country_row = first(db.query("SELECT COALESCE(country_code, '') AS country_code FROM users WHERE id = ?", { current.id }))
  local country = trim(country_row and country_row.country_code)
  local insert = db.exec([[INSERT INTO plugin_exchange_lots
    (server_id, seller_user_id, original_owner_id, object_id, item_id, item_name, item_icon, item_category, item_grade,
     item_count, enchant_level, augmentation, item_snapshot_json, price, currency, normalized_usd, seller_country,
     payment_methods_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, 'freezing', ?, ?)]],
    { server_id, current.id, character_id, object_id, as_integer(input.itemId), string.sub(trim(input.itemName), 1, 255), string.sub(trim(input.itemIcon), 1, 255),
      string.lower(string.sub(trim(input.itemCategory), 1, 32)), string.upper(string.sub(trim(input.itemGrade), 1, 16)), selected_count, as_integer(input.enchantLevel), string.sub(trim(input.augmentation), 1, 255),
      price, currency, price * rate, country, json_encode(methods), now, now })
  local lot_id = as_integer(insert.last_insert_id)
  local operation_key = "freeze:" .. tostring(lot_id)
  db.exec([[INSERT INTO plugin_exchange_operations (lot_id, operation_key, operation_type, status, payload_json, created_at, updated_at)
    VALUES (?, ?, 'freeze', 'started', '{}', ?, ?)]], { lot_id, operation_key, now, now })

  local frozen, freeze_error = pcall(function()
    return game_db.transaction(server_id, "game", function(tx)
      local character = first(tx.query(game_sql(ctx.settings, server_id, "characterByIdForUpdate"), { character_id }))
      if character == nil or tostring(character.account_name or "") ~= tostring(owned_character.account_name or "") then error("character_not_found") end
      if as_integer(character.online) ~= 0 then error("character_online") end
      local item = first(tx.query(game_sql(ctx.settings, server_id, "itemWithVariationByOwnerForUpdate"), { object_id, character_id }))
      if item == nil then error("item_not_found") end
      local available = as_integer(item.amount, 1)
      if selected_count > available then error("item_count_changed") end
      if selected_count < available then
        tx.exec(add_item_sql,
          { character_id, as_integer(item.item_type), available - selected_count, as_integer(item.enchant) })
      end
      tx.exec(game_sql(ctx.settings, server_id, "freezeItem"), { lot_id, selected_count, object_id, character_id })
      return item
    end)
  end)
  if not frozen then
    db.exec("UPDATE plugin_exchange_lots SET status = 'freeze_failed', updated_at = ? WHERE id = ?", { now_utc(), lot_id })
    db.exec("UPDATE plugin_exchange_operations SET status = 'failed', last_error = ?, updated_at = ? WHERE operation_key = ?", { tostring(freeze_error), now_utc(), operation_key })
    return failure(409, "freeze_failed", tostring(freeze_error))
  end
  local snapshot = freeze_error or {}
  local actual_item_id = as_integer(snapshot.item_type, input.itemId)
  local definition = catalog_item(server_id, actual_item_id, request(ctx).locale)
  db.transaction(function(tx)
    tx.exec([[UPDATE plugin_exchange_lots SET item_id = ?, item_name = ?, item_icon = ?, item_category = ?, item_grade = ?, item_count = ?, enchant_level = ?, augmentation = ?, item_snapshot_json = ?, status = 'active', updated_at = ? WHERE id = ? AND status = 'freezing']],
      { actual_item_id, trim(definition.name) ~= "" and definition.name or ("Item #" .. tostring(actual_item_id)), definition.icon or "", definition.equipmentCategory or "other", definition.grade or "NG",
        selected_count, as_integer(snapshot.enchant), snapshot_augmentation(snapshot, definition.equipmentCategory), json_encode(snapshot), now_utc(), lot_id })
    tx.exec("UPDATE plugin_exchange_operations SET status = 'completed', payload_json = ?, updated_at = ? WHERE operation_key = ?", { json_encode(snapshot), now_utc(), operation_key })
    return true
  end)
  local profile_saved, profile_error = pcall(function()
    save_payment_profile({ settings = ctx.settings, request = { user = current, body = { methods = methods } } })
  end)
  if not profile_saved then log_error("payment profile save failed for lot " .. tostring(lot_id) .. ": " .. tostring(profile_error)) end
  events.publish_admin("exchange.lot.created", { lotId = lot_id })
  return response({ id = lot_id, status = "active" }, 201)
end

local function restore_lot_item(lot, settings)
  game_db.transaction(as_integer(lot.server_id), "game", function(tx)
    local result = tx.exec(game_sql(settings, lot.server_id, "restoreItem"), { lot.original_owner_id, lot.object_id, lot.id })
    if as_integer(result.rows_affected) ~= 1 then
      local current = first(tx.query(game_sql(settings, lot.server_id, "itemOwnerForUpdate"), { lot.object_id }))
      if current == nil or as_integer(current.owner_id) ~= as_integer(lot.original_owner_id) then error("escrow_item_not_found") end
    end
    return true
  end)
end

function cancel_lot(ctx)
  local current, err = ensure_access(ctx)
  if err ~= nil then return err end
  local lot_id = as_integer(param(ctx, "id"))
  local lot = first(db.query("SELECT * FROM plugin_exchange_lots WHERE id = ?", { lot_id }))
  if lot == nil or as_integer(lot.seller_user_id) ~= as_integer(current.id) then return failure(404, "lot_not_found", "Лот не найден.") end
  if lot.status ~= "active" then return failure(409, "lot_not_cancellable", "Лот уже заказан или закрыт.") end
  local transition = db.exec("UPDATE plugin_exchange_lots SET status = 'cancelling', updated_at = ? WHERE id = ? AND status = 'active'", { now_utc(), lot_id })
  if as_integer(transition.rows_affected) ~= 1 then return failure(409, "lot_not_cancellable", "Лот уже изменён другим запросом.") end
  local operation_key = "cancel_lot:" .. tostring(lot_id)
  db.exec([[INSERT INTO plugin_exchange_operations (lot_id, operation_key, operation_type, status, payload_json, created_at, updated_at)
    VALUES (?, ?, 'cancel_lot', 'started', '{}', ?, ?) ON DUPLICATE KEY UPDATE status = 'started', last_error = NULL, updated_at = VALUES(updated_at)]], { lot_id, operation_key, now_utc(), now_utc() })
  local ok, restore_error = pcall(function() restore_lot_item(lot, ctx.settings) end)
  if not ok then
    db.exec("UPDATE plugin_exchange_lots SET status = 'active', updated_at = ? WHERE id = ? AND status = 'cancelling'", { now_utc(), lot_id })
    db.exec("UPDATE plugin_exchange_operations SET status = 'failed', last_error = ?, updated_at = ? WHERE operation_key = ?", { tostring(restore_error), now_utc(), operation_key })
    return failure(409, "restore_failed", tostring(restore_error))
  end
  db.exec("UPDATE plugin_exchange_lots SET status = 'cancelled', closed_at = ?, updated_at = ? WHERE id = ? AND status = 'cancelling'", { now_utc(), now_utc(), lot_id })
  db.exec("UPDATE plugin_exchange_operations SET status = 'completed', updated_at = ? WHERE operation_key = ?", { now_utc(), operation_key })
  events.publish_admin("exchange.lot.cancelled", { lotId = lot_id })
  return response({ cancelled = true })
end

function create_order(ctx)
  local current, err = ensure_access(ctx)
  if err ~= nil then return err end
  if not rules_accepted(ctx, ctx.settings, current.id) then return failure(428, "rules_required", "Accept the exchange rules") end
  local lot_id = as_integer(param(ctx, "id"))
  local ordered, order_result = pcall(function()
    return db.transaction(function(tx)
      local lot = first(tx.query("SELECT * FROM plugin_exchange_lots WHERE id = ? FOR UPDATE", { lot_id }))
      if lot == nil or lot.status ~= "active" then error("lot_unavailable") end
      if as_integer(lot.seller_user_id) == as_integer(current.id) then error("own_lot") end
      local fee = commission(ctx.settings, as_number(lot.normalized_usd))
      local wallet = first(tx.query("SELECT balance FROM users WHERE id = ? FOR UPDATE", { current.id }))
      if wallet == nil or as_integer(wallet.balance) < fee then error("insufficient_balance") end
      local before = as_integer(wallet.balance)
      tx.exec("UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?", { fee, current.id, fee })
      local now = now_utc()
      local order_insert = tx.exec([[INSERT INTO plugin_exchange_orders
        (lot_id, buyer_user_id, seller_user_id, commission_coins, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'payment_pending', ?, ?)]], { lot_id, current.id, lot.seller_user_id, fee, now, now })
      local order_id = as_integer(order_insert.last_insert_id)
      tx.exec("UPDATE plugin_exchange_lots SET status = 'ordered', active_order_id = ?, updated_at = ? WHERE id = ?", { order_id, now, lot_id })
      tx.exec([[INSERT INTO plugin_exchange_balance_ledger
        (order_id, user_id, operation, amount, balance_before, balance_after, idempotency_key, actor_user_id, created_at)
        VALUES (?, ?, 'commission_debit', ?, ?, ?, ?, ?, ?)]],
        { order_id, current.id, fee, before, before - fee, "order:" .. tostring(order_id) .. ":commission", current.id, now })
      local payment_text = payment_method_text(lot.payment_methods_json)
      tx.exec("INSERT INTO plugin_exchange_messages (order_id, sender_user_id, sender_kind, body, attachments_json, created_at) VALUES (?, NULL, 'system', ?, '[]', ?)", { order_id, payment_text, now })
      tx.exec("INSERT INTO plugin_exchange_messages (order_id, sender_user_id, sender_kind, body, attachments_json, created_at) VALUES (?, NULL, 'system', ?, '[]', ?)", { order_id, "Продавцу: попросите покупателя предоставить квитанцию и подтвердите получение полной суммы кнопкой «Я получил деньги».", now })
      return { order_id = order_id, fee = fee, seller_id = lot.seller_user_id, item_name = lot.item_name, balance = before - fee }
    end)
  end)
  if not ordered then
    local internal_error = tostring(order_result)
    if string.find(internal_error, "insufficient_balance", 1, true) ~= nil then
      return failure(409, "insufficient_balance", "Insufficient Donate Coin balance")
    end
    if string.find(internal_error, "lot_unavailable", 1, true) ~= nil then
      return failure(409, "lot_unavailable", "The lot is no longer available")
    end
    if string.find(internal_error, "own_lot", 1, true) ~= nil then
      return failure(409, "own_lot", "You cannot order your own lot")
    end
    log_error("create order failed: " .. internal_error)
    return failure(500, "order_failed", "Could not create the order")
  end
  events.publish({ current.id, order_result.seller_id }, "exchange.order.created", { orderId = order_result.order_id })
  events.publish_admin("exchange.order.created", { orderId = order_result.order_id })
  local order_link = "/plugins/exchange/orders/" .. tostring(order_result.order_id)
  notify_user(current.id, "exchange.order_created", "notification.exchange.order_created.title", { tostring(order_result.order_id) }, "notification.exchange.order_created.buyer_body", { order_result.item_name }, order_link, "gift")
  notify_user(order_result.seller_id, "exchange.order_created", "notification.exchange.order_created.title", { tostring(order_result.order_id) }, "notification.exchange.order_created.seller_body", { order_result.item_name }, order_link, "gift")
  return response({ orderId = order_result.order_id, commission = order_result.fee, balance = order_result.balance }, 201)
end

function list_orders(ctx)
  local current, err = ensure_access(ctx)
  if err ~= nil then return err end
  local rows = db.query([[SELECT o.*, l.item_name, l.item_icon, l.item_category, l.item_grade, l.enchant_level, l.augmentation, l.price, l.currency, l.item_count,
      buyer.login AS buyer_login, seller.login AS seller_login, l.item_snapshot_json, l.payment_methods_json,
      (SELECT COUNT(*) FROM plugin_exchange_messages unread_message
        LEFT JOIN plugin_exchange_order_reads order_read ON order_read.order_id = o.id AND order_read.user_id = ?
        WHERE unread_message.order_id = o.id
          AND unread_message.id > COALESCE(order_read.last_read_message_id, 0)
          AND (unread_message.sender_user_id IS NULL OR unread_message.sender_user_id <> ?)) AS unread_count
    FROM plugin_exchange_orders o JOIN plugin_exchange_lots l ON l.id = o.lot_id
    JOIN users buyer ON buyer.id = o.buyer_user_id JOIN users seller ON seller.id = o.seller_user_id
    WHERE o.buyer_user_id = ? OR o.seller_user_id = ?
    ORDER BY CASE WHEN o.status IN ('payment_pending','admin_requested','disputed') THEN 0 ELSE 1 END, o.updated_at DESC LIMIT 200]], { current.id, current.id, current.id, current.id })
  for index, order in ipairs(rows) do rows[index] = present_order(order, as_integer(current.id), false) end
  return response({ items = rows })
end

local function order_page(order_id, viewer_id, admin)
  local order = load_order(order_id)
  if order == nil then return nil, failure(404, "order_not_found", "Заказ не найден.") end
  local role = role_for(order, viewer_id, admin)
  if role == "" then return nil, failure(403, "forbidden", "Нет доступа к заказу.") end
  local read_state = first(db.query("SELECT last_read_message_id FROM plugin_exchange_order_reads WHERE order_id = ? AND user_id = ?", { order_id, viewer_id }))
  local last_read_message_id = as_integer(read_state and read_state.last_read_message_id)
  local first_unread_message_id = 0
  local messages = db.query("SELECT * FROM plugin_exchange_messages WHERE order_id = ? ORDER BY id ASC LIMIT 1000", { order_id })
  for _, message in ipairs(messages) do
    if first_unread_message_id == 0 and as_integer(message.id) > last_read_message_id
      and (message.sender_user_id == nil or as_integer(message.sender_user_id) ~= as_integer(viewer_id)) then
      first_unread_message_id = as_integer(message.id)
    end
  end
  if #messages > 0 then
    db.exec([[INSERT INTO plugin_exchange_order_reads (order_id, user_id, last_read_message_id, updated_at)
      VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE
      last_read_message_id = GREATEST(last_read_message_id, VALUES(last_read_message_id)), updated_at = VALUES(updated_at)]],
      { order_id, viewer_id, as_integer(messages[#messages].id), now_utc() })
    order.unread_count = 0
  end
  for index, message in ipairs(messages) do messages[index] = present_message(message, order, admin) end
  return { order = present_order(order, viewer_id, admin), messages = messages, firstUnreadMessageId = first_unread_message_id }, nil
end

function get_order(ctx)
  local current, err = ensure_access(ctx)
  if err ~= nil then return err end
  local page, page_error = order_page(as_integer(param(ctx, "id")), as_integer(current.id), false)
  if page_error ~= nil then return page_error end
  return response(page)
end

function send_message(ctx)
  local current, err = ensure_access(ctx)
  if err ~= nil then return err end
  local order_id = as_integer(param(ctx, "id"))
  local message = string.sub(trim(body(ctx).body), 1, 3000)
  local attachments = body(ctx).attachments or {}
  if message == "" and #attachments == 0 then return failure(400, "message_required", "Введите сообщение.") end
  local sent, result = pcall(function()
    return db.transaction(function(tx)
      local order = load_order_locked(tx, order_id)
      if order == nil or role_for(order, as_integer(current.id), false) == "" then error("order_not_found") end
      if not ACTIVE_ORDER_STATUSES[order.status] then error("order_closed") end
      local now = now_utc()
      tx.exec("INSERT INTO plugin_exchange_messages (order_id, sender_user_id, sender_kind, body, attachments_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        { order_id, current.id, "user", message, json_encode(attachments), now })
      tx.exec("UPDATE plugin_exchange_orders SET updated_at = ? WHERE id = ?", { now, order_id })
      return { buyer_id = order.buyer_user_id, seller_id = order.seller_user_id, item_name = order.item_name, server_id = order.server_id }
    end)
  end)
  if not sent then return failure(409, "message_failed", tostring(result)) end
  events.publish({ result.buyer_id, result.seller_id }, "exchange.message.created", { orderId = order_id })
  events.publish_admin("exchange.message.created", { orderId = order_id })
  notify_users({ result.buyer_id, result.seller_id }, current.id, "exchange.message", "notification.exchange.message.title", { tostring(order_id) }, "notification.exchange.message.body", { result.item_name }, "/plugins/exchange/orders/" .. tostring(order_id), "message-square")
  return response({ sent = true }, 201)
end

function request_admin(ctx)
  local current, err = ensure_access(ctx)
  if err ~= nil then return err end
  local order_id = as_integer(param(ctx, "id"))
  local reason = string.sub(trim(body(ctx).reason), 1, 2000)
  local requested, result = pcall(function()
    return db.transaction(function(tx)
      local order = load_order_locked(tx, order_id)
      if order == nil or role_for(order, as_integer(current.id), false) == "" then error("order_not_found") end
      if not ACTIVE_ORDER_STATUSES[order.status] then error("order_closed") end
      local now = now_utc()
      tx.exec("UPDATE plugin_exchange_orders SET admin_requested = 1, status = 'admin_requested', dispute_reason = ?, updated_at = ? WHERE id = ?", { reason, now, order_id })
      tx.exec("INSERT INTO plugin_exchange_messages (order_id, sender_user_id, sender_kind, body, attachments_json, created_at) VALUES (?, NULL, 'system', ?, '[]', ?)", { order_id, "К заказу приглашён администратор.", now })
      return { buyer_id = order.buyer_user_id, seller_id = order.seller_user_id, item_name = order.item_name, server_id = order.server_id }
    end)
  end)
  if not requested then return failure(409, "admin_request_failed", tostring(result)) end
  events.publish({ result.buyer_id, result.seller_id }, "exchange.admin.requested", { orderId = order_id })
  events.publish_admin("exchange.admin.requested", { orderId = order_id })
  notify_users({ result.buyer_id, result.seller_id }, current.id, "exchange.admin_requested", "notification.exchange.admin_requested.user_title", { tostring(order_id) }, "notification.exchange.admin_requested.user_body", { result.item_name }, "/plugins/exchange/orders/" .. tostring(order_id), "shield-alert")
  notify_admins("exchange.admin_requested", "notification.exchange.admin_requested.admin_title", { tostring(order_id) }, "notification.exchange.admin_requested.admin_body", { result.item_name, reason ~= "" and reason or "—" }, order_id, result.server_id, "shield-alert")
  return response({ requested = true })
end

local function deliver_to_buyer(tx, order, actor_id)
  local now = now_utc()
  tx.exec([[INSERT INTO warehouses
    (owner_id, server_id, item_id, count, enchant, source_plugin, source_reference, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'exchange', ?, ?, ?, ?)]],
    { order.buyer_user_id, order.server_id, order.item_id, order.item_count, order.enchant_level, tostring(order.lot_id), order.item_snapshot_json or "{}", now, now })
  tx.exec("UPDATE plugin_exchange_orders SET status = 'completed', closed_by_user_id = ?, closed_at = ?, cleanup_at = ?, updated_at = ? WHERE id = ?",
    { actor_id, now, now, now, order.id })
  tx.exec("UPDATE plugin_exchange_lots SET status = 'completed', closed_at = ?, updated_at = ? WHERE id = ?", { now, now, order.lot_id })
end

function confirm_payment(ctx)
  local current, err = ensure_access(ctx)
  if err ~= nil then return err end
  local order_id = as_integer(param(ctx, "id"))
  local completed, complete_error = pcall(function()
    return db.transaction(function(tx)
      local order = load_order_locked(tx, order_id)
      if order == nil or as_integer(order.seller_user_id) ~= as_integer(current.id) then error("seller_only") end
      if not ACTIVE_ORDER_STATUSES[order.status] then error("order_closed") end
      deliver_to_buyer(tx, order, current.id)
      return { buyer_id = order.buyer_user_id, seller_id = order.seller_user_id, item_name = order.item_name }
    end)
  end)
  if not completed then return failure(409, "complete_failed", tostring(complete_error)) end
  events.publish({ complete_error.buyer_id, complete_error.seller_id }, "exchange.order.completed", { orderId = order_id })
  events.publish_admin("exchange.order.completed", { orderId = order_id })
  notify_user(complete_error.buyer_id, "exchange.completed", "notification.exchange.completed.title", { tostring(order_id) }, "notification.exchange.completed.body", { complete_error.item_name }, "/plugins/exchange/orders/" .. tostring(order_id), "gift")
  return response({ completed = true })
end

function deliver_warehouse_items(ctx)
  local req = request(ctx)
  local items = req.items or {}
  local character_id = as_integer(req.character_id)
  local server_id = as_integer(req.server_id)
  ensure_l2jlucera(server_id)
  local character = character_owned(0, req.email or "", server_id, character_id, false, ctx.settings)
  if character == nil then error("character_not_found") end
  if as_integer(character.online) ~= 0 then error("character_online") end
  for _, delivery in ipairs(items) do
    local lot_id = as_integer(delivery.source_reference)
    local lot = first(db.query("SELECT * FROM plugin_exchange_lots WHERE id = ? AND status = 'completed'", { lot_id }))
    if lot == nil then error("exchange_lot_not_found") end
    game_db.transaction(server_id, "game", function(tx)
      local locked_character = first(tx.query(game_sql(ctx.settings, server_id, "characterByIdForUpdate"), { character_id }))
      if locked_character == nil or as_integer(locked_character.online) ~= 0 then error("character_online") end
      local result = tx.exec(game_sql(ctx.settings, server_id, "deliverItem"), { character_id, lot.object_id, lot.id })
      if as_integer(result.rows_affected) ~= 1 then error("exchange_escrow_item_not_found") end
      return true
    end)
  end
  return { character_name = req.character_name or "" }
end

function warehouse_delivery_status(ctx)
  local req = request(ctx)
  local delivery = req.item or {}
  local lot_id = as_integer(delivery.source_reference)
  local lot = first(db.query("SELECT id, server_id, object_id FROM plugin_exchange_lots WHERE id = ?", { lot_id }))
  if lot == nil then error("exchange_lot_not_found") end
  local row = first(game_db.query(as_integer(req.server_id), "game", game_sql(ctx.settings, req.server_id, "itemOwner"), { lot.object_id }))
  if row == nil then return { delivered = false, escrowed = false } end
  return { delivered = as_integer(row.owner_id) == as_integer(req.character_id), escrowed = as_integer(row.owner_id) == lot_id }
end

function admin_dashboard(ctx)
  local server_id = as_integer(query(ctx).server)
  local server_error = exchange_server_error(server_id)
  if server_error ~= nil then return failure(400, "exchange_server_unavailable", server_error) end
  local stats = first(db.query([[SELECT
    (SELECT COUNT(*) FROM plugin_exchange_lots WHERE server_id = ? AND status = 'active') AS active_lots,
    (SELECT COUNT(*) FROM plugin_exchange_orders o JOIN plugin_exchange_lots l ON l.id = o.lot_id WHERE l.server_id = ? AND o.status IN ('payment_pending','admin_requested','disputed')) AS open_orders,
    (SELECT COUNT(*) FROM plugin_exchange_orders o JOIN plugin_exchange_lots l ON l.id = o.lot_id WHERE l.server_id = ? AND o.admin_requested = 1 AND o.status IN ('admin_requested','disputed')) AS disputes,
    (SELECT COUNT(*) FROM plugin_exchange_lots WHERE server_id = ? AND status = 'completed') AS completed_sales]], { server_id, server_id, server_id, server_id }))
  return response({ stats = stats or {} })
end

function admin_list_orders(ctx)
  local actor = user(ctx)
  local server_id = as_integer(query(ctx).server)
  local server_error = exchange_server_error(server_id)
  if server_error ~= nil then return failure(400, "exchange_server_unavailable", server_error) end
  local filter = trim(query(ctx).status)
  local where = " WHERE l.server_id = ?"
  if filter == "active" then where = where .. " AND o.status IN ('payment_pending','admin_requested','disputed','cancelling')"
  elseif filter == "disputed" then where = where .. " AND o.status IN ('admin_requested','disputed')"
  elseif filter == "completed" then where = where .. " AND o.status = 'completed'"
  elseif filter == "cancelled" then where = where .. " AND o.status = 'cancelled'"
  elseif filter ~= "all" then filter = "active"; where = where .. " AND o.status IN ('payment_pending','admin_requested','disputed','cancelling')" end
  local rows = db.query([[SELECT o.*, l.item_id, l.item_name, l.item_icon, l.item_category, l.item_grade, l.price, l.currency, l.enchant_level, l.augmentation, l.item_count,
    buyer.login AS buyer_login, seller.login AS seller_login, l.item_snapshot_json, l.payment_methods_json,
    (SELECT COUNT(*) FROM plugin_exchange_messages unread_message
      LEFT JOIN plugin_exchange_order_reads order_read ON order_read.order_id = o.id AND order_read.user_id = ?
      WHERE unread_message.order_id = o.id
        AND unread_message.id > COALESCE(order_read.last_read_message_id, 0)
        AND (unread_message.sender_user_id IS NULL OR unread_message.sender_user_id <> ?)) AS unread_count
    FROM plugin_exchange_orders o JOIN plugin_exchange_lots l ON l.id = o.lot_id
    JOIN users buyer ON buyer.id = o.buyer_user_id JOIN users seller ON seller.id = o.seller_user_id]] .. where .. [[
    ORDER BY o.admin_requested DESC, CASE WHEN o.status IN ('payment_pending','admin_requested','disputed') THEN 0 ELSE 1 END, o.updated_at DESC LIMIT 500]], { actor.id, actor.id, server_id })
  for index, order in ipairs(rows) do rows[index] = present_order(order, as_integer(actor.id), true) end
  local counts = first(db.query([[SELECT
    COUNT(*) AS all_orders,
    SUM(CASE WHEN o.status IN ('payment_pending','admin_requested','disputed','cancelling') THEN 1 ELSE 0 END) AS active,
    SUM(CASE WHEN o.status IN ('admin_requested','disputed') THEN 1 ELSE 0 END) AS disputed,
    SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
    FROM plugin_exchange_orders o JOIN plugin_exchange_lots l ON l.id = o.lot_id WHERE l.server_id = ?]], { server_id }))
  return response({ items = rows, counts = counts or {}, filter = filter })
end

function admin_get_order(ctx)
  local page, err = order_page(as_integer(param(ctx, "id")), as_integer(user(ctx).id), true)
  if err ~= nil then return err end
  return response(page)
end

function admin_send_message(ctx)
  local actor = user(ctx)
  local order_id = as_integer(param(ctx, "id"))
  local message = string.sub(trim(body(ctx).body), 1, 3000)
  local attachments = body(ctx).attachments or {}
  if message == "" and #attachments == 0 then return failure(400, "message_required", "Введите сообщение.") end
  local sent, result = pcall(function()
    return db.transaction(function(tx)
      local order = load_order_locked(tx, order_id)
      if order == nil then error("order_not_found") end
      if not ACTIVE_ORDER_STATUSES[order.status] then error("order_closed") end
      local now = now_utc()
      tx.exec("INSERT INTO plugin_exchange_messages (order_id, sender_user_id, sender_kind, body, attachments_json, created_at) VALUES (?, ?, 'admin', ?, ?, ?)", { order_id, actor.id, message, json_encode(attachments), now })
      tx.exec("UPDATE plugin_exchange_orders SET assigned_admin_user_id = ?, updated_at = ? WHERE id = ?", { actor.id, now, order_id })
      return { buyer_id = order.buyer_user_id, seller_id = order.seller_user_id, item_name = order.item_name }
    end)
  end)
  if not sent then return failure(409, "message_failed", tostring(result)) end
  events.publish({ result.buyer_id, result.seller_id }, "exchange.message.created", { orderId = order_id })
  events.publish_admin("exchange.message.created", { orderId = order_id })
  notify_users({ result.buyer_id, result.seller_id }, actor.id, "exchange.admin_message", "notification.exchange.admin_message.title", { tostring(order_id) }, "notification.exchange.admin_message.body", { result.item_name }, "/plugins/exchange/orders/" .. tostring(order_id), "message-square")
  return response({ sent = true }, 201)
end

local function refund_commission(tx, order, actor_id)
  local existing = first(tx.query("SELECT id FROM plugin_exchange_balance_ledger WHERE idempotency_key = ?", { "order:" .. tostring(order.id) .. ":refund" }))
  if existing ~= nil then return end
  local wallet = first(tx.query("SELECT balance FROM users WHERE id = ? FOR UPDATE", { order.buyer_user_id }))
  local before = as_integer(wallet and wallet.balance)
  tx.exec("UPDATE users SET balance = balance + ? WHERE id = ?", { order.commission_coins, order.buyer_user_id })
  tx.exec([[INSERT INTO plugin_exchange_balance_ledger
    (order_id, user_id, operation, amount, balance_before, balance_after, idempotency_key, actor_user_id, created_at)
    VALUES (?, ?, 'commission_refund', ?, ?, ?, ?, ?, ?)]],
    { order.id, order.buyer_user_id, order.commission_coins, before, before + as_integer(order.commission_coins), "order:" .. tostring(order.id) .. ":refund", actor_id, now_utc() })
end

function admin_order_action(ctx)
  local actor = user(ctx)
  local order_id = as_integer(param(ctx, "id"))
  local action = trim(body(ctx).action)
  local order = load_order(order_id)
  if order == nil then return failure(404, "order_not_found", "Заказ не найден.") end
  if action == "complete" then
    local ok, complete_error = pcall(function()
      db.transaction(function(tx)
        local locked = load_order_locked(tx, order_id)
        if locked == nil or not ACTIVE_ORDER_STATUSES[locked.status] then error("order_closed") end
        deliver_to_buyer(tx, locked, actor.id)
        return true
      end)
    end)
    if not ok then return failure(409, "complete_failed", tostring(complete_error)) end
  elseif action == "refund_commission" then
    db.transaction(function(tx) refund_commission(tx, order, actor.id); return true end)
  elseif action == "cancel_refund" or action == "cancel_no_refund" then
    if not ACTIVE_ORDER_STATUSES[order.status] then return failure(409, "order_closed", "Заказ уже закрыт.") end
    local transition = db.exec("UPDATE plugin_exchange_orders SET status = 'cancelling', updated_at = ? WHERE id = ? AND status IN ('payment_pending','admin_requested','disputed')", { now_utc(), order.id })
    if as_integer(transition.rows_affected) ~= 1 then return failure(409, "order_changed", "Заказ уже изменён другим запросом.") end
    local operation_key = "cancel_order:" .. tostring(order.id)
    db.exec([[INSERT INTO plugin_exchange_operations (lot_id, order_id, operation_key, operation_type, status, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, 'cancel_order', 'started', ?, ?, ?) ON DUPLICATE KEY UPDATE status = 'started', payload_json = VALUES(payload_json), last_error = NULL, updated_at = VALUES(updated_at)]],
      { order.lot_id, order.id, operation_key, json_encode({ action = action, actor_id = actor.id }), now_utc(), now_utc() })
    local ok, restore_error = pcall(function() restore_lot_item({ id = order.lot_id, server_id = order.server_id, original_owner_id = order.original_owner_id, object_id = order.object_id }, ctx.settings) end)
    if not ok then
      db.exec("UPDATE plugin_exchange_orders SET status = ?, updated_at = ? WHERE id = ? AND status = 'cancelling'", { order.status, now_utc(), order.id })
      db.exec("UPDATE plugin_exchange_operations SET status = 'failed', last_error = ?, updated_at = ? WHERE operation_key = ?", { tostring(restore_error), now_utc(), operation_key })
      return failure(409, "restore_failed", tostring(restore_error))
    end
    db.transaction(function(tx)
      if action == "cancel_refund" then refund_commission(tx, order, actor.id) end
      local now = now_utc()
      tx.exec("UPDATE plugin_exchange_orders SET status = 'cancelled', closed_by_user_id = ?, closed_at = ?, cleanup_at = ?, updated_at = ? WHERE id = ? AND status = 'cancelling'", { actor.id, now, now, now, order.id })
      tx.exec("UPDATE plugin_exchange_lots SET status = 'cancelled', closed_at = ?, updated_at = ? WHERE id = ?", { now, now, order.lot_id })
      return true
    end)
    db.exec("UPDATE plugin_exchange_operations SET status = 'completed', updated_at = ? WHERE operation_key = ?", { now_utc(), operation_key })
  elseif action == "mark_disputed" then
    if not ACTIVE_ORDER_STATUSES[order.status] then return failure(409, "order_closed", "Заказ уже закрыт.") end
    db.exec("UPDATE plugin_exchange_orders SET status = 'disputed', admin_requested = 1, dispute_reason = ?, assigned_admin_user_id = ?, updated_at = ? WHERE id = ?", { string.sub(trim(body(ctx).reason), 1, 2000), actor.id, now_utc(), order.id })
  else return failure(400, "invalid_action", "Неизвестное действие администратора.") end
  events.publish({ order.buyer_user_id, order.seller_user_id }, "exchange.order.updated", { orderId = order.id, action = action })
  events.publish_admin("exchange.order.updated", { orderId = order.id, action = action })
  local notification_type = "exchange.updated"
  local title_key = "notification.exchange.updated.title"
  local body_key = "notification.exchange.updated.body"
  local icon = "bell"
  if action == "complete" then notification_type = "exchange.completed"; title_key = "notification.exchange.completed.title"; body_key = "notification.exchange.completed.body"; icon = "gift"
  elseif action == "cancel_refund" or action == "cancel_no_refund" then notification_type = "exchange.cancelled"; title_key = "notification.exchange.cancelled.title"; body_key = "notification.exchange.cancelled.body"; icon = "shield-alert"
  elseif action == "refund_commission" then notification_type = "exchange.refunded"; title_key = "notification.exchange.refunded.title"; body_key = "notification.exchange.refunded.body"; icon = "coins"
  elseif action == "mark_disputed" then notification_type = "exchange.disputed"; title_key = "notification.exchange.disputed.title"; body_key = "notification.exchange.disputed.body"; icon = "shield-alert" end
  notify_users({ order.buyer_user_id, order.seller_user_id }, 0, notification_type, title_key, { tostring(order.id) }, body_key, { order.item_name }, "/plugins/exchange/orders/" .. tostring(order.id), icon)
  return response({ updated = true, action = action })
end

function admin_list_access(ctx)
  local rows = db.query([[SELECT o.*, u.login FROM plugin_exchange_access_overrides o
    JOIN users u ON u.id = o.user_id ORDER BY o.updated_at DESC LIMIT 500]])
  return response({ items = rows })
end

function admin_save_access(ctx)
  local actor = user(ctx)
  local user_id = as_integer(param(ctx, "userId"))
  local input = body(ctx)
  if user_id <= 0 then return failure(400, "invalid_user", "Invalid user") end
  if input.accessState == "inherit" then
    db.exec("DELETE FROM plugin_exchange_access_overrides WHERE user_id = ?", { user_id })
  else
    local now = now_utc()
    db.exec([[INSERT INTO plugin_exchange_access_overrides
      (user_id, access_state, reason, expires_at, updated_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE access_state = VALUES(access_state), reason = VALUES(reason), expires_at = VALUES(expires_at), updated_by_user_id = VALUES(updated_by_user_id), updated_at = VALUES(updated_at)]],
      { user_id, input.accessState == "allow" and "allow" or "deny", string.sub(trim(input.reason), 1, 2000), trim(input.expiresAt), actor.id, now, now })
  end
  return response({ saved = true })
end

function cleanup_job(ctx)
  local days = math.max(1, as_integer(ctx.settings.closedRetentionDays, 31))
  local timeout_hours = math.max(1, as_integer(ctx.settings.orderTimeoutHours, 72))
  local timeout_action = tostring(ctx.settings.orderTimeoutAction or "admin")
  local overdue = db.query([[SELECT o.*, l.server_id, l.original_owner_id, l.object_id
    FROM plugin_exchange_orders o JOIN plugin_exchange_lots l ON l.id = o.lot_id
    WHERE o.status = 'payment_pending'
    AND STR_TO_DATE(LEFT(o.created_at, 19), '%Y-%m-%dT%H:%i:%s') < UTC_TIMESTAMP() - INTERVAL ? HOUR LIMIT 100]], { timeout_hours })
  for _, order in ipairs(overdue) do
    if timeout_action == "admin" then
      local escalated = db.exec("UPDATE plugin_exchange_orders SET status = 'admin_requested', admin_requested = 1, dispute_reason = 'Истёк срок ожидания оплаты', updated_at = ? WHERE id = ? AND status = 'payment_pending'", { now_utc(), order.id })
      if as_integer(escalated.rows_affected) == 1 then
        events.publish({ order.buyer_user_id, order.seller_user_id }, "exchange.admin.requested", { orderId = order.id })
        events.publish_admin("exchange.admin.requested", { orderId = order.id })
        notify_users({ order.buyer_user_id, order.seller_user_id }, 0, "exchange.admin_requested", "notification.exchange.admin_requested.user_title", { tostring(order.id) }, "notification.exchange.timeout_admin_body", {}, "/plugins/exchange/orders/" .. tostring(order.id), "shield-alert")
        notify_admins("exchange.admin_requested", "notification.exchange.admin_requested.admin_title", { tostring(order.id) }, "notification.exchange.timeout_admin_body", {}, order.id, order.server_id, "shield-alert")
      end
    elseif timeout_action == "cancel_refund" then
      local transition = db.exec("UPDATE plugin_exchange_orders SET status = 'cancelling', updated_at = ? WHERE id = ? AND status = 'payment_pending'", { now_utc(), order.id })
      if as_integer(transition.rows_affected) == 1 then
        local operation_key = "cancel_order:" .. tostring(order.id)
        db.exec([[INSERT INTO plugin_exchange_operations (lot_id, order_id, operation_key, operation_type, status, payload_json, created_at, updated_at)
          VALUES (?, ?, ?, 'cancel_order', 'started', ?, ?, ?) ON DUPLICATE KEY UPDATE status = 'started', payload_json = VALUES(payload_json), last_error = NULL, updated_at = VALUES(updated_at)]],
          { order.lot_id, order.id, operation_key, json_encode({ action = "cancel_refund", actor_id = 0 }), now_utc(), now_utc() })
        local restored = pcall(function() restore_lot_item({ id = order.lot_id, server_id = order.server_id, original_owner_id = order.original_owner_id, object_id = order.object_id }, ctx.settings) end)
        if restored then
          db.transaction(function(tx)
            refund_commission(tx, order, 0)
            local now = now_utc()
            tx.exec("UPDATE plugin_exchange_orders SET status = 'cancelled', closed_by_user_id = NULL, closed_at = ?, updated_at = ? WHERE id = ? AND status = 'cancelling'", { now, now, order.id })
            tx.exec("UPDATE plugin_exchange_lots SET status = 'cancelled', closed_at = ?, updated_at = ? WHERE id = ?", { now, now, order.lot_id })
            return true
          end)
          db.exec("UPDATE plugin_exchange_operations SET status = 'completed', updated_at = ? WHERE operation_key = ?", { now_utc(), operation_key })
          events.publish({ order.buyer_user_id, order.seller_user_id }, "exchange.order.updated", { orderId = order.id, action = "timeout_cancel_refund" })
          events.publish_admin("exchange.order.updated", { orderId = order.id, action = "timeout_cancel_refund" })
          notify_users({ order.buyer_user_id, order.seller_user_id }, 0, "exchange.cancelled", "notification.exchange.cancelled.title", { tostring(order.id) }, "notification.exchange.timeout_cancelled_body", {}, "/plugins/exchange/orders/" .. tostring(order.id), "shield-alert")
        else
          db.exec("UPDATE plugin_exchange_orders SET status = 'payment_pending', updated_at = ? WHERE id = ? AND status = 'cancelling'", { now_utc(), order.id })
          db.exec("UPDATE plugin_exchange_operations SET status = 'failed', last_error = 'restore failed; order reverted', updated_at = ? WHERE operation_key = ?", { now_utc(), operation_key })
        end
      end
    end
  end
  db.exec([[DELETE r FROM plugin_exchange_order_reads r JOIN plugin_exchange_orders o ON o.id = r.order_id
    WHERE o.closed_at IS NOT NULL AND STR_TO_DATE(LEFT(o.closed_at, 19), '%Y-%m-%dT%H:%i:%s') < UTC_TIMESTAMP() - INTERVAL ? DAY]], { days })
  db.exec([[DELETE m FROM plugin_exchange_messages m JOIN plugin_exchange_orders o ON o.id = m.order_id
    WHERE o.closed_at IS NOT NULL AND STR_TO_DATE(LEFT(o.closed_at, 19), '%Y-%m-%dT%H:%i:%s') < UTC_TIMESTAMP() - INTERVAL ? DAY]], { days })
  db.exec([[UPDATE plugin_exchange_lots l JOIN plugin_exchange_orders o ON o.id = l.active_order_id
    SET l.active_order_id = NULL WHERE o.closed_at IS NOT NULL
    AND STR_TO_DATE(LEFT(o.closed_at, 19), '%Y-%m-%dT%H:%i:%s') < UTC_TIMESTAMP() - INTERVAL ? DAY]], { days })
  local deleted = db.exec([[DELETE FROM plugin_exchange_orders WHERE closed_at IS NOT NULL
    AND STR_TO_DATE(LEFT(closed_at, 19), '%Y-%m-%dT%H:%i:%s') < UTC_TIMESTAMP() - INTERVAL ? DAY]], { days })
  return { ok = true, deleted = deleted.rows_affected }
end

function reconcile_job(ctx)
  local rows = db.query([[SELECT o.*, l.server_id, l.original_owner_id, l.object_id, l.item_id, l.item_count,
      l.enchant_level, l.status AS lot_status
    FROM plugin_exchange_operations o LEFT JOIN plugin_exchange_lots l ON l.id = o.lot_id
    WHERE o.status IN ('started','failed') ORDER BY o.id ASC LIMIT 50]])
  for _, operation in ipairs(rows) do
    if operation.operation_type == "freeze" then
      if operation.lot_status == "active" then
        db.exec("UPDATE plugin_exchange_operations SET status = 'completed', updated_at = ? WHERE id = ?", { now_utc(), operation.id })
      elseif operation.lot_status == "freezing" then
        local item = first(game_db.query(as_integer(operation.server_id), "game", game_sql(ctx.settings, operation.server_id, "itemWithVariationByOwner"), { operation.object_id, operation.lot_id }))
        if item ~= nil then
          local actual_item_id = as_integer(item.item_type)
          local definition = catalog_item(as_integer(operation.server_id), actual_item_id, "ru")
          db.exec("UPDATE plugin_exchange_lots SET item_id = ?, item_name = ?, item_icon = ?, item_category = ?, item_grade = ?, item_count = ?, enchant_level = ?, augmentation = ?, item_snapshot_json = ?, status = 'active', updated_at = ? WHERE id = ? AND status = 'freezing'",
            { actual_item_id, trim(definition.name) ~= "" and definition.name or ("Item #" .. tostring(actual_item_id)), definition.icon or "", definition.equipmentCategory or "other", definition.grade or "NG",
              as_integer(item.amount, operation.item_count), as_integer(item.enchant), snapshot_augmentation(item, definition.equipmentCategory), json_encode(item), now_utc(), operation.lot_id })
          db.exec("UPDATE plugin_exchange_operations SET status = 'completed', payload_json = ?, last_error = NULL, updated_at = ? WHERE id = ?", { json_encode(item), now_utc(), operation.id })
        end
      end
    elseif operation.operation_type == "cancel_lot" then
      if operation.lot_status == "cancelled" then
        db.exec("UPDATE plugin_exchange_operations SET status = 'completed', last_error = NULL, updated_at = ? WHERE id = ?", { now_utc(), operation.id })
      elseif operation.lot_status == "cancelling" then
        local restored = pcall(function() restore_lot_item({ id = operation.lot_id, server_id = operation.server_id, original_owner_id = operation.original_owner_id, object_id = operation.object_id }, ctx.settings) end)
        if restored then
          db.exec("UPDATE plugin_exchange_lots SET status = 'cancelled', closed_at = ?, updated_at = ? WHERE id = ? AND status = 'cancelling'", { now_utc(), now_utc(), operation.lot_id })
          db.exec("UPDATE plugin_exchange_operations SET status = 'completed', last_error = NULL, updated_at = ? WHERE id = ?", { now_utc(), operation.id })
        end
      end
    elseif operation.operation_type == "cancel_order" then
      local order = load_order(as_integer(operation.order_id))
      if order ~= nil and order.status == "cancelled" then
        db.exec("UPDATE plugin_exchange_operations SET status = 'completed', last_error = NULL, updated_at = ? WHERE id = ?", { now_utc(), operation.id })
      elseif order ~= nil and order.status == "cancelling" then
        local payload = json_decode(operation.payload_json or "{}")
        local restored = pcall(function() restore_lot_item({ id = order.lot_id, server_id = order.server_id, original_owner_id = order.original_owner_id, object_id = order.object_id }, ctx.settings) end)
        if restored then
          db.transaction(function(tx)
            if payload.action == "cancel_refund" then refund_commission(tx, order, as_integer(payload.actor_id)) end
            local now = now_utc()
            tx.exec("UPDATE plugin_exchange_orders SET status = 'cancelled', closed_by_user_id = ?, closed_at = ?, updated_at = ? WHERE id = ? AND status = 'cancelling'", { as_integer(payload.actor_id), now, now, order.id })
            tx.exec("UPDATE plugin_exchange_lots SET status = 'cancelled', closed_at = ?, updated_at = ? WHERE id = ?", { now, now, order.lot_id })
            return true
          end)
          db.exec("UPDATE plugin_exchange_operations SET status = 'completed', last_error = NULL, updated_at = ? WHERE id = ?", { now_utc(), operation.id })
        end
      end
    end
  end
  return { checked = #rows }
end
