local API_CREATE_URL = "https://api.paritypay.ru/invoice/create"

function meta()
  return {
    name = "ParityPay",
    description = "ParityPay: SBP/Card invoices with signed callbacks.",
    version = "1.0.0",
    author = "SphereWeb3",
    icon = "QrCode",
    currencies = { "RUB", "USD", "EUR", "UAH" },
    settings = {
      {
        key = "gateways",
        label = "Шлюзы ParityPay",
        type = "rows",
        required = true,
        columns = {
          { key = "label", label = "Название", type = "text", default = "ParityPay" },
          { key = "shop_id", label = "Shop ID", type = "text", required = true },
          { key = "secret_key_1", label = "Secret key 1", type = "password", required = true, secret = true },
          { key = "secret_key_2", label = "Secret key 2", type = "password", required = true, secret = true },
          { key = "currency", label = "Валюта", type = "select", default = "RUB", options = currency_options() },
          { key = "service", label = "Сервис", type = "select", default = "sbp", options = {
            { value = "", label = "Авто" },
            { value = "sbp", label = "СБП" },
            { value = "card", label = "Карта" },
          }},
          { key = "expire", label = "Срок счета, сек", type = "number", default = 0 },
        },
      },
    },
  }
end

function public(ctx)
  local options = {}
  for i, gateway in ipairs(rows(ctx.settings.gateways)) do
    options[#options + 1] = {
      key = tostring(i),
      label = value(gateway.label, "ParityPay " .. tostring(i)),
      description = value(gateway.service, "auto") .. " · " .. value(gateway.currency, "RUB"),
      currency = value(gateway.currency, "RUB"),
      icon = "QrCode",
      badge = value(gateway.service, ""),
      payload = { index = i },
    }
  end
  return { options = options }
end

function create_payment(ctx)
  local gateways = rows(ctx.settings.gateways)
  local index = tonumber(value(ctx.payment.option, "1")) or 1
  local gateway = gateways[index] or gateways[1]
  if gateway == nil then
    error("ParityPay не настроен")
  end
  local payload = {
    shop_id = gateway.shop_id,
    amount = round2(ctx.order.amount),
    order_id = ctx.order.public_id,
    success_url = ctx.order.success_url,
    fail_url = ctx.order.fail_url,
    callback_url = ctx.provider.webhook_url,
    custom_fields = ctx.order.public_id,
    comment = "SphereWeb3 donate " .. tostring(ctx.order.coins) .. " coins",
  }
  if value(gateway.service, "") ~= "" then
    payload.service = gateway.service
  end
  if tonumber(gateway.expire or 0) and tonumber(gateway.expire or 0) > 0 then
    payload.expire = tonumber(gateway.expire)
  end
  local signature = parity_signature(payload, value(gateway.secret_key_1, ""))
  local response = http_request({
    method = "POST",
    url = API_CREATE_URL,
    headers = {
      ["Content-Type"] = "application/json",
      ["X-SIGNATURE"] = signature,
    },
    body = json_encode(payload),
    timeout_ms = 25000,
  })
  local body = json_decode(response.body or "{}")
  if value(body.error, "") ~= "" then
    error("ParityPay API: " .. value(body.error, response.body))
  end
  local url = value(body.link, "")
  if url == "" then
    error("ParityPay не вернул ссылку на оплату")
  end
  return {
    redirect_url = url,
    external_id = ctx.order.public_id,
    amount = payload.amount,
    currency = value(gateway.currency, ctx.order.currency),
    payload = body,
  }
end

function webhook(ctx)
  local payload = json_decode(ctx.request.body or "{}")
  local signature = header(ctx.request.headers, "X-Signature")
  if signature == "" then
    return { status = "rejected", response_status = 400, response_body = "ok" }
  end
  local gateway = nil
  for _, item in ipairs(rows(ctx.settings.gateways)) do
    if value(item.shop_id, "") == value(payload.shop_id, "") then
      gateway = item
      break
    end
  end
  if gateway == nil then
    return { status = "rejected", response_status = 400, response_body = "ok" }
  end
  local expected = parity_signature(payload, value(gateway.secret_key_2, ""))
  if not constant_time_equal(string.lower(expected), string.lower(signature)) then
    return { status = "rejected", response_status = 400, response_body = "ok" }
  end
  if string.upper(value(payload.status, "")) ~= "PAID" then
    return { status = "ignored", response_body = "ok" }
  end
  return {
    status = "paid",
    order_id = value(payload.order_id, value(payload.custom_fields, "")),
    external_id = value(payload.id, ""),
    amount = tonumber(payload.amount),
    currency = value(gateway.currency, "RUB"),
    response_body = "ok",
    payload = payload,
  }
end

function parity_signature(params, secret)
  local keys = {}
  for key, _ in pairs(params or {}) do
    keys[#keys + 1] = key
  end
  table.sort(keys)
  local values = {}
  for _, key in ipairs(keys) do
    values[#values + 1] = stringify(params[key])
  end
  return hmac_sha256_hex(table.concat(values, ""), secret)
end

function stringify(v)
  if v == nil then return "" end
  if type(v) == "boolean" then return v and "1" or "0" end
  if type(v) == "table" then return json_encode(v) end
  return tostring(v)
end

function currency_options()
  return {
    { value = "RUB", label = "RUB" },
    { value = "USD", label = "USD" },
    { value = "EUR", label = "EUR" },
    { value = "UAH", label = "UAH" },
  }
end

function rows(value)
  return type(value) == "table" and value or {}
end

function value(v, fallback)
  local s = tostring(v or "")
  if s == "" then return tostring(fallback or "") end
  return s
end

function header(headers, name)
  local lower = string.lower(name)
  for k, v in pairs(headers or {}) do
    if string.lower(k) == lower then return tostring(v or "") end
  end
  return ""
end

function round2(v)
  return math.floor((tonumber(v) or 0) * 100 + 0.5) / 100
end
