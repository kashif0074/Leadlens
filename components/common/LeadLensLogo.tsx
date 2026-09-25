import Image from "next/image";

interface LogoProps {
  className?: string;
  variant?: "nav" | "sm" | "landing";
}

export default function LeadLensLogo({ className = "", variant = "nav" }: LogoProps) {
  let boxClass = "h-10 w-[118px]";
  if (variant === "sm") {
    boxClass = "h-8 w-8";
  } else if (variant === "landing") {
    boxClass = "h-12 w-[144px] sm:h-14 sm:w-[168px]";
  }

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
        priority={variant === "nav" || variant === "landing"}
        className="h-full w-full object-contain object-left"
      />
    </div>
  );
}
