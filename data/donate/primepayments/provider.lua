local API_URL = "https://pay.primepayments.io/API/v2/"

function meta()
  return {
    name = "PrimePayments",
    description = "PrimePayments: агрегатор платежей с callback-подтверждением.",
    version = "1.0.0",
    author = "SphereWeb3",
    icon = "BadgeDollarSign",
    currencies = { "RUB" },
    settings = {
      { key = "project_id", label = "Project ID", type = "text", required = true },
      { key = "secret_1", label = "Secret 1", type = "password", required = true, secret = true },
      { key = "secret_2", label = "Secret 2", type = "password", required = true, secret = true },
      { key = "pay_way", label = "Pay way", type = "text", default = "1", hint = "Код способа оплаты PrimePayments. По умолчанию 1." },
    },
  }
end

function create_payment(ctx)
  local currency = "RUB"
  local data = {
    action = "initPayment",
    project = ctx.settings.project_id,
    sum = ctx.order.amount,
    currency = currency,
    innerID = ctx.order.public_id,
    payWay = value(ctx.settings.pay_way, "1"),
    email = ctx.user.email or "",
    returnLink = 1,
  }
  data.sign = md5_hex(value(ctx.settings.secret_1, "") .. data.action .. data.project .. tostring(data.sum) .. data.currency .. data.innerID .. data.email .. data.payWay)

  local response = http_request({
    method = "POST",
    url = API_URL,
    headers = { ["Content-Type"] = "application/x-www-form-urlencoded" },
    body = form_encode(data),
    timeout_ms = 30000,
  })
  local body = json_decode(response.body or "{}")
  if body.status ~= "OK" or value(body.result, "") == "" then
    error("PrimePayments API: " .. value(body.result, response.body))
  end
  return {
    redirect_url = body.result,
    external_id = ctx.order.public_id,
    amount = ctx.order.amount,
    currency = currency,
    payload = body,
  }
end

function webhook(ctx)
  local form = ctx.request.form
  local required = { "orderID", "payWay", "innerID", "sum", "webmaster_profit", "sign", "currency" }
  for _, key in ipairs(required) do
    if first(form[key]) == "" then
      return { status = "rejected", response_status = 400, response_body = "wrong input" }
    end
  end
  local expected = md5_hex(value(ctx.settings.secret_2, "")
    .. first(form.orderID)
    .. first(form.payWay)
    .. first(form.innerID)
    .. first(form.sum)
    .. first(form.webmaster_profit))
  if not constant_time_equal(expected, first(form.sign)) then
    return { status = "rejected", response_status = 400, response_body = "wrong sign" }
  end
  return {
    status = "paid",
    order_id = first(form.innerID),
    external_id = first(form.orderID),
    amount = tonumber(first(form.sum)),
    currency = first(form.currency),
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

function flatten_form(form)
  local out = {}
  for k, v in pairs(form or {}) do
    out[k] = first(v)
  end
  return out
end
