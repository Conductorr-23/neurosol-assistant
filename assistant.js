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
        const toSave = messages.filter(m =>
            !(m.role === 'assistant' && m.content.includes('class="error"'))
        );
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

    // 6) При вводе вручную скрываем онбординг и растягиваем textarea
    input.addEventListener('input', () => {
        if (onboardingSection.style.display !== 'none') {
            onboardingSection.style.display = 'none';
        }
        adjustTextareaHeight();
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

    // 8) Создание элемента сообщения
    function createMessageRow(role, content, isLoading = false) {
        const row = document.createElement('div');
        row.className = `chat-row ${role}`;

        const icon = document.createElement('div');
        icon.className = 'chat-icon';
        if (!isLoading) {
            icon.innerHTML = role === 'user'
                ? '<img src="https://cdn-icons-png.flaticon.com/512/847/847969.png" width="32" height="32" alt="User"/>'
                : '<img src="bot-icon.svg" width="32" height="32" alt="Bot"/>';
        } else {
            icon.innerHTML = '<img src="bot-icon.svg" class="spinner" width="32" height="32" alt="Loading...">';
        }

        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${role}`;

        if (role === 'bot' && !isLoading) {
            bubble.innerHTML = content;
        } else if (isLoading) {
            bubble.textContent = '';
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

    function appendMessage(role, content, isLoading = false) {
        const row = createMessageRow(role, content, isLoading);
        chat.appendChild(row);
        chat.scrollTop = chat.scrollHeight;
        return row;
    }

    // 9) Авто-рост textarea до 7 строк, скролл внутри при переполнении (с 8-й строки)
function adjustTextareaHeight() {
    input.style.height = 'auto'; // Сбрасываем высоту, чтобы получить scrollHeight
    requestAnimationFrame(() => {
        let currentScrollHeight = input.scrollHeight;
        const st = getComputedStyle(input);
        const minH = parseFloat(st.minHeight); // Получаем min-height (3 строки) из CSS
        const maxH = parseFloat(st.maxHeight); // Получаем max-height (7 строк) из CSS

        let newH = currentScrollHeight;

        // Высота не должна быть меньше minH (3 строки)
        newH = Math.max(minH, newH);

        // Высота не должна быть больше maxH (7 строк)
        newH = Math.min(maxH, newH);

        input.style.height = newH + 'px';

        // Скролл должен появиться только если фактический scrollHeight
        // превышает максимальную высоту (7 строк)
        input.style.overflowY = currentScrollHeight > maxH ? 'auto' : 'hidden';
    });
}

    // 10) Отправка формы с анимацией смены фраз
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const question = input.value.trim();
        if (!question) return;

        onboardingSection.style.display = 'none';

        if (!currentSessionId) {
            currentSessionId = crypto.randomUUID();
            sessionStorage.setItem('sessionId', currentSessionId);
        }

        messages.push({ role: 'user', content: question });
        saveHistory();
        appendMessage('user', question);

        input.value = '';
        adjustTextareaHeight();

        const statuses = ['Searching for information', 'Checking documents', 'Preparing response'];
        let idx = 0;
        const loadingRow = appendMessage('bot', statuses[idx], true);
        const loadingBubble = loadingRow.querySelector('.chat-bubble.bot');
        const timer = setInterval(() => {
            idx = (idx + 1) % statuses.length;
            loadingBubble.textContent = statuses[idx];
        }, 2000);

        try {
            const res = await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, messages, userId, sessionId: currentSessionId }),
            });

            if (!res.ok) {
                let errData;
                try {
                    errData = await res.json();
                } catch {
                    errData = { answer: `Server error: ${res.status}` };
                }
                throw new Error(errData.answer || `Error ${res.status}`);
            }

            const data = await res.json();

            clearInterval(timer);
            chat.removeChild(loadingRow);

            if (data.sessionId && data.sessionId !== currentSessionId) {
                currentSessionId = data.sessionId;
                sessionStorage.setItem('sessionId', currentSessionId);
            }

            const answer = data.answer || '<span class="error">Sorry, no response.</span>';
            messages.push({ role: 'assistant', content: answer });
            saveHistory();
            appendMessage('bot', answer);
        } catch (err) {
            console.error('Fetch error:', err);
            clearInterval(timer);
            if (chat.contains(loadingRow)) chat.removeChild(loadingRow);
            appendMessage('bot', `<span class="error">${err.message}</span>`);
        } finally {
            adjustTextareaHeight();
        }
    });

    input.addEventListener('input', adjustTextareaHeight);
    window.addEventListener('load', adjustTextareaHeight);
    window.addEventListener('resize', adjustTextareaHeight);
});
