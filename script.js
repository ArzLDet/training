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
            loadUserPartStats();  // Детальная статистика по запчастям
            
            // --- ИСПРАВЛЕНИЕ: Удалена строка initInviteListener(), которая ломала код ---
            // initInviteListener(); 
            
            updateUserInterface(); // Теперь эта функция выполнится успешно
            console.log("Пользователь авторизован:", user.uid);
            closeAuthModal();
        } else {
            currentUser = null;
            console.log("Пользователь не авторизован");
            
            // СБРОС ПРИ ВЫХОДЕ
            userStats = {
                bestTotalTime: 0,
                averageTotalTime: 0,
                totalPartsCaught: 0,
                sessionsCompleted: 0
            };
            initStats(); 
            
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
        // При выходе выходим из комнаты если были
        if(currentRoomId) leaveRoom();

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
    // СИСТЕМА ТАБЛИЦ ЛИДЕРОВ (ОБЫЧНАЯ)
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
        
        // ПОЛУЧАЕМ ИМЯ И СЕРВЕР ИЗ ПРОФИЛЯ
        const uSnap = await db.ref(`users/${currentUser.uid}`).once('value');
        const uData = uSnap.val();
        const username = uData.username;
        const server = uData.server || null; // Читаем сервер

        if (!username) return;
        
        // 1. Считаем среднее
        const avgBestPartsTime = calculateAverageOfAllBests();

        // 2. Запись в "Лучшее время"
        if (avgBestPartsTime > 0) {
            await db.ref('leaderboard_best_time').child(currentUser.uid).set({
                username: username,
                server: server, // Пишем сервер
                bestTotalTime: avgBestPartsTime, 
                timestamp: Date.now()
            });
        }

        // 3. Запись в "Среднее время"
        if (userStats.averageTotalTime > 0) {
            await db.ref('leaderboard_avg_time').child(currentUser.uid).set({
                username: username,
                server: server, // Пишем сервер
                averageTotalTime: userStats.averageTotalTime,
                timestamp: Date.now()
            });
        }

        // 4. Запись в "Количество деталей"
        if (userStats.totalPartsCaught > 0) {
            await db.ref('leaderboard_parts_count').child(currentUser.uid).set({
                username: username,
                server: server, // Пишем сервер
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
            const snapshot = await db.ref('leaderboard_best_time').orderByChild('bestTotalTime').limitToFirst(100).once('value');
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
            const snapshot = await db.ref('leaderboard_avg_time').orderByChild('averageTotalTime').limitToFirst(100).once('value');
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
            const snapshot = await db.ref('leaderboard_parts_count').orderByChild('totalPartsCaught').limitToLast(100).once('value');
            displayLeaderboard(snapshot, container, 'totalPartsCaught', 'шт', false);
        } catch (error) {
            console.error(error);
            container.innerHTML = '<div class="leaderboard-empty"><div class="empty-message">Ошибка загрузки</div></div>';
        }
    }

    // Глобальная переменная для хранения истории сессии
    window.sessionStartPositions = window.sessionStartPositions || {};

    function displayLeaderboard(snapshot, container, field, unit, ascending = true) {
        // 1. ЗАГРУЗКА ИСТОРИИ (Стрелочки)
        if (!window.sessionStartPositions[field]) {
            try {
                const storageKey = 'lb_pos_' + field;
                const savedData = localStorage.getItem(storageKey);
                window.sessionStartPositions[field] = savedData ? JSON.parse(savedData) : {};
            } catch (e) {
                window.sessionStartPositions[field] = {};
            }
        }

        const scores = [];
        snapshot.forEach((childSnapshot) => {
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
        const top15Scores = scores.slice(0, 100);

        if (top15Scores.length === 0) {
            container.innerHTML = '<div class="leaderboard-empty"><div class="empty-message">Рекордов пока нет</div></div>';
            return;
        }

        // 4. ПОДГОТОВКА ДАННЫХ
        const lastPositions = window.sessionStartPositions[field]; 
        let newPositionsForStorage = {}; 

        let leaderboardHTML = '';
        
        top15Scores.forEach((score, index) => {
            const currentRank = index + 1;
            const uid = score.uid;
            
            newPositionsForStorage[uid] = currentRank;

            // --- ЛОГИКА СТРЕЛОК ---
            let changeHtml = '<span class="position-change" style="opacity:0.3">-</span>';
            
            if (lastPositions && lastPositions[uid]) {
                const oldRank = lastPositions[uid];
                const diff = oldRank - currentRank; 

                if (diff > 0) {
                    changeHtml = `<span class="position-change positive">↑ ${diff}</span>`;
                } else if (diff < 0) {
                    changeHtml = `<span class="position-change negative">↓ ${Math.abs(diff)}</span>`;
                } else {
                    changeHtml = `<span class="position-change" style="opacity:0.3">=</span>`;
                }
            } else {
                changeHtml = `<span class="position-change new-entry">NEW</span>`;
            }

            // --- ОТОБРАЖЕНИЕ НИКА И СЕРВЕРА ---
            let displayName = score.username || 'Неизвестный';
            if (score.server) {
                displayName = `[${score.server}] ${displayName}`;
            }

            const isCurrentUser = currentUser && uid === currentUser.uid;

            // ОПРЕДЕЛЯЕМ СТИЛЬ ДЛЯ ТОП-3
            let rowStyle = '';
            let nameStyle = '';
            let rankClass = '';
            
            if (index === 0) {
                // 1 место - золото
                rowStyle = 'background: linear-gradient(90deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 215, 0, 0.05) 100%); border-left: 3px solid #FFD700;';
                nameStyle = 'color: #FFD700; font-weight: 700; text-shadow: 0 0 8px rgba(255, 215, 0, 0.5);';
                rankClass = 'rank-gold';
            } else if (index === 1) {
                // 2 место - серебро
                rowStyle = 'background: linear-gradient(90deg, rgba(192, 192, 192, 0.15) 0%, rgba(192, 192, 192, 0.05) 100%); border-left: 3px solid #C0C0C0;';
                nameStyle = 'color: #C0C0C0; font-weight: 700; text-shadow: 0 0 8px rgba(192, 192, 192, 0.5);';
                rankClass = 'rank-silver';
            } else if (index === 2) {
                // 3 место - бронза
                rowStyle = 'background: linear-gradient(90deg, rgba(205, 127, 50, 0.15) 0%, rgba(205, 127, 50, 0.05) 100%); border-left: 3px solid #CD7F32;';
                nameStyle = 'color: #CD7F32; font-weight: 700; text-shadow: 0 0 8px rgba(205, 127, 50, 0.5);';
                rankClass = 'rank-bronze';
            } else if (isCurrentUser) {
                // Текущий пользователь НЕ в топ-3 - синий
                rowStyle = 'background: rgba(42, 171, 238, 0.1); border-left: 3px solid #2AABEE;';
                nameStyle = 'color: #2AABEE; font-weight: 600;';
                rankClass = 'current-user';
            } else {
                // Остальные пользователи
                nameStyle = 'color: white; font-weight: 600;';
            }

            const styleAttr = rowStyle ? `style="${rowStyle}"` : '';
            const nameStyleAttr = nameStyle ? `style="${nameStyle}"` : '';

            let valueDisplay;
            if (field === 'totalPartsCaught') {
                valueDisplay = score[field];
            } else {
                valueDisplay = (Number(score[field]) || 0).toFixed(3);
            }

            const dateStr = score.timestamp ? new Date(score.timestamp).toLocaleDateString() : '-';

            // --- ИЗМЕНЕНИЕ: Добавляем класс для ранга и открытия статистики ---
            leaderboardHTML += `
                <div class="leaderboard-row ${rankClass}" ${styleAttr} onclick="openPlayerStatsModal('${uid}', '${displayName.replace(/'/g, "\\'")}')">
                    <div style="font-weight:bold; color:#666;">${currentRank}</div>
                    <div class="leaderboard-username" ${nameStyleAttr}>${displayName}</div>
                    <div style="font-family:monospace;">${valueDisplay}</div>
                    <div style="color:#888; font-size:12px;">${unit}</div>
                    <div style="color:#666; font-size:11px;">${dateStr}</div>
                    <div>${changeHtml}</div>
                </div>
            `;
        });

        // 5. СОХРАНЕНИЕ
        try {
            const storageKey = 'lb_pos_' + field; 
            localStorage.setItem(storageKey, JSON.stringify(newPositionsForStorage));
        } catch (e) { console.error(e); }

        container.innerHTML = leaderboardHTML;
    }

function updateUserInterface() {
        const leaderboardRow = document.getElementById('row-leaderboard');
        if (!leaderboardRow) return;

        // 1. Сначала принудительно удаляем ВСЕ старые кнопки и панели
        const oldRegBtn = leaderboardRow.querySelector('.leaderboard-register-btn');
        const oldUserPanel = leaderboardRow.querySelector('.leaderboard-user-panel');
        
        if (oldRegBtn) oldRegBtn.remove();
        if (oldUserPanel) oldUserPanel.remove();

        // 2. Теперь смотрим, вошел юзер или нет и рисуем нужное
        if (currentUser) {
            createUserPanel(); // Рисуем панель с ником и кнопкой Выйти
        } else {
            addRegisterButtonToLeaderboard(); // Рисуем кнопку Регистрации
        }
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

    function addRegisterButtonToLeaderboard() {
        const leaderboardRow = document.getElementById('row-leaderboard');
        if (!leaderboardRow) return;

        const existingBtn = leaderboardRow.querySelector('.leaderboard-register-btn');
        if (existingBtn) existingBtn.remove();

        if (!currentUser) {
            const registerBtn = document.createElement('button');
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
            tab.addEventListener('click', (e) => {
                // Игнорируем табы внутри модального окна соревнований, они обрабатываются отдельно
                if(tab.closest('#compModal')) return;

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

        // ЭТА СТАТИСТИКА ТОЛЬКО ДЛЯ ОБЫЧНОГО РЕЖИМА
        // Соревновательная статистика пишется отдельно
        if(compGameActive) return;

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
        
        const allContentFrames = document.querySelectorAll('.settings-content-framed');
        const innerSettingsFrames = document.querySelectorAll('.info-frame.settings-frame');

        const keyDisplay = document.getElementById('currentKeyDisplay');
        if (keyDisplay) {
            if (userSettings.catchKey === 'RMB') {
                keyDisplay.textContent = 'ПКМ';
            } else {
                keyDisplay.textContent = userSettings.catchKey.toUpperCase();
            }
        }

        // 1. Сначала сбрасываем стили фона самого приложения
        if (appFrame) {
            appFrame.classList.remove('custom-bg-darkened');
            appFrame.style.backgroundImage = '';
            appFrame.style.backgroundColor = '';
        }
        
        // 2. ПРИНУДИТЕЛЬНО СТАВИМ ТЕМНЫЙ СТИЛЬ ДЛЯ ОКОН (Настройки и Вход)
        allContentFrames.forEach(frame => {
            frame.classList.remove('adaptive-glass');
            frame.classList.add('adaptive-black'); // Всегда темный
        });
        
        innerSettingsFrames.forEach(frame => {
            frame.classList.remove('adaptive-glass');
            frame.classList.add('adaptive-black'); // Всегда темный
        });

        // 3. Применяем фон к главному экрану
        if (userSettings.backgroundMode === 'black') {
            if (appFrame) {
                appFrame.style.backgroundImage = 'none';
                appFrame.style.backgroundColor = '#111';
            }
        } else if (userSettings.backgroundMode === 'default') {
            if (appFrame) appFrame.style.backgroundImage = 'url(background.png)';
        } else if (userSettings.backgroundMode === 'custom' && userSettings.customBgData) {
            if (appFrame) {
                appFrame.style.backgroundImage = `url(${userSettings.customBgData})`;
                appFrame.classList.add('custom-bg-darkened');
            }
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
            loadProfile(); 
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
        if (event.target === settingsModal) closeSettings;
        if (event.target === authModal) closeAuthModal();
        if (event.target === document.getElementById('compModal')) closeCompModal();
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
    // ОСНОВНАЯ ЛОГИКА ИГРЫ
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
        partStats = getDefaultStats();
        updateInfoDisplay();
    }

    // Загрузка статистики деталей конкретного игрока из Firebase
    async function loadUserPartStats() {
        if (!currentUser) return;
        try {
            const snapshot = await db.ref('users').child(currentUser.uid).child('part_stats').once('value');
            if (snapshot.exists()) {
                partStats = snapshot.val();
            } else {
                partStats = getDefaultStats();
            }
            updateInfoDisplay(); 
        } catch (error) {
            console.error("Ошибка загрузки статистики деталей:", error);
        }
    }

    // Сохранение статистики деталей в Firebase
    async function saveUserPartStats() {
        if (!currentUser) return;
        // В режиме соревнований статистику деталей НЕ обновляем
        if(compGameActive) return;
        try {
            await db.ref('users').child(currentUser.uid).child('part_stats').set(partStats);
        } catch (error) {
            console.error("Ошибка сохранения статистики деталей:", error);
        }
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
        if(compGameActive) return; // Не обновляем стату в соревновании

        if (!partStats[partName]) {
            partStats[partName] = { fastestTime: 0, averageTime: 0, totalCount: 0, lastTime: 0 };
        }
        
        const stats = partStats[partName];
        const previousAverage = stats.averageTime;
        
        let isNewRecord = false;

        if (stats.fastestTime === 0 || catchTime < stats.fastestTime) {
            stats.fastestTime = catchTime;
            isNewRecord = true; 
        }

        stats.totalCount++;
        stats.lastTime = previousAverage; 
        stats.averageTime = ((stats.averageTime * (stats.totalCount - 1)) + catchTime) / stats.totalCount;
        
        if (currentUser) {
            saveUserPartStats(); 
            if (isNewRecord) {
                updateLeaderboards();
            }
        }
        
        updateInfoDisplay();
    }

    function startCatchTimer() {
        if (!isTimerRunning) {
            catchStartTime = Date.now();
            isTimerRunning = true;
            individualCatchTimes = {}; 
        }
    }

    function stopCatchTimer() {
        if (isTimerRunning && catchStartTime > 0) {
            currentCatchTime = (Date.now() - catchStartTime) / 1000;
            isTimerRunning = false;
            catchStartTime = 0;
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
        
        // --- ИЗМЕНЕННАЯ ЛОГИКА УВЕДОМЛЕНИЙ ДЛЯ СОРЕВНОВАНИЙ ---
        if(!compGameActive) {
            alert(`Покупка оформлена! Поймано деталей: ${cartItems.length}, Время: ${totalSessionTime.toFixed(2)} сек`);
        } else {
            // 1. Показываем красивое уведомление (нужен HTML/CSS из предыдущего ответа)
            const notif = document.getElementById('compBuyNotification');
            const details = document.getElementById('compBuyDetails');
            if(notif && details) {
                details.textContent = `${cartItems.length} дет. за ${totalSessionTime.toFixed(2)} сек`;
                notif.classList.add('show');
                setTimeout(() => notif.classList.remove('show'), 1500);
            }

            // 2. Завершаем раунд локально и отправляем на сервер
            finishLocalRound(totalSessionTime, cartItems.length);
        }
        
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

// Изменяем функцию, добавляя параметр silent (тихий режим)
function abortCatchingSession(silent = false) {
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
    
    // Если НЕ соревнование и НЕ тихий режим — показываем уведомление
    if (!compGameActive && !silent) {
        alert('Сессия прервана системой защиты');
    }
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
        if (compGameActive) return; // В соревновании ловля автоматическая

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

    function handleGlobalKeydown(event) {
        
        const activeEl = document.activeElement;
        const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

        const authModal = document.getElementById('auth-modal');
        const settingsModal = document.getElementById('settingsModal');
        const cartModal = document.getElementById('cartModal');
        const playerStatsModal = document.getElementById('player-stats-modal');
        const compModal = document.getElementById('compModal'); // + Comp Modal
        
        const isVisible = (el) => el && (el.style.display === 'block' || getComputedStyle(el).display === 'block');
        
        const isAnyModalOpen = isVisible(authModal) || isVisible(settingsModal) || isVisible(cartModal) || isVisible(playerStatsModal) || isVisible(compModal);

        if (isTyping || isAnyModalOpen) {
            if (isVisible(authModal) && event.key === 'Enter') {
                event.preventDefault();
                if (typeof window.handleAuthAction === 'function') {
                    window.handleAuthAction(); 
                }
            }
            return; 
        }

        trackUserActivity();

        if (event.key.toLowerCase() === userSettings.catchKey.toLowerCase()) {
            event.preventDefault();
            activateCatchingMode();
            return;
        }

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

    // ==========================================
    // ЛОГИКА СМЕНЫ НИКА (ПРОФИЛЬ)
    // ==========================================

    async function loadProfile() {
        const profileBlock = document.getElementById('profile-settings-block');
        const nickInput = document.getElementById('profile-nick');
        const serverInput = document.getElementById('profile-server');
        const statusDiv = document.getElementById('profile-status');
        
        if (!currentUser) {
            if(profileBlock) profileBlock.style.display = 'none';
            return;
        }
        
        if(profileBlock) profileBlock.style.display = 'flex'; 
        
        if(statusDiv) {
            statusDiv.textContent = ''; 
            statusDiv.style.display = 'none'; 
        }

        try {
            const snapshot = await db.ref('users').child(currentUser.uid).once('value');
            const data = snapshot.val() || {};
            
            if (nickInput) nickInput.value = data.username || '';
            if (serverInput) serverInput.value = data.server || ''; 
        } catch (e) {
            console.error("Ошибка загрузки профиля", e);
        }
    }

    async function saveProfile() {
        if (!currentUser) return;

        const nickInput = document.getElementById('profile-nick');
        const serverInput = document.getElementById('profile-server');
        const statusDiv = document.getElementById('profile-status');
        
        const newName = nickInput.value.trim();
        let newServer = serverInput.value.trim(); 

        if (statusDiv) statusDiv.style.display = 'block';

        statusDiv.style.color = '#888';
        statusDiv.textContent = 'Проверка...';

        if (newName.length < 3) {
            statusDiv.style.color = '#ff453a';
            statusDiv.textContent = 'Ник: минимум 3 символа!';
            return;
        }

        if (newServer) {
            newServer = parseInt(newServer);
            if (isNaN(newServer) || newServer < 1 || newServer > 30) {
                statusDiv.style.color = '#ff453a';
                statusDiv.textContent = 'Сервер должен быть от 1 до 30!';
                return;
            }
        } else {
            newServer = null; 
        }

        try {
            const userSnap = await db.ref('users').child(currentUser.uid).once('value');
            const userData = userSnap.val() || {};
            const oldName = userData.username;

            if (oldName !== newName) {
                const lookupSnap = await db.ref('username_lookup').child(newName).once('value');
                if (lookupSnap.exists()) {
                    statusDiv.style.color = '#ff453a';
                    statusDiv.textContent = 'Этот ник уже занят!';
                    return;
                }
            }

            const updates = {};
            
            if (oldName !== newName) {
                if (oldName) updates[`username_lookup/${oldName}`] = null;
                updates[`username_lookup/${newName}`] = currentUser.uid;
                updates[`users/${currentUser.uid}/username`] = newName;
            }

            updates[`users/${currentUser.uid}/server`] = newServer;

            await db.ref().update(updates);

            statusDiv.style.color = '#32d74b'; 
            statusDiv.textContent = 'Сохранено!';
            
            updateUserPanel();
            
            updateLeaderboards();

        } catch (error) {
            console.error(error);
            statusDiv.style.color = '#ff453a';
            statusDiv.textContent = 'Ошибка: ' + error.message;
        }
    }

    window.loadProfile = loadProfile;
    window.saveProfile = saveProfile;

    // ==========================================
    // СИСТЕМА ПРОСМОТРА СТАТИСТИКИ
    // ==========================================

    const PARTS_CONFIG = {
        'Коленвал': 'images/kolenval-sport.png',
        'Распредвал': 'images/raspredval-sport.png',
        'Турбина': 'images/turbina-sport.png',
        'Нагнетатель': 'images/nagnetatel-t2.png',
        'Прошивка': 'images/proshivka-sport.png',
        'Сцепление': 'images/sceplenie-sport.png',
        'КПП': 'images/kpp-sport.png',
        'Дифференциал': 'images/differencial-sport.png',
        'Подвеска': 'images/podveska-sport.png',
        'Тормоза': 'images/tormoza-sport.png'
    };

// Обязательно убедитесь, что PARTS_CONFIG доступен глобально!
// Если он внутри document.addEventListener, замените const PARTS_CONFIG на window.PARTS_CONFIG

window.openPlayerStatsModal = async function(uid, username) {
    const modal = document.getElementById('playerStatsModal');
    const grid = document.getElementById('statsGrid');
    const nameHeader = document.getElementById('statsPlayerName');
    
    if (!modal || !grid) return;

    nameHeader.textContent = username;
    grid.innerHTML = '<div style="color:#888; grid-column: 1/-1; text-align:center; padding: 40px;">Загрузка данных...</div>';
    modal.style.display = 'flex';

    const config = window.PARTS_CONFIG || (typeof PARTS_CONFIG !== 'undefined' ? PARTS_CONFIG : null);
    if (!config) {
        console.error("Ошибка: PARTS_CONFIG не найден");
        grid.innerHTML = '<div style="color:#ff453a; grid-column: 1/-1; text-align:center;">Ошибка конфигурации</div>';
        return;
    }

    try {
        const snapshot = await db.ref(`users/${uid}/part_stats`).once('value');
        const stats = snapshot.val() || {};
        
        let gridHTML = '';
        
        for (const partName in config) {
            const data = stats[partName] || { fastestTime: 0, averageTime: 0, totalCount: 0 };
            
            // ИСПРАВЛЕНИЕ: Правильно читаем количество деталей
            const count = Number(data.totalCount || 0);
            const fastest = Number(data.fastestTime || 0);
            const average = Number(data.averageTime || 0);
            
            const icon = config[partName];
            
            gridHTML += `
                <div class="stat-card">
                    <img src="${icon}" alt="${partName}" onerror="this.src='images/default.png'">
                    <div class="stat-card-name">${partName}</div>
                    
                    <div class="stat-card-row">
                        <span class="stat-label">Рекорд:</span>
                        <span class="stat-value fast">${fastest > 0 ? fastest.toFixed(3) + 'с' : '—'}</span>
                    </div>
                    
                    <div class="stat-card-row">
                        <span class="stat-label">Среднее:</span>
                        <span class="stat-value">${average > 0 ? average.toFixed(3) + 'с' : '—'}</span>
                    </div>
                    
                    <div class="stat-card-row">
                        <span class="stat-label">Словлено:</span>
                        <span class="stat-value" style="color:#2AABEE; font-weight:bold;">${count} шт.</span>
                    </div>
                </div>
            `;
        }
        grid.innerHTML = gridHTML;
    } catch (e) {
        console.error("Ошибка БД:", e);
        grid.innerHTML = '<div style="color:#ff453a; grid-column: 1/-1; text-align:center;">Ошибка подключения к базе</div>';
    }
};

// Исправленная функция закрытия (ID приведен к одному виду)
window.closePlayerStatsModal = function() {
    const modal = document.getElementById('playerStatsModal');
    if (modal) modal.style.display = 'none';
};

// Закрытие по клику на фон
window.addEventListener('click', (event) => {
    const modal = document.getElementById('playerStatsModal');
    if (event.target === modal) closePlayerStatsModal();
});

// НОВОЕ: Закрытие по клавише Esc
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closePlayerStatsModal();
    }
});

    function showFullscreenNotification() {
        const notification = document.getElementById('fullscreenNotification');
        if (notification) {
            notification.classList.add('show');
            setTimeout(() => {
                notification.classList.remove('show');
            }, 5000);
        }
    }
    
    setTimeout(showFullscreenNotification, 1000);

// ==========================================
    // СОРЕВНОВАТЕЛЬНЫЙ РЕЖИМ (ИСПРАВЛЕННЫЙ)
    // ==========================================

    let currentRoomId = null;
    let compGameActive = false;
    let compRound = 0;
    let isMyReady = false; 

    // ==========================================
// AFK СИСТЕМА ДЛЯ КОМНАТ СОРЕВНОВАНИЙ (ДОБАВИТЬ ЗДЕСЬ)
// ==========================================

let hostAFKCheckInterval = null;
const HOST_AFK_TIMEOUT_MS = 5 * 60 * 1000; // 5 минут

    // --- UI Функции ---

    window.openCompModal = function() {
        const m = document.getElementById('compModal');
        if(m) {
            m.style.display = 'block';
            switchCompTab('rooms');
        }
    };
    
window.closeCompModal = function() {
    const m = document.getElementById('compModal');
    if(m) m.style.display = 'none';
    closeCreateOverlay();
    
    // Если пользователь вышел из комнаты или не в комнате, останавливаем AFK проверку (ДОБАВИТЬ ЭТО)
    if (!currentRoomId) {
        stopHostAFKCheck();
    }
};

    window.switchCompTab = function(tabName) {
        document.getElementById('comp-tab-rooms').style.display = tabName === 'rooms' ? 'flex' : 'none'; 
        document.getElementById('comp-tab-top').style.display = tabName === 'top' ? 'block' : 'none';
        
        const tabs = document.querySelectorAll('.leaderboard-tabs .leaderboard-tab'); 
        tabs.forEach(t => t.classList.remove('active'));
        
        if(tabName === 'rooms') {
            tabs[2].classList.add('active'); 
            if (currentRoomId) {
                document.getElementById('currentRoomPanel').style.display = 'flex';
                document.getElementById('roomsBrowserPanel').style.display = 'none';
            } else {
                document.getElementById('currentRoomPanel').style.display = 'none';
                document.getElementById('roomsBrowserPanel').style.display = 'flex';
                subscribeToRooms();
            }
        }
        if(tabName === 'top') {
            tabs[3].classList.add('active');
            loadCompLeaderboard();
        }
    };

    // --- Логика Создания и Входа ---

    window.openCreateOverlay = function() {
        if(!currentUser) { alert('Войдите в аккаунт!'); return; }
        if(currentRoomId) { alert('Вы уже в комнате'); return; }
        document.getElementById('createRoomOverlay').style.display = 'flex';
    }

    window.closeCreateOverlay = function() {
        const overlay = document.getElementById('createRoomOverlay');
        if(overlay) overlay.style.display = 'none';
    }

window.confirmCreateRoom = async function() {
    const size = document.getElementById('newRoomSize').value;
    const privacy = document.getElementById('newRoomPrivacy').value; 
    
    // Считываем новые настройки
    let rounds = parseInt(document.getElementById('newRoomRounds').value);
    let delay = parseInt(document.getElementById('newRoomDelay').value);

    // Ставим дефолтные значения, если поля пустые
    if(isNaN(rounds) || rounds < 1) rounds = 10;
    if(isNaN(delay) || delay < 1) delay = 3;
    
    const roomRef = db.ref('rooms').push();
    currentRoomId = roomRef.key;
    
    const username = await getUsername(currentUser.uid);
    
    await roomRef.set({
        host: currentUser.uid,
        hostName: username,
        status: 'waiting',
        currentRound: 0,
        activeParts: null, 
        settings: {
            maxPlayers: parseInt(size),
            isPrivate: privacy === 'private',
            totalRounds: rounds,        
            roundDelay: delay * 1000    
        },
        players: {
            [currentUser.uid]: { name: username, ready: false, score: 0, totalTime: 0 } 
        },
        created: firebase.database.ServerValue.TIMESTAMP,
        lastHostActivity: Date.now() // ДОБАВИТЬ ЭТУ СТРОКУ
    });

    closeCreateOverlay();
    document.getElementById('roomsBrowserPanel').style.display = 'none';
    document.getElementById('currentRoomPanel').style.display = 'flex';
    
    subscribeToMyRoom();
    
    // === ЗАПУСКАЕМ AFK ПРОВЕРКУ (ДОБАВИТЬ ЭТО) ===
    startHostAFKCheck();


    // === НОВАЯ ЛОГИКА: Таймер на 5 минут (300000 мс) ===
    setTimeout(async () => {
        // Проверяем, нахожусь ли я все еще в этой комнате и являюсь ли хостом
        if (currentUser && currentRoomId === roomRef.key) {
            const snap = await roomRef.once('value');
            const data = snap.val();
            
            // Если комната существует и статус все еще 'waiting' (игра не началась)
            if (data && data.status === 'waiting' && data.host === currentUser.uid) {
                // Удаляем комнату и выходим
                alert("Комната закрыта из-за отсутствия активности (5 минут)");
                leaveRoom(); 
            }
        }
    }, 300000); // 5 минут
};

window.leaveRoom = async function() {
    if(!currentRoomId || !currentUser) return;
    
    // Останавливаем AFK проверку (ДОБАВИТЬ ЭТО)
    stopHostAFKCheck();
    
    await db.ref(`rooms/${currentRoomId}/players/${currentUser.uid}`).remove();
    
    const snap = await db.ref(`rooms/${currentRoomId}`).once('value');
    if(snap.exists()) {
        const val = snap.val();
        if(!val.players || Object.keys(val.players).length === 0) {
            await db.ref(`rooms/${currentRoomId}`).remove();
        } else if(val.host === currentUser.uid) {
            await db.ref(`rooms/${currentRoomId}`).remove();
        }
    }

    resetCompState();
    
    document.getElementById('currentRoomPanel').style.display = 'none';
    document.getElementById('roomsBrowserPanel').style.display = 'flex';
    
    subscribeToRooms(); 
};

function resetCompState() {
    currentRoomId = null;
    isMyReady = false;
    compGameActive = false;
    compRound = 0;
    unsubscribeFromMyRoom();
    
    // Останавливаем AFK проверку
    stopHostAFKCheck();
    
    clearSpawnedParts();
    abortCatchingSession(true);
}

// ==========================================
// ФУНКЦИИ AFK ПРОВЕРКИ (ДОБАВИТЬ ЗДЕСЬ)
// ==========================================

// Функция запуска AFK проверки для хоста
function startHostAFKCheck() {
    // Очищаем предыдущий интервал
    if (hostAFKCheckInterval) {
        clearInterval(hostAFKCheckInterval);
        hostAFKCheckInterval = null;
    }
    
    // Запускаем проверку каждую минуту
    hostAFKCheckInterval = setInterval(async () => {
        if (!currentRoomId || !currentUser) return;
        
        try {
            const snap = await db.ref(`rooms/${currentRoomId}`).once('value');
            const roomData = snap.val();
            
            // Если комнаты нет или она уже не в режиме ожидания, останавливаем проверку
            if (!roomData || roomData.status !== 'waiting') {
                stopHostAFKCheck();
                return;
            }
            
            // Проверяем, является ли текущий пользователь хостом
            if (roomData.host !== currentUser.uid) {
                stopHostAFKCheck();
                return;
            }
            
            // Проверяем время последнего действия хоста
            const now = Date.now();
            const lastHostActivity = roomData.lastHostActivity || roomData.created;
            const inactiveTime = now - lastHostActivity;
            
            // Если хост неактивен более 5 минут
            if (inactiveTime > HOST_AFK_TIMEOUT_MS) {
                console.log("Хост AFK более 5 минут, удаляем комнату");
                
                // Удаляем комнату
                await db.ref(`rooms/${currentRoomId}`).remove();
                
                // Показываем уведомление
                alert("Комната удалена из-за неактивности владельца (5 минут AFK)");
                
                // Выходим из комнаты
                leaveRoom();
            }
        } catch (error) {
            console.error("Ошибка проверки AFK хоста:", error);
        }
    }, 60000); // Проверяем каждую минуту
}

// Функция остановки AFK проверки
function stopHostAFKCheck() {
    if (hostAFKCheckInterval) {
        clearInterval(hostAFKCheckInterval);
        hostAFKCheckInterval = null;
    }
}

// Функция обновления активности хоста
async function updateHostActivity() {
    if (!currentRoomId || !currentUser) return;
    
    try {
        const snap = await db.ref(`rooms/${currentRoomId}`).once('value');
        const roomData = snap.val();
        
        // Проверяем, является ли текущий пользователь хостом и комната в режиме ожидания
        if (roomData && roomData.host === currentUser.uid && roomData.status === 'waiting') {
            await db.ref(`rooms/${currentRoomId}`).update({
                lastHostActivity: Date.now()
            });
        }
    } catch (error) {
        console.error("Ошибка обновления активности хоста:", error);
    }
}

    window.joinRoom = async function(roomId) {
        if(!currentUser) { showAuthModal(); return; }
        if(currentRoomId) { alert('Сначала выйдите из текущей комнаты'); return; }

        const roomRef = db.ref(`rooms/${roomId}`);
        const snap = await roomRef.once('value');
        if(!snap.exists()) { alert('Комната удалена'); return; }
        
        const data = snap.val();
        if(data.status !== 'waiting') { alert('Игра уже идет'); return; }
        
        const currentCount = Object.keys(data.players || {}).length;
        const maxPlayers = data.settings ? data.settings.maxPlayers : 3;

        if(currentCount >= maxPlayers) { alert('Комната полна'); return; }

        const username = await getUsername(currentUser.uid);
        currentRoomId = roomId;

        await roomRef.child('players').child(currentUser.uid).set({
            name: username,
            ready: false, 
            score: 0,
            totalTime: 0
        });

        document.getElementById('roomsBrowserPanel').style.display = 'none';
        document.getElementById('currentRoomPanel').style.display = 'flex';

        subscribeToMyRoom();
        window.switchCompTab('rooms'); 
    };

    window.copyRoomLink = function() {
        if(currentRoomId) {
            const fullUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
            navigator.clipboard.writeText(fullUrl).then(() => {
                alert('Ссылка скопирована!');
            });
        }
    }

    function subscribeToRooms() {
        const list = document.getElementById('roomsList');
        if(!list) return;
        db.ref('rooms').off();
        db.ref('rooms').orderByChild('status').equalTo('waiting').limitToLast(20).on('value', (snapshot) => {
            if(currentRoomId) return; 
            list.innerHTML = '';
            if(!snapshot.exists()) {
                list.innerHTML = '<div class="leaderboard-empty">Нет активных комнат</div>';
                return;
            }
            let hasPublicRooms = false;
            snapshot.forEach(child => {
                const room = child.val();
                if(room.settings && room.settings.isPrivate) return;
                hasPublicRooms = true;
                const count = Object.keys(room.players || {}).length;
                const max = room.settings ? room.settings.maxPlayers : 3;
                
                const div = document.createElement('div');
                div.className = 'room-item';
                div.innerHTML = `
                    <div style="display:flex; flex-direction:column;">
                        <span style="color:white; font-weight:bold;">Комната ${room.hostName}</span>
                    </div>
                    <div style="text-align:right;">
                        <span style="color:#4CAF50; font-weight:bold;">${count} / ${max}</span>
                    </div>
                `;
                div.onclick = () => joinRoom(child.key);
                list.appendChild(div);
            });
            if(!hasPublicRooms) list.innerHTML = '<div class="leaderboard-empty">Нет открытых комнат</div>';
        });
    }

    let roomListener = null;
    
    function subscribeToMyRoom() {
        if(!currentRoomId) return;
        const roomRef = db.ref(`rooms/${currentRoomId}`);
        
        roomListener = roomRef.on('value', (snap) => {
            const data = snap.val();
            if(!data) { leaveRoom(); return; }

            const pList = document.getElementById('roomPlayersList');
            document.getElementById('lobbyHostName').textContent = data.hostName;
            pList.innerHTML = '';
            
            let allReady = true;
            let playerCount = 0;
            const amIHost = (data.host === currentUser.uid);


            
            if(data.players) {
                Object.values(data.players).forEach(p => {
                    playerCount++;
                    if(!p.ready) allReady = false;
                    const readyStatus = p.ready ? '✅' : '❌';
                    pList.innerHTML += `
                        <div class="room-player-card">
                            <div style="font-size:24px;">👤</div>
                            <div style="font-weight:bold; color:white; font-size:13px;">${p.name}</div>
                            <div>${readyStatus}</div>
                        </div>
                    `;
                });
            }

            

            const startBtn = document.getElementById('startGameBtn');
            const readyBtn = document.getElementById('readyBtn');
            const waitingText = document.getElementById('waitingText');

            const myData = data.players[currentUser.uid];
            if(myData && myData.ready) {
                readyBtn.textContent = 'НЕ ГОТОВ';
                readyBtn.style.background = '#f44336';
                isMyReady = true;
            } else {
                readyBtn.textContent = 'Я ГОТОВ';
                readyBtn.style.background = '#333';
                isMyReady = false;
            }

            if(data.status === 'waiting') {
                if(amIHost) {
                    if(allReady && playerCount >= 2) {
                        startBtn.style.display = 'block';
                        waitingText.style.display = 'none';
                    } else {
                        startBtn.style.display = 'none';
                        waitingText.style.display = 'block';
                        waitingText.textContent = "Ждем готовности...";
                    }
                } else {
                    startBtn.style.display = 'none';
                }
            } else if (data.status === 'playing') {
                readyBtn.style.display = 'none';
                startBtn.style.display = 'none';
                waitingText.style.display = 'none';
                
                if(data.currentRound !== compRound) {
                    startCompRound(data.currentRound);
                }
                
                syncActiveParts(data.activeParts);
                
                if(amIHost) {
                    checkRoundEnd(data.activeParts, data.currentRound);
                }

            } else if (data.status === 'finished') {
                showCompResults(data);
            }
        });
    }

   function unsubscribeFromMyRoom() {
    if(currentRoomId && roomListener) {
        db.ref(`rooms/${currentRoomId}`).off('value', roomListener);
        roomListener = null;
    }
    
    // Останавливаем AFK проверку (ДОБАВИТЬ ЭТО)
    stopHostAFKCheck();
}

window.toggleReady = function() {
    if(!currentRoomId || !currentUser) return;
    
    // Обновляем активность хоста (ДОБАВИТЬ ЭТО)
    updateHostActivity();
    
    db.ref(`rooms/${currentRoomId}/players/${currentUser.uid}`).update({ ready: !isMyReady });
};

    // --- ЛОГИКА ИГРЫ (REAL-TIME) ---

window.startCompGame = async function() {
    if(!currentRoomId) return;
    
    // Обновляем активность хоста (ДОБАВИТЬ ЭТО)
    await updateHostActivity();
    
    const roomRef = db.ref(`rooms/${currentRoomId}`);
    const snap = await roomRef.once('value');
    const players = snap.val().players;
    const updates = {};
    
    Object.keys(players).forEach(uid => {
        updates[`players/${uid}/score`] = 0;
        updates[`players/${uid}/totalTime`] = 0;
    });
    
    updates['status'] = 'playing';
    updates['currentRound'] = 0;
    
    await roomRef.update(updates);
    setTimeout(() => hostStartNextRound(1), 1000);
};

    async function hostStartNextRound(roundNum) {
    if (!currentRoomId) return;

    // Читаем настройки из базы
    const snap = await db.ref(`rooms/${currentRoomId}/settings`).once('value');
    const settings = snap.val() || { totalRounds: 10 }; 
    
    // Проверка лимита раундов
    if(roundNum > settings.totalRounds) {
        db.ref(`rooms/${currentRoomId}`).update({ status: 'finished' });
        return;
    }
    
    // ... (код выбора деталей остается прежним) ...
    const possibleParts = [
        { name: 'Коленвал', tier: 'sport+' }, { name: 'Распредвал', tier: 'sport+' },
        { name: 'Турбина', tier: 'sport+' }, { name: 'Нагнетатель', tier: 'sport+' },
        { name: 'Сцепление', tier: 'sport+' }, { name: 'КПП', tier: 'sport+' },
        { name: 'Дифференциал', tier: 'sport+' }, { name: 'Подвеска', tier: 'sport+' },
        { name: 'Тормоза', tier: 'sport+' }, { name: 'Прошивка', tier: 'STAGE-3' }
    ];
    const shuffled = possibleParts.sort(() => 0.5 - Math.random()).slice(0, 2);
    const partsPayload = { 'p0': shuffled[0], 'p1': shuffled[1] };

    await db.ref(`rooms/${currentRoomId}`).update({
        currentRound: roundNum,
        activeParts: partsPayload
    });
}
async function startCompRound(roundNum) {
        compGameActive = true;
        compRound = roundNum;
        
        closeCompModal();
        closeSettings();
        abortCatchingSession(); 

        // === 1. ПЕРЕКЛЮЧЕНИЕ НА ДВИГАТЕЛЬ И КОЛЕНВАЛ (Сразу же) ===
        // Кликаем на категорию "Двигатель" (первая кнопка)
        const categories = document.querySelectorAll('.category-btn');
        if (categories && categories.length > 0) {
            categories[0].click(); 
        }

        // Через мгновение кликаем на "Коленвал" и центрируем
        setTimeout(() => {
            const partBtn1 = document.querySelector('.part-selector-button-1');
            if (partBtn1) partBtn1.click(); 
            
            currentSlotIndex = 0;
            highlightSelectedSlot();
            // moveCursorToCenter(); // Можете раскомментировать, если нужно центрировать мышь
        }, 50);

        // === 2. ПОКАЗЫВАЕМ ТАЙМЕР (3..2..1) ===
        const overlay = document.getElementById('compOverlay');
        const title = document.getElementById('compOverlayTitle');
        const timerDiv = document.getElementById('compOverlayTimer');
        const msg = document.getElementById('compOverlayMessage');

        overlay.style.display = 'flex';
        title.textContent = `Раунд ${roundNum}`;
        msg.textContent = ""; 

        let countdown = 3;
        while(countdown > 0) {
            timerDiv.textContent = countdown;
            await new Promise(r => setTimeout(r, 1000)); // Ждем 1 секунду
            countdown--;
        }
        overlay.style.display = 'none';

        // === 3. НАЧИНАЕМ ЛОВЛЮ (Только после таймера) ===
        isCatchingMode = true; 
        startCatchTimer(); // Запускаем секундомер
    }

    function syncActiveParts(activePartsData) {
        clearSpawnedParts();
        spawnedParts = [];

        if (!activePartsData) {
            if (isCatchingMode) isCatchingMode = false;
            return; 
        }

        Object.keys(activePartsData).forEach(key => {
            const partData = activePartsData[key];
            const allSlots = document.querySelectorAll('.part-slot');
            let foundSlot = null;

            allSlots.forEach(slot => {
                const sName = slot.querySelector('.part-name').textContent.trim();
                const sTier = slot.querySelector('.tier-label').textContent.trim();
                if(sName === partData.name && sTier === partData.tier) {
                    foundSlot = slot;
                }
            });

            if (foundSlot) {
                foundSlot.dataset.dbKey = key; 
                const partObj = {
                    element: foundSlot,
                    name: partData.name,
                    tier: partData.tier,
                    statusElement: foundSlot.querySelector('.part-status')
                };
                activatePart(partObj);
                spawnedParts.push(partObj);
            }
        });
    }

    window.compBuyTransaction = function(items) {
    if(!currentRoomId || !currentUser) return;
    
    items.forEach(item => {
        db.ref(`rooms/${currentRoomId}/activeParts`).transaction((currentParts) => {
            if (currentParts) {
                const key = Object.keys(currentParts).find(k => 
                    currentParts[k].name === item.name && currentParts[k].tier === item.tier
                );
                if (key) {
                    delete currentParts[key];
                    return currentParts;
                }
            }
            return; 
        }, (error, committed, snapshot) => {
            if (committed) {
                addCompScore(1);
                // ЗДЕСЬ РАНЬШЕ БЫЛ showCompNotification - МЫ ЕГО УБРАЛИ
                // Больше ничего не пишется на экране
            }
        });
    });
};
    
window.buyItems = function() {
    if (cartItems.length === 0) {
        alert('Корзина пуста!');
        return;
    }

    // Рассчитываем время (общее для обоих режимов)
    let totalSessionTime;
    if (isTimerRunning) {
        totalSessionTime = (Date.now() - catchStartTime) / 1000;
    } else {
        totalSessionTime = currentCatchTime;
    }

    // === ЛОГИКА СОРЕВНОВАТЕЛЬНОГО РЕЖИМА (ИСПОЛЬЗУЕМ ALERT) ===
    if(compGameActive && currentRoomId) {
        // Показываем стандартный браузерный ALERT для соревновательного режима
        alert(`Покупка оформлена! Поймано: ${cartItems.length}\nВремя: ${totalSessionTime.toFixed(2)} с`);

        // Отправляем на сервер
        compBuyTransaction(cartItems);
        
        // Очищаем корзину и выходим
        cartItems = [];
        itemCount = 0;
        updateCounter();
        updateCartDisplay();
        closeCart();
        return; 
    }
    // ===============================================

    // === ЛОГИКА ОСНОВНОЙ СИМУЛЯЦИИ (ИСПОЛЬЗУЕМ ТОЖЕ ALERT) ===
    if (sessionTimeout) {
        clearTimeout(sessionTimeout);
        sessionTimeout = null;
    }
    const alreadySold = spawnedParts.filter(p => p.statusElement.textContent.trim() === 'Нет в продаже').length;
    const totalSpawned = spawnedParts.length;
    const buyingNow = cartItems.length;
    const isSessionFinished = (alreadySold + buyingNow) >= totalSpawned;
    if (isSessionFinished) totalSessionTime = stopCatchTimer();

    if (currentUser) updateUserStatistics(totalSessionTime, cartItems.length);
    cartItems.forEach(item => {
         const catchTime = item.catchTime || totalSessionTime;
         if (catchTime > 0) updatePartStats(item.name, catchTime);
         removePartFromAvailability(item.name, item.tier);
    });
    
    // Показываем стандартный браузерный ALERT для основной симуляции
    alert(`Покупка оформлена! Поймано: ${cartItems.length}, Время: ${totalSessionTime.toFixed(2)} с`);
    
    cartItems = [];
    itemCount = 0;
    updateCounter();
    updateCartDisplay();
    closeCart();
    checkIfAllPartsPurchased();
}

    function addCompScore(points) {
        db.ref(`rooms/${currentRoomId}/players/${currentUser.uid}/score`).transaction(score => (score || 0) + points);
    }
    
    function showCompNotification(text, color = 'green') {
        const notif = document.createElement('div');
        notif.textContent = text;
        notif.style.position = 'absolute';
        notif.style.top = '50%'; 
        notif.style.left = '50%';
        notif.style.transform = 'translate(-50%, -50%)';
        notif.style.background = color === 'green' ? 'rgba(76, 175, 80, 0.9)' : 'rgba(244, 67, 54, 0.9)';
        notif.style.color = 'white';
        notif.style.padding = '10px 20px';
        notif.style.borderRadius = '5px';
        notif.style.zIndex = '5000';
        notif.style.fontSize = '20px';
        notif.style.fontWeight = 'bold';
        notif.style.pointerEvents = 'none';
        
        document.body.appendChild(notif);
        
        let top = 50;
        const interval = setInterval(() => {
            top -= 1;
            notif.style.top = top + '%';
            notif.style.opacity = parseFloat(notif.style.opacity || 1) - 0.02;
            if(top < 40) {
                clearInterval(interval);
                notif.remove();
            }
        }, 30);
    }

    function checkRoundEnd(activeParts, currentRound) {
        if (!activeParts && compGameActive) {
            if(!window.nextRoundTimeout) {
                window.nextRoundTimeout = setTimeout(() => {
                    hostStartNextRound(currentRound + 1);
                    window.nextRoundTimeout = null;
                }, 3000);
            }
        }
    }

   function showCompResults(data) {
    compGameActive = false;
    
    const overlay = document.getElementById('compOverlay');
    const title = document.getElementById('compOverlayTitle');
    const timerDiv = document.getElementById('compOverlayTimer');
    const msg = document.getElementById('compOverlayMessage');
    
    overlay.style.display = 'flex';
    title.textContent = "ИТОГИ МАТЧА";
    timerDiv.textContent = "🏆";
    
    let html = '<div style="margin-top:20px; text-align:left;">';
    const players = Object.values(data.players || {}).sort((a,b) => b.score - a.score);
    
    players.forEach((p, i) => {
        const medal = i===0?'🥇':(i===1?'🥈':'🥉');
        html += `<div style="font-size:24px; margin-bottom:10px;">${medal} ${p.name}: <b style="color:#FFD700">${p.score}</b></div>`;
    });
    html += '</div>';
    
    // Кнопка вызывает новую функцию удаления
    msg.innerHTML = html + '<br><button onclick="finishCompAndClose()" style="padding:10px 20px; font-size:16px; cursor:pointer; background: #333; color: white; border: 1px solid #555; border-radius: 5px;">Завершить и выйти</button>';
}

// НОВАЯ ФУНКЦИЯ: Удаляет комнату и сбрасывает интерфейс
window.finishCompAndClose = async function() {
    document.getElementById('compOverlay').style.display = 'none';
    
    if (currentRoomId) {
        // Проверяем, хост ли я
        const snap = await db.ref(`rooms/${currentRoomId}/host`).once('value');
        const hostId = snap.val();
        
        // Если я хост — удаляю комнату полностью
        if (hostId === currentUser.uid) {
            await db.ref(`rooms/${currentRoomId}`).remove();
        } else {
            // Если не хост — просто удаляю себя из игроков
            await db.ref(`rooms/${currentRoomId}/players/${currentUser.uid}`).remove();
        }
    }
    
    // Сброс локального состояния
    resetCompState();
    
    // Возврат в меню лобби
    openCompModal();
    document.getElementById('currentRoomPanel').style.display = 'none';
    document.getElementById('roomsBrowserPanel').style.display = 'flex';
    subscribeToRooms();
};

    // ==========================================
    // ФИКС КНОПКИ ПОКУПКИ (ОБЯЗАТЕЛЬНО)
    // ==========================================
    setTimeout(() => {
        const oldBtn = document.querySelector('.buy-btn');
        if (oldBtn) {
            // Клонируем кнопку, чтобы убить старые обработчики событий (которые не работали с соревнованием)
            const newBtn = oldBtn.cloneNode(true);
            oldBtn.parentNode.replaceChild(newBtn, oldBtn);
            
            // Вешаем новую универсальную функцию
            newBtn.addEventListener('click', window.buyItems);
            console.log("Кнопка покупки обновлена для соревновательного режима");
        }
    }, 1000);

    // --- ПРОВЕРКА ССЫЛКИ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ ---
    setTimeout(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        
        if (roomParam) {
            console.log("Обнаружена ссылка на комнату:", roomParam);
            const authCheck = setInterval(() => {
                if (currentUser) {
                    clearInterval(authCheck);
                    openCompModal();
                    joinRoom(roomParam);
                }
            }, 1000);
            setTimeout(() => clearInterval(authCheck), 20000);
        }
    }, 1500);

    // При генерации таблицы лидеров
function renderLeaderboard(players, currentUser) {
    const container = document.querySelector('.leaderboard-table-container');
    container.innerHTML = '';
    
    players.forEach((player, index) => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        
        // Определяем позицию (топ-1, топ-2, топ-3)
        if (index === 0) row.classList.add('rank-1');
        else if (index === 1) row.classList.add('rank-2');
        else if (index === 2) row.classList.add('rank-3');
        
        // Проверяем, это текущий пользователь?
        if (currentUser && player.id === currentUser.id) {
            row.classList.add('current-user');
        }
        
        // Создаем содержимое строки
        row.innerHTML = `
            <div>${index + 1}</div>
            <div>${player.name}</div>
            <div>${player.bestTime}</div>
            <div>${player.avgTime}</div>
            <div>${player.partsCount}</div>
            <div>${player.lastDate}</div>
        `;
        
        container.appendChild(row);
    });
}
});
