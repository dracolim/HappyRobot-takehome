"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"

function HappyRobotLogo() {
  return (
    <svg width="28" height="22" viewBox="0 0 173 137" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M86 85.7496C86 76.134 80.7784 67.2768 72.365 62.6211L60.1565 55.8654C51.7432 51.2097 46.5216 42.3525 46.5216 32.7369V0H0V18.5271C0 28.3146 5.40812 37.301 14.0564 41.8838L25.4221 47.9067C34.0703 52.4896 39.4784 61.4759 39.4784 71.2634V137H86V85.7496Z" fill="#0E0D0C"/>
      <path d="M173 121.106C173 111.395 167.675 102.465 159.13 97.8492L146.43 90.9886C137.886 86.3728 132.561 77.4433 132.561 67.7318V0H86V52.921C86 62.6325 91.3253 71.5619 99.8697 76.1778L112.57 83.0384C121.114 87.6543 126.439 96.5838 126.439 106.295V137H173V121.106Z" fill="#0E0D0C"/>
    </svg>
  )
}

export function RegisterForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError("")
    try {
      const { user } = await api.auth.register({ name, email, password })
      localStorage.setItem("currentUser", JSON.stringify(user))
      router.push("/projects")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-black/[0.06] p-8 w-full max-w-sm">
      <div className="flex items-center gap-3 mb-6">
        <HappyRobotLogo />
        <div>
          <h1 className="text-base font-semibold text-[#0E0D0C]">HappyRobot</h1>
          <p className="text-xs text-[#0E0D0C]/40">Create your account</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#0E0D0C]/70 mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            required
            className="w-full px-3 py-2 text-sm border border-black/10 rounded-lg outline-none focus:border-black/30 focus:ring-2 focus:ring-black/5 transition"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#0E0D0C]/70 mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full px-3 py-2 text-sm border border-black/10 rounded-lg outline-none focus:border-black/30 focus:ring-2 focus:ring-black/5 transition"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#0E0D0C]/70 mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
            className="w-full px-3 py-2 text-sm border border-black/10 rounded-lg outline-none focus:border-black/30 focus:ring-2 focus:ring-black/5 transition"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2 text-sm font-medium text-white bg-[#0E0D0C] rounded-lg hover:bg-black/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="text-sm text-[#0E0D0C]/40 text-center mt-6">
        Already have an account?{" "}
        <Link href="/login" className="text-[#0E0D0C] hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </div>
  )
}
