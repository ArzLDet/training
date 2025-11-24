document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 0. ИНИЦИАЛИЗАЦИЯ FIREBASE
    // ==========================================
    
    const firebaseConfig = {
        apiKey: "AIzaSyByw28KGU5izfPv_fen4j27qCkxTxmBALI",
        authDomain: "arzldet.firebaseapp.com",
        projectId: "arzldet",
        storageBucket: "arzldet.firebasestorage.app",
        messagingSenderId: "821653182618",
        appId: "1:821653182618:web:a67765aab6ecfb53dfe723",
        measurementId: "G-Z71RX7YE41",
        databaseURL: "https://arzldet-default-rtdb.firebaseio.com/"
    };

    // Инициализация
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        var auth = firebase.auth();
        var db = firebase.database();
        console.log("Firebase подключен успешно");
        
        // Сделаем переменные глобальными
        window.auth = auth;
        window.db = db;
        
    } catch (e) {
        console.error("Ошибка подключения Firebase:", e);
    }

    // ==========================================
    // СИСТЕМА АНТИ-AHK / АНТИ-AFK
    // ==========================================

    let enterPressCount = 0;       
    const MAX_ENTER_PRESSES = 15;  

    let sessionTimeout = null;     
    const SESSION_TIMEOUT_MS = 20000; 

    let lastActivityTime = Date.now();
    const AFK_TIMEOUT_MS = 30000; // 30 секунд AFK таймаут

    // Система отслеживания активности
    function trackUserActivity() {
        lastActivityTime = Date.now();
    }

    // Проверка AFK статуса - ТОЛЬКО в режиме слёта
    function checkAFKStatus() {
        if (!isCatchingMode) {
            return false;
        }
        
        const now = Date.now();
        if (now - lastActivityTime > AFK_TIMEOUT_MS) {
            console.log("AFK detected - resetting session");
            abortCatchingSession();
            return true;
        }
        return false;
    }

    // Запуск периодической проверки AFK
    setInterval(checkAFKStatus, 5000);

    // Отслеживание активности пользователя
    document.addEventListener('mousemove', trackUserActivity);
    document.addEventListener('keydown', trackUserActivity);
    document.addEventListener('click', trackUserActivity);

    // ==========================================
    // СИСТЕМА АУТЕНТИФИКАЦИИ
    // ==========================================
    
    let currentUser = null;
    let isRegisterMode = false; // Переключатель между входом и регистрацией
    let userStats = {
        bestTotalTime: 0,
        averageTotalTime: 0,
        totalPartsCaught: 0,
        sessionsCompleted: 0
    };

    // Элементы UI авторизации
    const authModal = document.getElementById('auth-modal');
    const authUsernameInput = document.getElementById('auth-username');
    const authPasswordInput = document.getElementById('auth-password');
    const authConfirmPasswordInput = document.getElementById('auth-confirm-password');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authTitleText = document.getElementById('auth-title-text');
    const authFooterText = document.getElementById('auth-footer-text');
    const authSwitchBtn = document.getElementById('auth-switch-btn');
    const authErrorMsg = document.getElementById('auth-error-msg');

// Проверка авторизации при загрузке
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            // ЗАГРУЖАЕМ ВСЮ СТАТИСТИКУ
            loadUserStats();      // Общая статистика (время сессий)
            loadUserPartStats();  // <--- НОВОЕ: Детальная статистика по запчастям
            
            updateUserInterface();
            console.log("Пользователь авторизован:", user.uid);
            closeAuthModal();
        } else {
            currentUser = null;
            console.log("Пользователь не авторизован");
            
            // СБРОС ПРИ ВЫХОДЕ (или если не вошел)
            // Обнуляем общую статистику
            userStats = {
                bestTotalTime: 0,
                averageTotalTime: 0,
                totalPartsCaught: 0,
                sessionsCompleted: 0
            };
            // Обнуляем детальную статистику деталей
            initStats(); // Эта функция теперь ставит нули (см. Шаг 1)
            
            updateUserInterface();
        }
    }); 

    // --- Функции управления UI авторизации ---

    window.toggleAuthMode = function() {
        isRegisterMode = !isRegisterMode;
        authErrorMsg.style.display = 'none';
        
        if (isRegisterMode) {
            authTitleText.textContent = 'Регистрация';
            authSubmitBtn.textContent = 'Зарегистрироваться';
            authConfirmPasswordInput.style.display = 'block';
            authFooterText.textContent = 'Уже есть аккаунт?';
            authSwitchBtn.textContent = 'Войти';
        } else {
            authTitleText.textContent = 'Вход';
            authSubmitBtn.textContent = 'Войти';
            authConfirmPasswordInput.style.display = 'none';
            authFooterText.textContent = 'Нет аккаунта?';
            authSwitchBtn.textContent = 'Регистрация';
        }
    };

    window.showAuthModal = function() {
        if (authModal) {
            authModal.style.display = 'block';
            // Сброс полей при открытии
            authUsernameInput.value = '';
            authPasswordInput.value = '';
            authConfirmPasswordInput.value = '';
            authErrorMsg.style.display = 'none';
            // По умолчанию режим входа
            isRegisterMode = false; 
            window.toggleAuthMode(); // Применяем UI для входа
            window.toggleAuthMode(); // (два раза, чтобы сбросить в false и обновить UI)
        }
    };

    window.closeAuthModal = function() {
        if (authModal) {
            authModal.style.display = 'none';
        }
    };

    window.handleAuthAction = async function() {
        const username = authUsernameInput.value.trim();
        const password = authPasswordInput.value.trim();
        const confirmPassword = authConfirmPasswordInput.value.trim();

        if (!username || !password) {
            showAuthError('Заполните все поля');
            return;
        }

        if (isRegisterMode) {
            // ЛОГИКА РЕГИСТРАЦИИ
            if (password !== confirmPassword) {
                showAuthError('Пароли не совпадают');
                return;
            }
            if (username.length < 3) {
                showAuthError('Имя пользователя минимум 3 символа');
                return;
            }

            try {
                // Проверка занятости имени
                const usernameSnapshot = await db.ref('username_lookup').child(username).once('value');
                if (usernameSnapshot.exists()) {
                    showAuthError('Имя пользователя уже занято');
                    return;
                }

                const userCredential = await auth.createUserWithEmailAndPassword(`${username}@arzldet.com`, password);
                const user = userCredential.user;

                // Создаем профиль в БД
                await db.ref('users').child(user.uid).set({
                    username: username,
                    stats: {
                        bestTotalTime: 0,
                        averageTotalTime: 0,
                        totalPartsCaught: 0,
                        sessionsCompleted: 0
                    }
                });

                // Занимаем имя
                await db.ref('username_lookup').child(username).set(user.uid);
                
                console.log("Регистрация успешна");
                // Вход произойдет автоматически через onAuthStateChanged

            } catch (error) {
                console.error("Auth error:", error);
                showAuthError(getAuthErrorMessage(error));
            }

        } else {
            // ЛОГИКА ВХОДА
            try {
                await auth.signInWithEmailAndPassword(`${username}@arzldet.com`, password);
                console.log("Вход успешен");
            } catch (error) {
                console.error("Login error:", error);
                showAuthError(getAuthErrorMessage(error));
            }
        }
    };

    function showAuthError(msg) {
        authErrorMsg.textContent = msg;
        authErrorMsg.style.display = 'block';
    }

    function getAuthErrorMessage(error) {
        switch (error.code) {
            case 'auth/user-not-found': return 'Пользователь не найден';
            case 'auth/wrong-password': return 'Неверный пароль';
            case 'auth/email-already-in-use': return 'Пользователь уже существует';
            case 'auth/weak-password': return 'Пароль слишком слабый (минимум 6 символов)';
            case 'auth/invalid-email': return 'Неверный формат email';
            default: return 'Ошибка: ' + error.message;
        }
    }

