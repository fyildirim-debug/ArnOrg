// Ortak çalışmanın kabuk çözümlemesi (0.0.8): komutun apaçık yazdığı dosyalar, ortak projede yasak git komutları ve
// salt okunur komutlar. Yollar posix kurallarıyla; Windows biçimi ayrıca denenir.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { komutuCoz, kokte, parcala, type YolTuru } from "./ortak-calisma/kabuk.js";
import { kiraAnahtari, KiraDefteri } from "./ortak-calisma/kiralar.js";

const KOK = "/proje";
const ev = "/ev/ada";
/** Testte var olan yollar: src ve dist klasör, src'deki dosyalar ve README.md */
const turler: Record<string, YolTuru> = {
  "/proje/src": "dizin",
  "/proje/src/a.ts": "dosya",
  "/proje/src/b.ts": "dosya",
  "/proje/src/c.tmp": "dosya",
  "/proje/src/.gizli.ts": "dosya",
  "/proje/src/alt": "dizin",
  "/proje/README.md": "dosya",
  "/proje/dist": "dizin",
};
/** Klasörlerin girdileri (joker açılımı) */
const listeler: Record<string, string[]> = { "/proje": ["src", "dist", "README.md"], "/proje/src": ["a.ts", "b.ts", "c.tmp", ".gizli.ts", "alt"], "/proje/dist": [] };
const listele = (y: string) => {
  const l = listeler[y];
  if (!l) throw new Error(`yok: ${y}`);
  return l;
};
const coz = (komut: string, cwd = KOK) => komutuCoz(komut, cwd, KOK, { platform: "linux", evDizini: ev, yolTuru: (y) => turler[y] ?? null, dizinListele: listele });
const hedefler = (komut: string, cwd = KOK) => coz(komut, cwd).hedefler.map((h) => `${path.posix.relative(KOK, h.yol)}${h.dizin ? "/" : ""}`);
const git = (komut: string) => coz(komut).git;

describe("kabuk: parçalara bölme", () => {
  it("tırnak, kaçış, ayraçlar ve yönlendirmeler", () => {
    const p = parcala(`echo "a > b" 'c|d' > x.txt && cat <<'SON' > y.txt\nrm -rf / ; git push\nSON\nls | tee z.txt 2>&1`);
    expect(p.map((x) => x.sozcukler.map((s) => s.metin).join(" "))).toEqual(["echo a > b c|d", "cat", "ls", "tee z.txt"]);
    expect(p[0]!.yonlendirmeler).toEqual([{ op: ">", hedef: { metin: "x.txt", belirsiz: false } }]);
    // Heredoc gövdesi komut değildir; 2>&1 dosya değildir
    expect(p[1]!.yonlendirmeler.map((y) => [y.op, y.hedef?.metin])).toEqual([
      ["<<", "SON"],
      [">", "y.txt"],
    ]);
    expect(p[3]!.yonlendirmeler.map((y) => [y.op, y.hedef?.metin])).toEqual([[">&", "1"]]);
  });

  it("$(…) ve `…` içleri ayrı parça; değişkenli sözcük belirsiz", () => {
    const p = parcala('cp "$(ls *.ts | head -1)" `echo hedef.txt`');
    expect(p[0]!.sozcukler.map((s) => s.belirsiz)).toEqual([false, true, true]);
    expect(p.slice(1).map((x) => x.sozcukler[0]!.metin)).toEqual(["ls", "head", "echo"]);
  });
});

