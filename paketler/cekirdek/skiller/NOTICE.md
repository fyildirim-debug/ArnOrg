# Skill kütüphanesi: kaynaklar ve lisanslar (NOTICE)

Bu klasördeki skiller ArnOrg'a ait değildir; aşağıdaki açık kaynak depolardan, yazarlarının yazdığı hâliyle alınmıştır.
Her skill klasöründe kaynağının lisans dosyası durur (`LICENSE` ya da `LICENSE.txt`). ArnOrg'un kendi kodu MIT lisanslıdır;
skiller kendi lisanslarıyla (MIT ya da Apache-2.0) dağıtılır. Seçim aitmpl.com kataloğundan (davila7/claude-code-templates)
ve onun beslendiği kaynak depolardan yapılmıştır; her skill, kataloğun kopyası yerine doğrudan kaynak deposundaki hâlinden alınmıştır.

## Seçim ölçütleri

- Düz Claude Code skilli: geçerli ön bilgili (frontmatter) `SKILL.md` ve isteğe bağlı yanındaki dosyalar; kendi içinde tamam.
- Ücretli hizmet, API anahtarı ya da MCP sunucusu gerektirmez (Chrome DevTools MCP gibi araçları yalnız "varsa" anan skiller kabul edildi).
- Windows ya da Linux'ta çalışmayan işletim sistemine bağlı betik içermez.
- ArnOrg kurallarıyla çatışmaz: kendiliğinden push ya da commit, Claude imzası istemez.
- Lisansı MIT içindeki bir depoda yeniden dağıtıma izin verir (MIT, Apache-2.0, BSD, atıflı CC-BY). Kaynağı açık olmayan,
  tescilli ya da belirsiz lisanslı skiller alınmadı.

## Değişiklikler

İçerik değiştirilmedi. Yalnız şunlar yapıldı:

