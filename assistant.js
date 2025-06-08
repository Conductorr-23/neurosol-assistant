// assistant.js

document.addEventListener('DOMContentLoaded', () => {
    // 1) Базовый URL для всех fetch
    const API_BASE = window.location.origin;

    const form = document.getElementById('form');
    const input = document.getElementById('input');
    const chat = document.getElementById('chat');
    const onboardingSection = document.getElementById('onboarding-section');

    // История сообщений текущей сессии
    const messages = [];

    // 2) userId хранится в localStorage
    let userId = localStorage.getItem('userId');
    if (!userId) {
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('userId', userId);
    }

    // 3) sessionId хранится в sessionStorage (для разделения вкладок)
    let currentSessionId = sessionStorage.getItem('sessionId');
    function isUUID(u) {
        return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(u);
    }
    if (currentSessionId && !isUUID(currentSessionId)) {
        sessionStorage.removeItem('sessionId');
        currentSessionId = null;
    }

    // 4) Функция сохранения истории (без сообщений-ошибок)
    function saveHistory() {
        if (!currentSessionId) return;
        const toSave = messages.filter(m => {
            return !(m.role === 'assistant' && m.content.includes('class="error"'));
        });
        sessionStorage.setItem(`chat_${currentSessionId}`, JSON.stringify(toSave));
    }

    // 5) При загрузке: восстанавливаем историю, если есть sessionId
    if (currentSessionId) {
        const saved = sessionStorage.getItem(`chat_${currentSessionId}`);
        if (saved) {
            try {
                const hist = JSON.parse(saved);
                hist.forEach(m => appendMessage(m.role, m.content));
                messages.push(...hist);
                onboardingSection.style.display = 'none';
            } catch (e) {
                console.warn('Не удалось восстановить историю:', e);
            }
        }
    } else {
        // новая вкладка => онбординг
        showOnboarding();
    }

    // 6) При вводе вручную скрываем онбординг
    input.addEventListener('input', () => {
        if (onboardingSection.style.display !== 'none') {
            onboardingSection.style.display = 'none';
        }
    });

    // 7) Функция отображения онбординга
    function showOnboarding() {
        onboardingSection.innerHTML = '';
        onboardingSection.style.display = 'block';

        const intro = document.createElement('div');
        intro.className = 'onboarding-intro';
        intro.innerHTML =
            'Hello! I&rsquo;m the NeuroSOL Assistant.<br>' +
            'I&rsquo;m here to help you with Autism Spectrum Disorder and related developmental needs.<br>' +
            'Please choose one of the questions below.';
        onboardingSection.appendChild(intro);

        const questionsDiv = document.createElement('div');
        questionsDiv.id = 'onboarding';
        questionsDiv.className = 'onboarding-questions';
        const starterQs = [
            'What is autism?',
            'How can I help my child learn to communicate?',
            'Which therapy methods are most effective?'
        ];
        starterQs.forEach(text => {
            const btn = document.createElement('button');
            btn.className = 'onboarding-question';
            btn.textContent = text;
            btn.addEventListener('click', () => {
                onboardingSection.style.display = 'none';
                input.value = text;
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            });
            questionsDiv.appendChild(btn);
        });
        onboardingSection.appendChild(questionsDiv);

        const orDiv = document.createElement('div');
        orDiv.className = 'onboarding-custom';
        orDiv.textContent = 'or ask your own question 👇';
        onboardingSection.appendChild(orDiv);
    }

    // 8) Вспомогательные для сообщений
    function createMessageRow(role, content, isLoading = false) {
        const row = document.createElement('div');
        row.className = `chat-row ${role}`;

        const icon = document.createElement('div');
        icon.className = 'chat-icon';
        if (!isLoading) {
            icon.innerHTML = role === 'user'
                ? '<img src="https://cdn-icons-png.flaticon.com/512/847/847969.png" width="32" height="32" alt="User"/>'
                : '<img src="bot-icon.svg" width="32" height="32" alt="Bot"/>';
        }

        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${role}`;
        if (role === 'bot' && !isLoading) {
            bubble.innerHTML = marked.parse(content);
        } else {
            bubble.textContent = content;
        }

        if (role === 'user') {
            row.appendChild(bubble);
            row.appendChild(icon);
        } else {
            row.appendChild(icon);
            row.appendChild(bubble);
        }
        return row;
    }

    function appendMessage(role, content) {
        const row = createMessageRow(role, content);
        chat.appendChild(row);
        return row;
    }

    // 9) Авто-рост textarea
    function adjustTextareaHeight() {
        input.style.height = '0px';
        input.style.height = 'auto';
        requestAnimationFrame(() => {
            let h = input.scrollHeight;
            const st = getComputedStyle(input);
            const maxH = parseFloat(st.maxHeight);
            const minH = parseFloat(st.minHeight);
            h = Math.max(minH, Math.min(maxH, h));
            input.style.height = h + 'px';
            input.style.overflowY = input.scrollHeight > h ? 'auto' : 'hidden';
        });
    }

    // 10) Отправка формы
    form.addEventListener('submit', async e => {
        e.preventDefault();
        const question = input.value.trim();
        if (!question) return;

        onboardingSection.style.display = 'none';

        // Добавляем временно новый sessionId, если его ещё нет
        if (!currentSessionId) {
            currentSessionId = crypto.randomUUID();
            sessionStorage.setItem('sessionId', currentSessionId);
        }

        // Собираем тело запроса
        const requestBody = { question, messages, userId, sessionId: currentSessionId };

        // Пушим пользовательский вопрос в историю
        messages.push({ role: 'user', content: question });
        saveHistory();
        appendMessage('user', question);

        // Готовим индикатор загрузки
        input.value = '';
        input.style.height = 'auto';
        const statuses = ['Searching for information', 'Checking documents', 'Preparing response'];
        let idx = 0;
        const loadingRow = createMessageRow('bot', statuses[idx], true);
        loadingRow.querySelector('.chat-icon').innerHTML =
            '<img src="bot-icon.svg" class="spinner" width="32" height="32" alt="Loading...">';
        const loadingBubble = loadingRow.querySelector('.chat-bubble.bot');
        chat.appendChild(loadingRow);
        chat.scrollTop = chat.scrollHeight;
        const timer = setInterval(() => {
            idx = (idx + 1) % statuses.length;
            loadingBubble.textContent = statuses[idx];
        }, 2000);

        try {
            const res = await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
            if (!res.ok) {
                let err;
                try { err = await res.json(); }
                catch { err = { answer: `Server error ${res.status}` }; }
                throw new Error(err.answer || `Error ${res.status}`);
            }
            const data = await res.json();

            clearInterval(timer);
            if (chat.contains(loadingRow)) chat.removeChild(loadingRow);

            const answer = data.answer || '<span class="error">Sorry, no response.</span>';
            messages.push({ role: 'assistant', content: answer });
            saveHistory();
            const botRow = appendMessage('bot', answer);
            botRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (err) {
            console.error('Fetch error:', err);
            clearInterval(timer);
            if (chat.contains(loadingRow)) chat.removeChild(loadingRow);
            const msg = `<span class="error">${err.message}</span>`;
            appendMessage('bot', msg).scrollIntoView({ behavior: 'smooth', block: 'start' });
        } finally {
            adjustTextareaHeight();
        }
    });

    input.addEventListener('input', adjustTextareaHeight);
    window.addEventListener('load', adjustTextareaHeight);
    window.addEventListener('resize', adjustTextareaHeight);
});
