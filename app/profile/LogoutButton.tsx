export default function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <button
        type="submit"
        className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 px-4 py-2.5 text-sm font-medium hover:bg-red-500/20 transition"
      >
        Sign out
      </button>
    </form>
  );
}
