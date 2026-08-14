/**
 * `mcpCore` domain — shared MCP client helpers — request options, liveness probes, result conversion.
 */

import { getCoreVersion } from '#/_base/version';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { MCPClient, MCPToolDefinition, MCPToolResult } from './types';

export const KIMI_MCP_CLIENT_NAME = 'kimi-code';
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

export interface UnexpectedCloseReason {
  readonly error?: Error;
  readonly stderr?: string;
}

export type UnexpectedCloseListener = (reason: UnexpectedCloseReason) => void;

export function isMcpConnectionClosedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as Error & { readonly code?: unknown }).code === ErrorCode.ConnectionClosed
  );
}

export function isMcpTransportFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (isMcpConnectionClosedError(error)) return true;
  return !(error instanceof McpError);
}

export const MCP_LIVENESS_PROBE_TIMEOUT_MS = 5_000;

export function isMcpMalformedResultError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ZodError';
}

export async function probeMcpLiveness(client: MCPClient, signal: AbortSignal): Promise<boolean> {
  try {
    await client.ping(signal);
    return true;
  } catch (error) {
    if (isMcpConnectionClosedError(error)) return false;
    if (isMcpMalformedResultError(error)) return true;
    if (error instanceof McpError) {
      return (error as Error & { readonly code?: unknown }).code !== ErrorCode.RequestTimeout;
    }
    return false;
  }
}

export interface McpRequestOptions {
  readonly timeout?: number;
  readonly signal?: AbortSignal;
}

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
    inputSchema: tool.inputSchema,
  };
}

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
