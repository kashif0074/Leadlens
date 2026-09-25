"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import LeadLensLogo from "@/components/common/LeadLensLogo";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";

function getErrorMessage(error: string | null): string | null {
  if (!error) return null;
  switch (error) {
    case "OAuthSignin":
      return "Could not initialize Google sign-in. Please try again.";
    case "OAuthCallback":
      return "Could not complete authorization with Google. Please check your network and Google credentials.";
    case "OAuthCreateAccount":
      return "Unable to save your Google profile to the database. Please try again.";
    case "OAuthAccountNotLinked":
      return "This email is already associated with another login provider. Please sign in with that provider.";
    case "Configuration":
      return "Authentication configuration issue. Ensure Google Client ID and Client Secret are properly configured.";
    case "AccessDenied":
      return "Sign-in access was denied. Please grant the requested permissions to continue.";
    case "Verification":
      return "The sign-in request has expired or has already been used. Please try again.";
    default:
      return "An authentication error occurred. Please try signing in again.";
  }
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const errorCode = searchParams.get("error");
  const errorMessage = getErrorMessage(errorCode);

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      router.replace(callbackUrl);
    }
  }, [status, session, router, callbackUrl]);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      await signIn("google", { callbackUrl });
    } catch {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-3xl border border-[#E3E8E7] bg-white p-8 shadow-xl">
      <div className="flex items-center justify-between">
        <LeadLensLogo variant="nav" />
        <Link
          href="/"
          className="flex items-center gap-1 text-xs font-semibold text-[#5A6672] transition-colors hover:text-[#045C5C]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Home
        </Link>
      </div>

      <div className="mt-8">
        <h1 className="font-serif text-2xl font-bold tracking-tight text-[#1B2632]">
          Sign in to LeadLens
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#5A6672]">
          Access your outbound intelligence workspace, manage leads, and launch safeguarded campaigns.
        </p>
      </div>

      {errorMessage && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs leading-relaxed text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
          <div>
            <p className="font-bold">Authentication Notice</p>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      <div className="mt-7">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSigningIn || status === "loading"}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-[#D8E2E1] bg-white px-5 py-3.5 text-sm font-semibold text-[#1B2632] shadow-xs transition-all hover:border-[#1B2632] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
        >
          {isSigningIn || status === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-[#045C5C]" />
              <span>Connecting to Google...</span>
            </>
          ) : (
            <>
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>
      </div>

      <div className="mt-8 border-t border-[#E3E8E7] pt-5 text-center">
        <p className="text-xs text-[#5A6672]">
          By continuing, you agree to LeadLens Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F9F8] px-5 py-12">
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-sm text-[#5A6672]">
            <Loader2 className="h-4 w-4 animate-spin text-[#045C5C]" />
            Loading authentication...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}