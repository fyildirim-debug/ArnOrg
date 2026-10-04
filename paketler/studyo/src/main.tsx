// Stüdyo giriş noktası
import "@fontsource/anton";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./stiller/tokenlar.css";
import "./stiller/temel.css";
import "./stiller/kabuk.css";
import "./stiller/gorunumler.css";
import "./stiller/hafiza.css";
import "./stiller/kod-zekasi.css";
import "./stiller/kurulum.css";
import "./stiller/sohbet.css";
import "./stiller/zeka.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { anahtariBaslat } from "./api/anahtar";
import { App } from "./App";
import { useDilDurumu } from "./dil";

// Anahtar adres parçasından okunur ve adres çubuğundan silinir; ilk çizimden önce yapılır
anahtariBaslat();
// Belge dili ilk çizimden itibaren arayüz diline uysun (çekirdeğin dili gelince diliAyarla günceller)
document.documentElement.lang = useDilDurumu.getState().dil;

const kok = document.getElementById("kok");
if (!kok) throw new Error("#kok öğesi bulunamadı");

createRoot(kok).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
