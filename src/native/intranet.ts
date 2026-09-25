/** Build-time configuration overlay. No Harness executable code is changed. */
import { load, dump, DEFAULT_SCHEMA, Type } from 'js-yaml';

/** Keep Cordis expressions as tagged data; never evaluate them during packaging. */
class Expression {
  constructor(readonly value: string) {}
}
const schema = DEFAULT_SCHEMA.extend(new Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (value: unknown) => typeof value === 'string',
  construct: (value: string) => new Expression(value),
  instanceOf: Expression,
  // js-yaml calls represent only after the instanceOf check above.
  represent: (value: object) => (value as Expression).value,
}));

export function readCordisConfiguration(source: string): unknown {
  return load(source, { schema });
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reject changed upstream shapes instead of silently shipping enabled search. */
export function disableWebSearch(source: string, kind: 'base' | 'preset'): string {
  const document = readCordisConfiguration(source);
  if (!Array.isArray(document)) throw new Error('Expected Cordis row array');
  let tools = 0;
  let providers = 0;
  function visit(rows: unknown[]): void {
    for (const value of rows) {
      if (!object(value)) throw new Error('Expected Cordis row object');
      if (Array.isArray(value.insert)) visit(value.insert);
      if (value.name === '@deepseek-ai/dsh-agent-preset') {
        if (!object(value.config) || !Array.isArray(value.config.plugins)) throw new Error('Unexpected preset declaration');
        visit(value.config.plugins);
      }
      if (value.id === 'tool-web') {
        if (value.name !== '@deepseek-ai/dsh-tool-web' || !object(value.config)) {
          throw new Error('Unexpected tool-web configuration');
        }
        value.config.search = false;
        tools++;
      }
      if (value.id === 'web-search-deepseek') {
        if (value.name !== '@deepseek-ai/dsh-web-search-deepseek') {
          throw new Error('Unexpected search provider');
        }
        value.disabled = true;
        providers++;
      }
    }
  }
  visit(document);
  if (tools !== 1 || providers !== (kind === 'base' ? 1 : 0)) {
    throw new Error('Upstream web-search rows changed; review the pinned configuration');
  }
  return dump(document, { schema, lineWidth: -1, noRefs: true, sortKeys: false });
}
