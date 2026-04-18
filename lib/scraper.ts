import * as cheerio from 'cheerio';
import type { ScrapedData, ColorVariant } from './product-processor';

async function fetchPage(url: string): Promise<string> {
  // PartSouq is behind Cloudflare — use Playwright to render it in a real browser
  if (url.includes('partsouq.com')) {
    return fetchWithPlaywright(url);
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

async function fetchWithPlaywright(url: string): Promise<string> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-US',
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      // @ts-expect-error patching chrome runtime for fingerprint evasion
      window.chrome = { runtime: {} };
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for Cloudflare to resolve
    await page.waitForFunction(
      () => !document.title.includes('Just a moment'),
      { timeout: 20000 }
    ).catch(() => {});
    await page.waitForTimeout(3000);
    return await page.content();
  } finally {
    await browser.close();
  }
}

function clean(t: string, maxLen = 4000): string {
  return t.replace(/\s+/g, ' ').replace(/[\r\n]+/g, '\n').trim().substring(0, maxLen);
}

function pickImages($: cheerio.CheerioAPI, selector: string, attr = 'src', max = 8): string[] {
  const urls: string[] = [];
  $(selector).each((_, el) => {
    if (urls.length >= max) return false;
    let src = $(el).attr(attr) || $(el).attr('data-src') || $(el).attr('data-lazy-src') || '';
    if (src.startsWith('//')) src = 'https:' + src;
    if (src.startsWith('http') && !src.match(/placeholder|blank|logo|icon|sprite|pixel|tracking/i)) {
      urls.push(src);
    }
  });
  return [...new Set(urls)];
}

// ── Universal spec extraction from raw text ─────────────────────────────────

