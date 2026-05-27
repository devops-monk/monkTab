import { getDaily, saveDaily, todayString } from './storage';

const MOTIVATION_QUOTES = [
  { q: 'The best way to get started is to quit talking and begin doing.', a: 'Walt Disney' },
  { q: 'Small steps every day lead to big change.', a: 'Unknown' },
  { q: 'The only way to do great work is to love what you do.', a: 'Steve Jobs' },
  { q: 'Consistency is the key to mastery.', a: 'Robin Sharma' },
  { q: 'Every expert was once a beginner.', a: 'Helen Hayes' },
  { q: 'Do one thing every day that scares you.', a: 'Eleanor Roosevelt' },
  { q: 'It always seems impossible until it\'s done.', a: 'Nelson Mandela' },
  { q: 'The secret of getting ahead is getting started.', a: 'Mark Twain' },
  { q: 'Don\'t watch the clock; do what it does. Keep going.', a: 'Sam Levenson' },
  { q: 'Success usually comes to those who are too busy to be looking for it.', a: 'Henry David Thoreau' },
  { q: 'I find that the harder I work, the more luck I seem to have.', a: 'Thomas Jefferson' },
  { q: 'The future belongs to those who believe in the beauty of their dreams.', a: 'Eleanor Roosevelt' },
];

const STOIC_QUOTES = [
  { q: 'You have power over your mind, not outside events. Realize this, and you will find strength.', a: 'Marcus Aurelius' },
  { q: 'Waste no more time arguing what a good man should be. Be one.', a: 'Marcus Aurelius' },
  { q: 'He who fears death will never do anything worthy of a man who is alive.', a: 'Seneca' },
  { q: 'Wealth consists not in having great possessions, but in having few wants.', a: 'Epictetus' },
  { q: 'The obstacle is the way.', a: 'Marcus Aurelius' },
  { q: 'Confine yourself to the present.', a: 'Marcus Aurelius' },
  { q: 'Difficulties strengthen the mind, as labor does the body.', a: 'Seneca' },
  { q: 'We suffer more in imagination than in reality.', a: 'Seneca' },
  { q: 'Begin at once to live, and count each separate day as a separate life.', a: 'Seneca' },
  { q: 'Make the best use of what is in your power, and take the rest as it happens.', a: 'Epictetus' },
  { q: 'No man is free who is not master of himself.', a: 'Epictetus' },
  { q: 'He is a wise man who does not grieve for the things which he has not, but rejoices for those which he has.', a: 'Epictetus' },
];

const TECH_QUOTES = [
  { q: 'First, solve the problem. Then, write the code.', a: 'John Johnson' },
  { q: 'Simplicity is the soul of efficiency.', a: 'Austin Freeman' },
  { q: 'Make it work, make it right, make it fast.', a: 'Kent Beck' },
  { q: 'Programs must be written for people to read.', a: 'Harold Abelson' },
  { q: 'Debugging is twice as hard as writing the code in the first place.', a: 'Brian Kernighan' },
  { q: 'Code is like humor. When you have to explain it, it\'s bad.', a: 'Cory House' },
  { q: 'Automate what you can. Focus on what matters.', a: 'DevOps Wisdom' },
  { q: 'The best code is no code at all.', a: 'Jeff Atwood' },
  { q: 'Any fool can write code that a computer can understand. Good programmers write code that humans can understand.', a: 'Martin Fowler' },
  { q: 'Software is eating the world.', a: 'Marc Andreessen' },
  { q: 'The function of good software is to make the complex appear to be simple.', a: 'Grady Booch' },
  { q: 'Without requirements or design, programming is the art of adding bugs to an empty text file.', a: 'Louis Srygley' },
];

const RANDOM_QUOTES = [...MOTIVATION_QUOTES, ...STOIC_QUOTES, ...TECH_QUOTES];

const QUOTE_POOLS: Record<string, typeof RANDOM_QUOTES> = {
  motivation: MOTIVATION_QUOTES,
  stoic: STOIC_QUOTES,
  tech: TECH_QUOTES,
  random: RANDOM_QUOTES,
};

function todayIndexFor(pool: typeof RANDOM_QUOTES): number {
  const d = new Date();
  return (d.getFullYear() * 366 + d.getMonth() * 31 + d.getDate()) % pool.length;
}

export function getRandomQuote(category?: string): { quote: string; author: string } {
  const pool = QUOTE_POOLS[category ?? 'random'] ?? RANDOM_QUOTES;
  const idx = Math.floor(Math.random() * pool.length);
  return { quote: pool[idx].q, author: pool[idx].a };
}

const CATEGORY_API_TAGS: Record<string, string> = {
  motivation: 'inspirational,success,motivational',
  stoic: 'philosophy,stoicism,wisdom',
  tech: 'technology,science,innovation',
  random: 'inspirational,technology,success',
};

export async function getQuote(category = 'motivation'): Promise<{ quote: string; author: string }> {
  const daily = await getDaily();
  const cached = daily as (typeof daily & { quoteCategory?: string }) | null;
  if (cached?.date === todayString() && cached.quote && cached.quoteCategory === category) {
    return { quote: cached.quote, author: cached.quoteAuthor };
  }

  try {
    const tags = CATEGORY_API_TAGS[category] ?? CATEGORY_API_TAGS['motivation'];
    const res = await fetch(`https://api.quotable.io/random?tags=${tags}&maxLength=160`);
    if (res.ok) {
      const data = await res.json() as { content: string; author: string };
      await saveDaily({ quote: data.content, quoteAuthor: data.author });
      return { quote: data.content, author: data.author };
    }
  } catch { /* fall through */ }

  const pool = QUOTE_POOLS[category] ?? MOTIVATION_QUOTES;
  const fallback = pool[todayIndexFor(pool)];
  await saveDaily({ quote: fallback.q, quoteAuthor: fallback.a });
  return { quote: fallback.q, author: fallback.a };
}
