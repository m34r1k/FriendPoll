import type { Profile } from '../types'

/** The columns of public.profiles the app reads. */
export interface ProfileRow {
  id: string
  username: string
  display_name: string
}

const COLORS = ['#e0773c', '#3d8fd6', '#8d62d9', '#d6477f', '#2fa88a', '#b8962e', '#c2563f', '#4f7fbf']

/** The same colour for the same person every time, until real avatars exist. */
export function colorFor(id: string): string {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return COLORS[hash % COLORS.length]
}

export function toProfile(row: ProfileRow): Profile {
  return { id: row.id, username: row.username, displayName: row.display_name, avatarColor: colorFor(row.id) }
}
