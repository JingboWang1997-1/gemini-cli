/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, DiscoveredMCPPrompt } from '@google/gemini-cli-core';
import { McpPromptLoader } from './McpPromptLoader.js';
import { vi } from 'vitest';
import { createMockCommandContext } from '../test-utils/mockCommandContext.js';
import { CommandKind } from '../ui/commands/types.js';

// Mock the core function that retrieves prompts
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    getMCPServerPrompts: vi.fn(),
  };
});

const getMCPServerPrompts = vi.mocked(
  (await import('@google/gemini-cli-core')).getMCPServerPrompts,
);

describe('McpPromptLoader', () => {
  const signal: AbortSignal = new AbortController().signal;
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      getMcpServers: vi.fn(() => ({
        'test-server': { command: 'test' },
      })),
    } as unknown as Config;
  });

  describe('Command Loading', () => {
    it('loads a simple top-level command', async () => {
      const mockPrompts: DiscoveredMCPPrompt[] = [
        {
          name: 'test',
          description: 'A test prompt',
          arguments: [],
          serverName: 'test-server',
          invoke: vi.fn(),
        },
      ];
      getMCPServerPrompts.mockReturnValue(mockPrompts);

      const loader = new McpPromptLoader(mockConfig);
      const commands = await loader.loadCommands(signal);

      expect(commands).toHaveLength(1);
      const command = commands[0];
      expect(command.name).toBe('test');
      expect(command.kind).toBe(CommandKind.MCP_PROMPT);
      expect(command.subCommands).toBeDefined();
    });

    it('creates a hierarchical command from a colon-separated prompt name', async () => {
      const mockPrompts: DiscoveredMCPPrompt[] = [
        {
          name: 'parent:child',
          description: 'A child command',
          arguments: [],
          serverName: 'test-server',
          invoke: vi.fn(),
        },
      ];
      getMCPServerPrompts.mockReturnValue(mockPrompts);

      const loader = new McpPromptLoader(mockConfig);
      const commands = await loader.loadCommands(signal);

      expect(commands).toHaveLength(1);
      const parent = commands[0];
      expect(parent.name).toBe('parent');
      expect(parent.subCommands).toHaveLength(1);
      const child = parent.subCommands![0];
      expect(child.name).toBe('child');
      expect(child.description).toBe('A child command');
    });

    it('groups multiple subcommands under the same parent', async () => {
      const mockPrompts: DiscoveredMCPPrompt[] = [
        {
          name: 'parent:child1',
          description: 'First child',
          arguments: [],
          serverName: 'test-server',
          invoke: vi.fn(),
        },
        {
          name: 'parent:child2',
          description: 'Second child',
          arguments: [],
          serverName: 'test-server',
          invoke: vi.fn(),
        },
      ];
      getMCPServerPrompts.mockReturnValue(mockPrompts);

      const loader = new McpPromptLoader(mockConfig);
      const commands = await loader.loadCommands(signal);

      expect(commands).toHaveLength(1);
      const parent = commands[0];
      expect(parent.name).toBe('parent');
      expect(parent.subCommands).toHaveLength(2);
      expect(parent.subCommands!.map((c) => c.name)).toEqual([
        'child1',
        'child2',
      ]);
    });

    it('creates a placeholder parent if it does not exist', async () => {
      const mockPrompts: DiscoveredMCPPrompt[] = [
        {
          name: 'parent:child',
          description: 'A child command',
          arguments: [],
          serverName: 'test-server',
          invoke: vi.fn(),
        },
      ];
      getMCPServerPrompts.mockReturnValue(mockPrompts);

      const loader = new McpPromptLoader(mockConfig);
      const commands = await loader.loadCommands(signal);

      expect(commands).toHaveLength(1);
      const parent = commands[0];
      expect(parent.name).toBe('parent');
      expect(parent.description).toBe('Commands related to parent');
      expect(parent.action).toBeUndefined(); // Placeholder should not have an action
      expect(parent.subCommands).toHaveLength(1);
    });
  });

  describe('Argument Autocompletion', () => {
    const mockPromptWithArgs: DiscoveredMCPPrompt = {
      name: 'test',
      description: 'A test prompt',
      arguments: [
        { name: 'arg1', description: 'First argument', required: true },
        { name: 'arg2', description: 'Second argument', required: false },
      ],
      serverName: 'test-server',
      invoke: vi.fn(),
    };

    it('suggests all arguments when none are provided', async () => {
      getMCPServerPrompts.mockReturnValue([mockPromptWithArgs]);
      const loader = new McpPromptLoader(mockConfig);
      const commands = await loader.loadCommands(signal);
      const command = commands[0];
      const suggestions = await command.completion?.(
        createMockCommandContext(),
        '',
      );
      expect(suggestions).toEqual(['--arg1=""', '--arg2=""']);
    });

    it('suggests remaining arguments after one is fully provided', async () => {
      getMCPServerPrompts.mockReturnValue([mockPromptWithArgs]);
      const loader = new McpPromptLoader(mockConfig);
      const commands = await loader.loadCommands(signal);
      const command = commands[0];
      const suggestions = await command.completion?.(
        createMockCommandContext(),
        '--arg1="value"',
      );
      expect(suggestions).toEqual(['--arg2=""']);
    });

    it('suggests all arguments if one is only partially provided', async () => {
      getMCPServerPrompts.mockReturnValue([mockPromptWithArgs]);
      const loader = new McpPromptLoader(mockConfig);
      const commands = await loader.loadCommands(signal);
      const command = commands[0];
      const suggestions = await command.completion?.(
        createMockCommandContext(),
        '--arg1=',
      );
      expect(suggestions).toEqual(['--arg1=""', '--arg2=""']);
    });

    it('suggests no arguments if all are provided', async () => {
      getMCPServerPrompts.mockReturnValue([mockPromptWithArgs]);
      const loader = new McpPromptLoader(mockConfig);
      const commands = await loader.loadCommands(signal);
      const command = commands[0];
      const suggestions = await command.completion?.(
        createMockCommandContext(),
        '--arg1="value1" --arg2="value2"',
      );
      expect(suggestions).toEqual([]);
    });
  });
});
