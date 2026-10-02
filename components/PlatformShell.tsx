import Link from "next/link";
import type { ReactNode } from "react";
import { logoutCustomer } from "@/app/account/actions";
export function PublicNav() {
  return (
    <header className="public-nav">
      <Link href="/" className="brand">
        Silicon Paws Retreat
      </Link>
      <nav>
        <Link href="/book">Book a stay</Link>
        <Link href="/account">My account</Link>
        <Link href="/admin/login" className="admin-sign-in">Admin sign in</Link>
      </nav>
    </header>
  );
}
export function CustomerShell({
  name,
  title,
  subtitle,
  children,
}: {
  name: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="platform-wrap">
      <PublicNav />
      <div className="portal-heading">
        <div>
          <p className="eyebrow">
            {name ? `WELCOME, ${name}` : "YOUR PERSONAL DOG BOARDING SPACE"}
          </p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <form action={logoutCustomer}>
          <button className="button secondary">Sign out</button>
        </form>
      </div>
      <nav className="platform-tabs" aria-label="Account navigation">
        <Link href="/account">My bookings</Link>
        <Link href="/account/dogs">My dogs</Link>
        <Link href="/account/profile">Profile & preferences</Link>
        <Link href="/book">+ Book a stay</Link>
      </nav>
      {children}
    </main>
  );
}
