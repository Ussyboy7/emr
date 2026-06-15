import { Activity, Droplets, Syringe } from 'lucide-react';

export function getNursingOrderIcon(type: string) {
  switch (type) {
    case 'Injection':
      return <Syringe className="h-3.5 w-3.5 text-rose-600" />;
    case 'Dressing':
      return <Activity className="h-3.5 w-3.5 text-amber-600" />;
    case 'IV Infusion':
      return <Droplets className="h-3.5 w-3.5 text-sky-600" />;
    default:
      return <Syringe className="h-3.5 w-3.5 text-cyan-600" />;
  }
}
