import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pseudonymizer } from '../../src/pseudonym/pseudonymizer'
import type { CanvasClient } from '../../src/canvas'
import { CanvasApiError } from '../../src/canvas/client'
import type {
  CanvasGroup,
  CanvasGroupCategory,
  CanvasGroupMembership,
  CanvasUser,
} from '../../src/canvas/types'
import { formatError } from '../../src/tools/errors'
import { groupTools } from '../../src/tools/groups'

describe('groupTools', () => {
  const mockGroup: CanvasGroup = {
    id: 1,
    name: 'Group A',
    description: null,
    members_count: 3,
    context_type: 'Course',
    course_id: 1,
    group_category_id: 1,
  }

  const mockUser: CanvasUser = {
    id: 5,
    name: 'Alice',
    sortable_name: 'Alice',
    short_name: 'Alice',
    login_id: 'alice@example.com',
    email: 'alice@example.com',
    created_at: '2026-01-01T00:00:00Z',
  }

  const mockCategory: CanvasGroupCategory = { id: 10, name: 'Project Groups' }

  const mockMembership: CanvasGroupMembership = {
    id: 77,
    group_id: 1,
    user_id: 5,
    workflow_state: 'accepted',
    moderator: false,
    just_created: true,
  }

  function buildMockCanvas(): CanvasClient {
    return {
      groups: {
        list: vi.fn().mockResolvedValue([mockGroup]),
        listMembers: vi.fn().mockResolvedValue([mockUser]),
        listCategories: vi.fn().mockResolvedValue([mockCategory]),
        createCategory: vi.fn().mockResolvedValue(mockCategory),
        create: vi.fn().mockResolvedValue(mockGroup),
        delete: vi.fn().mockResolvedValue(mockGroup),
        addMember: vi.fn().mockResolvedValue(mockMembership),
        removeMember: vi.fn().mockResolvedValue({ ok: true }),
      },
    } as unknown as CanvasClient
  }

  function tool(canvas: CanvasClient, name: string) {
    return groupTools(canvas).find((t) => t.name === name)!
  }

  it('returns an array with 8 tool definitions', () => {
    expect(groupTools(buildMockCanvas())).toHaveLength(8)
  })

  it('exports tools with correct names', () => {
    const names = groupTools(buildMockCanvas()).map((t) => t.name)
    expect(names).toEqual([
      'list_groups',
      'list_group_members',
      'list_group_categories',
      'create_group_category',
      'create_group',
      'delete_group',
      'add_group_member',
      'remove_group_member',
    ])
  })

  describe('list_groups', () => {
    it('has read-only annotations', () => {
      const tool = groupTools(buildMockCanvas()).find((t) => t.name === 'list_groups')!
      expect(tool.annotations).toEqual({ readOnlyHint: true, openWorldHint: true })
    })

    it('delegates to canvas.groups.list', async () => {
      const canvas = buildMockCanvas()
      const tool = groupTools(canvas).find((t) => t.name === 'list_groups')!
      await tool.handler({ course_id: '1' })
      expect(canvas.groups.list).toHaveBeenCalledWith('1')
    })
  })

  describe('list_group_members', () => {
    it('has read-only annotations', () => {
      const tool = groupTools(buildMockCanvas()).find((t) => t.name === 'list_group_members')!
      expect(tool.annotations).toEqual({ readOnlyHint: true, openWorldHint: true })
    })

    it('delegates to canvas.groups.listMembers', async () => {
      const canvas = buildMockCanvas()
      const tool = groupTools(canvas).find((t) => t.name === 'list_group_members')!
      await tool.handler({ group_id: '1' })
      expect(canvas.groups.listMembers).toHaveBeenCalledWith('1')
    })
  })

  describe('list_group_categories', () => {
    it('is a read-only educator tool', () => {
      const t = tool(buildMockCanvas(), 'list_group_categories')
      expect(t.annotations).toEqual({ readOnlyHint: true, openWorldHint: true })
      expect(t.audience).toBe('educator')
    })

    it('delegates to canvas.groups.listCategories', async () => {
      const canvas = buildMockCanvas()
      const result = await tool(canvas, 'list_group_categories').handler({ course_id: '1' })
      expect(canvas.groups.listCategories).toHaveBeenCalledWith('1')
      expect(result).toEqual([mockCategory])
    })
  })

  describe('create_group_category', () => {
    it('takes course_id and name only', () => {
      const t = tool(buildMockCanvas(), 'create_group_category')
      expect(Object.keys(t.inputSchema).sort()).toEqual(['course_id', 'name'])
      expect(t.annotations).toEqual({ destructiveHint: true, openWorldHint: true })
    })

    it('delegates to canvas.groups.createCategory', async () => {
      const canvas = buildMockCanvas()
      await tool(canvas, 'create_group_category').handler({
        course_id: '1',
        name: 'Project Groups',
      })
      expect(canvas.groups.createCategory).toHaveBeenCalledWith('1', { name: 'Project Groups' })
    })
  })

  describe('create_group', () => {
    it('is addressed by group_category_id and takes no course_id', () => {
      const t = tool(buildMockCanvas(), 'create_group')
      expect(t.inputSchema).toHaveProperty('group_category_id')
      expect(t.inputSchema).not.toHaveProperty('course_id')
      expect(t.description).toContain('not by course ID')
      expect(t.annotations).toEqual({ destructiveHint: true, openWorldHint: true })
    })

    it('delegates to canvas.groups.create with the category ID', async () => {
      const canvas = buildMockCanvas()
      await tool(canvas, 'create_group').handler({
        group_category_id: '10',
        name: 'Red One',
        join_level: 'invitation_only',
      })
      expect(canvas.groups.create).toHaveBeenCalledWith('10', {
        name: 'Red One',
        description: undefined,
        join_level: 'invitation_only',
      })
    })
  })

  describe('delete_group', () => {
    it('has destructive + idempotent annotations', () => {
      expect(tool(buildMockCanvas(), 'delete_group').annotations).toEqual({
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      })
    })

    it('delegates to canvas.groups.delete and returns the deleted group', async () => {
      const canvas = buildMockCanvas()
      const result = await tool(canvas, 'delete_group').handler({ group_id: '1' })
      expect(canvas.groups.delete).toHaveBeenCalledWith('1')
      expect(result).toEqual(mockGroup)
    })
  })

  describe('add_group_member', () => {
    it('has destructive + idempotent annotations', () => {
      expect(tool(buildMockCanvas(), 'add_group_member').annotations).toEqual({
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      })
    })

    it('returns the membership Canvas reports, unchanged', async () => {
      const canvas = buildMockCanvas()
      const result = await tool(canvas, 'add_group_member').handler({ group_id: '1', user_id: '5' })
      expect(canvas.groups.addMember).toHaveBeenCalledWith('1', '5')
      expect(result).toEqual(mockMembership)
    })

    it('does not describe moving a user between groups', () => {
      const words = tool(buildMockCanvas(), 'add_group_member')
        .description.toLowerCase()
        .split(/\W+/)
      expect(words.filter((w) => w.startsWith('mov'))).toEqual([])
    })
  })

  describe('remove_group_member', () => {
    it('has destructive + idempotent annotations', () => {
      expect(tool(buildMockCanvas(), 'remove_group_member').annotations).toEqual({
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      })
    })

    it('delegates to canvas.groups.removeMember', async () => {
      const canvas = buildMockCanvas()
      const result = await tool(canvas, 'remove_group_member').handler({
        group_id: '1',
        user_id: '5',
      })
      expect(canvas.groups.removeMember).toHaveBeenCalledWith('1', '5')
      expect(result).toEqual({ ok: true })
    })
  })

  describe('Canvas error mapping on the new tools', () => {
    const cases: [string, Record<string, unknown>, string][] = [
      ['list_group_categories', { course_id: '1' }, 'listCategories'],
      ['create_group_category', { course_id: '1', name: 'X' }, 'createCategory'],
      ['create_group', { group_category_id: '10', name: 'X' }, 'create'],
      ['delete_group', { group_id: '1' }, 'delete'],
      ['add_group_member', { group_id: '1', user_id: '5' }, 'addMember'],
      ['remove_group_member', { group_id: '1', user_id: '5' }, 'removeMember'],
    ]

    async function errorText(
      name: string,
      args: Record<string, unknown>,
      method: string,
      status: number,
    ): Promise<string> {
      const canvas = buildMockCanvas()
      const fn = (canvas.groups as unknown as Record<string, ReturnType<typeof vi.fn>>)[method]!
      fn.mockRejectedValueOnce(new CanvasApiError('Canvas said no', status, '/api/v1/groups'))
      try {
        await tool(canvas, name).handler(args)
      } catch (error) {
        return formatError(error)
      }
      throw new Error('expected ' + name + ' to reject')
    }

    it.each(cases)('%s maps a 403 to the permission message', async (name, args, method) => {
      expect(await errorText(name, args, method, 403)).toBe(
        "You don't have permission to perform this action in this course",
      )
    })

    it.each(cases)('%s maps a 404 to the not-found message', async (name, args, method) => {
      expect(await errorText(name, args, method, 404)).toBe(
        'Course/assignment/submission not found — check the ID',
      )
    })
  })

  describe('pseudonymization', () => {
    let tmpDir: string
    beforeEach(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), 'group-tool-'))
    })
    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true })
    })

    function makePseudonymizer(enabled = true) {
      return new Pseudonymizer({
        baseUrl: 'https://school.instructure.com/api/v1',
        rootDir: tmpDir,
        env: enabled ? { CANVAS_PSEUDONYMIZE_STUDENTS: 'true' } : {},
      })
    }

    describe('list_group_members', () => {
      it('pseudonymizes member names when enabled', async () => {
        const canvas = buildMockCanvas()
        const tool = groupTools(canvas, makePseudonymizer()).find(
          (t) => t.name === 'list_group_members',
        )!
        const result = (await tool.handler({ group_id: '1' })) as CanvasUser[]
        expect(result[0].name).toMatch(/^Student \d+$/)
      })

      it('passes through real names when disabled', async () => {
        const canvas = buildMockCanvas()
        const tool = groupTools(canvas, makePseudonymizer(false)).find(
          (t) => t.name === 'list_group_members',
        )!
        const result = (await tool.handler({ group_id: '1' })) as CanvasUser[]
        expect(result[0].name).toBe('Alice')
      })
    })
  })
})