describe("kabuk: yazma hedefleri", () => {
  it("yönlendirme, tee, sed -i, perl -i, touch, truncate, dd", () => {
    expect(hedefler("echo x > a.txt; echo y >> logs/b.log; npm test 2>&1 | tee -a out/test.log > /dev/null")).toEqual(["a.txt", "logs/b.log", "out/test.log"]);
    expect(hedefler("sed -i 's/a/b/' src/a.ts src/b.ts")).toEqual(["src/a.ts", "src/b.ts"]);
    expect(hedefler("sed -i.bak -e 's/a/b/' -e 's/c/d/' x.ts")).toEqual(["x.ts"]);
    expect(hedefler("sed 's/a/b/' src/a.ts > yeni.ts")).toEqual(["yeni.ts"]);
    expect(hedefler("perl -pi -e 's/a/b/' p.pl")).toEqual(["p.pl"]);
    expect(hedefler("touch -d now x y && truncate -s 0 z")).toEqual(["x", "y", "z"]);
    expect(hedefler("dd if=/dev/zero of=disk.img bs=1M count=1")).toEqual(["disk.img"]);
  });

  it("mv iki ucu da, cp hedefi (klasöre kopyada içindeki ad), rm ve rm -r klasör", () => {
    expect(hedefler("mv src/a.ts src/yeni.ts")).toEqual(["src/a.ts", "src/yeni.ts"]);
    expect(hedefler("cp kaynak.ts kopya.ts")).toEqual(["kopya.ts"]);
    expect(hedefler("cp -r x.ts y.ts src")).toEqual(["src/x.ts", "src/y.ts"]);
    expect(hedefler("rm -f eski.ts && rm -rf dist")).toEqual(["eski.ts", "dist/"]);
  });

  it("yeniden adlandırma: klasör taşıma içindekileri kapsar, klasöre taşımada ad korunur, proje dışına taşımada yalnız kaynak", () => {
    expect(hedefler("mv src lib")).toEqual(["src/", "lib/"]);
    expect(hedefler("mv src/a.ts dist")).toEqual(["src/a.ts", "dist/a.ts"]);
    expect(hedefler("mv -t dist src/a.ts README.md")).toEqual(["src/a.ts", "README.md", "dist/a.ts", "dist/README.md"]);
    expect(hedefler("mv src/a.ts src/b.ts dist")).toEqual(["src/a.ts", "src/b.ts", "dist/a.ts", "dist/b.ts"]);
    expect(hedefler("mv src/a.ts ../disari/a.ts && mv /tmp/x.ts src/x.ts")).toEqual(["src/a.ts", "src/x.ts"]);
    // git mv index'e yazar: reddedilir (düz mv kullanılır)
    expect(git("git mv src/a.ts src/b.ts")[0]).toMatchObject({ tur: "ret", neden: "index", komut: "git mv" });
  });

  it("joker diskteki eşleşmelere açılır: gizli ad yalnız noktalı desenle; tırnaklı joker düz addır", () => {
    expect(hedefler("sed -i 's/a/b/' src/*.ts")).toEqual(["src/a.ts", "src/b.ts"]);
    expect(hedefler("rm src/*.tmp src/.*.ts")).toEqual(["src/c.tmp", "src/.gizli.ts"]);
    expect(hedefler("rm -r src/[ab].ts src/al?")).toEqual(["src/a.ts", "src/b.ts", "src/alt/"]);
    expect(hedefler("mv src/*.ts dist")).toEqual(["src/a.ts", "src/b.ts", "dist/a.ts", "dist/b.ts"]);
    expect(hedefler("cat src/*.ts > hepsi.ts")).toEqual(["hepsi.ts"]);
    expect(hedefler("echo x > 'src/*.ts'")).toEqual(["src/*.ts"]);
    // Eşleşme yoksa ya da klasör okunamazsa hedef yok; değişkenli hedef çözülmez
    expect(hedefler("rm src/*.yok yok/*.ts")).toEqual([]);
    expect(coz("echo x > $OUT").hedefler).toEqual([]);
    expect(coz("echo x > $OUT").saltOkunur).toBe(false);
  });

  it("cd sonraki parçaların dizinini değiştirir; proje dışı ve değişkenli hedef sayılmaz", () => {
    expect(hedefler("cd src && echo x > yeni.ts && cd .. && echo y > kok.ts")).toEqual(["src/yeni.ts", "kok.ts"]);
    expect(hedefler("echo x > /tmp/gecici.txt; echo x > ~/not.txt; echo x > $OUT")).toEqual([]);
    expect(hedefler("echo x > ../baska/x.txt; cp src/a.ts /tmp/kopya.ts; tee ../disari.log; sed -i 's/a/b/' /etc/hosts")).toEqual([]);
    // Proje dışındaki bir dizinde göreli yol da dışarıdadır
    expect(hedefler("cd /tmp && echo x > a.txt")).toEqual([]);
    // Boşluklu ve Türkçe harfli ad
    expect(hedefler('echo x > "src/sipariş listesi.ts"')).toEqual(["src/sipariş listesi.ts"]);
    // Alt kabuk
    expect(hedefler(`bash -c "echo a > ic.txt"`)).toEqual(["ic.txt"]);
  });

  it("PowerShell ve cmd komutları", () => {
    expect(hedefler("Set-Content -Path notlar.txt -Value merhaba; Remove-Item -Recurse eski; Move-Item a.txt b.txt")).toEqual(["notlar.txt", "eski/", "a.txt", "b.txt"]);
    expect(hedefler("Out-File rapor.txt")).toEqual(["rapor.txt"]);
    // Yeni ad kaynağın klasöründedir
    expect(hedefler("Rename-Item -Path src/a.ts -NewName yeni.ts; ren README.md BENIOKU.md")).toEqual(["src/a.ts", "src/yeni.ts", "README.md", "BENIOKU.md"]);
    expect(hedefler("Rename-Item src lib")).toEqual(["src/", "lib/"]);
  });

  it("salt okunur: bilinen okuma komutları ve okuyan git; yazan ya da bilinmeyen komut değil", () => {
    expect(coz("ls -la && cat a.ts | grep x | wc -l").saltOkunur).toBe(true);
    expect(coz("git status && git diff HEAD -- src && git log --oneline -5").saltOkunur).toBe(true);
    expect(coz("git branch && git branch --show-current && git tag -l").saltOkunur).toBe(true);
    expect(coz("cat a.ts > b.ts").saltOkunur).toBe(false);
    expect(coz("npm test").saltOkunur).toBe(false);
    expect(coz("node betik.js").saltOkunur).toBe(false);
    expect(coz("npm test > /dev/null 2>&1").saltOkunur).toBe(false);
    expect(coz("echo x > /dev/null").saltOkunur).toBe(true);
  });
});

