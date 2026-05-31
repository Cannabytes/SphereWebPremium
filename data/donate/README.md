# Lua-платежки

Каждая платежная система лежит в отдельной папке:

```text
data/donate/<code>/provider.lua
```

`<code>` должен содержать латиницу, цифры, `_` или `-`. Админка сама сканирует `data/donate`, читает `meta()` из каждого `provider.lua` и показывает настройки без изменений Go-кода.

## Готовые провайдеры

В комплекте перенесены:

- `pally`
- `primepayments`
- `severpay`
- `yoomoney`
- `paritypay`
- `paypal`
- `cryptoclaude` (CryptoCloud)
- `betatransfer`
- `wata`
- `palych`
- `stripe`
- `unitpay`

## Обязательные функции

```lua
function meta()
  return {
    name = "UnitPay",
    description = "Оплата картой",
    version = "1.0.0",
    settings = {
      { key = "secret_key", label = "Secret key", type = "password", required = true, secret = true },
      { key = "currency", label = "Валюта", type = "select", default = "RUB", options = {
        { value = "RUB", label = "RUB" },
        { value = "USD", label = "USD" },
      }},
      { key = "gateways", label = "Магазины", type = "rows", required = true, columns = {
        { key = "label", label = "Название", type = "text", required = true },
        { key = "shop_id", label = "Shop ID", type = "text", required = true },
        { key = "api_key", label = "API key", type = "password", required = true, secret = true },
      }},
    },
  }
end

function create_payment(ctx)
  return {
    redirect_url = "https://pay.example.com/...",
    external_id = ctx.order.public_id,
  }
end

function webhook(ctx)
  return {
    status = "paid",
    order_id = "dn_xxx",
    external_id = "provider_invoice_id",
    amount = 100,
    currency = "RUB",
    response_body = "OK",
  }
end
```

## Публичная конфигурация

`public(ctx)` необязателен. Он нужен, когда у платежки есть публичный выбор способа оплаты: несколько магазинов, методы карты/СБП/крипта и т.п.

```lua
function public(ctx)
  return {
    notice = "Выберите удобный способ оплаты.",
    options = {
      { key = "card", label = "Банковская карта", currency = "RUB", badge = "рекомендуется" },
      { key = "crypto", label = "Криптовалюта", currency = "USD" },
    },
  }
end
```

Выбранный пользователем способ приходит в `create_payment(ctx)`:

```lua
local option = ctx.payment.option
local options = ctx.payment.options
```

## Контекст create_payment

- `ctx.settings` — настройки из админки.
- `ctx.user` — `id`, `login`, `email`.
- `ctx.order` — `id`, `public_id`, `coins`, `amount`, `currency`, `success_url`, `fail_url`, `return_url`.
- `ctx.payment.option` — выбранный публичный вариант оплаты.
- `ctx.provider.webhook_url` — URL webhook для платежки.
- `ctx.request` — IP, headers, query, body.

## Контекст webhook

- `ctx.settings` — настройки из админки.
- `ctx.request.body` — сырой body.
- `ctx.request.query` и `ctx.request.form` — параметры как массивы строк.
- `ctx.request.headers` — HTTP-заголовки.

Go зачисляет пользователю монеты только после `status = "paid"` и ищет заказ по `order_id` или `external_id`. Повторный webhook по уже успешному заказу не начисляет баланс второй раз.

## Доступные helpers

- `json_encode(value)`, `json_decode(text)`
- `hmac_sha256_hex(message, key)`, `hmac_sha256_base64url(message, key)`
- `sha256_hex(message)`, `sha1_hex(message)`, `md5_hex(message)`
- `constant_time_equal(a, b)`
- `base64_encode(text)`, `base64_decode(text)`, `base64url_decode(text)`
- `url_encode(text)`, `form_encode(table)`
- `rsa_sha512_verify_base64(message, signatureBase64, publicKeyPEM)`
- `http_request({ method = "POST", url = "...", headers = {}, body = "..." })`
- `now_unix()`
