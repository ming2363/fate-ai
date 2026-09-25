export class FieldInputError extends Error {
  readonly code: string;
  readonly status = 422;

  constructor(
    readonly fieldPath: string,
    message: string,
    code = "FIELD_INVALID",
    readonly candidates: readonly string[] = [],
  ) {
    super(message);
    this.name = "FieldInputError";
    this.code = code;
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}
