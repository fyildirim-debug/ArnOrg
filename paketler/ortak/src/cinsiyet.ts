// Adın cinsiyeti: işe alımda ve eski çalışanlarda ofis karakteri adla uyuşsun diye (karakterler.ts, karakterSec).
// Yalnız ilk ad bakılır; Türkçe ve İngilizce adlar tanınır. Deniz, Derin, Ekin, Umut, Alex, Sam gibi iki cinsiyette
// de kullanılan adlar ve tanınmayan adlar bilinmiyor (null) döner: o zaman karakter yalnız role göre seçilir.
// Karşılaştırma Türkçe İ/ı'yı doğru küçültür ve aksanları yok sayar: "IŞIL", "Işıl" ve "isil" aynı addır.

export type Cinsiyet = "kadin" | "erkek";

const HARFLER: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };

/** Karşılaştırma biçimi: Türkçe kurallarla küçük harf, aksansız, yalnız a–z */
export function adSadelestir(metin: string): string {
  return metin
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (h) => HARFLER[h] ?? h)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z]/g, "");
}

function kume(...listeler: string[]): Set<string> {
  return new Set(listeler.flatMap((l) => l.split(/\s+/)).map(adSadelestir).filter(Boolean));
}

/** İki cinsiyette de yaygın adlar: bilinmiyor sayılır */
const IKISI_DE = kume(
  "Deniz Derin Ekin Umut Ümit Ege Evren Çağrı Bilge Kader Aytaç Aydan Gökçe Cemre Görkem Ömür Tuna Şafak Sezer Yücel Elvan Ümran Doğa",
  "Arya Toprak Mercan İlkay Işık Eser Arın Çağdaş Özgür Irmak Nurhan Ayhan Yüksel Erden Gülen",
  "Alex Sam Jordan Taylor Morgan Casey Riley Jamie Charlie Robin Kim Lee Quinn Avery Jesse Jessie Drew Pat Chris Dana Kelly Cameron",
  "Skyler Rowan Sage Blair Reese Hayden Peyton Parker Emerson Finley Kai Remy Shay Toni Frankie Billie Jo Leslie Terry Tracy Marion",
  "Jean Sasha Nikita Angel Ariel Devon Jody Kendall Ashley Sydney Rory Ellis Robbie Alexis Andy",
);

