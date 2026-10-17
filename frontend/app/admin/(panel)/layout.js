import { AdminShell } from '@/components/shell';
import { PlatformBillPopup } from '@/components/Platform';
import { LoginHelpPopup } from '@/components/LoginHelp';

export default function AdminPanelLayout({ children }) {
  return (
    <AdminShell>
      <PlatformBillPopup />
      <LoginHelpPopup />
      {children}
    </AdminShell>
  );
}
