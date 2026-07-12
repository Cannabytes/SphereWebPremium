# SphereWeb3 Plugin SDK v1

Плагины устанавливаются отдельными каталогами в `data/resources/plugins` и подхватываются сервером без пересборки Go или React. Минимальная структура:

```text
my-plugin/
  plugin.json
  backend/main.lua
  migrations/001_init.sql
  frontend/index.js
  frontend/admin.js
  frontend/style.css
  locales/ru.json
  locales/en.json
```

После копирования или изменения каталога нажмите **Админка → Плагины → Перезагрузить**. Перезапуск сервера не нужен; revision автоматически сбрасывает browser cache JS/CSS. Новые SQL-миграции применяются ровно один раз и регистрируются в `plugin_migrations`.

> Плагины являются доверенным кодом администратора. Lua имеет прямой доступ к основной и игровым БД, файловой системе, HTTP и запуску процессов. Устанавливайте плагины только из доверенных источников.

## Manifest

`plugin.json` использует `apiVersion: "1"` и Lua backend:

```json
{
  "id": "my-plugin",
  "name": "My plugin",
  "version": "1.0.0",
  "apiVersion": "1",
  "enabled": true,
  "backend": { "runtime": "lua", "entry": "backend/main.lua" },
  "frontend": {
    "userEntry": "frontend/index.js",
    "adminEntry": "frontend/admin.js",
    "styles": ["frontend/style.css"],
    "userPath": "/plugins/my-plugin",
    "adminPath": "/admin/plugins/my-plugin",
    "title": { "ru": "Мой плагин", "en": "My plugin" },
    "actions": [{
      "id": "open-my-plugin",
      "slot": "dashboard.balance.actions.after",
      "label": { "ru": "Открыть", "en": "Open" },
      "path": "/plugins/my-plugin",
      "requiresLogin": true
    }],
    "menu": [{
      "id": "my-plugin-menu",
      "label": { "ru": "Мой плагин", "en": "My plugin" },
      "path": "/plugins/my-plugin",
      "icon": "Plug",
      "placement": "user",
      "sortOrder": 100,
      "requiresLogin": true,
      "summaryPath": "/summary",
      "summaryField": "openCount"
    }]
  },
  "routes": [
    { "method": "GET", "path": "/state", "handler": "get_state", "access": "user" },
    { "method": "POST", "path": "/admin/run", "handler": "admin_run", "access": "admin" }
  ],
  "jobs": [
    { "name": "maintenance", "handler": "maintenance_job", "everySeconds": 300, "runOnStart": true }
  ],
  "settings": [
    { "key": "enabled", "type": "boolean", "label": { "ru": "Включён" }, "default": true },
    { "key": "limit", "type": "number", "label": { "ru": "Лимит" }, "default": 10 }
  ],
  "locales": ["ru", "en"]
}
```

Поддерживаемые типы настроек: `boolean`, `number`, `text`, `password`, `datetime`, `select`, `json`, `localized_text`, `localized_richtext`. Для `select` задаётся массив `options`. Настройки валидируются ядром, сохраняются в `plugin_settings` и передаются каждому Lua-вызову.

Доступ маршрута: `public`, `user` или `admin`. Если `access` не задан, используется `user`. Параметры вида `/:id` доступны в `request.params`.

`frontend.actions` встраиваются в именованные слоты существующего интерфейса. `frontend.menu` добавляет пункт в user/admin sidebar; `icon` берётся из реестра Lucide, `summaryPath` и `summaryField` включают обновляемый счётчик.

## Lua backend

Каждый обработчик принимает один аргумент:

```lua
function get_state(ctx)
  local request = ctx.request
  local settings = ctx.settings
  local user = request.user

  return {
    body = {
      ok = true,
      user_id = user.id,
      limit = settings.limit,
      query = request.query,
      params = request.params
    }
  }
end
```

`ctx.request` содержит `method`, `path`, `params`, `query`, `headers`, `body`, `user`, `ip`, `user_agent`, `locale`. Для публичного неавторизованного запроса `user == nil`.

Ответ обработчика:

- любое значение — JSON с HTTP 200;
- `{ body = value, status = 201 }` — JSON `value` с заданным статусом;
- `{ body = value, headers = { ["X-Header"] = "value" } }` — дополнительные заголовки.

Время одного Lua-вызова ограничено 30 секундами.

### Основная БД

```lua
local rows = db.query("SELECT id, balance FROM users WHERE id = ?", { user_id })
local result = db.exec("UPDATE users SET balance = balance - ? WHERE id = ?", { amount, user_id })

local value = db.transaction(function(tx)
  local users = tx.query("SELECT balance FROM users WHERE id = ? FOR UPDATE", { user_id })
  tx.exec("UPDATE users SET balance = ? WHERE id = ?", { users[1].balance - amount, user_id })
  return { ok = true }
end)
```

`query` возвращает массив объектов. `exec` возвращает `rows_affected` и `last_insert_id`. Ошибка внутри callback откатывает транзакцию.

### Игровая и login БД

```lua
local build = game_db.build(server_id)
local characters = game_db.query(server_id, "game", "SELECT obj_Id, char_name FROM characters WHERE account_name = ?", { account })
local accounts = game_db.query(server_id, "login", "SELECT login FROM accounts WHERE login = ?", { account })

game_db.transaction(server_id, "game", function(tx)
  local items = tx.query("SELECT * FROM items WHERE object_id = ? FOR UPDATE", { object_id })
  tx.exec("UPDATE items SET owner_id = ? WHERE object_id = ?", { new_owner_id, object_id })
  return { ok = true }
end)

local definitions = item_catalog.lookup(server_id, { item_type_id }, "ru")
local definition = definitions[tostring(item_type_id)]
```

