import { getDaily, saveDaily, todayString } from './storage';

const FALLBACK_QUOTES = [
  { q: 'The best way to get started is to quit talking and begin doing.', a: 'Walt Disney' },
  { q: 'Small steps every day lead to big change.', a: 'Unknown' },
  { q: 'First, solve the problem. Then, write the code.', a: 'John Johnson' },
  { q: 'Simplicity is the soul of efficiency.', a: 'Austin Freeman' },
  { q: 'Make it work, make it right, make it fast.', a: 'Kent Beck' },
  { q: 'The only way to do great work is to love what you do.', a: 'Steve Jobs' },
  { q: 'Programs must be written for people to read.', a: 'Harold Abelson' },
  { q: 'Debugging is twice as hard as writing the code in the first place.', a: 'Brian Kernighan' },
  { q: 'Code is like humor. When you have to explain it, it\'s bad.', a: 'Cory House' },
  { q: 'Consistency is the key to mastery.', a: 'Robin Sharma' },
  { q: 'Every expert was once a beginner.', a: 'Helen Hayes' },
  { q: 'Automate what you can. Focus on what matters.', a: 'DevOps Wisdom' },
];

function todayIndex(): number {
  const d = new Date();
  return (d.getFullYear() * 366 + d.getMonth() * 31 + d.getDate()) % FALLBACK_QUOTES.length;
}

export async function getQuote(): Promise<{ quote: string; author: string }> {
  const daily = await getDaily();
  if (daily?.date === todayString() && daily.quote) {
    return { quote: daily.quote, author: daily.quoteAuthor };
  }

  try {
    const res = await fetch('https://api.quotable.io/random?tags=inspirational,technology,success&maxLength=140');
    if (res.ok) {
      const data = await res.json() as { content: string; author: string };
      await saveDaily({ quote: data.content, quoteAuthor: data.author });
      return { quote: data.content, author: data.author };
    }
  } catch { /* fall through */ }

  const fallback = FALLBACK_QUOTES[todayIndex()];
  await saveDaily({ quote: fallback.q, quoteAuthor: fallback.a });
  return { quote: fallback.q, author: fallback.a };
}
