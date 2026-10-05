// Türkçe uygulama menüsü. Windows ve Linux'ta menü çubuğu gizlidir; Alt tuşuyla görünür.

import { Menu, shell, type MenuItemConstructorOptions } from "electron";

/** Açık kaynak deposu: belgeler, kurulum dosyaları ve sorun bildirimi */
const DEPO = "https://github.com/fyildirim-debug/ArnOrg";

export interface MenuEylemleri {
  veriKlasorunuAc(): void;
  kayitKlasorunuAc(): void;
  hakkinda(): void;
}

export function menuyuKur(e: MenuEylemleri): void {
  const ayirici: MenuItemConstructorOptions = { type: "separator" };
  const sablon: MenuItemConstructorOptions[] = [
    {
      label: "Dosya",
      submenu: [
        { label: "Veri klasörünü aç", click: () => e.veriKlasorunuAc() },
        { label: "Kayıt klasörünü aç", click: () => e.kayitKlasorunuAc() },
        ayirici,
        { label: "Çıkış", role: "quit", accelerator: "CmdOrCtrl+Q" },
      ],
    },
    {
      label: "Düzen",
      submenu: [
        { label: "Geri al", role: "undo" },
        { label: "Yinele", role: "redo" },
        ayirici,
        { label: "Kes", role: "cut" },
        { label: "Kopyala", role: "copy" },
        { label: "Yapıştır", role: "paste" },
        { label: "Tümünü seç", role: "selectAll" },
      ],
    },
    {
      label: "Görünüm",
      submenu: [
        { label: "Yeniden yükle", role: "reload" },
        { label: "Zorla yeniden yükle", role: "forceReload" },
        { label: "Geliştirici araçları", role: "toggleDevTools" },
        ayirici,
        { label: "Gerçek boyut", role: "resetZoom" },
        { label: "Yakınlaştır", role: "zoomIn" },
        { label: "Uzaklaştır", role: "zoomOut" },
        ayirici,
        { label: "Tam ekran", role: "togglefullscreen" },
      ],
    },
    {
      label: "Pencere",
      submenu: [
        { label: "Küçült", role: "minimize" },
        { label: "Kapat", role: "close" },
      ],
    },
    {
      label: "Yardım",
      submenu: [
        { label: "Belgeler", click: () => void shell.openExternal(`${DEPO}#readme`) },
        { label: "Sürümler", click: () => void shell.openExternal(`${DEPO}/releases`) },
        { label: "Sorun bildir", click: () => void shell.openExternal(`${DEPO}/issues`) },
        { label: "Kayıt klasörünü aç", click: () => e.kayitKlasorunuAc() },
        ayirici,
        { label: "ArnOrg hakkında", click: () => e.hakkinda() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(sablon));
}
