import { describe, expect, it } from 'vitest';
import { load } from 'js-yaml';
import { disableWebSearch, readCordisConfiguration } from '../src/native/intranet.js';

const tool = { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web', config: { fetch: true, searchTimeoutMs: 60000 } };
const provider = { id: 'web-search-deepseek', name: '@deepseek-ai/dsh-web-search-deepseek', config: { apiKeyEnv: 'DEEPSEEK_API_KEY' } };

describe('native Desktop intranet defaults', () => {
  it('disables search in base while preserving fetch and provider configuration', () => {
    const rows = [{ insert: [tool, provider, { id: 'unrelated', config: { enabled: true } }] }];
    const result = disableWebSearch(JSON.stringify(rows), 'base');
    expect(load(result)).toEqual([{ insert: [
      { ...tool, config: { ...tool.config, search: false } },
      { ...provider, disabled: true },
      { id: 'unrelated', config: { enabled: true } },
    ] }]);
    expect(disableWebSearch(result, 'base')).toBe(result);
  });
  it('disables the model-visible search tool in every tool-bearing preset', () => {
    const result = disableWebSearch(JSON.stringify([tool]), 'preset');
    expect(load(result)).toEqual([{ ...tool, config: { ...tool.config, search: false } }]);
  });
  it('handles 0.1.7 declarative presets without changing unrelated plugin configuration', () => {
    const rows = [{ insert: [{ id: 'preset-standard', name: '@deepseek-ai/dsh-agent-preset', config: {
      id: 'standard', order: 1, plugins: [tool, { id: 'other', config: { search: true } }],
    } }] }];
    const output = disableWebSearch(JSON.stringify(rows), 'preset');
    const value = load(output) as typeof rows;
    expect(value[0]?.insert[0]?.config.plugins).toEqual([
      { ...tool, config: { ...tool.config, search: false } }, { id: 'other', config: { search: true } },
    ]);
    expect(disableWebSearch(output, 'preset')).toBe(output);
    expect(() => disableWebSearch('[{"name":"@deepseek-ai/dsh-agent-preset","config":{}}]', 'preset')).toThrow('preset declaration');
  });
  it('preserves unevaluated Cordis expressions and rejects empty expression tags', () => {
    const source = '- id: shell\n  disabled: !!js process.platform !== "win32"\n- id: tool-web\n  name: "@deepseek-ai/dsh-tool-web"\n  config:\n    fetch: true\n';
    const before = readCordisConfiguration(source) as unknown[];
    const output = disableWebSearch(source, 'preset');
    expect(output).toContain('!!js');
    expect((readCordisConfiguration(output) as unknown[])[0]).toEqual(before[0]);
    expect(() => readCordisConfiguration('- !!js')).toThrow();
  });
  it.each(['null', '{}', '[null]', '[1]', '[[]]'])('rejects malformed rows: %s', source => {
    expect(() => disableWebSearch(source, 'base')).toThrow('Expected Cordis');
  });
  it.each([
    [{ ...tool, name: 'other' }], [{ ...tool, config: null }], [{ ...tool, config: [] }],
    [{ ...provider, name: 'other' }], [], [tool, tool], [tool, provider, provider],
  ].map(rows => ({ rows })))('rejects missing, duplicate or renamed upstream seams: $rows', ({ rows }) => {
    expect(() => disableWebSearch(JSON.stringify(rows), 'base')).toThrow();
  });
});