const KADIN = kume(
  // Türkçe
  "Ada Afra Ahsen Akasya Alara Alya Asel Asena Asiye Aslı Asuman Asya Ayben Aybüke Ayça Aygül Aylin Aynur Aysel Ayşe Ayşegül Ayşen",
  "Ayşenur Aysu Ayten Azra Bahar Banu Begüm Belgin Belinay Bengü Beren Berfin Berna Berrak Betül Beyza Burcu Buse Büşra Canan Cansu",
  "Ceren Ceyda Ceylan Cemile Çağla Çiğdem Damla Defne Demet Derya Dicle Didem Dilan Dilara Dilay Dilek Dilşad Duru Duygu Ebru Ecem",
  "Ecrin Ece Eda Ela Elanur Elçin Elif Elifnaz Elis Eliz Emel Emine Esila Esin Eslem Esma Esra Ezgi Fadime Fatma Feride Feyza Fidan",
  "Figen Filiz Funda Fulya Gamze Gizem Gonca Gül Gülay Gülbahar Gülçin Güler Gülizar Gülnur Gülsüm Gülşah Gülşen Gülten Hacer Hale",
  "Hande Handan Hatice Havva Hayal Hazal Hilal Hira Hiranur Hülya Ilgın İlayda İnci İpek İrem Işıl Jale Kevser Kübra Lale Leman Leyla",
  "Lerzan Mehtap Melda Melek Melike Melis Melisa Meltem Meral Merve Meryem Mihriban Mine Miray Mukaddes Müge Münevver Nagehan Nazan",
  "Nazlı Necla Nehir Nergis Neriman Nermin Nesrin Neslihan Neşe Nevin Nida Nihal Nihan Nil Nilay Nilüfer Nisa Nisan Nur Nuray Nurdan",
  "Nurten Oya Öykü Özge Özlem Pelin Pembe Perihan Pınar Rabia Rana Ravza Reyhan Rukiye Rümeysa Rüya Saadet Sabiha Sanem Seda Selen",
  "Selin Selma Sema Semra Sena Senem Serap Serpil Serra Sevda Sevgi Sevil Sevim Sevinç Sezen Sıla Sibel Simay Simge Sinem Songül Su",
  "Sude Sudenur Sultan Suna Şebnem Şenay Şermin Şeyma Şule Tansu Tuana Tuba Tuğba Tuğçe Tülay Tülin Türkan Ülkü Yağmur Yaren Yasemin",
  "Yeliz Yeşim Yıldız Yüsra Zehra Zeliha Zerrin Zeynep Zübeyde Zuhal Zümra Zeren Gülcan Sevcan Nurcan Ayla Aysun Ayşın Bihter Şükran",
  "Eylül Mina Mira Lina Lara Masal Melodi Dila Bade Kumsal İkra Elisa Nazlıcan Beril Hilal İlknur Gülsen Saliha Hatun Hacer Medine",
  // İngilizce
  "Abigail Adele Adriana Agnes Aileen Alexandra Alice Alicia Alison Allison Amanda Amber Amelia Amy Andrea Angela Angelina Anita Ann",
  "Anna Anne Annie April Ariana Audrey Aurora Ava Barbara Beatrice Becky Bella Bernadette Beth Bethany Betty Beverly Bianca Bonnie",
  "Brenda Bridget Brittany Brooke Camila Carla Carmen Carol Caroline Carolyn Cassandra Catherine Cecilia Celia Charlotte Chelsea Cheryl",
  "Chloe Christina Christine Cindy Claire Clara Claudia Colleen Cora Courtney Crystal Cynthia Daisy Danielle Daphne Deborah Debra Delia",
  "Denise Diana Diane Donna Dora Doris Dorothy Edith Eleanor Elena Eliza Elizabeth Ella Ellen Ellie Eloise Elsa Emilia Emily Emma Erica",
  "Erin Esther Eva Evelyn Faith Felicity Fiona Florence Frances Freya Gabriella Gabrielle Gemma Georgia Geraldine Gina Gloria Grace",
  "Gwen Hailey Hannah Harriet Hazel Heather Heidi Helen Helena Hilda Holly Ida Imogen Ingrid Irene Iris Isabel Isabella Isla Ivy",
  "Jacqueline Jade Jane Janet Janice Jasmine Jenna Jennifer Jenny Jessica Jill Joan Joanna Jocelyn Josephine Joy Joyce Judith Judy",
  "Julia Julie Juliet June Karen Kate Katherine Kathleen Kathryn Katie Kayla Kimberly Kristen Laura Lauren Layla Leah Leila Lena",
  "Lillian Lily Linda Lisa Lola Lorraine Louise Lucia Lucy Luna Lydia Mabel Madeline Madison Maggie Maisie Mandy Margaret Margot Maria",
  "Marie Marilyn Martha Mary Matilda Maya Megan Melanie Melissa Mia Michelle Mila Mildred Miranda Molly Monica Nadia Nancy Naomi",
  "Natalie Natasha Nicole Nina Nora Norma Olivia Paige Pamela Patricia Paula Pauline Penelope Phoebe Phyllis Piper Polly Priscilla",
  "Rachel Rebecca Regina Renee Rita Roberta Rosa Rose Rosemary Ruby Ruth Sabrina Sally Samantha Sandra Sara Sarah Scarlett Selena",
  "Serena Sharon Sheila Shirley Sienna Sofia Sophia Sophie Stella Stephanie Susan Suzanne Sylvia Tamara Tanya Teresa Theresa Tiffany",
  "Tina Ursula Valerie Vanessa Vera Veronica Victoria Violet Virginia Vivian Wanda Wendy Whitney Willow Yvonne Zara Zoe Zoey",
  "Lila Kira Nova Maeve Sadie Hallie Margo Esme Elise Greta Hattie Elsie Rosie Millie Tilly Evie Lottie Ingrid Astrid Freya",
);

