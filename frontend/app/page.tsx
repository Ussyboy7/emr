import Image from "next/image";
import Link from "next/link";
import { 
  ArrowRight, 
  FileText, 
  Stethoscope, 
  FlaskConical, 
  Pill, 
  ScanLine,
  Heart,
  Users,
  Shield,
  Clock,
  Activity,
  Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NPA_LOGO_URL, NPA_BRAND_NAME, NPA_EMR_TITLE, NPA_EMR_FULL_TITLE, NPA_EMR_CONTACT_EMAIL } from "@/lib/branding";

const modules = [
  {
    title: "Medical Records",
    description:
      "Comprehensive patient record management with complete medical histories, diagnoses, treatment plans, and secure document storage accessible across departments.",
    icon: FileText,
    color: "from-blue-500 to-blue-600",
    bgColor: "bg-blue-500/10",
    href: "/medical-records",
  },
  {
    title: "Nursing",
    description:
      "Digital nursing documentation including vital signs monitoring, care plans, medication administration records, and real-time patient assessments.",
    icon: Heart,
    color: "from-rose-500 to-rose-600",
    bgColor: "bg-rose-500/10",
    href: "/nursing",
  },
  {
    title: "Consultation",
    description:
      "Streamlined physician consultations with appointment scheduling, clinical notes, referral management, and inter-departmental communication.",
    icon: Stethoscope,
    color: "from-emerald-500 to-emerald-600",
    bgColor: "bg-emerald-500/10",
    href: "/consultation",
  },
  {
    title: "Laboratory",
    description:
      "Complete lab workflow management from test ordering to results delivery, with specimen tracking, quality control, and automated reporting.",
    icon: FlaskConical,
    color: "from-amber-500 to-amber-600",
    bgColor: "bg-amber-500/10",
    href: "/laboratory",
  },
  {
    title: "Pharmacy",
    description:
      "Integrated pharmacy operations with prescription management, drug dispensing, inventory control, and drug interaction alerts.",
    icon: Pill,
    color: "from-violet-500 to-violet-600",
    bgColor: "bg-violet-500/10",
    href: "/pharmacy",
  },
  {
    title: "Radiology",
    description:
      "Digital imaging management with study scheduling, image viewing, radiologist reporting, and seamless PACS integration.",
    icon: ScanLine,
    color: "from-cyan-500 to-cyan-600",
    bgColor: "bg-cyan-500/10",
    href: "/radiology",
  },
];

const features = [
  {
    title: "Unified Patient Records",
    description:
      "Single source of truth for all patient data across departments, ensuring continuity of care.",
    icon: Users,
  },
  {
    title: "Real-Time Updates",
    description:
      "Instant synchronization of patient information, lab results, and clinical notes.",
    icon: Activity,
  },
  {
    title: "Enterprise Security",
    description:
      "HIPAA-compliant data protection with role-based access and complete audit trails.",
    icon: Shield,
  },
  {
    title: "24/7 Availability",
    description:
      "Always-on system access ensuring critical patient data is available when needed.",
    icon: Clock,
  },
];