window.logout = function() {
        auth.signOut().then(() => {
            currentUser = null;
            // Сбрасываем общую статистику
            userStats = {
                bestTotalTime: 0,
                averageTotalTime: 0,
                totalPartsCaught: 0,
                sessionsCompleted: 0
            };
            // Сбрасываем статистику деталей в интерфейсе
            initStats(); // Вернет нули
            
            updateUserInterface();
            // Можно принудительно обновить дисплей инфо
            updateInfoDisplay();
        });
    }

    async function loadUserStats() {
        if (!currentUser) return;
        try {
            const snapshot = await db.ref('users').child(currentUser.uid).child('stats').once('value');
            if (snapshot.exists()) {
                userStats = snapshot.val();
            }
        } catch (error) {
            console.error("Ошибка загрузки статистики:", error);
        }
    }

    async function updateUserStats() {
        if (!currentUser) return;
        try {
            await db.ref('users').child(currentUser.uid).child('stats').set(userStats);
            updateLeaderboards();
        } catch (error) {
            console.error("Ошибка обновления статистики:", error);
        }
    }

    // ==========================================
    // СИСТЕМА ТАБЛИЦ ЛИДЕРОВ
    // ==========================================
// Новая функция: Считает среднее арифметическое всех личных рекордов
function calculateAverageOfAllBests() {
    let totalTime = 0;
    let partsCount = 0;

    for (const partName in partStats) {
        // Проверяем, есть ли у детали статистика и установлен ли рекорд (время > 0)
        if (partStats[partName] && partStats[partName].fastestTime > 0) {
            totalTime += partStats[partName].fastestTime;
            partsCount++;
        }
    }

    // Если рекордов нет, возвращаем 0
    if (partsCount === 0) return 0;
    
    // Возвращаем среднее арифметическое
    return totalTime / partsCount;
}

async function updateLeaderboards() {
        if (!currentUser) return;
        
        // ПОЛУЧАЕМ ИМЯ И ЦВЕТ
        const uSnap = await db.ref(`users/${currentUser.uid}`).once('value');
        const uData = uSnap.val();
        const username = uData.username;
        const color = uData.color || '#ffffff'; // Берем цвет

        if (!username) return;
        
        // ...дальше идет твой код calculateAverageOfAllBests()...
        // ВАЖНО: В каждом .set({}) ниже добавь строчку: color: color,

        // --- ИЗМЕНЕНИЕ НАЧАЛО ---
        // 1. Считаем среднее арифметическое рекордов по деталям
        const avgBestPartsTime = calculateAverageOfAllBests();

        // 2. Если результат есть (> 0), отправляем его в таблицу "Лучшее время"
        if (avgBestPartsTime > 0) {
            await db.ref('leaderboard_best_time').child(currentUser.uid).set({
                username: username,
                // Используем то же поле bestTotalTime, чтобы таблица отображалась корректно
                bestTotalTime: avgBestPartsTime, 
                timestamp: Date.now()
            });
        }
        // --- ИЗМЕНЕНИЕ КОНЕЦ ---

        // Остальные таблицы (среднее время сессий и кол-во деталей) оставляем как есть
        if (userStats.averageTotalTime > 0) {
            await db.ref('leaderboard_avg_time').child(currentUser.uid).set({
                username: username,
                averageTotalTime: userStats.averageTotalTime,
                timestamp: Date.now()
            });
        }

        if (userStats.totalPartsCaught > 0) {
            await db.ref('leaderboard_parts_count').child(currentUser.uid).set({
                username: username,
                totalPartsCaught: userStats.totalPartsCaught,
                timestamp: Date.now()
            });
        }
    }

    async function getUsername(uid) {
        try {
            const snapshot = await db.ref('users').child(uid).child('username').once('value');
            return snapshot.val();
        } catch (error) {
            return null;
        }
    }

   function loadLeaderboard() {
        loadBestTimeLeaderboard();
        loadAvgTimeLeaderboard();
        loadPartsCountLeaderboard();
    }

async function loadBestTimeLeaderboard() {
        const container = document.querySelector('.leaderboard-category.best-time .leaderboard-table-container');
        if (!container) return;
        try {
            // ЛИМИТ 15
            const snapshot = await db.ref('leaderboard_best_time').orderByChild('bestTotalTime').limitToFirst(15).once('value');
            displayLeaderboard(snapshot, container, 'bestTotalTime', 'сек', true);
        } catch (error) {
            console.error(error);
            container.innerHTML = '<div class="leaderboard-empty"><div class="empty-message">Ошибка загрузки</div></div>';
        }
    }

  async function loadAvgTimeLeaderboard() {
        const container = document.querySelector('.leaderboard-category.avg-time .leaderboard-table-container');
        if (!container) return;
        try {
            // ЛИМИТ 15
            const snapshot = await db.ref('leaderboard_avg_time').orderByChild('averageTotalTime').limitToFirst(15).once('value');
            displayLeaderboard(snapshot, container, 'averageTotalTime', 'сек', true);
        } catch (error) {
            console.error(error);
            container.innerHTML = '<div class="leaderboard-empty"><div class="empty-message">Ошибка загрузки</div></div>';
        }
    }

