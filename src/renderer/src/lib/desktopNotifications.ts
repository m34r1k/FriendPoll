import type { AppNotification, Poll } from '../types'
import { profileOf, type People } from './people'

/** Windows notification text for one thing that just happened. */
export function notificationText(
  notification: AppNotification,
  poll: Poll | undefined,
  people: People
): { title: string; body: string } {
  const who = (id: string | undefined): string => (id ? profileOf(people, id).displayName : 'Someone')
  const title = poll?.title ?? 'FriendPoll'

  switch (notification.kind) {
    case 'invited':
      return { title, body: `${who(notification.actorId)} invited you` }
    case 'join_request':
      return { title, body: `${who(notification.actorId)} wants to add ${who(notification.subjectId)}` }
    case 'join_approved':
      return { title, body: `${who(notification.actorId)} added ${who(notification.subjectId)}` }
    case 'join_denied':
      return { title, body: `${who(notification.actorId)} didn't add ${who(notification.subjectId)}` }
    case 'answered':
      return {
        title,
        body: `${who(notification.actorId)} said ${notification.answer === 'maybe' ? 'Maybe' : 'Yes'}`
      }
    case 'session_on':
      return { title, body: 'A time you are going to is on' }
  }
}

/**
 * Shows a Windows notification, unless the app is already in front (you can
 * see the change happen) or notifications were refused.
 */
export function showDesktopNotification(title: string, body: string, onClick: () => void): void {
  if (typeof Notification === 'undefined' || document.hasFocus()) return

  const show = (): void => {
    const notification = new Notification(title, { body })
    notification.onclick = () => {
      void window.desktop?.focusWindow()
      onClick()
    }
  }

  if (Notification.permission === 'granted') show()
  else if (Notification.permission !== 'denied') {
    void Notification.requestPermission().then((permission) => {
      if (permission === 'granted') show()
    })
  }
}
