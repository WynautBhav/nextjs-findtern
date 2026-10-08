import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium text-brand-700">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900">Page not found</h1>
      <p className="mt-2 text-sm text-text-subtle">The page you are looking for does not exist or has moved.</p>
      <Link href="/" className="mt-6 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
        Back to home
      </Link>
    </div>
  );
}
