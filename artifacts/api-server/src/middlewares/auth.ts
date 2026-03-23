import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable must be set");
  return secret;
})();

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized", message: "No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as { userId: string; role: string };
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized", message: "Invalid token" });
  }
}

export async function requireActiveAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized", message: "No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as { userId: string; role: string };
    req.userId = decoded.userId;
    req.userRole = decoded.role;

    const users = await db.select({ status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId))
      .limit(1);

    if (!users.length) {
      res.status(401).json({ error: "Unauthorized", message: "User not found" });
      return;
    }

    const { status } = users[0];
    if (status === "PENDING") {
      res.status(403).json({ error: "Forbidden", message: "Email not verified", code: "EMAIL_NOT_VERIFIED" });
      return;
    }
    if (status === "SUSPENDED") {
      res.status(403).json({ error: "Forbidden", message: "Account suspended" });
      return;
    }

    next();
  } catch {
    res.status(401).json({ error: "Unauthorized", message: "Invalid token" });
  }
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  await requireActiveAuth(req, res, async () => {
    if (req.userRole !== "ADMIN") {
      res.status(403).json({ error: "Forbidden", message: "Admin access required" });
      return;
    }
    next();
  });
}

export function signToken(userId: string, role: string, rememberMe = false): string {
  return jwt.sign(
    { userId, role },
    JWT_SECRET,
    { expiresIn: rememberMe ? "30d" : "24h" }
  );
}
