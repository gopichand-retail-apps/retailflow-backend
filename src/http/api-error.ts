export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function requireValue<T>(value: T | null | undefined, message = 'Authentication required'): T {
  if (value === null || value === undefined) {
    throw new ApiError(401, 'AUTH_REQUIRED', message)
  }

  return value
}