const ERKEK = kume(
  // Türkçe
  "Abdullah Adem Adnan Ahmet Akif Akın Alaattin Ali Alican Alihan Alp Alparslan Alper Alperen Altan Anıl Aras Arda Arif Aslan Ata",
  "Atakan Ataberk Atilla Atlas Ayaz Aybars Aydın Aykut Aziz Bahadır Baki Baran Barış Bartu Batu Batuhan Bayram Bekir Berat Berk",
  "Berkay Berkan Bilal Bora Bülent Burak Burhan Can Caner Cankat Celal Cem Cemal Cemil Cenk Cengiz Cevdet Cihan Coşkun Cüneyt Çağan",
  "Çağatay Çınar Davut Doğan Doğukan Doruk Dursun Ediz Efe Egemen Ekrem Emin Emir Emirhan Emre Emrah Enes Engin Enver Eray Ercan",
  "Erdal Erdem Erdoğan Eren Ergün Erhan Erkan Erol Ersin Ertan Ertuğrul Eymen Faruk Fatih Ferhat Ferit Fethi Fevzi Fikret Fırat",
  "Furkan Gökay Gökhan Göktuğ Güven Gürkan Hakan Haldun Halil Halit Hamdi Hamza Harun Hasan Hikmet Hilmi Hulusi Hüseyin Hüsnü Ilgaz",
  "İbrahim İhsan İlhan İlker İlyas İrfan İsa İsmail İsmet İzzet Kaan Kadir Kağan Kamil Kaya Kemal Kenan Kerem Kerim Koray Korkut",
  "Kubilay Kudret Kuzey Kutay Levent Lütfi Mahir Mahmut Mehmet Melih Mert Mesut Mete Metin Mithat Muammer Muhammed Muhammet Muharrem",
  "Murat Musa Mustafa Mücahit Mümin Nadir Necati Necip Nedim Nevzat Nihat Nuri Nusret Oğuz Oğuzhan Okan Oktay Onur Orhan Orkun Osman",
  "Ozan Ömer Önder Özcan Özer Polat Poyraz Rahmi Ramazan Rasim Recep Refik Remzi Rıdvan Rıza Rüştü Rüzgar Sabri Sadık Sait Salih Sami",
  "Sarp Savaş Sedat Sefa Selahattin Selçuk Selim Semih Serdar Serhat Serkan Sertaç Sinan Soner Suat Süleyman Şahin Şakir Şenol Şükrü",
  "Taha Tahir Tahsin Talha Tamer Taner Tarık Tarkan Tayfun Taylan Teoman Timur Tolga Tuğrul Tuncay Tunç Turan Turgay Turgut Uğur Ufuk",
  "Uras Utku Uygar Vahit Vedat Veli Volkan Yağız Yahya Yakup Yalçın Yasin Yaşar Yavuz Yener Yiğit Yılmaz Yunus Yusuf Zafer Zekeriya",
  "Zeki Ziya Mirza Mazlum Gültekin Nurettin Nurullah Alaettin Hayri Halim Bedir Bulut Asaf Metehan Berke Tuğra Yiğitcan Emirhan",
  "Göktürk Oğulcan Onurcan Burakcan Tarık Hayati Haydar Cafer Sabahattin Necmettin Şeref İlkin Mazhar",
  // İngilizce
  "Aaron Abraham Adam Adrian Aiden Alan Albert Alexander Alfred Andrew Anthony Antonio Arthur Austin Barry Ben Benjamin Bernard Bill",
  "Billy Blake Bob Bobby Brad Bradley Brandon Brian Bruce Bryan Caleb Calvin Carl Carlos Charles Chad Christian Christopher Clark",
  "Clifford Clint Cody Colin Connor Craig Curtis Dale Damian Daniel Darren Dave David Dean Dennis Derek Dominic Don Donald Douglas",
  "Duncan Dustin Dylan Earl Eddie Edgar Edward Edwin Elijah Elliot Elliott Emmett Eric Ernest Ethan Eugene Evan Ezra Felix Fernando",
  "Finn Floyd Frank Franklin Fred Frederick Gabriel Gary Gavin George Gerald Gilbert Glenn Gordon Graham Grant Greg Gregory Harold",
  "Harry Harvey Hector Henry Herbert Howard Hugh Hugo Hunter Ian Isaac Isaiah Ivan Jack Jackson Jacob Jake James Jared Jason Jasper",
  "Jay Jeff Jeffrey Jeremy Jerome Jerry Jim Jimmy Joe Joel John Johnny Jonah Jonathan Joseph Joshua Juan Julian Justin Karl Keith",
  "Kenneth Kevin Kurt Kyle Lance Larry Lawrence Leo Leon Leonard Levi Liam Lloyd Logan Louis Lucas Luke Malcolm Marcus Mark Martin",
  "Marvin Mason Matthew Matt Max Maxwell Michael Mike Miles Milo Mitchell Nathan Nathaniel Neil Nicholas Nick Nigel Noah Nolan Norman",
  "Oliver Oscar Owen Patrick Paul Peter Philip Phillip Ralph Randy Raymond Ray Richard Rick Robert Rob Roger Roland Ronald Ron Ross",
  "Roy Rupert Russell Ryan Samuel Scott Sean Sebastian Seth Shane Simon Spencer Stanley Stephen Steve Steven Stuart Ted Theo Theodore",
  "Thomas Timothy Tim Todd Tom Tony Travis Trevor Troy Tyler Victor Vincent Walter Warren Wayne Wesley William Will Wyatt Xavier",
  "Zachary Zack Arlo Jude Asher Eli Silas Rhys Ollie Archie Freddie Alfie Reggie Toby Seb Hamish Callum Angus Lewis",
);

