import jwt from "jsonwebtoken";
import { AppError, ErrorCode } from "tms-contracts";

export interface JwtOptions {
  secret: string;
}

export function signJwt(payload: object, options: JwtOptions & { expiresInSeconds?: number }): string {
  return jwt.sign(payload, options.secret, {
    ...(options.expiresInSeconds !== undefined && { expiresIn: options.expiresInSeconds }),
  });
}

export function verifyJwt(token: string, options: JwtOptions): unknown {
  try {
    return jwt.verify(token, options.secret);
  } catch {
    throw new AppError(ErrorCode.AUTH_UNAUTHENTICATED);
  }
}