describe("kabuk: ortak projede git", () => {
  it("okuyan git komutları serbest", () => {
    for (const k of ["git status", "git diff --stat", "git log -3", "git show HEAD", "git blame a.ts", "git grep foo", "git stash list", "git config --get user.name", "git remote -v", "git fetch origin", "git worktree list", "git rev-parse HEAD"]) {
      expect(git(k), k).toEqual([{ tur: "izin" }]);
    }
  });

  it("aşamaya alma ve commit: index", () => {
    for (const k of ["git add -A", "git add .", "git add --all", "git add src/a.ts", "git commit -a -m x", "git commit -am x", "git commit -m x", "git rm a.ts", "git mv a b", "git reset", "git reset HEAD a.ts", "git restore --staged a.ts"]) {
      expect(git(k)[0], k).toMatchObject({ tur: "ret", neden: "index" });
    }
  });

  it("değişiklikleri silen ya da saklayanlar: geri alma", () => {
    for (const k of ["git stash", "git stash push -m x", "git stash pop", "git reset --hard", "git reset --hard HEAD~1", "git clean -fd", "git checkout -- .", "git checkout .", "git restore .", "git restore src", "git checkout -f main"]) {
      expect(git(k)[0], k).toMatchObject({ tur: "ret", neden: "geri_alma" });
    }
  });

  it("dal ve geçmiş: switch, checkout <dal>, merge, rebase, pull, cherry-pick, amend", () => {
    for (const k of ["git switch main", "git checkout main", "git checkout -b yeni", "git merge arnorg/x", "git rebase main", "git pull", "git cherry-pick abc", "git commit --amend --no-edit", "git branch -D x", "git tag v1", "git worktree add ../x", "git config user.name Ada", "git fetch origin main:main"]) {
      expect(git(k)[0], k).toMatchObject({ tur: "ret", neden: "dal" });
    }
  });

  it("belirli dosyayı geri almak serbest (kira denetimi çağıranda); bilinmeyen alt komut reddedilir", () => {
    expect(git("git restore src/a.ts")).toEqual([{ tur: "geri_al", dosyalar: ["/proje/src/a.ts"] }]);
    expect(git("git checkout -- README.md src/a.ts")).toEqual([{ tur: "geri_al", dosyalar: ["/proje/README.md", "/proje/src/a.ts"] }]);
    expect(git("git checkout src/a.ts")).toEqual([{ tur: "geri_al", dosyalar: ["/proje/src/a.ts"] }]);
    expect(git("git restore --source HEAD~1 silinen.ts")).toEqual([{ tur: "geri_al", dosyalar: ["/proje/silinen.ts"] }]);
    expect(git("git frobnicate")[0]).toMatchObject({ tur: "ret", neden: "bilinmeyen" });
  });

  it("proje dışında (git -C, cd) çalışan git ortak projeyi etkilemez; zincirdeki yasak yakalanır", () => {
    expect(git("git -C /tmp/deneme add -A")).toEqual([{ tur: "izin" }]);
    expect(git("cd /tmp/deneme && git commit -am x")).toEqual([{ tur: "izin" }]);
    expect(git("git status && git add -A && git commit -m x").map((g) => g.tur)).toEqual(["izin", "ret", "ret"]);
    expect(git("npm test && git pull")[0]).toMatchObject({ tur: "ret", neden: "dal" });
    // push çalışma kopyasına dokunmaz: ortak çalışma kuralı geçirir, uzak depoya gönderimi denetimin onay kuralı sorar
    expect(git("npm test && git push origin main")).toEqual([{ tur: "izin" }]);
  });

  it("Windows yolları: büyük/küçük harf ve ters bölü", () => {
    // Git Bash: tırnaksız ters bölü kaçıştır, tırnak içindeki yol ayracıdır
    const c = komutuCoz('echo x > "src\\Yeni.ts" && git restore README.md', "C:\\Proje", "C:\\Proje", { platform: "win32", evDizini: "C:\\Users\\ada", yolTuru: () => null });
    expect(c.hedefler.map((h) => h.yol)).toEqual(["C:\\Proje\\src\\Yeni.ts"]);
    expect(c.git).toEqual([{ tur: "geri_al", dosyalar: ["C:\\Proje\\README.md"] }]);
    // PowerShell: ters bölü yol ayracı
    const ps = komutuCoz("Set-Content -Path src\\Notlar.md -Value x; git add -A", "C:\\Proje", "C:\\Proje", { platform: "win32", kabuk: "powershell", yolTuru: () => null });
    expect(ps.hedefler.map((h) => h.yol)).toEqual(["C:\\Proje\\src\\Notlar.md"]);
    expect(ps.git[0]).toMatchObject({ tur: "ret", neden: "index" });
    expect(kokte("C:\\Proje", "c:\\proje\\src\\a.ts", "win32")).toBe(true);
    expect(kokte("C:\\Proje", "C:\\Baska\\a.ts", "win32")).toBe(false);
    expect(kokte("C:\\Proje", "C:\\Proje2\\a.ts", "win32")).toBe(false);
    expect(kokte("C:\\Proje", "D:\\Proje\\a.ts", "win32")).toBe(false);
    // İleri bölülü Windows yolu, farklı harf büyüklüğünde cd, proje dışı sürücü ve UNC
    const w = (k: string, kabuk: "bash" | "powershell" = "bash") =>
      komutuCoz(k, "C:\\Proje", "C:\\Proje", { platform: "win32", evDizini: "C:\\Users\\ada", yolTuru: () => null, kabuk }).hedefler.map((h) => h.yol);
    expect(w("echo x > C:/Proje/src/x.ts")).toEqual(["C:\\Proje\\src\\x.ts"]);
    expect(w("cd c:/proje/src && echo x > y.ts")).toEqual(["c:\\proje\\src\\y.ts"]);
    expect(w("echo x > D:/Baska/x.ts; echo x > //sunucu/pay/x.ts")).toEqual([]);
    expect(w("Move-Item -Path src\\a.ts -Destination ..\\Disari\\a.ts", "powershell")).toEqual(["C:\\Proje\\src\\a.ts"]);
    expect(w("Rename-Item -LiteralPath src\\Eski.ts -NewName Yeni.ts", "powershell")).toEqual(["C:\\Proje\\src\\Eski.ts", "C:\\Proje\\src\\Yeni.ts"]);
  });
});

