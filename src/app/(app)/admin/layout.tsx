/** Admin pages: also marks the page so the developer "N" button may show here (see globals.css). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className="show-dev-tools" hidden />
      {children}
    </>
  );
}
