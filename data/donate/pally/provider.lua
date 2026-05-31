local API_CREATE_URL = "https://pal24.pro/api/v1/bill/create"

function meta()
  return {
    name = "Pally",
    description = "Pal24/Pally: карты, СБП и другие способы оплаты.",
    version = "1.0.0",
    author = "SphereWeb3",
    icon = "CreditCard",
    currencies = { "RUB", "USD", "EUR", "UAH" },
    settings = {
      {
        key = "gateways",
        label = "Шлюзы Pally",
        type = "rows",
        required = true,
        hint = "Можно добавить несколько магазинов с разными валютами. Пользователь выберет нужный вариант на странице доната.",
        columns = {
          { key = "label", label = "Название", type = "text", default = "Pally" },
          { key = "shop_id", label = "Shop ID", type = "text", required = true },
          { key = "api_key", label = "API token", type = "password", required = true, secret = true },
          { key = "currency", label = "Валюта", type = "select", default = "RUB", options = currency_options() },
        },
      },
    },
    links = {
      { label = "Документация API", url = "https://pally.info/ru/reference/api" },
    },
  }
end

function public(ctx)
  local options = {}
  for i, gateway in ipairs(rows(ctx.settings.gateways)) do
    options[#options + 1] = {
      key = tostring(i),
      label = value(gateway.label, "Pally " .. tostring(i)),
      description = "Оплата в " .. value(gateway.currency, "RUB"),
      currency = value(gateway.currency, "RUB"),
      icon = "CreditCard",
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
    error("Pally не настроен: добавьте хотя бы один шлюз")
  end

  local currency = value(gateway.currency, ctx.order.currency)
  local payload = {
    amount = ctx.order.amount,
    order_id = ctx.order.public_id,
    type = "normal",
    shop_id = gateway.shop_id,
    custom = tostring(ctx.order.public_id),
    currency_in = currency,
    payer_pays_commission = 1,
    payer_email = ctx.user.email or "",
  }
  local response = http_request({
    method = "POST",
    url = API_CREATE_URL,
    headers = {
      ["Authorization"] = "Bearer " .. value(gateway.api_key, ""),
      ["Content-Type"] = "application/x-www-form-urlencoded",
    },
    body = form_encode(payload),
    timeout_ms = 25000,
  })
  local body = json_decode(response.body or "{}")
  if response.status < 200 or response.status >= 300 or not truthy(body.success) then
    error("Pally API: " .. value(body.message, response.body))
  end
  local url = value(body.link_page_url, "")
  if url == "" then
    error("Pally не вернул ссылку на оплату")
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
  local currency = value(first(form.CurrencyIn), "RUB")
  local signature = upper(first(form.SignatureValue))
  if inv_id == "" or amount == "" or signature == "" then
    return { status = "rejected", response_status = 400, response_body = "wrong input" }
  end

  local matched = false
  for _, gateway in ipairs(rows(ctx.settings.gateways)) do
    local expected = upper(md5_hex(amount .. ":" .. inv_id .. ":" .. value(gateway.api_key, "")))
    if constant_time_equal(expected, signature) then
      matched = true
      break
    end
  end
  if not matched then
    return { status = "rejected", response_status = 400, response_body = "checksum error" }
  end

  return {
    status = "paid",
    order_id = inv_id,
    external_id = inv_id,
    amount = tonumber(amount),
    currency = currency,
    response_body = "YES",
    payload = flatten_form(form),
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

function rows(value)
  return type(value) == "table" and value or {}
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