function extractSpecsFromText(text: string): Record<string, string> {
  const s: Record<string, string> = {};
  const t = text;

  // Battery
  const bat = t.match(/(\d{3,6})\s*mAh/i);
  if (bat) s.battery = bat[0];

  // RAM + ROM combos: "8GB+256GB", "8GB RAM 256GB ROM", "8/256GB"
  const ram1 = t.match(/(\d+)\s*GB\s*[+\/]\s*(\d+)\s*(?:GB|T)/i);
  const ram2 = t.match(/(\d+)\s*GB\s*RAM[,\s]+(\d+)\s*GB\s*(?:ROM|Storage)/i);
  const ram3 = t.match(/(\d+)\s*GB\s*RAM/i);
  if (ram1) s.ramRom = `${ram1[1]}GB + ${ram1[2]}GB`;
  else if (ram2) s.ramRom = `${ram2[1]}GB + ${ram2[2]}GB`;
  else if (ram3) s.ramRom = ram3[0];

  // Display
  const disp = t.match(/(\d+\.?\d*)\s*[""′]?\s*(?:inch|inches|"|″|IPS|AMOLED|LCD|TFT|FHD)/i);
  if (disp) s.displaySize = `${disp[1]} inch`;

  // Resolution
  const res = t.match(/(\d{3,4})\s*[x×]\s*(\d{3,4})\s*(?:pixels?|px|resolution)?/i);
  if (res) s.resolution = `${res[1]}×${res[2]}`;

  // OS
  const os = t.match(/Android\s*[\d.]+|Android\s*\d+|iOS\s*[\d.]+|HarmonyOS\s*[\d.]+/i);
  if (os) s.os = os[0];

  // CPU/Processor
  const cpu = t.match(/(?:Processor|CPU|Chipset)[:\s]+([^\n,;.]{5,60})/i)
    || t.match(/(?:MediaTek\s+\w+|Snapdragon\s+\d+\w*|Dimensity\s+\d+\w*|Helio\s+\w+|Unisoc\s+\w+|Kirin\s+\d+\w*)/i);
  if (cpu) s.cpu = (cpu[1] || cpu[0]).trim();

  // GPU
  const gpu = t.match(/(?:GPU|Graphics)[:\s]+([^\n,;.]{5,50})/i)
    || t.match(/(?:Mali-\w+|Adreno\s+\d+|PowerVR\s+\w+|IMG\s+\w+)/i);
  if (gpu) s.gpu = (gpu[1] || gpu[0]).trim();

  // Rear camera
  const rearCam = t.match(/(?:Rear|Back|Main|Triple|Dual|Quad)\s*(?:Camera|Cam)[:\s]+([^\n;.]{5,60})/i)
    || t.match(/(\d{1,3}MP\s*\+\s*\d+MP\s*\+?\s*\d*MP?)/i);
  if (rearCam) s.rearCamera = (rearCam[1] || rearCam[0]).trim();

  // Front camera
  const frontCam = t.match(/(?:Front|Selfie|Forward)\s*(?:Camera|Cam)[:\s]+([^\n;.]{5,50})/i)
    || t.match(/(\d{1,3})\s*MP\s*(?:Front|Selfie|forward)/i);
  if (frontCam) s.frontCamera = (frontCam[1] || frontCam[0]).trim();

  // Network
  const net = t.match(/\b(5G|4G\s*LTE|4G|3G|2G)\b/i);
  if (net) s.network = net[0].toUpperCase();

  // SIM
  const sim = t.match(/(?:Dual|Triple|Single|Nano|Micro|eSIM)[- ]*(?:Nano[- ]*)?SIM/i);
  if (sim) s.sim = sim[0];

  // NFC
  if (/\bNFC\b/i.test(t)) s.nfc = 'Yes';

  // Waterproof rating
  const ip = t.match(/IP\s*(?:68|69K?|67|66|65)\s*(?:\/\s*IP\s*(?:68|69K?|67|66|65))?/i)
    || t.match(/MIL-STD-810[HG]?/i);
  if (ip) s.waterproof = ip[0];

  // Dimensions
  const dim = t.match(/(\d{2,3}\.?\d*)\s*[x×]\s*(\d{2,3}\.?\d*)\s*[x×]\s*(\d{1,2}\.?\d*)\s*mm/i);
  if (dim) s.dimensions = `${dim[1]}×${dim[2]}×${dim[3]}mm`;

  // Weight
  const wt = t.match(/(\d{2,4})\s*(?:grams?|g)\b/i);
  if (wt) s.weight = `${wt[1]}g`;

  // Biometrics
  const bio = t.match(/(?:fingerprint|face\s*(?:id|unlock|recognition)|iris\s*scanner)[^,;\n]{0,30}/i);
  if (bio) s.biometrics = bio[0].trim();

  // Sensors
  const sens = t.match(/(?:Sensors?)[:\s]+([^\n;.]{10,120})/i);
  if (sens) s.sensors = sens[1].trim();

  // Part number
  const pn = t.match(/(?:Part\s*(?:Number|No\.?|#))[:\s]+([A-Z0-9\-]{3,25})/i);
  if (pn) s.partNumber = pn[1];

  // Material
  const mat = t.match(/(?:Material)[:\s]+([^\n,;.]{3,50})/i);
  if (mat) s.material = mat[1].trim();

  // Compatibility
  const compat = t.match(/(?:Compatible\s*with|Fits?)[:\s]+([^\n;.]{5,120})/i)
    || t.match(/(?:Compatibility)[:\s]+([^\n;.]{5,120})/i);
  if (compat) s.compatibility = compat[1].trim();

  // Bluetooth
  const bt = t.match(/Bluetooth\s*[\d.]+/i);
  if (bt) s.bluetooth = bt[0];

  // USB/Charging
  const usb = t.match(/(?:USB\s*Type-?C|USB-?C|Micro\s*USB|Lightning)[^,;\n]{0,20}/i);
  if (usb) s.usbCharging = usb[0].trim();

  // Color
  const color = t.match(/(?:Color|Colour)[:\s]+([^\n,;.]{3,30})/i);
  if (color) s.color = color[1].trim();

  // GPS
  if (/\bGPS\b.*?(?:\bGLONASS\b|\bBeidou\b|\bGalileo\b)?/i.test(t)) {
    const gps = t.match(/GPS[^,;\n.]{0,40}/i);
    if (gps) s.gps = gps[0].trim();
  }

  // Band/Frequency
  const bands = t.match(/(?:Frequency|Band)[:\s]+([^\n;.]{5,80})/i);
  if (bands) s.bands = bands[1].trim();

  return s;
}

// ── What's in the box extractor ────────────────────────────────────────────

function extractBoxContents(text: string): string[] {
  const contents: string[] = [];

  const boxSection = text.match(
    /(?:What[''']?s?\s+in\s+the\s+[Bb]ox|Package\s+(?:Contents?|Includes?)|In\s+the\s+[Bb]ox|Accessories?\s+Included|Box\s+(?:Contents?|Includes?)|Packing\s+List)[:\s]*([^]{0,600}?)(?:\n\n|\n[A-Z][a-z]{2,}|$)/i
  );

  if (boxSection) {
    const section = boxSection[1];
    const items = section.split(/[\n•·\-\*\d+\.]+/)
      .map(s => s.trim())
      .filter(s => s.length > 2 && s.length < 80 && /[a-zA-Z]/.test(s));
    contents.push(...items);
  }

  if (contents.length === 0) {
    // Fallback: qty patterns like "1x Phone", "Phone x1"
    const lines = text.split(/[\n;]+/);
    lines.forEach(line => {
      const l = line.trim();
      if (/^[\d×xX]+\s*[×xX]\s*\w|[×xX]\s*\d+$/.test(l) && l.length > 3 && l.length < 80) {
        contents.push(l);
      }
    });
  }

  const seen = new Set<string>();
  return contents.filter(c => {
    const k = c.toLowerCase().trim();
    if (seen.has(k) || k.length < 3) return false;
    seen.add(k);
    return true;
  }).slice(0, 10);
}

// ── Key features extractor ──────────────────────────────────────────────────

function extractKeyFeatures(text: string): string[] {
  const features: string[] = [];

  const section = text.match(
    /(?:Key\s+Features?|Highlights?|Main\s+Features?|Why\s+Choose|Product\s+Features?|Feature)[:\s]*([^]{0,800}?)(?:\n\n|\n[A-Z][a-z]{2,}|$)/i
  );

  const raw = section ? section[1] : text.substring(0, 2000);
  const lines = raw.split(/[\n•·\-\*]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10 && s.length < 150 && /[A-Za-z]{3}/.test(s));

  for (const line of lines) {
    if (features.length >= 8) break;
    features.push(line);
  }

  return features;
}

// ── Structured spec table parser ───────────────────────────────────────────

function parseSpecTable($: cheerio.CheerioAPI): Record<string, string> {
  const specs: Record<string, string> = {};

  $('table tr, .specifications tr, .product-specs tr, [class*="spec"] tr').each((_, row) => {
    const cells = $(row).find('td, th');
    if (cells.length >= 2) {
      const key = $(cells[0]).text().trim().toLowerCase().replace(/[:\s]+$/, '');
      const val = $(cells[1]).text().trim();
      if (key && val && val.length < 200) {
        const mapped = mapSpecKey(key);
        if (mapped) specs[mapped] = val;
      }
    }
  });

  $('li, [class*="spec-item"], [class*="feature"]').each((_, el) => {
    const text = $(el).text().trim();
    const m = text.match(/^([^:]{3,40}):\s*(.{2,120})$/);
    if (m) {
      const mapped = mapSpecKey(m[1].toLowerCase());
      if (mapped && !specs[mapped]) specs[mapped] = m[2].trim();
    }
  });

  $('dl').each((_, dl) => {
    const dts = $(dl).find('dt');
    const dds = $(dl).find('dd');
    dts.each((i, dt) => {
      const key = $(dt).text().trim().toLowerCase();
      const val = $(dds.get(i))?.text()?.trim();
      if (key && val) {
        const mapped = mapSpecKey(key);
        if (mapped) specs[mapped] = val;
      }
    });
  });

  return specs;
}

function mapSpecKey(raw: string): string | null {
  const k = raw.toLowerCase().trim();
  if (/cpu|processor|chipset/.test(k)) return 'cpu';
  if (/gpu|graphics/.test(k)) return 'gpu';
  if (/ram|memory|rom|storage/.test(k)) return 'ramRom';
  if (/display|screen size|diagonal/.test(k)) return 'displaySize';
  if (/resolution/.test(k)) return 'resolution';
  if (/os|operating system|android/.test(k)) return 'os';
  if (/rear|back|main|triple.*cam|quad.*cam/.test(k)) return 'rearCamera';
  if (/front|selfie|forward/.test(k)) return 'frontCamera';
  if (/battery/.test(k)) return 'battery';
  if (/network|connectivity|cellular/.test(k)) return 'network';
  if (/sim/.test(k)) return 'sim';
  if (/nfc/.test(k)) return 'nfc';
  if (/waterproof|ip rating|protection|dustproof|mil-std/.test(k)) return 'waterproof';
  if (/sensor/.test(k)) return 'sensors';
  if (/biometric|fingerprint|face/.test(k)) return 'biometrics';
  if (/dimension|size.*mm|l.*w.*h/.test(k)) return 'dimensions';
  if (/weight|mass/.test(k)) return 'weight';
  if (/part.?no|part.?num|item.?no|sku/.test(k)) return 'partNumber';
  if (/material|construction/.test(k)) return 'material';
  if (/compat|fit|for model/.test(k)) return 'compatibility';
  if (/oem/.test(k)) return 'oem';
  if (/bluetooth/.test(k)) return 'bluetooth';
  if (/usb|charging/.test(k)) return 'usbCharging';
  if (/color|colour/.test(k)) return 'color';
  if (/warranty/.test(k)) return 'warranty';
  if (/band|frequency/.test(k)) return 'bands';
  if (/gps/.test(k)) return 'gps';
  return null;
}

// ── Sunsky description parser ──────────────────────────────────────────────
// Sunsky device specs are ONLY in og:description as numbered <br>-separated lines.
// Body text contains category nav/sidebars that pollute regex matches.

function parseSunskyDescription(raw: string, data: ScrapedData): void {
  const lines = raw.split(/<br\s*\/?>|\n/i).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);

  let section = 'main'; // 'main' | 'display' | 'cameras' | 'package'
  const boxContents: string[] = [];

  for (const line of lines) {
    if (/^Display Screen\s*:?$/i.test(line)) { section = 'display'; continue; }
    if (/^Cameras?\s*:?$/i.test(line))        { section = 'cameras'; continue; }
    if (/^Package List\s*:?$/i.test(line))    { section = 'package'; continue; }

    if (section === 'package') {
      const item = line.replace(/^\d+\.\s*/, '').trim();
      if (item) boxContents.push(item);
      continue;
    }

    // Numbered line: "3. Memory: 12GB+512GB"
    const m = line.match(/^\d+\.\s*([\w\s\/\-()]+?)\s*:\s*(.+)$/);
    if (!m) continue;
    const [, key, val] = m;
    const k = key.toLowerCase().trim();
    const v = val.trim();

    if (section === 'main') {
      if (/^cpu$|^processor$/.test(k))               data.specifications.cpu = v;
      else if (/^gpu$|^graphics$/.test(k))            data.specifications.gpu = v;
      else if (/^memory$|^ram$/.test(k))              data.specifications.ramRom = v;
      else if (/^operating system$|^os$/.test(k))     data.specifications.os = v;
      else if (/^battery$/.test(k))                   data.specifications.battery = v;
      else if (/^dimensions?$/.test(k))               data.specifications.dimensions = v;
      else if (/^weight$/.test(k))                    data.specifications.weight = v;
      else if (/^network$/.test(k))                   data.specifications.network = v;
      else if (/^sim$/.test(k))                       data.specifications.sim = v;
      else if (/^nfc$/.test(k))                       data.specifications.nfc = v;
      else if (/waterproof|ip.?rating|protection/.test(k)) data.specifications.waterproof = v;
      else if (/^bluetooth$/.test(k))                 data.specifications.bluetooth = v;
      else if (/^usb|charging/.test(k))              data.specifications.usbCharging = v;
      else if (/^colou?r$/.test(k))                   data.specifications.color = v;
      else if (/^sensor/.test(k))                     data.specifications.sensors = v;
      else if (/^biometric|fingerprint|face/.test(k)) data.specifications.biometrics = v;
      else if (/^gps$/.test(k))                       data.specifications.gps = v;
      else if (/^band|frequency/.test(k))             data.specifications.bands = v;
    } else if (section === 'display') {
      if (/^size$/.test(k)) {
        const inch = v.match(/[\d.]+/)?.[0];
        data.specifications.displaySize = inch ? `${inch} inch` : v;
      } else if (/^screen resolution$|^resolution$/.test(k)) {
        data.specifications.resolution = v.replace(/\s*[xX×]\s*/, '×');
      }
    } else if (section === 'cameras') {
      if (/^rear|^back|^main/.test(k))   data.specifications.rearCamera = v;
      else if (/^front|^selfie/.test(k)) data.specifications.frontCamera = v;
    }
  }

  if (boxContents.length) data.boxContents = boxContents;
}

// ── Color name → hex map ───────────────────────────────────────────────────

const COLOR_HEX: Record<string, string> = {
  black: '#1a1a1a', white: '#f5f5f5', silver: '#c0c0c0', gray: '#808080', grey: '#808080',
  red: '#e53935', blue: '#1565c0', green: '#2e7d32', yellow: '#f9a825', orange: '#e65100',
  purple: '#6a1b9a', pink: '#e91e63', brown: '#4e342e', gold: '#ffc107',
  'night vision': '#1b5e20', 'dark green': '#1b5e20', 'army green': '#4a5240',
  'sky blue': '#0288d1', 'navy blue': '#0d47a1', 'rose gold': '#c47f6e',
  'space gray': '#4a4a4a', titanium: '#878681',
};

function colorToHex(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, hex] of Object.entries(COLOR_HEX)) {
    if (lower.includes(key)) return hex;
  }
  return '#888888';
}

// ── Site extractors ────────────────────────────────────────────────────────

async function extractSunsky($: cheerio.CheerioAPI, data: ScrapedData): Promise<void> {
  // Sunsky displays prices in TTD — we only pull name/brand/description/images from JSON-LD,
  // never price, because their offers.price is TTD not USD
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const ld = JSON.parse($(el).html() || '');
      if (ld['@type'] === 'Product' || ld.name) {
        if (ld.name) data.name = ld.name;
        if (ld.brand?.name) data.brand = ld.brand.name;
        if (ld.description) data.description = clean(ld.description);
        if (ld.image) data.images = (Array.isArray(ld.image) ? ld.image : [ld.image]).slice(0, 8);
        // intentionally skipping ld.offers.price — it's in TTD on Sunsky
      }
    } catch {}
  });

  // Extract USD wholesale price from #main-price or span.bold.red
  const mainPrice = $('#main-price').text().match(/\$\s*([\d,]+\.?\d*)/) || $('span.bold.red').first().text().match(/\$\s*([\d,]+\.?\d*)/);
  if (mainPrice) {
    data.price = parseFloat(mainPrice[1].replace(/,/g, ''));
    data.currency = 'USD';
  }

  const html = $.html();

  // Extract UPLOAD_URL and ITEM_NO from page JS — Sunsky sets these as JS vars
  const uploadUrlMatch = html.match(/UPLOAD_URL\s*=\s*['"]([^'"]+)['"]/);
  const itemNoMatch    = html.match(/ITEM_NO\s*=\s*['"]([^'"]+)['"]/);

  if (itemNoMatch) {
    data.itemNo = itemNoMatch[1];
    const n    = data.itemNo;
    const base = (uploadUrlMatch?.[1] || 'https://img.diylooks.com/upload/store').replace(/\/$/, '');

    // Scrape ALL img tags in the gallery — Sunsky renders them directly in the HTML
    // They use src for the large version and zoom attr for the raw version
    const galleryImgs: string[] = [];
    $('img[zoom], img.zoom, .product-gallery img, #imglist img, li img[src*="detail"]').each((_, el) => {
      const src = $(el).attr('zoom') || $(el).attr('src') || '';
      const full = src.startsWith('//') ? 'https:' + src : src;
      if (full.includes('detail') && full.startsWith('http') && !galleryImgs.includes(full)) {
        galleryImgs.push(full);
      }
    });

    if (galleryImgs.length > 0) {
      // Use scraped gallery + main product shot
      const main = `${base}/product_l/${n}.jpg`;
      data.images = [main, ...galleryImgs].filter((u, i, arr) => arr.indexOf(u) === i).slice(0, 8);
    } else {
      // Fallback: build URLs from known Sunsky patterns
      // Pattern 1: {N}_1.jpg  Pattern 2: {N}_B1.jpg through {N}_B17.jpg
      const candidates = [
        `${base}/product_l/${n}.jpg`,
        `${base}/detail_l/${n}_1.jpg`,
        ...Array.from({ length: 17 }, (_, i) => `${base}/detail_l/${n}_B${i + 1}.jpg`),
      ];
      // HEAD-check each to confirm it exists
      const verified: string[] = [];
      for (const url of candidates) {
        if (verified.length >= 8) break;
        try {
          const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
          if (r.ok) verified.push(url);
        } catch {}
      }
      if (verified.length > 0) data.images = verified;
    }
  }

  // Parse specs from og:description — the clean numbered spec list
  // (body text polluted by category nav/sidebars — never use extractSpecsFromText on Sunsky body)
  const ogDesc = $('meta[property="og:description"]').attr('content') || data.description || '';
  if (ogDesc) parseSunskyDescription(ogDesc, data);

  // Key features: numbered lines from og:description, section headers stripped
  if (!data.keyFeatures?.length && ogDesc) {
    data.keyFeatures = ogDesc
      .split(/<br\s*\/?>|\n/i)
      .map(l => l.replace(/<[^>]+>/g, '').replace(/^\d+\.\s*/, '').trim())
      .filter(l => l.length > 5 && !/^(Display Screen|Cameras?|Package List)/i.test(l))
      .slice(0, 8);
  }

  const stockMatch = html.match(/stock_quantity['":\s]+(\d+)/i) || html.match(/qty_in_stock['":\s]+(\d+)/i);
  if (stockMatch) data.stockQuantity = parseInt(stockMatch[1]);

  // ── Detect color variant links ─────────────────────────────────────────
  // Sunsky color variants share the same item code prefix but differ in the last letter(s)
  // e.g. MPH3087Y (Yellow), MPH3087B (Black/Blue), MPH3087S (Silver)
  // They appear as sibling product links on the page
  const variantUrls = new Set<string>();
  variantUrls.add(data.sourceUrl);

  // Look for links to sibling SKUs (same prefix, different color suffix)
  const currentItemNo = data.itemNo || '';
  const itemPrefix = currentItemNo.replace(/[A-Z]{1,2}$/, '');

  $('a[href*="/p/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/\/p\/([A-Z0-9]+)(?:\.htm)?/i);
    if (!m) return;
    const candidateNo = m[1].toUpperCase();
    // Must share the same prefix and be a different color code
    if (itemPrefix && candidateNo.startsWith(itemPrefix) && candidateNo !== currentItemNo.toUpperCase()) {
      const full = href.startsWith('http') ? href : `https://www.sunsky-online.com${href.startsWith('/') ? '' : '/'}${href}`;
      variantUrls.add(full);
    }
  });

  if (variantUrls.size > 1) {
    // Current URL's color from og:description or specs
    const currentColorName = data.specifications.color || currentItemNo.slice(-1) || 'Default';
    const variants: ColorVariant[] = [];

    for (const vUrl of variantUrls) {
      try {
        if (variants.length >= 9) break;
        let vImages = data.images;
        let vColorName = currentColorName;

        if (vUrl !== data.sourceUrl) {
          const vHtml = await fetchPage(vUrl);
          const v$ = cheerio.load(vHtml);
          // Extract item no for this variant
          const vItemMatch = vHtml.match(/ITEM_NO\s*=\s*['"]([^'"]+)['"]/);
          const vUploadMatch = vHtml.match(/UPLOAD_URL\s*=\s*['"]([^'"]+)['"]/);
          const vItemNo = vItemMatch?.[1] || '';
          const vBase = (vUploadMatch?.[1] || 'https://img.diylooks.com/upload/store').replace(/\/$/, '');

          // Color name from og:description color line
          const vOgDesc = v$('meta[property="og:description"]').attr('content') || '';
          const vColorMatch = vOgDesc.match(/Colour?[:\s]+([^\n<,;.]{2,30})/i)
            || v$('title').text().match(/\b(Black|Blue|Silver|Yellow|Green|Red|Orange|Purple|Pink|White|Gray|Grey|Gold|Brown)\b/i);
          if (vColorMatch) vColorName = vColorMatch[1].trim();
          else {
            // Derive from last 1-2 chars of item no
            const suffix = vItemNo.slice(-2).toUpperCase();
            const suffixMap: Record<string, string> = { Y: 'Yellow', B: 'Black', S: 'Silver', G: 'Green', R: 'Red', W: 'White', O: 'Orange', P: 'Purple' };
            vColorName = suffixMap[suffix.slice(-1)] || suffix;
          }

          // Gallery images for this variant
          const vGalleryImgs: string[] = [];
          v$('img[zoom], img.zoom, .product-gallery img, #imglist img, li img[src*="detail"]').each((_, el) => {
            const src = v$(el).attr('zoom') || v$(el).attr('src') || '';
            const full = src.startsWith('//') ? 'https:' + src : src;
            if (full.includes('detail') && full.startsWith('http') && !vGalleryImgs.includes(full)) {
              vGalleryImgs.push(full);
            }
          });

          if (vItemNo) {
            const vMain = `${vBase}/product_l/${vItemNo}.jpg`;
            vImages = vGalleryImgs.length > 0
              ? [vMain, ...vGalleryImgs].filter((u, i, arr) => arr.indexOf(u) === i).slice(0, 8)
              : [vMain];
          }
        } else {
          // Current URL — use already-scraped images and color
          vImages = data.images;
        }

        variants.push({
          name: vColorName,
          hex: colorToHex(vColorName),
          sourceUrl: vUrl,
          images: vImages,
        });
      } catch {
        // skip failed variant
      }
    }

    if (variants.length > 1) {
      data.colorVariants = variants;
    }
  }
}

function extractHotwav($: cheerio.CheerioAPI, data: ScrapedData): void {
  data.brand = 'HOTWAV';
  data.name = $('h1').first().text().trim() || data.name;

  const descEl = $('[class*="description"],[class*="product-detail"],[class*="product-info"]').first();
  data.description = clean(descEl.text(), 3000);

  const priceText = $('[class*="price"] .money, [class*="price"]').first().text().match(/[\d.]+/);
  if (priceText) data.price = parseFloat(priceText[0]);

  data.images = pickImages($, 'img[src*="cdn/shop/files"], img[src*="cdn/shop/products"]', 'src', 8)
    .map(u => u.replace(/\?.*$/, '') + '?width=1500&format=jpg');

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const ld = JSON.parse($(el).html() || '');
      if (ld['@type'] === 'Product') {
        if (!data.description && ld.description) data.description = clean(ld.description);
        if (ld.offers?.price) data.price = parseFloat(ld.offers.price);
      }
    } catch {}
  });

  const tableSpecs = parseSpecTable($);
  Object.assign(data.specifications, tableSpecs);

  const pageText = $('body').text();
  const textSpecs = extractSpecsFromText(pageText);
  Object.entries(textSpecs).forEach(([k, v]) => { if (!data.specifications[k]) data.specifications[k] = v; });

  data.boxContents = extractBoxContents(pageText);
  data.keyFeatures = extractKeyFeatures(pageText);
}

function extractAliExpress($: cheerio.CheerioAPI, data: ScrapedData): void {
  data.name = $('h1').first().text().trim() || data.name;

  const priceText = $('[class*="price"]').first().text().match(/[\d.]+/);
  if (priceText) data.price = parseFloat(priceText[0]);

  data.description = clean($('[class*="description"],[id*="description"]').first().text());

  const html = $.html();
  const dataMatch = html.match(/window\.runParams\s*=\s*({.+?});\s*window/s);
  if (dataMatch) {
    try {
      const pd = JSON.parse(dataMatch[1]);
      const item = pd?.data?.productInfoComponent;
      if (item?.subject) data.name = item.subject;
    } catch {}
  }

  data.images = pickImages($, 'img[src*="alicdn.com"], img[src*="ae01"], img[src*="ae02"]', 'src', 8)
    .map(u => u.replace(/_\d+x\d+/, '_960x960').replace(/_.webp$/, '.jpg'));

  const tableSpecs = parseSpecTable($);
  Object.assign(data.specifications, tableSpecs);

  const pageText = $('body').text();
  const textSpecs = extractSpecsFromText(pageText);
  Object.entries(textSpecs).forEach(([k, v]) => { if (!data.specifications[k]) data.specifications[k] = v; });

  data.boxContents = extractBoxContents(pageText);
  data.keyFeatures = extractKeyFeatures(pageText);

  const brandEl = $('[class*="brand"], [itemprop="brand"]').first().text().trim();
  if (brandEl) data.brand = brandEl;
}

function extractEbay($: cheerio.CheerioAPI, data: ScrapedData): void {
  data.name = $('h1.x-item-title__mainTitle, h1').first().text().trim() || data.name;

  const price = $('[itemprop="price"]').attr('content') || $('[class*="price"]').first().text().match(/[\d.]+/)?.[0];
  if (price) data.price = parseFloat(String(price));

  data.description = clean($('[itemprop="description"]').text() || $('#desc_div, .ux-textspans').first().text());

  data.images = pickImages($, 'img[src*="ebayimg.com"], img[src*="i.ebayimg"]', 'src', 8)
    .map(u => u.replace(/s-l\d+/, 's-l1600'));

  const tableSpecs = parseSpecTable($);
  $('[class*="ux-layout-section"] .ux-labels-values').each((_, el) => {
    const label = $(el).find('.ux-labels-values__labels').text().trim().toLowerCase();
    const val = $(el).find('.ux-labels-values__values').text().trim();
    if (label && val) {
      const mapped = mapSpecKey(label);
      if (mapped) tableSpecs[mapped] = val;
    }
  });
  Object.assign(data.specifications, tableSpecs);

  const pageText = $('body').text();
  const textSpecs = extractSpecsFromText(pageText);
  Object.entries(textSpecs).forEach(([k, v]) => { if (!data.specifications[k]) data.specifications[k] = v; });

  data.boxContents = extractBoxContents(pageText);
  data.keyFeatures = extractKeyFeatures(pageText);

  const brand = $('[itemprop="brand"]').first().text().trim();
  if (brand) data.brand = brand;
}

function extractAmazon($: cheerio.CheerioAPI, data: ScrapedData): void {
  data.name = $('#productTitle, #title').first().text().trim() || data.name;

  const price = $('.a-price-whole').first().text().replace(/[^0-9.]/g, '');
  if (price) data.price = parseFloat(price);

  const bullets: string[] = [];
  $('#feature-bullets li').each((_, el) => {
    const t = $(el).text().trim();
    if (t && t.length > 5) bullets.push(t);
  });
  if (bullets.length) data.keyFeatures = bullets.slice(0, 8);

  data.description = clean($('#productDescription').text() || bullets.join('\n'));

  data.images = pickImages($, '#landingImage, #imgTagWrapperId img, img[src*="images-na.ssl"], img[src*="m.media-amazon"]', 'src', 8)
    .map(u => u.replace(/\._[A-Z0-9_,]+_\./, '.'));

  const tableSpecs = parseSpecTable($);
  $('#productDetails_techSpec_section_1 tr, #prodDetails tr, .a-keyvalue tr').each((_, row) => {
    const k = $(row).find('th').text().trim().toLowerCase();
    const v = $(row).find('td').text().trim();
    if (k && v) {
      const mapped = mapSpecKey(k);
      if (mapped) tableSpecs[mapped] = v;
    }
  });
  Object.assign(data.specifications, tableSpecs);

  const pageText = $('body').text();
  const textSpecs = extractSpecsFromText(pageText);
  Object.entries(textSpecs).forEach(([k, v]) => { if (!data.specifications[k]) data.specifications[k] = v; });

  data.boxContents = extractBoxContents($('#in_the_box, #productDescription, #feature-bullets').text() || pageText);

  const brand = $('[class*="bylineInfo"], #bylineInfo').first().text().trim();
  if (brand) data.brand = brand.replace(/^(?:by|brand:?)\s+/i, '').trim();
}

function extractGeneric($: cheerio.CheerioAPI, data: ScrapedData): void {
  data.name = $('h1').first().text().trim()
    || $('[itemprop="name"]').first().text().trim()
    || $('title').text().split(/[|\-–]/)[0].trim()
    || 'Product';

  const price = $('[itemprop="price"]').first().attr('content')
    || $('[class*="price"], .amount, [id*="price"]').first().text().match(/[\d.]+/)?.[0];
  if (price) data.price = parseFloat(String(price));

  data.description = clean(
    $('[itemprop="description"], [class*="description"], .product-description, .woocommerce-product-details__short-description').first().text()
    || $('meta[name="description"]').attr('content') || ''
  );

  const imgs: string[] = [];
  $('img').each((_, el) => {
    if (imgs.length >= 8) return false;
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy') || '';
    const w = parseInt($(el).attr('width') || '0');
    const h = parseInt($(el).attr('height') || '0');
    const full = src.startsWith('//') ? 'https:' + src : src;
    if (full.startsWith('http') && (w > 200 || h > 200 || /product|upload|item|shop/i.test(full))
      && !/logo|icon|sprite|pixel|placeholder|blank|tracking/i.test(full)) {
      imgs.push(full);
    }
  });
  data.images = [...new Set(imgs)];

  const brandMeta = $('meta[property="product:brand"], [itemprop="brand"]').first();
  if (brandMeta.length) data.brand = brandMeta.attr('content') || brandMeta.text().trim();

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const ld = JSON.parse($(el).html() || '');
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        if (item['@type'] === 'Product') {
          if (item.name && !data.name) data.name = item.name;
          if (item.brand?.name && !data.brand) data.brand = item.brand.name;
          if (item.description && !data.description) data.description = clean(item.description);
          if (item.image && data.images.length === 0) {
            data.images = (Array.isArray(item.image) ? item.image : [item.image]).slice(0, 8);
          }
          if (item.offers?.price && !data.price) data.price = parseFloat(item.offers.price);
        }
      }
    } catch {}
  });

  const tableSpecs = parseSpecTable($);
  Object.assign(data.specifications, tableSpecs);

  const pageText = $('body').text();
  const textSpecs = extractSpecsFromText(pageText);
  Object.entries(textSpecs).forEach(([k, v]) => { if (!data.specifications[k]) data.specifications[k] = v; });

  data.boxContents = extractBoxContents(pageText);
  data.keyFeatures = extractKeyFeatures(pageText);
}

// ── PartSouq extractor ─────────────────────────────────────────────────────
// PartSouq blocks server fetch with Cloudflare. This extractor handles cases
// where the fetch does succeed (e.g., user pastes direct product URL).

function extractPartsouq($: cheerio.CheerioAPI, data: ScrapedData): void {
  // Product name
  const h1 = $('h1').first().text().trim();
  if (h1) data.name = h1;

  // Part number from h2: "Part number: XXXXX"
  const h2 = $('h2').first().text().trim();
  const pnMatch = h2.match(/Part\s*(?:number|no\.?)[:\s]+([A-Z0-9\-]+)/i);
  if (pnMatch) data.specifications.partNumber = pnMatch[1];

  // Brand from img alt (brand logo img)
  $('img[alt]').each((_, el) => {
    const alt = $(el).attr('alt') || '';
    if (alt.length > 1 && alt.length < 25 && /^[A-Za-z]/.test(alt) && !/sensor|speed|abs|front|rear|part|cover/i.test(alt)) {
      if (!data.brand) data.brand = alt;
    }
  });

  // Price: look for patterns like "176.33$" or "$176.33"
  $('*').each((_, el) => {
    if (!data.price) {
      const t = $(el).text().trim();
      const m = t.match(/^([\d,]+\.?\d*)\$$/) || t.match(/^\$([\d,]+\.?\d*)$/);
      if (m) data.price = parseFloat(m[1].replace(/,/g, ''));
    }
  });
  data.currency = 'USD';

  // Availability
  $('p').each((_, el) => {
    const t = $(el).text().trim();
    if (/Availability[:\s]+\d+/i.test(t)) {
      const m = t.match(/Availability[:\s]+(\d+)/i);
      if (m) data.stockQuantity = parseInt(m[1]);
    }
  });

  // Product image: link href pattern /assets/tesseract/assets/partsimages/Brand/PART.jpg
  $('a[href*="partsimages"], a[href*="PartCover"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const full = href.startsWith('/') ? 'https://partsouq.com' + href : href;
    if (full.startsWith('http') && !data.images.includes(full)) {
      data.images.push(full);
    }
  });
  $('img[src*="partsimages"], img[src*="PartCover"]').each((_, el) => {
    const src = $(el).attr('src') || '';
    const full = src.startsWith('/') ? 'https://partsouq.com' + src : src;
    if (full.startsWith('http') && !data.images.includes(full)) {
      data.images.push(full);
    }
  });

  data.images = [...new Set(data.images)].slice(0, 8);

  // Substitutions: other compatible part numbers from the "Substitutions" section
  const subs: string[] = [];
  $('h3').each((_, el) => {
    if (/Substitution/i.test($(el).text())) {
      $(el).nextAll().find('h2').each((_, h) => {
        const m = $(h).text().match(/Part\s*number[:\s]+([A-Z0-9\-]+)/i);
        if (m) subs.push(m[1]);
      });
    }
  });
  if (subs.length) data.specifications.compatibility = subs.join(', ');
}

// ── GreenAge Farms (WooCommerce) extractor ─────────────────────────────────

function extractGreenAgeFarms($: cheerio.CheerioAPI, data: ScrapedData): void {
  // JSON-LD is the most reliable source on WooCommerce
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const ld = JSON.parse($(el).html() || '');
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        if (item['@type'] === 'Product') {
          if (item.name) data.name = item.name;
          if (item.brand?.name) data.brand = item.brand.name;
          if (item.description) data.description = clean(item.description, 3000);
          // Price is already TTD on this site
          // offers can be a single object OR an array; price may be in offers.price
          // or nested in offers[n].priceSpecification[n].price
          const offerList = Array.isArray(item.offers) ? item.offers : (item.offers ? [item.offers] : []);
          for (const offer of offerList) {
            const directPrice = offer.price ? parseFloat(offer.price) : 0;
            const specPrice = offer.priceSpecification
              ? parseFloat((Array.isArray(offer.priceSpecification)
                  ? offer.priceSpecification[0]
                  : offer.priceSpecification)?.price || '0')
              : 0;
            const p = directPrice || specPrice;
            if (p > 0) {
              data.price = p;
              data.currency = offer.priceCurrency === 'TTD' || !offer.priceCurrency ? 'TTD' : offer.priceCurrency;
              break;
            }
          }
          if (item.image) {
            // Strip Jetpack proxy to get original full-res URL
            const raw = Array.isArray(item.image) ? item.image : [item.image];
            const imgs = raw.map((u: string) => {
              const m = u.match(/i\d+\.wp\.com\/(.+?)(?:\?.*)?$/);
              return m ? `https://${m[1]}` : u;
            }).filter((u: string) => u.startsWith('http'));
            if (imgs.length) data.images = imgs.slice(0, 8);
          }
          if (item.sku) data.specifications.partNumber = String(item.sku);
          const avail = item.offers?.availability || '';
          if (avail.includes('InStock')) data.stockQuantity = 1;
          else if (avail.includes('OutOfStock')) data.stockQuantity = 0;
        }
      }
    } catch {}
  });

  // Fallback: WooCommerce gallery images
  if (!data.images.length) {
    const imgs: string[] = [];
    $('.woocommerce-product-gallery img, .product-images img').each((_, el) => {
      const src = $(el).attr('data-large_image') || $(el).attr('src') || '';
      const m = src.match(/i\d+\.wp\.com\/(.+?)(?:\?.*)?$/);
      const url = m ? `https://${m[1]}` : src;
      if (url.startsWith('http') && !/placeholder|logo|icon/i.test(url)) imgs.push(url);
    });
    if (imgs.length) data.images = [...new Set(imgs)].slice(0, 8);
  }

  // Fallback name/description
  if (!data.name || data.name === 'Product') {
    data.name = $('h1.product_title, h1').first().text().trim() || data.name;
  }
  if (!data.description) {
    data.description = clean(
      $('.woocommerce-product-details__short-description, .product-description, [itemprop="description"]').first().text()
    );
  }

  // Fallback price — WooCommerce product page selectors (same source the browse panel uses)
  if (!data.price) {
    // Iterate all price elements and take the first non-zero value
    $('.woocommerce-Price-amount bdi, .price .woocommerce-Price-amount, p.price .amount, .entry-summary .price bdi').each((_, el) => {
      if (data.price) return false; // already found
      const raw = $(el).text().replace(/[^\d.]/g, '');
      const val = raw ? parseFloat(raw) : 0;
      if (val > 0) {
        data.price = val;
        data.currency = 'TTD';
      }
    });
  }

  // Category as brand hint if no brand
  if (!data.brand) {
    const cat = $('.posted_in a').first().text().trim();
    if (cat) data.brand = cat;
  }

  const pageText = $('body').text();
  const tableSpecs = parseSpecTable($);
  Object.assign(data.specifications, tableSpecs);
  const textSpecs = extractSpecsFromText(pageText);
  Object.entries(textSpecs).forEach(([k, v]) => { if (!data.specifications[k]) data.specifications[k] = v; });

  data.keyFeatures = extractKeyFeatures(pageText);
  data.boxContents = extractBoxContents(pageText);
}

// ── Web description enrichment ─────────────────────────────────────────────

async function enrichDescriptionFromWeb(data: ScrapedData): Promise<void> {
  // Only enrich when description is short/missing
  if (data.description && data.description.trim().length > 200) return;

  const name = data.name.trim();
  if (!name || name === 'Product') return;

  try {
    // 1. Try Wikipedia summary API (free, no key needed)
    const wikiQuery = encodeURIComponent(name);
    const wikiRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${wikiQuery}`,
      { headers: { 'User-Agent': 'RuggtechImporter/1.0' }, signal: AbortSignal.timeout(6000) }
    );
    if (wikiRes.ok) {
      const wikiJson = await wikiRes.json();
      if (wikiJson.extract && wikiJson.extract.length > 80 && wikiJson.type !== 'disambiguation') {
        // Only use if it's actually about this product (not a random match)
        const extract: string = wikiJson.extract;
        const nameLower = name.toLowerCase();
        const firstWord = nameLower.split(/\s+/)[0];
        if (extract.toLowerCase().includes(firstWord)) {
          data.description = extract.substring(0, 1000);
          return;
        }
      }
    }
  } catch { /* wikipedia unavailable */ }

  try {
    // 2. Fallback: DuckDuckGo instant answer API
    const ddgQuery = encodeURIComponent(name + ' product description');
    const ddgRes = await fetch(
      `https://api.duckduckgo.com/?q=${ddgQuery}&format=json&no_html=1&skip_disambig=1`,
      { headers: { 'User-Agent': 'RuggtechImporter/1.0' }, signal: AbortSignal.timeout(6000) }
    );
    if (ddgRes.ok) {
      const ddg = await ddgRes.json();
      const abstract: string = ddg.Abstract || ddg.RelatedTopics?.[0]?.Text || '';
      if (abstract.length > 80) {
        data.description = abstract.substring(0, 1000);
        return;
      }
    }
  } catch { /* ddg unavailable */ }
}

// ── Main export ────────────────────────────────────────────────────────────

export async function scrapeProduct(url: string): Promise<ScrapedData> {
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const data: ScrapedData = {
    sourceUrl: url,
    name: $('title').text().split(/[|\-–]/)[0].trim() || 'Product',
    price: null,
    currency: 'USD',
    description: '',
    specifications: {},
    images: [],
    brand: '',
    boxContents: [],
    keyFeatures: [],
  };

  const u = url.toLowerCase();
  if      (u.includes('sunsky-online.com')) await extractSunsky($, data);
  else if (u.includes('hotwav.com'))        extractHotwav($, data);
  else if (u.includes('aliexpress.com'))    extractAliExpress($, data);
  else if (u.includes('ebay.com'))          extractEbay($, data);
  else if (u.includes('amazon.com') || u.includes('amazon.co')) extractAmazon($, data);
  else if (u.includes('partsouq.com'))       extractPartsouq($, data);
  else if (u.includes('greenagefarms.com'))  extractGreenAgeFarms($, data);
  else                                      extractGeneric($, data);

  data.name = data.name
    // Strip leading warehouse/region tags like "[HK Warehouse]", "[CN Warehouse]", "[US Stock]"
    .replace(/^\s*\[[^\]]*(?:warehouse|stock|depot|store|ship|local|hk|cn|us|eu|uk)[^\]]*\]\s*/i, '')
    // Strip trailing suffix after separator: "- Sunsky Online", "| Official Store", etc.
    .replace(/\s*[-–—|·•]\s*(?:sunsky|ruggtech|hotwav|aliexpress|amazon|ebay|warehouse|online|store|official|shop|buy|cheap|wholesale|price|deal)[^\n]*$/i, '')
    // Strip trailing spec fragments: ", 12GB+256GB, 6.78 inch Android 15 MediaTek..."
    .replace(/[,\s]+\d+\s*GB\s*[+\/].*$/i, '')
    .replace(/[,\s]+\d+\.\d+\s*inch.*$/i, '')
    .replace(/[,\s]+(?:Android|iOS|HarmonyOS)\s*\d+.*$/i, '')
    .replace(/[,\s]+(?:IP\d+|MIL-STD).*$/i, '')
    .replace(/[,\s]+(?:MediaTek|Snapdragon|Dimensity|Helio|Unisoc|Kirin).*$/i, '')
    .replace(/[,\s]+(?:Network:|4G|5G)\b.*$/i, '')
    .replace(/[,\s]+(?:OTG|NFC|GPS)\b.*$/i, '')
    .replace(/,\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .substring(0, 120);

  data.images = [...new Set(data.images)].filter(u => u.startsWith('http')).slice(0, 8);
  data.boxContents = (data.boxContents || [])
    .filter(s => s.length > 2 && s.length < 80)
    .filter(s => !s.startsWith('http') && !s.includes('://') && !s.includes('{') && !s.includes('"'));
  data.keyFeatures = (data.keyFeatures || [])
    .filter(s => s.length > 5 && s.length < 150)
    .filter(s => !s.startsWith('http') && !s.includes('://') && !s.includes('{') && !s.includes('"'));

  // Enrich description from web when scraped description is sparse
  await enrichDescriptionFromWeb(data);

  return data;
}