async function loadPartsCountLeaderboard() {
        const container = document.querySelector('.leaderboard-category.parts-count .leaderboard-table-container');
        if (!container) return;
        try {
            // ЛИМИТ 15 (limitToLast, так как чем больше, тем лучше)
            const snapshot = await db.ref('leaderboard_parts_count').orderByChild('totalPartsCaught').limitToLast(15).once('value');
            displayLeaderboard(snapshot, container, 'totalPartsCaught', 'шт', false);
        } catch (error) {
            console.error(error);
            container.innerHTML = '<div class="leaderboard-empty"><div class="empty-message">Ошибка загрузки</div></div>';
        }
    }

   // --- НОВАЯ ФУНКЦИЯ ОТОБРАЖЕНИЯ С ЛОГИКОЙ СТРЕЛОК ---

   // ==========================================
    // НОВАЯ ФУНКЦИЯ ОТОБРАЖЕНИЯ (ВСЁ В ОДНОМ)
    // ==========================================

    // Глобальная переменная для хранения истории сессии
    // Используем window, чтобы она была доступна везде и не вызывала ошибок
    window.sessionStartPositions = window.sessionStartPositions || {};

    function displayLeaderboard(snapshot, container, field, unit, ascending = true) {
        // 1. ПРОВЕРКА И ЗАГРУЗКА ИСТОРИИ (Самостоятельная)
        // Если мы еще не загружали историю для этой категории в этой сессии — загружаем сейчас
        if (!window.sessionStartPositions[field]) {
            try {
                const storageKey = 'lb_pos_' + field;
                const savedData = localStorage.getItem(storageKey);
                window.sessionStartPositions[field] = savedData ? JSON.parse(savedData) : {};
            } catch (e) {
                console.warn("Сброс истории из-за ошибки чтения:", e);
                window.sessionStartPositions[field] = {};
            }
        }

        const scores = [];
        snapshot.forEach((childSnapshot) => {
            // Защита от пустых данных
            const val = childSnapshot.val();
            if (val) {
                scores.push({ ...val, uid: childSnapshot.key });
            }
        });

        // 2. СОРТИРОВКА
        if (ascending) {
            scores.sort((a, b) => (Number(a[field]) || 0) - (Number(b[field]) || 0));
        } else {
            scores.sort((a, b) => (Number(b[field]) || 0) - (Number(a[field]) || 0));
        }

        // 3. ЛИМИТ ТОП-15
        const top15Scores = scores.slice(0, 15);

        if (top15Scores.length === 0) {
            container.innerHTML = '<div class="leaderboard-empty"><div class="empty-message">Рекордов пока нет</div></div>';
            return;
        }

        // 4. ПОДГОТОВКА ДАННЫХ
        const lastPositions = window.sessionStartPositions[field]; // Берем загруженную историю
        let newPositionsForStorage = {}; // Сюда запишем новые места для следующего раза

        let leaderboardHTML = '';
        
        top15Scores.forEach((score, index) => {
            const currentRank = index + 1;
            const uid = score.uid;
            
            // Запоминаем текущее место (для будущего сохранения)
            newPositionsForStorage[uid] = currentRank;

            // --- ЛОГИКА СТРЕЛОК ---
            let changeHtml = '<span class="position-change" style="opacity:0.3">-</span>';
            
            // Если этот игрок был в сохраненной истории
            if (lastPositions && lastPositions[uid]) {
                const oldRank = lastPositions[uid];
                const diff = oldRank - currentRank; 

                if (diff > 0) {
                    // Поднялся (Зеленая стрелка)
                    changeHtml = `<span class="position-change positive">↑ ${diff}</span>`;
                } else if (diff < 0) {
                    // Опустился (Красная стрелка)
                    changeHtml = `<span class="position-change negative">↓ ${Math.abs(diff)}</span>`;
                } else {
                    // На месте
                    changeHtml = `<span class="position-change" style="opacity:0.3">=</span>`;
                }
            } else {
                // Если игрока раньше не было в топе
                changeHtml = `<span class="position-change new-entry">NEW</span>`;
            }
            // ---------------------

            const isCurrentUser = currentUser && uid === currentUser.uid;
            // Стиль для текущего игрока (синяя подсветка)
            const userStyle = isCurrentUser ? 'style="background: rgba(42, 171, 238, 0.1); border-left: 3px solid #2AABEE;"' : '';
            const nameColor = isCurrentUser ? '#2AABEE' : 'white';
            
            // Красивый вывод чисел
            let valueDisplay;
            if (field === 'totalPartsCaught') {
                valueDisplay = score[field];
            } else {
                // Проверка на число перед toFixed
                valueDisplay = (Number(score[field]) || 0).toFixed(3);
            }

            // Форматирование даты
            const dateStr = score.timestamp ? new Date(score.timestamp).toLocaleDateString() : '-';

            leaderboardHTML += `
                <div class="leaderboard-row" ${userStyle}>
                    <div style="font-weight:bold; color:#666;">${currentRank}</div>
                    <div style="color: ${nameColor}; font-weight:600;">${score.username || 'Неизвестный'}</div>
                    <div style="font-family:monospace;">${valueDisplay}</div>
                    <div style="color:#888; font-size:12px;">${unit}</div>
                    <div style="color:#666; font-size:11px;">${dateStr}</div>
                    <div>${changeHtml}</div>
                </div>
            `;
        });

        // 5. СОХРАНЕНИЕ В ПАМЯТЬ БРАУЗЕРА (ДЛЯ СЛЕДУЮЩЕЙ ПЕРЕЗАГРУЗКИ)
        try {
            const storageKey = 'lb_pos_' + field; 
            localStorage.setItem(storageKey, JSON.stringify(newPositionsForStorage));
        } catch (e) {
            console.error("Ошибка сохранения в LocalStorage:", e);
        }

        container.innerHTML = leaderboardHTML;
    }
    function updateUserInterface() {
        const userPanel = document.querySelector('.leaderboard-user-panel');
        if (!userPanel && currentUser) {
            createUserPanel();
        } else if (userPanel && currentUser) {
            updateUserPanel();
        } else if (userPanel && !currentUser) {
            userPanel.remove();
        }
        
        addRegisterButtonToLeaderboard();
    }

    function createUserPanel() {
        const leaderboardRow = document.getElementById('row-leaderboard');
        if (!leaderboardRow) return;

        const userPanel = document.createElement('div');
        userPanel.className = 'leaderboard-user-panel';
        userPanel.innerHTML = `
            <span class="user-badge" id="userBadge">Загрузка...</span>
            <button class="logout-btn" onclick="window.logout()">Выйти</button>
        `;
        leaderboardRow.appendChild(userPanel);
        updateUserPanel();
    }

    async function updateUserPanel() {
        const userBadge = document.getElementById('userBadge');
        if (userBadge && currentUser) {
            const username = await getUsername(currentUser.uid);
            if (username) {
                userBadge.textContent = username;
            }
        }
    }

    // ИСПРАВЛЕННАЯ ФУНКЦИЯ ДОБАВЛЕНИЯ КНОПКИ РЕГИСТРАЦИИ
    function addRegisterButtonToLeaderboard() {
        const leaderboardRow = document.getElementById('row-leaderboard');
        if (!leaderboardRow) return;

        const existingBtn = leaderboardRow.querySelector('.leaderboard-register-btn');
        if (existingBtn) existingBtn.remove();

        if (!currentUser) {
            const registerBtn = document.createElement('button');
            // Используем класс из CSS вместо встроенных стилей
            registerBtn.className = 'leaderboard-register-btn'; 
            registerBtn.innerHTML = '📝 Зарегистрироваться';
            registerBtn.onclick = showAuthModal;
            leaderboardRow.appendChild(registerBtn);
        }
    }

    function initLeaderboardTabs() {
        const tabs = document.querySelectorAll('.leaderboard-tab');
        const categories = document.querySelectorAll('.leaderboard-category');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const category = tab.getAttribute('data-category');
                
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                categories.forEach(cat => cat.classList.remove('active'));
                document.querySelector(`.leaderboard-category.${category}`).classList.add('active');
                
                switch(category) {
                    case 'best-time': loadBestTimeLeaderboard(); break;
                    case 'avg-time': loadAvgTimeLeaderboard(); break;
                    case 'parts-count': loadPartsCountLeaderboard(); break;
                }
            });
        });
    }

    function updateUserStatistics(totalSessionTime, partsCaught) {
        if (!currentUser || partsCaught === 0) return;

        userStats.totalPartsCaught += partsCaught;
        
        if (userStats.bestTotalTime === 0 || totalSessionTime < userStats.bestTotalTime) {
            userStats.bestTotalTime = totalSessionTime;
        }
        
        userStats.sessionsCompleted++;
        userStats.averageTotalTime = ((userStats.averageTotalTime * (userStats.sessionsCompleted - 1)) + totalSessionTime) / userStats.sessionsCompleted;
        
        updateUserStats();
    }

    // ==========================================
    // 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И НАСТРОЙКИ
    // ==========================================
    
    let userSettings = {
        catchKey: 'h', 
        backgroundMode: 'default', 
        customBgData: null 
    };

    function loadSettings() {
        const saved = localStorage.getItem('appSettings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                userSettings = { ...userSettings, ...parsed };
            } catch (e) {
                console.error('Ошибка загрузки настроек', e);
            }
        }
        applySettings();
    }

    function saveSettings() {
        try {
            localStorage.setItem('appSettings', JSON.stringify(userSettings));
        } catch (e) {
            console.error('Ошибка сохранения', e);
            alert('Картинка слишком большая для сохранения.');
        }
    }

    function applySettings() {
        const appFrame = document.querySelector('.main-app-frame');
        const settingsFrameContent = document.querySelector('.settings-content-framed');
        const innerSettingsFrames = document.querySelectorAll('.info-frame.settings-frame');

        const keyDisplay = document.getElementById('currentKeyDisplay');
        if (keyDisplay) {
            if (userSettings.catchKey === 'RMB') {
                keyDisplay.textContent = 'ПКМ';
            } else {
                keyDisplay.textContent = userSettings.catchKey.toUpperCase();
            }
        }

        if (appFrame) {
            appFrame.classList.remove('custom-bg-darkened');
            appFrame.style.backgroundImage = '';
            appFrame.style.backgroundColor = '';
        }
        
        if (settingsFrameContent) settingsFrameContent.classList.remove('adaptive-glass', 'adaptive-black');
        innerSettingsFrames.forEach(frame => frame.classList.remove('adaptive-glass', 'adaptive-black'));

        if (userSettings.backgroundMode === 'black') {
            if (appFrame) {
                appFrame.style.backgroundImage = 'none';
                appFrame.style.backgroundColor = '#111';
            }
            if (settingsFrameContent) settingsFrameContent.classList.add('adaptive-black');
            innerSettingsFrames.forEach(frame => frame.classList.add('adaptive-black'));
        } else if (userSettings.backgroundMode === 'default') {
            if (appFrame) appFrame.style.backgroundImage = 'url(background.png)';
        } else if (userSettings.backgroundMode === 'custom' && userSettings.customBgData) {
            if (appFrame) {
                appFrame.style.backgroundImage = `url(${userSettings.customBgData})`;
                appFrame.classList.add('custom-bg-darkened');
            }
            if (settingsFrameContent) settingsFrameContent.classList.add('adaptive-glass');
            innerSettingsFrames.forEach(frame => frame.classList.add('adaptive-glass'));
        }

        const bgSelect = document.getElementById('bgSelect');
        if (bgSelect) bgSelect.value = userSettings.backgroundMode;

        const uploadArea = document.getElementById('customBgUploadArea');
        if (uploadArea) {
            uploadArea.style.display = userSettings.backgroundMode === 'custom' ? 'block' : 'none';
        }
    }

    // ==========================================
    // ЛОГИКА НАСТРОЕК
    // ==========================================
    
    const settingsModal = document.getElementById('settingsModal');
    const settingsBtn = document.querySelector('.settings-btn');
    const closeSettingsBtn = document.querySelector('.close-settings-btn');
    const recordKeyBtn = document.getElementById('recordKeyBtn');
    let isRecordingKey = false;
    const bgSelect = document.getElementById('bgSelect');
    const bgFileInput = document.getElementById('bgFileInput');

