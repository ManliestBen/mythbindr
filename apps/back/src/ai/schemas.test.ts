import { describe, expect, it } from 'vitest';
import { aiCampaignSchema, aiElementSchema, aiRefineSchema } from './schemas';

describe('aiElementSchema', () => {
  it('accepts a valid payload', () => {
    const result = aiElementSchema.safeParse({ type: 'npc', prompt: 'A grumpy blacksmith' });
    expect(result.success).toBe(true);
  });

  it('rejects an over-length prompt (>2000)', () => {
    const result = aiElementSchema.safeParse({ type: 'npc', prompt: 'a'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only prompt', () => {
    const result = aiElementSchema.safeParse({ type: 'npc', prompt: '   ' });
    expect(result.success).toBe(false);
  });
});

describe('aiRefineSchema', () => {
  it('accepts a valid payload', () => {
    const result = aiRefineSchema.safeParse({ text: 'Some text', action: 'shorten' });
    expect(result.success).toBe(true);
  });

  it('rejects an over-length text (>20000)', () => {
    const result = aiRefineSchema.safeParse({ text: 'a'.repeat(20_001), action: 'shorten' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty action', () => {
    const result = aiRefineSchema.safeParse({ text: 'Some text', action: '' });
    expect(result.success).toBe(false);
  });
});

describe('aiCampaignSchema', () => {
  it('accepts a valid payload', () => {
    const result = aiCampaignSchema.safeParse({ prompt: 'A haunted seaside village' });
    expect(result.success).toBe(true);
  });

  it('rejects an over-length prompt (>2000)', () => {
    const result = aiCampaignSchema.safeParse({ prompt: 'a'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only prompt', () => {
    const result = aiCampaignSchema.safeParse({ prompt: '   ' });
    expect(result.success).toBe(false);
  });
});
