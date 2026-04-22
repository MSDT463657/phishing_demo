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

// ─────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a cybersecurity training coach for Saudi Aramco employees.
You are guiding a learner through a phishing email identification activity.
Your job is to coach them to find all the indicators themselves — never reveal or name what they missed.

Tone: warm, encouraging, like a good trainer. Short responses only — 2-3 sentences maximum.

Rules:
- Never name or describe the indicators they missed
- Use gentle hints that reference the lesson — e.g. "Think about what you learned about how attackers create urgency" or "Is there anything about the sender details that strikes you as odd?"
- If they are close, say so — "You are nearly there"
- Never use bullet points or lists
- Never explain attack techniques unprompted`;

// ─────────────────────────────────────────────
// POST /api/check
// Called each time learner clicks Check.
// Returns nudge only — never reveals answers.
// ─────────────────────────────────────────────
app.post('/api/check', async (req, res) => {
  const { flaggedCount, totalSuspicious, attempt, flaggedItems, missedCount } = req.body;

  let userMessage;

  if (flaggedCount === totalSuspicious) {
    userMessage = `The learner found all ${totalSuspicious} of ${totalSuspicious} phishing indicators. Congratulate them warmly and specifically. Tell them they are ready for the assessment. 2 sentences.`;
  } else if (attempt >= 3) {
    userMessage = `The learner has made ${attempt} attempts and found ${flaggedCount} of ${totalSuspicious} indicators. Ask them warmly if they would like to finish and see what they missed, or try one more time. Phrase it as a genuine choice. 2 sentences maximum.`;
  } else {
    userMessage = `The learner found ${flaggedCount} of ${totalSuspicious} phishing indicators on attempt ${attempt}.

What they have flagged so far:
${flaggedItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}

They are missing ${missedCount} indicator(s). Do NOT name or describe what they missed.
Do NOT reference anything the learner has not explicitly said in this message.
Give one short encouraging nudge hinting at where to look — no answers, no invented context.
End with this exact question: "Is there anything else in this email that strikes you as odd?"
2-3 sentences maximum.`;
  }

  try {
    const response = await openai.chat.completions.create({
      model:      'gpt-4o-mini',
      max_tokens: 120,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userMessage }
      ]
    });
    res.json({
      message:     response.choices[0].message.content,
      perfect:     flaggedCount === totalSuspicious,
      offerFinish: attempt >= 3 && flaggedCount !== totalSuspicious
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'AI service error. Please try again.' });
  }
});

// ─────────────────────────────────────────────
// POST /api/reveal
// Called when learner chooses to finish.
// Only now do we reveal and explain misses.
// ─────────────────────────────────────────────
app.post('/api/reveal', async (req, res) => {
  const { flaggedCount, totalSuspicious, flaggedItems, missedItems } = req.body;

  const userMessage = `The learner finished with ${flaggedCount} of ${totalSuspicious} indicators found.

Correctly identified:
${flaggedItems.length > 0
    ? flaggedItems.map((item, i) => `${i + 1}. ${item}`).join('\n')
    : 'Nothing.'}

Missed:
${missedItems.length > 0
    ? missedItems.map((item, i) => `${i + 1}. ${item}`).join('\n')
    : 'Nothing — perfect score.'}

Now reveal and explain each missed indicator — name it and explain in one sentence why it matters.
End with one sentence of encouragement and tell them they can try the next email.
No bullet points. Natural coaching language.`;

  try {
    const response = await openai.chat.completions.create({
      model:      'gpt-4o-mini',
      max_tokens: 300,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userMessage }
      ]
    });
    res.json({ message: response.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'AI service error. Please try again.' });
  }
});

// ─────────────────────────────────────────────
// POST /api/followup
// Follow-up chat after reveal or perfect score
// ─────────────────────────────────────────────
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
      max_tokens: 200,
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