const stats = [
  { value: "6", label: "Integrated Clinical Modules" },
  { value: "24/7", label: "System Availability" },
  { value: "100%", label: "Digital Record Keeping" },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950" suppressHydrationWarning>
      {/* Background Effects */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-900/20 via-slate-950 to-slate-950" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-teal-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-cyan-500/10 blur-[100px]" />
        <div className="absolute top-1/2 left-0 h-[300px] w-[300px] rounded-full bg-emerald-500/5 blur-[80px]" />
        {/* Grid Pattern */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
      </div>

      {/* Header */}
      <header className="border-b border-white/5 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-6 py-5 text-center sm:flex-row sm:text-left">
          <Link href="/" className="flex items-center gap-4">
            <div className="relative h-14 w-14 overflow-hidden rounded-2xl bg-white/10 p-2 ring-1 ring-white/20 backdrop-blur">
              <Image
                src={NPA_LOGO_URL}
                alt={`${NPA_BRAND_NAME} crest`}
                fill
                className="object-contain p-1"
                sizes="56px"
                priority
              />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight text-white">
                {NPA_EMR_TITLE}
              </span>
              <span className="text-sm text-teal-400/80">{NPA_EMR_FULL_TITLE}</span>
            </div>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="#modules" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
              Modules
            </Link>
            <Link href="#features" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
              Features
            </Link>
            <Button asChild className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold gap-2">
              <Link href="/login">
                Access EMR
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="mx-auto mt-20 flex w-full max-w-7xl flex-col items-center gap-8 px-6 text-center sm:mt-28">
        <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/10 border border-teal-500/20 px-4 py-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
          </span>
          <span className="text-sm font-medium text-teal-400">Healthcare Digital Transformation</span>
        </div>
        
        <h1 className="max-w-4xl text-balance text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-cyan-400 to-emerald-400">
            NPA EMR
          </span>
          <br />
          <span className="text-slate-200">Electronic Medical Records</span>
        </h1>
        
        <p className="max-w-2xl text-lg text-slate-400 leading-relaxed">
          A comprehensive digital healthcare platform unifying medical records, nursing care, 
          consultations, laboratory, pharmacy, and radiology services for the Nigerian Ports Authority.
        </p>
        
        <div className="flex flex-col gap-4 sm:flex-row mt-4">
          <Button asChild size="lg" className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-semibold gap-2 h-14 px-8 text-base">
            <Link href="/login">
              Launch EMR System
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800 hover:text-white h-14 px-8 text-base">
            <Link href="#modules">Explore Modules</Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="mt-16 grid w-full max-w-3xl gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <div 
              key={stat.label} 
              className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur"
            >
              <p className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400">
                {stat.value}
              </p>
              <p className="mt-2 text-sm text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Modules Section */}
      <section id="modules" className="mx-auto mt-32 w-full max-w-7xl px-6">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Clinical Modules
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-slate-400">
            Six integrated modules designed to streamline healthcare operations and improve patient outcomes.
          </p>
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {modules.map((module) => (
            <Link href={module.href} key={module.title}>
              <Card className="group h-full border-slate-800 bg-slate-900/50 backdrop-blur transition-all duration-300 hover:border-slate-700 hover:bg-slate-900/80 hover:shadow-2xl hover:shadow-teal-500/5 hover:-translate-y-1">
                <CardContent className="flex flex-col gap-4 p-6">
                  <div className={`w-14 h-14 rounded-2xl ${module.bgColor} flex items-center justify-center ring-1 ring-white/10`}>
                    <module.icon className={`h-7 w-7 bg-gradient-to-br ${module.color} bg-clip-text text-transparent`} style={{ stroke: 'url(#gradient)' }} />
                    <svg width="0" height="0">
                      <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="currentColor" />
                          <stop offset="100%" stopColor="currentColor" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white group-hover:text-teal-400 transition-colors">
                      {module.title}
                    </h3>
                    <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                      {module.description}
                    </p>
                  </div>
                  <div className="mt-auto pt-4 flex items-center text-sm font-medium text-teal-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    Access Module
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="mx-auto mt-32 w-full max-w-7xl px-6">
        <div className="rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/80 to-slate-950/80 p-12 backdrop-blur">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Enterprise Healthcare Platform
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-slate-400">
              Built with security, reliability, and interoperability at its core.
            </p>
          </div>
          
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div key={feature.title} className="text-center">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center mb-4 ring-1 ring-teal-500/20">
                  <feature.icon className="h-8 w-8 text-teal-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm text-slate-500">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="mx-auto mt-32 w-full max-w-5xl px-6">
        <div className="relative overflow-hidden rounded-3xl border border-teal-500/20 bg-gradient-to-br from-teal-900/30 via-slate-900/50 to-cyan-900/30 p-12 text-center backdrop-blur">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-teal-500/10 via-transparent to-transparent" />
          <div className="relative">
            <Building2 className="mx-auto h-16 w-16 text-teal-400/50 mb-6" />
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to Transform Healthcare Delivery?
            </h2>
            <p className="mt-4 text-slate-400 max-w-xl mx-auto">
              Access the NPA EMR system to manage patient records, streamline clinical workflows, 
              and deliver exceptional healthcare services.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg" className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-semibold gap-2 h-12 px-8">
                <Link href="/login">
                  Sign In to EMR
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800 hover:text-white h-12 px-8">
                <Link href={`mailto:${NPA_EMR_CONTACT_EMAIL}`}>Contact Support</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-32 border-t border-slate-800 bg-slate-950/80">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-10 text-center text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-3">
            <div className="relative h-8 w-8 overflow-hidden rounded-lg bg-white/10">
              <Image
                src={NPA_LOGO_URL}
                alt={`${NPA_BRAND_NAME} crest`}
                fill
                className="object-contain p-1"
                sizes="32px"
              />
            </div>
            <span className="text-slate-400">© {new Date().getFullYear()} Nigerian Ports Authority. All rights reserved.</span>
          </div>
          <div className="flex items-center justify-center gap-6 sm:justify-end">
            <Link href="#modules" className="hover:text-teal-400 transition-colors">
              Modules
            </Link>
            <Link href="#features" className="hover:text-teal-400 transition-colors">
              Features
            </Link>
            <Link href={`mailto:${NPA_EMR_CONTACT_EMAIL}`} className="hover:text-teal-400 transition-colors">
              Support
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
