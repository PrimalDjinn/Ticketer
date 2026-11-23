declare module '#auth-utils' {
  interface User {
    id: string
    name: string
    email: string | null
    isAdmin: boolean
    isGuest: boolean
  }
}

export {}
