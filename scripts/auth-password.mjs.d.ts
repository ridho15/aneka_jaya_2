export function hashPassword(password: string, salt?: string): string;
export function verifyPassword(password: string, encodedHash: string): boolean;