Цель соединения: `game` или `login`. `item_catalog.lookup` возвращает доверенные метаданные серверного XML-каталога, включая `name`, `icon`, `equipmentCategory` и `grade`. Плагин обязан сам проверить поддерживаемый build, владение аккаунтом/персонажем, offline-состояние и повторить критические проверки внутри транзакции.

### Остальные возможности

```lua
log_info("started")
log_error("failed")
local encoded = json_encode({ ok = true })
local decoded = json_decode(encoded)
local timestamp = now_utc()

local response = http_request({
  method = "POST",
  url = "https://example.test/hook",
  headers = { ["Content-Type"] = "application/json" },
  body = encoded
})

fs.write("data/state.json", encoded)       -- относительно каталога плагина
local raw = fs.read("data/state.json")
local files = fs.list("data")
fs.remove("data/state.json")
local process_result = process.run("tool", { "--flag" })

events.publish({ buyer_id, seller_id }, "order.updated", { order_id = order_id })
events.publish_admin("order.updated", { order_id = order_id })
```

Для `fs.*` разрешены и абсолютные пути. `http_request` ограничивает ответ 8 MiB и ждёт не более 20 секунд. `process.run` запускает процесс с рабочим каталогом плагина.

Опциональные lifecycle-функции:

```lua
function validate_settings(ctx)
  local proposed = ctx.request.settings
  if proposed.limit < 1 then error("limit must be positive") end
  return { ok = true }
end

function on_settings_changed(ctx)
  log_info("settings updated")
  return { ok = true }
end
```

## SQL-миграции

Файлы `migrations/*.sql` выполняются в лексикографическом порядке. Имена должны только добавляться (`001_...`, `002_...`): уже применённый файл повторно не запускается. Каждая миграция выполняется транзакционно, насколько это поддерживает используемый MySQL DDL.

Плагин должен использовать уникальный префикс таблиц и индексов. Для денежных операций, предметов и внешних side effects обязательно добавляйте собственный idempotency key/ledger и журнал незавершённых операций: одна SQL-транзакция не может атомарно охватить основную и игровую БД.

## JavaScript frontend

User/admin entry экспортирует `mount` и не требует включения в React build:

```js
export async function mount(context) {
  const { root, request, navigate, notify, websocket, translations } = context
  root.innerHTML = `<button type="button">${translations.open ?? 'Open'}</button>`

  const state = await request('/state')
  const socket = websocket('/api/plugin-ws/my-plugin')
  socket?.addEventListener('message', (event) => console.log(JSON.parse(event.data)))

  const button = root.querySelector('button')
  const onClick = () => navigate('/plugins/my-plugin/details')
  button.addEventListener('click', onClick)

  return () => {
    button.removeEventListener('click', onClick)
    socket?.close()
  }
}
```

Контекст frontend:

- `plugin`, `root`, `path`, `search`, `locale`, `translations`;
- `apiBase`, `assetBase`;
- `request(path, init)` — запрос к `/api/plugins/<id>` с текущей авторизацией;
- `coreRequest(path, init)` — запрос к существующему SphereWeb3 API;
- `upload(file)` — PDF/PNG/JPG/WEBP до 12 MiB;
- `websocket(path)` — авторизованный realtime-канал пользователя (путь задаётся относительно `/api`, например `plugin-ws/my-plugin`);
- `navigate(path)` и `notify(message, tone)`.

Всегда возвращайте cleanup-функцию: host вызывает её при смене языка, маршрута, версии плагина или unmount.

## Локализация и assets

Каждый `locales/<code>.json` — обычный JSON-объект. Host выбирает текущую локаль, затем `ru`, затем `en`. Статические JS/CSS/изображения доступны по `/plugin-assets/<plugin-id>/<relative-path>`.

## Склад и передача предметов

Если плагин добавляет запись в общий `warehouses`, заполните `source_plugin`, уникальный `source_reference` и `metadata_json`. При отправке такой записи персонажу ядро вызывает опциональные Lua-функции:

```lua
function deliver_warehouse_items(ctx)
  -- ctx.request: server_id, email, character_id, character_name, items
  -- Повторно проверить владельца, offline и состояние source_reference.
  -- Действие обязано быть идемпотентным.
  return { character_name = ctx.request.character_name }
end

function warehouse_delivery_status(ctx)
  -- После неопределённого результата сообщить, завершена ли передача.
  return { delivered = false, escrowed = true }
end
```

Plugin warehouse items отправляются по одному и не смешиваются с обычными складскими предметами. При подтверждённой ошибке ядро восстанавливает списание склада; при неопределённом commit не восстанавливает его автоматически, чтобы не создать дубликат.

## Проверка плагина

Для bundled-плагинов добавьте manifest/Lua smoke test в `app/internal/plugins`. Базовые проверки проекта:

```powershell
go test ./app/internal/plugins ./app/internal/auth ./app/internal/admin ./app/internal/http/handler ./app/internal/http/router ./app/internal/dbschema ./app/cmd/server
Set-Location react
npm.cmd run build
```

Плагин `exchange` — рабочий reference: маршруты, настройки, миграции, L2jLucera game DB, ledger, reconciliation jobs, realtime, пользовательский и административный UI.
