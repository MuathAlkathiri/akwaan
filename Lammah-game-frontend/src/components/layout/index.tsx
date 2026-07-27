import { Header } from "./header";
import { Toaster } from "@/components/ui/sonner";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="min-h-screen">
        <div className="container py-8 md:py-12">{children}</div>
      </main>
      <Toaster position="bottom-center" />
    </>
  );
}
