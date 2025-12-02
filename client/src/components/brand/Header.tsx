import { Logo } from './Logo';

interface HeaderProps {
  title?: string;
  showLogo?: boolean;
  className?: string;
}

export function Header({ title, showLogo = true, className = "" }: HeaderProps) {
  return (
    <header className={`flex items-center justify-between p-4 bg-background border-b border-border ${className}`}>
      <div className="flex items-center space-x-3">
        {showLogo && <Logo size="md" />}
        {title && <h1 className="text-xl font-bold text-foreground">{title}</h1>}
      </div>
    </header>
  );
}