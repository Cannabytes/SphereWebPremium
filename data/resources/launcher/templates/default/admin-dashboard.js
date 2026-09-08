(() => {
    const isFunction = (fn) => typeof fn === 'function';

    const byId = (id) => document.getElementById(id);

    const navigateBack = () => {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = '/index.html';
        }
    };

    const attachHotkeys = () => {
        if (window.__adminHotkeysAttached) return;
        window.__adminHotkeysAttached = true;
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
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
    const statusEl = () => byId('dashboard-status');
    const licenseEl = () => byId('license-status');
    const summaryEl = () => byId('remote-summary');

    const setStatus = (type, message) => {
        const el = statusEl();
        if (!el) return;
        el.classList.remove('success', 'error');
        if (type) {
            el.classList.add(type);
        }
        el.textContent = message;
    };

    const setLicenseStatus = (type, message) => {
        const el = licenseEl();
        if (!el) return;
        el.classList.remove('success', 'error', 'info');
        if (type) {
            el.classList.add(type);
        }
        el.textContent = message;
    };

    const createSummaryCard = (label, value, note) => {
        const div = document.createElement('div');
        div.className = 'summary-card';
        div.innerHTML = `
            <span class="label">${label}</span>
            <span class="value">${value}</span>
            <span class="note">${note}</span>
        `;
        return div;
    };

    const renderSummary = (cfg) => {
        const container = summaryEl();
        if (!container) return;
        container.innerHTML = '';

        const csvCount = Array.isArray(cfg?.download?.csv) ? cfg.download.csv.length : 0;
        const archivesCount = Array.isArray(cfg?.download?.archives) ? cfg.download.archives.length : 0;
        const applications = Array.isArray(cfg?.application) ? cfg.application : [];
        const triggersTotal = applications.reduce((acc, app) => acc + (Array.isArray(app?.trigger) ? app.trigger.length : 0), 0);
        const translationLangs = cfg?.translationPaths ? Object.keys(cfg.translationPaths).length : 0;
        const defaultTranslation = cfg?.translationPaths ? Object.entries(cfg.translationPaths).find(([_, v]) => !!v?.default)?.[0] ?? 'не установлен' : 'не указан';
        const newsLangs = cfg?.news ? Object.keys(cfg.news).length : 0;
        const updateTriggers = Array.isArray(cfg?.onUpdateCompleteTriggers) ? cfg.onUpdateCompleteTriggers.length : 0;

        const appNamesLanguages = new Set();
        applications.forEach(app => {
            const name = app?.name;
            if (Array.isArray(name) && name.length > 0 && typeof name[0] === 'object') {
                Object.keys(name[0]).forEach(lang => appNamesLanguages.add(lang));
            }
        });

        container.appendChild(createSummaryCard('CSV-источники', csvCount, 'Ссылки, из которых берётся список файлов (download.csv).'));
        container.appendChild(createSummaryCard('Архивы', archivesCount, 'Каталоги или файлы, указанные в download.archives.'));
        container.appendChild(createSummaryCard('Записи запуска', applications.length, `Всего триггеров: ${triggersTotal}.`));
        container.appendChild(createSummaryCard('Языки кнопок', appNamesLanguages.size, appNamesLanguages.size ? `Используются: ${Array.from(appNamesLanguages).join(', ')}` : 'Добавьте переводы в поле name.'));
        container.appendChild(createSummaryCard('Пути перевода', translationLangs, `Язык по умолчанию: ${defaultTranslation}.`));
        container.appendChild(createSummaryCard('Новости', newsLangs, 'Количество языков с новостными лентами.'));
        container.appendChild(createSummaryCard('Post-update', updateTriggers, 'Количество триггеров в onUpdateCompleteTriggers.'));
    };

    const loadRemoteConfig = async () => {
        if (!window.go?.main?.App || !isFunction(window.go.main.App.GetRemoteConfigJSON)) {
            setStatus('error', 'Метод GetRemoteConfigJSON недоступен. Проверьте, что сборка выполнена с актуальным backend.');
            return;
        }
        try {
            const json = await window.go.main.App.GetRemoteConfigJSON(false);
            const parsed = JSON.parse(json);
            renderSummary(parsed);
            setStatus('success', 'Конфигурация загружена. Используйте F2 для детального редактирования.');
        } catch (err) {
            console.error('Не удалось получить удалённую конфигурацию:', err);
            setStatus('error', 'Удалённая конфигурация ещё не загружена. Запустите загрузку или подождите несколько секунд.');
            const container = summaryEl();
            if (container) {
                container.innerHTML = '<div class="summary-card"><span class="label">Нет данных</span><span class="value">—</span><span class="note">Удалённая конфигурация ещё не получена приложением.</span></div>';
            }
        }
    };

    const loadLicenseStatus = async () => {
        if (!licenseEl()) {
            return;
        }
        if (!window.go?.main?.App || !isFunction(window.go.main.App.GetTimeLockStatus)) {
            setLicenseStatus('error', 'Метод получения статуса лицензии недоступен.');
            return;
        }

        try {
            const status = await window.go.main.App.GetTimeLockStatus();
            if (status?.enabled && status.expiryDate) {
                const daysLeft = typeof status.daysLeft === 'number' ? status.daysLeft : null;
                if (typeof daysLeft === 'number' && daysLeft < 0) {
                    setLicenseStatus('error', `Лицензия истекла ${status.expiryDate} (просрочено ${Math.abs(daysLeft)} дн.).`);
                } else {
                    const suffix = typeof daysLeft === 'number' ? ` (осталось ${daysLeft} дн.)` : '';
                    setLicenseStatus('success', `Лицензия активна до ${status.expiryDate}${suffix}`);
                }
            } else {
                setLicenseStatus('error', 'Лицензия не активна или не настроена.');
            }
        } catch (err) {
            console.error('Не удалось получить статус лицензии:', err);
            setLicenseStatus('error', 'Не удалось обновить статус лицензии.');
        }
    };

    const ensureAdminMode = async () => {
        if (!window.go?.main?.App || !isFunction(window.go.main.App.AdminModeEnabled)) {
            return true; // если метода нет, предположим true, иначе попадём в цикл редиректов
        }
        try {
            const enabled = await window.go.main.App.AdminModeEnabled();
            if (!enabled) {
                setStatus('error', 'Админский режим отключён. Возврат к пользовательской части.');
                setTimeout(() => { window.location.href = '/index.html'; }, 1500);
                return false;
            }
            return true;
        } catch (err) {
            console.error('Ошибка проверки admin mode:', err);
            return true;
        }
    };

    document.addEventListener('DOMContentLoaded', async () => {
        byId('open-launcher-editor')?.addEventListener('click', () => {
            window.location.href = '/launcher-editor.html';
        });

        byId('open-create-page')?.addEventListener('click', () => {
            window.location.href = '/create.html';
        });

        byId('return-to-launcher')?.addEventListener('click', () => {
            window.location.href = '/index.html';
        });

        const adminOk = await ensureAdminMode();
        if (adminOk) {
            await enterAdminFullscreen();
            window.__ADMIN_MODE__ = true;
            attachHotkeys();
            await loadLicenseStatus();
            await loadRemoteConfig();
        }
    });
})();
