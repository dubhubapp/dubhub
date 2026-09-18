/** Same 3D D mark as the React splash / native PremiumLaunchMarkBaseline. */
const LOGO_SRC = "/launch/dubhub-premium-launch-mark-baseline.png";
const LOGO_SRCSET = [
  "/launch/dubhub-premium-launch-mark-baseline.png 1x",
  "/launch/dubhub-premium-launch-mark-baseline@2x.png 2x",
  "/launch/dubhub-premium-launch-mark-baseline@3x.png 3x",
].join(", ");

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Logo({ className = "", size = 'md' }: LogoProps) {
  const sizeClasses = {
    sm: 'h-8 w-auto',
    md: 'h-12 w-auto',
    lg: 'h-16 w-auto',
    xl: 'h-20 w-auto',
  };

  return (
    <img 
      src={LOGO_SRC}
      srcSet={LOGO_SRCSET}
      alt="dub hub" 
      className={`${sizeClasses[size]} object-contain ${className}`}
    />
  );
}
