import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { isRevoked } from "../revocation"

export interface AuthRequest extends Request {
  userId: string
  tokenJti?: string
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  requireAuthAsync(req, res, next).catch(next)
}

async function requireAuthAsync(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cookieToken = req.cookies?.token as string | undefined
  const headerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined
  const token = cookieToken ?? headerToken

  if (!token) {
    res.status(401).json({ error: "Unauthorized" })
    return
  }

  let payload: { sub: string; jti?: string }
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string; jti?: string }
  } catch {
    res.status(401).json({ error: "Unauthorized" })
    return
  }

  if (payload.jti && await isRevoked(payload.jti)) {
    res.status(401).json({ error: "Unauthorized" })
    return
  }

  (req as AuthRequest).userId = payload.sub
  ;(req as AuthRequest).tokenJti = payload.jti
  next()
}
