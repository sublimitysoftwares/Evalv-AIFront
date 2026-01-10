/**
 * Authentication utility functions
 */

export const getToken = (): string | null => {
  return localStorage.getItem('token')
}

export const setToken = (token: string): void => {
  localStorage.setItem('token', token)
}

export const removeToken = (): void => {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
}

export const isAuthenticated = (): boolean => {
  const token = getToken()
  return token !== null && token !== '' && token !== 'undefined'
}

export const getUser = (): any => {
  const user = localStorage.getItem('user')
  if (user) {
    try {
      return JSON.parse(user)
    } catch {
      return null
    }
  }
  return null
}