/** Testler için: listeler (karşılaştırma biçiminde) */
export const AD_LISTELERI: { readonly kadin: ReadonlySet<string>; readonly erkek: ReadonlySet<string>; readonly ikisiDe: ReadonlySet<string> } = {
  kadin: KADIN,
  erkek: ERKEK,
  ikisiDe: IKISI_DE,
};

/** Ad ya da soyadından önce gelen unvanlar: cinsiyet söyleyenler ve atlananlar */
const UNVAN_KADIN = kume("Bayan Hanım Hanımefendi Mrs Ms Miss Madam Lady");
const UNVAN_ERKEK = kume("Bay Bey Beyefendi Mr Sir Lord");
const UNVAN_NOTR = kume("Dr Doç Prof Sayın Av Müh Mx");

/**
 * Adın cinsiyeti: ilk ad (unvanlar atlanır; "Bay", "Mrs" gibi unvanlar cinsiyeti söyler) Türkçe ya da İngilizce ad
 * listesinde aranır. İki cinsiyette de kullanılan ya da tanınmayan adda null; "Mimar Bey" gibi sondaki Bey/Hanım
 * da sayılır.
 */
export function adCinsiyeti(ad: string | null | undefined): Cinsiyet | null {
  const parcalar = (ad ?? "")
    .split(/[\s._-]+/)
    .map(adSadelestir)
    .filter(Boolean);
  let i = 0;
  while (i < parcalar.length - 1 && UNVAN_NOTR.has(parcalar[i]!)) i++;
  const ilk = parcalar[i];
  if (!ilk) return null;
  if (UNVAN_KADIN.has(ilk)) return "kadin";
  if (UNVAN_ERKEK.has(ilk)) return "erkek";
  if (IKISI_DE.has(ilk)) return null;
  if (KADIN.has(ilk)) return "kadin";
  if (ERKEK.has(ilk)) return "erkek";
  // Tanınmayan ilk ad: sondaki unvan ("Pusula Hanım", "Mimar Bey")
  const son = parcalar.length > i + 1 ? parcalar[parcalar.length - 1]! : null;
  if (son && UNVAN_KADIN.has(son)) return "kadin";
  if (son && UNVAN_ERKEK.has(son)) return "erkek";
  return null;
}
