import { Router } from "express";
import { pool } from "../db.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../auth/jwt.js";
import { logger } from "../logger.js";

export const authRouter = Router();

const VALID_ROLES = ["admin", "member", "viewer"] as const;
type Role = (typeof VALID_ROLES)[number];

authRouter.post("/register", async (req, res) => {
  const { email, password, role } = (req.body ?? {}) as { email?: unknown; password?: unknown; role?: unknown };

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "email and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }

  const chosenRole: Role = (typeof role === "string" && (VALID_ROLES.includes(role as Role) ? (role as Role) : "member")) || "member";

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "email already registered" });
    }

    const passwordHash = await hashPassword(password);

    const result = await pool.query(
      `INSERT INTO users (id, email, "passwordHash", role)
       VALUES (gen_random_uuid(), $1, $2, $3)
       RETURNING id, email, role`,
      [email, passwordHash, chosenRole]
    );
    const user = result.rows[0];

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshToken = signRefreshToken({ sub: user.id });

    return res.status(201).json({
      user: { id: user.id, email: user.email, role: user.role },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    logger.error({ err, email }, "register: db error");
    return res.status(500).json({ error: "internal error" });
  }
});
authRouter.post("/login", async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "email and password are required" });
  }

  try {
    const result = await pool.query(
      `SELECT id, email, "passwordHash", role FROM users WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshToken = signRefreshToken({ sub: user.id });

    return res.status(200).json({
      user: { id: user.id, email: user.email, role: user.role },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    logger.error({ err, email }, "login: db error");
    return res.status(500).json({ error: "internal error" });
  }
});

authRouter.post("/refresh", async (req, res) => {
  const { refreshToken } = (req.body ?? {}) as { refreshToken?: unknown };

  if (typeof refreshToken !== "string") {
    return res.status(400).json({ error: "refreshToken is required" });
  }

  try {
    const payload = verifyRefreshToken(refreshToken);

    const result = await pool.query(`SELECT id, role FROM users WHERE id = $1`, [payload.sub]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "invalid refresh token" });
    }

    const accessToken = signAccessToken({ sub: user.id, role: user.role });

    return res.status(200).json({ accessToken });
  } catch (err) {
    return res.status(401).json({ error: "invalid or expired refresh token" });
  }
});