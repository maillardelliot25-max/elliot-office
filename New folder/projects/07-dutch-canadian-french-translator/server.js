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

app.post('/api/translate', async (req, res) => {
  try {
    const { text } = req.body;
    const cacheKey = `nl-fr-ca-${text}`;

    if (cache.has(cacheKey)) {
      return res.json({ translated: cache.get(cacheKey), source: 'cache' });
    }

    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Translate Dutch to Canadian French with cultural references (Montréal, hockey, poutine). Keep it natural: "${text}". Reply with translation only.`
      }]
    });

    const translated = message.content[0].text.trim();
    cache.set(cacheKey, translated);
    res.json({ translated, source: 'api' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(5300, () => console.log('🇳🇱🍁 Dutch-Canadian French on port 5300'));