- `systematic-debugging`: `find-polluter.sh` (bash betiği; Windows'ta Git Bash olmadan çalışmaz) kopyalanmadı.
  `root-cause-tracing.md` bu betiği anar; ajan aynı ikiye bölme aramasını elle yapar.
- `vercel-react-best-practices`: kaynak klasörün adı `react-best-practices`; klasör, skillin `name` alanına uysun diye
  `vercel-react-best-practices` adıyla kondu. Depo lisans dosyası içermediğinden, deponun beyan ettiği MIT lisansının
  metni `LICENSE` olarak eklendi.
- `humanizer`: depo kökü skillin kendisidir; yalnız `SKILL.md` ve `LICENSE` alındı (depo belgeleri ve paket doğrulama betiği alınmadı).
- Kendi lisans dosyası olmayan skillere kaynak deponun kök `LICENSE` dosyası kopyalandı.

## Üçüncü taraf içerik

- `crafting-effective-readmes/references/art-of-readme.md`: Kira Oakley (hackergrrl), "Art of README",
  https://github.com/hackergrrl/art-of-readme, Creative Commons Attribution 2.0 (dosyanın sonunda belirtilir).
- `crafting-effective-readmes/references/standard-readme-*.md`: Richard Litt ve katkıcılar, "Standard Readme",
  https://github.com/RichardLitt/standard-readme, MIT.
- `crafting-effective-readmes/references/make-a-readme.md`: Danny Guo, "Make a README", https://github.com/dguo/make-a-readme, MIT.
- `humanizer`: örüntü listesi fikri Wikipedia'nın "Signs of AI writing" sayfasından gelir; metin yazarın kendi metnidir (MIT).
- `security-best-practices`, `security-threat-model`: OpenAI'ın Codex için yazdığı skiller; `agents/openai.yaml` yalnız Codex arayüzünün
  kullandığı tanım dosyasıdır, Claude Code onu okumaz.

## Skiller

| Skill | Kaynak depo | Yol | Commit | Lisans | Telif |
|---|---|---|---|---|---|
| `systematic-debugging` | [obra/superpowers](https://github.com/obra/superpowers) | `skills/systematic-debugging` | `8ca22dba9a94` | MIT | 2025 Jesse Vincent |
| `verification-before-completion` | [obra/superpowers](https://github.com/obra/superpowers) | `skills/verification-before-completion` | `8ca22dba9a94` | MIT | 2025 Jesse Vincent |
| `test-driven-development` | [obra/superpowers](https://github.com/obra/superpowers) | `skills/test-driven-development` | `8ca22dba9a94` | MIT | 2025 Jesse Vincent |
| `webapp-testing` | [anthropics/skills](https://github.com/anthropics/skills) | `skills/webapp-testing` | `8a1541c4a3ff` | Apache-2.0 | Anthropic, PBC |
| `e2e-testing-patterns` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/developer-essentials/skills/e2e-testing-patterns` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `javascript-testing-patterns` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/javascript-typescript/skills/javascript-testing-patterns` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `python-testing-patterns` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/python-development/skills/python-testing-patterns` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `code-review-excellence` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/developer-essentials/skills/code-review-excellence` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `receiving-code-review` | [obra/superpowers](https://github.com/obra/superpowers) | `skills/receiving-code-review` | `8ca22dba9a94` | MIT | 2025 Jesse Vincent |
| `api-design-principles` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/backend-development/skills/api-design-principles` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `error-handling-patterns` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/developer-essentials/skills/error-handling-patterns` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `nodejs-backend-patterns` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/javascript-typescript/skills/nodejs-backend-patterns` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `supabase-postgres-best-practices` | [supabase/agent-skills](https://github.com/supabase/agent-skills) | `skills/supabase-postgres-best-practices` | `c9be0e931b79` | MIT | 2026 Supabase |
| `sql-optimization-patterns` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/developer-essentials/skills/sql-optimization-patterns` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `architecture-patterns` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/backend-development/skills/architecture-patterns` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `architecture-decision-records` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/documentation-generation/skills/architecture-decision-records` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `c4-architecture` | [softaworks/agent-toolkit](https://github.com/softaworks/agent-toolkit) | `skills/c4-architecture` | `3027f20f3181` | MIT | 2026 Leonardo Flores |
| `vercel-react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `skills/react-best-practices` | `063bee94c3f4` | MIT | Vercel |
| `accessibility` | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) | `skills/accessibility` | `afa8da942115` | MIT | 2026 Addy Osmani |
| `performance` | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) | `skills/performance` | `afa8da942115` | MIT | 2026 Addy Osmani |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) | `skills/frontend-design` | `8a1541c4a3ff` | Apache-2.0 | Anthropic, PBC |
| `design-system-patterns` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/ui-design/skills/design-system-patterns` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `visual-design-foundations` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/ui-design/skills/visual-design-foundations` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `security-threat-model` | [openai/skills](https://github.com/openai/skills) | `skills/.curated/security-threat-model` | `49f948faa925` | Apache-2.0 | OpenAI |
| `security-best-practices` | [openai/skills](https://github.com/openai/skills) | `skills/.curated/security-best-practices` | `49f948faa925` | Apache-2.0 | OpenAI |
| `auth-implementation-patterns` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/developer-essentials/skills/auth-implementation-patterns` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `secrets-management` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/cicd-automation/skills/secrets-management` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `github-actions-templates` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/cicd-automation/skills/github-actions-templates` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `deployment-pipeline-design` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/cicd-automation/skills/deployment-pipeline-design` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `crafting-effective-readmes` | [softaworks/agent-toolkit](https://github.com/softaworks/agent-toolkit) | `skills/crafting-effective-readmes` | `3027f20f3181` | MIT | 2026 Leonardo Flores |
| `mermaid-diagrams` | [softaworks/agent-toolkit](https://github.com/softaworks/agent-toolkit) | `skills/mermaid-diagrams` | `3027f20f3181` | MIT | 2026 Leonardo Flores |
| `openapi-spec-generation` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/documentation-generation/skills/openapi-spec-generation` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `humanizer` | [blader/humanizer](https://github.com/blader/humanizer) | `.` | `225a6f39ac85` | MIT | 2025 Siqi Chen |
| `competitive-landscape` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/startup-business-analyst/skills/competitive-landscape` | `46891e7e60da` | MIT | 2024 Seth Hobson |
| `customer-research` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | `skills/customer-research` | `dda3841f0b29` | MIT | 2025 Corey Haines |
| `copywriting` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | `skills/copywriting` | `dda3841f0b29` | MIT | 2025 Corey Haines |
| `launch` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | `skills/launch` | `dda3841f0b29` | MIT | 2025 Corey Haines |

Tam commit kimlikleri, aitmpl.com kataloğundaki karşılıkları ve rol eşlemesi `katalog.json` dosyasındadır.

## Güncelleme

Bir skili güncellemek için kaynak depodaki klasörü yeni commit'ten olduğu gibi kopyalayın, `katalog.json`'daki `commit`
alanını değiştirin ve `npx vitest run paketler/cekirdek/src/skiller.test.ts` ile katalog bütünlüğünü denetleyin.
