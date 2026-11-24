declare module '#auth-utils' {
  interface User {
    id: string
    name: string
    email: string | null
    role: 'admin' | 'member' | 'viewer' | 'external'
    isAdmin: boolean
    isGuest: boolean
    /** Missing on sessions created before roles were split into internal/external; derive with isInternal(). */
    isInternal?: boolean
  }
}

export {}
