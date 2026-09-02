import type { ToolCall } from '#/kosong/contract/message';
import type { Tool as KosongTool } from '#/kosong/contract/tool';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMcpTool } from '#/agent/mcp/tools/mcp';
import { IAgentProfileService } from '#/agent/profile/profile';
import { IAgentToolRegistryService } from '#/agent/toolRegistry/toolRegistry';
import type { MCPClient } from '#/mcpCore/types';

import {
  createTestAgent,
  permissionModeServices,
  type TestAgentContext,
} from '../../harness';

describe('structured tool result agent-loop e2e', () => {
  let ctx: TestAgentContext;

  beforeEach(() => {
    ctx = createTestAgent(permissionModeServices('yolo'));
  });

  afterEach(async () => {
    try {
      await ctx.expectResumeMatches();
    } finally {
      await ctx.dispose();
    }
  });

  it('carries MCP structuredContent through execution, wire persistence, replay, and model projection', async () => {
    const details = {
      kind: 'rows',
      rows: [{ id: 1, label: 'Moon' }],
    };
    const expectedOutput =
      'structured lookup output\n' +
      '<mcp-structured-result>\n' +
      '{"structuredContent":{"kind":"rows","rows":[{"id":1,"label":"Moon"}]}}' +
      '\n</mcp-structured-result>';
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client: MCPClient = {
      async listTools() {
        return [];
      },
      async callTool(name, args) {
        calls.push({ name, args });
        return {
          content: [{ type: 'text', text: 'structured lookup output' }],
          isError: false,
          structuredContent: details,
        };
      },
      async ping() {},
    };
    const definition: KosongTool = {
      name: 'lookup',
      description: 'Looks up rows.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    };
    const tool = createMcpTool('mcp__demo__lookup', definition, client);
    ctx.get(IAgentToolRegistryService).register(tool, { source: 'mcp' });
    ctx.get(IAgentProfileService).update({ activeToolNames: [tool.name] });

    const toolCall: ToolCall = {
      type: 'function',
      id: 'call-details',
      name: tool.name,
      arguments: JSON.stringify({ query: 'moon' }),
    };
    ctx.mockNextResponse({ type: 'text', text: 'Checking.' }, toolCall);
    ctx.mockNextResponse({ type: 'text', text: 'Found it.' });

    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'Find the moon.' }] });
    await ctx.untilTurnEnd();

    expect(calls).toEqual([{ name: 'lookup', args: { query: 'moon' } }]);

    const emitted = ctx.allEvents.find(
      (entry) => entry.type === '[rpc]' && entry.event === 'tool.result',
    );
    expect(emitted?.args).toMatchObject({
      toolCallId: 'call-details',
      details,
    });
    expect(
      (emitted?.args as { output?: unknown } | undefined)?.output,
    ).toEqual(expectedOutput);

    const wireRecord = (await ctx.persistedWireRecords()).find(
      (entry) =>
        entry.type === 'context.append_loop_event' &&
        (entry['event'] as { type?: unknown } | undefined)?.type === 'tool.result',
    );
    expect(wireRecord?.['event']).toMatchObject({
      result: { details },
    });
    expect(
      (
        wireRecord?.['event'] as
          | { result?: { output?: unknown } }
          | undefined
      )?.result?.output,
    ).toEqual(expectedOutput);

    const replayedToolMessage = ctx.contextData().history.find((message) => message.role === 'tool');
    expect(replayedToolMessage).toMatchObject({
      toolCallId: 'call-details',
      details,
      content: [{ type: 'text', text: expectedOutput }],
    });

    const llmInputs = ctx.llmInputs();
    const projectedToolMessage = llmInputs.inputs.at(-1)?.history.find(
      (message) => message.role === 'tool',
    );
    expect(projectedToolMessage).toMatchObject({
      role: 'tool',
      content: [{ type: 'text', text: expectedOutput }],
    });
    expect(projectedToolMessage).not.toHaveProperty('details');

    // Keep the cold rebuild assertion visible at the test site rather than
    // relying only on the shared afterEach check.
    await ctx.expectResumeMatches();
  });
});
