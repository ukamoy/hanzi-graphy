export function hashPassword(password: string, salt: string) {
  let hash = 2166136261
  const value = `${salt}:${password}`

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

export function createSalt(id: string) {
  return `${id}:hanzi-graphy`
}
