const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk').default;
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 3600 });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const detectLanguage = (text) => {
  const spanishChars = /[áéíóúüñ¿¡]/;
  return spanishChars.test(text) ? 'spanish' : 'english';
};

app.post('/api/translate', async (req, res) => {
  try {
    const { text, targetLang } = req.body;
    const cacheKey = `${text}-${targetLang}`;

    if (cache.has(cacheKey)) {
      return res.json({ translated: cache.get(cacheKey), source: 'cache' });
    }

    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Translate this text to ${targetLang}: "${text}". Reply with only the translation.`
      }]
    });

    const translated = message.content[0].text.trim();
    cache.set(cacheKey, translated);
    res.json({ translated, source: 'api' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(5100, () => console.log('🌐 Spanish-English Translator on port 5100'));