if (settingsBtn) {
        settingsBtn.onclick = (e) => {
            e.preventDefault();
            if (settingsModal) settingsModal.style.display = 'block';
            
            loadProfile(); // <--- ДОБАВИТЬ ЭТУ СТРОКУ
        };
    }

    function closeSettings() {
        if (settingsModal) settingsModal.style.display = 'none';
        if (isRecordingKey) stopRecordingKey();
    }
    
    function stopRecordingKey() {
        isRecordingKey = false;
        if (recordKeyBtn) {
            recordKeyBtn.textContent = 'Назначить клавишу';
            recordKeyBtn.classList.remove('recording');
        }
    }

    if (closeSettingsBtn) closeSettingsBtn.onclick = closeSettings;

    window.addEventListener('click', (event) => {
        if (event.target === settingsModal) closeSettings();
        if (event.target === authModal) closeAuthModal();
    });

    if (recordKeyBtn) {
        recordKeyBtn.addEventListener('click', () => {
            isRecordingKey = true;
            recordKeyBtn.textContent = 'Нажмите клавишу...';
            recordKeyBtn.classList.add('recording');
        });
    }

    document.addEventListener('contextmenu', (e) => {
        if (isRecordingKey || userSettings.catchKey === 'RMB') {
            e.preventDefault();
        }
    });

    document.addEventListener('mousedown', (e) => {
        if (e.button === 2) { // ПКМ
            if (isRecordingKey) {
                e.preventDefault();
                userSettings.catchKey = 'RMB';
                saveSettings();
                applySettings();
                stopRecordingKey();
                return;
            }
            if (userSettings.catchKey === 'RMB') {
                e.preventDefault();
                activateCatchingMode();
            }
        }
    });

    document.addEventListener('keydown', (e) => {
        if (isRecordingKey) {
            e.preventDefault();
            userSettings.catchKey = e.key;
            saveSettings();
            applySettings();
            stopRecordingKey();
            return;
        }
        handleGlobalKeydown(e);
    });

    if (bgSelect) {
        bgSelect.addEventListener('change', (e) => {
            userSettings.backgroundMode = e.target.value;
            if (userSettings.backgroundMode !== 'custom') {
                userSettings.customBgData = null;
            }
            saveSettings();
            applySettings();
        });
    }

    if (bgFileInput) {
        bgFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(evt) {
                    userSettings.customBgData = evt.target.result;
                    userSettings.backgroundMode = 'custom';
                    if(bgSelect) bgSelect.value = 'custom';
                    saveSettings();
                    applySettings();
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // ==========================================
    // ОСНОВНАЯ ЛОГИКА ИГРЫ (ПОЛНЫЙ ФУНКЦИОНАЛ)
    // ==========================================

    const buttons = [
        document.querySelector('.part-selector-button-1'),
        document.querySelector('.part-selector-button-2'),
        document.querySelector('.part-selector-button-3'),
        document.querySelector('.part-selector-button-4')
    ].filter(btn => btn !== null); 

    const targetRowsMap = {
        'Двигатель': {
            'part-selector-button-1': 'row-kolenval',
            'part-selector-button-2': 'row-raspredval',
            'part-selector-button-3': 'row-turbina',
            'part-selector-button-4': 'row-proshivka'
        },
        'Трансмиссия': {
            'part-selector-button-1': 'row-sceplenie',
            'part-selector-button-2': 'row-kpp',
            'part-selector-button-3': 'row-differencial'
        },
        'Шасси': {
            'part-selector-button-1': 'row-podveska',
            'part-selector-button-2': 'row-tormoza'
        },
        'Информация': { 'info': 'row-info' },
        'Таблица лидеров': { 'leaderboard': 'row-leaderboard' }
    };

    const detailRows = document.querySelectorAll('.parts-row');
    let currentSlotIndex = 0;
    let currentRow = document.getElementById('row-kolenval');
    let holdInterval = null;

    let itemCount = 0;
    let cartItems = [];

    let isCatchingMode = false;
    let spawnedParts = [];
    let canSpawnNewParts = true;
    let partStats = {};

    let catchStartTime = 0;
    let currentCatchTime = 0;
    let isTimerRunning = false;
    let individualCatchTimes = {}; 

    const cartModal = document.getElementById('cartModal');
    const closeCartBtn = document.querySelector('.close-cart-btn');
    const clearCartBtn = document.querySelector('.clear-cart-btn');
    const buyBtn = document.querySelector('.buy-btn');
    const cartItemsContainer = document.querySelector('.cart-items');
    const categoryButtons = document.querySelectorAll('.category-btn');
    const partButtons = document.querySelectorAll('[class*="part-selector-button-"]');

    document.querySelector('.main-app-frame').classList.add('engine-active');

    // Функция создания пустой статистики (нулевой)
    function getDefaultStats() {
        const allParts = [
            'Коленвал', 'Распредвал', 'Турбина', 'Нагнетатель', 'Прошивка',
            'Сцепление', 'КПП', 'Дифференциал', 'Подвеска', 'Тормоза'
        ];
        const stats = {};
        allParts.forEach(part => {
            stats[part] = { fastestTime: 0, averageTime: 0, totalCount: 0, lastTime: 0 };
        });
        return stats;
    }

    // Инициализация (сначала ставим нули)
    function initStats() {
        // Убираем загрузку из localStorage!
        partStats = getDefaultStats();
        updateInfoDisplay();
    }

    // Загрузка статистики деталей конкретного игрока из Firebase
    async function loadUserPartStats() {
        if (!currentUser) return;
        try {
            const snapshot = await db.ref('users').child(currentUser.uid).child('part_stats').once('value');
            if (snapshot.exists()) {
                // Если в базе есть данные - берем их
                partStats = snapshot.val();
            } else {
                // Если данных нет (новый игрок) - создаем нули
                partStats = getDefaultStats();
            }
            updateInfoDisplay(); // Обновляем экран
            console.log("Статистика деталей загружена");
        } catch (error) {
            console.error("Ошибка загрузки статистики деталей:", error);
        }
    }

    // Сохранение статистики деталей в Firebase
    async function saveUserPartStats() {
        if (!currentUser) return;
        try {
            await db.ref('users').child(currentUser.uid).child('part_stats').set(partStats);
        } catch (error) {
            console.error("Ошибка сохранения статистики деталей:", error);
        }
    }

    function saveStats() {
        localStorage.setItem('partStats', JSON.stringify(partStats));
    }

    function updateInfoDisplay() {
        const infoItems = document.querySelectorAll('.info-item');
        infoItems.forEach((item) => {
            const partNameElement = item.querySelector('.info-name');
            if (!partNameElement) return;
            const partName = partNameElement.textContent.trim();
            const stats = partStats[partName];
            if (!stats) return;
            const statLines = item.querySelectorAll('.info-stat-line');
            if (statLines.length >= 3) {
                const fastest = statLines[0].querySelector('.info-stat-value');
                if (fastest) fastest.textContent = stats.fastestTime > 0 ? `${stats.fastestTime.toFixed(2)} сек` : '0 сек';
                
                const average = statLines[1].querySelector('.info-stat-value');
                if (average) {
                    average.textContent = stats.averageTime > 0 ? `${stats.averageTime.toFixed(2)} сек` : '0 сек';
                    const changeElement = average.querySelector('.info-stat-change');
                    if (changeElement) {
                        const change = stats.lastTime > 0 ? stats.averageTime - stats.lastTime : 0;
                        changeElement.textContent = change >= 0 ? `(+${change.toFixed(2)})` : `(${change.toFixed(2)})`;
                        changeElement.className = change >= 0 ? 'info-stat-change' : 'info-stat-change negative';
                    }
                }
                const total = statLines[2].querySelector('.info-stat-value');
                if (total) {
                    total.textContent = stats.totalCount.toString();
                }
            }
        });
    }

    function updatePartStats(partName, catchTime) {
        if (!partStats[partName]) {
            partStats[partName] = { fastestTime: 0, averageTime: 0, totalCount: 0, lastTime: 0 };
        }
        
        const stats = partStats[partName];
        const previousAverage = stats.averageTime;
        
        let isNewRecord = false; // Флаг: побит ли рекорд

        // Логика обновления лучшего времени ДЕТАЛИ
        if (stats.fastestTime === 0 || catchTime < stats.fastestTime) {
            stats.fastestTime = catchTime;
            isNewRecord = true; // Запоминаем, что это новый рекорд
        }

        stats.totalCount++;
        stats.lastTime = previousAverage; 
        stats.averageTime = ((stats.averageTime * (stats.totalCount - 1)) + catchTime) / stats.totalCount;
        
        if (currentUser) {
            saveUserPartStats(); // Сохраняем личную статистику
            
            // ВАЖНО: Если мы поставили новый рекорд на детали,
            // среднее арифметическое рекордов изменилось -> обновляем лидерборд немедленно
            if (isNewRecord) {
                updateLeaderboards();
            }
        } else {
            console.log("Игрок не авторизован, статистика не сохранена в облако");
        }
        
        updateInfoDisplay();
    }
    function startCatchTimer() {
        if (!isTimerRunning) {
            catchStartTime = Date.now();
            isTimerRunning = true;
            individualCatchTimes = {}; 
            console.log("Таймер запущен");
        }
    }

    function stopCatchTimer() {
        if (isTimerRunning && catchStartTime > 0) {
            currentCatchTime = (Date.now() - catchStartTime) / 1000;
            isTimerRunning = false;
            catchStartTime = 0;
            console.log("Таймер остановлен, время: " + currentCatchTime.toFixed(3) + " сек");
            return currentCatchTime;
        }
        return 0;
    }

    function resetCatchTimer() {
        isTimerRunning = false;
        catchStartTime = 0;
        currentCatchTime = 0;
        individualCatchTimes = {};
    }

    function hideAllPartButtons() {
        partButtons.forEach(btn => btn.style.display = 'none');
    }

    function showPartButtons(category) {
        hideAllPartButtons();
        document.querySelector('.main-app-frame').classList.remove('engine-active', 'transmission-active', 'chassis-active', 'info-active', 'leaderboard-active');
        const infoList = document.querySelector('.info-vertical-list');
        if (infoList) infoList.style.display = 'none';
        
        if (category === 'Двигатель') {
            document.querySelector('.main-app-frame').classList.add('engine-active');
            partButtons.forEach(btn => btn.style.display = 'block');
            document.querySelector('.part-selector-button-1').textContent = 'Коленвал';
            document.querySelector('.part-selector-button-2').textContent = 'Распредвал';
            document.querySelector('.part-selector-button-3').textContent = 'Турбина';
            document.querySelector('.part-selector-button-4').textContent = 'Прошивка';
            switchCategory(document.querySelector('.part-selector-button-1'), 'Двигатель');
        }
        else if (category === 'Трансмиссия') {
            document.querySelector('.main-app-frame').classList.add('transmission-active');
            document.querySelector('.part-selector-button-1').style.display = 'block';
            document.querySelector('.part-selector-button-2').style.display = 'block';
            document.querySelector('.part-selector-button-3').style.display = 'block';
            document.querySelector('.part-selector-button-1').textContent = 'Сцепление';
            document.querySelector('.part-selector-button-2').textContent = 'КПП';
            document.querySelector('.part-selector-button-3').textContent = 'Дифференциал';
            switchCategory(document.querySelector('.part-selector-button-1'), 'Трансмиссия');
        }
        else if (category === 'Шасси') {
            document.querySelector('.main-app-frame').classList.add('chassis-active');
            document.querySelector('.part-selector-button-1').style.display = 'block';
            document.querySelector('.part-selector-button-2').style.display = 'block';
            document.querySelector('.part-selector-button-1').textContent = 'Подвеска';
            document.querySelector('.part-selector-button-2').textContent = 'Тормоза';
            switchCategory(document.querySelector('.part-selector-button-1'), 'Шасси');
        }
        else if (category === 'Информация') {
            document.querySelector('.main-app-frame').classList.add('info-active');
            if (infoList) infoList.style.display = 'block';
            switchCategory(null, 'Информация');
        }
        else if (category === 'Таблица лидеров') {
            document.querySelector('.main-app-frame').classList.add('leaderboard-active');
            switchCategory(null, 'Таблица лидеров');
        }
    }

    categoryButtons.forEach(button => {
        button.addEventListener('click', () => {
            categoryButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            showPartButtons(button.textContent);
        });
    });

    showPartButtons('Двигатель');

    function switchCategory(button, category) {
        const buttonClass = button ? Array.from(button.classList).find(cls => cls.startsWith('part-selector-button-')) : (category === 'Информация' ? 'info' : 'leaderboard');
        const targetId = targetRowsMap[category][buttonClass];
        detailRows.forEach(row => row.classList.remove('active'));
        const targetRow = document.getElementById(targetId);
        if (targetRow) {
            targetRow.classList.add('active');
            currentRow = targetRow;
        }
        if (category !== 'Информация' && category !== 'Таблица лидеров') {
            buttons.forEach(btn => btn.classList.remove('active'));
            if (button) button.classList.add('active');
        }
        
        if (category === 'Таблица лидеров') {
            loadLeaderboard();
        }

        currentSlotIndex = 0;
        highlightSelectedSlot();
    }

    function highlightSelectedSlot() {
        if (!currentRow) return;
        const slots = currentRow.querySelectorAll('.part-slot');
        slots.forEach((slot, index) => {
            slot.classList.remove('selected');
            if (index === currentSlotIndex) {
                slot.classList.add('selected');
                updateActionButton(slot);
            }
        });
    }

    function updateActionButton(slot) {
        if (!slot) return;
        let actionContainer = slot.querySelector('.action-button-container');
        if (!actionContainer) {
            actionContainer = document.createElement('div');
            actionContainer.className = 'action-button-container';
            slot.appendChild(actionContainer);
        }
        const partStatus = slot.querySelector('.part-status').textContent.trim();
        if (partStatus === "В наличии") {
            const partName = slot.querySelector('.part-name').textContent.trim();
            const tier = slot.querySelector('.tier-label').textContent.trim();
            const isInCart = cartItems.some(item => item.name === partName && item.tier === tier);
            let button = actionContainer.querySelector('.slot-action-btn');
            if (!button) {
                button = document.createElement('button');
                button.className = 'slot-action-btn';
                button.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleSlotAction(slot);
                });
                actionContainer.appendChild(button);
            }
            if (isInCart) {
                slot.classList.add('in-cart-highlight');
                button.textContent = 'Удалить из корзины';
                button.classList.remove('add-to-cart');
                button.classList.add('remove-from-cart');
            } else {
                slot.classList.remove('in-cart-highlight');
                button.textContent = 'Добавить в корзину';
                button.classList.remove('remove-from-cart');
                button.classList.add('add-to-cart');
            }
        } else {
            slot.classList.remove('in-cart-highlight');
            actionContainer.innerHTML = ''; 
        }
    }

    function handleSlotAction(slot) {
        if (!slot) return;
        const partStatus = slot.querySelector('.part-status').textContent.trim();
        if (partStatus !== "В наличии") return;
        const partName = slot.querySelector('.part-name').textContent.trim();
        const tier = slot.querySelector('.tier-label').textContent.trim();
        const isInCart = cartItems.some(item => item.name === partName && item.tier === tier);
        if (!isInCart) addToCart(slot);
        else removeFromCart(slot);
        updateActionButton(slot);
    }

    function nextSlot() {
        if (!currentRow) return;
        const slots = currentRow.querySelectorAll('.part-slot');
        if (slots.length > 0 && currentSlotIndex < slots.length - 1) {
            currentSlotIndex++;
            highlightSelectedSlot();
        }
    }

    function prevSlot() {
        if (!currentRow) return;
        const slots = currentRow.querySelectorAll('.part-slot');
        if (slots.length > 0 && currentSlotIndex > 0) {
            currentSlotIndex--;
            highlightSelectedSlot();
        }
    }

    function goToLastSlot() {
        if (!currentRow) return;
        const slots = currentRow.querySelectorAll('.part-slot');
        if (slots.length > 0) {
            currentSlotIndex = slots.length - 1;
            highlightSelectedSlot();
        }
    }

    function goToFirstSlot() {
        if (!currentRow) return;
        currentSlotIndex = 0;
        highlightSelectedSlot();
    }

    function updateCounter() {
        const counterNumber = document.querySelector('.counter-number');
        const counterBadge = document.querySelector('.counter-badge');
        if (counterNumber) counterNumber.textContent = itemCount;
        if (counterBadge) counterBadge.textContent = itemCount;
    }

    function addToCart(targetSlot) {
        if (!currentRow) return;
        let selectedSlot = targetSlot || currentRow.querySelectorAll('.part-slot')[currentSlotIndex];
        if (selectedSlot) {
            const partStatus = selectedSlot.querySelector('.part-status').textContent.trim();
            if (partStatus === "Нет в продаже") return;
            const partName = selectedSlot.querySelector('.part-name').textContent.trim();
            const tier = selectedSlot.querySelector('.tier-label').textContent.trim();
            const partImage = selectedSlot.querySelector('.part-image').src;
            const existingItem = cartItems.find(item => item.name === partName && item.tier === tier);
            if (!existingItem) {
                const currentTime = isTimerRunning ? (Date.now() - catchStartTime) / 1000 : currentCatchTime;
                const newItem = {
                    id: Date.now(),
                    name: partName,
                    tier: tier,
                    image: partImage,
                    price: calculatePrice(tier),
                    quantity: 1,
                    catchTime: currentTime
                };
                cartItems.push(newItem);
                itemCount++;
                updateCounter();
                updateCartDisplay();
                console.log(`Добавлено в корзину: ${partName}, время: ${currentTime.toFixed(3)} сек`);
            }
        }
    }

    function removeFromCart(targetSlot) {
        if (!currentRow) return;
        let selectedSlot = targetSlot || currentRow.querySelectorAll('.part-slot')[currentSlotIndex];
        if (selectedSlot) {
            const partName = selectedSlot.querySelector('.part-name').textContent.trim();
            const tier = selectedSlot.querySelector('.tier-label').textContent.trim();
            const itemIndex = cartItems.findIndex(item => item.name === partName && item.tier === tier);
            if (itemIndex !== -1) {
                const item = cartItems[itemIndex];
                itemCount -= item.quantity;
                cartItems.splice(itemIndex, 1);
                updateCounter();
                updateCartDisplay();
            }
        }
    }

    function calculatePrice(tier) {
        const prices = { 'imprize': 5000, 'sport': 10000, 'sport+': 15000, 'STAGE-1': 8000, 'STAGE-2': 12000, 'STAGE-3': 18000 };
        return prices[tier] || 5000;
    }

    function updateCartDisplay() {
        if (cartItems.length === 0) {
            cartItemsContainer.innerHTML = '<div class="empty-cart">Корзина пуста</div>';
            return;
        }
        let itemsHTML = '';
        cartItems.forEach(item => {
            itemsHTML += `
                <div class="cart-item">
                    <img src="${item.image}" alt="${item.name}" class="cart-item-image">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.name} (${item.tier})</div>
                        <div class="cart-item-price">Количество: ${item.quantity}</div>
                    </div>
                </div>
            `;
        });
        cartItemsContainer.innerHTML = itemsHTML;
    }

    function openCart() {
        cartModal.style.display = 'block';
        updateCartDisplay();
    }

    function closeCart() {
        cartModal.style.display = 'none';
    }

    function clearCart() {
        if (cartItems.length === 0) return;
        if (confirm('Вы уверены, что хотите очистить корзину?')) {
            resetCatchTimer();
            cartItems = [];
            itemCount = 0;
            updateCounter();
            updateCartDisplay();
            const allSlots = document.querySelectorAll('.part-slot');
            allSlots.forEach(slot => updateActionButton(slot));
        }
    }

    function buyItems() {
        if (cartItems.length === 0) {
            alert('Корзина пуста!');
            return;
        }
        
        if (sessionTimeout) {
            clearTimeout(sessionTimeout);
            sessionTimeout = null;
        }

        let totalSessionTime;
        const alreadySold = spawnedParts.filter(p => p.statusElement.textContent.trim() === 'Нет в продаже').length;
        const totalSpawned = spawnedParts.length;
        const buyingNow = cartItems.length;
        const isSessionFinished = (alreadySold + buyingNow) >= totalSpawned;

        if (isSessionFinished) {
            totalSessionTime = stopCatchTimer();
        } else {
            if (isTimerRunning) {
                totalSessionTime = (Date.now() - catchStartTime) / 1000;
            } else {
                totalSessionTime = currentCatchTime;
            }
        }

        if (currentUser) {
            updateUserStatistics(totalSessionTime, cartItems.length);
        }

        cartItems.forEach(item => {
            const catchTime = item.catchTime || totalSessionTime;
            if (catchTime > 0) updatePartStats(item.name, catchTime);
        });
        
        cartItems.forEach(item => removePartFromAvailability(item.name, item.tier));
        
        alert(`Покупка оформлена! Поймано деталей: ${cartItems.length}, Время: ${totalSessionTime.toFixed(2)} сек`);
        
        cartItems = [];
        itemCount = 0;
        updateCounter();
        updateCartDisplay();
        closeCart();
        
        checkIfAllPartsPurchased();
    }

    function removePartFromAvailability(partName, tier) {
        const allSlots = document.querySelectorAll('.part-slot');
        allSlots.forEach(slot => {
            const slotName = slot.querySelector('.part-name').textContent.trim();
            const slotTier = slot.querySelector('.tier-label').textContent.trim();
            if (slotName === partName && slotTier === tier) {
                const statusElement = slot.querySelector('.part-status');
                statusElement.textContent = 'Нет в продаже';
                statusElement.style.color = '#ff6b6b';
                const actionContainer = slot.querySelector('.action-button-container');
                if (actionContainer) actionContainer.innerHTML = '';
                slot.classList.remove('available-for-catch');
                slot.classList.remove('in-cart-highlight');
                slot.removeAttribute('data-caught');
                spawnedParts = spawnedParts.filter(part => !(part.name === partName && part.tier === tier));
                updateActionButton(slot);
            }
        });
        checkIfAllPartsPurchased();
    }

    function startHold(direction) {
        if (holdInterval) clearInterval(holdInterval);
        if (direction === 'next') nextSlot(); else prevSlot();
        holdInterval = setInterval(() => { if (direction === 'next') nextSlot(); else prevSlot(); }, 200);
    }

    function stopHold() {
        if (holdInterval) { clearInterval(holdInterval); holdInterval = null; }
    }

    buttons.forEach(button => {
        button.addEventListener('click', () => {
            const activeCategory = document.querySelector('.category-btn.active').textContent;
            if (activeCategory !== 'Информация' && activeCategory !== 'Таблица лидеров') switchCategory(button, activeCategory);
        });
    });

    const navLeft = document.querySelector('.nav-arrow.left');
    const navRight = document.querySelector('.nav-arrow.right');
    if (navLeft) {
        navLeft.addEventListener('mousedown', () => startHold('prev'));
        navLeft.addEventListener('mouseup', () => stopHold());
        navLeft.addEventListener('mouseleave', () => stopHold());
    }
    if (navRight) {
        navRight.addEventListener('mousedown', () => startHold('next'));
        navRight.addEventListener('mouseup', () => stopHold());
        navRight.addEventListener('mouseleave', () => stopHold());
    }

    function scrollInfoList(direction) {
        const infoList = document.querySelector('.info-vertical-list');
        if (infoList && infoList.style.display === 'block') {
            const scrollAmount = 100;
            if (direction === 'down') infoList.scrollTop += scrollAmount;
            else if (direction === 'up') infoList.scrollTop -= scrollAmount;
        }
    }

    function moveCursorToCenter() {
        const frame = document.querySelector('.main-app-frame');
        const rect = frame.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        // Эмуляция движения мыши для визуального эффекта (если поддерживается)
        document.elementFromPoint(centerX, centerY).dispatchEvent(new MouseEvent('mousemove', { clientX: centerX, clientY: centerY, bubbles: true }));
        return { x: centerX, y: centerY };
    }

    function getUnavailableSportPlusParts() {
        const unavailableParts = [];
        const allSlots = document.querySelectorAll('.part-slot');
        allSlots.forEach(slot => {
            const tierLabel = slot.querySelector('.tier-label');
            const partStatus = slot.querySelector('.part-status');
            if (tierLabel && (tierLabel.textContent.trim() === 'sport+' || tierLabel.textContent.trim() === 'STAGE-3') && 
                partStatus && partStatus.textContent.trim() === "Нет в продаже") {
                unavailableParts.push({
                    element: slot,
                    name: slot.querySelector('.part-name').textContent.trim(),
                    image: slot.querySelector('.part-image').src,
                    tier: tierLabel.textContent.trim(),
                    statusElement: partStatus,
                    rowId: slot.closest('.parts-row').id
                });
            }
        });
        return unavailableParts;
    }

    function abortCatchingSession() {
        cartItems = [];
        itemCount = 0;
        updateCounter();
        updateCartDisplay();
        clearSpawnedParts(); 
        isCatchingMode = false;
        canSpawnNewParts = true;
        enterPressCount = 0;
        resetCatchTimer();
        if (sessionTimeout) {
            clearTimeout(sessionTimeout);
            sessionTimeout = null;
        }
        alert('Сессия прервана системой защиты');
    }

    function spawnRandomPartsInSections() {
        const unavailableParts = getUnavailableSportPlusParts();
        if (unavailableParts.length < 2) {
            console.log('Недостаточно недоступных деталей sport+ для спавна');
            alert('Недостаточно деталей для спавна!');
            return false;
        }
        
        enterPressCount = 0;

        if (sessionTimeout) clearTimeout(sessionTimeout);
        sessionTimeout = setTimeout(() => {
            if (isCatchingMode) {
                console.log("Таймаут слета: 20 секунд прошло. Сброс.");
                abortCatchingSession(); 
            }
        }, SESSION_TIMEOUT_MS);

        const shuffled = [...unavailableParts].sort(() => 0.5 - Math.random());
        const selectedParts = shuffled.slice(0, 2);
        selectedParts.forEach(part => {
            activatePart(part);
            spawnedParts.push(part);
        });
        isCatchingMode = true;
        startCatchTimer();
        return true;
    }

    function activatePart(part) {
        part.statusElement.textContent = 'В наличии';
        part.statusElement.style.color = '#4CAF50';
        part.element.classList.add('available-for-catch');
        part.element.setAttribute('data-caught', 'true');
        updateActionButton(part.element);
    }

    function handlePartClick(event) {
        if (event.target.classList.contains('slot-action-btn')) return;
        const slot = event.currentTarget;
        const slots = Array.from(currentRow.querySelectorAll('.part-slot'));
        const clickedIndex = slots.indexOf(slot);
        if (clickedIndex !== -1) {
            currentSlotIndex = clickedIndex;
            highlightSelectedSlot();
            handleSlotAction(slot);
        }
    }

    function clearSpawnedParts() {
        spawnedParts.forEach(part => {
            if (part.element.getAttribute('data-caught') === 'true') {
                part.statusElement.textContent = 'Нет в продаже';
                part.statusElement.style.color = '#ff6b6b';
                part.element.classList.remove('available-for-catch');
                part.element.classList.remove('in-cart-highlight');
                part.element.removeAttribute('data-caught');
                const actionContainer = part.element.querySelector('.action-button-container');
                if (actionContainer) actionContainer.innerHTML = '';
            }
        });
        spawnedParts = [];
    }

    function checkIfAllPartsPurchased() {
        if (spawnedParts.length === 0) {
            canSpawnNewParts = true;
            isCatchingMode = false;
            if (isTimerRunning) stopCatchTimer();
            if (sessionTimeout) {
                clearTimeout(sessionTimeout);
                sessionTimeout = null;
            }
            return;
        }
        
        const allPurchased = spawnedParts.every(part => part.statusElement.textContent.trim() === "Нет в продаже");
        if (allPurchased) {
            canSpawnNewParts = true;
            isCatchingMode = false;
            if (isTimerRunning) stopCatchTimer();
            clearSpawnedParts();
            if (sessionTimeout) {
                clearTimeout(sessionTimeout);
                sessionTimeout = null;
            }
        } else {
            canSpawnNewParts = false;
            if (!isTimerRunning && isCatchingMode) startCatchTimer();
        }
    }

    function activateCatchingMode() {
        const hasUnpurchasedParts = spawnedParts.length > 0;
        if (hasUnpurchasedParts) {
            alert('Сначала купите все текущие детали!');
            return;
        }
        resetCatchTimer();
        moveCursorToCenter();
        const engineButton = document.querySelector('.category-btn');
        if (engineButton) engineButton.click();
        const success = spawnRandomPartsInSections();
        if (success) canSpawnNewParts = false;
    }

    /* ЗАМЕНИТЬ ФУНКЦИЮ handleGlobalKeydown В script.js НА ЭТУ */

