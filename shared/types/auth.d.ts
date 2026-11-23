declare module '#auth-utils' {
  interface User {
    id: string
    name: string
    email: string | null
    role: 'admin' | 'member' | 'viewer'
    isAdmin: boolean
    isGuest: boolean
  }
}

export {}
