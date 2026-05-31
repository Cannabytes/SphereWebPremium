local PAYMENT_URL = "https://yoomoney.ru/quickpay/confirm.xml"

function meta()
  return {
    name = "YooMoney",
    description = "YooMoney Quickpay с проверкой HTTP-уведомлений.",
    version = "1.0.0",
    author = "SphereWeb3",
    icon = "WalletCards",
    currencies = { "RUB" },
    settings = {
      { key = "receiver", label = "Receiver / номер кошелька", type = "text", required = true },
      { key = "secret_key", label = "Секретный ключ уведомлений", type = "password", required = true, secret = true },
      { key = "payment_type", label = "Тип оплаты", type = "select", default = "AC", options = {
        { value = "AC", label = "Банковская карта" },
        { value = "PC", label = "YooMoney кошелек" },
      }},
    },
    links = {
      { label = "Настройка уведомлений", url = "https://yoomoney.ru/transfer/myservices/http-notification?lang=ru" },
    },
  }
end

function create_payment(ctx)
  local params = {
    receiver = ctx.settings.receiver,
    sum = tostring(ctx.order.amount),
    ["quickpay-form"] = "donate",
    label = ctx.order.public_id,
    paymentType = value(ctx.settings.payment_type, "AC"),
    successURL = ctx.order.success_url,
  }
  return {
    redirect_url = PAYMENT_URL .. "?" .. form_encode(params),
    external_id = ctx.order.public_id,
    amount = ctx.order.amount,
    currency = "RUB",
    payload = params,
  }
end

function webhook(ctx)
  local form = ctx.request.form
  local notification_type = first(form.notification_type)
  if notification_type ~= "card-incoming" and notification_type ~= "p2p-incoming" then
    return { status = "ignored", response_body = "ignored" }
  end
  if not verify_signature(form, value(ctx.settings.secret_key, "")) then
    return { status = "rejected", response_status = 400, response_body = "signature mismatch" }
  end
  local order_id = first(form.label)
  local operation_id = first(form.operation_id)
  local amount = value(first(form.withdraw_amount), first(form.amount))
  if order_id == "" or operation_id == "" or amount == "" then
    return { status = "rejected", response_status = 400, response_body = "wrong input" }
  end
  return {
    status = "paid",
    order_id = order_id,
    external_id = operation_id,
    amount = tonumber(amount),
    currency = "RUB",
    response_body = "YES",
    payload = flatten_form(form),
  }
end

function verify_signature(form, secret)
  local sign = first(form.sign)
  if sign ~= "" then
    local keys = {}
    for key, _ in pairs(form or {}) do
      if key ~= "sign" then
        keys[#keys + 1] = key
      end
    end
    table.sort(keys)
    local parts = {}
    for _, key in ipairs(keys) do
      parts[#parts + 1] = key .. "=" .. raw_url_encode(first(form[key]))
    end
    return constant_time_equal(hmac_sha256_hex(table.concat(parts, "&"), secret), string.lower(sign))
  end

  local sha1_hash = string.lower(first(form.sha1_hash))
  if sha1_hash == "" then
    return false
  end
  local expected = sha1_hex(table.concat({
    first(form.notification_type),
    first(form.operation_id),
    first(form.amount),
    first(form.currency),
    first(form.datetime),
    first(form.sender),
    first(form.codepro),
    secret,
    first(form.label),
  }, "&"))
  return constant_time_equal(expected, sha1_hash)
end

function raw_url_encode(v)
  return string.gsub(url_encode(v), "+", "%%20")
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
