import { Text } from '@moonshot-ai/pi-tui';
import { afterEach, describe, expect, it } from 'vitest';

import { ToolCallComponent } from '#/tui/components/messages/tool-call';
import {
  registerToolRenderDefinition,
  unregisterToolRenderDefinition,
} from '#/tui/components/messages/tool-renderers/registry';
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
  afterEach(() => {
    // The registry is process-wide for direct component consumers. Tests use
    // unique names, but unregistering makes failures and retries isolated.
    unregisterToolRenderDefinition('RegisteredTool');
  });

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

  it('uses registered definitions without changing unregistered tool rendering', () => {
    const dispose = registerToolRenderDefinition({
      name: 'RegisteredTool',
      renderShell: 'self',
      renderCall: () => new Text('registered call', 0, 0),
    });

    try {
      const registered = new ToolCallComponent(call('RegisteredTool'), undefined);
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
