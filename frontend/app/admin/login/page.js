import { redirect } from 'next/navigation';

// Everyone now logs in on the same page; the mobile number decides what is asked.
export default function AdminLogin() {
  redirect('/');
}
