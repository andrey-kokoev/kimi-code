import { getCoreVersion } from '#/version';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { MCPToolDefinition, MCPToolResult } from './types';

export const KIMI_MCP_CLIENT_NAME = 'kimi-code';
// Resolved from agent-core's package.json so MCP servers see the real version
// in `initialize` (used for compatibility checks, telemetry, debugging).
// `getCoreVersion()` falls back to '0.0.0' if the package.json read fails.
export const KIMI_MCP_CLIENT_VERSION = getCoreVersion();
export const MODERN_MCP_PROTOCOL_VERSION = '2026-07-28';

const ModernDiscoveryResultSchema = z.object({
  resultType: z.string(),
  supportedVersions: z.array(z.string()),
  capabilities: z.record(z.string(), z.unknown()),
  serverInfo: z.object({ name: z.string(), version: z.string() }).optional(),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

export async function connectModernStdioClient(
  client: Client,
  transport: Transport,
  options: McpRequestOptions | undefined,
): Promise<void> {
  const originalSend = transport.send.bind(transport);
  transport.send = async (message, sendOptions) => {
    let outgoing = message;
    if ('method' in message && 'id' in message) {
      const params =
        typeof message.params === 'object' && message.params !== null && !Array.isArray(message.params)
          ? message.params
          : {};
      const existingMeta =
        typeof params._meta === 'object' && params._meta !== null && !Array.isArray(params._meta)
          ? params._meta
          : {};
      outgoing = {
        ...message,
        params: {
          ...params,
          _meta: {
            ...existingMeta,
            'io.modelcontextprotocol/protocolVersion': MODERN_MCP_PROTOCOL_VERSION,
            'io.modelcontextprotocol/clientInfo': {
              name: KIMI_MCP_CLIENT_NAME,
              version: KIMI_MCP_CLIENT_VERSION,
            },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      } as JSONRPCMessage;
    }
    await originalSend(outgoing, sendOptions);
  };

  const previousSessionId = transport.sessionId;
  transport.sessionId = 'mcp-2026-handshake-free';
  try {
    await client.connect(transport, options);
  } finally {
    transport.sessionId = previousSessionId;
  }

  const discovery = await client.request(
    { method: 'server/discover', params: {} },
    ModernDiscoveryResultSchema,
    options,
  );
  if (!discovery.supportedVersions.includes(MODERN_MCP_PROTOCOL_VERSION)) {
    await client.close();
    throw new Error(`Server does not support MCP ${MODERN_MCP_PROTOCOL_VERSION}`);
  }
  const state = client as unknown as {
    _serverCapabilities?: Record<string, unknown>;
    _serverVersion?: { name: string; version: string };
  };
  state._serverCapabilities = discovery.capabilities;
  state._serverVersion = discovery.serverInfo;
  transport.setProtocolVersion?.(MODERN_MCP_PROTOCOL_VERSION);
}

/**
 * Why-context attached when a runtime client notices its underlying transport
 * has gone away on its own — i.e. {@link RuntimeMcpClient.close} was NOT
 * called. The connection manager turns this into a `failed` status so the
 * UI/SDK do not keep advertising tools backed by a dead transport.
 *
 * - `error` is the last error reported via the SDK's `onerror` channel, if
 *   any. Useful for HTTP where there is no stderr.
 * - `stderr` is the tail of bytes captured from the child process's stderr;
 *   populated only for the stdio transport.
 */
export interface UnexpectedCloseReason {
  readonly error?: Error;
  readonly stderr?: string;
}

export type UnexpectedCloseListener = (reason: UnexpectedCloseReason) => void;

export interface McpRequestOptions {
  readonly timeout?: number;
  readonly signal?: AbortSignal;
}

/**
 * Build the `RequestOptions` object accepted by MCP SDK requests, including
 * either a configured timeout, an in-flight abort signal, both, or neither.
 * Returns `undefined` when nothing needs to be passed so the SDK falls back
 * to its defaults.
 */
export function buildRequestOptions(
  timeoutMs: number | undefined,
  signal: AbortSignal | undefined,
): McpRequestOptions | undefined {
  if (timeoutMs === undefined && signal === undefined) return undefined;
  return { timeout: timeoutMs, signal };
}

interface SdkListedTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: Record<string, unknown>;
}

export function toMcpToolDefinition(tool: SdkListedTool): MCPToolDefinition {
  return {
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: projectMcpToolSchemaForProvider(tool.inputSchema),
  };
}

export function projectMcpToolSchemaForProvider(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const projected = structuredClone(schema);
  if (Array.isArray(projected['anyOf'])) delete projected['anyOf'];
  return projected;
}

/**
 * Normalise the SDK's `callTool` return into kosong's {@link MCPToolResult}.
 * The SDK can return either the modern `{ content, isError }` shape or a
 * legacy `{ toolResult }` shape; we collapse the legacy shape to a single
 * text content block.
 */
export function toMcpToolResult(result: unknown): MCPToolResult {
  if (typeof result === 'object' && result !== null && 'content' in result) {
    const typed = result as {
      content: unknown;
      isError?: unknown;
      structuredContent?: unknown;
      _meta?: unknown;
    };
    if (Array.isArray(typed.content)) {
      return {
        content: typed.content as MCPToolResult['content'],
        isError: typed.isError === true,
        structuredContent: typed.structuredContent,
        _meta:
          typeof typed._meta === 'object' && typed._meta !== null
            ? (typed._meta as Record<string, unknown>)
            : undefined,
      };
    }
  }
  if (typeof result === 'object' && result !== null && 'toolResult' in result) {
    const legacy = (result as { toolResult: unknown }).toolResult;
    return {
      content: [
        {
          type: 'text',
          text: typeof legacy === 'string' ? legacy : JSON.stringify(legacy),
        },
      ],
      isError: false,
    };
  }
  return { content: [], isError: false };
}
