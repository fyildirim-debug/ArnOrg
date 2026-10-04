// Dış bağlantı: masaüstünde sistem tarayıcısında (arnorg.disaridaAc), tarayıcıda yeni sekmede açılır
import type { ReactNode } from "react";
import { disaridaAc, masaustu } from "./kurulumYardimcilari";

export function DisBaglanti({
  href,
  children,
  className,
  title,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={className}
      title={title}
      onClick={(e) => {
        // Tarayıcıda bağlantı kendi işini görür (yeni sekme, sağ tık, kopyalama)
        if (!masaustu()?.disaridaAc) return;
        e.preventDefault();
        disaridaAc(href);
      }}
    >
      {children}
    </a>
  );
}
