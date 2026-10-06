// Ortak çalışmanın araçları (mcp__arnorg__*, 0.0.8): isi_kaydet (ara kayıt), calisma_farki (görevin kayıtları ve
// kaydedilmemiş değişiklikleri), calisma_durumu (kim ne üzerinde, kiralar, tempo, son kayıtlar) ve yalnız CEO için
// ekip_temposu. arnorg-araclari.ts listeye tek satırla katar.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import type { Ajan, GorevKaydi } from "@arnorg/ortak";
import { z } from "zod";
import { iki } from "../dil.js";
import { rolAdiDilde, rolBul } from "../roller.js";
import type { Sirket } from "../sirket.js";
import { kisalt } from "../yardimci.js";
import { calismaFarki, commitFarki } from "./git-kayit.js";
import { kayitKunyesi } from "./talimat.js";

type Sonuc = { content: { type: "text"; text: string }[]; isError?: boolean };

function metin(t: string): Sonuc {
  return { content: [{ type: "text", text: t }] };
}

async function guvenli(f: () => Promise<Sonuc> | Sonuc): Promise<Sonuc> {
  try {
    return await f();
  } catch (h) {
    return { content: [{ type: "text", text: (h as Error).message }], isError: true };
  }
}

/** Ajana dönen farkın en çok uzunluğu */
const FARK_SINIRI = 60_000;

/** Kaydın kalite durumu, kısa */
export function kaliteKisa(k: GorevKaydi): string {
  const d = k.kalite.durum;
  if (d === "gecti") return iki("testler geçti", "tests passed");
  if (d === "kaldi") return iki("testler geçmedi", "tests failed");
  if (d === "zaman_asimi") return iki("testler zaman aşımına uğradı", "tests timed out");
  if (d === "hata") return iki("denetim yapılamadı", "check could not run");
  if (d === "testsiz") return iki("test komutu yok", "no test command");
  if (d === "atlandi") return iki("denetim atlandı", "check skipped");
  return iki("testler sürüyor", "tests running");
}

