local API_URL = "https://unitpay.ru/api"

function meta()
  return {
    name = "UnitPay",
    description = "UnitPay initPayment API with signed result callback.",
    version = "1.0.0",
    author = "SphereWeb3",
    icon = "Landmark",
    currencies = { "RUB", "USD", "EUR", "UAH" },
    settings = {
      { key = "publicKey", label = "Публичный ключ / Project ID", type = "text", required = true },
      { key = "secretKey", label = "Секретный ключ", type = "password", required = true, secret = true },
      { key = "currency", label = "Валюта", type = "select", default = "RUB", options = currency_options() },
      { key = "description", label = "Описание платежа", type = "text", default = "Покупка Donate Coin" },
      { key = "paymentType", label = "Payment type", type = "text", default = "card" },
    },
  }
end

function create_payment(ctx)
  local currency = value(ctx.settings.currency, "RUB")
  local desc = value(ctx.settings.description, "Покупка Donate Coin")
  local account = ctx.order.public_id
  local amount = ctx.order.amount
  local secret = value(ctx.settings.secretKey, "")
  local signature = sha256_hex(account .. "{up}" .. currency .. "{up}" .. desc .. "{up}" .. tostring(amount) .. "{up}" .. secret)
  local params = {
    ["params[account]"] = account,
    ["params[currency]"] = currency,
    ["params[desc]"] = desc,
    ["params[sum]"] = tostring(amount),
    ["params[paymentType]"] = value(ctx.settings.paymentType, "card"),
    ["params[customerEmail]"] = ctx.user.email or "",
    ["params[cashItems]"] = base64_encode(json_encode({ { name = desc, count = 1, price = amount } })),
    ["params[secretKey]"] = secret,
    ["params[projectId]"] = value(ctx.settings.publicKey, ""),
    ["params[resultUrl]"] = ctx.order.return_url,
    ["params[hideMenu]"] = "true",
    ["params[hideOtherPSMethods]"] = "true",
    ["params[hideOtherMethods]"] = "true",
    ["params[signature]"] = signature,
  }
  local response = http_request({
    method = "GET",
    url = API_URL .. "?method=initPayment&" .. form_encode(params),
    timeout_ms = 30000,
  })
  local body = json_decode(response.body or "{}")
  if body.error then
    error("UnitPay API: " .. api_error(body.error, response.body))
  end
  local url = ((body.result or {}).redirectUrl or "")
  if url == "" then
    error("UnitPay не вернул ссылку на оплату")
  end
  return {
    redirect_url = url,
    external_id = ctx.order.public_id,
    amount = amount,
    currency = currency,
    payload = body,
  }
end

function webhook(ctx)
  local method = value(first(ctx.request.form.method), first(ctx.request.query.method))
  local params = collect_params(ctx.request.form, ctx.request.query)
  if method == "" or value(params.account, "") == "" or value(params.orderSum, "") == "" or value(params.signature, "") == "" then
    return unitpay_error("Missing required parameters")
  end
  local signature = params.signature
  params.signature = nil
  local expected = unitpay_signature(method, params, value(ctx.settings.secretKey, ""))
  if not constant_time_equal(expected, signature) then
    return unitpay_error("Wrong signature!")
  end
  if method ~= "pay" then
    return unitpay_ok("Запрос успешно обработан", "ignored")
  end
  return {
    status = "paid",
    order_id = value(params.account, ""),
    external_id = value(params.unitpayId, value(params.orderId, signature)),
    amount = tonumber(params.orderSum),
    currency = value(ctx.settings.currency, "RUB"),
    response_body = json_encode({ result = { message = "Запрос успешно обработан" } }),
    response_headers = { ["Content-Type"] = "application/json" },
    payload = params,
  }
end

function collect_params(form, query)
  local out = {}
  local source = {}
  for k, v in pairs(query or {}) do source[k] = v end
  for k, v in pairs(form or {}) do source[k] = v end
  for k, v in pairs(source) do
    local key = string.match(k, "^params%[([^%]]+)%]$")
    if key then out[key] = first(v) end
  end
  return out
end

function unitpay_signature(method, params, secret)
  local keys = {}
  for k, _ in pairs(params or {}) do keys[#keys + 1] = k end
  table.sort(keys)
  local values = {}
  for _, key in ipairs(keys) do values[#values + 1] = tostring(params[key] or "") end
  return sha256_hex(method .. "{up}" .. table.concat(values, "{up}") .. "{up}" .. secret)
end

function unitpay_ok(message, status)
  return {
    status = status or "ignored",
    response_body = json_encode({ result = { message = message } }),
    response_headers = { ["Content-Type"] = "application/json" },
  }
end

function unitpay_error(message)
  return {
    status = "rejected",
    response_status = 400,
    response_body = json_encode({ error = { message = message } }),
    response_headers = { ["Content-Type"] = "application/json" },
  }
end

function currency_options()
  return {
    { value = "RUB", label = "RUB" },
    { value = "USD", label = "USD" },
    { value = "EUR", label = "EUR" },
    { value = "UAH", label = "UAH" },
  }
end

function api_error(err, fallback)
  if type(err) == "table" then return value(err.message, fallback) end
  return value(err, fallback)
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
