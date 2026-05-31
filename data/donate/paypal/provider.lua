local API_URL_LIVE = "https://api-m.paypal.com"
local API_URL_SANDBOX = "https://api-m.sandbox.paypal.com"

function meta()
  return {
    name = "PayPal",
    description = "PayPal Orders API with webhook capture verification.",
    version = "1.0.0",
    author = "SphereWeb3",
    icon = "BadgeDollarSign",
    currencies = { "USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CNY", "INR", "MXN", "BRL", "RUB" },
    settings = {
      {
        key = "accounts",
        label = "Аккаунты PayPal",
        type = "rows",
        required = true,
        columns = {
          { key = "label", label = "Название", type = "text", default = "PayPal" },
          { key = "client_id", label = "Client ID", type = "text", required = true },
          { key = "client_secret", label = "Client Secret", type = "password", required = true, secret = true },
          { key = "mode", label = "Режим", type = "select", default = "LIVE", options = {
            { value = "LIVE", label = "LIVE" },
            { value = "SANDBOX", label = "SANDBOX" },
          }},
          { key = "currency", label = "Валюта", type = "select", default = "USD", options = paypal_currencies() },
        },
      },
    },
  }
end

function public(ctx)
  local options = {}
  for i, account in ipairs(rows(ctx.settings.accounts)) do
    options[#options + 1] = {
      key = tostring(i),
      label = value(account.label, "PayPal " .. tostring(i)),
      description = value(account.mode, "LIVE") .. " · " .. value(account.currency, "USD"),
      currency = value(account.currency, "USD"),
      icon = "BadgeDollarSign",
      badge = value(account.mode, "LIVE"),
      payload = { index = i },
    }
  end
  return { options = options }
end

function create_payment(ctx)
  local accounts = rows(ctx.settings.accounts)
  local index = tonumber(value(ctx.payment.option, "1")) or 1
  local account = accounts[index] or accounts[1]
  if account == nil then
    error("PayPal не настроен")
  end
  local token = paypal_token(account)
  local api_url = paypal_api_url(account)
  local payload = {
    intent = "CAPTURE",
    purchase_units = {
      {
        custom_id = ctx.order.public_id,
        amount = {
          value = money(ctx.order.amount),
          currency_code = value(account.currency, "USD"),
        },
        description = ctx.order.description,
      },
    },
    application_context = {
      return_url = ctx.order.success_url,
      cancel_url = ctx.order.fail_url,
    },
  }
  local response = http_request({
    method = "POST",
    url = api_url .. "/v2/checkout/orders",
    headers = {
      ["Content-Type"] = "application/json",
      ["Authorization"] = "Bearer " .. token,
    },
    body = json_encode(payload),
    timeout_ms = 30000,
  })
  local body = json_decode(response.body or "{}")
  if response.status ~= 201 or body.status ~= "CREATED" then
    error("PayPal API: " .. value(body.message, response.body))
  end
  local order_id = value(body.id, "")
  if order_id == "" then
    error("PayPal не вернул order id")
  end
  local checkout_host = string.upper(value(account.mode, "LIVE")) == "SANDBOX" and "https://www.sandbox.paypal.com" or "https://www.paypal.com"
  return {
    redirect_url = checkout_host .. "/checkoutnow?token=" .. url_encode(order_id),
    external_id = order_id,
    amount = ctx.order.amount,
    currency = value(account.currency, "USD"),
    payload = body,
  }
end

