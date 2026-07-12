const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const array = (value) => Array.isArray(value) ? value : []
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0

const itemIcon = (icon) => {
  const value = String(icon ?? '').trim()
  if (!value) return '/images/icon/etc_question_mark_i00.webp'
  if (value.startsWith('/') || value.startsWith('http')) return value
  return `/images/icon/${value}.webp`
}

const apiBody = (value, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })

export async function mount(ctx) {
  const routePath = `/${String(ctx.path ?? '').replace(/^\/+|\/+$/g, '')}`
  const linkedOrderId = number(routePath.match(/^\/orders\/(\d+)$/)?.[1])
  const initialView = routePath === '/my-lots' ? 'my-lots' : routePath === '/orders' || linkedOrderId > 0 ? 'orders' : 'catalog'
  const state = {
    view: initialView,
    market: null,
    coin: null,
    summary: { openOrders: 0, myLots: 0, unreadMessages: 0 },
    lots: [],
    myLots: [],
    myLotsFilter: 'selling',
    orders: [],
    orderPage: null,
    itemInfo: {},
    augmentationOptions: {},
    filters: { search: '', category: 'all', grade: 'all', minPrice: '', maxPrice: '', minRating: '', enchanted: false },
    modal: null,
    loading: true,
    orderSubmitting: false,
    chatDraft: '',
    chatFiles: [],
    chatSending: false,
    linkedOrderOpened: false,
  }
  const t = (key) => String(ctx.translations?.[key] ?? key)
  const exchangePath = (path = '') => `/plugins/${encodeURIComponent(ctx.plugin.id)}${path}`
  const navigateTo = (path = '') => ctx.navigate(exchangePath(path))
  const darkButton = 'class="exchange-news-button btn-gothic-secondary" data-button-variant="secondary" data-gothic-button="true"'
  const dangerButton = 'class="exchange-place-lot-button btn-gothic-danger" data-button-variant="danger" data-gothic-button="true"'
  const modalHost = document.createElement('div')
  modalHost.className = 'exchange-modal-host'
  document.body.appendChild(modalHost)

  const request = async (path, init) => {
    try {
      return await ctx.request(path, init)
    } catch (error) {
      const code = String(error?.response?.data?.code ?? '')
      const translationKey = ({
        insufficient_balance: 'insufficientBalance',
        lot_unavailable: 'lotUnavailable',
        own_lot: 'ownLot',
        order_failed: 'orderFailed',
        plugin_error: 'requestFailed',
      })[code]
      ctx.notify(translationKey ? t(translationKey) : (error instanceof Error ? error.message : t('requestFailed')), 'error')
      throw error
    }
  }

  const lookupItems = async (ids) => {
    const unique = [...new Set(ids.map(Number).filter((id) => id > 0 && !state.itemInfo[id]))]
    if (!unique.length) return
    const response = await ctx.coreRequest('/items/lookup', apiBody({ ids: unique }, 'POST'))
    Object.assign(state.itemInfo, response?.items ?? {})
  }

  const itemMeta = (itemId) => state.itemInfo[itemId] ?? {}
  const itemName = (lot) => itemMeta(number(lot.item_id)).name || lot.item_name || `Item #${lot.item_id}`
  const itemImage = (lot) => itemIcon(itemMeta(number(lot.item_id)).icon || lot.item_icon)
  const displayGrade = (grade) => {
    const value = String(grade ?? '').trim().toUpperCase()
    return ['', '0', 'NG', 'NO', 'NONE', 'NO GRADE'].includes(value) ? '' : value
  }
  const renderItemName = (name, enchant, grade = '') => `${number(enchant) > 0 ? `<span class="exchange-enchant">+${number(enchant)}</span> ` : ''}${esc(name)}${displayGrade(grade) ? ` <span class="exchange-grade">[${esc(displayGrade(grade))}]</span>` : ''}`
  const augmentationLines = (value) => [...new Set(String(value ?? '').split(/(?:\r?\n|\s+\/\s+)/).map((line) => line.trim()).filter(Boolean))]
  const renderAugmentation = (value) => {
    const lines = augmentationLines(value)
    if (!lines.length) return ''
    return `<div class="exchange-augmentation"><small>${esc(t('augmentation'))}</small><div>${lines.map((line) => `<span>${esc(line)}</span>`).join('')}</div></div>`
  }
  const showLotQuantity = (lot) => String(itemMeta(number(lot.item_id)).type ?? '').replace(/[^a-z]/gi, '').toLowerCase() !== 'etcitem'
  const formatChatTime = (value) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value ?? '')
    const parts = Object.fromEntries(new Intl.DateTimeFormat('uk-UA', {
      timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false,
    }).formatToParts(date).map((part) => [part.type, part.value]))
    return `${parts.hour}:${parts.minute} / ${parts.day}.${parts.month}.${parts.year}`
  }
  const formatFileSize = (size) => number(size) >= 1048576 ? `${(number(size) / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.ceil(number(size) / 1024))} KB`
  const itemAugmentation = (item) => {
    const category = String(itemMeta(number(item?.item_type)).equipmentCategory ?? '').toLowerCase()
    if (category !== 'weapon' && category !== 'jewelry') return ''
    const descriptions = [item?.augmentation_stat1, item?.augmentation_stat2]
      .map(number)
      .filter((id) => id > 0)
      .flatMap((id) => array(state.augmentationOptions[String(id)]))
      .map((description) => String(description ?? '').trim())
      .filter(Boolean)
    return [...new Set(descriptions)].join('\n')
  }
  const commissionForUSD = (normalizedUSD) => state.market?.commission?.mode === 'fixed'
    ? number(state.market.commission.fixed)
    : Math.max(number(state.market?.commission?.minimum), Math.ceil(number(normalizedUSD) * number(state.market?.commission?.percent) / 100))
  const commissionForLot = (lot) => commissionForUSD(lot.normalized_usd)
  const commissionForPrice = (price, currency) => commissionForUSD(number(price) * number(state.market?.rates?.[currency]))

  const loadMarket = async () => {
    const [market, summary, donatePage] = await Promise.all([request('/state'), request('/summary'), ctx.coreRequest('/donate/page')])
    state.market = market
    state.summary = summary ?? state.summary
    state.coin = donatePage?.coin ?? null
    if (state.market.enabled && state.market.rulesAccepted) await loadCurrentRoute()
    state.loading = false
    render()
  }

  const loadCatalog = async () => {
    const params = new URLSearchParams()
    Object.entries(state.filters).forEach(([key, value]) => value !== '' && value !== false && value !== 'all' && params.set(key, String(value)))
    const response = await request(`/lots?${params.toString()}`)
    state.lots = array(response?.items)
    await lookupItems(state.lots.map((lot) => lot.item_id))
  }

  const loadMyLots = async () => {
    const response = await request('/my-lots')
    state.myLots = array(response?.items)
    await lookupItems(state.myLots.map((lot) => lot.item_id))
  }

  const loadOrders = async () => {
    const response = await request('/orders')
    state.orders = array(response?.items)
    await lookupItems(state.orders.map((order) => order.item_id))
  }

  const loadCurrentRoute = async () => {
    if (linkedOrderId > 0) {
      state.linkedOrderOpened = true
      await loadOrders()
      await openOrder(linkedOrderId)
    } else if (state.view === 'my-lots') {
      await loadMyLots()
    } else if (state.view === 'orders') {
      await loadOrders()
    } else {
      await loadCatalog()
    }
  }

  const switchView = (view) => navigateTo({ catalog: '', 'my-lots': '/my-lots', orders: '/orders' }[view] ?? '')

  const renderHeader = () => `
    <header class="exchange-hero">
      <div><h1>${esc(t('title'))}</h1><button type="button" class="exchange-rules-link" data-action="view-rules">${esc(t('subtitle'))}</button></div>
    </header>
    <nav class="exchange-tabs">
      <a href="${exchangePath()}" class="${state.view === 'catalog' ? 'active' : ''}" data-view="catalog">${esc(t('catalog'))}</a>
      <a href="${exchangePath('/my-lots')}" class="${state.view === 'my-lots' ? 'active' : ''}" data-view="my-lots">${esc(t('myLots'))} (${number(state.summary.myLots)})</a>
      <a href="${exchangePath('/orders')}" class="${state.view === 'orders' ? 'active' : ''} ${number(state.summary.unreadMessages) > 0 ? 'exchange-tab-unread' : ''}" data-view="orders">${esc(t('orders'))} (${number(state.summary.openOrders)})${number(state.summary.unreadMessages) > 0 ? `<span>${number(state.summary.unreadMessages)}</span>` : ''}</a>
      <button ${dangerButton} data-action="place-lot">${esc(t('placeLot'))}</button>
    </nav>`

  const renderFilters = () => `
    <form class="exchange-filters" data-form="filters">
      <input name="search" value="${esc(state.filters.search)}" placeholder="${esc(t('search'))}">
      <select name="category"><option value="all">Все типы</option><option value="weapon">Оружие</option><option value="armor">Броня</option><option value="jewelry">Бижутерия</option></select>
      <select name="grade"><option value="all">Все грейды</option>${['NG','D','C','B','A','S','S80','S84'].map((grade) => `<option value="${grade}">${grade}</option>`).join('')}</select>
      <input name="minPrice" type="number" min="0" step="0.01" value="${esc(state.filters.minPrice)}" placeholder="Цена от, USD">
      <input name="maxPrice" type="number" min="0" step="0.01" value="${esc(state.filters.maxPrice)}" placeholder="Цена до, USD">
      <input name="minRating" type="number" min="0" value="${esc(state.filters.minRating)}" placeholder="Продаж от">
      <label class="exchange-check"><input name="enchanted" type="checkbox" ${state.filters.enchanted ? 'checked' : ''}> Только заточенные</label>
      <button ${darkButton} type="submit">Применить</button>
    </form>`

  const renderLot = (lot, mine = false) => `
    <article class="exchange-lot">
      <img src="${esc(itemImage(lot))}" alt="">
      <div class="exchange-lot-main"><h3>${renderItemName(itemName(lot), lot.enchant_level, lot.item_grade)}</h3>
        ${renderAugmentation(lot.augmentation)}
        ${showLotQuantity(lot) ? `<p class="exchange-lot-quantity">${esc(t('quantity'))}: <strong>${number(lot.item_count)}</strong></p>` : ''}
      </div>
      <div class="exchange-lot-buy"><strong>${number(lot.price).toLocaleString()} ${esc(lot.currency)}</strong>
        ${mine ? (lot.status === 'active' ? `<button ${darkButton} data-tone="danger" data-cancel-lot="${lot.id}">${esc(t('cancel'))}</button>` : '') : `<button class="exchange-order-button btn-gothic-secondary" data-button-variant="secondary" data-gothic-button="true" data-order-lot="${lot.id}"><span>${esc(t('order'))}</span>${state.coin?.webUrl ? `<img src="${esc(state.coin.webUrl)}" alt="">` : ''}<b>${commissionForLot(lot)}</b></button>`}
      </div>
    </article>`

  const renderCatalog = () => `${renderFilters()}<div class="exchange-grid">${state.lots.map((lot) => renderLot(lot)).join('') || `<div class="exchange-empty">${esc(t('empty'))}</div>`}</div>`
  const myLotFilters = [
    ['selling', 'myLotsSelling', (lot) => lot.status === 'active'],
    ['processing', 'myLotsProcessing', (lot) => ['freezing', 'ordered', 'cancelling'].includes(lot.status)],
    ['sold', 'myLotsSold', (lot) => lot.status === 'completed'],
    ['cancelled', 'myLotsCancelled', (lot) => lot.status === 'cancelled'],
    ['failed', 'myLotsFailed', (lot) => lot.status === 'freeze_failed'],
  ]

  const renderMyLots = () => {
    const activeFilter = myLotFilters.find(([value]) => value === state.myLotsFilter) ?? myLotFilters[0]
    const lots = state.myLots.filter(activeFilter[2])
    return `<nav class="exchange-tabs exchange-order-status-tabs">${myLotFilters.map(([value, label, matches]) => `<button type="button" class="${state.myLotsFilter === value ? 'active' : ''}" data-my-lots-filter="${value}">${esc(t(label))} (${state.myLots.filter(matches).length})</button>`).join('')}</nav><div class="exchange-grid">${lots.map((lot) => renderLot(lot, true)).join('') || `<div class="exchange-empty">${esc(t('empty'))}</div>`}</div>`
  }

  const renderOrders = () => {
    if (state.orderPage) return renderOrderPage()
    return `<div class="exchange-orders">${state.orders.map((order) => {
      const unread = number(order.unread_count)
      return `<a href="${exchangePath(`/orders/${number(order.id)}`)}" class="exchange-lot exchange-order-card ${unread > 0 ? 'unread' : ''}" data-open-order="${order.id}">
        <img src="${esc(itemImage(order))}" alt="">
        <div class="exchange-lot-main"><small class="exchange-order-number">${esc(t('orderNumber'))} #${number(order.id)}</small><h3>${renderItemName(order.item_name, order.enchant_level, order.item_grade)}</h3>
          ${renderAugmentation(order.augmentation)}
          ${showLotQuantity(order) ? `<p class="exchange-lot-quantity">${esc(t('quantity'))}: <strong>${number(order.item_count)}</strong></p>` : ''}
        </div>
        <div class="exchange-lot-buy"><strong>${number(order.price).toLocaleString()} ${esc(order.currency)}</strong><small>${esc(order.role === 'seller' ? t('youAreSeller') : t('youAreBuyer'))}</small>${unread > 0 ? `<span class="exchange-unread-badge">${esc(t('unreadMessages'))}: ${unread}</span>` : ''}</div>
      </a>`
    }).join('') || `<div class="exchange-empty">${esc(t('empty'))}</div>`}</div>`
  }

  const renderChatFiles = () => state.chatFiles.length ? `<div class="exchange-chat-files">${state.chatFiles.map((file, index) => `<span><b>${esc(file.name)}</b><small>${formatFileSize(file.size)}</small><button type="button" data-remove-chat-file="${index}" aria-label="${esc(t('removeFile'))}">×</button></span>`).join('')}</div>` : ''

  const addChatFiles = (fileList) => {
    const incoming = Array.from(fileList ?? [])
    const accepted = incoming.filter((file) => /\.(pdf|png|jpe?g|webp|gif)$/i.test(file.name) && file.size > 0 && file.size <= 12 * 1024 * 1024)
    if (accepted.length !== incoming.length) ctx.notify(t('chatFileRejected'), 'error')
    const merged = [...state.chatFiles]
    for (const file of accepted) {
      const duplicate = merged.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)
      if (!duplicate) merged.push(file)
    }
    if (merged.length > 5) ctx.notify(t('chatFileLimit'), 'error')
    state.chatFiles = merged.slice(0, 5)
    render()
  }

  const renderOrderPage = () => {
    const { order, messages } = state.orderPage
    const closed = !['payment_pending','admin_requested','disputed'].includes(order.status)
    return `<div class="exchange-order-page">
      <a href="${exchangePath('/orders')}" class="exchange-news-button btn-gothic-secondary" data-button-variant="secondary" data-gothic-button="true" data-view="orders">← ${esc(t('orders'))}</a>
      <section class="exchange-order-head"><img src="${esc(itemImage(order))}" alt=""><div><span>Заказ #${order.id}</span><h2>${renderItemName(order.item_name, order.enchant_level, order.item_grade)}</h2>${renderAugmentation(order.augmentation)}<p>${number(order.price)} ${esc(order.currency)} · комиссия ${number(order.commission_coins)} Donate Coin · ${esc(order.status)}</p></div></section>
      <div class="exchange-chat">${array(messages).map((message) => `${number(message.id) === number(state.orderPage.firstUnreadMessageId) ? `<div class="exchange-new-messages" data-new-message-marker>${esc(t('newMessages'))}</div>` : ''}<article class="exchange-message ${esc(message.sender_kind)}"><header>${esc(message.sender_label)} <time>${esc(formatChatTime(message.created_at))}</time></header>${message.body ? `<p>${esc(message.body)}</p>` : ''}${array(message.attachments).map((file) => `<a href="${esc(file.url)}" target="_blank" rel="noopener">${esc(file.name || t('file'))}</a>`).join('')}</article>`).join('')}</div>
      ${closed ? `<div class="exchange-closed">${esc(t('orderClosed'))}</div>` : `<form class="exchange-compose" data-form="message"><textarea name="body" maxlength="3000" placeholder="${esc(t('message'))}">${esc(state.chatDraft)}</textarea><label class="exchange-dropzone" data-chat-dropzone><input name="chat-files" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif" multiple><strong>${esc(t('dropFiles'))}</strong><span>${esc(t('chooseFiles'))}</span></label>${renderChatFiles()}<div class="exchange-compose-actions"><button class="exchange-news-button btn-gothic-secondary" data-button-variant="secondary" data-gothic-button="true" type="submit" ${state.chatSending ? 'disabled' : ''}>${esc(t(state.chatSending ? 'sendingMessage' : 'send'))}</button></div></form>
      <div class="exchange-order-actions"><button class="exchange-news-button btn-gothic-secondary" data-button-variant="secondary" data-gothic-button="true" data-action="request-admin">${esc(t('connectAdmin'))}</button>${order.role === 'seller' ? `<button class="exchange-news-button btn-gothic-secondary" data-button-variant="secondary" data-gothic-button="true" data-action="confirm-payment">${esc(t('moneyReceived'))}</button>` : ''}</div>`}
    </div>`
  }

  const renderRules = () => `<div class="exchange-overlay"><section class="exchange-modal exchange-rules" role="dialog" aria-modal="true" aria-labelledby="exchange-rules-title"><header class="exchange-modal-header"><h2 id="exchange-rules-title">${esc(t('title'))}</h2></header><div class="exchange-modal-body"><div class="exchange-richtext">${state.market.rulesHtml || ''}</div><div class="exchange-modal-actions"><button ${darkButton} data-action="decline-rules">${esc(t('decline'))}</button><button ${darkButton} data-action="accept-rules">${esc(t('accept'))}</button></div></div></section></div>`

  const renderInventoryContent = (modal) => {
    if (modal.inventoryLoading) return `<div class="exchange-inventory-loading" role="status"><span aria-hidden="true"></span><strong>${esc(t('inventoryLoading'))}</strong></div>`
    if (modal.inventoryError) return `<p class="exchange-inventory-empty">${esc(t(modal.inventoryError === 'character_online' ? 'inventoryCharacterOnline' : 'inventoryLoadFailed'))}</p>`
    return array(modal.items).map((item) => {
      const info = itemMeta(number(item.item_type))
      return `<button class="${modal.objectId === number(item.item_id) ? 'selected' : ''}" data-item="${item.item_id}" data-item-type="${item.item_type}"><img src="${esc(itemIcon(info.icon))}" alt=""><span><strong>${renderItemName(info.name || `Item #${item.item_type}`, item.enchant, info.grade)}</strong><small>${esc(t('quantity'))}: ${number(item.amount || 1)}</small></span></button>`
    }).join('') || `<p class="exchange-inventory-empty">${esc(t(modal.characterId ? 'characterItemsEmpty' : 'chooseCharacter'))}</p>`
  }

  const renderPaymentMethod = (method, index) => `<div class="exchange-method-row"><input name="method-name-${index}" value="${esc(method.name)}" placeholder="${esc(t('paymentSystem'))}"><input name="method-details-${index}" value="${esc(method.details)}" placeholder="${esc(t('paymentDetails'))}"></div>`

  const captureLotDraft = (form) => {
    if (!form || state.modal?.type !== 'place') return
    const data = new FormData(form)
    state.modal.methods = state.modal.methods.map((_, index) => ({ name: String(data.get(`method-name-${index}`) ?? ''), details: String(data.get(`method-details-${index}`) ?? '') }))
    Object.assign(state.modal, { count: number(data.get('count')) || 1, price: String(data.get('price') ?? ''), currency: String(data.get('currency') ?? 'USD') })
  }

  const renderSelectedItem = (modal) => {
    const selected = modal.selected
    const info = itemMeta(number(selected?.item_type))
    const augmentation = itemAugmentation(selected)
    const facts = [`<span><b>${esc(t('available'))}:</b> ${number(selected?.amount || 1)}</span>`]
    return `<article class="exchange-selected-item"><img src="${esc(itemIcon(info.icon))}" alt=""><div><small>${esc(t('selectedItem'))}</small><h3>${renderItemName(info.name || `Item #${selected?.item_type}`, selected?.enchant, info.grade)}</h3><p>${facts.join('')}</p>${renderAugmentation(augmentation)}</div></article>`
  }

  const renderLotForm = (modal) => `<form class="exchange-place-panel exchange-lot-form exchange-place-stage" data-form="lot"><header class="exchange-details-header"><div><h3>${esc(t('lotDetails'))}</h3><p>${esc(t('lotDetailsHint'))}</p></div><button type="button" ${darkButton} data-action="back-inventory">← ${esc(t('backToInventory'))}</button></header>${renderSelectedItem(modal)}<div class="exchange-price-fields"><label><span>${esc(t('quantity'))}</span><input name="count" type="number" min="1" max="${modal.maxCount}" value="${modal.count || 1}" required></label><label class="exchange-price-input"><span>${esc(t('price'))}</span><input name="price" type="number" min="0.01" step="0.01" value="${esc(modal.price || '')}" placeholder="0.00" required></label><label><span>${esc(t('currency'))}</span><select name="currency">${['USD','UAH','RUB'].map((currency) => `<option ${modal.currency === currency ? 'selected' : ''}>${currency}</option>`).join('')}</select></label></div><div class="exchange-methods"><h4>${esc(t('paymentMethods'))}</h4><div class="exchange-method-rows">${array(modal.methods).map(renderPaymentMethod).join('')}</div><button type="button" ${darkButton} data-action="add-method">+ ${esc(t('addPaymentMethod'))}</button></div><p class="exchange-fee-preview" data-fee-preview>Покупатель заплатит ${commissionForPrice(modal.price, modal.currency || 'USD')} Donate Coin за открытие заказа.</p><div class="exchange-form-actions"><button ${darkButton} type="submit">${esc(t('freezeAndPlace'))}</button></div></form>`

  const renderInventoryPanel = (modal, hidden = false) => `<section class="exchange-place-panel exchange-inventory-panel exchange-place-stage" data-place-section="inventory" ${hidden ? 'hidden' : ''}><div class="exchange-section-head"><div><h3>${esc(t('inventory'))}</h3><p data-inventory-hint>${esc(t(modal.characterId ? 'chooseItem' : 'chooseCharacter'))}</p></div></div><div class="exchange-inventory" aria-busy="${String(Boolean(modal.inventoryLoading))}">${renderInventoryContent(modal)}</div></section>`

  const renderPlaceStages = (modal) => {
    const showDetails = modal.step === 'details' && modal.objectId && modal.selected
    return `${renderInventoryPanel(modal, showDetails)}<div class="exchange-details-host" data-place-section="details" ${showDetails ? '' : 'hidden'}>${showDetails ? renderLotForm(modal) : ''}</div>`
  }

  const updatePlaceStage = () => {
    const modal = state.modal
    if (!modal || modal.type !== 'place') return
    const showDetails = modal.step === 'details' && modal.objectId && modal.selected
    const inventoryPanel = modalHost.querySelector('[data-place-section="inventory"]')
    const detailsHost = modalHost.querySelector('[data-place-section="details"]')
    modalHost.querySelectorAll('[data-item]').forEach((button) => button.classList.toggle('selected', number(button.dataset.item) === modal.objectId))
    if (inventoryPanel) inventoryPanel.hidden = Boolean(showDetails)
    if (detailsHost) {
      detailsHost.hidden = !showDetails
      detailsHost.innerHTML = showDetails ? renderLotForm(modal) : ''
    }
  }

  const updatePlaceInventory = () => {
    const modal = state.modal
    if (!modal || modal.type !== 'place') return
    modalHost.querySelectorAll('[data-character]').forEach((button) => {
      const selected = number(button.dataset.character) === modal.characterId
      button.classList.toggle('selected', selected)
      button.setAttribute('aria-pressed', String(selected))
    })
    const hint = modalHost.querySelector('[data-inventory-hint]')
    if (hint) hint.textContent = t(modal.characterId ? 'chooseItem' : 'chooseCharacter')
    const inventory = modalHost.querySelector('.exchange-inventory')
    if (inventory) {
      inventory.setAttribute('aria-busy', String(Boolean(modal.inventoryLoading)))
      inventory.innerHTML = renderInventoryContent(modal)
    }
    updatePlaceStage()
  }

  const renderPlaceModal = () => {
    const modal = state.modal
    if (!modal || modal.type !== 'place') return ''
    return `<div class="exchange-overlay"><section class="exchange-modal exchange-place-modal" role="dialog" aria-modal="true" aria-labelledby="exchange-place-title">
      <header class="exchange-modal-header"><div><span class="exchange-eyebrow">${esc(t('catalog'))}</span><h2 id="exchange-place-title">${esc(t('placeLot'))}</h2></div><button class="exchange-modal-close" data-action="close-modal" aria-label="${esc(t('cancel'))}">×</button></header>
      <div class="exchange-modal-body exchange-place-body"><p class="exchange-warning">${esc(t('characterOffline'))} После размещения предмет будет заморожен; отмена доступна до открытия заказа.</p>
        <div class="exchange-place-layout">
          <aside class="exchange-place-panel exchange-character-panel"><div class="exchange-section-head"><div><h3>${esc(t('characters'))}</h3><p>${esc(t('chooseCharacter'))}</p></div></div><div class="exchange-characters">${array(modal.characters).map((character) => `<button class="${modal.characterId === number(character.id) ? 'selected' : ''}" data-character="${character.id}"><span><strong>${esc(character.name)}</strong><small>${esc(character.accountLogin || '')}${character.level ? ` · Lv. ${number(character.level)}` : ''}</small></span><b>${number(character.online) ? 'online' : 'offline'}</b></button>`).join('') || `<p class="exchange-empty">${esc(t('charactersNotFound'))}</p>`}</div></aside>
          <div class="exchange-place-main">${renderPlaceStages(modal)}</div>
        </div>
      </div></section></div>`
  }

  const renderOrderConfirmModal = () => {
    const modal = state.modal
    if (!modal || modal.type !== 'order') return ''
    const lot = modal.lot
    const fee = number(modal.fee)
    const balance = number(state.market?.balance)
    const insufficientBalance = balance < fee
    return `<div class="exchange-overlay"><section class="exchange-modal exchange-order-confirm" role="dialog" aria-modal="true"><header class="exchange-modal-header"><h2>Подтверждение заказа</h2><button class="exchange-modal-close" data-action="close-modal" aria-label="${esc(t('cancel'))}">×</button></header><div class="exchange-modal-body">
      <div class="exchange-order-head"><img src="${esc(itemImage(lot))}" alt=""><div><span>Вы действительно хотите купить</span><h2>${renderItemName(itemName(lot), lot.enchant_level, lot.item_grade)}</h2>${renderAugmentation(lot.augmentation)}${showLotQuantity(lot) ? `<p>${esc(t('quantity'))}: ${number(lot.item_count)}</p>` : ''}</div></div>
      <div class="exchange-confirm-price"><span>Стоимость предмета</span><strong>${number(lot.price).toLocaleString()} ${esc(lot.currency)}</strong></div>
      <div class="exchange-confirm-price"><span>Стоимость оформления заказа</span><strong>${state.coin?.webUrl ? `<img src="${esc(state.coin.webUrl)}" alt="">` : ''}${fee} Donate Coin</strong></div>
      ${insufficientBalance ? `<p class="exchange-warning">${esc(t('insufficientBalance'))} (${balance} / ${fee})</p>` : ''}
      <p class="exchange-warning">В случае спорной ситуации комиссия в Donate Coin вернётся на ваш баланс полностью.</p>
      <div class="exchange-modal-actions"><button ${darkButton} data-action="close-modal">Отказаться</button><button ${darkButton} data-action="confirm-order" ${insufficientBalance || state.orderSubmitting ? 'disabled' : ''}>${state.orderSubmitting ? esc(t('ordering')) : 'Заказать'}</button></div>
    </div></section></div>`
  }

  const renderOrderActionModal = () => {
    const modal = state.modal
    if (!modal || modal.type !== 'order-action') return ''
    const adminRequest = modal.action === 'request-admin'
    const title = adminRequest ? t('connectAdmin') : t('moneyReceived')
    const description = adminRequest
      ? 'Опишите ситуацию — администратор увидит обращение в переписке заказа.'
      : 'Подтвердите, что получили полную сумму. После этого предмет будет передан покупателю, а заказ завершён.'
    const submitLabel = adminRequest ? 'Отправить запрос' : 'Подтвердить получение'
    return `<div class="exchange-overlay"><section class="exchange-modal exchange-order-action-modal" role="dialog" aria-modal="true" aria-labelledby="exchange-order-action-title" aria-describedby="exchange-order-action-description">
      <header class="exchange-modal-header"><div><h2 id="exchange-order-action-title">${esc(title)}</h2></div><button class="exchange-modal-close" data-action="close-modal" aria-label="${esc(t('cancel'))}" ${modal.submitting ? 'disabled' : ''}>×</button></header>
      <form class="exchange-modal-body exchange-order-action-form" data-form="order-action">
        <p id="exchange-order-action-description" class="exchange-action-intro">${esc(description)}</p>
        ${adminRequest ? `<label class="exchange-action-reason"><span>Причина обращения <small>необязательно</small></span><textarea name="reason" maxlength="1000" placeholder="Например: нужна помощь с оплатой или передачей предмета" ${modal.submitting ? 'disabled' : ''}>${esc(modal.reason)}</textarea></label>` : `<p class="exchange-action-note">Это действие нельзя отменить.</p>`}
        <div class="exchange-modal-actions"><button ${darkButton} type="button" data-action="close-modal" ${modal.submitting ? 'disabled' : ''}>${esc(t('cancel'))}</button><button ${adminRequest ? darkButton : dangerButton} type="submit" ${modal.submitting ? 'disabled' : ''}>${modal.submitting ? esc(t('sendingMessage')) : esc(submitLabel)}</button></div>
      </form>
    </section></div>`
  }

  const render = () => {
    const modalMarkup = state.market?.enabled ? (!state.market.rulesAccepted || state.rulesReview ? renderRules() : renderPlaceModal() || renderOrderConfirmModal() || renderOrderActionModal()) : ''
    modalHost.innerHTML = modalMarkup
    document.body.classList.toggle('exchange-modal-open', Boolean(modalMarkup))
    if (state.loading && !state.market) { ctx.root.innerHTML = '<div class="exchange-loading">Загрузка биржи…</div>'; return }
    if (!state.market?.enabled) { ctx.root.innerHTML = `<div class="exchange-disabled"><h1>${esc(t('title'))}</h1><p>${esc(state.market?.message || 'Биржа недоступна.')}</p></div>`; return }
    ctx.root.innerHTML = `<div class="exchange-app">${renderHeader()}<main>${state.loading ? '<div class="exchange-loading">Загрузка…</div>' : state.view === 'catalog' ? renderCatalog() : state.view === 'my-lots' ? renderMyLots() : renderOrders()}</main></div>`
    const category = ctx.root.querySelector('[name="category"]'); if (category) category.value = state.filters.category
    const grade = ctx.root.querySelector('[name="grade"]'); if (grade) grade.value = state.filters.grade
    const chat = ctx.root.querySelector('.exchange-chat')
    if (chat) {
      const marker = chat.querySelector('[data-new-message-marker]')
      chat.scrollTop = marker ? Math.max(0, marker.offsetTop - chat.offsetTop - Math.round(chat.clientHeight / 3)) : chat.scrollHeight
    }
  }

  const openPlace = async () => {
    const [characters, profile] = await Promise.all([request('/characters'), request('/payment-profile')])
    state.modal = { type: 'place', step: 'inventory', characters: array(characters?.items), items: [], methods: array(profile?.methods).length ? array(profile.methods) : [{ name: '', details: '' }], characterId: 0, objectId: 0, currency: 'USD' }
    render()
  }

  const handleClick = async (event) => {
    if (event.target instanceof Element && event.target.classList.contains('exchange-overlay')) {
      if (state.modal?.submitting) return
      if (state.modal) state.modal = null
      else if (state.market?.rulesAccepted) state.rulesReview = false
      render(); return
    }
    const element = event.target.closest('button, a[data-view], a[data-open-order]')
    if (!element) return
    if (element.dataset.removeChatFile !== undefined) {
      state.chatFiles.splice(number(element.dataset.removeChatFile), 1)
      render(); return
    }
    if (element.dataset.myLotsFilter) { state.myLotsFilter = element.dataset.myLotsFilter; render(); return }
    if (element.dataset.view) { event.preventDefault(); switchView(element.dataset.view); return }
    const action = element.dataset.action
    if (action === 'place-lot') return openPlace()
    if (action === 'close-modal') { if (!state.modal?.submitting) { state.modal = null; render() }; return }
    if (action === 'view-rules') { state.rulesReview = true; render(); return }
    if (action === 'decline-rules') { if (state.market.rulesAccepted) { state.rulesReview = false; render() } else ctx.navigate('/dashboard'); return }
    if (action === 'accept-rules') {
      await request('/rules/accept', apiBody({}))
      state.market.rulesAccepted = true
      state.rulesReview = false
      await loadCurrentRoute()
      render()
      return
    }
    if (action === 'back-inventory') {
      captureLotDraft(element.closest('form[data-form="lot"]'))
      state.modal.step = 'inventory'
      updatePlaceStage(); return
    }
    if (action === 'add-method') {
      const form = element.closest('form[data-form="lot"]')
      captureLotDraft(form)
      const index = state.modal.methods.length
      state.modal.methods.push({ name: '', details: '' })
      const rows = form.querySelector('.exchange-method-rows')
      rows?.insertAdjacentHTML('beforeend', renderPaymentMethod(state.modal.methods[index], index))
      rows?.querySelector(`[name="method-name-${index}"]`)?.focus()
      return
    }
    if (action === 'confirm-order') {
      const lot = state.modal?.lot
      if (!lot || state.orderSubmitting) return
      if (number(state.market?.balance) < number(state.modal?.fee)) {
        ctx.notify(t('insufficientBalance'), 'error')
        return
      }
      state.orderSubmitting = true
      element.disabled = true
      let created
      try {
        created = await request(`/lots/${lot.id}/order`, apiBody({}))
      } catch {
        state.orderSubmitting = false
        element.disabled = false
        return
      }
      state.orderSubmitting = false
      state.market.balance = number(created.balance)
      state.modal = null
      navigateTo(`/orders/${number(created.orderId)}`)
      return
    }
    if (action === 'request-admin' || action === 'confirm-payment') { state.modal = { type: 'order-action', action, reason: '', submitting: false }; render(); return }
    if (element.dataset.character) {
      const characterId = number(element.dataset.character)
      if (state.modal?.type !== 'place') return
      const inventoryRequestId = number(state.modal.inventoryRequestId) + 1
      Object.assign(state.modal, { step: 'inventory', characterId, items: [], objectId: 0, selected: null, inventoryLoading: true, inventoryError: false, inventoryRequestId })
      updatePlaceInventory()
      try {
        const inventory = await request(`/characters/${characterId}/items`)
        const items = array(inventory?.items)
        Object.assign(state.augmentationOptions, inventory?.augmentationOptions ?? {})
        await lookupItems(items.map((item) => item.item_type))
        if (state.modal?.type !== 'place' || state.modal.inventoryRequestId !== inventoryRequestId) return
        Object.assign(state.modal, { items, inventoryLoading: false })
      } catch (error) {
        if (state.modal?.type !== 'place' || state.modal.inventoryRequestId !== inventoryRequestId) return
        const code = String(error?.response?.data?.code ?? '')
        Object.assign(state.modal, { inventoryLoading: false, inventoryError: code === 'character_online' ? code : true })
      }
      updatePlaceInventory(); return
    }
    if (element.dataset.item) {
      if (state.modal?.type !== 'place') return
      const objectId = number(element.dataset.item)
      const selected = state.modal.items.find((item) => number(item.item_id) === objectId)
      if (!selected) return
      const sameItem = state.modal.objectId === objectId
      Object.assign(state.modal, { step: 'details', objectId, itemType: number(element.dataset.itemType), maxCount: number(selected.amount || 1), count: sameItem ? state.modal.count : number(selected.amount || 1), price: sameItem ? state.modal.price : '', selected })
      updatePlaceStage(); return
    }
    if (element.dataset.cancelLot) { if (window.confirm('Отменить лот и вернуть предмет персонажу?')) { await request(`/lots/${element.dataset.cancelLot}/cancel`, apiBody({})); await switchView('my-lots') } return }
    if (element.dataset.orderLot) {
      const lot = state.lots.find((item) => String(item.id) === element.dataset.orderLot)
      state.modal = { type: 'order', lot, fee: commissionForLot(lot) }
      render(); return
    }
    if (element.dataset.openOrder) { event.preventDefault(); navigateTo(`/orders/${number(element.dataset.openOrder)}`); return }
  }

  const openOrder = async (id) => {
    if (number(state.orderPage?.order?.id) !== number(id)) {
      state.chatDraft = ''
      state.chatFiles = []
    }
    state.orderPage = await request(`/orders/${id}`)
    state.orders = state.orders.map((order) => number(order.id) === number(id) ? { ...order, unread_count: 0 } : order)
    state.summary = await request('/summary')
    state.view = 'orders'
    render()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const form = event.target
    const data = new FormData(form)
    if (form.dataset.form === 'filters') {
      Object.keys(state.filters).forEach((key) => state.filters[key] = key === 'enchanted' ? data.get(key) === 'on' : String(data.get(key) ?? ''))
      state.loading = true; render(); await loadCatalog(); state.loading = false; render(); return
    }
    if (form.dataset.form === 'lot') {
      const selected = state.modal.selected
      const info = itemMeta(number(selected.item_type))
      const methods = state.modal.methods.map((_, index) => ({ name: String(data.get(`method-name-${index}`) ?? ''), details: String(data.get(`method-details-${index}`) ?? '') })).filter((method) => method.name.trim())
      await request('/payment-profile', apiBody({ methods }, 'PUT'))
      await request('/lots', apiBody({ characterId: state.modal.characterId, objectId: state.modal.objectId, itemId: selected.item_type, count: number(data.get('count')), price: number(data.get('price')), currency: data.get('currency'), itemName: info.name || `Item #${selected.item_type}`, itemIcon: info.icon || '', itemCategory: info.equipmentCategory || 'other', itemGrade: info.grade || 'NG', enchantLevel: selected.enchant || 0, augmentation: itemAugmentation(selected), paymentMethods: methods }))
      state.modal = null; ctx.notify('Лот размещён'); await switchView('my-lots'); return
    }
    if (form.dataset.form === 'order-action') {
      const modal = state.modal
      if (!modal || modal.type !== 'order-action' || modal.submitting || !state.orderPage) return
      modal.reason = String(data.get('reason') ?? '').trim()
      modal.submitting = true
      render()
      try {
        const orderId = state.orderPage.order.id
        if (modal.action === 'request-admin') await request(`/orders/${orderId}/admin-request`, apiBody({ reason: modal.reason }))
        else {
          await request(`/orders/${orderId}/confirm-payment`, apiBody({ confirmed: true }))
          ctx.notify('Предмет передан на склад покупателя')
        }
        state.modal = null
        await openOrder(orderId)
      } catch {
        if (state.modal === modal) {
          modal.submitting = false
          render()
        }
      }
      return
    }
    if (form.dataset.form === 'message') {
      if (state.chatSending) return
      state.chatDraft = String(data.get('body') ?? '')
      state.chatSending = true
      render()
      try {
        const attachments = await Promise.all(state.chatFiles.map((file) => ctx.upload(file)))
        const orderId = state.orderPage.order.id
        await request(`/orders/${orderId}/messages`, apiBody({ body: state.chatDraft, attachments }))
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

  const handleInput = (event) => {
    if (event.target.matches('textarea[name="body"]') && event.target.closest('form[data-form="message"]')) {
      state.chatDraft = event.target.value
      return
    }
    const form = event.target.closest('form[data-form="lot"]')
    if (!form) return
    const preview = form.querySelector('[data-fee-preview]')
    if (!preview) return
    const price = form.querySelector('[name="price"]')?.value
    const currency = form.querySelector('[name="currency"]')?.value || 'USD'
    preview.textContent = `Покупатель заплатит ${commissionForPrice(price, currency)} Donate Coin за открытие заказа.`
  }

  const handleChange = (event) => {
    if (event.target.matches('input[name="chat-files"]')) {
      addChatFiles(event.target.files)
      return
    }
    handleInput(event)
  }

  const handleDragOver = (event) => {
    const dropzone = event.target.closest?.('[data-chat-dropzone]')
    if (!dropzone) return
    event.preventDefault()
    dropzone.classList.add('dragging')
  }

  const handleDragLeave = (event) => {
    const dropzone = event.target.closest?.('[data-chat-dropzone]')
    if (dropzone && !dropzone.contains(event.relatedTarget)) dropzone.classList.remove('dragging')
  }

  const handleDrop = (event) => {
    const dropzone = event.target.closest?.('[data-chat-dropzone]')
    if (!dropzone) return
    event.preventDefault()
    dropzone.classList.remove('dragging')
    addChatFiles(event.dataTransfer?.files)
  }

  ctx.root.addEventListener('click', handleClick)
  ctx.root.addEventListener('submit', handleSubmit)
  ctx.root.addEventListener('input', handleInput)
  ctx.root.addEventListener('change', handleChange)
  ctx.root.addEventListener('dragover', handleDragOver)
  ctx.root.addEventListener('dragleave', handleDragLeave)
  ctx.root.addEventListener('drop', handleDrop)
  modalHost.addEventListener('click', handleClick)
  modalHost.addEventListener('submit', handleSubmit)
  modalHost.addEventListener('input', handleInput)
  modalHost.addEventListener('change', handleInput)
  const handleKeydown = (event) => {
    if (event.key !== 'Escape' || !modalHost.firstElementChild) return
    if (state.modal?.submitting) return
    if (state.modal) state.modal = null
    else if (state.market?.rulesAccepted) state.rulesReview = false
    else return
    render()
  }
  document.addEventListener('keydown', handleKeydown)
  const socket = ctx.websocket('plugin-ws/exchange')
  if (socket) socket.onmessage = () => { void (async () => {
    state.summary = await request('/summary')
    if (state.view === 'orders') {
      if (state.orderPage) await openOrder(state.orderPage.order.id)
      else await loadOrders()
    }
    render()
  })() }
  await loadMarket()
  return () => { socket?.close(); document.body.classList.remove('exchange-modal-open'); document.removeEventListener('keydown', handleKeydown); modalHost.remove(); ctx.root.removeEventListener('click', handleClick); ctx.root.removeEventListener('submit', handleSubmit); ctx.root.removeEventListener('input', handleInput); ctx.root.removeEventListener('change', handleChange); ctx.root.removeEventListener('dragover', handleDragOver); ctx.root.removeEventListener('dragleave', handleDragLeave); ctx.root.removeEventListener('drop', handleDrop) }
}
