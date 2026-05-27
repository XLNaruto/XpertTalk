import { useState, useEffect, useRef } from "react";

const MOBILE_BREAKPOINT = 992;

export default function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth < MOBILE_BREAKPOINT
  );
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleResize = () => {
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => {
        setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
      }, 200);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);

  return isMobile;
}