export function ortakCalismaAraclari(sirket: Sirket, ajanId: string) {
  const ben = () => sirket.ajan(ajanId);
  const proje = () => sirket.proje(ben().projeId);
  const rol = () => rolBul(ben().rol);
  const inceleyebilir = () => Boolean(rol()?.yonetici) || ["inceleme", "test", "guvenlik"].includes(rol()?.kimlik ?? "");
  const ajanBul = (ad: string): Ajan => {
    const a = sirket.depo.ajanAdla(ben().projeId, ad.replace(/^@/, "").trim());
    if (!a) throw new Error(iki(`"${ad}" adında çalışan yok. Ekibi ekip_listele ile gör.`, `No employee named "${ad}". See the team with ekip_listele.`));
    return a;
  };
  const ceo = rol()?.kimlik === "ceo";

  const araclar = [
    tool(
      "isi_kaydet",
      iki(
        "Süren görevinin şu ana dek değiştirdiğin dosyalarını çalışma dalına ara kayıt olarak commit'ler (\"<görev kodu> <başlık>\"); kiraların biter, testler arka planda koşar. Görevi 'inceleme'ye alınca ArnOrg zaten kaydeder; bunu uzun bir işin ortasında sağlam bir noktayı saklamak için kullan.",
        "Commits the files you have changed so far for your task in progress to the working branch as an interim save (\"<task code> <title>\"); your leases end and the tests run in the background. ArnOrg saves anyway when you move the task to 'inceleme'; use this to keep a solid checkpoint in the middle of long work.",
      ),
      { ozet: z.string().max(2000).optional().describe(iki("Commit gövdesine yazılacak kısa özet", "A short summary for the commit body")) },
      (a) =>
        guvenli(async () => {
          const { gorev, kayit } = await sirket.ortak.isiKaydet(ben(), a.ozet);
          if (!kayit) return metin(iki(`${gorev.kod} için kaydedilecek değişiklik yok.`, `Nothing to save for ${gorev.kod}.`));
          return metin(
            iki(
              `${gorev.kod} kaydedildi: ${kayitKunyesi(kayit)}.${kayit.kalite.durum === "testsiz" ? "" : " Testler arka planda koşuyor; geçmezse sana haber verilir."}`,
              `${gorev.kod} saved: ${kayitKunyesi(kayit)}.${kayit.kalite.durum === "testsiz" ? "" : " The tests are running in the background; you will be told if they fail."}`,
            ),
          );
        }),
    ),
    tool(
      "calisma_farki",
      iki(
        "Bir görevin ortak projedeki değişikliklerini gösterir: ArnOrg'un o görev için attığı commit'ler ve sahibinin henüz kaydedilmemiş (kiralı) dosyaları. İnceleme için; gorev ya da ajan ver (ajan verilirse onun süren ya da son görevi).",
        "Shows a task's changes in the shared project: the commits ArnOrg made for it and its owner's not-yet-saved (leased) files. For review; give gorev or ajan (with ajan, their task in progress or their latest one).",
      ),
      {
        gorev: z.string().optional().describe(iki("Görev kodu, ör. T-12", "Task code, e.g. T-12")),
        ajan: z.string().optional().describe(iki("Çalışan adı", "Employee name")),
        yol: z.string().optional().describe(iki("Yalnız bu dosya", "Only this file")),
      },
      (a) =>
        guvenli(async () => {
          if (!inceleyebilir()) return { ...metin(iki("Bu aracı yöneticiler, kod inceleyici, test ve güvenlik rolleri kullanabilir.", "This tool is for managers and the code review, test and security roles.")), isError: true };
          const p = proje();
          const sahip = a.ajan ? ajanBul(a.ajan) : null;
          const gorevler = sirket.depo.gorevler(p.id);
          const g = a.gorev
            ? sirket.depo.gorevKoduyla(p.id, a.gorev)
            : sahip
              ? ((sahip.gorevId ? gorevler.find((x) => x.id === sahip.gorevId) : undefined) ?? [...gorevler].reverse().find((x) => x.atananId === sahip.id && x.durum !== "bekleyen" && x.durum !== "planlandi") ?? null)
              : null;
          if (!g) return { ...metin(iki("Görev bulunamadı; gorev (ör. T-12) ya da ajan ver.", "Task not found; give gorev (e.g. T-12) or ajan.")), isError: true };
          const kayitlar = sirket.ortak.defter.gorevin(g.id);
          const kiralar = sirket.ortak.kiralar.liste(p.id).filter((k) => k.gorevId === g.id || (g.atananId !== null && k.ajanId === g.atananId && !k.gorevId));
          const parcalar: string[] = [];
          const ozet: string[] = [];
          for (const k of kayitlar) {
            const f = await commitFarki(p.yol, k.commit, a.yol).catch(() => null);
            if (!f) continue;
            ozet.push(`${k.commit.slice(0, 7)} · ${k.zaman.slice(0, 16).replace("T", " ")} · ${k.ajanAd} · ${kaliteKisa(k)}: ${f.dosyalar.map((d) => `${d.yol} +${d.eklenen} -${d.silinen}`).join(", ") || iki("değişiklik yok", "no changes")}`);
            if (f.fark) parcalar.push(`# ${k.commit.slice(0, 7)} ${k.baslik}\n${f.fark}`);
          }
          const bekleyen = kiralar.map((k) => k.yol).filter((y) => !a.yol || y === a.yol.replace(/\\/g, "/"));
          if (bekleyen.length) {
            const f = await calismaFarki(p.yol, bekleyen);
            if (f.dosyalar.length) {
              ozet.push(iki(`kaydedilmemiş: ${f.dosyalar.map((d) => `${d.yol} +${d.eklenen} -${d.silinen}`).join(", ")}`, `not saved yet: ${f.dosyalar.map((d) => `${d.yol} +${d.eklenen} -${d.silinen}`).join(", ")}`));
              parcalar.push(`# ${iki("kaydedilmemiş değişiklikler", "unsaved changes")}\n${f.fark}`);
            }
          }
          const sahibi = g.atananId ? (sirket.depo.ajan(g.atananId)?.ad ?? "?") : iki("atanmamış", "unassigned");
          const bas = iki(`Görev ${g.kod} "${g.baslik}" · ${sahibi} · ${g.durum} · ${kayitlar.length} kayıt`, `Task ${g.kod} "${g.baslik}" · ${sahibi} · ${g.durum} · ${kayitlar.length} save${kayitlar.length === 1 ? "" : "s"}`);
          if (!ozet.length) return metin(`${bas}\n\n${iki("Bu görev için değişiklik yok.", "No changes for this task.")}`);
          let govde = parcalar.join("\n");
          if (govde.length > FARK_SINIRI) govde = govde.slice(0, FARK_SINIRI) + iki("\n… (kısaltıldı; dosya bazında yol ile isteyin)", "\n… (truncated; ask per file with yol)");
          return metin(`${bas}\n\n${ozet.map((x) => `- ${x}`).join("\n")}\n\n${govde}`);
        }),
    ),
    tool(
      "calisma_durumu",
      iki(
        "Ortak projede kimin ne üzerinde çalıştığını gösterir: her çalışanın durumu, süren görevi ve kiraladığı dosyalar; ekip temposu; son kayıtlar ve testleri. İş bölerken ya da bir dosya başkasındayken bak.",
        "Shows who works on what in the shared project: each employee's status, task in progress and leased files; the team pace; the latest saves and their tests. Look before splitting work or when a file is with someone else.",
      ),
      {},
      () =>
        guvenli(() => {
          const p = proje();
          const t = sirket.ortak.tempo(p.id);
          const kiralar = sirket.ortak.kiralar.liste(p.id);
          const gorevler = sirket.depo.gorevler(p.id);
          const satirlar = sirket.depo
            .ajanlar(p.id)
            .filter((x) => x.rol !== "ceo")
            .map((x) => {
              const suren = gorevler.filter((g) => g.atananId === x.id && g.durum === "calisiliyor").map((g) => `${g.kod} ${kisalt(g.baslik, 60)}`);
              const dosyalar = kiralar.filter((k) => k.ajanId === x.id).map((k) => k.yol);
              return `- ${x.ad} (${rolAdiDilde(x)}) · ${x.durum}${suren.length ? ` · ${suren.join("; ")}` : ` · ${iki("süren görev yok", "no task in progress")}`}${dosyalar.length ? ` · ${iki("dosyalar", "files")}: ${dosyalar.slice(0, 8).join(", ")}${dosyalar.length > 8 ? " …" : ""}` : ""}`;
            });
          const sinir = t.ustSinir > 0 ? String(t.ustSinir) : iki("yok", "none");
          // 0.0.10: kullanım seviyesinin sınırı (Normal 6, Tasarruflu 3)
          const seviye = t.seviyeSiniri ? iki(`; kullanım seviyesi en çok ${t.seviyeSiniri}`, `; the usage level allows at most ${t.seviyeSiniri}`) : "";
          const tempo =
            t.belirleyen === "ceo"
              ? iki(`Ekip temposu: ${t.gecerli || "sınırsız"} (${t.secim ? "CEO belirledi" : "CEO henüz seçmedi; kurulun üst sınırı"}; üst sınır ${sinir}${seviye}) · çalışan ${t.calisan} · sırada ${t.sirada}`, `Team pace: ${t.gecerli || "unlimited"} (${t.secim ? "set by the CEO" : "not set by the CEO yet; the board's ceiling"}; ceiling ${sinir}${seviye}) · working ${t.calisan} · queued ${t.sirada}`)
              : iki(`Aynı anda en çok ${t.gecerli || "sınırsız"} çalışan (kurulun ayarı${seviye}) · çalışan ${t.calisan} · sırada ${t.sirada}`, `At most ${t.gecerli || "unlimited"} employees at once (the board's setting${seviye}) · working ${t.calisan} · queued ${t.sirada}`);
          const kayitlar = sirket.ortak.defter.liste(p.id, 8).map((k) => `- ${k.baslik} · ${k.ajanAd} · ${kayitKunyesi(k)} · ${kaliteKisa(k)}`);
          return metin(
            [
              tempo,
              "",
              iki("Ekip:", "Team:"),
              ...(satirlar.length ? satirlar : [iki("- Henüz çalışan yok.", "- No employees yet.")]),
              "",
              iki("Son kayıtlar:", "Latest saves:"),
              ...(kayitlar.length ? kayitlar : [iki("- Henüz kayıt yok.", "- No saves yet.")]),
            ].join("\n"),
          );
        }),
    ),
  ];
  if (!ceo) return araclar;
  return [
    ...araclar,
    tool(
      "ekip_temposu",
      iki(
        "Tam otonom kipte aynı anda en çok kaç çalışanın çalışacağını belirler (CEO; sen bu sayıya dahil değilsin). Kurulun üst sınırını ve projenin kullanım seviyesinin sınırını (Normal 6, Tasarruflu 3) geçemez. Bağımsız iş çoksa yükselt, işler aynı dosyalarda toplanıyorsa, bütçe ya da abonelik penceresi azalıyorsa düşür. Boşa çıkan çalışanlar tempo izin verdikçe planlı işlerine kendiliğinden başlar.",
        "Sets how many employees work at the same time at most, in fully autonomous mode (CEO; you are not counted). It cannot exceed the board's ceiling or the project's usage level limit (Normal 6, Economy 3). Raise it when there is plenty of independent work; lower it when tasks crowd onto the same files or the budget or the subscription window runs low. Idle employees start their planned tasks by themselves as the pace allows.",
      ),
      {
        es_zamanli: z.number().int().min(1).max(50).describe(iki("Aynı anda en çok çalışan sayısı", "The most employees working at once")),
        gerekce: z.string().min(5).max(500).describe(iki("Kısa gerekçe; #genel'e yazılır", "A short reason; posted to #general")),
      },
      (a) =>
        guvenli(() => {
          const t = sirket.ortak.tempoYaz(ben(), a.es_zamanli, a.gerekce);
          const kirpildi = t.ustSinir > 0 && a.es_zamanli > t.ustSinir;
          // 0.0.10: seviyenin sınırı kurulun üst sınırından darsa o kırpar
          const seviyeKirpti = t.seviyeSiniri > 0 && a.es_zamanli > t.seviyeSiniri && (!t.ustSinir || t.seviyeSiniri < t.ustSinir);
          return metin(
            iki(
              `Ekip temposu ${t.gecerli} oldu${seviyeKirpti ? ` (projenin kullanım seviyesi en çok ${t.seviyeSiniri} çalışana izin veriyor; seviyeyi kurul seçer)` : kirpildi ? ` (kurulun üst sınırı ${t.ustSinir}; daha fazlası için kurula sor)` : t.ustSinir ? ` (kurulun üst sınırı ${t.ustSinir})` : ""}. Şu an ${t.calisan} çalışan çalışıyor, ${t.sirada} sırada; boştakiler tempo izin verdikçe planlı işlerine geçer.`,
              `The team pace is now ${t.gecerli}${seviyeKirpti ? ` (the project's usage level allows at most ${t.seviyeSiniri} employees; the board picks the level)` : kirpildi ? ` (the board's ceiling is ${t.ustSinir}; ask the board for more)` : t.ustSinir ? ` (the board's ceiling is ${t.ustSinir})` : ""}. ${t.calisan} working now, ${t.sirada} queued; idle employees move on to their planned tasks as the pace allows.`,
            ),
          );
        }),
    ),
  ];
}
