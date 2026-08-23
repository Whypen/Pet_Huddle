import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const roots = [path.resolve(__dirname, '..'), path.resolve(__dirname, '../../../src')];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx']);

function sourceFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return extensions.has(path.extname(entry.name)) && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

describe('realtime subscription scope regression contract', () => {
  it('never opens an application postgres_changes listener without a filter', () => {
    const violations: string[] = [];
    for (const file of roots.flatMap(sourceFiles)) {
      const source = fs.readFileSync(file, 'utf8');
      const listener = /\.on\(\s*["']postgres_changes["']\s*,\s*\{([\s\S]*?)\}\s*,/g;
      for (const match of source.matchAll(listener)) {
        if (!/\bfilter\s*:/.test(match[1])) {
          violations.push(`${path.relative(path.resolve(__dirname, '../../..'), file)}:${source.slice(0, match.index).split('\n').length}`);
        }
      }
    }
    expect(violations).toEqual([]);
  }, 15_000);

  it('keeps sensitive Broadcast channels private through the shared constructor', () => {
    const manager = fs.readFileSync(path.resolve(__dirname, './realtimeChannelManager.ts'), 'utf8');
    expect(manager).toMatch(/\.channel\(topic, \{ config: \{ private: true \} \}\)/);
    expect(manager).toContain('sharedBroadcastChannels.get(topic)');
    expect(manager).toContain('ownedEntry.callbacks.size > 0');
    expect(manager).not.toContain('supabase.channel(topic).on("broadcast"');
  });
});
