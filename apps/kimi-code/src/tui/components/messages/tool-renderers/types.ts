import type { Component } from '@moonshot-ai/pi-tui';

import { RESULT_PREVIEW_LINES } from '#/tui/constant/rendering';
import type { Theme } from '#/tui/theme';
import type { ToolCallBlockData, ToolResultBlockData } from '#/tui/types';

export interface RendererContext {
  readonly expanded: boolean;
}

/** Existing result-renderer contract used by Kimi's built-in renderers. */
export type ResultRenderer = (
  toolCall: ToolCallBlockData,
  result: ToolResultBlockData,
  ctx: RendererContext,
) => Component[];

export const PREVIEW_LINES = RESULT_PREVIEW_LINES;

export function strArg(args: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = args[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

/**
 * Controls who owns the visual frame around a tool execution.
 *
 * `default` keeps Kimi's existing transcript shell. `self` gives the tool
 * renderer the whole tool row, including its title and result framing.
 */
export type ToolRenderShell = 'default' | 'self';

/** An execution update retained for a partial custom-renderer result. */
export interface ToolRenderUpdate {
  readonly kind: 'stdout' | 'stderr' | 'progress' | 'status' | 'custom';
  readonly text?: string;
  readonly percent?: number;
  readonly customKind?: string;
  readonly customData?: unknown;
}

/** Options describing the result currently being rendered. */
export interface ToolRenderResultOptions {
  /** Whether the result view is expanded (Ctrl+O). */
  readonly expanded: boolean;
  /** Whether the result is a partial/streaming result. */
  readonly isPartial: boolean;
  /** Ordered execution updates received before the final result. */
  readonly partialUpdates?: readonly ToolRenderUpdate[];
}

/**
 * Context shared by a tool's call and result renderers.
 *
 * Renderer state is retained for the lifetime of one transcript card. The
 * `lastComponent` slot lets a renderer update/reuse an existing component
 * instead of allocating a new one on every streamed argument update.
 */
export interface ToolRenderContext<
  TState = Record<string, unknown>,
  TArgs extends object = Record<string, unknown>,
> {
  /** The latest arguments for this tool call. */
  readonly args: TArgs;
  /** Stable id for this execution. */
  readonly toolCallId: string;
  /** Rebuild this card and request a terminal render. */
  readonly invalidate: () => void;
  /** Component returned by the same renderer during the previous render. */
  readonly lastComponent: Component | undefined;
  /** Mutable state shared by call/result renderers for this card. */
  readonly state: TState;
  /** Working directory associated with the tool call (empty when unavailable). */
  readonly cwd: string;
  /** Whether execution has started. */
  readonly executionStarted: boolean;
  /** Whether the tool-call arguments are complete. */
  readonly argsComplete: boolean;
  /** Whether the current result is partial/streaming. */
  readonly isPartial: boolean;
  /** Whether the result view is expanded. */
  readonly expanded: boolean;
  /** Whether inline media in the current result should be shown. */
  readonly showImages: boolean;
  /** Whether the current result is an error. */
  readonly isError: boolean;
}

export type ToolCallRenderer<
  TArgs extends object = Record<string, unknown>,
  TState = Record<string, unknown>,
> = (
  args: TArgs,
  theme: Theme,
  context: ToolRenderContext<TState, TArgs>,
) => Component;

export type ToolResultRenderer<
  TArgs extends object = Record<string, unknown>,
  TState = Record<string, unknown>,
> = (
  result: ToolResultBlockData,
  options: ToolRenderResultOptions,
  theme: Theme,
  context: ToolRenderContext<TState, TArgs>,
) => Component;

/**
 * UI half of a tool definition.
 *
 * The execution engine deliberately does not depend on pi-tui. Hosts can
 * provide these definitions to KimiTUI (or directly to ToolCallComponent)
 * without changing the wire-level tool contract.
 */
export interface ToolRenderDefinition<
  TArgs extends object = Record<string, unknown>,
  TState = Record<string, unknown>,
> {
  /** Tool name used for lookup in the transcript renderer registry. */
  readonly name: string;
  /** Optional metadata retained when a host passes a complete tool definition. */
  readonly label?: string;
  readonly description?: string;
  readonly parameters?: Record<string, unknown>;
  /** Defaults to Kimi's existing transcript shell. */
  readonly renderShell?: ToolRenderShell;
  /** Render the call/argument portion of the tool row. */
  readonly renderCall?: ToolCallRenderer<TArgs, TState>;
  /** Render the result portion of the tool row. */
  readonly renderResult?: ToolResultRenderer<TArgs, TState>;
}

/** A definition with erased generic parameters, for host-side lookup. */
export type AnyToolRenderDefinition = ToolRenderDefinition<any, any>;

/** The minimal registry surface accepted by a TUI host. */
export interface ToolRenderDefinitionRegistryLike {
  resolve(name: string): AnyToolRenderDefinition | undefined;
  entries(): readonly AnyToolRenderDefinition[];
}

/** Accepted forms for supplying definitions to a TUI host. */
export type ToolRenderDefinitions =
  | readonly AnyToolRenderDefinition[]
  | ReadonlyMap<string, AnyToolRenderDefinition>
  | Readonly<Record<string, AnyToolRenderDefinition>>
  | ToolRenderDefinitionRegistryLike;

/** Pi-compatible short names for the UI portion of a tool definition. */
export type ToolDefinition<
  TArgs extends object = Record<string, unknown>,
  TState = Record<string, unknown>,
> = ToolRenderDefinition<TArgs, TState>;
export type ToolRendererDefinition<
  TArgs extends object = Record<string, unknown>,
  TState = Record<string, unknown>,
> = ToolRenderDefinition<TArgs, TState>;

export type ToolRendererTheme = Theme;

export type { Theme };
export type { ToolCallBlockData, ToolResultBlockData };
