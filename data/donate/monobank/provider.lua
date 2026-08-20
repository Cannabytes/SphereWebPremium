local UAH_CURRENCY_CODE = 980

function meta()
  return {
    name = "monobank",
    description = "Оплата через банки monobank с автоматическим зачислением по комментарию к переводу.",
    version = "1.0.0",
    author = "SphereWeb3",
    icon = "Landmark",
    currencies = { "UAH" },
    settings = {
      {
        key = "webhook_secret",
        label = "Секрет webhook",
        type = "password",
        required = true,
        secret = true,
        placeholder = "Не менее 32 символов: A-Z, a-z, 0-9, _ или -",
        hint = "После сохранения скопируйте webhook URL выше и укажите его в monobank Open API. Секрет защищает webhook, потому что личный Open API не подписывает входящие события.",
      },
      {
        key = "jars",
        label = "Банки monobank",
        type = "rows",
        required = true,
        hint = "Каждая строка становится отдельным способом оплаты на странице доната. Все банки должны быть доступны токену monobank, на котором зарегистрирован webhook.",
        columns = {
          { key = "label", label = "Название", type = "text", required = true, default = "Банка monobank" },
          { key = "jar_url", label = "Ссылка на банку", type = "text", required = true, placeholder = "https://send.monobank.ua/jar/XXXXXXXXXX" },
          { key = "min_amount", label = "Мин. сумма, UAH", type = "number", default = 1 },
          { key = "max_amount", label = "Макс. сумма, UAH", type = "number", default = 0 },
        },
      },
    },
    links = {
      { label = "Документация monobank Open API", url = "https://monobank.ua/api-docs/monobank/kliientski-personalni-dani/post--personal--webhook" },
    },
  }
end

function public(ctx)
  local options = {}
  for index, jar in ipairs(rows(ctx.settings.jars)) do
    if jar_id(jar.jar_url) ~= "" then
      options[#options + 1] = {
        key = tostring(index),
        label = value(jar.label, "Банка monobank " .. tostring(index)),
        description = "Оплата в UAH через monobank",
        currency = "UAH",
        icon = "Landmark",
        minAmount = tonumber(jar.min_amount or 0),
        maxAmount = tonumber(jar.max_amount or 0),
      }
    end
  end
  return {
    notice = "После выбора банки скопируйте уникальный код и вставьте его в комментарий к переводу. Без кода платеж не будет зачислен автоматически.",
    options = options,
  }
end

function create_payment(ctx)
  local jars = rows(ctx.settings.jars)
  local index = tonumber(value(ctx.payment.option, "1")) or 1
  local jar = jars[index]
  local id = jar and jar_id(jar.jar_url) or ""
  if id == "" then error("Выбранная банка monobank не настроена") end

  return {
    redirect_url = jar.jar_url,
    external_id = ctx.order.public_id,
    amount = ctx.order.amount,
    currency = "UAH",
    payload = { jar_id = id, comment = ctx.order.public_id, payment_option = tostring(index) },
  }
end

function webhook(ctx)
  if not webhook_path_matches(ctx.request.path, ctx.settings.webhook_secret) then
    return { status = "rejected", response_status = 404, response_body = "not found" }
  end
  if string.upper(value(ctx.request.method, "")) == "GET" then
    return { status = "ignored", response_status = 200, response_body = "OK" }
  end
  if string.upper(value(ctx.request.method, "")) ~= "POST" then
    return { status = "rejected", response_status = 405, response_body = "method not allowed" }
  end

  local raw = value(ctx.request.body, "")
  if raw == "" then return { status = "rejected", response_status = 400, response_body = "empty body" } end
  local body = json_decode(raw)
  local data = type(body.data) == "table" and body.data or {}
  local item = type(data.statementItem) == "table" and data.statementItem or {}
  local account = value(data.account, "")
  local order_id = trim(value(item.comment, ""))
  local amount = tonumber(item.amount) or 0

  if value(body.type, "") ~= "StatementItem" or account == "" then
    return { status = "ignored", response_status = 200, response_body = "ignored" }
  end
  if not configured_jar(ctx.settings.jars, account) then
    return { status = "ignored", response_status = 200, response_body = "unknown jar" }
  end
  if amount <= 0 or tonumber(item.currencyCode) ~= UAH_CURRENCY_CODE then
    return { status = "ignored", response_status = 200, response_body = "not incoming UAH payment" }
  end
  if not string.match(order_id, "^dn_[a-f0-9]+$") then
    return { status = "ignored", response_status = 200, response_body = "missing donation comment" }
  end

  return {
    status = "paid",
    order_id = order_id,
    external_id = value(item.id, ""),
    amount = amount / 100,
    currency = "UAH",
    response_status = 200,
    response_body = "OK",
    payload = body,
  }
end

function configured_jar(jars, account)
  for _, jar in ipairs(rows(jars)) do
    if jar_id(jar.jar_url) == account then return true end
  end
  return false
end

function webhook_path_matches(path, secret)
  secret = value(secret, "")
  if #secret < 32 or #secret > 128 or not string.match(secret, "^[A-Za-z0-9_-]+$") then return false end
  return constant_time_equal(value(path, ""), "/monobank/webhook/" .. secret)
end

function jar_id(url)
  return string.match(trim(value(url, "")), "^https://send%.monobank%.ua/jar/([A-Za-z0-9_-]+)$") or ""
end

function rows(v)
  return type(v) == "table" and v or {}
end

function trim(v)
  return (tostring(v or ""):gsub("^%s*(.-)%s*$", "%1"))
end

function value(v, fallback)
  local s = tostring(v or "")
  if s == "" then return tostring(fallback or "") end
  return s
end
