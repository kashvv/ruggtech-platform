import slugify from 'slugify';
import type { SchemaType } from './sanity';

export interface ScrapedData {
  sourceUrl: string;
  name: string;
  price: number | null;
  currency: string;
  description: string;
  specifications: Record<string, string>;
  images: string[];
  brand: string;
  category?: string;
  itemNo?: string;
  productId?: string;
  priceTTD?: number;
  originalPriceTTD?: number;
  stockQuantity?: number;
  boxContents?: string[];
  keyFeatures?: string[];
}

export interface Pricing {
  supplierCostUsd: number;
  markupPercent: number;
  sellingPriceUsd: number;
  sellingPriceTtd: number;
  profitUsd: number;
  profitTtd: number;
}

export interface Specs {
  cpu?: string; gpu?: string; ramRom?: string; os?: string;
  displaySize?: string; resolution?: string; frontCamera?: string;
  rearCamera?: string; battery?: string; network?: string; sim?: string;
  nfc?: string; waterproof?: string; sensors?: string; biometrics?: string;
  dimensions?: string; weight?: string; bluetooth?: string; usbCharging?: string;
  color?: string; gps?: string; bands?: string;
  partNumber?: string; compatibility?: string; material?: string;
  oem?: string; installationDifficulty?: string; placement?: string;
  warranty?: string;
  keyFeatures?: string[];
  [key: string]: string | string[] | undefined;
}

// ── Schema detection ───────────────────────────────────────────────────────

export function detectSchemaType(data: ScrapedData): SchemaType {
  const combined = `${data.name} ${data.description}`.toLowerCase();
  const has = (keys: string[]) => keys.some(k => combined.includes(k));

  if (has(['rugged phone','rugged smartphone','hotwav','ulefone','doogee','blackview','oukitel',
    'iiif150','umidigi','agm','cubot','fossibot','oscal',
    'ip68','ip69k','mil-std','shockproof phone','waterproof phone','outdoor phone',
    'rugged mobile','industrial phone','tough phone','rugged device','rugged tablet'])) return 'product';

  if (has(['suzuki','grand vitara','jimny','swift','alto','car part','auto part',
    'brake pad','brake disc','clutch','engine part','transmission','propshaft',
    'driveshaft','caliper','radiator','alternator','starter motor','suspension',
    'exhaust','bumper','fender','headlight','tail light','door handle','side mirror',
    'cv joint','wheel bearing','tie rod','ball joint','strut','shock absorber'])) return 'car';

  if (has(['tractor','farm','agriculture','irrigation','hydroponic','fertilizer',
    'sprayer','harvester','greenhouse','soil','crop','precision farming',
    'drip','fertigation','nutrient','grow light','ph meter','ec meter',
    'shade house','mulch','compost','pest control','weather station','soil sensor'])) return 'agritechPage';

  if (has(['solar panel','solar generator','power station','off-grid','off grid',
    'camping','portable power','inverter','battery bank','survival','emergency power',
    'ham radio','walkie talkie','two-way radio','flashlight','headlamp','lantern',
    'tent','sleeping bag','water filter','fire starter','compass','gps handheld'])) return 'offgrid';

  if (has(['watch','smartwatch','smart watch','fitness tracker','wristband',
    'timepiece','chronograph','digital watch','analog watch','sports watch','dive watch'])) return 'watch';

  if (has(['headphone','headset','earphone','earbuds','earbud','airpod',
    'bluetooth speaker','wireless speaker','soundbar','tws',
    'noise cancelling','over-ear','in-ear'])) return 'product2';

  if (has(['phone case','screen protector','tempered glass','phone cover',
    'charger','charging cable','usb cable','power bank','phone holder',
    'phone mount','phone stand','pop socket','stylus',
    'memory card','sd card','sim card tray','phone accessory'])) return 'phoneacc';

  if (has(['smartphone','mobile phone','tablet','ipad','android phone',
    'samsung galaxy','iphone','xiaomi','redmi','poco','oneplus','oppo','vivo',
    'realme','huawei','honor','google pixel','nothing phone',
    'mah battery','mediatek','snapdragon','dimensity'])) return 'phone';

  if (has(['laptop','computer','monitor','keyboard','mouse',
    'router','modem','camera','drone','projector','printer','scanner',
    'tv','television','led light','security camera','dashcam','gps tracker'])) return 'electronic';

  return 'electronic';
}

export function detectCategory(schema: SchemaType): string {
  const map: Record<SchemaType, string> = {
    product: 'Rugged Devices', phone: 'Phones & Tablets', car: 'Suzuki Parts',
    agritechPage: 'Agri Tech', offgrid: 'Off-Grid Equipment',
    electronic: 'Electronics', product2: 'Headsets', phoneacc: 'Accessories', watch: 'Watches',
  };
  return map[schema] || 'Electronics';
}

