import { Text } from '@moonshot-ai/pi-tui';
import { describe, expect, it } from 'vitest';

import { ToolCallComponent } from '#/tui/components/messages/tool-call';
import { ToolRenderDefinitionRegistry } from '#/tui/components/messages/tool-renderers/registry';
import type { ToolRenderDefinition } from '#/tui/components/messages/tool-renderers/types';
import type { ToolCallBlockData, ToolResultBlockData } from '#/tui/types';

function strip(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

function call(name: string, args: Record<string, unknown> = {}): ToolCallBlockData {
  return { id: `call_${name}`, name, args };
}

function result(output: string, isError = false): ToolResultBlockData {
  return { tool_call_id: 'call_Custom', output, is_error: isError };
}

describe('tool-owned transcript rendering', () => {
  it('lets a self-rendering definition own the call and result shell', () => {
    const calls: string[] = [];
    const definition: ToolRenderDefinition = {
      name: 'Custom',
      renderShell: 'self',
      renderCall: (args, theme, context) => {
        calls.push(`call:${String(context.args['value'])}:${String(context.argsComplete)}`);
        return new Text(theme.boldFg('primary', `Custom call: ${String(args['value'])}`), 0, 0);
      },
      renderResult: (toolResult, options, theme, context) => {
        calls.push(`result:${String(options.expanded)}:${String(context.isError)}`);
        return new Text(
          theme.fg('success', `Custom result: ${toolResult.output}`),
          0,
          0,
        );
      },
    };

    const component = new ToolCallComponent(
      call('Custom', { value: 'alpha' }),
      undefined,
      undefined,
      undefined,
      definition,
    );

    const pending = strip(component.render(100).join('\n'));
    expect(pending).toContain('Custom call: alpha');
    expect(pending).not.toContain('Using Custom');

    component.setResult(result('done'));
    const completed = strip(component.render(100).join('\n'));
    expect(completed).toContain('Custom call: alpha');
    expect(completed).toContain('Custom result: done');
    expect(completed).not.toContain('Used Custom');
    expect(calls).toEqual(['call:alpha:true', 'call:alpha:true', 'result:false:false']);
  });

  it('passes streamed progress to result renderers as partial output', () => {
    const partials: Array<{ output: string; isPartial: boolean }> = [];
    const definition: ToolRenderDefinition = {
      name: 'StreamingCustom',
      renderShell: 'self',
      renderCall: () => new Text('streaming call', 0, 0),
      renderResult: (toolResult, options) => {
        partials.push({ output: toolResult.output, isPartial: options.isPartial });
        return new Text(`streaming result: ${toolResult.output}`, 0, 0);
      },
    };

    const component = new ToolCallComponent(
      call('StreamingCustom'),
      undefined,
      undefined,
      undefined,
      definition,
    );
    component.appendProgress('waiting');
    expect(strip(component.render(100).join('\n'))).toContain('streaming result: waiting');

    component.appendLiveOutput('done');
    const streamed = strip(component.render(100).join('\n'));
    expect(streamed).toContain('streaming result: waiting');
    expect(streamed).toContain('done');

    component.setResult(result('final'));
    expect(partials).toEqual([
      { output: 'waiting', isPartial: true },
      { output: 'waiting\ndone', isPartial: true },
      { output: 'final', isPartial: false },
    ]);
  });

  it('passes ordered partial update metadata and custom details to renderers', () => {
    const partials: Array<{
      details: unknown;
      updates: readonly unknown[] | undefined;
    }> = [];
    const definition: ToolRenderDefinition = {
      name: 'MetadataPartial',
      renderShell: 'self',
      renderResult: (toolResult, options) => {
        if (options.isPartial) {
          partials.push({ details: toolResult.details, updates: options.partialUpdates });
        }
        return new Text(toolResult.output, 0, 0);
      },
    };
    const component = new ToolCallComponent(
      call('MetadataPartial'),
      undefined,
      undefined,
      undefined,
      definition,
    );

    component.appendLiveOutput('chunk', {
      kind: 'stdout',
      text: 'chunk',
      percent: 25,
    });
    component.appendPartialUpdate({
      kind: 'custom',
      customKind: 'phase',
      customData: { phase: 'waiting' },
    });

    expect(partials.at(-1)).toEqual({
      details: { phase: 'waiting' },
      updates: [
        { kind: 'stdout', text: 'chunk', percent: 25 },
        { kind: 'custom', customKind: 'phase', customData: { phase: 'waiting' } },
      ],
    });
  });

  it('gives self-renderers a rich built-in call preview when renderCall is omitted', () => {
    const component = new ToolCallComponent(
      call('Read', { path: 'src/index.ts' }),
      undefined,
      undefined,
      undefined,
      { name: 'Read', renderShell: 'self' },
    );

    const output = strip(component.render(100).join('\\n'));
    expect(output).toContain('Read (src/index.ts)');
    expect(output).not.toContain('Using Read');

    const write = new ToolCallComponent(
      call('Write', { path: 'src/index.ts', content: 'const value = 1;' }),
      undefined,
      undefined,
      undefined,
      { name: 'Write', renderShell: 'self' },
    );
    expect(strip(write.render(100).join('\n'))).toContain('const value = 1;');
  });

  it('preserves structured result details for custom renderers', () => {
    const details: unknown[] = [];
    const definition: ToolRenderDefinition = {
      name: 'Detailed',
      renderShell: 'self',
      renderCall: () => new Text('detailed call', 0, 0),
      renderResult: (toolResult) => {
        details.push(toolResult.details);
        return new Text('detailed result', 0, 0);
      },
    };
    const component = new ToolCallComponent(
      call('Detailed'),
      undefined,
      undefined,
      undefined,
      definition,
    );

    component.setResult({
      tool_call_id: 'call_Detailed',
      output: 'visible output',
      details: { kind: 'structured', rows: [1, 2] },
    });
    component.render(100);

    expect(details.at(-1)).toEqual({ kind: 'structured', rows: [1, 2] });
  });

  it('keeps progress and live output in arrival order for custom renderers', () => {
    const partials: string[] = [];
    const definition: ToolRenderDefinition = {
      name: 'OrderedPartial',
      renderShell: 'self',
      renderResult: (toolResult) => {
        partials.push(toolResult.output);
        return new Text(toolResult.output, 0, 0);
      },
    };
    const component = new ToolCallComponent(
      call('OrderedPartial'),
      undefined,
      undefined,
      undefined,
      definition,
    );

    component.appendLiveOutput('first');
    component.appendProgress('status');
    component.appendLiveOutput('last');

    expect(partials.at(-1)).toBe('first\nstatus\nlast');
  });

  it('keeps startup definitions ahead of later registration and isolates registries', () => {
    const startup = { name: 'PriorityTool', renderCall: () => new Text('startup', 0, 0) };
    const registry = new ToolRenderDefinitionRegistry([startup]);
    const dispose = registry.register({
      name: 'PriorityTool',
      renderCall: () => new Text('runtime', 0, 0),
    });
    const other = new ToolRenderDefinitionRegistry();

    expect(registry.resolve('PriorityTool')).toBe(startup);
    expect(other.resolve('PriorityTool')).toBeUndefined();
    dispose();
    expect(registry.resolve('PriorityTool')).toBe(startup);
  });

  it('supports runtime replacement and ignores empty tool names', () => {
    const registry = new ToolRenderDefinitionRegistry();
    const emptyDispose = registry.register({
      name: '',
      renderCall: () => new Text('should not render', 0, 0),
    });
    expect(registry.resolve('')).toBeUndefined();

    const first: ToolRenderDefinition = {
      name: 'RuntimeTool',
      renderCall: () => new Text('first', 0, 0),
    };
    const disposeFirst = registry.register(first);
    expect(registry.resolve('RuntimeTool')).toBe(first);

    const replacement: ToolRenderDefinition = {
      name: 'RuntimeTool',
      renderCall: () => new Text('replacement', 0, 0),
    };
    const disposeReplacement = registry.register(replacement);
    expect(registry.resolve('RuntimeTool')).toBe(replacement);
    disposeReplacement();
    expect(registry.resolve('RuntimeTool')).toBe(first);
    disposeFirst();
    expect(registry.resolve('RuntimeTool')).toBeUndefined();

    const startup: ToolRenderDefinition = {
      name: 'RuntimeTool',
      renderCall: () => new Text('startup', 0, 0),
    };
    registry.replace([startup]);
    expect(registry.resolve('RuntimeTool')).toBe(startup);
    expect(registry.unregister('RuntimeTool')).toBe(true);
    expect(registry.resolve('RuntimeTool')).toBeUndefined();
    expect(registry.unregister('RuntimeTool')).toBe(false);

    emptyDispose();
  });

  it('keeps the existing shell when renderShell is omitted', () => {
    const definition: ToolRenderDefinition = {
      name: 'DefaultShell',
      renderCall: () => new Text('custom call body', 0, 0),
      renderResult: () => new Text('custom result body', 0, 0),
    };

    const component = new ToolCallComponent(
      call('DefaultShell'),
      result('ignored by custom renderer'),
      undefined,
      undefined,
      definition,
    );
    const output = strip(component.render(100).join('\n'));

    expect(output).toContain('Used DefaultShell');
    expect(output).toContain('custom call body');
    expect(output).toContain('custom result body');
    expect(output).not.toContain('ignored by custom renderer');
  });

  it('passes the previous component and shared state back to renderers', () => {
    const previous: unknown[] = [];
    const definition: ToolRenderDefinition = {
      name: 'Stateful',
      renderShell: 'self',
      renderCall: (_args, _theme, context) => {
        previous.push(context.lastComponent);
        const state = context.state as { count?: number };
        state.count = (state.count ?? 0) + 1;
        return context.lastComponent ?? new Text(`render ${String(state.count)}`, 0, 0);
      },
    };

    const component = new ToolCallComponent(
      call('Stateful', { value: 1 }),
      undefined,
      undefined,
      undefined,
      definition,
    );
    const first = strip(component.render(100).join('\n'));
    component.updateToolCall(call('Stateful', { value: 2 }));
    const second = strip(component.render(100).join('\n'));

    expect(first).toContain('render 1');
    expect(second).toContain('render 1');
    expect(previous[0]).toBeUndefined();
    expect(previous[1]).toBeDefined();
  });

  it('falls back safely when self renderers throw', () => {
    const definition: ToolRenderDefinition = {
      name: 'Broken',
      renderShell: 'self',
      renderCall: () => {
        throw new Error('call renderer failed');
      },
      renderResult: () => {
        throw new Error('result renderer failed');
      },
    };

    const component = new ToolCallComponent(
      call('Broken'),
      result('fallback output'),
      undefined,
      undefined,
      definition,
    );

    const output = strip(component.render(100).join('\n'));
    expect(output).toContain('Broken');
    expect(output).toContain('fallback output');
    expect(output).not.toContain('renderer failed');
  });

  it('uses supplied registry definitions without changing unregistered tool rendering', () => {
    const registry = new ToolRenderDefinitionRegistry();
    const dispose = registry.register({
      name: 'RegisteredTool',
      renderShell: 'self',
      renderCall: () => new Text('registered call', 0, 0),
    });

    try {
      const registered = new ToolCallComponent(
        call('RegisteredTool'),
        undefined,
        undefined,
        registry,
      );
      expect(strip(registered.render(100).join('\n'))).toContain('registered call');

      dispose();
      const ordinary = new ToolCallComponent(call('RegisteredTool'), result('ordinary output'));
      const output = strip(ordinary.render(100).join('\n'));
      expect(output).toContain('Used RegisteredTool');
      expect(output).toContain('ordinary output');
    } finally {
      dispose();
    }
  });
});
