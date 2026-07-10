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
        key = "credit_amount_source",
        label = "Как рассчитывать начисление пользователю",
        type = "select",
        required = true,
        default = "payer_paid",
        hint = "Если выбрать полную оплату пользователя, комиссия BetaTransfer не уменьшит начисление. Во втором варианте баланс рассчитывается только по сумме, фактически полученной сайтом после удержания комиссии.",
        options = {
          { value = "payer_paid", label = "Со всей суммы, заплаченной пользователем (до комиссии)" },
          { value = "merchant_received", label = "Только с суммы, полученной сайтом (после комиссии)" },
        },
      },
      {
        key = "payment_methods",
        label = "Способы оплаты",
        type = "rows",
        required = true,
        hint = "Каждая запись появится отдельным способом оплаты у пользователя.",
        columns = {
          { key = "name", label = "Название", type = "text", required = true, placeholder = "Карта UAH" },
          { key = "paymentSystem", label = "PaymentSystem BetaTransfer", type = "text", required = true, placeholder = "P2R_RUB" },
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
    local key = value(method.paymentSystem, "")
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

  local amount_text = string.format("%.2f", amount)
  local currency = value(method.currency, "UAH")
  local order_id = string.gsub(ctx.order.public_id, "_", "-")
  local fields = {
    { "amount", amount_text },
    { "currency", currency },
    { "orderId", order_id },
    { "paymentSystem", value(method.paymentSystem, "") },
    { "urlResult", value(ctx.provider.webhook_url, "") },
    { "urlSuccess", value(ctx.order.success_url, "") },
    { "urlFail", value(ctx.order.fail_url, "") },
    { "payerId", value(ctx.user.id, "") },
    { "fullCallback", "0" },
  }
  local sign_values = {}
  local form = {}
  for _, field in ipairs(fields) do
    sign_values[#sign_values + 1] = field[2]
    form[#form + 1] = url_encode(field[1]) .. "=" .. url_encode(field[2])
  end
  local sign = md5_hex(table.concat(sign_values) .. value(ctx.settings.secret_api_key, ""))
  form[#form + 1] = "sign=" .. url_encode(sign)
  local response = http_request({
    method = "POST",
    url = API_PAYMENT_URL .. "?token=" .. url_encode(value(ctx.settings.public_api_key, "")),
    headers = { ["Content-Type"] = "application/x-www-form-urlencoded" },
    body = table.concat(form, "&"),
    timeout_ms = 30000,
  })
  local body = json_decode(response.body or "{}")
  if response.status ~= 200 or body.status ~= "success" or value(body.url, "") == "" then
    error("BetaTransfer API: " .. api_error(body, response.body))
  end
  return {
    redirect_url = body.url,
    external_id = value(body.id, order_id),
    amount = amount,
    currency = currency,
    payload = body,
  }
end

function webhook(ctx)
  local form = ctx.request.form
  local sign = first(form.sign)
  local amount = first(form.amount)
  local order_id = first(form.orderId)
  if sign == "" or tonumber(amount) == nil or tonumber(amount) <= 0 or order_id == "" then
    return { status = "rejected", response_status = 400, response_body = "FAIL" }
  end
  local expected = md5_hex(amount .. order_id .. value(ctx.settings.secret_api_key, ""))
  if not constant_time_equal(expected, sign) then
    return { status = "rejected", response_status = 400, response_body = "FAIL" }
  end
  local payment_status = string.lower(first(form.status))
  if payment_status ~= "" and payment_status ~= "success" then
    return { status = "ignored", response_body = "OK", payload = flatten_form(form) }
  end
  local currency = first(form.currency)
  if currency == "" then
    return { status = "rejected", response_status = 400, response_body = "FAIL", reason = "BetaTransfer webhook: currency is missing" }
  end
  local credit_amount = amount
  if value(ctx.settings.credit_amount_source, "payer_paid") ~= "merchant_received" then
    credit_amount = first(form.paidAmount)
  end
  if tonumber(credit_amount) == nil or tonumber(credit_amount) <= 0 then
    return { status = "rejected", response_status = 400, response_body = "FAIL", reason = "BetaTransfer webhook: selected credit amount is missing" }
  end
  return {
    status = "paid",
    order_id = string.gsub(order_id, "^dn%-", "dn_"),
    external_id = first(form.id),
    amount = tonumber(credit_amount),
    currency = currency,
    response_body = "OK",
    payload = flatten_form(form),
  }
end

function find_method(methods, key)
  for _, method in ipairs(rows(methods)) do
    if value(method.paymentSystem, "") == key then
      return method
    end
  end
  return nil
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
