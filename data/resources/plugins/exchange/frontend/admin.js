const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const array = (value) => Array.isArray(value) ? value : []
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const body = (value, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
const itemIcon = (icon) => {
  const value = String(icon ?? '').trim()
  if (!value) return '/images/icon/etc_question_mark_i00.webp'
  if (value.startsWith('/') || value.startsWith('http')) return value
  return `/images/icon/${value}.webp`
}

const GAME_SQL_FIELDS = [
  { key: 'characterById', database: 'game', mode: 'SELECT', params: 'characterId', returns: 'id, account_name, online' },
  { key: 'characterByIdForUpdate', database: 'game', mode: 'SELECT / transaction', params: 'characterId', returns: 'id, account_name, online' },
  { key: 'itemWithVariationByOwner', database: 'game', mode: 'SELECT', params: 'objectId, ownerId', returns: 'item_id, item_type, amount, enchant, augmentation_stat1, augmentation_stat2' },
  { key: 'itemWithVariationByOwnerForUpdate', database: 'game', mode: 'SELECT / transaction', params: 'objectId, ownerId', returns: 'item_id, item_type, amount, enchant, augmentation_stat1, augmentation_stat2' },
  { key: 'freezeItem', database: 'game', mode: 'EXEC / transaction', params: 'lotId, count, objectId, characterId', returns: 'rows_affected = 1' },
  { key: 'restoreItem', database: 'game', mode: 'EXEC / transaction', params: 'originalOwnerId, objectId, lotId', returns: 'rows_affected = 1' },
  { key: 'itemOwnerForUpdate', database: 'game', mode: 'SELECT / transaction', params: 'objectId', returns: 'owner_id' },
  { key: 'deliverItem', database: 'game', mode: 'EXEC / transaction', params: 'characterId, objectId, lotId', returns: 'rows_affected = 1' },
  { key: 'itemOwner', database: 'game', mode: 'SELECT', params: 'objectId', returns: 'owner_id' },
]

export async function mount(ctx) {
  const linkedOrderId = number(String(ctx.path ?? '').match(/^\/orders\/(\d+)/)?.[1])
  const state = {
    view: 'orders',
    dashboard: null,
    orders: [],
    orderCounts: {},
    orderFilter: 'active',
    access: [],
    orderPage: null,
    servers: [],
    selectedServerId: 0,
    pluginSettings: {},
    pluginManifest: {},
    itemInfo: {},
    chatDraft: '',
    chatFiles: [],
    chatSending: false,
    loading: true,
  }
  const request = (path, init) => ctx.request(path, init)
  const t = (key) => String(ctx.translations?.[key] ?? key)
  const darkButton = 'class="exchange-news-button btn-gothic-secondary" data-button-variant="secondary" data-gothic-button="true"'

  const displayGrade = (grade) => {
    const value = String(grade ?? '').trim().toUpperCase()
    return ['', '0', 'NG', 'NO', 'NONE', 'NO GRADE'].includes(value) ? '' : value
  }
  const renderItemName = (name, enchant, grade = '') => `${number(enchant) > 0 ? `<span class="exchange-enchant">+${number(enchant)}</span> ` : ''}${esc(name)}${displayGrade(grade) ? ` <span class="exchange-grade">[${esc(displayGrade(grade))}]</span>` : ''}`
  const augmentationLines = (value) => [...new Set(String(value ?? '').split(/(?:\r?\n|\s+\/\s+)/).map((line) => line.trim()).filter(Boolean))]
  const renderAugmentation = (value) => {
    const lines = augmentationLines(value)
    return lines.length ? `<div class="exchange-augmentation"><small>${esc(t('augmentation'))}</small><div>${lines.map((line) => `<span>${esc(line)}</span>`).join('')}</div></div>` : ''
  }
  const itemMeta = (itemId) => state.itemInfo[number(itemId)] ?? {}
  const itemName = (order) => itemMeta(order.item_id).name || order.item_name || `Item #${order.item_id}`
  const itemImage = (order) => itemIcon(itemMeta(order.item_id).icon || order.item_icon)
  const showQuantity = (order) => String(itemMeta(order.item_id).type ?? '').replace(/[^a-z]/gi, '').toLowerCase() !== 'etcitem'
  const adminUserLink = (id, email, login) => {
    const label = `${String(email ?? '').trim() || '—'} (${String(login ?? '').trim() || '—'})`
    return number(id) > 0 ? `<a class="exchange-order-participant" href="/admin/user/${number(id)}">${esc(label)}</a>` : esc(label)
  }
  const formatChatTime = (value) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value ?? '')
    const parts = Object.fromEntries(new Intl.DateTimeFormat('uk-UA', {
      timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false,
    }).formatToParts(date).map((part) => [part.type, part.value]))
    return `${parts.hour}:${parts.minute} / ${parts.day}.${parts.month}.${parts.year}`
  }
  const formatFileSize = (size) => number(size) >= 1048576 ? `${(number(size) / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.ceil(number(size) / 1024))} KB`
  const lookupItems = async (ids) => {
    const missing = [...new Set(ids.map(number).filter((id) => id > 0 && !state.itemInfo[id]))]
    if (!missing.length) return
    const response = await ctx.coreRequest('/items/lookup', body({ ids: missing }))
    Object.assign(state.itemInfo, response?.items ?? {})
  }

  const loadOrders = async () => {
    if (state.selectedServerId <= 0) { state.orders = []; state.orderCounts = {}; return }
    const response = await request(`/admin/orders?status=${encodeURIComponent(state.orderFilter)}&server=${state.selectedServerId}`)
    state.orders = array(response?.items)
    state.orderCounts = response?.counts ?? {}
    await lookupItems(state.orders.map((order) => order.item_id))
  }

  const load = async () => {
    state.loading = true
    const [servers, plugins] = await Promise.all([
      ctx.coreRequest('/admin/servers'),
      ctx.coreRequest('/admin/plugins'),
    ])
    state.servers = array(servers).filter((server) => server.isActive === true && ['l2jlucera', 'lucera3'].includes(String(server.build || '').trim().toLowerCase()))
    const plugin = array(plugins).find((item) => item?.manifest?.id === 'exchange')
    state.pluginSettings = plugin?.settings ?? {}
    state.pluginManifest = plugin?.manifest ?? {}
    const requestedServerId = number(new URLSearchParams(window.location.search).get('server'))
    state.selectedServerId = state.servers.some((server) => number(server.id) === requestedServerId)
      ? requestedServerId
      : number(state.servers[0]?.id)
    if (state.selectedServerId > 0 && state.selectedServerId !== requestedServerId) {
      const url = new URL(window.location.href)
      url.searchParams.set('server', String(state.selectedServerId))
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    }
    if (state.selectedServerId > 0) {
      const [dashboard] = await Promise.all([
        request(`/admin/dashboard?server=${state.selectedServerId}`),
        loadOrders(),
      ])
      state.dashboard = dashboard
    } else {
      state.dashboard = { stats: {} }
      state.orders = []
      state.orderCounts = {}
    }
    if (linkedOrderId > 0) await openOrder(linkedOrderId)
    state.loading = false
    render()
  }

  const loadAccess = async () => { const response = await request('/admin/access'); state.access = array(response?.items); state.view = 'access'; render() }
  const openOrder = async (id) => {
    if (number(state.orderPage?.order?.id) !== number(id)) {
      state.chatDraft = ''
      state.chatFiles = []
    }
    state.orderPage = await request(`/admin/orders/${id}`)
    state.orders = state.orders.map((order) => number(order.id) === number(id) ? { ...order, unread_count: 0 } : order)
    await lookupItems([state.orderPage.order.item_id])
    state.view = 'orders'
    render()
  }

  const orderFilterTabs = () => {
    const tabs = [
      ['active', 'adminOrdersActive', 'active'],
      ['disputed', 'adminOrdersDisputed', 'disputed'],
      ['completed', 'adminOrdersCompleted', 'completed'],
      ['cancelled', 'adminOrdersCancelled', 'cancelled'],
      ['all', 'adminOrdersAll', 'all_orders'],
    ]
    return `<nav class="exchange-tabs exchange-order-status-tabs">${tabs.map(([value, label, countKey]) => `<button type="button" class="${state.orderFilter === value ? 'active' : ''}" data-order-filter="${value}">${esc(t(label))} (${number(state.orderCounts[countKey])})</button>`).join('')}</nav>`
  }

  const orderList = () => `${orderFilterTabs()}<div class="exchange-admin-orders">${state.orders.map((order) => {
    const unread = number(order.unread_count)
    return `<button type="button" class="exchange-lot exchange-order-card ${order.admin_requested ? 'dispute' : ''} ${unread > 0 ? 'unread' : ''}" data-order="${order.id}">
      <img src="${esc(itemImage(order))}" alt="">
      <div class="exchange-lot-main"><small class="exchange-order-number">${esc(t('orderNumber'))} #${number(order.id)}</small><h3>${renderItemName(itemName(order), order.enchant_level, order.item_grade)}</h3>${renderAugmentation(order.augmentation)}${showQuantity(order) ? `<p class="exchange-lot-quantity">${esc(t('quantity'))}: <strong>${number(order.item_count)}</strong></p>` : ''}<small class="exchange-order-participants">${esc(order.buyer_login)} → ${esc(order.seller_login)}</small></div>
      <div class="exchange-lot-buy"><strong>${number(order.price).toLocaleString()} ${esc(order.currency)}</strong><small>${esc(t(`orderStatus_${order.status}`))}</small>${unread > 0 ? `<span class="exchange-unread-badge">${esc(t('unreadMessages'))}: ${unread}</span>` : ''}</div>
    </button>`
  }).join('') || `<div class="exchange-empty">${esc(t('adminOrdersEmpty'))}</div>`}</div>`

  const renderChatFiles = () => state.chatFiles.length ? `<div class="exchange-chat-files">${state.chatFiles.map((file, index) => `<span><b>${esc(file.name)}</b><small>${formatFileSize(file.size)}</small><button type="button" data-remove-chat-file="${index}" aria-label="${esc(t('removeFile'))}">×</button></span>`).join('')}</div>` : ''

  const addChatFiles = (fileList) => {
    const incoming = Array.from(fileList ?? [])
    const accepted = incoming.filter((file) => /\.(pdf|png|jpe?g|webp|gif)$/i.test(file.name) && file.size > 0 && file.size <= 12 * 1024 * 1024)
    if (accepted.length !== incoming.length) ctx.notify(t('chatFileRejected'), 'error')
    const merged = [...state.chatFiles]
    for (const file of accepted) {
      if (!merged.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) merged.push(file)
    }
    if (merged.length > 5) ctx.notify(t('chatFileLimit'), 'error')
    state.chatFiles = merged.slice(0, 5)
    render()
  }

  const orderPage = () => {
    const { order, messages } = state.orderPage
    const open = ['payment_pending','admin_requested','disputed'].includes(order.status)
    return `<div class="exchange-order-page"><button ${darkButton} data-action="back">← ${esc(t('adminBackToOrders'))}</button>
      <section class="exchange-order-head"><img src="${esc(itemImage(order))}" alt=""><div><span>${esc(t('orderNumber'))} #${number(order.id)}</span><h2>${renderItemName(itemName(order), order.enchant_level, order.item_grade)}</h2>${renderAugmentation(order.augmentation)}${showQuantity(order) ? `<p>${esc(t('quantity'))}: ${number(order.item_count)}</p>` : ''}<p>${esc(t('buyer'))}: ${adminUserLink(order.buyer_user_id, order.buyer_email, order.buyer_login)} · ${esc(t('seller'))}: ${adminUserLink(order.seller_user_id, order.seller_email, order.seller_login)}</p><p>${number(order.price).toLocaleString()} ${esc(order.currency)} · ${esc(t('commission'))} ${number(order.commission_coins)} Donate Coin · ${esc(t(`orderStatus_${order.status}`))}</p></div></section>
      <div class="exchange-chat">${array(messages).map((message) => `${number(message.id) === number(state.orderPage.firstUnreadMessageId) ? `<div class="exchange-new-messages" data-new-message-marker>${esc(t('newMessages'))}</div>` : ''}<article class="exchange-message ${esc(message.sender_kind)}"><header>${esc(message.sender_label)} <time>${esc(formatChatTime(message.created_at))}</time></header>${message.body ? `<p>${esc(message.body)}</p>` : ''}${array(message.attachments).map((file) => `<a href="${esc(file.url)}" target="_blank" rel="noopener">${esc(file.name || t('file'))}</a>`).join('')}</article>`).join('')}</div>
      ${open ? `<form class="exchange-compose" data-form="admin-message"><textarea name="body" maxlength="3000" placeholder="${esc(t('adminMessagePlaceholder'))}">${esc(state.chatDraft)}</textarea><label class="exchange-dropzone" data-chat-dropzone><input name="chat-files" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif" multiple><strong>${esc(t('dropFiles'))}</strong><span>${esc(t('chooseFiles'))}</span></label>${renderChatFiles()}<div class="exchange-compose-actions"><button ${darkButton} type="submit" ${state.chatSending ? 'disabled' : ''}>${esc(t(state.chatSending ? 'sendingMessage' : 'send'))}</button></div></form><div class="exchange-admin-actions"><button ${darkButton} data-action="complete">${esc(t('adminCompleteOrder'))}</button><button ${darkButton} data-action="cancel_refund">${esc(t('adminCancelRefund'))}</button><button ${darkButton} data-tone="danger" data-action="cancel_no_refund">${esc(t('adminCancelNoRefund'))}</button><button ${darkButton} data-action="refund_commission">${esc(t('adminRefundCommission'))}</button><button ${darkButton} data-action="mark_disputed">${esc(t('adminMarkDisputed'))}</button></div>` : `<div class="exchange-closed">${esc(t('orderClosed'))}</div>`}
    </div>`
  }

  const accessPage = () => `<section class="exchange-access"><form data-form="access"><input name="userId" type="number" min="1" placeholder="ID пользователя" required><select name="accessState"><option value="deny">Заблокировать</option><option value="allow">Разрешить</option><option value="inherit">Сбросить</option></select><input name="reason" placeholder="Причина"><input name="expiresAt" type="datetime-local"><button ${darkButton}>Сохранить</button></form><div class="exchange-admin-orders">${state.access.map((item) => `<div class="exchange-order-row"><span><strong>${esc(item.login)} (#${item.user_id})</strong><small>${esc(item.reason || '')}</small></span><b>${esc(item.access_state)}</b></div>`).join('')}</div></section>`

  const serverSettings = () => {
    const options = state.servers.map((server) => `<option value="${number(server.id)}" ${state.selectedServerId === number(server.id) ? 'selected' : ''}>${esc(server.name)} · #${number(server.id)} · ${esc(server.build)} · ${esc(t(server.isActive ? 'adminServerActive' : 'adminServerInactive'))}</option>`).join('')
    return `<section class="exchange-server-settings"><div><h2>${esc(t('adminServerSelection'))}</h2></div>${state.servers.length ? `<div class="exchange-server-select"><select name="serverId">${options}</select></div>` : `<div class="exchange-empty">${esc(t('adminServersEmpty'))}</div>`}</section>`
  }

  const settingLabel = (field) => field?.label?.[ctx.locale] || field?.label?.ru || field?.label?.en || field?.key || ''
  const settingHint = (field) => field?.description?.[ctx.locale] || field?.description?.ru || field?.description?.en || ''
  const settingsFields = () => array(state.pluginManifest.settings).filter((field) => !['serverIds', 'gameSql', 'gameSqlByServer'].includes(field.key))
  const settingsValue = (field) => {
    const value = state.pluginSettings[field.key]
    return field.type === 'json' || field.type === 'localized_text' || field.type === 'localized_richtext'
      ? JSON.stringify(value ?? field.default ?? {}, null, 2)
      : String(value ?? field.default ?? '')
  }
  const currencyRateRow = (currency = '', rate = 1, required = false) => `<div class="exchange-rate-row" data-rate-row><input data-rate-currency value="${esc(String(currency).toUpperCase())}" maxlength="3" placeholder="${esc(t('adminRateCurrency'))}" aria-label="${esc(t('adminRateCurrency'))}" ${required ? 'readonly' : ''}><input data-rate-value type="number" min="0" step="any" value="${esc(rate)}" placeholder="${esc(t('adminRateValue'))}" aria-label="${esc(t('adminRateValue'))}">${required ? '<span class="exchange-rate-required"></span>' : `<button ${darkButton} type="button" data-action="remove-currency-rate" aria-label="${esc(t('adminRateRemove'))}">×</button>`}</div>`
  const currencyRatesControl = (field, label, hint) => {
    const stored = state.pluginSettings[field.key]
    const rates = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : (field.default ?? {})
    const currencies = [...new Set(['USD', 'UAH', 'RUB', ...Object.keys(rates)])]
    return `<section class="exchange-currency-rates exchange-settings-wide"><div><strong>${label}</strong>${hint}</div><div class="exchange-rate-labels"><span>${esc(t('adminRateCurrency'))}</span><span>${esc(t('adminRateValue'))}</span></div><div class="exchange-rate-rows">${currencies.map((currency) => currencyRateRow(currency, rates[currency] ?? 1, ['USD', 'UAH', 'RUB'].includes(currency))).join('')}</div><button ${darkButton} type="button" data-action="add-currency-rate">${esc(t('adminRateAdd'))}</button></section>`
  }
  const settingsControl = (field) => {
    const label = esc(settingLabel(field))
    const hint = settingHint(field) ? `<small>${esc(settingHint(field))}</small>` : ''
    if (field.type === 'boolean') return `<label class="exchange-settings-toggle"><input name="${esc(field.key)}" type="checkbox" ${state.pluginSettings[field.key] ? 'checked' : ''}><span>${label}</span>${hint}</label>`
    if (field.key === 'currencyRatesUSD') return currencyRatesControl(field, label, hint)
    if (field.type === 'select') return `<label class="exchange-settings-field"><span>${label}</span><select name="${esc(field.key)}">${array(field.options).map((option) => `<option value="${esc(option.value)}" ${String(option.value) === settingsValue(field) ? 'selected' : ''}>${esc(option.label?.[ctx.locale] || option.label?.ru || option.label?.en || option.value)}</option>`).join('')}</select>${hint}</label>`
    if (['json', 'localized_text', 'localized_richtext'].includes(field.type)) return `<label class="exchange-settings-field exchange-settings-wide"><span>${label}</span><textarea name="${esc(field.key)}" rows="${field.type === 'localized_richtext' ? 12 : 6}" spellcheck="false">${esc(settingsValue(field))}</textarea>${hint}</label>`
    const type = field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : field.type === 'password' ? 'password' : 'text'
    return `<label class="exchange-settings-field"><span>${label}</span><input name="${esc(field.key)}" type="${type}" value="${esc(settingsValue(field))}">${hint}</label>`
  }
  const settingsPage = () => `<section class="exchange-settings"><header><div><span class="exchange-eyebrow">${esc(t('adminSettings'))}</span><h2>${esc(t('adminSettingsTitle'))}</h2></div></header><form data-form="plugin-settings"><div class="exchange-settings-grid">${settingsFields().map(settingsControl).join('')}</div><div class="exchange-sql-actions"><button ${darkButton} type="submit">${esc(t('adminSettingsSave'))}</button></div></form></section>`

  const sqlSettings = () => {
    if (state.selectedServerId <= 0) return `<div class="exchange-empty">${esc(t('adminServersEmpty'))}</div>`
    const catalogs = state.pluginSettings.gameSqlByServer && typeof state.pluginSettings.gameSqlByServer === 'object' ? state.pluginSettings.gameSqlByServer : {}
    const savedCatalog = catalogs[String(state.selectedServerId)]
    const catalog = savedCatalog && typeof savedCatalog === 'object' ? savedCatalog : (state.pluginSettings.gameSql ?? {})
    return `<section class="exchange-sql-settings"><header><div><span class="exchange-eyebrow">L2jLucera SQL</span><h2>${esc(t('adminSqlTitle'))}</h2><p>${esc(t('adminSqlHint'))}</p></div></header><form data-form="sql-settings"><div class="exchange-sql-grid">${GAME_SQL_FIELDS.map((field) => `<label class="exchange-sql-field"><span><strong>${esc(field.key)}</strong><small>${esc(field.database)} · ${esc(field.mode)}</small></span><textarea name="${esc(field.key)}" rows="5" spellcheck="false" required>${esc(catalog[field.key] || '')}</textarea><small><b>${esc(t('adminSqlParameters'))}:</b> ${esc(field.params)} · <b>${esc(t('adminSqlReturns'))}:</b> ${esc(field.returns)}</small></label>`).join('')}</div><div class="exchange-sql-actions"><button ${darkButton} type="submit">${esc(t('adminSqlSave'))}</button></div></form></section>`
  }

  const render = () => {
    const scrollY = window.scrollY
    const stats = state.dashboard?.stats ?? {}
    ctx.root.innerHTML = `<div class="exchange-app">${serverSettings()}<div class="exchange-kpis"><article><span>Активные лоты</span><strong>${stats.active_lots || 0}</strong></article><article><span>Открытые заказы</span><strong>${stats.open_orders || 0}</strong></article><article class="danger"><span>Споры</span><strong>${stats.disputes || 0}</strong></article><article><span>Продажи</span><strong>${stats.completed_sales || 0}</strong></article></div><nav class="exchange-tabs"><button class="${state.view === 'orders' ? 'active' : ''}" data-view="orders">Заказы</button><button class="${state.view === 'access' ? 'active' : ''}" data-view="access">Доступ пользователей</button><button class="${state.view === 'settings' ? 'active' : ''}" data-view="settings">${esc(t('adminSettings'))}</button><button class="${state.view === 'sql' ? 'active' : ''}" data-view="sql">${esc(t('adminSqlTab'))}</button></nav><main>${state.loading ? '<div class="exchange-loading">Загрузка…</div>' : state.view === 'settings' ? settingsPage() : state.view === 'sql' ? sqlSettings() : state.view === 'access' ? accessPage() : state.orderPage ? orderPage() : orderList()}</main></div>`
    requestAnimationFrame(() => window.scrollTo({ top: scrollY }))
    const chat = ctx.root.querySelector('.exchange-chat')
    if (chat) {
      const marker = chat.querySelector('[data-new-message-marker]')
      chat.scrollTop = marker ? Math.max(0, marker.offsetTop - chat.offsetTop - Math.round(chat.clientHeight / 3)) : chat.scrollHeight
    }
  }

  const click = async (event) => {
    const element = event.target.closest('button')
    if (!element) return
    if (element.dataset.removeChatFile !== undefined) { state.chatFiles.splice(number(element.dataset.removeChatFile), 1); render(); return }
    if (element.dataset.orderFilter) { state.orderFilter = element.dataset.orderFilter; state.loading = true; render(); await loadOrders(); state.loading = false; render(); return }
    if (element.dataset.view === 'orders') { state.orderPage = null; state.view = 'orders'; await loadOrders(); render(); return }
    if (element.dataset.view === 'access') return loadAccess()
    if (element.dataset.view === 'settings') { state.orderPage = null; state.view = 'settings'; render(); return }
    if (element.dataset.view === 'sql') { state.orderPage = null; state.view = 'sql'; render(); return }
    if (element.dataset.order) return openOrder(element.dataset.order)
    const action = element.dataset.action
    if (action === 'add-currency-rate') { element.closest('.exchange-currency-rates')?.querySelector('.exchange-rate-rows')?.insertAdjacentHTML('beforeend', currencyRateRow()); return }
    if (action === 'remove-currency-rate') { element.closest('[data-rate-row]')?.remove(); return }
    if (action === 'back') { state.orderPage = null; await loadOrders(); render(); return }
    if (['complete','cancel_refund','cancel_no_refund','refund_commission','mark_disputed'].includes(action)) {
      if (!confirm(t('adminActionConfirm'))) return
      const reason = action === 'mark_disputed' ? prompt(t('adminDisputeReason')) || '' : ''
      const orderId = state.orderPage.order.id
      await request(`/admin/orders/${orderId}/action`, body({ action, reason }))
      ctx.notify(t('adminOrderUpdated'))
      await loadOrders()
      await openOrder(orderId)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    const data = new FormData(event.target)
    if (event.target.dataset.form === 'sql-settings') {
      const gameSql = Object.fromEntries(GAME_SQL_FIELDS.map((field) => [field.key, String(data.get(field.key) ?? '').trim()]))
      const gameSqlByServer = { ...(state.pluginSettings.gameSqlByServer ?? {}), [String(state.selectedServerId)]: gameSql }
      const { serverIds: _, ...next } = { ...state.pluginSettings, gameSqlByServer }
      await ctx.coreRequest('/admin/plugins/exchange/settings', body(next, 'PUT'))
      state.pluginSettings = next
      ctx.notify(t('adminSqlSaved'))
      render(); return
    }
    if (event.target.dataset.form === 'plugin-settings') {
      const { serverIds: _, ...next } = state.pluginSettings
      for (const field of settingsFields()) {
        const value = data.get(field.key)
        if (field.type === 'boolean') next[field.key] = value === 'on'
        else if (field.key === 'currencyRatesUSD') {
          const rates = {}
          for (const row of event.target.querySelectorAll('[data-rate-row]')) {
            const currency = String(row.querySelector('[data-rate-currency]')?.value ?? '').trim().toUpperCase()
            const rate = Number(row.querySelector('[data-rate-value]')?.value)
            if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(rate) || rate <= 0) { ctx.notify(t('adminRateInvalid'), 'error'); return }
            rates[currency] = rate
          }
          next[field.key] = rates
        }
        else if (field.type === 'number') next[field.key] = number(value)
        else if (['json', 'localized_text', 'localized_richtext'].includes(field.type)) next[field.key] = JSON.parse(String(value ?? '{}'))
        else next[field.key] = String(value ?? '')
      }
      await ctx.coreRequest('/admin/plugins/exchange/settings', body(next, 'PUT'))
      state.pluginSettings = next
      ctx.notify(t('adminSettingsSaved'))
      render(); return
    }
    if (event.target.dataset.form === 'access') {
      await request(`/admin/access/${data.get('userId')}`, body({ accessState: data.get('accessState'), reason: data.get('reason'), expiresAt: data.get('expiresAt') }, 'PUT'))
      ctx.notify('Доступ обновлён'); await loadAccess(); return
    }
    if (event.target.dataset.form === 'admin-message') {
      if (state.chatSending) return
      state.chatDraft = String(data.get('body') ?? '')
      state.chatSending = true
      render()
      try {
        const attachments = await Promise.all(state.chatFiles.map((file) => ctx.upload(file)))
        const orderId = state.orderPage.order.id
        await request(`/admin/orders/${orderId}/messages`, body({ body: state.chatDraft, attachments }))
        state.chatDraft = ''
        state.chatFiles = []
        state.chatSending = false
        await openOrder(orderId)
      } catch (error) {
        state.chatSending = false
        ctx.notify(String(error?.response?.data?.message ?? t('uploadFailed')), 'error')
        render()
      }
    }
  }

  const input = (event) => {
    if (event.target.matches('textarea[name="body"]') && event.target.closest('form[data-form="admin-message"]')) state.chatDraft = event.target.value
  }
  const change = (event) => {
    if (event.target.matches('select[name="serverId"]')) {
      const serverId = number(event.target.value)
      if (serverId > 0 && serverId !== state.selectedServerId) ctx.navigate(`/admin/plugins/exchange?server=${serverId}`)
      return
    }
    if (event.target.matches('input[name="chat-files"]')) addChatFiles(event.target.files)
  }
  const dragover = (event) => {
    const dropzone = event.target.closest?.('[data-chat-dropzone]')
    if (!dropzone) return
    event.preventDefault()
    dropzone.classList.add('dragging')
  }
  const dragleave = (event) => {
    const dropzone = event.target.closest?.('[data-chat-dropzone]')
    if (dropzone && !dropzone.contains(event.relatedTarget)) dropzone.classList.remove('dragging')
  }
  const drop = (event) => {
    const dropzone = event.target.closest?.('[data-chat-dropzone]')
    if (!dropzone) return
    event.preventDefault()
    dropzone.classList.remove('dragging')
    addChatFiles(event.dataTransfer?.files)
  }

  ctx.root.addEventListener('click', click)
  ctx.root.addEventListener('submit', submit)
  ctx.root.addEventListener('input', input)
  ctx.root.addEventListener('change', change)
  ctx.root.addEventListener('dragover', dragover)
  ctx.root.addEventListener('dragleave', dragleave)
  ctx.root.addEventListener('drop', drop)
  const socket = ctx.websocket('plugin-ws/exchange')
  if (socket) socket.onmessage = () => { void (async () => {
    if (state.selectedServerId > 0) state.dashboard = await request(`/admin/dashboard?server=${state.selectedServerId}`)
    if (state.orderPage) await openOrder(state.orderPage.order.id)
    else if (state.view === 'orders') { await loadOrders(); render() }
  })() }
  await load()
  return () => {
    socket?.close()
    ctx.root.removeEventListener('click', click)
    ctx.root.removeEventListener('submit', submit)
    ctx.root.removeEventListener('input', input)
    ctx.root.removeEventListener('change', change)
    ctx.root.removeEventListener('dragover', dragover)
    ctx.root.removeEventListener('dragleave', dragleave)
    ctx.root.removeEventListener('drop', drop)
  }
}
