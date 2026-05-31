local API_CREATE_URL = "https://severpay.io/api/merchant/payin/create"

function meta()
  return {
    name = "SeverPay",
    description = "SeverPay: несколько MID/token записей с выбором валюты.",
    version = "1.0.0",
    author = "SphereWeb3",
    icon = "Receipt",
    currencies = { "RUB", "EUR", "BYN" },
    settings = {
      {
        key = "merchants",
        label = "MID/Token/Currency записи",
        type = "rows",
        required = true,
        columns = {
          { key = "label", label = "Название", type = "text", default = "SeverPay" },
          { key = "mid", label = "MID", type = "number", required = true },
          { key = "token", label = "Token", type = "password", required = true, secret = true },
          { key = "currency", label = "Валюта", type = "select", default = "RUB", options = {
            { value = "RUB", label = "RUB" },
            { value = "EUR", label = "EUR" },
            { value = "BYN", label = "BYN" },
          }},
        },
      },
    },
  }
end

function public(ctx)
  local options = {}
  for i, merchant in ipairs(rows(ctx.settings.merchants)) do
    options[#options + 1] = {
      key = tostring(i),
      label = value(merchant.label, "SeverPay " .. tostring(i)),
      description = "Оплата в " .. value(merchant.currency, "RUB"),
      currency = value(merchant.currency, "RUB"),
      icon = "Receipt",
      payload = { index = i },
    }
  end
  return { options = options }
end

function create_payment(ctx)
  local merchants = rows(ctx.settings.merchants)
  local index = tonumber(value(ctx.payment.option, "1")) or 1
  local merchant = merchants[index] or merchants[1]
  if merchant == nil then
    error("SeverPay не настроен")
  end

  local payload = {
    mid = tonumber(merchant.mid),
    amount = ctx.order.amount,
    currency = value(merchant.currency, ctx.order.currency),
    order_id = ctx.order.public_id,
    client_email = ctx.user.email or "",
    client_id = tostring(ctx.user.id or ""),
    salt = sha256_hex(ctx.order.public_id .. ":" .. tostring(now_unix())),
  }
  payload.sign = hmac_sha256_hex(json_encode(payload), value(merchant.token, ""))

  local response = http_request({
    method = "POST",
    url = API_CREATE_URL,
    headers = { ["Content-Type"] = "application/json" },
    body = json_encode(payload),
    timeout_ms = 30000,
  })
  local body = json_decode(response.body or "{}")
  if response.status ~= 200 or body.status ~= true then
    error("SeverPay API: " .. value(body.msg, response.body))
  end
  local url = body.data and body.data.url or ""
  if url == "" then
    error("SeverPay не вернул ссылку на оплату")
  end
  return {
    redirect_url = url,
    external_id = ctx.order.public_id,
    amount = ctx.order.amount,
    currency = payload.currency,
    payload = body,
  }
end

function webhook(ctx)
  local input = json_decode(ctx.request.body or "{}")
  local input_sign = value(input.sign, "")
  if input_sign == "" then
    return json_fail("Invalid input", 400)
  end
  input.sign = nil

  local matched = nil
  for _, merchant in ipairs(rows(ctx.settings.merchants)) do
    local expected = hmac_sha256_hex(json_encode(input), value(merchant.token, ""))
    if constant_time_equal(expected, input_sign) then
      matched = merchant
      break
    end
  end
  if matched == nil then
    return json_fail("Wrong sign", 400)
  end
  if input.type ~= "payin" then
    return json_fail("Invalid type", 400)
  end
  local data = input.data or {}
  if data.status ~= "success" then
    return json_fail("Payment not successful", 400)
  end
  return {
    status = "paid",
    order_id = value(data.order_id, ""),
    external_id = value(data.id, input_sign),
    amount = tonumber(data.amount),
    currency = value(data.currency, matched.currency),
    response_body = json_encode({ status = true }),
    response_headers = { ["Content-Type"] = "application/json" },
    payload = input,
  }
end

function rows(value)
  return type(value) == "table" and value or {}
end

function value(v, fallback)
  local s = tostring(v or "")
  if s == "" then
    return tostring(fallback or "")
  end
  return s
end

function json_fail(message, status)
  return {
    status = "rejected",
    response_status = status,
    response_body = json_encode({ status = false, msg = message }),
    response_headers = { ["Content-Type"] = "application/json" },
  }
end
