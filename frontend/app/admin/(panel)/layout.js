import { AdminShell } from '@/components/shell';
import { PlatformBillPopup } from '@/components/Platform';

export default function AdminPanelLayout({ children }) {
  return (
    <AdminShell>
      <PlatformBillPopup />
      {children}
    </AdminShell>
  );
}
