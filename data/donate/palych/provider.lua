local API_CREATE_URL = "https://pal24.pro/api/v1/bill/create"

function meta()
  return {
    name = "Палыч",
    description = "PayPalych/Pal24: быстрые платежи картой и СБП.",
    version = "1.0.0",
    author = "SphereWeb3",
    icon = "Landmark",
    currencies = { "RUB" },
    settings = {
      { key = "shop_id", label = "Shop ID", type = "text", required = true },
      { key = "api_token", label = "API token", type = "password", required = true, secret = true },
      { key = "signature_token", label = "Webhook token", type = "password", secret = true, hint = "Если не заполнен, для подписи webhook используется API token." },
      { key = "currency", label = "Валюта", type = "select", default = "RUB", options = {
        { value = "RUB", label = "RUB" },
      }},
    },
    links = {
      { label = "Документация API", url = "https://pally.info/ru/reference/api" },
    },
  }
end

function public(ctx)
  return {
    options = {
      { key = "default", label = "Палыч", description = "Оплата в " .. value(ctx.settings.currency, "RUB"), currency = value(ctx.settings.currency, "RUB"), icon = "Landmark" },
    },
  }
end

function create_payment(ctx)
  local currency = value(ctx.settings.currency, ctx.order.currency)
  local payload = {
    amount = ctx.order.amount,
    order_id = ctx.order.public_id,
    type = "normal",
    shop_id = ctx.settings.shop_id,
    custom = ctx.order.public_id,
    currency_in = currency,
    payer_pays_commission = 1,
    payer_email = ctx.user.email or "",
  }
  local response = http_request({
    method = "POST",
    url = API_CREATE_URL,
    headers = {
      ["Authorization"] = "Bearer " .. value(ctx.settings.api_token, ""),
      ["Content-Type"] = "application/x-www-form-urlencoded",
    },
    body = form_encode(payload),
    timeout_ms = 25000,
  })
  local body = json_decode(response.body or "{}")
  if response.status < 200 or response.status >= 300 or not truthy(body.success) then
    error("Палыч API: " .. value(body.message, response.body))
  end
  local url = value(body.link_page_url, "")
  if url == "" then
    error("Палыч не вернул ссылку на оплату")
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
  local form = ctx.request.form
  if upper(first(form.Status)) ~= "SUCCESS" then
    return { status = "ignored", response_body = "Status no success" }
  end
  local inv_id = first(form.InvId)
  local amount = first(form.OutSum)
  local signature = upper(first(form.SignatureValue))
  local token = value(ctx.settings.signature_token, ctx.settings.api_token)
  if inv_id == "" or amount == "" or signature == "" then
    return { status = "rejected", response_status = 400, response_body = "wrong input" }
  end
  local expected = upper(md5_hex(amount .. ":" .. inv_id .. ":" .. token))
  if not constant_time_equal(expected, signature) then
    return { status = "rejected", response_status = 400, response_body = "checksum error" }
  end
  return {
    status = "paid",
    order_id = inv_id,
    external_id = inv_id,
    amount = tonumber(amount),
    currency = value(first(form.CurrencyIn), value(ctx.settings.currency, "RUB")),
    response_body = "YES",
    payload = flatten_form(form),
  }
end

function first(values)
  if type(values) == "table" then
    return tostring(values[1] or "")
  end
  return tostring(values or "")
end

function value(v, fallback)
  local s = tostring(v or "")
  if s == "" then
    return tostring(fallback or "")
  end
  return s
end

function truthy(v)
  return v == true or v == 1 or v == "1" or v == "true"
end

function upper(v)
  return string.upper(tostring(v or ""))
end

function flatten_form(form)
  local out = {}
  for k, v in pairs(form or {}) do
    out[k] = first(v)
  end
  return out
end
