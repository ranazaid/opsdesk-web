import { jwtVerify, SignJWT, errors as joseErrors } from "jose";
import { getAuthSecret } from "@/server/config";
import { UnauthorizedError } from "@/server/errors";

const ISSUER = "opsdesk";

/**
 * Two audiences share one signing key but are never interchangeable:
 * - `web`: the httpOnly session cookie used by the Next.js app;
 * - `api`: bearer tokens for the REST API (React Native companion app).
 */
export type TokenAudience = "opsdesk:web" | "opsdesk:api";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const API_TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export interface TokenClaims {
  userId: string;
  orgId: string;
}

export async function signToken(
  claims: TokenClaims,
  audience: TokenAudience,
  ttlSeconds = audience === "opsdesk:web" ? SESSION_TTL_SECONDS : API_TOKEN_TTL_SECONDS,
): Promise<string> {
  return new SignJWT({ org: claims.orgId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(getAuthSecret());
}

export async function verifyToken(token: string, audience: TokenAudience): Promise<TokenClaims> {
  // Resolved outside the try: a missing secret is a misconfiguration, not a bad token.
  const secret = getAuthSecret();
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience,
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || typeof payload.org !== "string") {
      throw new UnauthorizedError("Malformed token");
    }
    return { userId: payload.sub, orgId: payload.org };
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    if (error instanceof joseErrors.JWTExpired) throw new UnauthorizedError("Token expired");
    throw new UnauthorizedError("Invalid token");
  }
}
