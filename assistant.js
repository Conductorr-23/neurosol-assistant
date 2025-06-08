// assistant.js

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form');
    const input = document.getElementById('input');
    const chat = document.getElementById('chat');
    const onboardingSection = document.getElementById('onboarding-section');

    // базовый URL для запросов
    const API_BASE = window.location.origin;

    // История сообщений
    const messages = [];

    // Генерация или загрузка userId
    let userId = localStorage.getItem('userId');
    if (!userId) {
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('userId', userId);
    }

    // Загрузка и валидация sessionId
    let currentSessionId = localStorage.getItem('sessionId');
    function isUUID(uuid) {
        const re = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
        return re.test(uuid);
    }
    if (currentSessionId && !isUUID(currentSessionId)) {
        localStorage.removeItem('sessionId');
        currentSessionId = null;
    }

    // Если новая сессия (sessionId нет) — показываем онбординг
    if (!currentSessionId) {
        showOnboarding();
    }

    // Скрываем онбординг при вводе вручную
    input.addEventListener('input', () => {
        localStorage.setItem('lastSessionTime', Date.now());
        if (onboardingSection.style.display !== 'none') {
            onboardingSection.style.display = 'none';
        }
    });

    // Функция для динамического создания блока онбординга
    function showOnboarding() {
        const container = onboardingSection;
        container.innerHTML = '';
        container.style.display = 'block';

        const introDiv = document.createElement('div');
        introDiv.className = 'onboarding-intro';
        introDiv.innerHTML = 
            'Hello! I&rsquo;m the NeuroSOL Assistant.<br>' +
            'I&rsquo;m here to help you with Autism Spectrum Disorder and related developmental needs.<br>' +
            'Please choose one of the questions below.';
        container.appendChild(introDiv);

        const questionsDiv = document.createElement('div');
        questionsDiv.id = 'onboarding';
        questionsDiv.className = 'onboarding-questions';
        const starterQuestions = [
            'What is autism?',
            'How can I help my child learn to communicate?',
            'Which therapy methods are most effective?'
        ];
        starterQuestions.forEach(text => {
            const btn = document.createElement('button');
            btn.className = 'onboarding-question';
            btn.textContent = text;
            btn.addEventListener('click', () => {
                container.style.display = 'none';
                input.value = text;
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            });
            questionsDiv.appendChild(btn);
        });
        container.appendChild(questionsDiv);

        const orDiv = document.createElement('div');
        orDiv.className = 'onboarding-custom';
        orDiv.textContent = 'or ask your own question 👇';
        container.appendChild(orDiv);
    }

    // Создание элемента сообщения
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

    // Добавление сообщения в чат
    function appendMessage(role, content) {
        const row = createMessageRow(role, content);
        chat.appendChild(row);
        return row;
    }

    // Автоматическое изменение высоты textarea
    function adjustTextareaHeight() {
        input.style.height = '0px';
        input.style.height = 'auto';
        requestAnimationFrame(() => {
            let newH = input.scrollHeight;
            const st = getComputedStyle(input);
            const maxH = parseFloat(st.maxHeight);
            const minH = parseFloat(st.minHeight);
            newH = Math.max(minH, Math.min(maxH, newH));
            input.style.height = newH + 'px';
            input.style.overflowY = input.scrollHeight > newH ? 'auto' : 'hidden';
        });
    }

    // Обработчик отправки формы
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const question = input.value.trim();
        if (!question) return;

        onboardingSection.style.display = 'none';

        messages.push({ role: 'user', content: question });
        appendMessage('user', question);
        input.value = '';
        input.style.height = 'auto';

        const statusPhrases = [
            'Searching for information',
            'Checking documents',
            'Preparing response'
        ];
        let phraseIndex = 0;

        const loadingRow = createMessageRow('bot', statusPhrases[phraseIndex], true);
        loadingRow.querySelector('.chat-icon').innerHTML =
            '<img src="bot-icon.svg" class="spinner" width="32" height="32" alt="Loading...">';
        const loadingBubble = loadingRow.querySelector('.chat-bubble.bot');
        loadingBubble.textContent = statusPhrases[phraseIndex];
        chat.appendChild(loadingRow);
        chat.scrollTop = chat.scrollHeight;

        const phraseInterval = setInterval(() => {
            phraseIndex = (phraseIndex + 1) % statusPhrases.length;
            loadingBubble.textContent = statusPhrases[phraseIndex];
        }, 2000);

        try {
            const requestBody = { question, messages, userId };
            if (currentSessionId) requestBody.sessionId = currentSessionId;

            const res = await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
            if (!res.ok) {
                let errorData;
                try { errorData = await res.json(); }
                catch { errorData = { answer: `Server error: ${res.status}` }; }
                throw new Error(errorData.answer || `Server error: ${res.status}`);
            }
            const data = await res.json();

            clearInterval(phraseInterval);
            if (chat.contains(loadingRow)) chat.removeChild(loadingRow);

            const botAnswer = data.answer || '<span class="error">Sorry, I couldn\'t generate a response.</span>';
            messages.push({ role: 'assistant', content: botAnswer });
            const botRow = appendMessage('bot', botAnswer);

            botRow.scrollIntoView({ behavior: 'smooth', block: 'start' });

            if (data.sessionId && data.sessionId !== currentSessionId) {
                currentSessionId = data.sessionId;
                localStorage.setItem('sessionId', currentSessionId);
            }
        } catch (err) {
            console.error('Error fetching response:', err);
            clearInterval(phraseInterval);
            if (chat.contains(loadingRow)) chat.removeChild(loadingRow);

            const msg = err.message || 'Sorry, the server is temporarily unavailable.';
            const errRow = appendMessage('bot', `<span class="error">${msg}</span>`);
            errRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } finally {
            adjustTextareaHeight();
        }
    });

    input.addEventListener('input', adjustTextareaHeight);
    window.addEventListener('load', adjustTextareaHeight);
    window.addEventListener('resize', adjustTextareaHeight);
});