describe("kiralar", () => {
  it("kiralar, başkasınınkini döner, klasör hedefinde içerdekileri bulur, bırakır ve devreder", () => {
    const degisen: string[] = [];
    const d = new KiraDefteri({ degisti: (p) => degisen.push(p), platform: "linux" });
    const istek = (yol: string, ajanId: string, ajanAd: string) => ({ yol, ajanId, ajanAd, gorevId: `g-${ajanId}`, gorevKodu: `T-${ajanId}`, kaynak: "arac" as const });
    expect(d.al("p", istek("src/a.ts", "1", "Deniz"))).toMatchObject({ yeni: true });
    expect(d.al("p", istek("src/a.ts", "1", "Deniz"))).toMatchObject({ yeni: false });
    expect(d.al("p", istek("src/a.ts", "2", "Elif"))).toMatchObject({ cakisma: { ajanAd: "Deniz" } });
    expect(d.cakisan("p", "2", "src/a.ts")?.ajanAd).toBe("Deniz");
    expect(d.cakisan("p", "1", "src/a.ts")).toBeNull();
    expect(d.cakisan("p", "2", "src", true)?.yol).toBe("src/a.ts");
    expect(d.cakisan("p", "2", "srcx", true)).toBeNull();
    expect(d.cakisan("diger", "2", "src/a.ts")).toBeNull();
    d.al("p", istek("README.md", "2", "Elif"));
    expect(d.devret("p", "2", { ajanId: "3", ajanAd: "Mert" })).toBe(1);
    expect(d.sahibi("p", "README.md")?.ajanAd).toBe("Mert");
    expect(d.birak("p", (k) => k.ajanId === "1").map((k) => k.yol)).toEqual(["src/a.ts"]);
    expect(d.liste("p").map((k) => k.yol)).toEqual(["README.md"]);
    expect(degisen.length).toBeGreaterThan(0);
  });

  it("Windows ve macOS'ta anahtar büyük/küçük harf duyarsız", () => {
    expect(kiraAnahtari("Src\\A.ts", "win32")).toBe("src/a.ts");
    expect(kiraAnahtari("Src/A.ts", "darwin")).toBe("src/a.ts");
    expect(kiraAnahtari("Src/A.ts", "linux")).toBe("Src/A.ts");
    const d = new KiraDefteri({ degisti: () => undefined, platform: "win32" });
    d.al("p", { yol: "Src/A.ts", ajanId: "1", ajanAd: "Deniz", gorevId: null, gorevKodu: null, kaynak: "arac" });
    expect(d.cakisan("p", "2", "src/a.ts")?.yol).toBe("Src/A.ts");
  });
});
