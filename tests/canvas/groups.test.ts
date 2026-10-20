import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GroupsModule } from '../../src/canvas/groups'
import { CanvasApiError, CanvasHttpClient } from '../../src/canvas/client'

describe('GroupsModule', () => {
  let client: CanvasHttpClient
  let groups: GroupsModule

  beforeEach(() => {
    client = new CanvasHttpClient({
      token: 'test-token',
      baseUrl: 'https://canvas.example.com',
    })
    groups = new GroupsModule(client)
  })

  it('lists groups for a course', async () => {
    vi.spyOn(client, 'paginate').mockResolvedValueOnce([
      { id: 1, name: 'Group A', group_category_id: 10, members_count: 4 },
    ])
    const result = await groups.list(100)
    expect(result).toHaveLength(1)
    expect(client.paginate).toHaveBeenCalledWith('/api/v1/courses/100/groups')
  })

  it('lists members of a group', async () => {
    vi.spyOn(client, 'paginate').mockResolvedValueOnce([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ])
    const result = await groups.listMembers(5)
    expect(result).toHaveLength(2)
    expect(client.paginate).toHaveBeenCalledWith('/api/v1/groups/5/users')
  })

  it('lists group categories for a course through the paginator', async () => {
    vi.spyOn(client, 'paginate').mockResolvedValueOnce([
      { id: 10, name: 'Project Groups' },
      { id: 11, name: 'Lab Pairs' },
    ])
    const result = await groups.listCategories(100)
    expect(result).toHaveLength(2)
    expect(client.paginate).toHaveBeenCalledWith('/api/v1/courses/100/group_categories')
  })

  it('creates a group category with a JSON body', async () => {
    vi.spyOn(client, 'request').mockResolvedValueOnce({ id: 10, name: 'Project Groups' })
    const result = await groups.createCategory(100, { name: 'Project Groups' })
    expect(result).toMatchObject({ id: 10, name: 'Project Groups' })
    expect(client.request).toHaveBeenCalledWith('/api/v1/courses/100/group_categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Project Groups' }),
    })
  })

  it('creates a group under its category, not under the course', async () => {
    vi.spyOn(client, 'request').mockResolvedValueOnce({
      id: 1,
      name: 'Red One',
      group_category_id: 10,
      members_count: 0,
    })
    const result = await groups.create(10, { name: 'Red One', join_level: 'invitation_only' })
    expect(result).toEqual({
      id: 1,
      name: 'Red One',
      group_category_id: 10,
      members_count: 0,
    })
    expect(client.request).toHaveBeenCalledWith('/api/v1/group_categories/10/groups', {
      method: 'POST',
      body: JSON.stringify({ name: 'Red One', join_level: 'invitation_only' }),
    })
  })

  it('deletes a group and returns the deleted group', async () => {
    vi.spyOn(client, 'request').mockResolvedValueOnce({ id: 1, name: 'Red One' })
    const result = await groups.delete(1)
    expect(result).toMatchObject({ id: 1 })
    expect(client.request).toHaveBeenCalledWith('/api/v1/groups/1', { method: 'DELETE' })
  })

  it('adds a member by posting user_id to the memberships endpoint', async () => {
    const membership = {
      id: 77,
      group_id: 1,
      user_id: 5,
      workflow_state: 'accepted',
      moderator: false,
      just_created: true,
    }
    vi.spyOn(client, 'request').mockResolvedValueOnce(membership)
    const result = await groups.addMember(1, 5)
    expect(result).toEqual(membership)
    expect(client.request).toHaveBeenCalledWith('/api/v1/groups/1/memberships', {
      method: 'POST',
      body: JSON.stringify({ user_id: 5 }),
    })
  })

  it('removes a member by user ID and returns the ok receipt', async () => {
    vi.spyOn(client, 'request').mockResolvedValueOnce({ ok: true })
    const result = await groups.removeMember(1, 5)
    expect(result).toEqual({ ok: true })
    expect(client.request).toHaveBeenCalledWith('/api/v1/groups/1/users/5', { method: 'DELETE' })
  })

  it.each([
    ['createCategory', () => groups.createCategory(100, { name: 'X' })],
    ['create', () => groups.create(10, { name: 'X' })],
    ['delete', () => groups.delete(1)],
    ['addMember', () => groups.addMember(1, 5)],
    ['removeMember', () => groups.removeMember(1, 5)],
  ])('surfaces a Canvas 403 from %s unchanged', async (_name, call) => {
    vi.spyOn(client, 'request').mockRejectedValueOnce(
      new CanvasApiError('user not authorized to perform that action', 403, '/api/v1/groups'),
    )
    await expect(call()).rejects.toMatchObject({ name: 'CanvasApiError', status: 403 })
  })
})
