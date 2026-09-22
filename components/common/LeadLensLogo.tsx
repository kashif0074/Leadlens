import Image from "next/image";

interface LogoProps {
  className?: string;
  variant?: "nav" | "sm";
}

export default function LeadLensLogo({ className = "", variant = "nav" }: LogoProps) {
  const boxClass = variant === "sm" ? "h-8 w-8" : "h-10 w-[118px]";

  return (
    <div
      className={`relative flex shrink-0 items-center overflow-hidden ${boxClass} ${className}`}
      aria-label="LeadLens"
    >
      <Image
        src="/leadlens-official-logo.png"
        alt="LeadLens"
        width={768}
        height={768}
        priority={variant === "nav"}
        className="h-full w-full object-contain object-left"
      />
    </div>
  );
}
