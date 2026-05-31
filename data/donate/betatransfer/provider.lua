local API_PAYMENT_URL = "https://merchant.betatransfer.io/api/payment"

function meta()
  return {
    name = "BetaTransfer",
    description = "BetaTransfer: настраиваемый список способов оплаты.",
    version = "1.0.0",
    author = "SphereWeb3",
    icon = "CreditCard",
    currencies = { "UAH", "USD", "EUR", "RUB" },
    settings = {
      { key = "public_api_key", label = "Public API key", type = "text", required = true },
      { key = "secret_api_key", label = "Secret API key", type = "password", required = true, secret = true },
      {
        key = "payment_methods",
        label = "Способы оплаты",
        type = "rows",
        required = true,
        hint = "Каждая запись появится отдельным способом оплаты у пользователя.",
        columns = {
          { key = "key", label = "Код", type = "text", required = true, placeholder = "card_uah" },
          { key = "name", label = "Название", type = "text", required = true, placeholder = "Карта UAH" },
          { key = "paymentSystem", label = "Payment system", type = "text", required = true },
          { key = "currency", label = "Валюта", type = "select", default = "UAH", options = currency_options() },
          { key = "min", label = "Мин. сумма", type = "number", default = 0 },
          { key = "max", label = "Макс. сумма", type = "number", default = 0 },
          { key = "icon", label = "Иконка", type = "text", default = "CreditCard" },
        },
      },
    },
  }
end

function public(ctx)
  local options = {}
  for _, method in ipairs(rows(ctx.settings.payment_methods)) do
    local key = value(method.key, method.paymentSystem)
    options[#options + 1] = {
      key = key,
      label = value(method.name, key),
      description = value(method.paymentSystem, key),
      currency = value(method.currency, "UAH"),
      icon = value(method.icon, "CreditCard"),
      minAmount = tonumber(method.min or 0),
      maxAmount = tonumber(method.max or 0),
      payload = { key = key },
    }
  end
  return { options = options }
end

function create_payment(ctx)
  local method = find_method(ctx.settings.payment_methods, value(ctx.payment.option, ""))
  if method == nil then
    error("BetaTransfer: способ оплаты не найден")
  end
  local amount = round2(ctx.order.amount)
  local min_amount = tonumber(method.min or 0) or 0
  local max_amount = tonumber(method.max or 0) or 0
  if min_amount > 0 and amount < min_amount then
    error("Минимальная сумма для способа " .. value(method.name, "") .. ": " .. tostring(min_amount) .. " " .. value(method.currency, "UAH"))
  end
  if max_amount > 0 and amount > max_amount then
    error("Максимальная сумма для способа " .. value(method.name, "") .. ": " .. tostring(max_amount) .. " " .. value(method.currency, "UAH"))
  end

  local options = {
    amount = amount,
    currency = value(method.currency, "UAH"),
    orderId = ctx.order.public_id,
    paymentSystem = method.paymentSystem,
    fullCallback = 0,
  }
  options.sign = md5_hex(tostring(options.amount) .. options.currency .. options.orderId .. options.paymentSystem .. tostring(options.fullCallback) .. value(ctx.settings.secret_api_key, ""))
  local response = http_request({
    method = "POST",
    url = API_PAYMENT_URL .. "?token=" .. url_encode(value(ctx.settings.public_api_key, "")),
    headers = { ["Content-Type"] = "application/x-www-form-urlencoded" },
    body = form_encode(options),
    timeout_ms = 30000,
  })
  local body = json_decode(response.body or "{}")
  if response.status ~= 200 or body.status ~= "success" or value(body.url, "") == "" then
    error("BetaTransfer API: " .. api_error(body, response.body))
  end
  return {
    redirect_url = body.url,
    external_id = ctx.order.public_id,
    amount = amount,
    currency = options.currency,
    payload = body,
  }
end

function webhook(ctx)
  local form = ctx.request.form
  local sign = first(form.sign)
  local amount = first(form.amount)
  local order_id = first(form.orderId)
  local currency = value(first(form.currency), "UAH")
  if sign == "" or amount == "" or order_id == "" then
    return { status = "rejected", response_status = 400, response_body = "FAIL" }
  end
  local expected = md5_hex(amount .. order_id .. value(ctx.settings.secret_api_key, ""))
  if not constant_time_equal(expected, sign) then
    return { status = "rejected", response_status = 400, response_body = "FAIL" }
  end
  return {
    status = "paid",
    order_id = order_id,
    external_id = sign,
    amount = tonumber(amount),
    currency = currency,
    response_body = "OK",
    payload = flatten_form(form),
  }
end

function find_method(methods, key)
  local first_method = nil
  for _, method in ipairs(rows(methods)) do
    first_method = first_method or method
    if value(method.key, method.paymentSystem) == key then
      return method
    end
  end
  return first_method
end

function api_error(body, fallback)
  if type(body.errors) == "table" then return json_encode(body.errors) end
  return value(body.error, value(body.message, fallback))
end

function currency_options()
  return {
    { value = "UAH", label = "UAH" },
    { value = "USD", label = "USD" },
    { value = "EUR", label = "EUR" },
    { value = "RUB", label = "RUB" },
  }
end

function rows(value)
  return type(value) == "table" and value or {}
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

function round2(v)
  return math.floor((tonumber(v) or 0) * 100 + 0.5) / 100
end

function flatten_form(form)
  local out = {}
  for k, v in pairs(form or {}) do out[k] = first(v) end
  return out
end
