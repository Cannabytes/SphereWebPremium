local CREATE_LINK_URL = "https://api.wata.pro/api/h2h/links"
local PUBLIC_KEY_URL = "https://api.wata.pro/api/h2h/public-key"

function meta()
  return {
    name = "Wata",
    description = "Wata H2H links with X-Signature webhook verification.",
    version = "1.0.0",
    author = "SphereWeb3",
    icon = "ShieldCheck",
    currencies = { "RUB" },
    settings = {
      { key = "access_token", label = "Access token", type = "password", required = true, secret = true },
      { key = "currency", label = "Валюта", type = "select", default = "RUB", options = {
        { value = "RUB", label = "RUB" },
      }},
      { key = "verify_signature", label = "Проверять подпись webhook", type = "checkbox", default = true },
    },
  }
end

function create_payment(ctx)
  local currency = value(ctx.settings.currency, "RUB")
  local payload = {
    amount = money(ctx.order.amount),
    currency = currency,
    orderId = ctx.order.public_id,
    successRedirectUrl = ctx.order.success_url,
    failRedirectUrl = ctx.order.fail_url,
  }
  local response = http_request({
    method = "POST",
    url = CREATE_LINK_URL,
    headers = {
      ["Accept"] = "application/json",
      ["Content-Type"] = "application/json",
      ["Authorization"] = "Bearer " .. value(ctx.settings.access_token, ""),
    },
    body = json_encode(payload),
    timeout_ms = 30000,
  })
  local body = json_decode(response.body or "{}")
  if response.status >= 400 then
    error("Wata API: " .. api_error(body.error, value(body.message, response.body)))
  end
  local url = value(body.url, "")
  if url == "" then
    error("Wata не вернул ссылку на оплату")
  end
  return {
    redirect_url = url,
    external_id = ctx.order.public_id,
    amount = ctx.order.amount,
    currency = currency,
    payload = body,
  }
end

function webhook(ctx)
  local raw = ctx.request.body or ""
  if raw == "" then
    return { status = "rejected", response_status = 400, response_body = "empty body" }
  end
  if ctx.settings.verify_signature ~= false then
    local signature = header(ctx.request.headers, "X-Signature")
    if signature == "" then
      return { status = "rejected", response_status = 400, response_body = "missing signature" }
    end
    local public_key = load_public_key()
    if public_key == "" then
      return { status = "rejected", response_status = 500, response_body = "public key error" }
    end
    if not rsa_sha512_verify_base64(raw, signature, public_key) then
      return { status = "rejected", response_status = 400, response_body = "wrong sign" }
    end
  end
  local body = json_decode(raw)
  if value(body.transactionStatus, "") ~= "Paid" then
    return { status = "ignored", response_body = "no paid" }
  end
  return {
    status = "paid",
    order_id = value(body.orderId, ""),
    external_id = value(body.transactionId, ""),
    amount = tonumber(body.amount),
    currency = value(body.currency, value(ctx.settings.currency, "RUB")),
    response_body = "YES",
    payload = body,
  }
end

function load_public_key()
  local response = http_request({
    method = "GET",
    url = PUBLIC_KEY_URL,
    headers = { ["Accept"] = "application/json" },
    timeout_ms = 30000,
  })
  if response.status >= 400 then return "" end
  local body = json_decode(response.body or "{}")
  return value(body.value, "")
end

function header(headers, name)
  local lower = string.lower(name)
  for k, v in pairs(headers or {}) do
    if string.lower(k) == lower then return tostring(v or "") end
  end
  return ""
end

function value(v, fallback)
  local s = tostring(v or "")
  if s == "" then return tostring(fallback or "") end
  return s
end

function money(v)
  return string.format("%.2f", tonumber(v) or 0)
end

function api_error(err, fallback)
  if type(err) == "table" then return value(err.message, fallback) end
  return value(err, fallback)
end
