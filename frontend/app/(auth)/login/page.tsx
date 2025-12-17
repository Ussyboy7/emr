"use client";

import { logError } from '@/lib/client-logger';
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  ArrowRight, 
  Eye, 
  EyeOff,
  Stethoscope,
  Heart,
  FlaskConical,
  Pill,
  ScanLine,
  FileText,
  ShieldCheck,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { NPA_LOGO_URL, NPA_BRAND_NAME, NPA_EMR_TITLE, NPA_EMR_FULL_TITLE, NPA_EMR_CONTACT_EMAIL } from "@/lib/branding";
import { login, clearTokens } from "@/lib/api-client";
import { getStoredRedirectPath } from "@/hooks/use-auth-redirect";



const modules = [
  { name: "Medical Records", icon: FileText, color: "text-blue-400" },
  { name: "Nursing", icon: Heart, color: "text-rose-400" },
  { name: "Consultation", icon: Stethoscope, color: "text-emerald-400" },
  { name: "Laboratory", icon: FlaskConical, color: "text-amber-400" },
  { name: "Pharmacy", icon: Pill, color: "text-violet-400" },
  { name: "Radiology", icon: ScanLine, color: "text-cyan-400" },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsSubmitting(true);

    try {
      if (!username || !password) {
        toast.error("Enter your username and password.");
        return;
      }

      await login(username, password);

      if (rememberMe) {
        localStorage.setItem("npa_emr_remember_me", JSON.stringify({ username }));
      } else {
        localStorage.removeItem("npa_emr_remember_me");
      }

      toast.success("Signed in successfully");
      
      // Check if there's a stored redirect path
      const redirectPath = getStoredRedirectPath();
      router.push(redirectPath || "/dashboard");
    } catch (error) {
      logError(error);
      clearTokens();
      toast.error(
        error instanceof Error ? error.message : "Unable to sign in. Please check your credentials."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-teal-900/30 via-slate-950 to-slate-950" />
          <div className="absolute top-20 left-20 h-[400px] w-[400px] rounded-full bg-teal-500/10 blur-[100px]" />
          <div className="absolute bottom-20 right-20 h-[300px] w-[300px] rounded-full bg-cyan-500/10 blur-[80px]" />
          {/* Grid Pattern */}
          <div 
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
              backgroundSize: '40px 40px'
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo & Title */}
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-white/10 p-2 ring-1 ring-white/20 backdrop-blur">
              <Image
                src={NPA_LOGO_URL}
                alt={`${NPA_BRAND_NAME} crest`}
                fill
                sizes="64px"
                className="object-contain p-1"
                priority
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{NPA_EMR_TITLE}</h1>
              <p className="text-teal-400">{NPA_EMR_FULL_TITLE}</p>
            </div>
          </div>

          {/* Main Content */}
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/10 border border-teal-500/20 px-4 py-2">
              <Activity className="h-4 w-4 text-teal-400" />
              <span className="text-sm font-medium text-teal-400">Healthcare Digital Platform</span>
            </div>
            
            <div className="space-y-4">
              <h2 className="text-4xl font-bold leading-tight text-white max-w-lg">
                Unified Healthcare Management for{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400">
                  NPA Medical Services
                </span>
              </h2>
              <p className="text-lg text-slate-400 max-w-md leading-relaxed">
                Access patient records, manage clinical workflows, and deliver quality healthcare 
                through a single integrated platform.
              </p>
            </div>

            {/* Modules Preview */}
            <div className="grid grid-cols-3 gap-3 max-w-md">
              {modules.map((module) => (
                <div 
                  key={module.name}
                  className="flex items-center gap-2 rounded-xl bg-slate-900/50 border border-slate-800 px-3 py-2.5 backdrop-blur"
                >
                  <module.icon className={`h-4 w-4 ${module.color}`} />
                  <span className="text-xs font-medium text-slate-300">{module.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Support:{" "}
              <a 
                className="text-teal-400 hover:text-teal-300 transition-colors" 
                href={`mailto:${NPA_EMR_CONTACT_EMAIL}`}
              >
                {NPA_EMR_CONTACT_EMAIL}
              </a>
            </p>
            <p className="text-sm text-slate-600">
              © {new Date().getFullYear()} Nigerian Ports Authority. All rights reserved.
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 sm:px-8 lg:px-12">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Header */}
          <div className="flex items-center justify-between lg:hidden">
            <Link 
              href="/" 
              className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/20">
                <Image
                  src={NPA_LOGO_URL}
                  alt={`${NPA_BRAND_NAME} crest`}
                  fill
                  sizes="40px"
                  className="object-contain p-1"
                />
              </div>
              <span className="font-semibold text-white">{NPA_EMR_TITLE}</span>
            </div>
          </div>

          {/* Desktop Back Link */}
          <Link 
            href="/" 
            className="hidden lg:inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to landing
          </Link>

          {/* Login Card */}
          <Card className="border-slate-800 bg-slate-900/50 backdrop-blur shadow-2xl">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl font-bold text-white">
                Sign in to EMR
              </CardTitle>
              <CardDescription className="text-slate-400">
                Enter your credentials to access the Electronic Medical Records system.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-slate-300">Username</Label>
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-teal-500 focus:ring-teal-500/20"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-300">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-teal-500 focus:ring-teal-500/20 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                    <Checkbox
                      checked={rememberMe}
                      onCheckedChange={(value) => setRememberMe(Boolean(value))}
                      className="border-slate-600 data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500"
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-sm font-medium text-teal-400 hover:text-teal-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-semibold h-11 gap-2" 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <div className="h-4 w-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 pt-6 border-t border-slate-800">
                <p className="text-center text-sm text-slate-500">
                  Need access? Contact the{" "}
                  <a 
                    href={`mailto:${NPA_EMR_CONTACT_EMAIL}`}
                    className="text-teal-400 hover:text-teal-300"
                  >
                    EMR Support Team
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Security Notice */}
          <div className="flex items-center justify-center gap-2 text-xs text-slate-600">
            <ShieldCheck className="h-4 w-4" />
            <span>Secure connection • Patient data protected</span>
          </div>
        </div>
      </div>

      {/* Forgot Password Dialog */}
      <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Reset Password</DialogTitle>
            <DialogDescription className="text-slate-400">
              To reset your password, please contact the EMR Support Team. They will assist you with password recovery and account access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-4">
              <p className="text-sm font-medium text-slate-300 mb-2">Contact Information:</p>
              <p className="text-sm text-slate-400">
                Email:{" "}
                <a
                  href={`mailto:${NPA_EMR_CONTACT_EMAIL}?subject=Password Reset Request&body=Please assist with resetting my EMR account password.`}
                  className="text-teal-400 hover:text-teal-300"
                >
                  {NPA_EMR_CONTACT_EMAIL}
                </a>
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button 
                variant="outline" 
                onClick={() => setShowForgotPassword(false)}
                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                Close
              </Button>
              <Button 
                asChild
                className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950"
              >
                <a href={`mailto:${NPA_EMR_CONTACT_EMAIL}?subject=Password Reset Request&body=Please assist with resetting my EMR account password.`}>
                  Send Email
                </a>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
