export class HttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code:
      | "BAD_REQUEST"
      | "UNAUTHENTICATED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "PAYLOAD_TOO_LARGE"
      | "UNSUPPORTED_MEDIA_TYPE"
      | "MEDIA_REJECTED"
      | "RATE_LIMITED"
      | "INTERNAL_ERROR",
    readonly retryAfter?: number
  ) {
    super(message);
  }
}
