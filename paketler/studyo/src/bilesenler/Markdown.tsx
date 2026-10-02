// Markdown görüntüleyici: marked ile çevrilir, DOMPurify ile temizlenir
import DOMPurify from "dompurify";
import { marked } from "marked";
import { memo, useMemo } from "react";

marked.setOptions({ gfm: true, breaks: false });

// Bağlantılar her zaman yeni pencerede ve güvenli açılır
DOMPurify.addHook("afterSanitizeAttributes", (dugum) => {
  if (dugum.tagName === "A") {
    dugum.setAttribute("target", "_blank");
    dugum.setAttribute("rel", "noopener noreferrer");
  }
});

export function markdownHtml(metin: string): string {
  const ham = marked.parse(metin, { async: false });
  return DOMPurify.sanitize(ham, { USE_PROFILES: { html: true } });
}

export const Markdown = memo(function Markdown({ metin, className = "yazi" }: { metin: string; className?: string }) {
  const html = useMemo(() => markdownHtml(metin), [metin]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
});
