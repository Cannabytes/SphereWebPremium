local API_INVOICE_CREATE_URL = "https://api.cryptocloud.plus/v2/invoice/create"
local API_INVOICE_INFO_URL = "https://api.cryptocloud.plus/v2/invoice/merchant/info"

function meta()
  return {
    name = "CryptoCloud",
    description = "CryptoCloud invoice API for crypto payments.",
    version = "1.0.0",
    author = "SphereWeb3",
    icon = "Bitcoin",
    currencies = { "USD", "USDT", "EUR", "RUB" },
    settings = {
      { key = "shop_id", label = "Shop ID", type = "text", required = true },
      { key = "api_key", label = "API key", type = "password", required = true, secret = true },
      { key = "secret_key", label = "Webhook secret key", type = "password", required = true, secret = true },
      { key = "currency", label = "Валюта счета", type = "select", default = "USD", options = {
        { value = "USD", label = "USD" },
        { value = "USDT", label = "USDT" },
        { value = "EUR", label = "EUR" },
        { value = "RUB", label = "RUB" },
      }},
    },
  }
end

function create_payment(ctx)
  local currency = value(ctx.settings.currency, "USD")
  local payload = {
    shop_id = ctx.settings.shop_id,
    amount = ctx.order.amount,
    order_id = ctx.order.public_id,
    currency = currency,
    email = ctx.user.email or "",
  }
  local response = api_post(ctx, API_INVOICE_CREATE_URL, payload)
  if value(response.status, "fail") ~= "success" then
    error("CryptoCloud API: " .. value(response.msg, value(response.detail, value(response.message, "Unknown error"))))
  end
  local result = response.result or {}
  local url = value(result.link, "")
  if url == "" then
    error("CryptoCloud не вернул ссылку на оплату")
  end
  return {
    redirect_url = url,
    external_id = value(result.uuid, ctx.order.public_id),
    amount = ctx.order.amount,
    currency = currency,
    payload = response,
  }
end

function webhook(ctx)
  local body = json_decode(ctx.request.body or "{}")
  local token = value(first(ctx.request.form.token), value(first(ctx.request.query.token), value(body.token, "")))
  if token == "" or not verify_jwt(token, value(ctx.settings.secret_key, "")) then
    return { status = "rejected", response_status = 400, response_body = "Bad sign" }
  end
  local jwt_payload = decode_jwt_payload(token)
  local invoice_id = value(first(ctx.request.form.invoice_id), value(first(ctx.request.query.invoice_id), value(body.invoice_id, value(jwt_payload.invoice_id, value(jwt_payload.uuid, "")))))
  if invoice_id == "" then
    return { status = "rejected", response_status = 400, response_body = "No invoice id" }
  end
  local response = api_post(ctx, API_INVOICE_INFO_URL, { uuids = { invoice_id } })
  local invoice = (response.result or {})[1] or {}
  if value(response.status, "fail") ~= "success" or value(invoice.status, "") ~= "paid" then
    return { status = "rejected", response_status = 400, response_body = "Not paid" }
  end
  local currency = value(invoice.currency, value(ctx.settings.currency, "USD"))
  if currency == "USDT" then currency = "USD" end
  return {
    status = "paid",
    order_id = value(invoice.order_id, ""),
    external_id = invoice_id,
    amount = tonumber(value(invoice.amount_usd, invoice.amount)),
    currency = currency,
    response_body = "OK",
    payload = invoice,
  }
end

function api_post(ctx, url, payload)
  local response = http_request({
    method = "POST",
    url = url,
    headers = {
      ["Authorization"] = "Token " .. value(ctx.settings.api_key, ""),
      ["Content-Type"] = "application/json",
    },
    body = json_encode(payload),
    timeout_ms = 30000,
  })
  local body = json_decode(response.body or "{}")
  body.http_code = response.status
  return body
end

function verify_jwt(token, secret)
  local parts = split(token, ".")
  if #parts ~= 3 then return false end
  local expected = hmac_sha256_base64url(parts[1] .. "." .. parts[2], secret)
  return constant_time_equal(expected, parts[3])
end

function decode_jwt_payload(token)
  local parts = split(token, ".")
  if #parts ~= 3 then return {} end
  local ok, decoded = pcall(base64url_decode, parts[2])
  if not ok then return {} end
  local ok_json, payload = pcall(json_decode, decoded)
  if not ok_json then return {} end
  return payload or {}
end

function split(value, sep)
  local out = {}
  for part in string.gmatch(value, "([^" .. sep .. "]+)") do
    out[#out + 1] = part
  end
  return out
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
