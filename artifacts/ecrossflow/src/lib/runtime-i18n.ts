const originalTexts = new Map<Text, string>();
let observer: MutationObserver | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function shouldSkipElement(el: Element | null): boolean {
  if (!el) return true;
  if (el.closest("[data-no-translate='true']")) return true;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "script" ||
    tag === "style" ||
    tag === "noscript" ||
    tag === "textarea" ||
    tag === "input" ||
    tag === "select" ||
    tag === "option" ||
    tag === "code" ||
    tag === "pre"
  );
}

function shouldTranslateText(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return false;
  if (value.length < 2 || value.length > 280) return false;
  if (/^[0-9\s.,:+\-/%$€£¥()]+$/.test(value)) return false;
  return true;
}

function collectTextNodes(root: ParentNode): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    const parent = node.parentElement;
    if (!parent || shouldSkipElement(parent)) {
      current = walker.nextNode();
      continue;
    }
    if (shouldTranslateText(node.nodeValue || "")) {
      nodes.push(node);
    }
    current = walker.nextNode();
  }
  return nodes;
}

async function fetchRuntimeTranslations(locale: string, texts: string[]): Promise<Record<string, string>> {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const response = await fetch(`${base}/api/i18n/translate-runtime`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale, texts }),
  });
  if (!response.ok) return {};
  const payload = await response.json() as { translations?: Record<string, string> };
  return payload.translations || {};
}

async function translateDom(locale: string): Promise<void> {
  const nodes = collectTextNodes(document.body);
  if (!nodes.length) return;

  const uniqueTexts = Array.from(new Set(nodes.map((node) => (node.nodeValue || "").replace(/\s+/g, " ").trim())));
  if (!uniqueTexts.length) return;

  const translated = await fetchRuntimeTranslations(locale, uniqueTexts);
  for (const node of nodes) {
    if (!originalTexts.has(node)) {
      originalTexts.set(node, node.nodeValue || "");
    }
    const normalized = (originalTexts.get(node) || "").replace(/\s+/g, " ").trim();
    const replacement = translated[normalized];
    if (replacement) node.nodeValue = replacement;
  }
}

function restoreOriginalTexts(): void {
  for (const [node, value] of originalTexts.entries()) {
    node.nodeValue = value;
  }
  originalTexts.clear();
}

export function stopRuntimeTranslation(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  restoreOriginalTexts();
}

export async function startRuntimeTranslation(locale: string): Promise<void> {
  stopRuntimeTranslation();
  if (locale === "fr") return;

  await translateDom(locale);

  observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void translateDom(locale);
    }, 200);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}
