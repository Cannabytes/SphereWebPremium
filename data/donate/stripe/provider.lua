local CHECKOUT_SESSION_URL = "https://api.stripe.com/v1/checkout/sessions"

function meta()
  return {
    name = "Stripe",
    description = "Stripe Checkout Session with signed webhook.",
    version = "1.0.0",
    author = "SphereWeb3",
    icon = "CreditCard",
    currencies = { "USD", "EUR", "GBP", "CAD", "AUD", "JPY", "RUB" },
    settings = {
      { key = "secret_key", label = "Secret key", type = "password", required = true, secret = true },
      { key = "publishable_key", label = "Publishable key", type = "text" },
      { key = "webhook_secret_key", label = "Webhook secret", type = "password", required = true, secret = true },
      { key = "currency", label = "Валюта", type = "select", default = "USD", options = stripe_currencies() },
      { key = "payment_methods", label = "Payment methods", type = "text", default = "card", hint = "Через запятую: card,klarna,link,ideal и т.д." },
    },
  }
end

function create_payment(ctx)
  local currency = string.lower(value(ctx.settings.currency, "USD"))
  local amount_cents = math.floor((tonumber(ctx.order.amount) or 0) * 100 + 0.5)
  if amount_cents < 50 then
    error("Минимальная сумма для Stripe: 0.50 " .. string.upper(currency))
  end
  local params = {
    mode = "payment",
    success_url = ctx.order.success_url,
    cancel_url = ctx.order.fail_url,
    ["line_items[0][price_data][currency]"] = currency,
    ["line_items[0][price_data][unit_amount]"] = tostring(amount_cents),
    ["line_items[0][price_data][product_data][name]"] = ctx.order.description,
    ["line_items[0][quantity]"] = "1",
    ["metadata[order_id]"] = ctx.order.public_id,
    ["metadata[user_id]"] = tostring(ctx.user.id or ""),
    ["metadata[coins]"] = tostring(ctx.order.coins or ""),
  }
  local methods = split_methods(ctx.settings.payment_methods)
  for i, method in ipairs(methods) do
    params["payment_method_types[" .. tostring(i - 1) .. "]"] = method
    if method == "wechat_pay" then
      params["payment_method_options[wechat_pay][client]"] = "web"
    end
  end
  local response = http_request({
    method = "POST",
    url = CHECKOUT_SESSION_URL,
    headers = {
      ["Authorization"] = "Bearer " .. value(ctx.settings.secret_key, ""),
      ["Content-Type"] = "application/x-www-form-urlencoded",
    },
    body = form_encode(params),
    timeout_ms = 30000,
  })
  local body = json_decode(response.body or "{}")
  if response.status < 200 or response.status >= 300 or value(body.url, "") == "" then
    error("Stripe API: " .. api_error(body.error, response.body))
  end
  return {
    redirect_url = body.url,
    external_id = value(body.id, ctx.order.public_id),
    amount = (tonumber(body.amount_total) or amount_cents) / 100,
    currency = string.upper(currency),
    payload = body,
  }
end

function webhook(ctx)
  local signature = header(ctx.request.headers, "Stripe-Signature")
  if signature == "" then
    return { status = "rejected", response_status = 400, response_body = "Missing signature" }
  end
  if not verify_stripe_signature(ctx.request.body or "", signature, value(ctx.settings.webhook_secret_key, "")) then
    return { status = "rejected", response_status = 400, response_body = "Invalid signature" }
  end
  local event = json_decode(ctx.request.body or "{}")
  if value(event.type, "") ~= "checkout.session.completed" then
    return { status = "ignored", response_body = "ignored" }
  end
  local session = ((event.data or {}).object or {})
  if value(session.payment_status, "") ~= "paid" then
    return { status = "ignored", response_body = "not_paid" }
  end
  return {
    status = "paid",
    order_id = value((session.metadata or {}).order_id, ""),
    external_id = value(session.id, ""),
    amount = (tonumber(session.amount_total) or 0) / 100,
    currency = string.upper(value(session.currency, value(ctx.settings.currency, "USD"))),
    response_body = "OK",
    payload = session,
  }
end

function verify_stripe_signature(body, header_value, secret)
  local timestamp = ""
  local signatures = {}
  for part in string.gmatch(header_value, "([^,]+)") do
    local k, v = string.match(part, "^%s*([^=]+)=(.*)$")
    if k == "t" then timestamp = v end
    if k == "v1" then signatures[#signatures + 1] = v end
  end
  if timestamp == "" then return false end
  local expected = hmac_sha256_hex(timestamp .. "." .. body, secret)
  for _, sig in ipairs(signatures) do
    if constant_time_equal(expected, sig) then return true end
  end
  return false
end

function split_methods(raw)
  local out = {}
  for part in string.gmatch(value(raw, "card"), "([^,%s;]+)") do
    out[#out + 1] = string.lower(part)
  end
  if #out == 0 then out[1] = "card" end
  return out
end

function stripe_currencies()
  local list = { "USD", "EUR", "GBP", "CAD", "AUD", "JPY", "RUB" }
  local options = {}
  for _, currency in ipairs(list) do
    options[#options + 1] = { value = currency, label = currency }
  end
  return options
end

function api_error(err, fallback)
  if type(err) == "table" then return value(err.message, fallback) end
  return value(err, fallback)
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
