// server.js

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
// import { franc } from 'franc'; // закомментировано: используем GPT-детектор
import { v4 as uuidv4 } from 'uuid';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const isoToName = {
  rus: 'Russian',
  eng: 'English',
  spa: 'Spanish',
  fra: 'French',
  deu: 'German',
  ita: 'Italian',
  por: 'Portuguese',
  heb: 'Hebrew',
};

async function detectUserLang(text) {
  const resp = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: 'You are a language detection assistant. Reply only with the ISO639-3 code of the language of the user’s message.'
      },
      { role: 'user', content: text }
    ],
    temperature: 0
  });
  return resp.choices[0].message.content.trim().toLowerCase();
}

app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(__dirname));

async function getSystemPrompt() {
  try {
    const p = path.join(__dirname, 'system_prompt.txt');
    return await fs.readFile(p, 'utf8');
  } catch {
    return 'You are a helpful AI assistant. Answer questions based on the provided context.';
  }
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

async function rewriteQuestion(question, chatHistory) {
  if (chatHistory.length < 2 || question.length > 50) return question;
  const recent = chatHistory.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');
  const prompt = `Given the following conversation history between a user and an AI assistant, rewrite the user's latest question to make it a clear, standalone query. Conversation History:\n${recent}\nUser's latest question: ${question}\nRewritten query:`;
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.1,
    });
    return res.choices[0].message.content.trim();
  } catch {
    return question;
  }
}

app.post('/upload', async (req, res) => {
  const { fileName, fileContent } = req.body;
  if (!fileName || !fileContent) {
    return res.status(400).json({ error: 'File name and content are required.' });
  }
  const content = String(fileContent);
  if (!isNonEmptyString(content)) {
    return res.status(400).json({ error: 'Invalid file content.' });
  }
  try {
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
    const docs = await splitter.createDocuments([content]);
    const chunks = [];
    const ts = new Date().toISOString();
    for (const doc of docs) {
      const txt = doc.pageContent;
      if (!isNonEmptyString(txt)) continue;
      const embRes = await openai.embeddings.create({ model: 'text-embedding-ada-002', input: txt });
      chunks.push({ filename: fileName, content: txt, uploaded_at: ts, embedding: embRes.data[0].embedding });
    }
    if (!chunks.length) return res.status(400).json({ error: 'No valid chunks generated.' });
    const { error } = await supabase.from('knowledge_files').insert(chunks);
    if (error) throw error;
    return res.json({ message: `Saved ${chunks.length} chunks.` });
  } catch (e) {
    console.error('Upload error:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/chat', async (req, res) => {
  // Лог входящего запроса для дебага
  console.log('➡️  Incoming /chat request from:', req.ip, 'body:', {
    question: req.body.question,
    sessionId: req.body.sessionId
  });

  const { question, sessionId = uuidv4(), userId = 'defaultUser', messages: clientMsgs } = req.body;
  if (!question) return res.status(400).json({ answer: 'Please provide a question.' });

  const t0 = process.hrtime.bigint();

  try {
    let userLang;
    try {
      userLang = await detectUserLang(question);
      if (!isoToName[userLang]) userLang = 'eng';
    } catch {
      userLang = 'eng';
    }
    console.log(`DEBUG: Detected userLang via GPT: ${userLang}`);

    let qEng = question;
    if (userLang !== 'eng') {
      const tres = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Translate the following user question to English.' },
          { role: 'user', content: question }
        ],
        temperature: 0,
      });
      qEng = tres.choices[0].message.content.trim();
      console.log(`DEBUG: Translated question: "${qEng}"`);
    }

    const { data: histDb, error: histErr } = await supabase
      .from('chat_history')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true });
    if (histErr) console.warn('History fetch error:', histErr);
    const history = (histDb && histDb.length) ? histDb : (clientMsgs || []);
    const histForRewrite = [...history, { role: 'user', content: qEng }];

    const qRewrite = await rewriteQuestion(qEng, histForRewrite);

    const embRes = await openai.embeddings.create({ model: 'text-embedding-ada-002', input: qRewrite });
    const queryVec = embRes.data[0].embedding;
    const { data: chunks, error: matchErr } = await supabase.rpc('match_documents', {
      query_embedding: queryVec,
      match_threshold: 0.60,
      match_count: 10,
    });
    if (matchErr) throw matchErr;
    chunks.forEach(c => console.log(`DEBUG: Retrieved from ${c.filename}`));

    let textChunks = chunks.slice(0, 5).map(c => c.content);
    const hasContext = Boolean(textChunks.length);
    const contextText = hasContext ? textChunks.join('\n\n') : '';

    const systemPrompt = await getSystemPrompt();
    const sysWithCtx = hasContext
      ? `${systemPrompt}\n\nRelevant information from documents:\n${contextText}`
      : systemPrompt;
    const messagesForGPT = [
      { role: 'system', content: sysWithCtx },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: qEng },
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messagesForGPT,
    });
    let answerEng = completion.choices[0].message.content.trim();

    let finalAnswer = answerEng;
    if (userLang !== 'eng') {
      const trb = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: `Translate the following English answer into ${isoToName[userLang]}. Preserve all HTML tags.` },
          { role: 'user', content: answerEng }
        ],
        temperature: 0,
      });
      finalAnswer = trb.choices[0].message.content.trim();
      console.log(`DEBUG: Translated answer back to ${userLang}`);
    }

    await supabase.from('chat_history').insert([
      { session_id: sessionId, user_id: userId, role: 'user', content: question, timestamp: new Date().toISOString() },
      { session_id: sessionId, user_id: userId, role: 'assistant', content: finalAnswer, timestamp: new Date().toISOString() }
    ]);

    const t1 = process.hrtime.bigint();
    console.log(`Response time: ${Number(t1 - t0) / 1_000_000} ms`);
    return res.json({ answer: finalAnswer, sessionId });
  } catch (err) {
    console.error('Chat error:', err);
    return res.status(500).json({ answer: `<span class="error">Sorry, the server is temporarily unavailable.</span>` });
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
