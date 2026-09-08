(() => {
    const KNOWN_TOP_LEVEL_KEYS = new Set([
        'download',
        'application',
        'setting',
        'lastLauncherVersion',
        'launcherLink',
        'autologin',
        'news',
        'translationPaths',
        'onUpdateCompleteTriggers'
    ]);

    const elements = {};
    const state = {
        config: createEmptyConfig(),
        extras: {},
        lastLoadedSource: '',
        preview: {
            language: 'ru',
            selectedApp: null
        }
    };

    const LANGUAGE_OPTIONS = [
        { code: 'ru', label: 'Русский', description: 'Russian' },
        { code: 'en', label: 'English', description: 'English' },
        { code: 'es', label: 'Español', description: 'Spanish' },
        { code: 'el', label: 'Ελληνικά', description: 'Greek' },
        { code: 'uk', label: 'Українська', description: 'Ukrainian' },
        { code: 'pt', label: 'Português', description: 'Portuguese' }
    ];

    const DEFAULT_APP_NAME_FALLBACK = 'Новый запуск';

    const DEFAULT_APP_TRANSLATIONS = {
        ru: 'Играть',
        en: 'Play',
        es: 'Jugar',
        pt: 'Jogar',
        uk: 'Грати',
        el: 'Παίξτε'
    };

    const DEFAULT_APP_LANGUAGE_CODES = Array.from(
        new Set([
            ...LANGUAGE_OPTIONS.map(({ code }) => code),
            ...Object.keys(DEFAULT_APP_TRANSLATIONS)
        ])
    );

    const getLanguageLabel = (code) => {
        const option = LANGUAGE_OPTIONS.find((item) => item.code === code);
        return option ? option.label : code?.toUpperCase?.() || code || '';
    };

    let languagePickerControl = null;

    const navigateBack = () => {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = '/admin-dashboard.html';
        }
    };

    const ensureLanguagePicker = () => {
        if (languagePickerControl) return languagePickerControl;

        const modal = document.getElementById('language-picker-modal');
        if (!modal) return null;
        const optionsContainer = modal.querySelector('.language-picker__options');
        const cancelBtn = modal.querySelector('[data-action="language-cancel"]');

        if (optionsContainer && optionsContainer.children.length === 0) {
            LANGUAGE_OPTIONS.forEach(({ code, label, description }) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'language-picker__option';
                button.dataset.lang = code;
                button.innerHTML = `
                    <span class="language-picker__code">${code}</span>
                    <span class="language-picker__label">${label}</span>
                    <span class="language-picker__description">${description}</span>
                `;
                optionsContainer.appendChild(button);
            });
        }

        let resolver = null;
        let previousActive = null;

        const dispatchClose = (value) => {
            if (!modal.classList.contains('language-picker--open')) return;
            modal.classList.remove('language-picker--open');
            modal.setAttribute('aria-hidden', 'true');

            const resolve = resolver;
            resolver = null;
            if (typeof resolve === 'function') {
                resolve(value ?? null);
            }

            if (previousActive && typeof previousActive.focus === 'function') {
                setTimeout(() => previousActive.focus(), 0);
            }
        };

        const open = (existingSet) => {
            const set = existingSet instanceof Set ? existingSet : new Set(existingSet || []);
            if (modal.classList.contains('language-picker--open')) {
                return Promise.resolve(null);
            }

            previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;

            return new Promise((resolve) => {
                resolver = resolve;
                modal.classList.add('language-picker--open');
                modal.setAttribute('aria-hidden', 'false');

                let hasAvailable = false;
                optionsContainer?.querySelectorAll('[data-lang]').forEach((button) => {
                    const disabled = set.has(button.dataset.lang);
                    button.disabled = disabled;
                    button.classList.toggle('language-picker__option--disabled', disabled);
                    if (!disabled) {
                        hasAvailable = true;
                    }
                });

                if (!hasAvailable) {
                    setTimeout(() => {
                        setStatus('warning', 'Все доступные языки уже добавлены.');
                        dispatchClose(null);
                    }, 0);
                    return;
                }

                setTimeout(() => {
                    const firstEnabled = optionsContainer?.querySelector('[data-lang]:not([disabled])');
                    firstEnabled?.focus();
                }, 0);
            });
        };

        optionsContainer?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-lang]');
            if (!button || button.disabled) return;
            dispatchClose(button.dataset.lang);
        });

        cancelBtn?.addEventListener('click', () => dispatchClose(null));

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                dispatchClose(null);
            }
        });

        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('language-picker--open')) {
                event.preventDefault();
                dispatchClose(null);
            }
        });

        languagePickerControl = {
            open,
            close: () => dispatchClose(null),
            isOpen: () => modal.classList.contains('language-picker--open')
        };

        return languagePickerControl;
    };

    const isLanguagePickerOpen = () => Boolean(languagePickerControl?.isOpen?.());

    const closeLanguagePicker = () => {
        if (languagePickerControl?.isOpen?.()) {
            languagePickerControl.close();
            return true;
        }
        return false;
    };

    const isFn = (fn) => typeof fn === 'function';
    const byId = (id) => elements[id] || (elements[id] = document.getElementById(id));

    const attachHotkeys = () => {
        if (window.__adminHotkeysAttached) return;
        window.__adminHotkeysAttached = true;
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (isLanguagePickerOpen()) {
                    event.preventDefault();
                    closeLanguagePicker();
                    return;
                }
                const active = document.activeElement;
                if (active && (active.isContentEditable || ['input', 'textarea', 'select'].includes(active.tagName?.toLowerCase()))) {
                    active.blur();
                }
                event.preventDefault();
                navigateBack();
            } else if (event.key === 'F1') {
                event.preventDefault();
                if (!window.location.pathname.endsWith('/admin-dashboard.html')) {
                    window.location.href = '/admin-dashboard.html';
                }
            } else if (event.key === 'F2') {
                event.preventDefault();
                if (!window.location.pathname.endsWith('/launcher-editor.html')) {
                    window.location.href = '/launcher-editor.html';
                }
            }
        });
    };
    const enterAdminFullscreen = async () => {
        try {
            if (typeof window.go?.main?.App?.EnterAdminView === 'function') {
                await window.go.main.App.EnterAdminView();
            }
        } catch (_) {
            /* ignore */
        }
    };

    function createEmptyConfig() {
        return {
            download: {
                csv: [''],
                archives: ['']
            },
            application: [],
            setting: {
                downloadType: 'random'
            },
            lastLauncherVersion: '',
            launcherLink: '',
            autologin: { pattern: '' },
            news: {},
            translationPaths: {},
            onUpdateCompleteTriggers: []
        };
    }

    const deepClone = (value) => {
        if (typeof structuredClone === 'function') {
            return structuredClone(value);
        }
        return JSON.parse(JSON.stringify(value));
    };

    const makeUid = (prefix) => {
        if (window.crypto?.randomUUID) {
            return `${prefix}-${crypto.randomUUID()}`;
        }
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    };

    const escapeHtml = (str) => String(str ?? '').replace(/[&<>"]+/g, (s) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;'
    })[s]);

    const setStatus = (type, message) => {
        const statusEl = byId('status-bar');
        if (!statusEl) return;
        statusEl.classList.remove('success', 'error');
        if (type) statusEl.classList.add(type);
        statusEl.textContent = message;
    };

    const syntaxHighlightJson = (value) => {
        let jsonString;
        try {
            jsonString = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        } catch (err) {
            return null;
        }
        if (typeof jsonString !== 'string') {
            return null;
        }
        const escaped = jsonString
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return escaped.replace(/("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:)|("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?/g, (match) => {
            if (/^".*"\s*:$/.test(match)) {
                return `<span class="json-key">${match}</span>`;
            }
            if (/^"/.test(match)) {
                return `<span class="json-string">${match}</span>`;
            }
            if (/true|false/.test(match)) {
                return `<span class="json-boolean">${match}</span>`;
            }
            if (/null/.test(match)) {
                return `<span class="json-null">${match}</span>`;
            }
            return `<span class="json-number">${match}</span>`;
        });
    };

    const collectPreviewLanguages = () => {
        const languages = new Set();
        state.config.application.forEach((app) => {
            Object.keys(app.translations || {}).forEach((lang) => {
                if (lang) languages.add(lang);
            });
        });
        Object.keys(state.config.translationPaths || {}).forEach((lang) => {
            if (lang) languages.add(lang);
        });
        Object.keys(state.config.news || {}).forEach((lang) => {
            if (lang) languages.add(lang);
        });
        if (languages.size === 0) {
            languages.add('ru');
        }
        return Array.from(languages);
    };

    const resolveAppTitle = (app, lang, fallbackIndex) => {
        const translations = app.translations || {};
        if (translations[lang]) return translations[lang];
        if (translations.ru) return translations.ru;
        const first = Object.values(translations)[0];
        if (first) return first;
        return `Запуск #${fallbackIndex + 1}`;
    };

    const formatTriggerChip = (trigger) => {
        const name = String(trigger?.name || 'custom');
        const lower = name.toLowerCase();
        if (lower === 'copy') {
            const src = String(trigger?.param?.src ?? '').trim();
            const dst = String(trigger?.param?.dst ?? '').trim();
            const hash = trigger?.param?.hashCheck ? ' · hash' : '';
            const direction = src || dst ? `${escapeHtml(src || '—')} → ${escapeHtml(dst || '—')}` : 'без путей';
            return `<span class="preview-chip"><span class="preview-chip__label">copy</span><span class="preview-chip__meta">${direction}${hash}</span></span>`;
        }
        if (lower === 'startgamereport') {
            const url = String(trigger?.param?.url ?? trigger?.extra?.url ?? '').trim();
            return `<span class="preview-chip"><span class="preview-chip__label">StartGameReport</span><span class="preview-chip__meta">${escapeHtml(url || 'без URL')}</span></span>`;
        }
        if (lower === 'windowminimize' || lower === 'windowclose') {
            return `<span class="preview-chip"><span class="preview-chip__label">${escapeHtml(name)}</span><span class="preview-chip__meta">оконное действие</span></span>`;
        }
        return `<span class="preview-chip preview-chip--unknown"><span class="preview-chip__label">${escapeHtml(name)}</span><span class="preview-chip__meta">кастомный</span></span>`;
    };

    const TRIGGER_CATALOG = [
        {
            name: 'copy',
            selectLabel: 'copy · Копирование файлов',
            title: 'Копирование файлов перед запуском',
            description: 'Скопировать файлы из папки лаунчера в клиент перед стартом. Если оставить поля пустыми — триггер будет проигнорирован.',
            create: () => ({
                param: { src: '', dst: '', hashCheck: false },
                extra: {}
            }),
            showAdvanced: true
        },
        {
            name: 'WindowMinimize',
            selectLabel: 'WindowMinimize · Свернуть лаунчер',
            title: 'Сворачивание окна лаунчера',
            description: 'Сворачивает окно лаунчера сразу после запуска игры. Полей для настройки нет.',
            create: () => ({
                param: null,
                extra: {}
            }),
            showAdvanced: false
        },
        {
            name: 'WindowClose',
            selectLabel: 'WindowClose · Закрыть лаунчер',
            title: 'Закрытие лаунчера',
            description: 'Закрывает лаунчер через небольшую задержку после запуска игры. Полей для настройки нет.',
            create: () => ({
                param: null,
                extra: {}
            }),
            showAdvanced: false
        },
        {
            name: 'StartGameReport',
            selectLabel: 'StartGameReport · Отчёт о запуске',
            title: 'HTTP-запрос после запуска игры',
            description: 'Отправляет GET-запрос на указанный URL. Сервер получает информацию о запуске игры.',
            create: () => ({
                param: { url: '' },
                extra: {}
            }),
            showAdvanced: true
        }
    ];

    const TRIGGER_CATALOG_MAP = TRIGGER_CATALOG.reduce((acc, item) => {
        acc[item.name] = item;
        return acc;
    }, {});

    const UPDATE_TRIGGER_OPTIONS = [
        {
            value: 'translationPaths',
            title: 'Перекопировать переводы',
            description: 'После обновления клиентских файлов копирует локализации согласно разделу «Переводы».'
        }
    ];

    function getTriggerDefaults(name) {
        const catalogEntry = TRIGGER_CATALOG_MAP[name];
        if (!catalogEntry) {
            return {
                name,
                param: null,
                extra: {}
            };
        }
        const blueprint = catalogEntry.create ? catalogEntry.create() : {};
        return {
            name,
            param: blueprint && typeof blueprint.param === 'object' ? deepClone(blueprint.param) : null,
            extra: blueprint && typeof blueprint.extra === 'object' ? deepClone(blueprint.extra) : {}
        };
    }

    function createTriggerOfType(name) {
        const defaults = getTriggerDefaults(name);
        return {
            __uid: makeUid('trigger'),
            name: defaults.name,
            param: defaults.param,
            extra: defaults.extra
        };
    }

    function defaultCopyTrigger() {
        return createTriggerOfType('copy');
    }

    function normalizeTrigger(input) {
        const clone = deepClone(input || {});
        delete clone.__uid;
        const normalized = {
            __uid: makeUid('trigger'),
            name: '',
            param: null,
            extra: {}
        };

        if (typeof clone.name === 'string') {
            normalized.name = clone.name;
        }
        delete clone.name;

        const lower = normalized.name.toLowerCase();
        if (lower === 'copy') {
            const base = (clone.param && typeof clone.param === 'object') ? deepClone(clone.param) : {};
            if (!base.src && typeof clone.src === 'string') base.src = clone.src;
            if (!base.dst && typeof clone.dst === 'string') base.dst = clone.dst;
            if (base.hashCheck === undefined && typeof clone.hashCheck === 'boolean') base.hashCheck = clone.hashCheck;
            normalized.param = {
                src: String(base.src ?? ''),
                dst: String(base.dst ?? ''),
                hashCheck: Boolean(base.hashCheck)
            };
            delete clone.param;
            delete clone.src;
            delete clone.dst;
            delete clone.hashCheck;
        } else if (lower === 'windowminimize' || lower === 'windowclose') {
            normalized.param = null;
            delete clone.param;
        } else if (lower === 'startgamereport') {
            const base = (clone.param && typeof clone.param === 'object') ? deepClone(clone.param) : {};
            if (!base.url && typeof clone.url === 'string') base.url = clone.url;
            normalized.param = {
                url: String(base.url ?? '')
            };
            delete clone.param;
            delete clone.url;
        } else if (clone.param && typeof clone.param === 'object') {
            normalized.param = deepClone(clone.param);
            delete clone.param;
        }

        if (Object.keys(clone).length > 0) {
            normalized.extra = clone;
        }

        return normalized;
    }

    function normalizeApplication(entry) {
        const clone = deepClone(entry || {});
        delete clone.__uid;
        const normalized = {
            __uid: makeUid('app'),
            translations: {},
            exe: String(clone.exe ?? ''),
            args: String(clone.args ?? ''),
            triggers: [],
            extra: {}
        };

        if (Array.isArray(clone.name) && clone.name.length > 0 && typeof clone.name[0] === 'object') {
            Object.entries(clone.name[0]).forEach(([lang, value]) => {
                normalized.translations[lang] = String(value ?? '');
            });
        } else if (typeof clone.name === 'string') {
            normalized.translations = { ru: String(clone.name) };
        } else {
            normalized.translations = { ru: '' };
        }
        delete clone.name;

        if (Array.isArray(clone.trigger)) {
            normalized.triggers = clone.trigger.map(normalizeTrigger);
        } else if (clone.trigger && typeof clone.trigger === 'object') {
            normalized.triggers = [normalizeTrigger(clone.trigger)];
        }
        delete clone.trigger;

        delete clone.exe;
        delete clone.args;

        if (Object.keys(clone).length > 0) {
            normalized.extra = clone;
        }

        return normalized;
    }

    function buildDefaultAppTranslations() {
        const translations = {};
        DEFAULT_APP_LANGUAGE_CODES.forEach((code) => {
            translations[code] = DEFAULT_APP_TRANSLATIONS[code] ?? DEFAULT_APP_NAME_FALLBACK;
        });
        return translations;
    }

    function createDefaultApplicationEntry() {
        return normalizeApplication({
            name: [buildDefaultAppTranslations()],
            exe: 'system/l2.exe',
            trigger: []
        });
    }

    function normalizeTranslationPaths(input) {
        const result = {};
        if (!input || typeof input !== 'object') return result;
        Object.entries(input).forEach(([lang, value]) => {
            const clone = (value && typeof value === 'object') ? deepClone(value) : {};
            const entry = {
                srcPath: String(clone.srcPath ?? ''),
                dstPath: String(clone.dstPath ?? ''),
                default: Boolean(clone.default),
                extra: {}
            };
            delete clone.srcPath;
            delete clone.dstPath;
            delete clone.default;
            if (Object.keys(clone).length > 0) {
                entry.extra = clone;
            }
            result[lang] = entry;
        });
        return result;
    }

    function normalizeNews(input) {
        const result = {};
        if (!input || typeof input !== 'object') return result;
        Object.entries(input).forEach(([lang, list]) => {
            const newsEntries = Array.isArray(list) ? list : [];
            result[lang] = newsEntries.map((item) => {
                const clone = deepClone(item || {});
                delete clone.__uid;
                const entry = {
                    __uid: makeUid('news'),
                    name: String(clone.name ?? ''),
                    description: String(clone.description ?? ''),
                    image: String(clone.image ?? ''),
                    link: String(clone.link ?? ''),
                    date: String(clone.date ?? ''),
                    extra: {}
                };
                delete clone.name;
                delete clone.description;
                delete clone.image;
                delete clone.link;
                delete clone.date;
                if (Object.keys(clone).length > 0) {
                    entry.extra = clone;
                }
                return entry;
            });
        });
        return result;
    }

    function normalizeConfig(raw) {
        const clone = deepClone(raw || {});
        const extras = {};
        Object.keys(clone).forEach((key) => {
            if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
                extras[key] = clone[key];
            }
        });

        const normalized = createEmptyConfig();
        const download = clone.download && typeof clone.download === 'object' ? clone.download : {};
        
        // Normalize download.csv and download.archives to support both strings and objects with countries/urls
        const normalizeDownloadList = (list) => {
            if (!Array.isArray(list)) return [];
            return list.map((item) => {
                if (typeof item === 'string') {
                    return item;
                } else if (item && typeof item === 'object') {
                    const countries = Array.isArray(item.countries) ? item.countries : [];
                    // Поддерживаем оба формата: urls и url (для обратной совместимости)
                    let urls = item.urls || (item.url ? [item.url] : []);
                    if (!Array.isArray(urls)) {
                        urls = urls ? [urls] : [];
                    }
                    
                    // Если есть страны - сохраняем как объект
                    if (countries.length > 0) {
                        return {
                            countries: countries,
                            urls: urls.filter(u => u)
                        };
                    }
                    
                    // Если одна ссылка и нет стран - возвращаем строку
                    if (urls.length === 1) {
                        return urls[0] || '';
                    }
                    
                    // Если несколько ссылок - сохраняем как объект
                    if (urls.length > 1) {
                        return {
                            urls: urls.filter(u => u)
                        };
                    }
                }
                return '';
            });
        };
        
        normalized.download.csv = normalizeDownloadList(download.csv);
        normalized.download.archives = normalizeDownloadList(download.archives);
        if (normalized.download.csv.length === 0) normalized.download.csv.push('');
        if (normalized.download.archives.length === 0) normalized.download.archives.push('');

        normalized.application = Array.isArray(clone.application) ? clone.application.map(normalizeApplication) : [];
        
        // Normalize setting
        const setting = clone.setting && typeof clone.setting === 'object' ? clone.setting : {};
        const allowedDownloadTypes = new Set(['random', 'round-robin', 'health-based', 'failover']);
        normalized.setting = {
            downloadType: String(setting.downloadType ?? 'random')
        };
        // Validate downloadType
        if (!allowedDownloadTypes.has(normalized.setting.downloadType)) {
            normalized.setting.downloadType = 'random';
        }
        
        normalized.lastLauncherVersion = String(clone.lastLauncherVersion ?? '');
        normalized.launcherLink = String(clone.launcherLink ?? '');
        normalized.autologin = {
            pattern: String(clone?.autologin?.pattern ?? '')
        };
        normalized.translationPaths = normalizeTranslationPaths(clone.translationPaths);
        normalized.news = normalizeNews(clone.news);
        const allowedUpdateTriggers = new Set(UPDATE_TRIGGER_OPTIONS.map((option) => option.value));
        normalized.onUpdateCompleteTriggers = Array.isArray(clone.onUpdateCompleteTriggers)
            ? clone.onUpdateCompleteTriggers
                .map((item) => String(item ?? ''))
                .filter((value) => allowedUpdateTriggers.has(value))
            : [];

        return { config: normalized, extras };
    }

    function buildTriggerForExport(trigger) {
        const output = { name: trigger.name };
        if (trigger.param && typeof trigger.param === 'object') {
            const clone = deepClone(trigger.param);
            if (trigger.name.toLowerCase() === 'copy') {
                clone.src = clone.src ?? '';
                clone.dst = clone.dst ?? '';
                clone.hashCheck = Boolean(clone.hashCheck);
            }
            if (Object.keys(clone).length > 0) {
                output.param = clone;
            }
        }
        if (trigger.extra && typeof trigger.extra === 'object') {
            Object.entries(trigger.extra).forEach(([key, value]) => {
                output[key] = value;
            });
        }
        return output;
    }

    function buildConfigForExport() {
        const result = deepClone(state.extras || {});
        const cfg = state.config;
        
        // Helper to export download items (support both strings and objects with countries/urls)
        const exportDownloadList = (list) => {
            return list
                .map((item) => {
                    if (typeof item === 'string') {
                        return item.trim();
                    } else if (item && typeof item === 'object') {
                        const countries = Array.isArray(item.countries) ? item.countries.filter((c) => String(c).trim()) : [];
                        // Поддерживаем оба формата: urls и url
                        let urls = item.urls || (item.url ? [item.url] : []);
                        if (!Array.isArray(urls)) {
                            urls = urls ? [urls] : [];
                        }
                        urls = urls.map(u => String(u).trim()).filter(u => u);
                        
                        // Если есть страны - возвращаем объект
                        if (countries.length > 0 && urls.length > 0) {
                            return {
                                countries: countries,
                                urls: urls
                            };
                        }
                        
                        // Если только ссылки - возвращаем их
                        if (urls.length === 1) {
                            return urls[0];
                        }
                        if (urls.length > 1) {
                            return {
                                urls: urls
                            };
                        }
                    }
                    return '';
                })
                .filter((item, idx, arr) => {
                    if (typeof item === 'string') {
                        return item || arr.length === 1;
                    }
                    if (Array.isArray(item)) {
                        return item.length > 0;
                    }
                    return item && (item.urls || item.url); // Keep objects with valid URLs
                });
        };
        
        result.download = {
            csv: exportDownloadList(cfg.download.csv),
            archives: exportDownloadList(cfg.download.archives)
        };
        result.application = cfg.application.map((app) => {
            const out = deepClone(app.extra || {});
            const translations = {};
            Object.entries(app.translations || {}).forEach(([lang, value]) => {
                translations[lang] = String(value ?? '');
            });
            out.name = [translations];
            out.exe = String(app.exe ?? '').trim();
            out.args = String(app.args ?? '').trim();
            out.trigger = app.triggers
                .filter((trigger) => {
                    // Фильтруем пустые copy-триггеры
                    if (trigger.name.toLowerCase() === 'copy') {
                        const src = String(trigger.param?.src ?? '').trim();
                        const dst = String(trigger.param?.dst ?? '').trim();
                        return src && dst; // Оба поля должны быть заполнены
                    }
                    return true; // Остальные триггеры оставляем
                })
                .map(buildTriggerForExport);
            return out;
        });
        result.lastLauncherVersion = String(cfg.lastLauncherVersion ?? '').trim();
        result.launcherLink = String(cfg.launcherLink ?? '').trim();
        result.autologin = {
            pattern: String(cfg.autologin?.pattern ?? '').trim()
        };
        
        result.setting = {
            downloadType: String(cfg.setting?.downloadType ?? 'random').trim()
        };

        const translations = {};
        Object.entries(cfg.translationPaths || {}).forEach(([lang, entry]) => {
            const payload = deepClone(entry.extra || {});
            payload.srcPath = String(entry.srcPath ?? '');
            payload.dstPath = String(entry.dstPath ?? '');
            if (entry.default) payload.default = true;
            translations[lang] = payload;
        });
        result.translationPaths = translations;

        const news = {};
        Object.entries(cfg.news || {}).forEach(([lang, list]) => {
            news[lang] = list.map((item) => {
                const payload = deepClone(item.extra || {});
                payload.name = String(item.name ?? '');
                payload.description = String(item.description ?? '');
                payload.image = String(item.image ?? '');
                payload.link = String(item.link ?? '');
                payload.date = String(item.date ?? '');
                return payload;
            });
        });
        result.news = news;

        result.onUpdateCompleteTriggers = cfg.onUpdateCompleteTriggers.map((item) => String(item ?? '').trim()).filter(Boolean);

        return result;
    }

    // Модальное окно для редактирования ссылок по странам
    let downloadCountriesModal = null;
    let currentEditingItem = null;
    
    const COUNTRY_OPTIONS = [
        'RU', 'US', 'DE', 'FR', 'JP', 'BR', 'IN', 'ES', 'IT', 'CA', 
        'AU', 'NZ', 'KR', 'CN', 'GB', 'MX', 'SE', 'NO', 'CH', 'NL',
        'BE', 'AT', 'DK', 'FI', 'PL', 'CZ', 'TR', 'UA', 'GR', 'PT'
    ];
    
    function ensureCountriesModal() {
        if (downloadCountriesModal) return downloadCountriesModal;
        
        const modal = document.createElement('div');
        modal.id = 'download-countries-modal';
        modal.className = 'modal-overlay download-countries-modal';
        modal.style.display = 'none';
        
        const countriesSelectHtml = COUNTRY_OPTIONS.map(c => 
            `<label class="country-checkbox">
                <input type="checkbox" value="${c}" class="country-option">
                <span>${c}</span>
            </label>`
        ).join('');
        
        modal.innerHTML = `
            <div class="modal-content download-countries-content">
                <div class="modal-header">
                    <h2>Редактирование ссылки</h2>
                    <button type="button" class="close-btn" data-action="close-countries-modal">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="field-label">URL ссылка</label>
                        <input type="url" id="countries-modal-url" class="form-input" placeholder="https://example.com/archive.csv">
                        <span class="field-hint">Введите URL ссылку</span>
                    </div>
                    
                    <div class="form-group">
                        <label class="field-label">Выберите страны (опционально)</label>
                        <div class="countries-grid">
                            ${countriesSelectHtml}
                        </div>
                        <span class="field-hint">Если страны не выбраны - ссылка будет общей для всех стран. Если выбраны - ссылка будет использоваться только для выбранных стран.</span>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-action="close-countries-modal">Отмена</button>
                    <button type="button" class="btn btn-primary" data-action="save-countries">Сохранить</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        downloadCountriesModal = modal;
        return modal;
    }
    
    function openCountriesModal(listType, index) {
        const modal = ensureCountriesModal();
        const item = state.config.download[listType][index];
        const isObject = item && typeof item === 'object' && item.countries && item.url;
        
        // Заполняем форму текущими значениями
        const urlInput = modal.querySelector('#countries-modal-url');
        urlInput.value = isObject ? item.url : (item || '');
        
        // Очищаем все чекбоксы
        const allCheckboxes = modal.querySelectorAll('.country-option');
        allCheckboxes.forEach(cb => cb.checked = false);
        
        // Проверяем нужные страны
        if (isObject && Array.isArray(item.countries)) {
            item.countries.forEach(country => {
                const checkbox = modal.querySelector(`.country-option[value="${country}"]`);
                if (checkbox) checkbox.checked = true;
            });
        }
        
        currentEditingItem = { listType, index };
        modal.style.display = 'flex';
    }
    
    function closeCountriesModal() {
        if (downloadCountriesModal) {
            downloadCountriesModal.style.display = 'none';
        }
        currentEditingItem = null;
    }
    
    function saveCountriesModal() {
        if (!currentEditingItem) {
            console.warn('saveCountriesModal: currentEditingItem не установлен');
            return;
        }
        
        const modal = downloadCountriesModal;
        if (!modal) {
            console.warn('saveCountriesModal: modal не найдена');
            return;
        }
        
        const urlInput = modal.querySelector('#countries-modal-url');
        if (!urlInput) {
            console.warn('saveCountriesModal: urlInput не найден');
            return;
        }
        
        const url = urlInput.value.trim();
        
        const selectedCountries = Array.from(
            modal.querySelectorAll('.country-option:checked')
        ).map(cb => cb.value);
        
        if (!url) {
            alert('Пожалуйста, введите URL');
            return;
        }
        
        const { listType, index } = currentEditingItem;
        
        // Если страны не выбраны - сохраняем просто строку (общая для всех)
        // Если страны выбраны - сохраняем объект с указанием стран
        if (selectedCountries.length === 0) {
            state.config.download[listType][index] = url;
        } else {
            state.config.download[listType][index] = {
                countries: selectedCountries,
                url: url
            };
        }
        
        closeCountriesModal();
        renderDownloadSection();
        updatePreview();
        updateStatusSummary();
    }

    function renderSettingsSection() {
        const container = byId('settings-content');
        if (!container) return;
        const cfg = state.config;
        
        const downloadTypeOptions = [
            {
                value: 'random',
                label: 'RANDOM (Случайный)',
                description: 'Простой случайный выбор источников. Каждый сервер выбирается с равной вероятностью (~33%). Подходит для прототипов и тестирования.'
            },
            {
                value: 'round-robin',
                label: 'ROUND-ROBIN (Циклический)',
                description: 'Поочерёдный выбор: сервер 1 → 2 → 3 → 1... Гарантирует абсолютную справедливость нагрузки, но не учитывает качество серверов.'
            },
            {
                value: 'health-based',
                label: 'HEALTH-BASED (Адаптивный)',
                description: 'Интеллектуальный выбор на основе health score (40% успешность + 35% скорость + 25% надёжность). Автоматически балансирует нагрузку, выбирая здоровые серверы. Требует накопления данных (~20 запросов).'
            },
            {
                value: 'failover',
                label: 'FAILOVER (Резервный)',
                description: 'Основной сервер + резервный. Использует основные источники, при их недоступности переключается на резервные. Максимальная надёжность (99%+ uptime).'
            }
        ];
        
        const currentType = state.config.setting?.downloadType || 'random';
        
        const optionsHtml = downloadTypeOptions.map(opt => `
            <div class="download-type-option">
                <input type="radio" name="downloadType" value="${opt.value}" id="dtype-${opt.value}" 
                    ${currentType === opt.value ? 'checked' : ''}>
                <label for="dtype-${opt.value}" class="dtype-label">
                    <span class="dtype-title">${opt.label}</span>
                    <span class="dtype-desc">${opt.description}</span>
                </label>
            </div>
        `).join('');
        
        container.innerHTML = `
            <div class="list-wrapper">
                <div class="field-block">
                    <span class="field-label">Тип загрузки (downloadType)</span>
                    <div class="download-types-container">
                        ${optionsHtml}
                    </div>
                    <span class="field-hint">Выберите стратегию балансировки нагрузки между серверами. Каждый режим оптимален для своего сценария.</span>
                </div>
            </div>
        `;
        
        // Добавляем обработчик событий для radio buttons
        container.querySelectorAll('input[name="downloadType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const newType = e.target.value;
                if (!state.config.setting) {
                    state.config.setting = {};
                }
                state.config.setting.downloadType = newType;
                updatePreview();
            });
        });
    }

    function renderMetaSection() {
        const container = byId('meta-content');
        if (!container) return;
        const cfg = state.config;
        const autologinPattern = String(cfg.autologin?.pattern ?? '');
        container.innerHTML = `
            <div class="list-wrapper">
                <label class="field-block">
                    <span class="field-label">Версия лаунчера (lastLauncherVersion)</span>
                    <input type="text" data-field="lastLauncherVersion" placeholder="Например, 1.0.1" value="${escapeHtml(cfg.lastLauncherVersion)}">
                </label>
                <label class="field-block">
                    <span class="field-label">Ссылка на обновление (launcherLink)</span>
                    <input type="url" data-field="launcherLink" placeholder="https://example.com/launcher.exe" value="${escapeHtml(cfg.launcherLink)}">
                </label>
                <label class="field-block">
                    <span class="field-label">Шаблон автологина (autologin.pattern)</span>
                    <input type="text" data-field="autologin.pattern" placeholder="user:%login% pwd:%password% role:%charname%" value="${escapeHtml(autologinPattern)}">
                    <span class="field-hint">Укажите паттерн вида <code>user:%login% pwd:%password% role:%charname%</code>, чтобы активировать менеджер аккаунтов: лаунчер сохранит пары логин/пароль, покажет список персонажей и добавит кнопку запуска сразу на выбранного персонажа.</span>
                </label>
            </div>
        `;
    }

    function renderDownloadSection() {
        const container = byId('download-content');
        if (!container) return;
        const cfg = state.config.download;
        
        const renderList = (items, type, label) => {
            const rows = items.map((value, idx) => {
                // Определяем структуру данных
                const isObject = value && typeof value === 'object' && (value.countries || value.urls || value.url);
                const urls = isObject ? (value.urls || (value.url ? [value.url] : [])) : (typeof value === 'string' ? [value] : []);
                const countries = isObject ? (value.countries || []) : [];
                
                const countriesDisplay = countries.length > 0 
                    ? `Для стран: ${countries.join(', ')}`
                    : '';
                
                const urlsHtml = urls.map((url, urlIdx) => `
                    <div class="url-row">
                        <input type="url" class="download-url-input" data-index="${idx}" data-url-index="${urlIdx}" data-list="${type}" value="${escapeHtml(url)}" placeholder="https://example.com/file.csv">
                        <button type="button" class="btn-action btn-remove-url" data-action="remove-url" data-index="${idx}" data-url-index="${urlIdx}" data-list="${type}" title="Удалить ссылку">
                            ✕
                        </button>
                    </div>
                `).join('');
                
                return `
                    <div class="list-item-wrapper" data-index="${idx}" data-list="${type}">
                        <div class="list-item">
                            <div class="item-urls-container">
                                ${urlsHtml}
                                <button type="button" class="btn-action btn-add-url" data-action="add-url" data-index="${idx}" data-list="${type}" title="Добавить ещё одну ссылку для этой записи">
                                    ➕ Добавить
                                </button>
                            </div>
                            <div class="item-actions">
                                <button type="button" class="btn-action btn-countries" data-action="toggle-countries-dropdown" data-index="${idx}" data-list="${type}" title="Выбрать страны">
                                    🌍
                                </button>
                                <button type="button" class="btn-action btn-remove" data-action="remove-download" data-index="${idx}" data-list="${type}" title="Удалить всю запись">
                                    ✕
                                </button>
                            </div>
                        </div>
                        ${countriesDisplay ? `
                            <div class="item-countries-display">
                                ${countriesDisplay}
                            </div>
                        ` : ''}
                        <div class="countries-dropdown-menu" style="display: none;">
                            <div class="countries-list">
                                ${COUNTRY_OPTIONS.map(c => `
                                    <label class="country-item">
                                        <input type="checkbox" class="country-checkbox" value="${c}" ${countries.includes(c) ? 'checked' : ''} data-index="${idx}" data-list="${type}">
                                        <span>${c}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            const emptyItem = `
                <div class="list-item">
                    <div class="item-display empty-hint">
                        <span>Нет элементов. Добавьте ссылку выше.</span>
                    </div>
                </div>
            `;
            
            return `
                <div class="list-wrapper" data-kind="${type}">
                    <h3>${label}</h3>
                    <div class="items-list">
                        ${rows || emptyItem}
                    </div>
                    <button type="button" class="btn-add" data-action="add-download" data-target="${type}">
                        ➕ Добавить элемент
                    </button>
                </div>
            `;
        };
        
        container.innerHTML = `
            ${renderList(cfg.csv, 'csv', 'CSV-файлы (download.csv)')}
            ${renderList(cfg.archives, 'archives', 'Архивы / каталоги (download.archives)')}
        `;
    }

    function renderApplicationsSection() {
        const container = byId('applications-content');
        if (!container) return;
        const cards = state.config.application.map((app, index) => {
            const translationRows = Object.entries(app.translations || {}).map(([lang, value]) => `
                <tr data-lang="${lang}">
                    <th>${escapeHtml(lang)}</th>
                    <td><input type="text" data-role="app-translation" data-lang="${lang}" value="${escapeHtml(value)}"></td>
                    <td><button type="button" data-action="remove-translation" data-lang="${lang}">Удалить</button></td>
                </tr>
            `).join('');
            const triggerCards = app.triggers.map((trigger, tIndex) => renderTriggerCard(app.__uid, trigger, tIndex)).join('');
            const triggersContent = triggerCards || '<p class="empty-hint">Добавьте триггер для этой кнопки запуска.</p>';
            return `
                <div class="trigger-card app-card" data-app="${app.__uid}">
                    <div class="card-header">
                        <div><span class="chip">Запуск #${index + 1}</span></div>
                        <div class="action-row">
                            <button type="button" data-action="move-app-up">↑</button>
                            <button type="button" data-action="move-app-down">↓</button>
                            <button type="button" data-action="duplicate-app">Клонировать</button>
                            <button type="button" data-action="remove-app">Удалить</button>
                        </div>
                    </div>
                    <div class="field-grid">
                        <label>
                            <span>Исполняемый файл (exe)</span>
                            <input type="text" data-role="app-exe" value="${escapeHtml(app.exe)}" placeholder="system/l2.exe">
                        </label>
                        <label>
                            <span>Аргументы (args)</span>
                            <input type="text" data-role="app-args" value="${escapeHtml(app.args)}" placeholder="Оставьте пустым, если не нужны">
                        </label>
                    </div>
                    <div class="translations-block">
                        <div class="translations-header">
                            <span class="chip">Переводы кнопки</span>
                            <button type="button" data-action="add-translation">Добавить язык</button>
                        </div>
                        <table class="translation-table">
                            <tbody>${translationRows}</tbody>
                        </table>
                    </div>
                    <div class="triggers-block">
                        <div class="triggers-header">
                            <span class="chip">Триггеры (${app.triggers.length})</span>
                            <button type="button" data-action="add-trigger">Добавить триггер</button>
                        </div>
                        <div class="triggers-list">${triggersContent}</div>
                    </div>
                </div>
            `;
        }).join('');
        container.innerHTML = `
            ${cards || '<p>Добавьте первую кнопку запуска.</p>'}
            <button type="button" data-action="add-app">Добавить кнопку запуска</button>
        `;
    }

    function renderTriggerCard(appUid, trigger, index) {
        const triggerName = String(trigger.name || '').trim();
        const definition = TRIGGER_CATALOG_MAP[triggerName] || null;
        const options = [];
        if (!definition && triggerName) {
            options.push(`<option value="${escapeHtml(triggerName)}" selected disabled>Неизвестный (${escapeHtml(triggerName)})</option>`);
        }
        TRIGGER_CATALOG.forEach((item) => {
            const selected = item.name === triggerName ? 'selected' : '';
            options.push(`<option value="${item.name}" ${selected}>${escapeHtml(item.selectLabel)}</option>`);
        });

        const typeSelect = `
            <label class="trigger-type-select">
                <span>Тип триггера</span>
                <select data-role="trigger-type">${options.join('')}</select>
            </label>
        `;

        let descriptionBlock = '';
        if (definition) {
            descriptionBlock = `
                <div class="trigger-description">
                    <strong>${escapeHtml(definition.title)}</strong>
                    <span>${escapeHtml(definition.description)}</span>
                </div>
            `;
        } else {
            descriptionBlock = `
                <div class="trigger-description trigger-description--warning">
                    <strong>Неподдерживаемый триггер</strong>
                    <span>Этот триггер не входит в каталог. Вы можете выбрать другой тип из списка или отредактировать JSON вручную.</span>
                </div>
            `;
        }

        let fieldsHtml = '';
        if (definition) {
            if (definition.name === 'copy') {
                const param = {
                    src: '',
                    dst: '',
                    hashCheck: false,
                    ...(trigger.param && typeof trigger.param === 'object' ? trigger.param : {})
                };
                fieldsHtml = `
                    <div class="field-grid">
                        <label>
                            <span>Источник (src)</span>
                            <input type="text" data-role="copy-src" value="${escapeHtml(param.src)}" placeholder="system/files/x1">
                        </label>
                        <label>
                            <span>Назначение (dst)</span>
                            <input type="text" data-role="copy-dst" value="${escapeHtml(param.dst)}" placeholder="system/">
                        </label>
                        <label class="checkbox">
                            <input type="checkbox" data-role="copy-hashCheck" ${param.hashCheck ? 'checked' : ''}> Проверять хэш
                        </label>
                    </div>
                `;
            } else if (definition.name === 'StartGameReport') {
                const url = trigger.param && typeof trigger.param === 'object' ? String(trigger.param.url ?? '') : '';
                fieldsHtml = `
                    <label>
                        <span>URL для отчёта</span>
                        <input type="url" data-role="startgamereport-url" value="${escapeHtml(url)}" placeholder="https://example.com/start">
                    </label>
                    <p class="trigger-note">Лаунчер отправит GET-запрос на указанный адрес в отдельном потоке.</p>
                `;
            } else {
                fieldsHtml = '<p class="trigger-note">Дополнительных настроек для этого триггера нет.</p>';
            }
        } else {
            fieldsHtml = '<p class="trigger-note trigger-note--warning">JSON ниже должен соответствовать требованиям backend. Измените тип триггера, чтобы использовать проверенные сценарии.</p>';
        }

        let advancedBlock = '';
        const includeAdvanced = definition ? definition.showAdvanced : true;
        if (includeAdvanced) {
            const payload = deepClone(trigger.extra || {});
            if (trigger.param && typeof trigger.param === 'object') {
                payload.param = trigger.param;
            }
            const json = escapeHtml(JSON.stringify(payload, null, 2));
            if (definition) {
                advancedBlock = `
                    <details class="trigger-advanced">
                        <summary>Расширенный JSON</summary>
                        <p class="trigger-advanced__hint">Для продвинутых сценариев можно задать дополнительные поля. Значение <code>name</code> добавляется автоматически.</p>
                        <textarea data-role="trigger-extra" spellcheck="false">${json}</textarea>
                        <button type="button" data-action="apply-trigger-extra">Применить JSON</button>
                    </details>
                `;
            } else {
                advancedBlock = `
                    <div class="trigger-custom-json">
                        <textarea data-role="trigger-extra" spellcheck="false">${json}</textarea>
                        <button type="button" data-action="apply-trigger-extra">Применить JSON</button>
                    </div>
                `;
            }
        }

        return `
            <div class="trigger-card" data-app="${appUid}" data-trigger="${trigger.__uid}">
                <div class="card-header">
                    <span class="chip">${escapeHtml(triggerName || 'unknown')}</span>
                    <div>
                        <button type="button" data-action="move-trigger-up">↑</button>
                        <button type="button" data-action="move-trigger-down">↓</button>
                        <button type="button" data-action="remove-trigger">Удалить</button>
                    </div>
                </div>
                <div class="trigger-type-row">
                    ${typeSelect}
                    ${descriptionBlock}
                </div>
                ${fieldsHtml}
                ${advancedBlock}
            </div>
        `;
    }

    function renderTranslationsSection() {
        const container = byId('translations-content');
        if (!container) return;
        const entries = Object.entries(state.config.translationPaths || {}).map(([lang, entry]) => {
            const extraJson = entry.extra && Object.keys(entry.extra).length > 0 ? `<details><summary>Дополнительные поля</summary><pre>${escapeHtml(JSON.stringify(entry.extra, null, 2))}</pre></details>` : '';
            return `
                <div class="trigger-card" data-lang="${lang}">
                    <div class="card-header">
                        <span class="chip">${escapeHtml(lang)}</span>
                        <div>
                            <label style="font-size:0.9rem; display:flex; align-items:center; gap:6px;">
                                <input type="radio" name="translation-default" data-role="translation-default" ${entry.default ? 'checked' : ''}> По умолчанию
                            </label>
                            <button type="button" data-action="remove-translation-path">Удалить</button>
                        </div>
                    </div>
                    <label>
                        <span>Источник (srcPath)</span>
                        <input type="text" data-role="translation-src" value="${escapeHtml(entry.srcPath)}" placeholder="/system/files/ru">
                    </label>
                    <label>
                        <span>Назначение (dstPath)</span>
                        <input type="text" data-role="translation-dst" value="${escapeHtml(entry.dstPath)}" placeholder="/system">
                    </label>
                    ${extraJson}
                </div>
            `;
        }).join('');
        container.innerHTML = `
            ${entries || '<p>Добавьте язык, для которого нужно скопировать переводные файлы.</p>'}
            <button type="button" data-action="add-translation-path">Добавить язык</button>
        `;
    }

    function renderNewsSection() {
        const container = byId('news-content');
        if (!container) return;
        const languages = Object.entries(state.config.news || {}).map(([lang, list]) => {
            const cards = list.map((entry, idx) => {
                const extraJson = entry.extra && Object.keys(entry.extra).length > 0 ? `<details><summary>Дополнительно</summary><pre>${escapeHtml(JSON.stringify(entry.extra, null, 2))}</pre></details>` : '';
                return `
                    <div class="news-card" data-news-uid="${entry.__uid}">
                        <div class="card-header">
                            <span class="chip">Новость #${idx + 1}</span>
                            <button type="button" data-action="remove-news-entry">Удалить</button>
                        </div>
                        <label><span>Название</span><input type="text" data-role="news-name" value="${escapeHtml(entry.name)}"></label>
                        <label><span>Описание</span><textarea data-role="news-description">${escapeHtml(entry.description)}</textarea></label>
                        <label><span>Изображение (URL)</span><input type="url" data-role="news-image" value="${escapeHtml(entry.image)}"></label>
                        <label><span>Ссылка</span><input type="url" data-role="news-link" value="${escapeHtml(entry.link)}"></label>
                        <label><span>Дата</span><input type="text" data-role="news-date" value="${escapeHtml(entry.date)}" placeholder="2025-01-01"></label>
                        ${extraJson}
                    </div>
                `;
            }).join('');
            return `
                <div class="trigger-card" data-news-lang="${lang}">
                    <div class="card-header">
                        <span class="chip">${escapeHtml(lang)}</span>
                        <div>
                            <button type="button" data-action="add-news-entry">Добавить запись</button>
                            <button type="button" data-action="remove-news-language">Удалить язык</button>
                        </div>
                    </div>
                    <div class="news-list">${cards || '<p>Добавьте первую запись новости.</p>'}</div>
                </div>
            `;
        }).join('');
        container.innerHTML = `
            ${languages || '<p>Добавьте язык для новостной ленты.</p>'}
            <button type="button" data-action="add-news-language">Добавить язык</button>
        `;
    }

    function renderUpdateTriggersSection() {
        const container = byId('update-triggers-content');
        if (!container) return;
        const active = new Set(state.config.onUpdateCompleteTriggers || []);
        const cards = UPDATE_TRIGGER_OPTIONS.map((option) => {
            const checked = active.has(option.value) ? 'checked' : '';
            const activeClass = checked ? ' is-active' : '';
            return `
                <label class="update-trigger-card${activeClass}">
                    <div class="update-trigger-card__header">
                        <input type="checkbox" data-role="update-trigger-checkbox" value="${option.value}" ${checked}>
                        <div>
                            <span class="update-trigger-card__title">${escapeHtml(option.title)}</span>
                            <span class="update-trigger-card__code">${escapeHtml(option.value)}</span>
                        </div>
                    </div>
                    <p class="update-trigger-card__description">${escapeHtml(option.description)}</p>
                </label>
            `;
        }).join('');
        container.innerHTML = cards
            ? `<div class="update-trigger-grid">${cards}</div>`
            : '<p>Пока нет доступных триггеров для выполнения после обновления.</p>';
    }

    function renderLauncherPreviewSection() {
        const container = byId('launcher-preview-content');
        if (!container) return;

        const availableLanguages = collectPreviewLanguages();
        if (!availableLanguages.includes(state.preview.language)) {
            state.preview.language = availableLanguages[0];
        }
        const selectedLang = state.preview.language;

        const languageOptions = availableLanguages.map((code) => `
            <option value="${code}" ${code === selectedLang ? 'selected' : ''}>${escapeHtml(getLanguageLabel(code))}</option>
        `).join('');

        const autologinPattern = String(state.config.autologin?.pattern ?? '').trim();
        const autologinInfo = autologinPattern
            ? `<div class="preview-autologin preview-autologin--enabled">
                    <strong>Менеджер аккаунтов включён</strong>
                    <span>Паттерн <code>${escapeHtml(autologinPattern)}</code> добавит окно выбора аккаунта и кнопку запуска для выбранного персонажа.</span>
               </div>`
            : `<div class="preview-autologin preview-autologin--disabled">
                    <strong>Менеджер аккаунтов выключен</strong>
                    <span>Укажите паттерн, чтобы лаунчер предлагал сохранение логина/пароля и список персонажей.</span>
               </div>`;

        const downloadCsv = (state.config.download?.csv || []).map((item, idx) => {
            const value = String(item ?? '').trim();
            if (!value) return '';
            return `<li><span class="preview-download-index">CSV ${idx + 1}</span><span class="preview-download-link">${escapeHtml(value)}</span></li>`;
        }).filter(Boolean).join('') || '<li class="preview-empty">Список CSV пуст</li>';

        const downloadArchives = (state.config.download?.archives || []).map((item, idx) => {
            const value = String(item ?? '').trim();
            if (!value) return '';
            return `<li><span class="preview-download-index">Архив ${idx + 1}</span><span class="preview-download-link">${escapeHtml(value)}</span></li>`;
        }).filter(Boolean).join('') || '<li class="preview-empty">Список архивов пуст</li>';

        const appsHtml = state.config.application.map((app, idx) => {
            const title = resolveAppTitle(app, selectedLang, idx).trim() || `Запуск #${idx + 1}`;
            const languages = Object.keys(app.translations || {});
            const triggers = app.triggers && app.triggers.length
                ? app.triggers.map(formatTriggerChip).join('')
                : '<span class="preview-chip preview-chip--empty"><span class="preview-chip__label">нет триггеров</span></span>';
            const args = String(app.args ?? '').trim();
            return `
                <article class="preview-app-card">
                    <header class="preview-app-card__header">
                        <span class="preview-app-title">${escapeHtml(title)}</span>
                        <span class="preview-app-idx">#${idx + 1}</span>
                    </header>
                    <p class="preview-app-path">${escapeHtml(app.exe || 'Исполняемый файл не указан')}</p>
                    ${args ? `<p class="preview-app-args">Аргументы: <code>${escapeHtml(args)}</code></p>` : ''}
                    <div class="preview-app-langs">${languages.length ? languages.map((lang) => `<span class="preview-tag${lang === selectedLang ? ' is-active' : ''}">${escapeHtml(lang)}</span>`).join('') : '<span class="preview-tag">ячейки перевода отсутствуют</span>'}</div>
                    <div class="preview-app-triggers">${triggers}</div>
                </article>
            `;
        }).join('');

        const translationsEntry = state.config.translationPaths?.[selectedLang];
        const translationsHtml = translationsEntry
            ? `<div class="preview-translations-entry">
                    <strong>${escapeHtml(selectedLang)}:</strong>
                    <span>${escapeHtml(translationsEntry.srcPath || '—')}</span>
                    <span class="preview-arrow">→</span>
                    <span>${escapeHtml(translationsEntry.dstPath || '—')}</span>
                    ${translationsEntry.default ? '<span class="preview-tag is-active">по умолчанию</span>' : ''}
               </div>`
            : '<p class="preview-empty">Для выбранного языка нет настроек копирования переводов.</p>';

        const newsByLanguage = state.config.news?.[selectedLang]
            || state.config.news?.[availableLanguages[0]]
            || [];
        const newsHtml = newsByLanguage.length
            ? newsByLanguage.slice(0, 4).map((entry) => `
                    <article class="preview-news-card">
                        <h4>${escapeHtml(entry.name || 'Новость')}</h4>
                        ${entry.date ? `<span class="preview-news-date">${escapeHtml(entry.date)}</span>` : ''}
                        <p>${escapeHtml(entry.description || 'Описание отсутствует')}</p>
                    </article>
               `).join('')
            : '<p class="preview-empty">Новостей для выбранного языка нет.</p>';

        container.innerHTML = `
            <div class="launcher-preview-controls">
                <label>
                    <span>Язык интерфейса</span>
                    <select data-role="preview-language">${languageOptions}</select>
                </label>
                ${autologinInfo}
            </div>
            <div class="launcher-preview-shell">
                <section class="preview-panel">
                    <header class="preview-panel__header">
                        <h3>Кнопки запуска (${state.config.application.length})</h3>
                        <span class="preview-version">Версия лаунчера: ${escapeHtml(state.config.lastLauncherVersion || 'не указано')}</span>
                    </header>
                    <div class="preview-app-list">${appsHtml || '<p class="preview-empty">Добавьте хотя бы одну кнопку запуска, чтобы увидеть предпросмотр.</p>'}</div>
                </section>
                <section class="preview-panel">
                    <header class="preview-panel__header">
                        <h3>Загрузка файлов</h3>
                    </header>
                    <div class="preview-downloads">
                        <div>
                            <h4>CSV-источники</h4>
                            <ul>${downloadCsv}</ul>
                        </div>
                        <div>
                            <h4>Архивы</h4>
                            <ul>${downloadArchives}</ul>
                        </div>
                    </div>
                    <div class="preview-translations">
                        <h4>Копирование переводов</h4>
                        ${translationsHtml}
                    </div>
                </section>
                <section class="preview-panel">
                    <header class="preview-panel__header">
                        <h3>Новости (${newsByLanguage.length})</h3>
                    </header>
                    <div class="preview-news-list">${newsHtml}</div>
                </section>
            </div>
        `;
    }

    function renderAllSections() {
        renderSettingsSection();
        renderMetaSection();
        renderDownloadSection();
        renderApplicationsSection();
        renderTranslationsSection();
        renderNewsSection();
        renderUpdateTriggersSection();
        updatePreview();
        updateStatusSummary();
    }

    function updatePreview() {
        const preview = byId('json-preview');
        if (!preview) return;
        try {
            const payload = buildConfigForExport();
            const highlighted = syntaxHighlightJson(payload);
            if (highlighted) {
                preview.innerHTML = highlighted;
                preview.dataset.highlighted = 'true';
            } else {
                preview.textContent = JSON.stringify(payload, null, 2);
                delete preview.dataset.highlighted;
            }
            preview.dataset.valid = 'true';
            renderLauncherPreviewSection();
        } catch (err) {
            preview.textContent = `Ошибка подготовки JSON: ${err.message}`;
            preview.dataset.valid = 'false';
            delete preview.dataset.highlighted;
            renderLauncherPreviewSection();
        }
    }

    async function openLauncherPreview() {
        const payload = buildConfigForExport();
        const jsonString = JSON.stringify(payload, null, 2);
        
        // Проверяем наличие метода OpenPreviewWindow
        if (!window.go?.main?.App?.OpenPreviewWindow) {
            setStatus('error', 'Метод OpenPreviewWindow недоступен. Пересоберите проект: wails build');
            console.error('[Editor] window.go.main.App.OpenPreviewWindow не найден');
            return;
        }

        console.log('[Editor] Открытие окна предпросмотра лаунчера');
        console.log('[Editor] Размер конфигурации:', jsonString.length, 'символов');
        console.log('[Editor] Количество кнопок запуска:', payload.application?.length || 0);
        
        setStatus('success', 'Подготовка предпросмотра...');
        
        try {
            // Вызываем Go метод, который запустит новый процесс
            await window.go.main.App.OpenPreviewWindow(jsonString);
            
            // Редактор остается открытым, окно предпросмотра открывается отдельно
            setStatus('success', '✓ Окно предпросмотра успешно открыто! Можете работать с обоими окнами одновременно.');
            console.log('[Editor] Команда OpenPreviewWindow выполнена успешно');
            
        } catch (goError) {
            console.error('[Editor] Ошибка от Go при вызове OpenPreviewWindow:', goError);
            setStatus('error', `Ошибка запуска предпросмотра: ${goError.message || goError}`);
        }
    }

    function updateStatusSummary() {
        const appsCount = state.config.application.length;
        const triggerCount = state.config.application.reduce((acc, app) => acc + app.triggers.length, 0);
        const csvCount = state.config.download.csv.filter(Boolean).length;
        const archivesCount = state.config.download.archives.filter(Boolean).length;
        const message = `Записи запуска: ${appsCount} · Триггеры: ${triggerCount} · CSV: ${csvCount} · Архивы: ${archivesCount}`;
        setStatus('success', state.lastLoadedSource ? `${state.lastLoadedSource} — ${message}` : message);
    }

    function applyConfig(rawConfig, sourceLabel) {
        try {
            const { config, extras } = normalizeConfig(rawConfig);
            state.config = config;
            state.extras = extras;
            state.lastLoadedSource = sourceLabel || '';
            renderAllSections();
        } catch (err) {
            console.error('Ошибка разбора конфигурации', err);
            setStatus('error', `Не удалось разобрать конфигурацию: ${err.message}`);
        }
    }

    function handleFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const obj = JSON.parse(String(reader.result));
                applyConfig(obj, `Файл ${file.name} загружен`);
            } catch (err) {
                console.error(err);
                setStatus('error', `Ошибка разбора файла: ${err.message}`);
            }
        };
        reader.readAsText(file, 'utf-8');
    }

    async function requestLanguageCode(existing) {
        const existingSet = existing instanceof Set ? existing : new Set(existing || []);
        const picker = ensureLanguagePicker();
        if (picker) {
            const selected = await picker.open(existingSet);
            return selected || null;
        }

        const fallback = prompt('Введите код языка (например, ru, en):');
        if (!fallback) return null;
        const normalized = fallback.trim();
        if (!normalized) return null;
        if (existingSet.has(normalized)) {
            alert('Такой язык уже существует.');
            return null;
        }
        return normalized;
    }

    function attachEventHandlers() {
        byId('file-input')?.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
            event.target.value = '';
        });

        const dropZone = byId('drop-zone');
        if (dropZone) {
            ['dragenter', 'dragover'].forEach((eventName) => {
                dropZone.addEventListener(eventName, (event) => {
                    event.preventDefault();
                    dropZone.classList.add('hover');
                });
            });
            ['dragleave', 'drop'].forEach((eventName) => {
                dropZone.addEventListener(eventName, (event) => {
                    event.preventDefault();
                    dropZone.classList.remove('hover');
                });
            });
            dropZone.addEventListener('drop', (event) => {
                const file = event.dataTransfer?.files?.[0];
                if (file) handleFile(file);
            });
        }

        byId('btn-load-remote')?.addEventListener('click', async () => {
            if (!window.go?.main?.App || !isFn(window.go.main.App.LoadRemoteConfigFromURL)) {
                setStatus('error', 'Метод LoadRemoteConfigFromURL недоступен.');
                return;
            }
            try {
                setStatus('info', 'Загрузка конфигурации с сервера...');
                const json = await window.go.main.App.LoadRemoteConfigFromURL();
                const parsed = JSON.parse(json);
                applyConfig(parsed, 'Конфигурация загружена с сервера');
                setStatus('success', 'Конфигурация успешно загружена с удаленного URL');
            } catch (err) {
                console.error(err);
                setStatus('error', `Ошибка загрузки конфигурации: ${err.message}`);
            }
        });

        byId('btn-open-full-preview')?.addEventListener('click', async () => {
            await openLauncherPreview();
        });

        byId('btn-new-config')?.addEventListener('click', () => {
            if (!confirm('Создать пустой шаблон? Текущие изменения будут потеряны.')) return;
            state.config = createEmptyConfig();
            state.extras = {};
            state.lastLoadedSource = 'Создан новый шаблон';
            renderAllSections();
        });

        byId('btn-go-dashboard')?.addEventListener('click', () => {
            window.location.href = '/admin-dashboard.html';
        });

        byId('btn-back-launcher')?.addEventListener('click', () => {
            window.location.href = '/index.html';
        });

        byId('btn-export-json')?.addEventListener('click', () => {
            try {
                const payload = buildConfigForExport();
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                const anchor = document.createElement('a');
                anchor.href = URL.createObjectURL(blob);
                anchor.download = 'launcher.json';
                anchor.click();
                URL.revokeObjectURL(anchor.href);
                setStatus('success', 'JSON экспортирован в файл launcher.json');
            } catch (err) {
                console.error(err);
                setStatus('error', `Ошибка экспорта: ${err.message}`);
            }
        });

        byId('btn-copy-json')?.addEventListener('click', async () => {
            try {
                const payload = buildConfigForExport();
                await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                setStatus('success', 'JSON скопирован в буфер обмена.');
            } catch (err) {
                console.error(err);
                setStatus('error', `Не удалось скопировать JSON: ${err.message}`);
            }
        });

        byId('btn-apply-raw')?.addEventListener('click', () => {
            const textarea = byId('raw-json-input');
            if (!textarea) return;
            const value = textarea.value.trim();
            if (!value) {
                setStatus('error', 'Поле с JSON пустое.');
                return;
            }
            try {
                const parsed = JSON.parse(value);
                applyConfig(parsed, 'JSON из текстового поля');
            } catch (err) {
                console.error(err);
                setStatus('error', `Ошибка разбора JSON: ${err.message}`);
            }
        });

        byId('meta-content')?.addEventListener('input', (event) => {
            const field = event.target.dataset.field;
            if (!field) return;
            const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
            if (field === 'lastLauncherVersion') {
                state.config.lastLauncherVersion = value;
            } else if (field === 'launcherLink') {
                state.config.launcherLink = value;
            } else if (field === 'autologin.pattern') {
                state.config.autologin.pattern = value;
            }
            updatePreview();
            updateStatusSummary();
        });

        byId('download-content')?.addEventListener('input', (event) => {
            // Простой input для редактирования URL
            if (event.target.matches('input[data-role="download-item"]')) {
                const wrapper = event.target.closest('.list-item');
                if (!wrapper) return;
                const list = wrapper.dataset.list;
                const index = Number(wrapper.dataset.index);
                const value = event.target.value;
                
                // Просто обновляем URL для простых строк
                state.config.download[list][index] = value;
                updatePreview();
                updateStatusSummary();
            }
        });

        byId('download-content')?.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button) return;
            const action = button.dataset.action;
            
            if (action === 'toggle-countries-dropdown') {
                // Закрываем все открытые dropdown'ы кроме текущего
                document.querySelectorAll('.countries-dropdown-menu').forEach(menu => {
                    menu.style.display = 'none';
                });
                
                // Открываем/закрываем текущий dropdown
                const listType = button.dataset.list;
                const index = Number(button.dataset.index);
                const wrapper = button.closest('.list-item-wrapper');
                const dropdown = wrapper.querySelector('.countries-dropdown-menu');
                dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
            } else if (action === 'remove-download') {
                const listType = button.dataset.list;
                const index = Number(button.dataset.index);
                
                if (listType === 'csv') {
                    state.config.download.csv.splice(index, 1);
                    if (state.config.download.csv.length === 0) state.config.download.csv.push('');
                } else if (listType === 'archives') {
                    state.config.download.archives.splice(index, 1);
                    if (state.config.download.archives.length === 0) state.config.download.archives.push('');
                }
                renderDownloadSection();
                updatePreview();
                updateStatusSummary();
            } else if (action === 'add-download') {
                const listType = button.dataset.target;
                if (listType === 'csv') {
                    state.config.download.csv.push('');
                } else if (listType === 'archives') {
                    state.config.download.archives.push('');
                }
                renderDownloadSection();
                updatePreview();
                updateStatusSummary();
            } else if (action === 'add-url') {
                // Добавить новую ссылку к элементу
                const listType = button.dataset.list;
                const index = Number(button.dataset.index);
                let item = state.config.download[listType][index];
                
                // Конвертируем в объект если нужно
                if (typeof item === 'string') {
                    item = { urls: [item] };
                } else if (item && typeof item === 'object') {
                    if (!item.urls) {
                        item.urls = item.url ? [item.url] : [];
                        delete item.url;
                    }
                } else {
                    item = { urls: [] };
                }
                
                item.urls.push('');
                state.config.download[listType][index] = item;
                renderDownloadSection();
                updatePreview();
                updateStatusSummary();
            } else if (action === 'remove-url') {
                // Удалить конкретную ссылку
                const listType = button.dataset.list;
                const index = Number(button.dataset.index);
                const urlIndex = Number(button.dataset.urlIndex);
                let item = state.config.download[listType][index];
                
                if (item && typeof item === 'object' && item.urls) {
                    item.urls.splice(urlIndex, 1);
                    
                    // Если осталась одна ссылка и нет стран - конвертируем обратно в строку
                    if (item.urls.length === 1 && (!item.countries || item.countries.length === 0)) {
                        state.config.download[listType][index] = item.urls[0] || '';
                    } else if (item.urls.length === 0) {
                        state.config.download[listType][index] = '';
                    }
                }
                renderDownloadSection();
                updatePreview();
                updateStatusSummary();
            }
        });

        // Обработчик для input полей URL
        byId('download-content')?.addEventListener('input', (event) => {
            const input = event.target.closest('.download-url-input');
            if (!input) return;
            
            const listType = input.dataset.list;
            const index = Number(input.dataset.index);
            const urlIndex = Number(input.dataset.urlIndex);
            const url = input.value.trim();
            
            // Получаем текущий элемент
            let item = state.config.download[listType][index];
            
            // Конвертируем в объект если нужно
            if (typeof item === 'string') {
                item = { urls: [item] };
            } else if (item && typeof item === 'object') {
                if (!item.urls) {
                    item.urls = item.url ? [item.url] : [];
                    delete item.url;
                }
            } else {
                item = { urls: [] };
            }
            
            // Обновляем URL в нужном индексе
            if (urlIndex !== undefined && !isNaN(urlIndex)) {
                item.urls[urlIndex] = url;
            } else {
                // Для обратной совместимости - обновляем первый URL
                item.urls[0] = url;
            }
            
            // Если нет стран и только одна пустая ссылка - конвертируем обратно в строку
            if (item.urls.length === 1 && (!item.countries || item.countries.length === 0)) {
                state.config.download[listType][index] = url || '';
            } else {
                state.config.download[listType][index] = item;
            }
            
            updatePreview();
            updateStatusSummary();
        });

        // Обработчик для checkbox'ов с странами
        byId('download-content')?.addEventListener('change', (event) => {
            const checkbox = event.target.closest('.country-checkbox');
            if (!checkbox) return;
            
            const listType = checkbox.dataset.list;
            const index = Number(checkbox.dataset.index);
            const country = checkbox.value;
            
            // Получаем текущий элемент
            let item = state.config.download[listType][index];
            
            // Конвертируем в объект если нужно
            if (typeof item === 'string') {
                item = { urls: [item], countries: [] };
            } else if (!item || typeof item !== 'object') {
                item = { urls: [], countries: [] };
            } else {
                // Убедимся что есть нужные поля
                if (!item.urls) {
                    item.urls = item.url ? [item.url] : [];
                    delete item.url;
                }
                if (!item.countries) {
                    item.countries = [];
                }
            }
            
            // Добавляем или удаляем страну
            if (checkbox.checked) {
                if (!item.countries.includes(country)) {
                    item.countries.push(country);
                }
            } else {
                item.countries = item.countries.filter(c => c !== country);
            }
            
            state.config.download[listType][index] = item;
            
            renderDownloadSection();
            updatePreview();
            updateStatusSummary();
        });

        // Обработчик для закрытия dropdown'ов при клике вне них
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.list-item-wrapper')) {
                document.querySelectorAll('.countries-dropdown-menu').forEach(menu => {
                    menu.style.display = 'none';
                });
            }
        });
        byId('applications-content')?.addEventListener('input', (event) => {
            const appCard = event.target.closest('.app-card');
            if (!appCard) return;
            const app = state.config.application.find((item) => item.__uid === appCard.dataset.app);
            if (!app) return;

            if (event.target.matches('input[data-role="app-exe"]')) {
                app.exe = event.target.value;
            } else if (event.target.matches('input[data-role="app-args"]')) {
                app.args = event.target.value;
            } else if (event.target.matches('input[data-role="app-translation"]')) {
                const lang = event.target.dataset.lang;
                app.translations[lang] = event.target.value;
            } else if (event.target.matches('input[data-role="copy-src"]')) {
                const trigger = findTrigger(app, event.target);
                if (trigger) {
                    if (!trigger.param || typeof trigger.param !== 'object') trigger.param = {};
                    trigger.param.src = event.target.value;
                }
            } else if (event.target.matches('input[data-role="copy-dst"]')) {
                const trigger = findTrigger(app, event.target);
                if (trigger) {
                    if (!trigger.param || typeof trigger.param !== 'object') trigger.param = {};
                    trigger.param.dst = event.target.value;
                }
            } else if (event.target.matches('input[data-role="startgamereport-url"]')) {
                const trigger = findTrigger(app, event.target);
                if (trigger) {
                    if (!trigger.param || typeof trigger.param !== 'object') trigger.param = {};
                    trigger.param.url = event.target.value;
                }
            }
            updatePreview();
            updateStatusSummary();
        });

        byId('applications-content')?.addEventListener('change', (event) => {
            const appCard = event.target.closest('.app-card');
            if (!appCard) return;
            const app = state.config.application.find((item) => item.__uid === appCard.dataset.app);
            if (!app) return;

            if (event.target.matches('input[data-role="copy-hashCheck"]')) {
                const trigger = findTrigger(app, event.target);
                if (trigger) {
                    if (!trigger.param || typeof trigger.param !== 'object') trigger.param = {};
                    trigger.param.hashCheck = event.target.checked;
                }
                updatePreview();
                updateStatusSummary();
            } else if (event.target.matches('select[data-role="trigger-type"]')) {
                const trigger = findTrigger(app, event.target);
                if (!trigger) return;
                const selectedType = event.target.value;
                const defaults = getTriggerDefaults(selectedType);
                trigger.name = defaults.name;
                trigger.param = defaults.param;
                trigger.extra = defaults.extra;
                renderApplicationsSection();
                updatePreview();
                updateStatusSummary();
            }
        });

        byId('applications-content')?.addEventListener('click', async (event) => {
            const button = event.target.closest('button');
            if (!button) return;
            const appCard = button.closest('.app-card');
            const appIndex = state.config.application.findIndex((item) => item.__uid === appCard?.dataset.app);
            if (appIndex === -1) {
                if (button.dataset.action === 'add-app') {
                    state.config.application.push(createDefaultApplicationEntry());
                    renderApplicationsSection();
                    updatePreview();
                    updateStatusSummary();
                }
                return;
            }
            const app = state.config.application[appIndex];
            const action = button.dataset.action;
            if (action === 'remove-app') {
                if (confirm('Удалить эту запись запуска?')) {
                    state.config.application.splice(appIndex, 1);
                    renderApplicationsSection();
                    updatePreview();
                    updateStatusSummary();
                }
            } else if (action === 'duplicate-app') {
                const copy = deepClone(app);
                copy.__uid = makeUid('app');
                copy.triggers = copy.triggers.map((trigger) => ({ ...deepClone(trigger), __uid: makeUid('trigger') }));
                copy.translations = deepClone(app.translations);
                state.config.application.splice(appIndex + 1, 0, copy);
                renderApplicationsSection();
                updatePreview();
                updateStatusSummary();
            } else if (action === 'move-app-up' && appIndex > 0) {
                const tmp = state.config.application[appIndex - 1];
                state.config.application[appIndex - 1] = state.config.application[appIndex];
                state.config.application[appIndex] = tmp;
                renderApplicationsSection();
                updatePreview();
                updateStatusSummary();
            } else if (action === 'move-app-down' && appIndex < state.config.application.length - 1) {
                const tmp = state.config.application[appIndex + 1];
                state.config.application[appIndex + 1] = state.config.application[appIndex];
                state.config.application[appIndex] = tmp;
                renderApplicationsSection();
                updatePreview();
                updateStatusSummary();
            } else if (action === 'add-translation') {
                const existing = new Set(Object.keys(app.translations));
                const lang = await requestLanguageCode(existing);
                if (lang) {
                    app.translations[lang] = '';
                    renderApplicationsSection();
                    updatePreview();
                }
            } else if (action === 'remove-translation') {
                const lang = button.dataset.lang;
                if (lang && Object.keys(app.translations).length > 1) {
                    delete app.translations[lang];
                    renderApplicationsSection();
                    updatePreview();
                } else {
                    alert('Должен остаться хотя бы один перевод.');
                }
            } else if (action === 'add-trigger') {
                app.triggers.push(defaultCopyTrigger());
                renderApplicationsSection();
                updatePreview();
            } else {
                const triggerCard = button.closest('[data-trigger]');
                if (!triggerCard) return;
                const triggerIndex = app.triggers.findIndex((item) => item.__uid === triggerCard.dataset.trigger);
                if (triggerIndex === -1) return;
                if (action === 'remove-trigger') {
                    app.triggers.splice(triggerIndex, 1);
                    renderApplicationsSection();
                    updatePreview();
                    updateStatusSummary();
                } else if (action === 'move-trigger-up' && triggerIndex > 0) {
                    const tmp = app.triggers[triggerIndex - 1];
                    app.triggers[triggerIndex - 1] = app.triggers[triggerIndex];
                    app.triggers[triggerIndex] = tmp;
                    renderApplicationsSection();
                    updatePreview();
                    updateStatusSummary();
                } else if (action === 'move-trigger-down' && triggerIndex < app.triggers.length - 1) {
                    const tmp = app.triggers[triggerIndex + 1];
                    app.triggers[triggerIndex + 1] = app.triggers[triggerIndex];
                    app.triggers[triggerIndex] = tmp;
                    renderApplicationsSection();
                    updatePreview();
                    updateStatusSummary();
                } else if (action === 'apply-trigger-extra') {
                    const textarea = triggerCard.querySelector('textarea[data-role="trigger-extra"]');
                    if (!textarea) return;
                    try {
                        const parsed = textarea.value.trim() ? JSON.parse(textarea.value) : {};
                        const trigger = app.triggers[triggerIndex];
                        const { param, ...rest } = parsed;
                        trigger.extra = rest || {};
                        if (param && typeof param === 'object') {
                            trigger.param = param;
                        }
                        updatePreview();
                        setStatus('success', 'Payload триггера обновлён.');
                        updateStatusSummary();
                    } catch (err) {
                        setStatus('error', `Ошибка разбора JSON триггера: ${err.message}`);
                    }
                }
            }
        });

        byId('translations-content')?.addEventListener('input', (event) => {
            const card = event.target.closest('[data-lang]');
            if (!card) return;
            const lang = card.dataset.lang;
            const entry = state.config.translationPaths[lang];
            if (!entry) return;
            if (event.target.matches('input[data-role="translation-src"]')) {
                entry.srcPath = event.target.value;
            } else if (event.target.matches('input[data-role="translation-dst"]')) {
                entry.dstPath = event.target.value;
            }
            updatePreview();
        });

        byId('translations-content')?.addEventListener('change', (event) => {
            if (!event.target.matches('input[data-role="translation-default"]')) return;
            const card = event.target.closest('[data-lang]');
            if (!card) return;
            const lang = card.dataset.lang;
            Object.values(state.config.translationPaths).forEach((entry) => (entry.default = false));
            if (state.config.translationPaths[lang]) {
                state.config.translationPaths[lang].default = true;
            }
            renderTranslationsSection();
            updatePreview();
        });

        byId('translations-content')?.addEventListener('click', async (event) => {
            const button = event.target.closest('button');
            if (!button) return;
            const action = button.dataset.action;
            if (action === 'add-translation-path') {
                const existing = new Set(Object.keys(state.config.translationPaths || {}));
                const lang = await requestLanguageCode(existing);
                if (lang) {
                    state.config.translationPaths[lang] = { srcPath: '', dstPath: '', default: existing.size === 0, extra: {} };
                    renderTranslationsSection();
                    updatePreview();
                }
            } else if (action === 'remove-translation-path') {
                const card = button.closest('[data-lang]');
                const lang = card?.dataset.lang;
                if (lang) {
                    delete state.config.translationPaths[lang];
                    renderTranslationsSection();
                    updatePreview();
                }
            }
        });

        byId('news-content')?.addEventListener('input', (event) => {
            if (event.target.matches('input[data-role="news-name"]')) {
                const { entry } = findNewsEntry(event.target);
                if (entry) {
                    entry.name = event.target.value;
                    updatePreview();
                }
            } else if (event.target.matches('textarea[data-role="news-description"]')) {
                const { entry } = findNewsEntry(event.target);
                if (entry) {
                    entry.description = event.target.value;
                    updatePreview();
                }
            } else if (event.target.matches('input[data-role="news-image"]')) {
                const { entry } = findNewsEntry(event.target);
                if (entry) {
                    entry.image = event.target.value;
                    updatePreview();
                }
            } else if (event.target.matches('input[data-role="news-link"]')) {
                const { entry } = findNewsEntry(event.target);
                if (entry) {
                    entry.link = event.target.value;
                    updatePreview();
                }
            } else if (event.target.matches('input[data-role="news-date"]')) {
                const { entry } = findNewsEntry(event.target);
                if (entry) {
                    entry.date = event.target.value;
                    updatePreview();
                }
            }
        });

        byId('news-content')?.addEventListener('click', async (event) => {
            const button = event.target.closest('button');
            if (!button) return;
            const action = button.dataset.action;
            const languageCard = button.closest('[data-news-lang]');
            const lang = languageCard?.dataset.newsLang;
            if (action === 'add-news-language') {
                const existing = new Set(Object.keys(state.config.news || {}));
                const code = await requestLanguageCode(existing);
                if (code) {
                    state.config.news[code] = [];
                    renderNewsSection();
                    updatePreview();
                }
                return;
            }
            if (!lang) return;
            if (action === 'add-news-entry') {
                state.config.news[lang].push({
                    __uid: makeUid('news'),
                    name: '',
                    description: '',
                    image: '',
                    link: '',
                    date: '',
                    extra: {}
                });
                renderNewsSection();
                updatePreview();
            } else if (action === 'remove-news-language') {
                delete state.config.news[lang];
                renderNewsSection();
                updatePreview();
            } else if (action === 'remove-news-entry') {
                const card = button.closest('[data-news-uid]');
                if (!card) return;
                const list = state.config.news[lang];
                const index = list.findIndex((entry) => entry.__uid === card.dataset.newsUid);
                if (index > -1) {
                    list.splice(index, 1);
                    renderNewsSection();
                    updatePreview();
                }
            }
        });

        byId('update-triggers-content')?.addEventListener('change', (event) => {
            if (!event.target.matches('input[data-role="update-trigger-checkbox"]')) return;
            const value = event.target.value;
            const active = new Set(state.config.onUpdateCompleteTriggers || []);
            if (event.target.checked) {
                active.add(value);
            } else {
                active.delete(value);
            }
            state.config.onUpdateCompleteTriggers = UPDATE_TRIGGER_OPTIONS.filter((option) => active.has(option.value)).map((option) => option.value);
            renderUpdateTriggersSection();
            updatePreview();
            updateStatusSummary();
        });

        byId('launcher-preview-content')?.addEventListener('change', (event) => {
            if (!event.target.matches('select[data-role="preview-language"]')) return;
            state.preview.language = event.target.value;
            renderLauncherPreviewSection();
        });
    }

    function findTrigger(app, domElement) {
        const triggerCard = domElement.closest('[data-trigger]');
        if (!triggerCard) return null;
        return app.triggers.find((item) => item.__uid === triggerCard.dataset.trigger) || null;
    }

    function findNewsEntry(domElement) {
        const langCard = domElement.closest('[data-news-lang]');
        if (!langCard) return { language: null, entry: null };
        const lang = langCard.dataset.newsLang;
        const entryCard = domElement.closest('[data-news-uid]');
        if (!entryCard) return { language: lang, entry: null };
        const list = state.config.news[lang] || [];
        const entry = list.find((item) => item.__uid === entryCard.dataset.newsUid) || null;
        return { language: lang, entry };
    }

    document.addEventListener('DOMContentLoaded', async () => {
        await enterAdminFullscreen();
        window.__ADMIN_MODE__ = true;
        attachHotkeys();
        ensureLanguagePicker();
        attachEventHandlers();
        
        // Попытка восстановить состояние из sessionStorage (если возвращаемся из preview)
        try {
            const savedState = sessionStorage.getItem('editorState');
            if (savedState) {
                const restored = JSON.parse(savedState);
                state.config = restored.config || createEmptyConfig();
                state.extras = restored.extras || {};
                state.lastLoadedSource = restored.lastLoadedSource || 'Восстановлено из предпросмотра';
                state.preview = restored.preview || { language: 'ru', selectedApp: null };
                renderAllSections();
                console.log('[Editor] Состояние восстановлено из sessionStorage');
                sessionStorage.removeItem('editorState'); // Очищаем после восстановления
            } else {
                applyConfig(createEmptyConfig(), 'Создан пустой шаблон');
            }
        } catch (e) {
            console.warn('[Editor] Не удалось восстановить состояние:', e);
            applyConfig(createEmptyConfig(), 'Создан пустой шаблон');
        }
    });
})();
