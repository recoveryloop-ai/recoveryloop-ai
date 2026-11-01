export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(code);
    this.name = "AppError";
  }
}
