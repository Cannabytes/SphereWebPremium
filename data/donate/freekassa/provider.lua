local CHECKOUT_URL = "https://pay.fk.money/"
local DEFAULT_CALLBACK_IPS = "168.119.157.136,168.119.60.227,178.154.197.79,51.250.54.238"

function meta()
  return {
    name = "FreeKassa",
    description = "FreeKassa SCI: платежная форма с подписанным уведомлением об оплате.",
    version = "1.0.0",
    author = "SphereWeb3",
    icon = "CreditCard",
    currencies = { "RUB", "USD", "EUR", "UAH", "KZT" },
    settings = {
      { key = "merchant_id", label = "ID магазина", type = "text", required = true },
      { key = "secret_key_1", label = "Секретное слово 1", type = "password", required = true, secret = true },
      { key = "secret_key_2", label = "Секретное слово 2", type = "password", required = true, secret = true },
      { key = "currency", label = "Валюта", type = "select", default = "RUB", options = currency_options() },
      { key = "min_amount", label = "Мин. сумма", type = "number", default = 0 },
      { key = "max_amount", label = "Макс. сумма", type = "number", default = 0 },
      { key = "payment_system_id", label = "ID способа оплаты", type = "number", default = 0, hint = "Необязательно. Значение параметра i из списка способов FreeKassa; 0 оставляет выбор плательщику." },
      { key = "language", label = "Язык платежной формы", type = "select", default = "ru", options = {
        { value = "ru", label = "Русский" },
        { value = "en", label = "English" },
      }},
      { key = "verify_ip", label = "Проверять IP уведомления", type = "checkbox", default = true },
      { key = "callback_ips", label = "Разрешенные IP уведомлений", type = "text", default = DEFAULT_CALLBACK_IPS, hint = "Официальные IP FreeKassa через запятую. Обновите список, если FreeKassa изменит документацию." },
    },
    links = {
      { label = "Документация FreeKassa SCI", url = "https://docs.freekassa.net/" },
      { label = "Настройки магазина", url = "https://merchant.freekassa.net/settings" },
    },
  }
end

function public(ctx)
  local currency = value(ctx.settings.currency, "RUB")
  return {
    options = {
      {
        key = "default",
        label = "FreeKassa",
        description = "Банковские карты, СБП и другие способы · " .. currency,
        currency = currency,
        icon = "CreditCard",
        minAmount = tonumber(ctx.settings.min_amount or 0),
        maxAmount = tonumber(ctx.settings.max_amount or 0),
      },
    },
  }
end

function create_payment(ctx)
  local merchant_id = value(ctx.settings.merchant_id, "")
  local secret = value(ctx.settings.secret_key_1, "")
  local currency = value(ctx.settings.currency, ctx.order.currency)
  local order_id = value(ctx.order.public_id, "")
  local amount = money(ctx.order.amount)
  local params = {
    m = merchant_id,
    oa = amount,
    currency = currency,
    o = order_id,
    s = md5_hex(merchant_id .. ":" .. amount .. ":" .. secret .. ":" .. currency .. ":" .. order_id),
    em = value(ctx.user.email, ""),
    lang = value(ctx.settings.language, "ru"),
  }
  local payment_system_id = tonumber(ctx.settings.payment_system_id or 0) or 0
  if payment_system_id > 0 then
    params.i = tostring(math.floor(payment_system_id))
  end

  return {
    redirect_url = CHECKOUT_URL .. "?" .. form_encode(params),
    external_id = order_id,
    amount = tonumber(amount),
    currency = currency,
    payload = {
      merchant_id = merchant_id,
      order_id = order_id,
      payment_system_id = params.i or "",
    },
  }
end

function webhook(ctx)
  local params = collect_params(ctx.request.form, ctx.request.query)
  local merchant_id = value(params.MERCHANT_ID, "")
  local amount = value(params.AMOUNT, "")
  local order_id = value(params.MERCHANT_ORDER_ID, "")
  local external_id = value(params.intid, "")
  local signature = string.lower(value(params.SIGN, ""))

  if merchant_id == "" or amount == "" or order_id == "" or external_id == "" or signature == "" then
    return reject("missing required parameters")
  end
  if merchant_id ~= value(ctx.settings.merchant_id, "") then
    return reject("wrong merchant")
  end
  if not string.match(order_id, "^dn_[a-f0-9]+$") then
    return reject("wrong order")
  end
  if ctx.settings.verify_ip ~= false and not ip_allowed(value(ctx.request.ip, ""), value(ctx.settings.callback_ips, DEFAULT_CALLBACK_IPS)) then
    return reject("wrong ip")
  end

  local expected = md5_hex(merchant_id .. ":" .. amount .. ":" .. value(ctx.settings.secret_key_2, "") .. ":" .. order_id)
  if not constant_time_equal(expected, signature) then
    return reject("wrong sign")
  end

  local amount_number = tonumber(amount)
  if amount_number == nil or amount_number <= 0 or amount_number == math.huge or amount_number ~= amount_number then
    return reject("wrong amount")
  end

  return {
    status = "paid",
    order_id = order_id,
    external_id = external_id,
    amount = amount_number,
    currency = value(ctx.settings.currency, "RUB"),
    require_exact_amount = true,
    response_body = "YES",
    response_headers = { ["Content-Type"] = "text/plain; charset=utf-8" },
    payload = params,
  }
end

function currency_options()
  return {
    { value = "RUB", label = "RUB" },
    { value = "USD", label = "USD" },
    { value = "EUR", label = "EUR" },
    { value = "UAH", label = "UAH" },
    { value = "KZT", label = "KZT" },
  }
end

function collect_params(form, query)
  local out = {}
  for key, values in pairs(query or {}) do out[key] = first(values) end
  for key, values in pairs(form or {}) do out[key] = first(values) end
  return out
end

function ip_allowed(ip, list)
  for candidate in string.gmatch(tostring(list or ""), "[^,%s;]+") do
    if candidate == ip then return true end
  end
  return false
end

function reject(message)
  return {
    status = "rejected",
    reason = message,
    response_status = 400,
    response_body = message,
    response_headers = { ["Content-Type"] = "text/plain; charset=utf-8" },
  }
end

function first(values)
  if type(values) == "table" then return tostring(values[1] or "") end
  return tostring(values or "")
end

function value(v, fallback)
  local s = tostring(v or "")
  if s == "" then return tostring(fallback or "") end
  return s
end

function money(v)
  return string.format("%.2f", tonumber(v) or 0)
end
