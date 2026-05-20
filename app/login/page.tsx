import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-2">Object Tracking Evaluation</h1>
        <p className="text-neutral-400 text-sm mb-6">
          Enter your email to get a sign-in link.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
