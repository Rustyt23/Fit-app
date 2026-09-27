"use client";

/** Logs out, and first wipes this phone's offline copy of the Today page so the next person can't see it. */
export default function LogoutButton({ action, label }: { action: () => Promise<void>; label: string }) {
  return (
    <form
      action={action}
      onSubmit={() => {
        navigator.serviceWorker?.controller?.postMessage("clear-cache");
      }}
    >
      <button className="btn-ghost w-full">{label}</button>
    </form>
  );
}