// ── Pricing ────────────────────────────────────────────────────────────────

export function calculatePricing(
  supplierPrice: number,
  markupPercent = 35,
  usdToTtd = 6.80
): Pricing | null {
  if (!supplierPrice || supplierPrice <= 0) return null;
  const markedUpUsd = supplierPrice * (1 + markupPercent / 100);
  const ttdRaw = markedUpUsd * usdToTtd;
  const sellingPriceTtd = Math.ceil(ttdRaw / 5) * 5;
  return {
    supplierCostUsd: supplierPrice,
    markupPercent,
    sellingPriceUsd: Math.round(markedUpUsd * 100) / 100,
    sellingPriceTtd,
    profitUsd: Math.round((markedUpUsd - supplierPrice) * 100) / 100,
    profitTtd: Math.round((sellingPriceTtd - supplierPrice * usdToTtd) * 100) / 100,
  };
}

// ── Slug ───────────────────────────────────────────────────────────────────

export function generateSlug(name: string): string {
  return slugify(name || 'product', { lower: true, strict: true, remove: /[*+~.()'"!:@,]/g });
}

// ── Specs builder ──────────────────────────────────────────────────────────

export function buildSpecsFromScraped(data: ScrapedData, schema: SchemaType): Specs {
  const specs: Specs = { ...data.specifications };
  specs.keyFeatures = data.keyFeatures || [];

  const desc = `${data.description} ${data.name}`;

  if (schema === 'phone' || schema === 'product') {
    if (!specs.battery) {
      const m = desc.match(/(\d{3,6})\s*mAh/i);
      if (m) specs.battery = m[0];
    }
    if (!specs.ramRom) {
      const m = desc.match(/(\d+)\s*GB\s*[+\/]\s*(\d+)\s*GB/i)
        || desc.match(/(\d+)\s*GB\s*RAM[,\s]+(\d+)\s*GB/i);
      if (m) specs.ramRom = `${m[1]}GB + ${m[2]}GB`;
    }
    if (!specs.displaySize) {
      const m = desc.match(/(\d+\.?\d*)\s*(?:inch|")/i);
      if (m) specs.displaySize = `${m[1]} inch`;
    }
    if (!specs.os) {
      const m = desc.match(/Android\s*[\d.]+/i);
      if (m) specs.os = m[0];
    }
    if (!specs.waterproof) {
      const m = desc.match(/IP\s*(?:68|69K?|67)\s*(?:\/\s*IP\s*(?:68|69K?))?/i)
        || desc.match(/MIL-STD-810[HG]?/i);
      if (m) specs.waterproof = m[0];
    }
    if (!specs.network) {
      const m = desc.match(/\b(5G|4G\s*LTE|4G)\b/i);
      if (m) specs.network = m[0];
    }
    if (!specs.sim) {
      const m = desc.match(/(?:Dual|Triple|Single)\s*(?:Nano\s*)?SIM/i);
      if (m) specs.sim = m[0];
    }
  }

  return specs;
}

// ── Details generator ──────────────────────────────────────────────────────

export function generateDetails(data: ScrapedData, specs: Specs): string {
  const schema = detectSchemaType(data);
  let d = `${data.name}\n\n`;

  if (specs.keyFeatures && (specs.keyFeatures as string[]).length > 0) {
    d += `Key Features\n`;
    (specs.keyFeatures as string[]).forEach(f => { d += `• ${f}\n`; });
    d += '\n';
  }

  if (schema === 'phone' || schema === 'product') {
    if (specs.cpu || specs.gpu || specs.ramRom || specs.os) {
      d += `Performance\n`;
      if (specs.cpu)    d += `Processor: ${specs.cpu}\n`;
      if (specs.gpu)    d += `Graphics: ${specs.gpu}\n`;
      if (specs.ramRom) d += `Memory: ${specs.ramRom}\n`;
      if (specs.os)     d += `Operating System: ${specs.os}\n`;
      d += '\n';
    }
    if (specs.displaySize || specs.resolution) {
      d += `Display\n`;
      if (specs.displaySize) d += `Screen Size: ${specs.displaySize}\n`;
      if (specs.resolution)  d += `Resolution: ${specs.resolution}\n`;
      d += '\n';
    }
    if (specs.rearCamera || specs.frontCamera) {
      d += `Camera System\n`;
      if (specs.rearCamera)  d += `Rear Camera: ${specs.rearCamera}\n`;
      if (specs.frontCamera) d += `Front Camera: ${specs.frontCamera}\n`;
      d += '\n';
    }
    if (specs.battery || specs.network || specs.sim || specs.bluetooth || specs.usbCharging) {
      d += `Connectivity & Power\n`;
      if (specs.battery)     d += `Battery: ${specs.battery}\n`;
      if (specs.network)     d += `Network: ${specs.network}\n`;
      if (specs.bands)       d += `Frequency Bands: ${specs.bands}\n`;
      if (specs.sim)         d += `SIM: ${specs.sim}\n`;
      if (specs.nfc)         d += `NFC: ${specs.nfc}\n`;
      if (specs.bluetooth)   d += `Bluetooth: ${specs.bluetooth}\n`;
      if (specs.usbCharging) d += `Charging: ${specs.usbCharging}\n`;
      if (specs.gps)         d += `GPS: ${specs.gps}\n`;
      d += '\n';
    }
    if (specs.waterproof || specs.sensors || specs.biometrics) {
      d += `Durability & Security\n`;
      if (specs.waterproof)  d += `Protection: ${specs.waterproof}\n`;
      if (specs.sensors)     d += `Sensors: ${specs.sensors}\n`;
      if (specs.biometrics)  d += `Biometrics: ${specs.biometrics}\n`;
      d += '\n';
    }
    if (specs.dimensions || specs.weight || specs.color) {
      d += `Physical\n`;
      if (specs.dimensions) d += `Dimensions: ${specs.dimensions}\n`;
      if (specs.weight)     d += `Weight: ${specs.weight}\n`;
      if (specs.color)      d += `Color: ${specs.color}\n`;
      d += '\n';
    }

  } else if (schema === 'car') {
    d += `Part Specifications\n`;
    if (specs.partNumber)  d += `Part Number: ${specs.partNumber}\n`;
    if (specs.oem)         d += `OEM Compatible: ${specs.oem}\n`;
    if (specs.material)    d += `Material: ${specs.material}\n`;
    if (specs.placement)   d += `Placement: ${specs.placement}\n`;
    if (specs.weight)      d += `Weight: ${specs.weight}\n`;
    d += '\n';
    if (specs.compatibility) { d += `Vehicle Compatibility\n${specs.compatibility}\n\n`; }
    if (specs.installationDifficulty) { d += `Installation\nDifficulty: ${specs.installationDifficulty}\n\n`; }

  } else if (schema === 'watch') {
    d += `Watch Specifications\n`;
    if (specs.displaySize) d += `Display: ${specs.displaySize}\n`;
    if (specs.battery)     d += `Battery Life: ${specs.battery}\n`;
    if (specs.bluetooth)   d += `Bluetooth: ${specs.bluetooth}\n`;
    if (specs.waterproof)  d += `Water Resistance: ${specs.waterproof}\n`;
    if (specs.sensors)     d += `Sensors: ${specs.sensors}\n`;
    if (specs.os)          d += `OS: ${specs.os}\n`;
    if (specs.dimensions)  d += `Dimensions: ${specs.dimensions}\n`;
    if (specs.weight)      d += `Weight: ${specs.weight}\n`;
    d += '\n';

  } else if (schema === 'product2') {
    d += `Audio Specifications\n`;
    if (specs.bluetooth)   d += `Bluetooth: ${specs.bluetooth}\n`;
    if (specs.battery)     d += `Battery: ${specs.battery}\n`;
    if (specs.waterproof)  d += `Water Resistance: ${specs.waterproof}\n`;
    if (specs.dimensions)  d += `Dimensions: ${specs.dimensions}\n`;
    if (specs.weight)      d += `Weight: ${specs.weight}\n`;
    d += '\n';

  } else if (schema === 'offgrid') {
    d += `Specifications\n`;
    if (specs.battery)    d += `Capacity: ${specs.battery}\n`;
    if (specs.dimensions) d += `Dimensions: ${specs.dimensions}\n`;
    if (specs.weight)     d += `Weight: ${specs.weight}\n`;
    if (specs.material)   d += `Material: ${specs.material}\n`;
    d += '\n';

  } else if (schema === 'agritechPage') {
    d += `Specifications\n`;
    if (specs.dimensions) d += `Dimensions: ${specs.dimensions}\n`;
    if (specs.weight)     d += `Weight: ${specs.weight}\n`;
    if (specs.material)   d += `Material: ${specs.material}\n`;
    d += '\n';

  } else {
    d += `Product Specifications\n`;
    const skip = new Set(['keyFeatures']);
    Object.entries(specs).forEach(([k, v]) => {
      if (!skip.has(k) && v && typeof v === 'string') d += `${k}: ${v}\n`;
    });
    d += '\n';
  }

  // What's in the box
  if (data.boxContents && data.boxContents.length > 0) {
    d += `What's in the Box\n`;
    data.boxContents.forEach(item => { d += `• ${item}\n`; });
    d += '\n';
  }

  d += `Why Choose from RUGGTECH?\n`;
  d += `Authentic product sourced from verified suppliers. Ships worldwide including the Caribbean. `;
  d += `Full warranty support and after-sales service. `;
  d += `Trusted by customers across Trinidad and Tobago and the wider Caribbean region.\n`;

  return d;
}

// ── SEO ────────────────────────────────────────────────────────────────────

export function generateSeoTitle(data: ScrapedData): string {
  const base = data.brand ? `${data.name} | ${data.brand}` : data.name;
  const suffix = ' | RUGGTECH';
  return base.substring(0, 60 - suffix.length) + suffix;
}

export function generateSeoDescription(data: ScrapedData, specs: Specs): string {
  let d = `Buy ${data.name} from RUGGTECH. `;
  if (specs.battery)     d += `${specs.battery} battery. `;
  if (specs.ramRom)      d += `${specs.ramRom}. `;
  if (specs.displaySize) d += `${specs.displaySize} display. `;
  if (specs.waterproof)  d += `${specs.waterproof} rated. `;
  if (specs.network)     d += `${specs.network} ready. `;
  d += 'Free shipping. Warranty included. PayPal & USDT accepted.';
  return d.substring(0, 160);
}

export function generateKeywords(data: ScrapedData, specs: Specs): string[] {
  const schema = detectSchemaType(data);
  const kw = new Set<string>();
  const name = data.name || '';
  const brand = data.brand || '';

  kw.add(name); kw.add(brand);
  name.split(/[\s,\-\/]+/).filter(w => w.length > 2).forEach(w => kw.add(w));

  if (brand) {
    ['phone','rugged','buy','price','review','specs','Trinidad','Caribbean','online','delivery']
      .forEach(s => kw.add(`${brand} ${s}`));
  }

  const bySchema: Record<string, string[]> = {
    phone: ['rugged phone','rugged smartphone','waterproof phone','dustproof phone',
      'shockproof phone','outdoor phone','construction phone','military phone','tough phone',
      'IP68 phone','IP69K phone','MIL-STD-810G','MIL-STD-810H','best rugged phone',
      'rugged phone Trinidad','buy rugged phone','rugged phone Caribbean','waterproof smartphone',
      'industrial smartphone','work phone','RUGGTECH phone','5G rugged phone','dual SIM rugged',
      'big battery phone','NFC phone','rugged Android','rugged 5G'],
    product: ['rugged phone','rugged smartphone','waterproof phone','dustproof phone',
      'shockproof phone','outdoor phone','construction phone','military phone','tough phone',
      'IP68 phone','IP69K phone','MIL-STD-810G','MIL-STD-810H','best rugged phone',
      'rugged phone Trinidad','buy rugged phone','rugged phone Caribbean','waterproof smartphone',
      'industrial smartphone','work phone','RUGGTECH phone','5G rugged phone','dual SIM rugged',
      'big battery phone','NFC phone','rugged Android','rugged 5G'],
    car: ['Suzuki parts Trinidad','Suzuki Grand Vitara parts','Suzuki Jimny parts',
      'OEM Suzuki parts','genuine Suzuki parts','Suzuki replacement parts',
      'Suzuki body parts','Suzuki engine parts','buy Suzuki parts',
      'Suzuki parts Caribbean','RUGGTECH Suzuki','RUGGTECH car parts',
      'car parts Trinidad','auto parts TT','4x4 parts Caribbean'],
    agritechPage: ['precision farming equipment','agriculture technology','farming equipment Trinidad',
      'hydroponic supplies','irrigation equipment','agritech Caribbean',
      'RUGGTECH farming','greenhouse equipment','drip irrigation','fertigation system',
      'smart farming','precision agriculture','farming TT','agriculture supplies Trinidad'],
    offgrid: ['off-grid equipment','camping gear Trinidad','survival gear',
      'portable power','solar generator','emergency preparedness',
      'RUGGTECH camping','outdoor equipment Caribbean','solar power Trinidad',
      'portable battery','emergency power station','camping Trinidad','survival kit TT'],
    watch: ['smartwatch Trinidad','smart watch Caribbean','fitness tracker TT',
      'buy smartwatch online','best smartwatch','waterproof smartwatch',
      'sports watch Trinidad','RUGGTECH watch','rugged smartwatch',
      'health tracker','heart rate monitor watch','GPS smartwatch'],
    product2: ['wireless headphones Trinidad','bluetooth earbuds TT','earphones Caribbean',
      'noise cancelling headphones','best earbuds','TWS earbuds Trinidad',
      'RUGGTECH audio','headset TT','buy headphones online','gaming headset Trinidad'],
    phoneacc: ['phone accessories Trinidad','mobile accessories TT','phone case Caribbean',
      'screen protector Trinidad','charger Trinidad','RUGGTECH accessories',
      'mobile phone case TT','tempered glass Trinidad','charging cable TT','power bank Trinidad'],
    electronic: ['electronics Trinidad','gadgets TT','electronics Caribbean',
      'buy electronics online TT','RUGGTECH electronics','tech gadgets Trinidad',
      'electronic devices Caribbean','online electronics store TT'],
  };

  (bySchema[schema] || []).forEach(t => kw.add(t));

  const generalTerms = ['RUGGTECH','ruggtech.com','RUGGTECH store','RUGGTECH shop',
    'buy online Trinidad','online store Trinidad','Caribbean online store',
    'Trinidad and Tobago','TT online shop','Caribbean delivery',
    'free shipping Trinidad','fast delivery TT','USDT payment','PayPal accepted'];
  generalTerms.forEach(t => kw.add(t));

  if (specs.battery)    { const m = (specs.battery as string).match(/(\d+)/); if (m) { kw.add(`${m[1]}mAh phone`); kw.add(`${m[1]}mAh battery`); } }
  if (specs.ramRom)     kw.add(`${specs.ramRom} phone`);
  if (specs.displaySize) kw.add(`${specs.displaySize} phone`);
  if (specs.network)    kw.add(`${specs.network} phone Trinidad`);
  if (specs.waterproof) kw.add(`${specs.waterproof} rated phone`);

  const result = [...kw].filter(Boolean);
  while (result.length < 200) {
    const base = result[result.length % Math.min(result.length, 30)];
    if (base) {
      for (const sfx of ['online','price','for sale','best','Trinidad','Caribbean','buy','shop','TT','delivery']) {
        if (result.length < 200) result.push(`${base} ${sfx}`);
      }
    } else result.push(`RUGGTECH product ${result.length}`);
  }
  return result.slice(0, 200);
}

export function generateImageAltTexts(data: ScrapedData, count: number): string[] {
  const name = data.name || 'Product';
  const views = ['Front View','Back View','Side View','Display Close-up',"What's in the Box",'In Use','Detail Shot','Angle View'];
  return Array.from({ length: Math.min(count, 8) }, (_, i) =>
    `${name} - ${views[i] || `View ${i + 1}`} | RUGGTECH`
  );
}

export function generateImageFilenames(productName: string, imageUrls: string[]): string[] {
  const slug = generateSlug(productName);
  return imageUrls.map((url, i) => {
    const ext = url.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[1] || 'jpg';
    return `${slug}-${i + 1}.${ext}`;
  });
}

// ── Marketing content generator ───────────────────────────────────────────

export interface MarketingContent {
  headline: string;
  description: string;
  hashtags: string[];
}

export function generateMarketingContent(data: ScrapedData, specs: Specs, pricing: Pricing | null): MarketingContent {
  const schema = detectSchemaType(data);
  const name   = data.name || 'Product';
  const brand  = data.brand || 'RUGGTECH';
  const price  = pricing ? `TT$${pricing.sellingPriceTtd.toLocaleString()}` : null;

  // ── Headline ──────────────────────────────────────────────────────────────
  const headlines: Record<string, string> = {
    product:      `🔥 ${name} — Built for the Toughest Jobs`,
    phone:        `📱 ${name} — Power Meets Performance`,
    car:          `🔧 ${name} — Genuine Quality. Perfect Fit.`,
    agritechPage: `🌱 ${name} — Smarter Farming Starts Here`,
    offgrid:      `⚡ ${name} — Stay Powered, Anywhere`,
    watch:        `⌚ ${name} — Track Everything. Miss Nothing.`,
    product2:     `🎧 ${name} — Sound That Hits Different`,
    phoneacc:     `📦 ${name} — Protect & Upgrade Your Device`,
    electronic:   `💻 ${name} — Next-Level Tech at Your Fingertips`,
  };
  const headline = headlines[schema] || `✨ ${name} — Available Now at RUGGTECH`;

  // ── Selling points ────────────────────────────────────────────────────────
  const points: string[] = [];

  if (schema === 'product' || schema === 'phone') {
    if (specs.cpu)         points.push(`🔥 CPU: ${specs.cpu}`);
    if (specs.gpu)         points.push(`✨ GPU: ${specs.gpu}`);
    if (specs.ramRom)      points.push(`✨ RAM: ${specs.ramRom}`);
    if (specs.displaySize) points.push(`📺 Display: ${specs.displaySize}${specs.resolution ? ` · ${specs.resolution}` : ''}`);
    if (specs.rearCamera)  points.push(`📸 Camera: ${specs.rearCamera}${specs.frontCamera ? ` · Front: ${specs.frontCamera}` : ''}`);
    if (specs.battery)     points.push(`🔋 Battery: ${specs.battery}`);
    if (specs.waterproof)  points.push(`💧 ${specs.waterproof} — dust, water & shock resistant`);
    if (specs.network)     points.push(`📶 ${specs.network} — blazing fast speeds`);
    if (specs.os)          points.push(`🤖 ${specs.os}`);
    if (specs.nfc)         points.push(`💳 NFC — tap & pay with ease`);
    if (specs.biometrics)  points.push(`🔐 ${specs.biometrics}`);
  } else if (schema === 'car') {
    if (specs.partNumber)    points.push(`🔩 Part No. ${specs.partNumber} — exact OEM match`);
    if (specs.material)      points.push(`🛡️ ${specs.material} construction — built to last`);
    if (specs.compatibility) points.push(`🚗 Fits: ${specs.compatibility}`);
    if (specs.oem)           points.push(`✅ OEM compatible — guaranteed fitment`);
    points.push('🌍 Ships worldwide — Trinidad, Caribbean & beyond');
    points.push('🔧 Drop-in replacement — no modifications needed');
  } else if (schema === 'agritechPage') {
    if (specs.dimensions) points.push(`📐 ${specs.dimensions} — compact and field-ready`);
    if (specs.weight)     points.push(`⚖️ ${specs.weight} — easy to carry and deploy`);
    if (specs.material)   points.push(`🌿 ${specs.material} build — weather resistant`);
    points.push('🌱 Precision agriculture at your fingertips');
    points.push('📊 Real-time data — make smarter farming decisions');
  } else if (schema === 'offgrid') {
    if (specs.battery)    points.push(`🔋 ${specs.battery} capacity — power your essentials`);
    if (specs.dimensions) points.push(`📐 ${specs.dimensions} — compact for the trail`);
    if (specs.weight)     points.push(`⚖️ ${specs.weight} — light enough to take anywhere`);
    if (specs.waterproof) points.push(`💧 ${specs.waterproof} rated — built for the outdoors`);
    points.push('🌄 Perfect for camping, blackouts & emergencies');
    points.push('☀️ Compatible with solar charging');
  } else if (schema === 'watch') {
    if (specs.battery)     points.push(`🔋 ${specs.battery} battery life`);
    if (specs.displaySize) points.push(`⌚ ${specs.displaySize} display — clear in any light`);
    if (specs.waterproof)  points.push(`💧 ${specs.waterproof} water resistance`);
    if (specs.sensors)     points.push(`📡 Sensors: ${specs.sensors}`);
    if (specs.bluetooth)   points.push(`📲 ${specs.bluetooth} — seamless phone pairing`);
    points.push('❤️ Track heart rate, steps, sleep & more');
  } else if (schema === 'product2') {
    if (specs.bluetooth) points.push(`📡 ${specs.bluetooth} — instant wireless pairing`);
    if (specs.battery)   points.push(`🔋 ${specs.battery} playtime`);
    if (specs.waterproof) points.push(`💧 ${specs.waterproof} rated — gym & rain ready`);
    if (specs.weight)    points.push(`⚖️ ${specs.weight} — featherlight comfort`);
    points.push('🎵 Rich bass, crystal clear highs');
    points.push('🎮 Low latency — great for calls and gaming');
  } else if (schema === 'phoneacc') {
    if (specs.material)      points.push(`🛡️ ${specs.material} — premium protection`);
    if (specs.compatibility) points.push(`📱 Compatible with: ${specs.compatibility}`);
    if (specs.dimensions)    points.push(`📐 ${specs.dimensions}`);
    points.push('✅ Precise cutouts — full access to ports & buttons');
    points.push('🎨 Slim profile — keeps your phone looking sleek');
  } else {
    if (specs.dimensions) points.push(`📐 Dimensions: ${specs.dimensions}`);
    if (specs.weight)     points.push(`⚖️ Weight: ${specs.weight}`);
    if (specs.material)   points.push(`🛡️ Build: ${specs.material}`);
    if (specs.waterproof) points.push(`💧 ${specs.waterproof} rated`);
    if (specs.battery)    points.push(`🔋 ${specs.battery}`);
  }

  // Key features from scraper
  if (data.keyFeatures && data.keyFeatures.length > 0) {
    data.keyFeatures.slice(0, 3).forEach(f => {
      if (!points.some(p => p.toLowerCase().includes(f.toLowerCase().substring(0, 20)))) {
        points.push(`✨ ${f}`);
      }
    });
  }

  // What's in the box
  const boxLine = data.boxContents && data.boxContents.length > 0
    ? `\n📦 *In the Box:* ${data.boxContents.join(' · ')}`
    : '';

  // Pricing line
  const priceLine = price
    ? `\n💰 *Only ${price}* — ships fast across Trinidad & the Caribbean`
    : '\n🛒 Contact us for pricing — fast shipping across the Caribbean';

  // CTA
  const ctas: Record<string, string> = {
    product:      '🛒 Order yours today — built tough, priced right. Limited stock!',
    phone:        '📲 Grab yours now — performance you can feel. Ships island-wide!',
    car:          '🔧 Order now — OEM quality, fast delivery. Don\'t let your car wait!',
    agritechPage: '🌱 Upgrade your farm today — precision tools, Caribbean prices!',
    offgrid:      '⚡ Stay prepared. Order now before the next blackout hits!',
    watch:        '⌚ Wear it, track it, love it — order today!',
    product2:     '🎧 Life\'s better with great sound — grab yours now!',
    phoneacc:     '📦 Protect your investment — order today, ships fast!',
    electronic:   '💻 Level up your setup — order now and get it delivered fast!',
  };
  const cta = ctas[schema] || '🛒 Order now — fast delivery across Trinidad & the Caribbean!';

  // ── Assemble description ───────────────────────────────────────────────────
  const bulletBlock = points.length > 0
    ? '\n\n' + points.map(p => p).join('\n')
    : '';

  const description = [
    headline,
    bulletBlock,
    boxLine,
    priceLine,
    '',
    cta,
    '',
    '🌍 RUGGTECH — #1 Tech & Rugged Equipment Store',
    '🚀 Worldwide Shipping | 💳 PayPal & USDT Accepted',
  ].join('\n').trim();

  // ── Hashtags ───────────────────────────────────────────────────────────────
  const tags = new Set<string>();

  // Brand tags
  tags.add('#RUGGTECH');
  tags.add('#RuggtechTT');
  tags.add('#ShopRuggtech');
  if (brand && brand !== 'RUGGTECH') {
    tags.add(`#${brand.replace(/\s+/g, '')}`);
  }

  // Name-derived tags
  name.split(/[\s\-\/]+/).filter(w => w.length > 3).slice(0, 3).forEach(w => {
    tags.add(`#${w.replace(/[^a-zA-Z0-9]/g, '')}`);
  });

  // Schema-specific tags
  const schemaTagMap: Record<string, string[]> = {
    product: ['#RuggedPhone','#RuggedSmartphone','#WaterproofPhone','#OutdoorPhone',
      '#ToughPhone','#IP68Phone','#MilSpec','#ConstructionPhone','#DropProof',
      '#FieldPhone','#DurablePhone','#5GRugged','#AndroidRugged','#WorkPhone'],
    phone:   ['#Smartphone','#AndroidPhone','#MobilePhone','#NewPhone',
      '#PhoneTT','#TechTT','#PhoneDeals','#AndroidLife','#MobileDeals','#TechCaribbean'],
    car:     ['#SuzukiParts','#SuzukiTT','#CarPartsTT','#AutoPartsTrinidad',
      '#GrandVitara','#SuzukiCaribbean','#OEMParts','#CarMaintenance','#SuzukiLife'],
    agritechPage: ['#AgriTech','#FarmingTT','#SmartFarming','#PrecisionAgriculture',
      '#HydroponicsTT','#FarmingCaribbean','#AgricultureTT','#GrowLocal'],
    offgrid: ['#OffGrid','#CampingTT','#SolarPower','#PortablePower',
      '#SurvivalGear','#CampingCaribbean','#EmergencyPrep','#OutdoorLife','#BlackoutReady'],
    watch:   ['#Smartwatch','#SmartWatchTT','#FitnessTracker','#WearableTech',
      '#SmartWatchCaribbean','#TechAccessories','#HealthTracker','#FitLife'],
    product2:['#Earbuds','#WirelessEarbuds','#Headphones','#BluetoothEarbuds',
      '#TWSEarbuds','#AudioTech','#MusicLife','#SoundTT','#TechTT'],
    phoneacc:['#PhoneCase','#PhoneAccessories','#ScreenProtector','#MobileAccessories',
      '#PhoneCaseTT','#ProtectYourPhone','#TechAccessories','#PhoneDeals'],
    electronic:['#Electronics','#TechTT','#GadgetsTT','#ElectronicsTT',
      '#TechCaribbean','#Gadgets','#TechLife','#OnlineShoppingTT'],
  };

  (schemaTagMap[schema] || []).forEach(t => tags.add(t));

  // Regional & general tags
  ['#TrinidadAndTobago','#TrinidadShopping','#TTShopping','#CaribbeanTech',
    '#OnlineShoppingTT','#ShipToTT','#ShipToCaribbean','#BuyOnlineTT',
    '#TechDeals','#PayPal','#FastShipping','#Caribbean'].forEach(t => tags.add(t));

  // Spec-based tags
  if (specs.network)    tags.add(`#${specs.network.replace(/\s/g, '')}Phone`);
  if (specs.waterproof && /ip6/i.test(specs.waterproof as string)) tags.add('#IP68');
  if (specs.battery) {
    const m = (specs.battery as string).match(/(\d+)/);
    if (m && parseInt(m[1]) >= 6000) tags.add('#BigBatteryPhone');
  }

  return {
    headline,
    description,
    hashtags: [...tags].slice(0, 30),
  };
}

// ── Sanity document builder ────────────────────────────────────────────────

export function buildSanityDocument(
  data: ScrapedData,
  specs: Specs,
  pricing: Pricing | null,
  imageAssetIds: string[],
  schema: SchemaType,
  customTags: string[] = [],
  detailsOverride?: string,
  marketing?: MarketingContent,
) {
  const slug = generateSlug(data.name);
  const keywords = generateKeywords(data, specs);
  const details = detailsOverride || generateDetails(data, specs);
  const altTexts = generateImageAltTexts(data, imageAssetIds.length);
  const merged = [...new Set([...keywords, ...customTags])].slice(0, 250);

  const doc: Record<string, unknown> = {
    _type: schema,
    name: data.name,
    slug: { _type: 'slug', current: slug },
    brand: data.brand || '',
    price: pricing?.sellingPriceTtd || 0,
    originalPrice: pricing?.sellingPriceTtd ? Math.round(pricing.sellingPriceTtd * 1.15) : 0,
    details,
    keywoards: merged,
    inStock: true,
    featured: false,
    stockQuantity: data.stockQuantity || 10,
    warranty: (specs.warranty as string) || '1 Year',
    ...(marketing && {
      marketingHeadline: marketing.headline,
      marketingCaption: marketing.description,
      marketingHashtags: marketing.hashtags,
    }),
  };

  const maxImages = Math.min(imageAssetIds.length, 8);
  for (let i = 0; i < maxImages; i++) {
    const field = i === 0 ? 'image' : `image${i + 1}`;
    doc[field] = [{
      _type: 'image', _key: `img${i}`,
      asset: { _type: 'reference', _ref: imageAssetIds[i] },
      alt: altTexts[i] || `${data.name} - RUGGTECH`,
    }];
  }

  if (schema === 'phone' || schema === 'product') {
    const sanitized: Record<string, string> = {};
    Object.entries(specs).forEach(([k, v]) => {
      if (typeof v === 'string') {
        const key = k
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
          .replace(/\s+/g, '')
          .replace(/^(.)/, (_, c) => c.toLowerCase());
        sanitized[key] = v;
      }
    });
    doc.specifications = sanitized;

    // Top-level spec fields read by the products page editor
    const ramRomParts = (specs.ramRom as string || '').split(/[+\/]/);
    doc.display   = specs.displaySize || '';
    doc.battery   = specs.battery     || '';
    doc.camera    = specs.rearCamera  || specs.frontCamera || '';
    doc.ram       = ramRomParts[0]?.trim() || '';
    doc.storage   = ramRomParts[1]?.trim() || '';
    doc.os        = specs.os          || '';
    doc.processor = specs.cpu         || '';

  } else if (schema === 'car') {
    doc.partNumber = specs.partNumber || '';
    doc.compatibility = specs.compatibility || '';
    doc.oem = specs.oem || 'Yes';
    doc.installationDifficulty = specs.installationDifficulty || 'Medium';
    doc.material = specs.material || '';
    doc.location = 'Worldwide Shipping';

  } else if (schema === 'watch') {
    doc.connectivity = specs.bluetooth || specs.network || '';
    doc.waterResistance = specs.waterproof || '';
    doc.batteryLife = specs.battery || '';

  } else if (schema === 'product2') {
    doc.connectivity = specs.bluetooth || '';
    doc.batteryLife = specs.battery || '';
    doc.waterResistance = specs.waterproof || '';
  }

  return doc;
}