function webhook(ctx)
  local input = json_decode(ctx.request.body or "{}")
  local event_type = value(input.event_type, "")
  if event_type ~= "CHECKOUT.ORDER.APPROVED" and event_type ~= "CHECKOUT.ORDER.COMPLETED" and event_type ~= "PAYMENT.CAPTURE.COMPLETED" then
    return json_ok("Event type not processed", "ignored")
  end
  local resource = input.resource or {}
  local order_id = value(resource.id, "")
  if event_type == "PAYMENT.CAPTURE.COMPLETED" then
    order_id = value(((resource.supplementary_data or {}).related_ids or {}).order_id, order_id)
  end
  if order_id == "" then
    return json_fail("Missing order ID", 400)
  end

  local order_data = nil
  local selected = nil
  for _, account in ipairs(rows(ctx.settings.accounts)) do
    local ok, token = pcall(paypal_token, account)
    if ok and token ~= "" then
      local response = http_request({
        method = "GET",
        url = paypal_api_url(account) .. "/v2/checkout/orders/" .. url_encode(order_id),
        headers = { ["Authorization"] = "Bearer " .. token },
        timeout_ms = 30000,
      })
      if response.status == 200 then
        order_data = json_decode(response.body or "{}")
        selected = account
        break
      end
    end
  end
  if order_data == nil or selected == nil then
    return json_fail("Order not found", 400)
  end
  if order_data.status == "APPROVED" then
    local token = paypal_token(selected)
    local capture_response = http_request({
      method = "POST",
      url = paypal_api_url(selected) .. "/v2/checkout/orders/" .. url_encode(order_id) .. "/capture",
      headers = {
        ["Content-Type"] = "application/json",
        ["Authorization"] = "Bearer " .. token,
      },
      body = "{}",
      timeout_ms = 30000,
    })
    if capture_response.status ~= 201 then
      return json_fail("Capture failed", 400)
    end
    order_data = json_decode(capture_response.body or "{}")
  end
  if order_data.status ~= "COMPLETED" then
    return json_fail("Order status is not completed", 400)
  end
  local unit = (order_data.purchase_units or {})[1] or {}
  local capture = (((unit.payments or {}).captures or {})[1]) or {}
  if value(capture.status, "") ~= "COMPLETED" then
    return json_fail("Invalid payment data", 400)
  end
  local amount = capture.amount or {}
  return {
    status = "paid",
    order_id = value(unit.custom_id, ""),
    external_id = value(capture.id, order_id),
    amount = tonumber(amount.value),
    currency = value(amount.currency_code, value(selected.currency, "USD")),
    response_body = json_encode({ status = true }),
    response_headers = { ["Content-Type"] = "application/json" },
    payload = order_data,
  }
end

function paypal_token(account)
  local response = http_request({
    method = "POST",
    url = paypal_api_url(account) .. "/v1/oauth2/token",
    headers = {
      ["Accept"] = "application/json",
      ["Content-Type"] = "application/x-www-form-urlencoded",
      ["Authorization"] = "Basic " .. base64_encode(value(account.client_id, "") .. ":" .. value(account.client_secret, "")),
    },
    body = "grant_type=client_credentials",
    timeout_ms = 30000,
  })
  local body = json_decode(response.body or "{}")
  if response.status ~= 200 or value(body.access_token, "") == "" then
    error("PayPal token error")
  end
  return body.access_token
end

function paypal_api_url(account)
  return string.upper(value(account.mode, "LIVE")) == "SANDBOX" and API_URL_SANDBOX or API_URL_LIVE
end

function paypal_currencies()
  local list = { "USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CNY", "INR", "MXN", "BRL", "RUB" }
  local options = {}
  for _, currency in ipairs(list) do
    options[#options + 1] = { value = currency, label = currency }
  end
  return options
end

function rows(value)
  return type(value) == "table" and value or {}
end

function value(v, fallback)
  local s = tostring(v or "")
  if s == "" then return tostring(fallback or "") end
  return s
end

function money(v)
  return string.format("%.2f", tonumber(v) or 0)
end

function json_ok(message, status)
  return { status = status or "ignored", response_body = json_encode({ status = true, message = message }), response_headers = { ["Content-Type"] = "application/json" } }
end

function json_fail(message, status)
  return { status = "rejected", response_status = status, response_body = json_encode({ status = false, message = message }), response_headers = { ["Content-Type"] = "application/json" } }
end
