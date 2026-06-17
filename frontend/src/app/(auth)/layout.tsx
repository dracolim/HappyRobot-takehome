export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center bg-[#F5F4F2]">
      {children}
    </div>
  )
}
