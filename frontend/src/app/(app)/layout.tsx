import { Sidebar } from "@/components/Sidebar"
import { AuthGuard } from "@/components/AuthGuard"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-[#F5F4F2]">{children}</main>
      </div>
    </AuthGuard>
  )
}
