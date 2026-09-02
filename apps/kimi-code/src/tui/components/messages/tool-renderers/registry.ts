/**
 * Tool result renderer registry.
 *
 * Each tool name maps to a `ResultRenderer` that turns the tool's
 * `ToolResultBlockData` into renderable Components. Tools without an
 * explicit entry fall through to `renderTruncated` (the original
 * 3-line + ctrl+o behavior).
 *
 * Keep this dispatch flat — tool names live next to the renderer they
 * choose, so adding a new tool means appending one case.
 */

import { readMediaSummary } from './media';
import { shellExecutionResultRenderer } from '../shell-execution';
import { goalSummary } from './goal';
import {
  editSummary,
  fetchSummary,
  globSummary,
  grepSummary,
  readSummary,
  thinkSummary,
  webSearchSummary,
  writeSummary,
} from './summary';
import { renderTruncated } from './truncated';
import type {
  AnyToolRenderDefinition,
  ResultRenderer,
  ToolRenderDefinition,
  ToolRenderDefinitions,
} from './types';

/**
 * True when a tool has no dedicated renderer and falls back to the generic
 * truncated output (every MCP tool and any tool not listed below). Used to
 * decide whether subagent sub-tool output should be previewed the same way
 * the main agent previews it.
 */
export function isGenericToolResult(toolName: string): boolean {
  return pickResultRenderer(toolName) === renderTruncated;
}

export function pickResultRenderer(toolName: string): ResultRenderer {
  switch (toolName) {
    case 'Read':
      return readSummary;
    case 'ReadMediaFile':
      return readMediaSummary;
    case 'Grep':
      return grepSummary;
    case 'Glob':
      return globSummary;
    case 'FetchURL':
      return fetchSummary;
    case 'WebSearch':
      return webSearchSummary;
    case 'Bash':
      return shellExecutionResultRenderer;
    case 'Think':
      return thinkSummary;
    case 'Edit':
      return editSummary;
    case 'Write':
      return writeSummary;
    case 'CreateGoal':
    case 'GetGoal':
    case 'SetGoalBudget':
    case 'UpdateGoal':
      return goalSummary;
    default:
      return renderTruncated;
  }
}

/**
 * A small host-side registry for tool-owned render definitions.
 *
 * The execution engine owns tool implementations, while this registry owns
 * the optional pi-tui-facing part of a definition. Keeping the registry in
 * the TUI package means tool implementations and wire consumers do not need a
 * dependency on a terminal renderer.
 */
export class ToolRenderDefinitionRegistry {
  private readonly definitions = new Map<string, AnyToolRenderDefinition>();

  constructor(definitions: ToolRenderDefinitions = []) {
    this.replace(definitions);
  }

  replace(definitions: ToolRenderDefinitions): void {
    this.definitions.clear();
    for (const definition of definitionsToArray(definitions)) {
      if (definition.name.length > 0) this.definitions.set(definition.name, definition);
    }
  }

  register<TArgs extends object, TState>(
    definition: ToolRenderDefinition<TArgs, TState>,
  ): () => void {
    const name = definition.name;
    const previous = this.definitions.get(name);
    this.definitions.set(name, definition);
    return () => {
      if (this.definitions.get(name) !== definition) return;
      if (previous === undefined) this.definitions.delete(name);
      else this.definitions.set(name, previous);
    };
  }

  unregister(name: string): boolean {
    return this.definitions.delete(name);
  }

  resolve(name: string): AnyToolRenderDefinition | undefined {
    return this.definitions.get(name);
  }

  entries(): readonly AnyToolRenderDefinition[] {
    return [...this.definitions.values()];
  }
}

function definitionsToArray(
  definitions: ToolRenderDefinitions,
): readonly AnyToolRenderDefinition[] {
  if (Array.isArray(definitions)) return definitions;
  if (definitions instanceof Map) return [...definitions.values()];
  return Object.values(definitions);
}

/** Process-wide opt-in registry used by direct ToolCallComponent consumers. */
const defaultToolRenderDefinitions = new ToolRenderDefinitionRegistry();

export function registerToolRenderDefinition<TArgs extends object, TState>(
  definition: ToolRenderDefinition<TArgs, TState>,
): () => void {
  return defaultToolRenderDefinitions.register(definition);
}

export function resolveToolRenderDefinition(
  toolName: string,
): AnyToolRenderDefinition | undefined {
  return defaultToolRenderDefinitions.resolve(toolName);
}

export function unregisterToolRenderDefinition(toolName: string): boolean {
  return defaultToolRenderDefinitions.unregister(toolName);
}

/** Backwards-friendly aliases for hosts that call these simply "tool definitions". */
export const registerToolDefinition = registerToolRenderDefinition;
export const resolveToolDefinition = resolveToolRenderDefinition;
export const unregisterToolDefinition = unregisterToolRenderDefinition;

export type {
  AnyToolRenderDefinition,
  ResultRenderer,
  ToolCallRenderer,
  ToolDefinition,
  ToolRenderContext,
  ToolRenderDefinition,
  ToolRenderDefinitions,
  ToolRenderResultOptions,
  ToolRendererDefinition,
  ToolRenderShell,
  ToolResultRenderer,
} from './types';
