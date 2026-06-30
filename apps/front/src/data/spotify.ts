import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';

export interface SpotifyPlaylist {
  uri: string;
  name: string;
}

export function useSpotifyPlaylists(enabled: boolean) {
  return useQuery({
    queryKey: ['spotify', 'playlists'],
    queryFn: () =>
      apiGet<{ playlists: SpotifyPlaylist[] }>('/api/integrations/spotify/playlists').then(
        (r) => r.playlists,
      ),
    enabled,
    retry: false,
  });
}
