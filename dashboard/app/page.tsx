import { redirect } from 'next/navigation';

export default function RootPage() {
  // Redirect to login since we don't have a public landing page
  redirect('/auth/login');
}