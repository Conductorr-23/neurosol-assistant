// 🔥 УДАЛЕНО: Supabase JS SDK больше не нужен на клиенте для upload.js
// const SUPABASE_URL = '...';
// const SUPABASE_ANON_KEY = '...';
// const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);\

// 🔵 Логирование в интерфейсе
const logBlock = document.getElementById('log');
const statusMessageElement = document.getElementById('statusMessage'); // Получаем новый элемент статуса

/**
 * Обновляет сообщение в верхней части интерфейса, включая лоадер.
 * @param {string} message - Текст сообщения.
 * @param {boolean} showLoader - Показывать ли лоадер.
 * @param {string} color - Цвет текста сообщения.
 */
function updateStatusMessage(message, showLoader = false, color = '#555') {
    statusMessageElement.style.color = color;
    if (showLoader) {
        statusMessageElement.innerHTML = `<img src="bot-icon.svg" class="loader-icon" alt="Loading"> ${message}`;
    } else {
        statusMessageElement.innerHTML = message;
    }
}

/**
 * Добавляет сообщение в блок логов.
 * @param {string} message - Текст сообщения.
 * @param {'info' | 'success' | 'error' | 'warning' | 'loading'} type - Тип сообщения для префикса и цвета.
 */
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  let prefix = '';
  let color = '#333'; // default color

  if (type === 'success') {
    prefix = '✅';
    color = '#28a745';
  } else if (type === 'error') {
    prefix = '❌';
    color = '#dc3545';
  } else if (type === 'warning') {
    prefix = '⚠️';
    color = '#ffc107';
  } else if (type === 'info') {
    prefix = 'ℹ️';
    color = '#17a2b8';
  } else if (type === 'loading') {
    prefix = '⏳';
    color = '#007bff';
  }

  const logEntry = document.createElement('p');
  logEntry.style.color = color;
  logEntry.innerHTML = `<strong>${timestamp} ${prefix}</strong> ${message}`;
  logBlock.prepend(logEntry); // Добавляем в начало списка
}

function clearLogs() {
  logBlock.innerHTML = '';
  updateStatusMessage(''); // Очищаем статусное сообщение
}

// 🟢 Обработка одного файла
async function processFile(file) {
  updateStatusMessage(`Загрузка файла \"${file.name}\"...`, true, '#007bff');
  log(`Начало обработки файла: ${file.name}`, 'info');

  // Проверка на размер файла (например, не более 5 МБ)
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
  if (file.size > MAX_FILE_SIZE) {
    log(`❌ Файл \"${file.name}\" слишком большой (${(file.size / (1024 * 1024)).toFixed(2)} МБ). Максимальный размер: ${MAX_FILE_SIZE / (1024 * 1024)} МБ.`, 'error');
    updateStatusMessage(`Обработка файла \"${file.name}\" завершена с ошибкой: файл слишком большой.`, false, '#dc3545');
    return; // Остановить обработку
  }

  // Проверка на тип файла (только текстовые файлы)
  if (!file.type.startsWith('text/')) {
    log(`❌ Файл \"${file.name}\" имеет неподдерживаемый тип (${file.type}). Пожалуйста, загрузите текстовый файл.`, 'error');
    updateStatusMessage(`Обработка файла \"${file.name}\" завершена с ошибкой: неподдерживаемый тип файла.`, false, '#dc3545');
    return; // Остановить обработку
  }


  try {
    const fileContent = await file.text(); // Читаем содержимое как текст
    log(`Файл \"${file.name}\" успешно прочитан. Размер: ${fileContent.length} байт.`, 'success');

    // 🔥 НОВЫЕ ЛОГИ: Для диагностики отправляемых данных
    console.log(`[upload.js DEBUG] File name being sent: "${file.name}"`);
    console.log(`[upload.js DEBUG] Type of file content being sent: ${typeof fileContent}`);
    console.log(`[upload.js DEBUG] Length of file content being sent: ${fileContent.length}`);
    if (fileContent.length > 0) {
        console.log(`[upload.js DEBUG] First 50 chars of file content being sent: "${fileContent.substring(0, Math.min(fileContent.length, 50))}"`);
    } else {
        console.log(`[upload.js DEBUG] File content is empty.`);
    }
    // 🔥 КОНЕЦ НОВЫХ ЛОГОВ

    const response = await fetch('/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: file.name,
        fileContent: fileContent,
      }),
    });

    const responseData = await response.json();

    if (response.ok) {
      log(`✅ Файл \"${file.name}\" успешно обработан на сервере. Чанков: ${responseData.chunksCount || 'N/A'}`, 'success');
      updateStatusMessage(`Обработка файла \"${file.name}\" завершена.`, false, '#28a745'); // Скрыть лоадер, зеленый
    } else {
      log(`❌ Ошибка обработки файла \"${file.name}\": ${responseData.error || 'Неизвестная ошибка'}`, 'error');
      updateStatusMessage(`Обработка файла \"${file.name}\" завершена с ошибкой.`, false, '#dc3545'); // Скрыть лоадер, красный
    }

  } catch (e) {
    log(`Общая ошибка при обработке: ${e.message}`, 'error');
    updateStatusMessage(`Обработка файла \"${file.name}\" завершена с ошибкой.`, false, '#dc3545'); // Скрыть лоадер, красный
  }
}

// 🟢 Обработка массива файлов
function handleFiles(files) {
  clearLogs(); // 🔥 Очищаем логи перед новой загрузкой
  Array.from(files).forEach(file => {
    processFile(file);
  });
}

// 🟡 Установка обработчиков после загрузки страницы
document.addEventListener('DOMContentLoaded', () => {
  const dropzone = document.getElementById('dropzone');
  const input = document.getElementById('fileInput');

  dropzone.addEventListener('click', () => input.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.items) {
      // Используем DataTransferItemList интерфейс для доступа к файлам
      handleFiles(Array.from(e.dataTransfer.items)
                        .filter(item => item.kind === 'file')
                        .map(item => item.getAsFile()));
    } else {
      // Используем DataTransfer интерфейс
      handleFiles(e.dataTransfer.files);
    }
  });

  input.addEventListener('change', (e) => {
    handleFiles(e.target.files);
  });
});