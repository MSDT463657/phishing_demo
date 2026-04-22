import express  from 'express';
import OpenAI   from 'openai';
import dotenv   from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app       = express();
const openai    = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

const SYSTEM_PROMPT = `You are a cybersecurity training coach for Saudi Aramco employees.

STRICT RULES — follow exactly:
- Maximum 3 sentences total. No exceptions.
- One sentence: acknowledge what they got right.
- One sentence: one vague nudge toward what they missed — do NOT name or describe the missed indicators.
- One sentence: a single reflective question.
- Do NOT list indicators. Do NOT explain attack techniques. Do NOT lecture.`;

app.post('/api/feedback', async (req, res) => {
  const { flaggedCount, totalSuspicious, flaggedItems, missedItems } = req.body;

  const userMessage = `
The learner just completed a phishing identification activity.
They flagged ${flaggedCount} of ${totalSuspicious} suspicious indicators.

What they correctly identified:
${flaggedItems.length > 0
    ? flaggedItems.map((item, i) => `${i + 1}. ${item}`).join('\n')
    : 'Nothing.'}

What they missed:
${missedItems.length > 0
    ? missedItems.map((item, i) => `${i + 1}. ${item}`).join('\n')
    : 'Nothing — they found everything.'}

Give them:
1. A brief acknowledgement of what they got right (1-2 sentences, specific)
2. A clear explanation of each missed indicator and why it matters
3. One closing insight connecting the missed indicators to real attacker behaviour
Do not use headers or bullet points — write in natural coaching language.
  `.trim();

  try {
    const response = await openai.chat.completions.create({
      model:      'gpt-4o-mini',
      max_tokens: 400,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userMessage }
      ]
    });
    res.json({ feedback: response.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ feedback: 'AI service error. Please try again.' });
  }
});

app.post('/api/followup', async (req, res) => {
  const { history } = req.body;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map(msg => ({
      role:    msg.role === 'ai' ? 'assistant' : 'user',
      content: msg.content
    }))
  ];

  try {
    const response = await openai.chat.completions.create({
      model:      'gpt-4o-mini',
      max_tokens: 300,
      messages
    });
    res.json({ reply: response.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: 'AI service error. Please try again.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Phishing demo running on port ${PORT}`));
