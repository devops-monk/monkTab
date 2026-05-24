export interface PullRequest {
  id: number;
  title: string;
  url: string;
  repo: string;
  updatedAt: string;
  draft: boolean;
}

export async function fetchOpenPRs(username: string, token: string): Promise<PullRequest[]> {
  if (!username) return [];

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const query = `is:open is:pr author:${username} archived:false`;
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=10&sort=updated`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

  const data = await res.json() as {
    items: {
      id: number;
      title: string;
      html_url: string;
      repository_url: string;
      updated_at: string;
      draft?: boolean;
    }[];
  };

  return data.items.map((item) => ({
    id: item.id,
    title: item.title,
    url: item.html_url,
    repo: item.repository_url.split('/').slice(-2).join('/'),
    updatedAt: item.updated_at,
    draft: item.draft ?? false,
  }));
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