function handleGlobalKeydown(event) {
    // ==========================================
    // ФИКС БАГА: ПОЛНАЯ БЛОКИРОВКА ПРИ ВВОДЕ
    // ==========================================
    
    // 1. Проверяем, где стоит курсор (активный элемент)
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

    // 2. Проверяем, открыты ли модальные окна (Регистрация, Настройки, Корзина)
    const authModal = document.getElementById('auth-modal');
    const settingsModal = document.getElementById('settingsModal');
    const cartModal = document.getElementById('cartModal');
    
    // Функция проверки видимости (работает даже если display задан через CSS класс)
    const isVisible = (el) => el && (el.style.display === 'block' || getComputedStyle(el).display === 'block');
    
    const isAnyModalOpen = isVisible(authModal) || isVisible(settingsModal) || isVisible(cartModal);

    // ГЛАВНОЕ УСЛОВИЕ: Если мы печатаем ИЛИ открыто любое окно -> СТОП
    if (isTyping || isAnyModalOpen) {
        
        // Удобство: Нажатие Enter в окне входа нажимает кнопку "Войти"
        if (isVisible(authModal) && event.key === 'Enter') {
            event.preventDefault();
            // Проверка, чтобы не вызывать ошибку, если функции нет
            if (typeof window.handleAuthAction === 'function') {
                window.handleAuthAction(); 
            }
        }
        
        // ПРЕРЫВАЕМ ФУНКЦИЮ. Код игры ниже НЕ выполнится.
        return; 
    }
    // ==========================================

    // ДАЛЬШЕ ИДЕТ ОБЫЧНЫЙ КОД ИГРЫ
    trackUserActivity();

    // Проверка клавиши ловли (h или другая)
    if (event.key.toLowerCase() === userSettings.catchKey.toLowerCase()) {
        event.preventDefault();
        activateCatchingMode();
        return;
    }

    // Навигация
    const activeCategory = document.querySelector('.category-btn.active');
    if (activeCategory && activeCategory.textContent === 'Информация') {
        switch(event.key) {
            case 'ArrowDown': case 'PageDown': event.preventDefault(); scrollInfoList('down'); break;
            case 'ArrowUp': case 'PageUp': event.preventDefault(); scrollInfoList('up'); break;
            case 'Home': event.preventDefault(); const l1 = document.querySelector('.info-vertical-list'); if (l1) l1.scrollTop = 0; break;
            case 'End': event.preventDefault(); const l2 = document.querySelector('.info-vertical-list'); if (l2) l2.scrollTop = l2.scrollHeight; break;
        }
    } else {
        switch(event.key) {
            case 'ArrowLeft': event.preventDefault(); prevSlot(); break;
            case 'ArrowRight': event.preventDefault(); nextSlot(); break;
            case 'End': event.preventDefault(); goToLastSlot(); break;
            case 'Home': event.preventDefault(); goToFirstSlot(); break;
            case 'Enter':
                event.preventDefault();
                if (isCatchingMode) {
                    enterPressCount++;
                    if (enterPressCount >= MAX_ENTER_PRESSES) {
                        console.warn('AHK DETECTED: Limit reached. Resetting session.');
                        abortCatchingSession(); 
                        return; 
                    }
                }
                const selectedSlot = currentRow.querySelector('.part-slot.selected');
                if (selectedSlot) handleSlotAction(selectedSlot);
                break;
        }
    }
}
    const enterButton = document.querySelector('.enter-button');
    if (enterButton) {
        enterButton.addEventListener('click', () => {
            trackUserActivity();
            if (isCatchingMode) {
                enterPressCount++;
                if (enterPressCount >= MAX_ENTER_PRESSES) {
                    abortCatchingSession();
                    return;
                }
            }
            const selectedSlot = currentRow.querySelector('.part-slot.selected');
            if (selectedSlot) handleSlotAction(selectedSlot);
        });
    }

    const counterButton = document.querySelector('.counter-button');
    if (counterButton) counterButton.addEventListener('click', () => openCart());
    if (closeCartBtn) closeCartBtn.addEventListener('click', closeCart);
    if (clearCartBtn) clearCartBtn.addEventListener('click', clearCart);
    if (buyBtn) buyBtn.addEventListener('click', buyItems);

    window.addEventListener('click', (event) => { if (event.target === cartModal) closeCart(); });

    // Инициализация слотов
    const allSlots = document.querySelectorAll('.part-slot');
    allSlots.forEach(slot => {
        slot.addEventListener('click', handlePartClick);
    });

    highlightSelectedSlot();
    updateCounter();
    loadSettings();
    initStats();
    initLeaderboardTabs();
    addRegisterButtonToLeaderboard();

    const infoList = document.querySelector('.info-vertical-list');
    if (infoList) {
        infoList.addEventListener('wheel', (event) => {
            event.preventDefault();
            infoList.scrollTop += event.deltaY;
        });
    }

    function scaleApp() {
        const app = document.querySelector('.main-app-frame');
        if (!app) return;
        const baseWidth = 1440;
        const baseHeight = 900;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const scaleX = windowWidth / baseWidth;
        const scaleY = windowHeight / baseHeight;
        app.style.transform = `scaleX(${scaleX}) scaleY(${scaleY})`;
    }

    scaleApp();
    window.addEventListener('resize', scaleApp);

});
