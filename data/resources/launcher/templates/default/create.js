const i18n = {
    allTranslations: null, // Хранилище для всех загруженных языков
    translations: {},      // Текущий активный язык
    currentLang: 'ru',

    t(key, replacements = {}) {
        let translation = this.translations[key] || `[${key}]`;
        Object.keys(replacements).forEach(placeholder => {
            translation = translation.replace(`{${placeholder}}`, replacements[placeholder]);
        });
        return translation;
    },

    applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const attr = el.getAttribute('data-i18n-attr');
            if (attr) {
                el.setAttribute(attr, this.t(key));
            } else {
                el.innerHTML = this.t(key);
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.t(key);
        });
    },

    async setLanguage(lang) {
        if (!lang) lang = this.currentLang;
        this.currentLang = lang;

        try {
            if (this.allTranslations === null) {
                console.log(`[create.js i18n] Загрузка общего файла переводов /lang.json...`);
                const response = await fetch(`/create_lang.json`);
                if (!response.ok) throw new Error(`Общий файл переводов не найден: ${response.statusText}`);
                this.allTranslations = await response.json();
                console.log(`[create.js i18n] Все переводы успешно загружены.`);
            }

            if (this.allTranslations[lang]) {
                this.translations = this.allTranslations[lang];
            } else {
                console.warn(`[create.js i18n] Перевод для языка "${lang}" не найден. Используется 'ru'.`);
                this.translations = this.allTranslations['ru'] || {};
            }

            this.applyTranslations();
        } catch (error) {
            console.error(`Ошибка загрузки переводов для языка ${lang}:`, error);
        }
    }
};
window.i18n = i18n;

const enterAdminFullscreen = async () => {
    try {
        if (typeof window.go?.main?.App?.EnterAdminView === 'function') {
            await window.go.main.App.EnterAdminView();
        }
    } catch (_) {
        /* ignore */
    }
};

const navigateBack = () => {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = '/admin-dashboard.html';
    }
};

const hasActiveModal = () => {
    return Array.from(document.querySelectorAll('.modal')).some((modal) => {
        if (modal.classList.contains('hidden')) return false;
        const style = window.getComputedStyle(modal);
        const opacity = parseFloat(style.opacity || '1');
        return style.display !== 'none' && style.visibility !== 'hidden' && opacity !== 0;
    });
};

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        if (hasActiveModal()) {
            return;
        }
        event.preventDefault();
        navigateBack();
    }
});

// HTML-escape helper used when creating highlighted cell HTML
if (typeof window.escapeHtml !== 'function') {
    window.escapeHtml = function (unsafe) {
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };
}

// Simple async confirmation dialog used by CSV editor and other places.
// Usage: const ok = await showConfirm({ title, message, okText, cancelText })
if (typeof window.showConfirm !== 'function') {
    window.showConfirm = function (opts) {
        const o = Object.assign({ title: '', message: '', okText: 'OK', cancelText: 'Cancel' }, opts || {});
        return new Promise((resolve) => {
            // create modal overlay
            const overlay = document.createElement('div');
            overlay.className = 'modal confirm-modal no-drag';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.right = '0';
            overlay.style.bottom = '0';
            // Повышаем z-index, чтобы окно подтверждения всегда было поверх других модалок (csv-editor-modal имеет z-index:10000)
            overlay.style.zIndex = '20000';
            overlay.style.background = 'rgba(0,0,0,0.6)';

            const box = document.createElement('div');
            box.className = 'modal-content';
            box.style.maxWidth = '480px';
            box.style.width = '90%';
            box.style.padding = '18px';
            box.style.borderRadius = '10px';
            box.style.background = 'rgba(10,10,25,0.95)';
            box.style.color = '#fff';

            const header = document.createElement('h3');
            header.style.marginTop = '0';
            header.style.marginBottom = '8px';
            header.textContent = o.title || '';
            const msg = document.createElement('div');
            msg.style.marginBottom = '12px';
            msg.textContent = o.message || '';

            const controls = document.createElement('div');
            controls.style.display = 'flex';
            controls.style.justifyContent = 'flex-end';
            controls.style.gap = '8px';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn';
            cancelBtn.textContent = o.cancelText || 'Cancel';
            const okBtn = document.createElement('button');
            okBtn.className = 'btn btn-primary';
            okBtn.textContent = o.okText || 'OK';

            controls.appendChild(cancelBtn);
            controls.appendChild(okBtn);

            box.appendChild(header);
            box.appendChild(msg);
            box.appendChild(controls);
            overlay.appendChild(box);
            document.body.appendChild(overlay);

            function cleanup(result) {
                overlay.remove();
                resolve(result);
            }

            cancelBtn.addEventListener('click', () => cleanup(false));
            okBtn.addEventListener('click', () => cleanup(true));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
        });
    };
}

// FTPServerManager для управления множественными FTP серверами
class FTPServerManager {
    constructor() {
        this.servers = [];
        this.container = document.getElementById('ftp-servers-container');
        this.template = document.getElementById('ftp-server-template');
        this.nextIndex = 0;
        this.currentBrowseServerIndex = -1;
    }

    addServer(config = null) {
        const index = this.nextIndex++;
        const serverCard = this.createServerCard(index, config);
        this.container.appendChild(serverCard);

        const serverData = {
            index: index,
            element: serverCard,
            config: config || {
                name: i18n.t('ftpServerDefault') + ' ' + (this.servers.length + 1),
                host: '',
                port: '21',
                user: '',
                pass: '',
                path: '/'
            }
        };

        this.servers.push(serverData);
        this.setupServerEventListeners(serverData);
        return serverData;
    }

    removeServer(index) {
        const serverIndex = this.servers.findIndex(s => s.index === index);
        if (serverIndex !== -1) {
            const server = this.servers[serverIndex];
            server.element.remove();
            this.servers.splice(serverIndex, 1);
            this.scheduleGlobalSave();
        }
    }

    createServerCard(index, config) {
        const template = this.template.content.cloneNode(true);
        const card = template.querySelector('.ftp-server-card');
        card.setAttribute('data-server-index', index);

        if (config) {
            const nameInput = card.querySelector('.ftp-server-name');
            const hostInput = card.querySelector('.ftp-host');
            const protocolSelect = card.querySelector('.ftp-protocol');
            const portInput = card.querySelector('.ftp-port');
            const userInput = card.querySelector('.ftp-user');
            const passInput = card.querySelector('.ftp-pass');
            const pathInput = card.querySelector('.ftp-path');

            protocolSelect.value = config.protocol || 'sftp';
            nameInput.value = config.name || '';
            hostInput.value = config.host || '';
            portInput.value = config.port || '21';
            userInput.value = config.user || '';
            passInput.value = config.pass || '';
            pathInput.value = config.path || '/';
        }
        return card;
    }

    setupServerEventListeners(serverData) {
        const { element, index } = serverData;
        const removeBtn = element.querySelector('.ftp-remove-btn');
        removeBtn.addEventListener('click', () => this.removeServer(index));

        const toggleBtn = element.querySelector('.ftp-toggle-btn');
        const settings = element.querySelector('.ftp-server-settings');
        toggleBtn.addEventListener('click', () => {
            const isHidden = settings.classList.toggle('hidden');
            this.updateToggleButton(toggleBtn, isHidden);
        });

        const browseBtn = element.querySelector('.ftp-browse-btn');
        browseBtn.addEventListener('click', () => this.openFTPBrowser(index));

        const inputs = element.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('input', () => this.scheduleGlobalSave());
            input.addEventListener('change', () => this.scheduleGlobalSave());
        });

        settings.classList.add('hidden');
        const protocolSelect = element.querySelector('.ftp-protocol');
        const portInput = element.querySelector('.ftp-port');
        protocolSelect.addEventListener('change', () => {
            if (protocolSelect.value === 'sftp') {
                portInput.placeholder = '22';
                if (portInput.value === '21') portInput.value = '22';
            } else {
                portInput.placeholder = '21';
                if (portInput.value === '22') portInput.value = '21';
            }
            this.scheduleGlobalSave();
        });
        this.updateToggleButton(toggleBtn, true);
    }

    updateToggleButton(button, isHidden) {
        const icon = button.querySelector('i');
        const span = button.querySelector('span');
        if (!icon || !span) return;
        if (isHidden) {
            icon.className = 'fas fa-eye';
            span.setAttribute('data-i18n', 'ftpShow');
            span.textContent = i18n.t('ftpShow');
        } else {
            icon.className = 'fas fa-eye-slash';
            span.setAttribute('data-i18n', 'ftpHide');
            span.textContent = i18n.t('ftpHide');
        }
    }

    openFTPBrowser(serverIndex) {
        const server = this.servers.find(s => s.index === serverIndex);
        if (!server) return;
        const config = this.getServerConfig(serverIndex);
        if (!config.host || !config.user) {
            addLogEntry('Укажите хост и имя пользователя для подключения к FTP.', 'warning');
            return;
        }
        this.currentBrowseServerIndex = serverIndex;
        openFtpBrowser(config.path || "/", config);
    }

    getServerConfig(index) {
        const server = this.servers.find(s => s.index === index);
        if (!server) return null;
        const element = server.element;
        const protocol = element.querySelector('.ftp-protocol').value;
        const defaultPort = protocol === 'sftp' ? '22' : '21';
        return {
            name: element.querySelector('.ftp-server-name').value.trim(),
            protocol: protocol,
            host: element.querySelector('.ftp-host').value.trim(),
            port: element.querySelector('.ftp-port').value.trim() || defaultPort,
            user: element.querySelector('.ftp-user').value.trim(),
            pass: element.querySelector('.ftp-pass').value,
            path: element.querySelector('.ftp-path').value.trim() || '/'
        };
    }

    setCurrentServerPath(path) {
        if (this.currentBrowseServerIndex === -1) return;
        const server = this.servers.find(s => s.index === this.currentBrowseServerIndex);
        if (server) {
            server.element.querySelector('.ftp-path').value = path;
            this.scheduleGlobalSave();
        }
    }

    getAllConfigs() {
        return this.servers.map(server => this.getServerConfig(server.index)).filter(config => config.host.trim() !== '');
    }

    loadConfigs(configs) {
        this.servers.forEach(server => server.element.remove());
        this.servers = [];
        this.nextIndex = 0;
        if (configs && configs.length > 0) {
            configs.forEach(config => this.addServer(config));
        } else {
            this.addServer();
        }
    }

    scheduleGlobalSave() {
        if (window.scheduleSaveSettings) {
            window.scheduleSaveSettings();
        }
    }
}

// === CSV РЕДАКТОР (переменные) ===
let csvData = [];
let csvHeaders = [];
let csvFilePath = '';
let csvModified = false;
// detected hash column indexes (set by renderCSVTable)
let detectedHashColumnIndexes = new Set();
// === Редактор множественных хешей (состояние) ===
let hashEditorState = {
    rowIndex: null,
    colIndex: null,
    relativePath: '',
    hashes: [] // {value, desc}
};

