import { AuthShell, PasswordlessLoginForm } from "@/features/auth";

export default function LoginPage() {
  return (
    <AuthShell>
      <PasswordlessLoginForm />
    </AuthShell>
  );
}
