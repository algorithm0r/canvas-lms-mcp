import type { CanvasHttpClient } from './client'
import type { CanvasGroup, CanvasGroupCategory, CanvasGroupMembership, CanvasUser } from './types'
import type { CanvasId } from './id'

export interface CreateGroupCategoryParams {
  name: string
}

export interface CreateGroupParams {
  name: string
  description?: string
  join_level?: 'parent_context_auto_join' | 'parent_context_request' | 'invitation_only'
}

export class GroupsModule {
  constructor(private client: CanvasHttpClient) {}

  async list(courseId: CanvasId): Promise<CanvasGroup[]> {
    return this.client.paginate<CanvasGroup>(`/api/v1/courses/${courseId}/groups`)
  }

  async listMembers(groupId: CanvasId): Promise<CanvasUser[]> {
    return this.client.paginate<CanvasUser>(`/api/v1/groups/${groupId}/users`)
  }

  async listCategories(courseId: CanvasId): Promise<CanvasGroupCategory[]> {
    return this.client.paginate<CanvasGroupCategory>(`/api/v1/courses/${courseId}/group_categories`)
  }

  /** Canvas renders the created category with no root key. */
  async createCategory(
    courseId: CanvasId,
    params: CreateGroupCategoryParams,
  ): Promise<CanvasGroupCategory> {
    return this.client.request<CanvasGroupCategory>(
      `/api/v1/courses/${courseId}/group_categories`,
      { method: 'POST', body: JSON.stringify(params) },
    )
  }

  /**
   * Groups are created inside a group category, so this is addressed by the
   * category ID, not the course ID. Canvas renders the new group with no root
   * key (its `users` list is empty for a new group).
   */
  async create(groupCategoryId: CanvasId, params: CreateGroupParams): Promise<CanvasGroup> {
    return this.client.request<CanvasGroup>(`/api/v1/group_categories/${groupCategoryId}/groups`, {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  /** Canvas deletes the group, removes its members, and answers with the deleted group. */
  async delete(groupId: CanvasId): Promise<CanvasGroup> {
    return this.client.request<CanvasGroup>(`/api/v1/groups/${groupId}`, { method: 'DELETE' })
  }

  /** Returns the membership Canvas creates (or the existing one, if the user is already a member). */
  async addMember(groupId: CanvasId, userId: CanvasId): Promise<CanvasGroupMembership> {
    return this.client.request<CanvasGroupMembership>(`/api/v1/groups/${groupId}/memberships`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    })
  }

  /** Canvas answers a membership removal with `{ "ok": true }`. */
  async removeMember(groupId: CanvasId, userId: CanvasId): Promise<{ ok: boolean }> {
    return this.client.request<{ ok: boolean }>(`/api/v1/groups/${groupId}/users/${userId}`, {
      method: 'DELETE',
    })
  }
}
