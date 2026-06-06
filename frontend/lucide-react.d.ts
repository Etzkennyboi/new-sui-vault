declare module 'lucide-react' {
  import { ComponentType, SVGProps } from 'react';
  
  export interface IconProps extends SVGProps<SVGSVGElement> {
    size?: string | number;
    color?: string;
    strokeWidth?: string | number;
  }
  
  export type Icon = ComponentType<IconProps>;
  
  export const Shield: Icon;
  export const Database: Icon;
  export const Cpu: Icon;
  export const ExternalLink: Icon;
  export const ArrowRight: Icon;
  export const Loader2: Icon;
  export const ArrowLeft: Icon;
  export const TrendingUp: Icon;
  export const ShieldCheck: Icon;
  export const RefreshCw: Icon;
  export const Activity: Icon;
  export const Terminal: Icon;
  export const ArrowRightLeft: Icon;
  export const CheckCircle2: Icon;
}
