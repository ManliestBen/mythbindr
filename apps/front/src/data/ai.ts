import { useMutation } from '@tanstack/react-query';
import { apiPost } from '../lib/api';

export interface GeneratedElement {
  name: string;
  body: string;
  secrets: string;
  tags: string[];
}

export function useGenerateElement(cid: string) {
  return useMutation({
    mutationFn: (v: { type: string; prompt: string }) =>
      apiPost<{ element: GeneratedElement }>(`/api/campaigns/${cid}/ai/element`, v).then(
        (r) => r.element,
      ),
  });
}

export function useGenerateCampaign() {
  return useMutation({
    mutationFn: (prompt: string) =>
      apiPost<{ campaign: { id: string; name: string }; elementCount: number }>(
        '/api/ai/campaign',
        { prompt },
      ),
  });
}

export function useRefine(cid: string) {
  return useMutation({
    mutationFn: (v: { text: string; action: string }) =>
      apiPost<{ text: string }>(`/api/campaigns/${cid}/ai/refine`, v).then((r) => r.text),
  });
}
