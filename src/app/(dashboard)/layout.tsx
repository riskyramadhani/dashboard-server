import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-noc-bg noc-grid-bg">
      <Navbar />
      <Sidebar />
      <main className="pt-16 pl-60 transition-all duration-300">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
