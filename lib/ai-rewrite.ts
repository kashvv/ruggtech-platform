import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

export async function rewriteDescription(
  currentDetails: string,
  productName: string,
  brand: string,
  schemaType: string,
  specs: Record<string, unknown>,
): Promise<string> {
  const specLines = Object.entries(specs)
    .filter(([k, v]) => v && typeof v === 'string' && k !== 'keyFeatures')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `You are a product copywriter for RUGGTECH, a wholesale tech and equipment supplier in Trinidad & Tobago serving the Caribbean.

Rewrite this product description to be professional, clear, and compelling for B2B wholesale buyers. Keep all factual specs accurate. Use this exact structure:

${productName}

[One-line headline — what this product does and why it matters]

Core Specs
- [Spec]: [Value] (list the 6 most important specs)

Key Features
- [Feature]: [One sentence benefit] (4 features max)

Best For
- [User type] - [One benefit] (3 audiences)

What's In The Box
- [Item] (list if known, otherwise skip this section)

RULES:
- Keep it factual — no hype words like "revolutionary" or "game-changing"
- Use plain language a business buyer understands
- Include ALL key specs from the source data
- Do NOT add any specs or features that aren't in the source data
- Do NOT include pricing or availability
- Output ONLY the rewritten description text, no commentary

PRODUCT: ${productName}
BRAND: ${brand}
TYPE: ${schemaType}

CURRENT DESCRIPTION:
${currentDetails}

SPECS:
${specLines}`,
    }],
  });

  const block = message.content[0];
  if (block.type === 'text') return block.text;
  return currentDetails;
}

export async function fillMissingFields(
  product: Record<string, unknown>,
  emptyFieldKeys: string[],
): Promise<Record<string, string>> {
  const contextLines = Object.entries(product)
    .filter(([k, v]) => v && typeof v === 'string' && !emptyFieldKeys.includes(k) && !k.startsWith('_') && !k.startsWith('image'))
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const fieldList = emptyFieldKeys.join(', ');

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are a product data specialist for RUGGTECH, a wholesale tech and equipment supplier in Trinidad & Tobago.

Based on the existing product information below, generate plausible values for the MISSING fields. Only use factual information that can be reasonably inferred from the existing data. If you genuinely cannot determine a value with confidence, leave it out.

MISSING FIELDS TO FILL: ${fieldList}

EXISTING PRODUCT DATA:
${contextLines}

RULES:
- Only infer facts from the existing data — do not fabricate specs that aren't supported
- For descriptions/details, write professional B2B wholesale copy
- For SEO titles: under 60 chars, include brand + product type
- For SEO descriptions: under 160 chars, focus on key benefits
- For keywords/tags: relevant search terms as array
- For prices: leave empty if not clearly derivable

Output a JSON object with only the fields you can confidently fill. Format:
{"fieldKey": "value", ...}

Output ONLY the JSON object, no commentary, no markdown code fences.`,
    }],
  });

  const block = message.content[0];
  if (block.type !== 'text') return {};
  try {
    const text = block.text.trim().replace(/^```json\s*|\s*```$/g, '');
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
  } catch {
    // Invalid JSON response — return empty
  }
  return {};
}

export async function rewriteMarketing(
  currentCaption: string,
  productName: string,
  brand: string,
): Promise<string> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are RUGGTECH's social media manager. Rewrite this product caption for Instagram/WhatsApp marketing.

RULES:
- Keep it under 300 words
- Use emojis sparingly (max 5)
- Include a clear CTA (call to action)
- Mention RUGGTECH brand
- Keep all factual specs accurate
- End with 5-8 relevant hashtags
- Output ONLY the caption text, no commentary

PRODUCT: ${productName}
BRAND: ${brand}

CURRENT CAPTION:
${currentCaption}`,
    }],
  });

  const block = message.content[0];
  if (block.type === 'text') return block.text;
  return currentCaption;
}
