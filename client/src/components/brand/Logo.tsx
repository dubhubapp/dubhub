import logoImage from "@assets/dub-hub-logo.png";

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Logo({ className = "", size = 'md' }: LogoProps) {
  const sizeClasses = {
    sm: 'h-8 w-auto',
    md: 'h-12 w-auto',
    lg: 'h-16 w-auto'
  };

  return (
    <img 
      src={logoImage} 
      alt="dub hub" 
      className={`${sizeClasses[size]} ${className}`}
    />
  );
}