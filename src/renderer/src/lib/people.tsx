import { createContext, useContext, type ReactNode } from 'react'
import type { Profile } from '../types'

/** Who the screens can show: fake people in the demo, real ones when signed in. */
export interface People {
  /** Everyone the viewer is allowed to see, by id. */
  profiles: Record<string, Profile>
  /** The viewer's friends (accepted), for inviting and suggesting. */
  friends: Profile[]
}

const PeopleContext = createContext<People | null>(null)

export function PeopleProvider({ value, children }: { value: People; children: ReactNode }) {
  return <PeopleContext.Provider value={value}>{children}</PeopleContext.Provider>
}

export function usePeople(): People {
  const people = useContext(PeopleContext)
  if (!people) throw new Error('usePeople() needs a <PeopleProvider> above it')
  return people
}

/** Never crashes on someone who isn't loaded yet (or is hidden by the rules). */
export function profileOf(people: People, id: string): Profile {
  return people.profiles[id] ?? { id, username: 'unknown', displayName: 'Someone', avatarColor: '#9ca3af' }
}