document.addEventListener('DOMContentLoaded', async () => {
    await enterAdminFullscreen();
    const elements = {
        connectionStatus: document.getElementById('connection-status'),
        startBtn: document.getElementById('start-archive-btn'),
        stopBtn: document.getElementById('stop-archive-btn'),
        gamePathInput: document.getElementById('game-directory'),
        browseBtn: document.getElementById('browse-btn'),
        operationLog: document.getElementById('operation-log'),
        totalFiles: document.getElementById('total-files'),
        processedFiles: document.getElementById('processed-files'),
        archivedFiles: document.getElementById('archived-files'),
        errorCount: document.getElementById('error-count'),
        archiveProgress: document.getElementById('archive-progress'),
        progressPercentage: document.getElementById('progress-percentage'),
        clearLogBtn: document.getElementById('clear-log-btn'),
        skipExistingCheckbox: document.getElementById('skip-existing'),
        ignoredExtensionsInput: document.getElementById('ignored-extensions'),
        uploadFtpCheckbox: document.getElementById('upload-ftp'),
        ftpControls: document.getElementById('ftp-controls'),
        ftpServersContainer: document.getElementById('ftp-servers-container'),
        addFtpBtn: document.getElementById('add-ftp-btn'),
        ftpModal: document.getElementById('ftp-browser-modal'),
        closeFtpModalBtn: document.getElementById('close-ftp-modal-btn'),
        ftpModalCurrentPath: document.getElementById('ftp-modal-current-path'),
        ftpDirList: document.getElementById('ftp-dir-list'),
        selectFtpPathBtn: document.getElementById('select-ftp-path-btn'),

        ignoredFilesList: document.getElementById('ignored-files-list'),
        addIgnoredFileBtn: document.getElementById('add-ignored-file-btn'),
        fileBrowserModal: document.getElementById('file-browser-modal'),
        closeFileModalBtn: document.getElementById('close-file-modal-btn'),
        fileModalCurrentPath: document.getElementById('file-modal-current-path'),
        fileList: document.getElementById('file-list'),
        addSelectedFilesBtn: document.getElementById('add-selected-files-btn'),
    };

    let isProcessing = false;
    let saveSettingsTimeout;
    const ftpManager = new FTPServerManager();

    // **ИСПРАВЛЕНИЕ**: Переменная для хранения состояния выбора между папками
    let persistentSelection = new Set();

    // CSV элементы интерфейса
    const csvElements = {
        modal: document.getElementById('csv-editor-modal'),
        closeBtn: document.getElementById('close-csv-modal-btn'),
        table: document.getElementById('csv-table'),
        headerRow: document.getElementById('csv-header-row'),
        tableBody: document.getElementById('csv-table-body'),
        loading: document.getElementById('csv-loading'),
        empty: document.getElementById('csv-empty'),
        saveBtn: document.getElementById('save-csv-btn'),
        reloadBtn: document.getElementById('reload-csv-btn'),
        filePathSpan: document.getElementById('csv-file-path'),
        rowsCountSpan: document.getElementById('csv-rows-count'),
        openCsvBtn: document.getElementById('open-csv-btn'),
        uploadToFtpCheckbox: document.getElementById('csv-upload-to-ftp-checkbox'),
    };

    // Helper: load a single page from backend and render into table
    window.loadCsvPage = async function (filePath, page = 1, pageSize = 1000) {
        if (!filePath) return;
        try {
            csvElements.loading.style.display = '';
            const resp = await window.go.main.App.ReadArchiveCSVPage(filePath, page, pageSize);
            csvElements.loading.style.display = 'none';
            // store globals for save/logic and render via shared renderer so behaviors (force toggle, edit) are applied
            csvElements.filePathSpan.textContent = filePath;
            csvElements.rowsCountSpan.textContent = resp.totalRows + ' строк';
            csvHeaders = resp.headers || [];
            csvData = resp.data || [];
            window._csvPage = resp.page || 1;
            window._csvTotalPages = resp.totalPages || 1;
            window._csvTotalRows = resp.totalRows || 0;
            // clear search mode when loading normal pages
            window._csvSearchQuery = '';

            // Use existing renderer to ensure event handlers and special cells (force) are wired
            renderCSVTable();

            // pager
            let pager = document.getElementById('csv-pager');
            if (!pager) {
                pager = document.createElement('div');
                pager.id = 'csv-pager';
                csvElements.table.parentElement.insertBefore(pager, csvElements.table.parentElement.firstChild);
            }
            pager.innerHTML = '';
            const prev = document.createElement('button'); prev.className = 'btn'; prev.textContent = '◀';
            const next = document.createElement('button'); next.className = 'btn'; next.textContent = '▶';
            const info = document.createElement('span'); info.textContent = `Стр. ${resp.page}/${resp.totalPages} — ${resp.totalRows} строк`;
            prev.disabled = resp.page <= 1;
            next.disabled = resp.page >= resp.totalPages;
            prev.addEventListener('click', () => { window.loadCsvPage(filePath, Math.max(1, resp.page - 1), pageSize); });
            next.addEventListener('click', () => { window.loadCsvPage(filePath, Math.min(resp.totalPages, resp.page + 1), pageSize); });
            pager.appendChild(prev);
            pager.appendChild(info);
            pager.appendChild(next);
            // select
            if (resp.totalPages > 1) {
                const sel = document.createElement('select');
                for (let p = 1; p <= resp.totalPages; p++) {
                    const opt = document.createElement('option'); opt.value = p; opt.textContent = p;
                    if (p === resp.page) opt.selected = true;
                    sel.appendChild(opt);
                }
                sel.addEventListener('change', () => { window.loadCsvPage(filePath, parseInt(sel.value, 10), pageSize); });
                pager.appendChild(sel);
            }

        } catch (err) {
            csvElements.loading.style.display = 'none';
            console.error('Ошибка загрузки CSV страницы:', err);
            csvElements.empty.style.display = '';
        }
    };

    // Search CSV on server (paged). Stores results in csvData/csvHeaders and renders.
    window.searchCsv = async function (query, page = 1, pageSize = 1000) {
        if (!csvFilePath) return;
        try {
            csvElements.loading.style.display = '';
            const resp = await window.go.main.App.SearchArchiveCSV(csvFilePath, query || '', page, pageSize);
            csvElements.loading.style.display = 'none';

            csvElements.filePathSpan.textContent = csvFilePath;
            csvElements.rowsCountSpan.textContent = resp.totalRows + ' строк';
            csvHeaders = resp.headers || [];
            csvData = resp.data || [];
            window._csvPage = resp.page || 1;
            window._csvTotalPages = resp.totalPages || 1;
            window._csvTotalRows = resp.totalRows || 0;
            // mark that we are in search mode so saving merges changes into full CSV
            window._csvSearchQuery = query || '';

            renderCSVTable();

            // pager similar to loadCsvPage
            let pager = document.getElementById('csv-pager');
            if (!pager) {
                pager = document.createElement('div');
                pager.id = 'csv-pager';
                csvElements.table.parentElement.insertBefore(pager, csvElements.table.parentElement.firstChild);
            }
            pager.innerHTML = '';
            const prev = document.createElement('button'); prev.className = 'btn'; prev.textContent = '◀';
            const next = document.createElement('button'); next.className = 'btn'; next.textContent = '▶';
            const info = document.createElement('span'); info.textContent = `Стр. ${resp.page}/${resp.totalPages} — ${resp.totalRows} совпадений`;
            prev.disabled = resp.page <= 1;
            next.disabled = resp.page >= resp.totalPages;
            prev.addEventListener('click', () => { window.searchCsv(query, Math.max(1, resp.page - 1), pageSize); });
            next.addEventListener('click', () => { window.searchCsv(query, Math.min(resp.totalPages, resp.page + 1), pageSize); });
            pager.appendChild(prev);
            pager.appendChild(info);
            pager.appendChild(next);
            if (resp.totalPages > 1) {
                const sel = document.createElement('select');
                for (let p = 1; p <= resp.totalPages; p++) {
                    const opt = document.createElement('option'); opt.value = p; opt.textContent = p;
                    if (p === resp.page) opt.selected = true;
                    sel.appendChild(opt);
                }
                sel.addEventListener('change', () => { window.searchCsv(query, parseInt(sel.value, 10), pageSize); });
                pager.appendChild(sel);
            }

        } catch (err) {
            csvElements.loading.style.display = 'none';
            console.error('Ошибка поиска CSV:', err);
            csvElements.empty.style.display = '';
        }
    };

    window.clearCsvSearch = async function () {
        const input = document.getElementById('csv-search-input');
        if (input) input.value = '';
        // reload current page (or first page)
        window._csvSearchQuery = '';
        await window.loadCsvPage(csvFilePath, 1, 1000);
    };

    // --- Логика браузера локальных файлов ---

    const openFileBrowser = () => {
        const gamePath = elements.gamePathInput.value;
        if (!gamePath) {
            addLogEntry("Сначала укажите директорию игры.", 'warning');
            elements.gamePathInput.focus();
            return;
        }
        // **ИСПРАВЛЕНИЕ**: Очищаем предыдущее выделение при каждом новом открытии
        persistentSelection.clear();
        elements.fileBrowserModal.style.display = 'flex';
        loadLocalDirectory(gamePath);
    };

    const closeFileBrowser = () => {
        elements.fileBrowserModal.style.display = 'none';
    };

    const loadLocalDirectory = async (path) => {
        if (!elements.fileList) return;
        elements.fileList.innerHTML = `<div class="ftp-dir-item-loading">${i18n.t('ftpLoading')}</div>`;
        elements.fileModalCurrentPath.value = path;
        try {
            const entries = await window.go.main.App.ListDirectory(path);
            renderLocalFiles(entries, path);
        } catch (error) {
            elements.fileList.innerHTML = `<div class="log-entry error"><span class="log-message">Ошибка: ${error}</span></div>`;
        }
    };

    const renderLocalFiles = (entries, currentPath) => {
        elements.fileList.innerHTML = '';
        const gamePath = elements.gamePathInput.value;

        // **ИСПРАВЛЕНИЕ**: Логика кнопки "На уровень выше"
        if (currentPath.toLowerCase() !== gamePath.toLowerCase() && currentPath.length > gamePath.length) {
            // Ищем последний разделитель пути
            const lastSeparatorIndex = Math.max(currentPath.lastIndexOf('\\'), currentPath.lastIndexOf('/'));
            if (lastSeparatorIndex > 0) {
                const parentDir = currentPath.substring(0, lastSeparatorIndex);
                // Убеждаемся, что не выходим за пределы корневой папки игры
                if (parentDir.length >= gamePath.length) {
                    const upEl = document.createElement('div');
                    upEl.className = 'ftp-dir-item';
                    upEl.innerHTML = '<i class="fas fa-arrow-up"></i> ..';
                    upEl.addEventListener('click', () => loadLocalDirectory(parentDir));
                    elements.fileList.appendChild(upEl);
                }
            }
        }

        (entries || []).forEach(entry => {
            const entryEl = document.createElement('div');
            entryEl.className = 'ftp-dir-item';
            entryEl.dataset.fullPath = entry.path;
            entryEl.dataset.type = entry.isDir ? 'dir' : 'file';

            // Иконка и имя
            entryEl.innerHTML = `<i class="fas ${entry.isDir ? 'fa-folder' : 'fa-file-alt'}"></i> ${entry.name}`;

            // Восстанавливаем класс 'selected', если уже выбрано
            if (persistentSelection.has(entry.path)) {
                entryEl.classList.add('selected');
            }

            // Клик по элементу — выделение/снятие выделения
            entryEl.addEventListener('click', (e) => {
                e.stopPropagation();
                entryEl.classList.toggle('selected');
                if (entryEl.classList.contains('selected')) {
                    persistentSelection.add(entry.path);
                } else {
                    persistentSelection.delete(entry.path);
                }
            });

            // Двойной клик по папке — переход внутрь
            if (entry.isDir) {
                entryEl.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    loadLocalDirectory(entry.path);
                });
            }
            elements.fileList.appendChild(entryEl);
        });
    };

    const addSelectedFilesToIgnoreList = () => {
        const gamePath = elements.gamePathInput.value;
        // **ИСПРАВЛЕНИЕ**: Используем данные из общего списка `persistentSelection`, а не из DOM
        persistentSelection.forEach(fullPath => {
            // Находим DOM-элемент для определения типа
            const item = Array.from(elements.fileList.children).find(el => el.dataset.fullPath === fullPath);
            const isDir = item && item.dataset.type === 'dir';
            // Нормализуем и получаем относительный путь
            let relativePath = fullPath.replace(gamePath, '').replace(/\\/g, '/').replace(/^\//, '');
            if (isDir && !relativePath.endsWith('/')) relativePath += '/';
            addIgnoredFileTag(relativePath, isDir);
        });
        closeFileBrowser();
        scheduleSaveSettings();
    };

    const addIgnoredFileTag = (filePath, isDir = false) => {
        if (!filePath) return;

        const existingTags = elements.ignoredFilesList.querySelectorAll('.ignored-item-tag');
        for (let tag of existingTags) {
            if (tag.dataset.path === filePath) return;
        }

        // Если isDir не передан, определяем по суффиксу
        if (typeof isDir !== 'boolean') {
            isDir = /\/$/.test(filePath);
        }

        const tag = document.createElement('div');
        tag.className = 'ignored-item-tag';
        tag.dataset.path = filePath;
        tag.dataset.type = isDir ? 'dir' : 'file';

        // Иконка
        const icon = document.createElement('i');
        icon.className = isDir ? 'fa fa-folder' : 'fa fa-file-alt';
        tag.appendChild(icon);

        const text = document.createElement('span');
        text.textContent = filePath;
        tag.appendChild(text);

        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-tag-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = () => {
            tag.remove();
            scheduleSaveSettings();
        };
        tag.appendChild(removeBtn);

        elements.ignoredFilesList.appendChild(tag);
    };

    // --- КОНЕЦ ИСПРАВЛЕННОЙ ЛОГИКИ ---

    // === CSV РЕДАКТОР ФУНКЦИИ ===

    // Открытие CSV редактора
    const openCSVEditor = async () => {
        const gameDir = elements.gamePathInput.value.trim();
        if (!gameDir) {
            addLogEntry("Не указана директория игры для открытия CSV.", 'warning');
            return;
        }

        csvFilePath = `${gameDir}/archive/archive.csv`.replace(/\\/g, '/');
        csvElements.modal.style.display = 'flex';
        await loadCSVData();
    };

    // Закрытие CSV редактора
    const closeCSVEditor = async () => {
        if (csvModified) {
            const promptOpts = {
                title: i18n.t('csvUnsavedChanges') || 'Внимание',
                message: i18n.t('csvUnsavedChanges') || 'У вас есть несохраненные изменения. Закрыть без сохранения?',
                okText: i18n.t('yes') || 'Да',
                cancelText: i18n.t('no') || 'Нет'
            };
            let ok;
            if (typeof window.showConfirm === 'function') {
                ok = await window.showConfirm(promptOpts);
            } else {
                // fallback to native confirm
                ok = window.confirm(promptOpts.message || 'Discard changes?');
            }
            if (!ok) return;
        }
        
        csvElements.modal.style.display = 'none';
        csvData = [];
        csvHeaders = [];
        csvModified = false;
        updateCSVSaveButtonState();
    };

    // Загрузка данных CSV
    const loadCSVData = async () => {
        showCSVLoading(true);

        try {
            // Use paginated loader (page 1)
            await window.loadCsvPage(csvFilePath, 1, 1000);
            // renderCSVTable uses csvHeaders/csvData globals; call it to wire behaviors
            renderCSVTable();
            updateRowsCount();
            csvModified = false;
            updateCSVSaveButtonState();
        } catch (error) {
            console.error('Ошибка загрузки CSV:', error);
            addLogEntry(`Ошибка загрузки CSV: ${error}`, 'error');
            showCSVEmpty(true);
        }

        showCSVLoading(false);
    };

    // Показать/скрыть состояние загрузки
    const showCSVLoading = (show) => {
        csvElements.loading.style.display = show ? 'flex' : 'none';
        csvElements.table.style.display = show ? 'none' : 'table';
        csvElements.empty.style.display = 'none';
    };

    // Показать состояние пустого CSV
    const showCSVEmpty = (show) => {
        csvElements.empty.style.display = show ? 'flex' : 'none';
        csvElements.table.style.display = show ? 'none' : 'table';
        csvElements.loading.style.display = 'none';
    };

    // Отрисовка таблицы CSV
    const renderCSVTable = () => {
        // Очищаем таблицу
        csvElements.headerRow.innerHTML = '';
        csvElements.tableBody.innerHTML = '';

        // Определяем индексы колонок, которые следует считать колонкой хешей (чтобы корректно работать при разном регистре/локализации)
        const hashColumnIndexes = new Set();
        csvHeaders.forEach((header, index) => {
            const hn = String(header || '').trim().toLowerCase();
            const displayLower = String(getCSVColumnDisplayName(header) || '').trim().toLowerCase();
            if (hn === 'hash' || hn === 'хеш' || hn.includes('hash') || displayLower === 'hash' || displayLower === 'хеш' || displayLower.includes('hash')) {
                hashColumnIndexes.add(index);
            }
        });
        // publish detected set so other helpers can use it
        detectedHashColumnIndexes = hashColumnIndexes;

        // publish detected set so other helpers can use it
        detectedHashColumnIndexes = hashColumnIndexes;

        // Helper: merge cells that were accidentally split by commas inside bracketed values like [a,b]
        const normalizeRowBrackets = (row) => {
            if (!row || !Array.isArray(row)) return [];
            const out = [];
            let buffer = null;
            for (let i = 0; i < row.length; i++) {
                const cell = row[i] === undefined || row[i] === null ? '' : String(row[i]);
                const cellTrim = cell.trim();
                if (buffer === null) {
                    // If this cell contains an unmatched opening bracket anywhere, start buffering
                    const openCountCell = (cell.match(/\[/g) || []).length;
                    const closeCountCell = (cell.match(/\]/g) || []).length;
                    if (openCountCell > closeCountCell) {
                        buffer = cell;
                        // If buffering completes immediately (unlikely), flush
                        if (openCountCell === closeCountCell) {
                            out.push(buffer);
                            buffer = null;
                        }
                    } else {
                        out.push(cell);
                    }
                } else {
                    buffer = buffer + ',' + cell;
                    const openCount = (buffer.match(/\[/g) || []).length;
                    const closeCount = (buffer.match(/\]/g) || []).length;
                    if (openCount > 0 && openCount === closeCount) {
                        out.push(buffer);
                        buffer = null;
                    }
                }
            }
            if (buffer !== null) out.push(buffer);
            return out;
        };

        // Pre-normalize all rows and ensure they match header length
        const normData = csvData.map((row) => {
            let nr = normalizeRowBrackets(row || []);
            if (csvHeaders && csvHeaders.length && nr.length < csvHeaders.length) {
                nr = nr.concat(new Array(csvHeaders.length - nr.length).fill(''));
            }
            return nr;
        });
        // Replace csvData with normalized data so other code paths see corrected cells
        csvData = normData;

        // Detect visible columns: skip artifact columns that have empty header and all-empty values
        const visibleCols = [];
        for (let ci = 0; ci < (csvHeaders.length || 0); ci++) {
            const headerTrim = String(csvHeaders[ci] || '').trim();
            let hasData = headerTrim !== '';
            if (!hasData) {
                for (let r = 0; r < normData.length; r++) {
                    const v = normData[r][ci];
                    if (v !== undefined && v !== null && String(v).trim() !== '') { hasData = true; break; }
                }
            }
            if (hasData) visibleCols.push(ci);
        }

        // Ensure important columns are always visible even if detection missed them
        ['lastUpdateFile', 'force', 'relativePath', 'hash'].forEach(name => {
            const idx = csvHeaders.indexOf(name);
            if (idx !== -1 && !visibleCols.includes(idx)) visibleCols.push(idx);
        });

        // Keep visibleCols sorted in original column order
        visibleCols.sort((a, b) => a - b);

        // Заполняем заголовки только для видимых колонок
        csvElements.headerRow.innerHTML = '';
        visibleCols.forEach(ci => {
            const th = document.createElement('th');
            th.textContent = getCSVColumnDisplayName(csvHeaders[ci]);
            th.dataset.columnIndex = ci;
            csvElements.headerRow.appendChild(th);
        });

        // Создаем строки данных
        normData.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            tr.dataset.rowIndex = rowIndex;

            visibleCols.forEach((colIndex) => {
                const header = csvHeaders[colIndex];
                const td = document.createElement('td');
                const cellValue = (row[colIndex] !== undefined && row[colIndex] !== null) ? String(row[colIndex]) : '';
                td.dataset.rowIndex = rowIndex;
                td.dataset.columnIndex = colIndex;

                // Специальная обработка для force колонки
                if (header === 'force') {
                    td.classList.add('csv-cell-force');
                    td.textContent = getForceEmoji(cellValue);
                    td.dataset.originalValue = cellValue;
                    td.title = `Принудительная загрузка: ${cellValue === '1' ? 'Включена' : 'Отключена'} (клик для изменения)`;
                    td.addEventListener('click', () => toggleForceValue(td));
                    td.style.cursor = 'pointer';
                    td.style.textAlign = 'center';
                    td.style.fontSize = '18px';
                    td.style.userSelect = 'none';
                    td.style.transition = 'transform 0.15s ease';
                } else if (hashColumnIndexes.has(colIndex)) {
                    td.dataset.hashCell = '1';
                    // parse multi-hash format [a,b,c]
                    let hashes = [];
                    const trimmed = cellValue.trim();
                    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                        const inner = trimmed.slice(1, -1).trim();
                        if (inner.length > 0) {
                            hashes = inner.split(',').map(h => h.trim()).filter(Boolean);
                        }
                    } else if (trimmed) {
                        hashes = [trimmed];
                    }
                    // pills
                    const wrap = document.createElement('div');
                    wrap.className = 'hash-pills-wrap';
                    hashes.forEach(h => {
                        const pill = document.createElement('div');
                        pill.className = 'hash-pill';
                        pill.innerHTML = `<code>${escapeHtml(h)}</code>`;
                        wrap.appendChild(pill);
                    });
                    if (hashes.length === 0) {
                        const empty = document.createElement('span');
                        empty.style.opacity = '.5';
                        empty.textContent = '—';
                        wrap.appendChild(empty);
                    }
                    // edit button (placed before pills so it appears at the start)
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'hash-edit-btn no-drag';
                    btn.innerHTML = '<i class="fas fa-plus"></i>';
                    btn.title = 'Редактировать хеши';
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openHashEditor(rowIndex, colIndex);
                    });
                    // insert button before the pills wrap so button appears first
                    td.appendChild(btn);
                    td.appendChild(wrap);
                    // inline add button removed to avoid duplicate controls; use .hash-edit-btn only
                    td.classList.add('csv-cell-readonly');
                } else {
                    // Обычные ячейки
                    const searchQ = window._csvSearchQuery ? String(window._csvSearchQuery).trim() : '';
                    if (searchQ) {
                        const low = String(cellValue).toLowerCase();
                        const qLow = searchQ.toLowerCase();
                        if (qLow && low.includes(qLow)) {
                            // Create highlighted HTML by wrapping matches with <mark>
                            const parts = [];
                            let idx = 0;
                            while (true) {
                                const found = low.indexOf(qLow, idx);
                                if (found === -1) {
                                    parts.push(escapeHtml(String(cellValue).substring(idx)));
                                    break;
                                }
                                // push before
                                if (found > idx) parts.push(escapeHtml(String(cellValue).substring(idx, found)));
                                // push match
                                parts.push('<mark>' + escapeHtml(String(cellValue).substring(found, found + qLow.length)) + '</mark>');
                                idx = found + qLow.length;
                            }
                            td.classList.add('csv-cell-highlight');
                            td.innerHTML = parts.join('');
                        } else {
                            td.textContent = cellValue;
                        }
                    } else {
                        td.textContent = cellValue;
                    }

                    // Делаем ячейки редактируемыми (кроме readonly колонок)
                    if (isCSVColumnEditable(header)) {
                        td.classList.add('csv-cell-editable');
                        td.addEventListener('click', () => startCellEdit(td));
                    } else {
                        td.classList.add('csv-cell-readonly');
                    }
                }

                tr.appendChild(td);
            });

            csvElements.tableBody.appendChild(tr);
        });

        updateRowsCount();
        ensureHashEditButtons();
    };

    function ensureHashEditButtons() {
        // For any hash cells missing button (older cache), add it.
        document.querySelectorAll('td[data-hash-cell]').forEach(td => {
            if (!td.querySelector('.hash-edit-btn')) {
                const rowIndex = parseInt(td.dataset.rowIndex);
                const colIndex = parseInt(td.dataset.columnIndex);
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'hash-edit-btn';
                btn.innerHTML = '<i class="fas fa-plus"></i>';
                btn.title = 'Редактировать хеши';
                btn.addEventListener('click', (e) => { e.stopPropagation(); openHashEditor(rowIndex, colIndex); });
                // place button at the start of the cell
                td.insertBefore(btn, td.firstChild);
            }
        });
        // Also handle cells that didn't get data-hash-cell attr but are in detectedHashColumnIndexes
        detectedHashColumnIndexes.forEach(colIdx => {
            document.querySelectorAll(`td[data-column-index="${colIdx}"]`).forEach(td => {
                if (!td.dataset.hashCell) {
                    td.dataset.hashCell = '1';
                }
                if (!td.querySelector('.hash-edit-btn')) {
                    const rowIndex = parseInt(td.dataset.rowIndex);
                    const colIndex = parseInt(td.dataset.columnIndex);
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'hash-edit-btn';
                    btn.innerHTML = '<i class="fas fa-plus"></i>';
                    btn.title = 'Редактировать хеши';
                    btn.addEventListener('click', (e) => { e.stopPropagation(); openHashEditor(rowIndex, colIndex); });
                    // place button at the start of the cell
                    td.insertBefore(btn, td.firstChild);
                }
            });
        });

        // Make hash pills draggable
        makeHashPillsDraggable();
    }

    // Создание перетаскиваемых хэш-пиллюль
    function makeHashPillsDraggable() {
        document.querySelectorAll('td[data-hash-cell] .hash-pill').forEach(pill => {
            pill.draggable = true;
            pill.style.cursor = 'move';
            pill.title = (pill.title || '') + ' (можно перетащить)';
            
            pill.addEventListener('dragstart', (e) => {
                const hashValue = pill.querySelector('code')?.textContent || '';
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', hashValue);
                e.dataTransfer.setData('application/x-csv-hash', hashValue);
                pill.style.opacity = '0.5';
            });
            
            pill.addEventListener('dragend', (e) => {
                pill.style.opacity = '1';
            });
        });
        
        // Make hash cells accept drops
        document.querySelectorAll('td[data-hash-cell]').forEach(cell => {
            cell.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                cell.classList.add('drag-over');
            });
            
            cell.addEventListener('dragleave', (e) => {
                cell.classList.remove('drag-over');
            });
            
            cell.addEventListener('drop', (e) => {
                e.preventDefault();
                cell.classList.remove('drag-over');
                
                const hashValue = e.dataTransfer.getData('application/x-csv-hash') || e.dataTransfer.getData('text/plain');
                if (!hashValue || !hashValue.trim()) return;
                
                const rowIndex = parseInt(cell.dataset.rowIndex);
                const colIndex = parseInt(cell.dataset.columnIndex);
                
                if (isNaN(rowIndex) || isNaN(colIndex)) return;
                
                // Add hash to this cell's hash list
                addHashToCell(rowIndex, colIndex, hashValue.trim());
            });
        });
    }

    // Добавление хэша в ячейку
    function addHashToCell(rowIndex, colIndex, hashValue) {
        if (!csvData[rowIndex] || !csvData[rowIndex][colIndex]) return;
        
        // Parse current hashes
        const currentValue = String(csvData[rowIndex][colIndex]).trim();
        let hashes = parseCellHashes(currentValue);
        
        // Check if hash already exists
        const exists = hashes.some(h => h.value.toLowerCase() === hashValue.toLowerCase());
        if (exists) {
            addLogEntry(`Хэш уже существует в этом файле`, 'warning');
            return;
        }
        
        // Add new hash
        hashes.push({ value: hashValue, desc: '' });
        
        // Update CSV data
        csvData[rowIndex][colIndex] = serializeHashes(hashes);
        csvModified = true;
        updateCSVSaveButtonState();
        
        // Re-render the cell
        const cell = document.querySelector(`td[data-row-index="${rowIndex}"][data-column-index="${colIndex}"]`);
        if (cell) {
            renderHashCell(cell, hashes, rowIndex, colIndex);
            makeHashPillsDraggable(); // Re-enable dragging for new pills
        }
        
        addLogEntry(`Хэш добавлен в файл: ${csvData[rowIndex][0] || 'неизвестный'}`, 'success');
        
        // Visual feedback
        cell.style.transform = 'scale(1.05)';
        setTimeout(() => {
            cell.style.transform = '';
        }, 200);
    }

    // Отрисовка содержимого ячейки с хэшами
    function renderHashCell(cell, hashes, rowIndex, colIndex) {
        cell.innerHTML = '';
        
        // Add edit button first
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hash-edit-btn';
        btn.innerHTML = '<i class="fas fa-plus"></i>';
        btn.title = 'Редактировать хеши';
        btn.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            openHashEditor(rowIndex, colIndex); 
        });
        cell.appendChild(btn);
        
        const wrap = document.createElement('div');
        wrap.className = 'hash-pills-wrap';
        
        hashes.forEach((h) => {
            const pill = document.createElement('div');
            pill.className = 'hash-pill';
            pill.draggable = true;
            pill.style.cursor = 'move';
            
            const code = document.createElement('code');
            code.textContent = h.value;
            pill.appendChild(code);
            
            if (h.desc) {
                pill.title = h.desc + ' (можно перетащить)';
            } else {
                pill.title = 'Можно перетащить в другую строку';
            }
            
            wrap.appendChild(pill);
        });
        
        cell.appendChild(wrap);
    }

    // Получить отображаемое имя колонки
    const getCSVColumnDisplayName = (columnName) => {
        const displayNames = {
            'relativePath': 'Путь файла',
            'hash': 'Хеш',
            'size': 'Размер',
            'archiveSize': 'Размер архива',
            'lastUpdateFile': 'Последнее изменение',
            'force': 'Принудительно'
        };
        return displayNames[columnName] || columnName;
    };

    // Проверить, редактируемая ли колонка
    const isCSVColumnEditable = (columnName) => {
        // Путь файла, хеш, размеры и force не редактируются обычным способом
        const readonlyColumns = ['relativePath', 'hash', 'size', 'archiveSize', 'force'];
        return !readonlyColumns.includes(columnName);
    };

    // Получить эмодзи для force значения
    const getForceEmoji = (value) => {
        const normalizedValue = String(value).trim();
        if (normalizedValue === '1' || normalizedValue.toLowerCase() === 'true') {
            return '✅'; // Зеленая галочка
        } else {
            return '❌'; // Красный крестик
        }
    };

    // Переключить значение force (0 <-> 1)
    const toggleForceValue = (cell) => {
        const rowIndex = parseInt(cell.dataset.rowIndex);
        const colIndex = parseInt(cell.dataset.columnIndex);

        if (!csvData[rowIndex]) return;

        const currentValue = String(csvData[rowIndex][colIndex]).trim();
        const newValue = (currentValue === '1' || currentValue.toLowerCase() === 'true') ? '0' : '1';

        // Обновляем данные
        csvData[rowIndex][colIndex] = newValue;

        // Обновляем отображение
        cell.textContent = getForceEmoji(newValue);
        cell.dataset.originalValue = newValue;

        // Отмечаем как измененный
        csvModified = true;
        updateCSVSaveButtonState();

        // Добавляем визуальную анимацию
        cell.style.transform = 'scale(1.2)';
        setTimeout(() => {
            cell.style.transform = 'scale(1)';
        }, 150);
    };

    // Начать редактирование ячейки
    const startCellEdit = (cell) => {
        if (cell.classList.contains('csv-cell-editing')) {
            return; // Уже в режиме редактирования
        }

        const originalValue = cell.textContent;
        cell.classList.add('csv-cell-editing');

        // Создаем input или textarea в зависимости от длины содержимого
        const input = originalValue.length > 50 ? document.createElement('textarea') : document.createElement('input');
        input.className = 'csv-cell-input';
        input.value = originalValue;

        // Настройка для textarea
        if (input.tagName === 'TEXTAREA') {
            input.rows = 2;
        }

        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        input.select();

        // Обработчики завершения редактирования
        const finishEdit = () => {
            const newValue = input.value;
            cell.classList.remove('csv-cell-editing');
            cell.textContent = newValue;

            // Обновляем данные
            const rowIndex = parseInt(cell.dataset.rowIndex);
            const colIndex = parseInt(cell.dataset.columnIndex);

            if (csvData[rowIndex] && csvData[rowIndex][colIndex] !== newValue) {
                csvData[rowIndex][colIndex] = newValue;
                csvModified = true;
                updateCSVSaveButtonState();
            }
        };

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (!e.shiftKey || input.tagName !== 'TEXTAREA')) {
                e.preventDefault();
                finishEdit();
            } else if (e.key === 'Escape') {
                cell.classList.remove('csv-cell-editing');
                cell.textContent = originalValue; // Возвращаем исходное значение
            }
        });
    };

    // Обновить счетчик строк
    const updateRowsCount = () => {
        const count = csvData.length;
        const text = `${count} ${count === 1 ? 'строка' : count < 5 ? 'строки' : 'строк'}`;
        csvElements.rowsCountSpan.textContent = text;
    };

    // Обновить состояние кнопки сохранения
    const updateCSVSaveButtonState = () => {
        if (csvElements.saveBtn) {
            csvElements.saveBtn.disabled = !csvModified;
            if (csvModified) {
                csvElements.saveBtn.classList.add('btn-primary');
            } else {
                csvElements.saveBtn.classList.remove('btn-primary');
            }
        }
    };

    // Сохранение CSV
    const saveCSVData = async () => {
        if (!csvModified) {
            return;
        }

        try {
            csvElements.saveBtn.disabled = true;
            csvElements.saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';

            // Подготавливаем данные для сохранения
            const PAGE_SIZE = 1000;
            let dataToSave;
            const shouldUploadToFtp = csvElements.uploadToFtpCheckbox && csvElements.uploadToFtpCheckbox.checked;

            // Если мы выполняли поиск (поиск активен), то нужно применить изменения из результатов поиска
            // к полной таблице по уникальному ключу (relativePath), чтобы не перезаписать весь файл только найденными записями.
            if (window._csvSearchQuery && String(window._csvSearchQuery).trim() !== '') {
                const fullResp = await window.go.main.App.ReadArchiveCSV(csvFilePath);
                const fullHeaders = fullResp.headers || [];
                let fullData = fullResp.data || [];

                // Map header -> index for full file
                const headerIndex = {};
                fullHeaders.forEach((h, idx) => { headerIndex[h] = idx; });

                // Find index for relativePath in full headers
                const relIdxFull = headerIndex['relativePath'];

                // Build map from relativePath value to row index in fullData
                const fullIndexByRel = {};
                for (let i = 0; i < fullData.length; i++) {
                    const row = fullData[i] || [];
                    const key = (relIdxFull !== undefined && row[relIdxFull] !== undefined) ? String(row[relIdxFull]) : undefined;
                    if (key) fullIndexByRel[key] = i;
                }

                // For each row from csvData (search results), find matching full row by relativePath and merge
                // Build mapping from csv header index -> full header index
                const csvToFullIndex = {};
                csvHeaders.forEach((h, idx) => {
                    if (h in headerIndex) csvToFullIndex[idx] = headerIndex[h];
                });

                for (let r = 0; r < csvData.length; r++) {
                    const csvRow = csvData[r] || [];
                    const relVal = (csvHeaders.indexOf('relativePath') !== -1) ? csvRow[csvHeaders.indexOf('relativePath')] : undefined;
                    let targetIdx = relVal && fullIndexByRel[relVal] !== undefined ? fullIndexByRel[relVal] : -1;

                    if (targetIdx === -1) {
                        // Not found — append a new row matching fullHeaders length
                        const newRow = new Array(fullHeaders.length).fill('');
                        // Copy known columns
                        for (let c = 0; c < csvRow.length; c++) {
                            const fullIdx = csvToFullIndex[c];
                            if (fullIdx !== undefined) newRow[fullIdx] = csvRow[c];
                        }
                        fullData.push(newRow);
                    } else {
                        // Merge into existing row
                        fullData[targetIdx] = fullData[targetIdx] || new Array(fullHeaders.length).fill('');
                        for (let c = 0; c < csvRow.length; c++) {
                            const fullIdx = csvToFullIndex[c];
                            if (fullIdx === undefined) continue;
                            fullData[targetIdx][fullIdx] = csvRow[c];
                        }
                    }
                }

                dataToSave = fullData;
                csvHeaders = fullHeaders;

            } else if (window._csvTotalRows && window._csvTotalRows > PAGE_SIZE) {
                // Если CSV постраничный и у нас не вся таблица, сначала загрузим полную таблицу и вольём изменения по индексам страницы
                const fullResp = await window.go.main.App.ReadArchiveCSV(csvFilePath);
                const fullHeaders = fullResp.headers || [];
                let fullData = fullResp.data || [];

                const currentPage = window._csvPage || 1;
                // Merge current page changes into fullData by index
                for (let r = 0; r < csvData.length; r++) {
                    const globalIdx = (currentPage - 1) * PAGE_SIZE + r;
                    fullData[globalIdx] = fullData[globalIdx] || new Array(fullHeaders.length).fill('');
                    for (let c = 0; c < csvHeaders.length; c++) {
                        // Map by header name if headers match
                        const header = csvHeaders[c];
                        const destIdx = fullHeaders.indexOf(header);
                        if (destIdx === -1) continue;
                        fullData[globalIdx][destIdx] = csvData[r][c];
                    }
                }
                dataToSave = fullData;
                // ensure headers are from full file
                csvHeaders = fullHeaders;
            } else {
                dataToSave = csvData.map((row, rowIndex) => {
                    return row.map((cellValue, colIndex) => {
                        const header = csvHeaders[colIndex];
                        // Для force колонки берем оригинальное значение из DOM
                        if (header === 'force') {
                            const cell = document.querySelector(`[data-row-index="${rowIndex}"][data-column-index="${colIndex}"]`);
                            return cell ? (cell.dataset.originalValue || cellValue) : cellValue;
                        }
                        return cellValue;
                    });
                });
            }

            const csvPayload = {
                headers: csvHeaders,
                data: dataToSave,
                filePath: csvFilePath
            };

            await window.go.main.App.SaveArchiveCSV(csvPayload);

            csvModified = false;
            updateCSVSaveButtonState();
            addLogEntry(`CSV файл успешно сохранен: ${csvFilePath}`, 'success');

            // Если чекбокс отмечен, загружаем на FTP
            if (shouldUploadToFtp) {
                csvElements.saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка на FTP...';
                try {
                    // Получаем активный тенант: сначала пытаемся взять глобальный currentState, затем window.Launcher.getState(),
                    // и в последнюю очередь запрашиваем у бэкенда GetState().
                    let tenant = '';
                    try {
                        if (typeof currentState !== 'undefined' && currentState && currentState.tenant) {
                            tenant = currentState.tenant;
                        } else if (window.Launcher && typeof window.Launcher.getState === 'function') {
                            const st = window.Launcher.getState();
                            if (st && st.tenant) tenant = st.tenant;
                        }
                        // final fallback: ask backend for the state
                        if (!tenant) {
                            const stateResp = await window.go.main.App.GetState();
                            if (stateResp && stateResp.tenant) tenant = stateResp.tenant;
                        }
                    } catch (stErr) {
                        console.warn('Не удалось определить tenant из state:', stErr);
                    }

                    // If tenant is not selected, we do not block — fallback to global archiver settings will be used.

                    // Получаем конфигурацию FTP серверов.
                    // Если tenant задан — пробуем получить конфиг по tenant, иначе используем глобальные настройки архиватора.
                    let ftpServers = [];
                    try {
                        if (tenant) {
                            const archiveConfig = await window.go.main.App.GetArchiveConfig(tenant);
                            if (archiveConfig && (archiveConfig.FtpServers || archiveConfig.ftpServers)) {
                                ftpServers = archiveConfig.FtpServers || archiveConfig.ftpServers;
                            }
                        }
                        // fallback: используем глобальные настройки архиватора
                        if (!ftpServers || ftpServers.length === 0) {
                            const settings = await window.go.main.App.GetArchiverSettings();
                            ftpServers = settings && (settings.ftpConfigs || settings.FTPConfigs || settings.ftpConfigs || settings.FtpServers) ? (settings.ftpConfigs || settings.FTPConfigs || settings.ftpConfigs || settings.FtpServers) : [];
                        }
                    } catch (cfgErr) {
                        console.warn('Не удалось получить конфигурацию FTP:', cfgErr);
                    }

                    // Filter out disabled/empty FTP entries (consider an FTP config "enabled" when host is non-empty)
                    ftpServers = (ftpServers || []).filter(s => {
                        const host = s && (s.host || s.Host || '');
                        return typeof host === 'string' && host.trim() !== '';
                    });

                    addLogEntry(`Будет загружено на ${ftpServers.length} FTP сервер(ов)`, 'detail');

                    if (!ftpServers || ftpServers.length === 0) {
                        throw new Error('FTP серверы не настроены');
                    }

                    // Загружаем файл на каждый FTP сервер
                    const ftpResults = [];
                    for (let i = 0; i < ftpServers.length; i++) {
                        const ftpServer = ftpServers[i];
                        const serverName = ftpServer.name || ftpServer.Name || `FTP ${i}`;
                        try {
                            const filename = (csvFilePath.split('/').pop() || 'archive.csv');
                            const rawPath = (ftpServer.path || ftpServer.Path || ftpServer.RemotePath || '/') || '/';
                            // ensure there is exactly one slash between path and filename
                            const normalizedPath = rawPath.endsWith('/') ? rawPath : rawPath + '/';
                            const uploadPayload = {
                                serverName: serverName,
                                host: ftpServer.host || ftpServer.Host,
                                port: Number(ftpServer.port || ftpServer.Port) || 21,
                                username: ftpServer.user || ftpServer.User || ftpServer.username || ftpServer.Username || '',
                                password: ftpServer.pass || ftpServer.Pass || ftpServer.password || ftpServer.Password || '',
                                remotePath: normalizedPath + filename,
                                localPath: csvFilePath
                            };

                            addLogEntry(`Загружаем CSV на FTP ${uploadPayload.host}:${uploadPayload.port} -> ${uploadPayload.remotePath}`, 'detail');

                            const result = await window.go.main.App.UploadCsvToFtp(uploadPayload);
                            ftpResults.push(result);
                            addLogEntry(`✓ CSV загружен на FTP '${uploadPayload.serverName}': ${uploadPayload.remotePath}`, 'success');
                        } catch (ftpError) {
                            addLogEntry(`✗ Ошибка загрузки на FTP '${serverName}': ${ftpError.message || ftpError}`, 'error');
                        }
                    }
                } catch (error) {
                    console.error('Ошибка при загрузке на FTP:', error);
                    addLogEntry(`Ошибка загрузки CSV на FTP: ${error.message || error}`, 'error');
                }
            }

        } catch (error) {
            console.error('Ошибка сохранения CSV:', error);
            addLogEntry(`Ошибка сохранения CSV: ${error}`, 'error');
        } finally {
            csvElements.saveBtn.disabled = false;
            csvElements.saveBtn.innerHTML = '<i class="fas fa-save"></i> <span data-i18n="csvSave">Сохранить</span>';
            // Применяем переводы заново
            i18n.applyTranslations();
        }
    };

    // Перезагрузка CSV
    const reloadCSVData = async () => {
        if (csvModified) {
            const promptOpts = {
                title: i18n.t('csvUnsavedChanges') || 'Внимание',
                message: i18n.t('csvUnsavedChanges') || 'У вас есть несохраненные изменения. Перезагрузить файл?',
                okText: i18n.t('yes') || 'Да',
                cancelText: i18n.t('no') || 'Нет'
            };
            let ok;
            if (typeof window.showConfirm === 'function') {
                ok = await window.showConfirm(promptOpts);
            } else {
                ok = window.confirm(promptOpts.message || 'Reload file and discard changes?');
            }
            if (!ok) return;
        }

        await loadCSVData();
    };

    // Показать кнопку "Открыть CSV" после успешного завершения архивации
    const showOpenCSVButton = () => {
        if (csvElements.openCsvBtn) {
            csvElements.openCsvBtn.style.display = 'inline-flex';
        }
    };

    // Скрыть кнопку "Открыть CSV" при начале новой архивации
    const hideOpenCSVButton = () => {
        if (csvElements.openCsvBtn) {
            csvElements.openCsvBtn.style.display = 'none';
        }
    };

    // Проверка существования CSV файла и показ/скрытие кнопки
    const checkCSVFileExists = async (gameDirectory) => {
        if (!gameDirectory || !gameDirectory.trim()) {
            hideOpenCSVButton();
            return;
        }

        try {
            const csvPath = `${gameDirectory.trim()}/archive/archive.csv`.replace(/\\/g, '/');
            // Используем метод ReadArchiveCSVPage для проверки существования файла (стриминг)
            await window.go.main.App.ReadArchiveCSVPage(csvPath, 1, 1);
            // Если файл существует, показываем кнопку
            showOpenCSVButton();
        } catch (error) {
            // Если файл не существует или произошла ошибка, скрываем кнопку
            hideOpenCSVButton();
        }
    };

    async function loadInitialSettings() {
        try {
            let lang = 'ru';
            if (window.go && window.go.main.App && window.go.main.App.GetState) {
                const appState = await window.go.main.App.GetState();
                lang = appState.settings.language || 'ru';
            } else if (window.go && window.go.main.App && window.go.main.App.GetSystemLanguage) {
                lang = await window.go.main.App.GetSystemLanguage();
            }
            await i18n.setLanguage(lang);

            if (window.go && window.go.main.App && window.go.main.App.GetArchiverSettings) {
                const settings = await window.go.main.App.GetArchiverSettings();
                applySettings(settings);
                addLogEntry('Сохранённые настройки архиватора загружены.', 'info');

                // Проверяем существование CSV файла после загрузки настроек
                if (settings && settings.gamePath) {
                    await checkCSVFileExists(settings.gamePath);
                }
            }
        } catch (error) {
            addLogEntry(`Ошибка загрузки начальных настроек: ${error}`, 'error');
            await i18n.setLanguage('ru');
        }
    }

    function applySettings(settings) {
        if (!settings) return;
        elements.gamePathInput.value = settings.gamePath || '';
        elements.ignoredExtensionsInput.value = settings.ignoredExtensions || '.log, .bmp, .tmp, .bak';
        elements.skipExistingCheckbox.checked = settings.skipExisting;
        elements.uploadFtpCheckbox.checked = settings.uploadToFTP;

        // Загружаем состояние чекбокса CSV
        if (csvElements.uploadToFtpCheckbox) {
            csvElements.uploadToFtpCheckbox.checked = settings.uploadCsvToFtp || false;
        }

        const showFtp = settings.uploadToFTP;
        elements.ftpControls.style.display = showFtp ? 'flex' : 'none';
        elements.ftpServersContainer.classList.toggle('hidden', !showFtp);

        let ftpConfigs = (settings.ftpConfigs && Array.isArray(settings.ftpConfigs)) ? settings.ftpConfigs : [];
        ftpManager.loadConfigs(ftpConfigs);

        elements.ignoredFilesList.innerHTML = '';
        if (settings.ignoredFiles && Array.isArray(settings.ignoredFiles)) {
            settings.ignoredFiles.forEach(file => addIgnoredFileTag(file));
        }
    }

    function collectSettings() {
        const ignoredFiles = [];
        elements.ignoredFilesList.querySelectorAll('.ignored-item-tag').forEach(tag => {
            ignoredFiles.push(tag.dataset.path);
        });

        return {
            gamePath: elements.gamePathInput.value,
            ignoredExtensions: elements.ignoredExtensionsInput.value,
            ignoredFiles: ignoredFiles,
            skipExisting: elements.skipExistingCheckbox.checked,
            uploadToFTP: elements.uploadFtpCheckbox.checked,
            uploadCsvToFtp: csvElements.uploadToFtpCheckbox ? csvElements.uploadToFtpCheckbox.checked : false,
            ftpConfigs: ftpManager.getAllConfigs()
        };
    }

    function scheduleSaveSettings() {
        clearTimeout(saveSettingsTimeout);
        saveSettingsTimeout = setTimeout(async () => {
            try {
                const settings = collectSettings();
                await window.go.main.App.SaveArchiverSettings(settings);
            } catch (error) {
                addLogEntry(`Ошибка авто-сохранения настроек: ${error}`, 'error');
            }
        }, 500);
    }
    window.scheduleSaveSettings = scheduleSaveSettings;

    function setupAutosave() {
        const inputsToWatch = [elements.gamePathInput, elements.ignoredExtensionsInput];
        const checkboxesToWatch = [elements.skipExistingCheckbox, elements.uploadFtpCheckbox];
        
        // Добавляем CSV чекбокс если он существует
        if (csvElements.uploadToFtpCheckbox) {
            checkboxesToWatch.push(csvElements.uploadToFtpCheckbox);
        }
        
        inputsToWatch.forEach(input => input.addEventListener('input', scheduleSaveSettings));
        checkboxesToWatch.forEach(cb => cb.addEventListener('change', scheduleSaveSettings));
    }

    function updateConnectionStatus(status, message = '') {
        if (!elements.connectionStatus) return;
        elements.connectionStatus.className = 'status-text';
        const ftpBrowseBtns = document.querySelectorAll('.ftp-browse-btn');
        const ftpBrowseBtnDisabled = status === 'processing' || status === 'connecting';
        ftpBrowseBtns.forEach(btn => btn.disabled = ftpBrowseBtnDisabled);

        switch (status) {
            case 'connected':
                elements.connectionStatus.textContent = message || i18n.t('statusReady');
                elements.connectionStatus.classList.add('status-connected');
                // ИСПРАВЛЕНИЕ: Принудительно обновляем состояние кнопок
                if (elements.startBtn) {
                    elements.startBtn.disabled = false;
                    elements.startBtn.style.display = 'inline-block';
                }
                if (elements.stopBtn) {
                    elements.stopBtn.disabled = true;
                    elements.stopBtn.style.display = 'none';
                }
                break;
            case 'processing':
                elements.connectionStatus.textContent = message || 'Обработка...';
                elements.connectionStatus.classList.add('status-connecting');
                // ИСПРАВЛЕНИЕ: Принудительно обновляем состояние кнопок
                if (elements.startBtn) {
                    elements.startBtn.disabled = true;
                    elements.startBtn.style.display = 'none';
                }
                if (elements.stopBtn) {
                    elements.stopBtn.disabled = false;
                    elements.stopBtn.style.display = 'inline-block';
                }
                break;
            case 'connecting':
                elements.connectionStatus.textContent = message || 'Соединение...';
                elements.connectionStatus.classList.add('status-connecting');
                break;
            default:
                elements.connectionStatus.textContent = message || 'Ошибка соединения';
                elements.connectionStatus.classList.add('status-disconnected');
                // ИСПРАВЛЕНИЕ: Принудительно обновляем состояние кнопок
                if (elements.startBtn) {
                    elements.startBtn.disabled = true;
                    elements.startBtn.style.display = 'inline-block';
                }
                if (elements.stopBtn) {
                    elements.stopBtn.disabled = true;
                    elements.stopBtn.style.display = 'none';
                }
        }
    }

    function addLogEntry(message, type = 'info') {
        if (!elements.operationLog) return;
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        const time = document.createElement('span');
        time.className = 'log-time';
        time.textContent = new Date().toLocaleTimeString();
        const msg = document.createElement('span');
        msg.className = 'log-message';
        msg.style.whiteSpace = 'pre-wrap';
        msg.textContent = message;
        entry.appendChild(time);
        entry.appendChild(msg);
        const isScrolledToBottom = elements.operationLog.scrollHeight - elements.operationLog.clientHeight <= elements.operationLog.scrollTop + 1;
        elements.operationLog.appendChild(entry);
        if (isScrolledToBottom) {
            elements.operationLog.scrollTop = elements.operationLog.scrollHeight;
        }
    }

    const openFtpBrowser = (initialPath = "/", ftpConfig = null) => {
        if (!ftpConfig) {
            addLogEntry('Ошибка: конфигурация FTP не указана для браузера.', 'error');
            return;
        }
        elements.ftpModal.style.display = 'flex';
        loadFtpDirectory(initialPath, ftpConfig);
    };

    const closeFtpBrowser = () => {
        elements.ftpModal.style.display = 'none';
        ftpManager.currentBrowseServerIndex = -1;
    };

    const loadFtpDirectory = async (path, ftpConfig) => {
        if (!elements.ftpDirList) return;
        elements.ftpDirList.innerHTML = `<div class="ftp-dir-item-loading">${i18n.t('ftpLoading')}</div>`;
        elements.ftpModalCurrentPath.value = path;
        try {
            const entries = await window.go.main.App.FTPListDirectory(ftpConfig, path);
            renderFtpEntries(entries, path, ftpConfig);
        } catch (error) {
            elements.ftpDirList.innerHTML = `<div class="log-entry error"><span class="log-message">Ошибка: ${error}</span></div>`;
        }
    };

    const renderFtpEntries = (entries, currentPath, ftpConfig) => {
        elements.ftpDirList.innerHTML = '';
        if (currentPath !== "/" && currentPath !== "") {
            const parentDir = currentPath.substring(0, currentPath.lastIndexOf('/')) || "/";
            const upEl = document.createElement('div');
            upEl.className = 'ftp-dir-item';
            upEl.innerHTML = '<i class="fas fa-arrow-up"></i> ..';
            upEl.addEventListener('click', () => loadFtpDirectory(parentDir, ftpConfig));
            elements.ftpDirList.appendChild(upEl);
        }
        (entries || []).forEach(entryName => {
            const entryEl = document.createElement('div');
            entryEl.className = 'ftp-dir-item';
            entryEl.innerHTML = `<i class="fas fa-folder"></i> ${entryName}`;
            entryEl.addEventListener('click', () => {
                const newPath = [currentPath.replace(/\/$/, ''), entryName].join('/');
                loadFtpDirectory(newPath, ftpConfig);
            });
            elements.ftpDirList.appendChild(entryEl);
        });
    };

    window.openFtpBrowser = openFtpBrowser;
    window.addLogEntry = addLogEntry;

    // --- Обработчики событий ---

    if (elements.uploadFtpCheckbox) {
        elements.uploadFtpCheckbox.addEventListener('change', () => {
            const isChecked = elements.uploadFtpCheckbox.checked;
            elements.ftpControls.style.display = isChecked ? 'flex' : 'none';
            elements.ftpServersContainer.classList.toggle('hidden', !isChecked);
            scheduleSaveSettings();
        });
    }

    // CSV search controls wiring
    const csvSearchBtn = document.getElementById('csv-search-btn');
    const csvClearSearchBtn = document.getElementById('csv-clear-search-btn');
    const csvSearchInput = document.getElementById('csv-search-input');
    if (csvSearchBtn) {
        csvSearchBtn.addEventListener('click', async () => {
            const q = (csvSearchInput && csvSearchInput.value) ? csvSearchInput.value.trim() : '';
            await window.searchCsv(q, 1, 1000);
        });
    }
    if (csvClearSearchBtn) {
        csvClearSearchBtn.addEventListener('click', async () => {
            await window.clearCsvSearch();
        });
    }
    if (csvSearchInput) {
        csvSearchInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const q = csvSearchInput.value.trim();
                await window.searchCsv(q, 1, 1000);
            }
        });
    }

    if (elements.addFtpBtn) {
        elements.addFtpBtn.addEventListener('click', () => {
            ftpManager.addServer();
            scheduleSaveSettings();
        });
    }

    if (elements.startBtn) {
        elements.startBtn.addEventListener('click', async () => {
            if (isProcessing) return;
            const requestData = collectSettings();

            if (!requestData.gamePath) {
                addLogEntry('Укажите путь к папке с игрой!', 'error');
                elements.gamePathInput.focus();
                return;
            }

            if (requestData.uploadToFTP) {
                const activeFtpConfigs = requestData.ftpConfigs;
                if (!activeFtpConfigs || activeFtpConfigs.length === 0) {
                    addLogEntry('Для загрузки на FTP необходимо добавить хотя бы один сервер с указанием хоста и пользователя.', 'error');
                    return;
                }
                const invalidServers = activeFtpConfigs.filter(config => !config.host || !config.user);
                if (invalidServers.length > 0) {
                    addLogEntry(`У ${invalidServers.length} серверов не указан хост или имя пользователя.`, 'error');
                    return;
                }
            }

            isProcessing = true;
            hideOpenCSVButton(); // НОВОЕ: Скрываем кнопку CSV при начале архивации
            updateConnectionStatus('processing');
            // Ensure live chart updates while processing
            try { if (window.__ftpSpeedManager && typeof window.__ftpSpeedManager.setPaused === 'function') window.__ftpSpeedManager.setPaused(false); } catch (e) { }
            elements.totalFiles.textContent = '0';
            elements.processedFiles.textContent = '0';
            elements.archivedFiles.textContent = '0';
            elements.errorCount.textContent = '0';
            elements.archiveProgress.style.width = '0%';
            elements.progressPercentage.textContent = '0%';
            elements.operationLog.innerHTML = '';
            addLogEntry('Запуск процесса архивации...', 'info');

            try {
                await window.go.main.App.StartArchiveCreation(requestData);
                addLogEntry(`Архивация запущена для: ${requestData.gamePath}`, 'success');
                addLogEntry(`Пропуск существующих: ${requestData.skipExisting}`, 'detail');
                if (requestData.ignoredExtensions) addLogEntry(`Игнорируемые расширения: ${requestData.ignoredExtensions}`, 'detail');
                if (requestData.ignoredFiles && requestData.ignoredFiles.length > 0) addLogEntry(`Игнорируемые файлы: ${requestData.ignoredFiles.length}`, 'detail');
                if (requestData.uploadToFTP) {
                    const serverCount = requestData.ftpConfigs.length;
                    addLogEntry(`Загрузка на FTP включена (${serverCount} серверов)`, 'detail');
                    requestData.ftpConfigs.forEach((config, index) => {
                        addLogEntry(`  ${index + 1}. ${config.name || 'Сервер ' + (index + 1)}: ${config.host}`, 'detail');
                    });
                }
            } catch (error) {
                addLogEntry(`Ошибка запуска архивации: ${error}`, 'error');
                isProcessing = false;
                updateConnectionStatus('connected', `Ошибка: ${error}`);
            }
        });
    }

    if (elements.stopBtn) {
        elements.stopBtn.addEventListener('click', async () => {
            if (!isProcessing) return;
            addLogEntry('Попытка остановить процесс архивации...', 'warning');
            try {
                await window.go.main.App.StopArchiveCreation();
                addLogEntry('Команда на остановку отправлена.', 'info');
            } catch (error) {
                addLogEntry(`Ошибка при отправке команды на остановку: ${error}`, 'error');
                isProcessing = false;
                updateConnectionStatus('connected');
            }
        });
    }

    if (elements.clearLogBtn) {
        elements.clearLogBtn.addEventListener('click', () => {
            if (elements.operationLog) {
                elements.operationLog.innerHTML = '';
                addLogEntry('Лог очищен.', 'info');
            }
        });
    }

    if (elements.browseBtn && window.go?.main?.App?.BrowseFolder) {
        elements.browseBtn.addEventListener('click', async () => {
            try {
                const selectedPath = await window.go.main.App.BrowseFolder();
                if (selectedPath && elements.gamePathInput) {
                    elements.gamePathInput.value = selectedPath;
                    scheduleSaveSettings();
                    addLogEntry(`Выбрана директория: ${selectedPath}`, 'info');
                }
            } catch (err) {
                addLogEntry(`Ошибка выбора директории: ${err}`, 'error');
            }
        });
    }

    if (elements.addIgnoredFileBtn) elements.addIgnoredFileBtn.addEventListener('click', openFileBrowser);
    if (elements.closeFileModalBtn) elements.closeFileModalBtn.addEventListener('click', closeFileBrowser);
    if (elements.addSelectedFilesBtn) elements.addSelectedFilesBtn.addEventListener('click', addSelectedFilesToIgnoreList);

    if (elements.closeFtpModalBtn) elements.closeFtpModalBtn.addEventListener('click', closeFtpBrowser);
    if (elements.selectFtpPathBtn) {
        elements.selectFtpPathBtn.addEventListener('click', () => {
            ftpManager.setCurrentServerPath(elements.ftpModalCurrentPath.value);
            closeFtpBrowser();
        });
    }

    // CSV редактор обработчики
    if (csvElements.openCsvBtn) {
        csvElements.openCsvBtn.addEventListener('click', openCSVEditor);
    }

    if (csvElements.closeBtn) {
        csvElements.closeBtn.addEventListener('click', closeCSVEditor);
    }

    if (csvElements.saveBtn) {
        csvElements.saveBtn.addEventListener('click', saveCSVData);
    }

    if (csvElements.reloadBtn) {
        csvElements.reloadBtn.addEventListener('click', reloadCSVData);
    }

    window.addEventListener('click', (event) => {
        if (event.target === elements.ftpModal) closeFtpBrowser();
        if (event.target === elements.fileBrowserModal) closeFileBrowser();
        if (event.target === csvElements.modal) closeCSVEditor(); // НОВОЕ: Закрытие CSV модала
    });

    // CSV редактор обработчики
    if (csvElements.openCsvBtn) {
        csvElements.openCsvBtn.addEventListener('click', openCSVEditor);
    }

    if (csvElements.closeBtn) {
        csvElements.closeBtn.addEventListener('click', closeCSVEditor);
    }

    if (csvElements.saveBtn) {
        csvElements.saveBtn.addEventListener('click', saveCSVData);
    }

    if (csvElements.reloadBtn) {
        csvElements.reloadBtn.addEventListener('click', reloadCSVData);
    }

    if (window.runtime) {
        window.runtime.EventsOn('archiverStatus', (data) => {
            if (!data || typeof data.type === 'undefined') return;

            switch (data.type) {
                case 'status_update':
                    addLogEntry(data.message, data.statusType || 'info');
                    break;

                case 'progress_update':
                    if (data.totalFiles !== undefined) elements.totalFiles.textContent = data.totalFiles;
                    if (data.processedFiles !== undefined) elements.processedFiles.textContent = data.processedFiles;
                    if (data.archivedFiles !== undefined) elements.archivedFiles.textContent = data.archivedFiles;
                    if (data.errorsCount !== undefined) elements.errorCount.textContent = data.errorsCount;
                    if (data.currentProgress !== undefined) {
                        const progress = Math.max(0, Math.min(100, parseFloat(data.currentProgress)));
                        elements.archiveProgress.style.width = `${progress}%`;
                        elements.progressPercentage.textContent = `${progress.toFixed(0)}%`;
                    }
                    if (data.message && !data.message.startsWith("Архивация:") && !data.message.startsWith("Хеширование:")) {
                        addLogEntry(data.message, 'detail');
                    }
                    break;

                case 'process_complete':
                    // ИСПРАВЛЕНИЕ: Принудительно сбрасываем состояние
                    isProcessing = false;
                    updateConnectionStatus('connected', 'Завершено');
                    showOpenCSVButton(); // НОВОЕ: Показываем кнопку CSV после завершения
                    if (data.errorsCount !== undefined) elements.errorCount.textContent = data.errorsCount;
                    elements.archiveProgress.style.width = '100%';
                    elements.progressPercentage.textContent = '100%';
                    addLogEntry(data.message || 'Процесс архивации успешно завершен.', 'success');
                    if (data.totalDurationString) addLogEntry(`Общее время выполнения: ${data.totalDurationString}`, 'info');

                    // ИСПРАВЛЕНИЕ: Принудительно обновляем UI состояние
                    if (elements.startBtn) {
                        elements.startBtn.disabled = false;
                        elements.startBtn.style.display = 'inline-block';
                    }
                    if (elements.stopBtn) {
                        elements.stopBtn.disabled = true;
                        elements.stopBtn.style.display = 'none';
                    }
                    // Stop live updates so user can inspect final graph
                    try { if (window.__ftpSpeedManager && typeof window.__ftpSpeedManager.setPaused === 'function') window.__ftpSpeedManager.setPaused(true); } catch (e) { }
                    break;

                case 'process_error':
                    // ИСПРАВЛЕНИЕ: Принудительно сбрасываем состояние
                    isProcessing = false;
                    updateConnectionStatus('connected', 'Ошибка');
                    addLogEntry(data.message || 'Операция завершена с ошибкой.', 'error');
                    if (data.errorsCount !== undefined) elements.errorCount.textContent = data.errorsCount;
                    if (data.totalDurationString) addLogEntry(`Общее время выполнения до ошибки: ${data.totalDurationString}`, 'info');

                    // ИСПРАВЛЕНИЕ: Принудительно обновляем UI состояние
                    if (elements.startBtn) {
                        elements.startBtn.disabled = false;
                        elements.startBtn.style.display = 'inline-block';
                    }
                    if (elements.stopBtn) {
                        elements.stopBtn.disabled = true;
                        elements.stopBtn.style.display = 'none';
                    }
                    // Pause chart updates on error
                    try { if (window.__ftpSpeedManager && typeof window.__ftpSpeedManager.setPaused === 'function') window.__ftpSpeedManager.setPaused(true); } catch (e) { }
                    break;

                case 'process_cancelled':
                    // ИСПРАВЛЕНИЕ: Принудительно сбрасываем состояние
                    isProcessing = false;
                    updateConnectionStatus('connected', 'Отменено');
                    addLogEntry(data.message || 'Операция отменена пользователем.', 'warning');
                    if (data.errorsCount !== undefined) elements.errorCount.textContent = data.errorsCount;
                    if (data.totalDurationString) addLogEntry(`Общее время выполнения до отмены: ${data.totalDurationString}`, 'info');

                    // ИСПРАВЛЕНИЕ: Принудительно обновляем UI состояние
                    if (elements.startBtn) {
                        elements.startBtn.disabled = false;
                        elements.startBtn.style.display = 'inline-block';
                    }
                    if (elements.stopBtn) {
                        elements.stopBtn.disabled = true;
                        elements.stopBtn.style.display = 'none';
                    }
                    // Pause chart updates on cancel
                    try { if (window.__ftpSpeedManager && typeof window.__ftpSpeedManager.setPaused === 'function') window.__ftpSpeedManager.setPaused(true); } catch (e) { }
                    break;

                case 'file_error':
                    if (data.message) addLogEntry(data.message, 'error');
                    if (data.errorsCount !== undefined) elements.errorCount.textContent = data.errorsCount;
                    break;
            }
        });
    } else {
        addLogEntry('Система событий Wails (window.runtime) не доступна.', 'warning');
    }

    // Listen for FTP speed samples emitted from Go
    if (window.runtime) {
        window.runtime.EventsOn('ftpSpeed', (payload) => {
            try {
                if (!payload) return;
                // payload expected: { server: string, bytesPerSecond: number }
                const bps = Number(payload.bytesPerSecond) || 0;
                console.debug('ftpSpeed event received', payload);

                // Update simple UI stats even if chart helper is not present
                try {
                    // Maintain a small sample array on window for avg/max
                    if (!window._ftpSamples) window._ftpSamples = [];
                    const samples = window._ftpSamples;
                    samples.push(bps);
                    if (samples.length > 120) samples.shift();

                    const max = samples.length ? Math.max(...samples) : 0;
                    const avg = samples.length ? (samples.reduce((a, b) => a + b, 0) / samples.length) : 0;

                    const fmt = (v) => {
                        if (v === 0) return '0 KB/s';
                        if (v < 1024) return `${Math.round(v)} B/s`;
                        if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB/s`;
                        return `${(v / 1024 / 1024).toFixed(2)} MB/s`;
                    };

                    const curEl = document.getElementById('ftp-current-speed');
                    const maxEl = document.getElementById('ftp-max-speed');
                    const avgEl = document.getElementById('ftp-avg-speed');
                    const recent = document.getElementById('recent-speeds');

                    if (curEl) curEl.textContent = fmt(bps);
                    if (maxEl) maxEl.textContent = fmt(max);
                    if (avgEl) avgEl.textContent = fmt(avg);
                    if (recent) {
                        const ts = new Date().toLocaleTimeString();
                        const line = document.createElement('div');
                        line.textContent = `${ts} ${payload.server ? '[' + payload.server + '] ' : ''}— ${fmt(bps)}`;
                        recent.prepend(line);
                        while (recent.children.length > 200) recent.removeChild(recent.lastChild);
                    }
                } catch (e) { console.warn('ftpSpeed UI update failed', e); }

                // forward to chart helper if available
                if (typeof window.pushFtpSpeed === 'function') window.pushFtpSpeed(bps);
            } catch (e) {
                console.warn('Error handling ftpSpeed event', e);
            }
        });
    }

    loadInitialSettings().then(() => {
        updateConnectionStatus('connected');
        setupAutosave();
    });

    // ====== РЕДАКТОР МНОЖЕСТВЕННЫХ ХЕШЕЙ ======
    const hashModal = document.getElementById('hash-editor-modal');
    const closeHashBtn = document.getElementById('close-hash-editor-btn');
    const saveHashBtn = document.getElementById('save-hash-list-btn');
    const cancelHashBtn = document.getElementById('cancel-hash-list-btn');
    const dropZone = document.getElementById('hash-drop-zone');
    const fileInput = document.getElementById('hash-file-input');
    // manual add controls removed per user request
    const manualHashInput = null;
    const hashTableBody = document.querySelector('#hash-list-table tbody');
    const hashFileLabel = document.getElementById('hash-editor-file');

    function parseCellHashes(raw) {
        raw = (raw || '').trim();
        if (!raw) return [];
        if (raw.startsWith('[') && raw.endsWith(']')) {
            const inner = raw.slice(1, -1).trim();
            if (!inner) return [];
            return inner.split(',').map(h => ({ value: h.trim(), desc: '' })).filter(h => h.value);
        }
        return [{ value: raw, desc: '' }];
    }
    function serializeHashes(list) {
        const arr = list.map(h => h.value.trim()).filter(Boolean);
        if (arr.length === 0) return '';
        if (arr.length === 1) return arr[0];
        return '[' + arr.join(',') + ']';
    }
    function rebuildHashTable() {
        hashTableBody.innerHTML = '';
        if (hashEditorState.hashes.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 3; td.style.textAlign = 'center'; td.style.opacity = '.6'; td.textContent = 'Список пуст';
            tr.appendChild(td); hashTableBody.appendChild(tr); return;
        }
        hashEditorState.hashes.forEach((h, idx) => {
            const tr = document.createElement('tr');
            const tdHash = document.createElement('td'); tdHash.innerHTML = `<code>${escapeHtml(h.value)}</code>`; tr.appendChild(tdHash);
            const tdAct = document.createElement('td'); tdAct.style.textAlign = 'center';
            const del = document.createElement('button'); del.className = 'hash-remove-btn no-drag'; del.innerHTML = '<i class="fas fa-trash"></i>'; del.addEventListener('click', () => { hashEditorState.hashes.splice(idx, 1); rebuildHashTable(); }); tdAct.appendChild(del); tr.appendChild(tdAct);
            hashTableBody.appendChild(tr);
        });
    }
    function openHashEditor(rowIndex, colIndex) {
        hashEditorState.rowIndex = rowIndex;
        hashEditorState.colIndex = colIndex;
        const relIdx = csvHeaders.indexOf('relativePath');
        hashEditorState.relativePath = relIdx !== -1 ? (csvData[rowIndex] ? csvData[rowIndex][relIdx] : '') : '';
        const raw = csvData[rowIndex][colIndex] || '';
        hashEditorState.hashes = parseCellHashes(raw);
        hashFileLabel.textContent = hashEditorState.relativePath || '';
        rebuildHashTable();
        hashModal.style.display = 'flex';
    }
    function closeHashEditor() {
        hashModal.style.display = 'none';
    }
    if (closeHashBtn) closeHashBtn.addEventListener('click', closeHashEditor);
    if (cancelHashBtn) cancelHashBtn.addEventListener('click', closeHashEditor);
    window.addEventListener('click', (e) => { if (e.target === hashModal) closeHashEditor(); });
    if (saveHashBtn) saveHashBtn.addEventListener('click', () => {
        if (hashEditorState.rowIndex == null) return;
        const serialized = serializeHashes(hashEditorState.hashes);
        csvData[hashEditorState.rowIndex][hashEditorState.colIndex] = serialized;
        csvModified = true; updateCSVSaveButtonState();
        renderCSVTable();
        closeHashEditor();
    });
    // manual add removed
    function handleFiles(files) {
        if (!files || files.length === 0) return;
        const file = files[0];
        // Try backend hashing via path
        if (file && file.path && window.go?.main?.App?.CalculateFileHash) {
            window.go.main.App.CalculateFileHash(file.path).then(hash => {
                if (hash && !hashEditorState.hashes.find(h => h.value === hash)) {
                    hashEditorState.hashes.push({ value: hash });
                    rebuildHashTable();
                }
            }).catch(err => console.warn('hash error', err));
        } else {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const buf = new Uint8Array(reader.result);
                    // Предпочитаем прямой хеш содержимого ([]byte) если привязан
                    if (window.go?.main?.App?.CalculateFileContentHash) {
                        // Преобразуем Uint8Array -> обычный массив чисел, иначе мост может сериализовать как объект и Go получит json object
                        window.go.main.App.CalculateFileContentHash(Array.from(buf)).then(addHashIfNew).catch(err => {
                            console.warn('hash content error', err);
                        });
                    } else if (window.go?.main?.App?.CalculateBytesHash) { // fallback: base64 -> backend
                        const b64 = arrayBufferToBase64(buf);
                        window.go.main.App.CalculateBytesHash(b64).then(addHashIfNew).catch(err => {
                            console.warn('hash bytes error (base64)', err);
                        });
                    } else {
                        console.warn('Нет доступного метода для вычисления хеша (CalculateFileContentHash / CalculateBytesHash)');
                    }
                } catch (e) { console.warn(e); }
            };
            reader.readAsArrayBuffer(file);
        }
    }
    function addHashIfNew(hash) {
        if (!hash) return;
        if (!hashEditorState.hashes.find(h => h.value === hash)) {
            hashEditorState.hashes.push({ value: hash });
            rebuildHashTable();
        }
    }
    // Convert Uint8Array to base64 so it can be passed to Go []byte (JSON expects base64 string)
    function arrayBufferToBase64(u8) {
        const chunk = 0x8000;
        let index = 0;
        const len = u8.length;
        let binary = '';
        while (index < len) {
            const slice = u8.subarray(index, Math.min(index + chunk, len));
            binary += String.fromCharCode.apply(null, slice);
            index += slice.length;
        }
        return btoa(binary);
    }
    if (dropZone) {
        dropZone.addEventListener('click', () => fileInput && fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
    }
    if (fileInput) fileInput.addEventListener('change', () => handleFiles(fileInput.files));

});