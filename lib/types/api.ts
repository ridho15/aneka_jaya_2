export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; message: string; code?: string; details?: unknown };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const failure = (message: string, code?: string, details?: unknown): ApiFailure => ({
  success: false, message, code, details
});
