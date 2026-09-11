import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import {
  findUserByEmail,
  findUserById,
  createUser,
  updateUserPassword,
  type UserRow,
} from "./postgres";

// Read JWT settings from server-side environment
function getJwtSettings() {
  const secretKey =
    process.env.SECRET_KEY || "c89b21f92e104a9d7b8782a1738c6426914b196fa9db943bc94a9a08e1f0e4b7";
  const algorithm = (process.env.ALGORITHM || "HS256") as jwt.Algorithm;
  const accessExpireMinutes = parseInt(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || "60", 10);
  const refreshExpireDays = parseInt(process.env.REFRESH_TOKEN_EXPIRE_DAYS || "7", 10);

  return {
    secretKey,
    algorithm,
    accessExpireMinutes,
    refreshExpireDays,
  };
}

export interface TokenPayload {
  sub: string;
  role: "ADMIN" | "USER";
  user_id: number;
  type?: "access" | "refresh";
}

export function hashPassword(plain: string): string {
  const salt = bcrypt.genSaltSync(12);
  return bcrypt.hashSync(plain, salt);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export function createAccessToken(data: {
  sub: string;
  role: "ADMIN" | "USER";
  user_id: number;
}): string {
  const { secretKey, algorithm, accessExpireMinutes } = getJwtSettings();
  const payload = {
    ...data,
    type: "access",
    exp: Math.floor(Date.now() / 1000) + accessExpireMinutes * 60,
    iat: Math.floor(Date.now() / 1000),
  };
  return jwt.sign(payload, secretKey, { algorithm });
}

export function createRefreshToken(data: {
  sub: string;
  role: "ADMIN" | "USER";
  user_id: number;
}): string {
  const { secretKey, algorithm, refreshExpireDays } = getJwtSettings();
  const payload = {
    ...data,
    type: "refresh",
    exp: Math.floor(Date.now() / 1000) + refreshExpireDays * 24 * 60 * 60,
    iat: Math.floor(Date.now() / 1000),
  };
  return jwt.sign(payload, secretKey, { algorithm });
}

export function decodeAndVerifyToken(token: string): TokenPayload | null {
  try {
    const { secretKey, algorithm } = getJwtSettings();
    const decoded = jwt.verify(token, secretKey, { algorithms: [algorithm] }) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

export function sanitizeUser(user: UserRow) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    created_at:
      typeof user.created_at === "string" ? user.created_at : user.created_at.toISOString(),
    updated_at:
      typeof user.updated_at === "string" ? user.updated_at : user.updated_at.toISOString(),
  };
}

export async function handleRegister(body: {
  full_name?: string;
  email?: string;
  password?: string;
  role?: "ADMIN" | "USER";
}) {
  if (!body.full_name || !body.email || !body.password) {
    return { error: "full_name, email, and password are required", status: 400 };
  }
  if (body.password.length < 6) {
    return { error: "Password must be at least 6 characters long", status: 400 };
  }

  const existing = await findUserByEmail(body.email);
  if (existing) {
    return { error: "An account with this email address already exists", status: 400 };
  }

  const password_hash = hashPassword(body.password);
  const newUser = await createUser({
    full_name: body.full_name,
    email: body.email,
    password_hash,
    role: body.role,
  });

  const tokenData = { sub: newUser.email, role: newUser.role, user_id: newUser.id };
  const access_token = createAccessToken(tokenData);
  const refresh_token = createRefreshToken(tokenData);

  return {
    data: {
      access_token,
      refresh_token,
      token_type: "bearer",
      user: sanitizeUser(newUser),
    },
    status: 201,
  };
}

export async function handleLogin(body: { email?: string; password?: string }) {
  if (!body.email || !body.password) {
    return { error: "email and password are required", status: 400 };
  }

  const user = await findUserByEmail(body.email);
  if (!user || !verifyPassword(body.password, user.password_hash)) {
    return { error: "Invalid email or password", status: 401 };
  }

  const tokenData = { sub: user.email, role: user.role, user_id: user.id };
  const access_token = createAccessToken(tokenData);
  const refresh_token = createRefreshToken(tokenData);

  return {
    data: {
      access_token,
      refresh_token,
      token_type: "bearer",
      user: sanitizeUser(user),
    },
    status: 200,
  };
}

export async function handleRefreshToken(refreshTokenString: string) {
  const payload = decodeAndVerifyToken(refreshTokenString);
  if (!payload || payload.type !== "refresh") {
    return { error: "Invalid or expired refresh token", status: 401 };
  }

  const user = await findUserById(payload.user_id);
  if (!user) {
    return { error: "User associated with token no longer exists", status: 401 };
  }

  const tokenData = { sub: user.email, role: user.role, user_id: user.id };
  const new_access_token = createAccessToken(tokenData);
  const new_refresh_token = createRefreshToken(tokenData);

  return {
    data: {
      access_token: new_access_token,
      refresh_token: new_refresh_token,
      token_type: "bearer",
      user: sanitizeUser(user),
    },
    status: 200,
  };
}

export async function handleGetMe(authHeader?: string | null) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: "Missing or invalid Authorization header", status: 401 };
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");
  const payload = decodeAndVerifyToken(token);
  if (!payload) {
    return { error: "Invalid or expired token", status: 401 };
  }

  const user = await findUserById(payload.user_id);
  if (!user) {
    return { error: "User not found", status: 404 };
  }

  return {
    data: sanitizeUser(user),
    status: 200,
  };
}

export async function handleChangePassword(
  authHeader: string | null,
  body: { current_password?: string; new_password?: string },
) {
  const meResult = await handleGetMe(authHeader);
  if (meResult.error || !meResult.data) {
    return meResult;
  }

  if (!body.current_password || !body.new_password) {
    return { error: "current_password and new_password are required", status: 400 };
  }
  if (body.new_password.length < 6) {
    return { error: "new_password must be at least 6 characters long", status: 400 };
  }

  const user = await findUserById(meResult.data.id);
  if (!user || !verifyPassword(body.current_password, user.password_hash)) {
    return { error: "Current password does not match", status: 400 };
  }

  const newHash = hashPassword(body.new_password);
  await updateUserPassword(user.id, newHash);

  return { data: { message: "Password updated successfully" }, status: 200 };
}
