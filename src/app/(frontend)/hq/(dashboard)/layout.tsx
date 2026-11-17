import { AdminNav } from '@/components/admin/AdminNav'
import { requirePageAdmin } from '@/lib/server/guards'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePageAdmin()
  return (
    <>
      <AdminNav user={admin} />
      {children}
    </>
  )
}
