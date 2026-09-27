import { profileOf, usePeople } from '../lib/people'
import { initials } from '../lib/initials'
import type { Profile } from '../types'

const sizes = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm'
}

interface Props {
  profile: Profile
  size?: keyof typeof sizes
  className?: string
}

export function Avatar({ profile, size = 'md', className = '' }: Props) {
  return (
    <span
      title={profile.displayName}
      style={{ backgroundColor: profile.avatarColor }}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ${sizes[size]} ${className}`}
    >
      {initials(profile.displayName)}
    </span>
  )
}

/** Overlapping small avatars, e.g. everyone going to a session. */
export function AvatarStack({ ids, max = 5 }: { ids: string[]; max?: number }) {
  const people = usePeople()
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {ids.slice(0, max).map((id) => (
        <Avatar key={id} profile={profileOf(people, id)} size="xs" className="ring-2 ring-surface" />
      ))}
      {ids.length > max && (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-sunken text-[10px] font-semibold text-muted ring-2 ring-surface">
          +{ids.length - max}
        </span>
      )}
    </span>
  )
}
