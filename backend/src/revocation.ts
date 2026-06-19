import { Redis } from "ioredis"

let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379")
  return redis
}

export async function revokeToken(jti: string, ttlSeconds: number): Promise<void> {
  if (ttlSeconds > 0) await getRedis().set(`revoked:${jti}`, "1", "EX", ttlSeconds)
}

export async function isRevoked(jti: string): Promise<boolean> {
  return (await getRedis().exists(`revoked:${jti}`)) === 1
}
