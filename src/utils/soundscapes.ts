export interface Soundscape {
  id: string;
  label: string;
  emoji: string;
  // Free ambient audio from pixabay (royalty-free, no API key)
  url: string;
}

export const SOUNDSCAPES: Soundscape[] = [
  {
    id: 'rain',
    label: 'Rain',
    emoji: '🌧️',
    url: 'https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3',
  },
  {
    id: 'river',
    label: 'River',
    emoji: '🏞️',
    url: 'https://cdn.pixabay.com/audio/2022/03/15/audio_d9e9967e18.mp3',
  },
  {
    id: 'forest',
    label: 'Forest',
    emoji: '🌲',
    url: 'https://cdn.pixabay.com/audio/2021/09/06/audio_1e24a94f5b.mp3',
  },
  {
    id: 'birds',
    label: 'Birds',
    emoji: '🐦',
    url: 'https://cdn.pixabay.com/audio/2021/10/19/audio_0e73ab5683.mp3',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    emoji: '🌊',
    url: 'https://cdn.pixabay.com/audio/2022/03/24/audio_946bc9248b.mp3',
  },
  {
    id: 'thunder',
    label: 'Storm',
    emoji: '⛈️',
    url: 'https://cdn.pixabay.com/audio/2022/07/29/audio_e20c5da79d.mp3',
  },
  {
    id: 'fire',
    label: 'Fireplace',
    emoji: '🔥',
    url: 'https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3',
  },
  {
    id: 'cafe',
    label: 'Café',
    emoji: '☕',
    url: 'https://cdn.pixabay.com/audio/2022/08/23/audio_d16737dc28.mp3',
  },
];
