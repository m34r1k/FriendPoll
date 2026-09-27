import { profileOf, type People } from './people'

/** "You, Daniel and Jun" - the viewer is shown as "You". */
export function nameList(ids: string[], viewerId: string, people: People): string {
  const names = ids.map((id) => (id === viewerId ? 'You' : profileOf(people, id).displayName))
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** "1 time", "3 times" */
export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}
