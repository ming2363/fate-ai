import { SITE_NAME } from "@/lib/shared/versions";

export type CardView = {
  readonly typeLabel: string | null;
  readonly title: string | null;
  readonly keywords: readonly string[];
  readonly element: string | null;
  readonly image: string | null;
  readonly zodiacLabel: string;
  readonly sentence: string;
};

function cardTitle(card: CardView): string {
  return card.typeLabel && card.title ? `${card.typeLabel} · ${card.title}` : "日主待确认";
}

export function PersonaSummary({ card }: { readonly card: CardView }) {
  return (
    <section className="persona-summary" data-element={card.element ?? undefined} aria-labelledby="persona-summary-title">
      <div>
        <p className="kicker">{SITE_NAME} / 你的中式人格</p>
        <p className="persona-symbol">命盘意象 · {card.image ?? card.element ?? "待确认"}</p>
        <h2 id="persona-summary-title">{cardTitle(card)}</h2>
        <p className="keywords">{card.keywords.join(" · ")}</p>
        <p className="meta-line">{card.element ? `${card.element} · ` : ""}{card.zodiacLabel}</p>
      </div>
      <p className="sentence">{card.sentence}</p>
    </section>
  );
}

export function PersonaCard({ card, artwork }: { readonly card: CardView; readonly artwork: string }) {
  return (
    <article className="persona" id="persona-card" data-element={card.element ?? undefined}>
      <div className="persona-art">
        <img src={artwork} alt={`以${card.image ?? card.element ?? "国风"}为意象的国风人物插画`} />
      </div>
      <div className="persona-copy">
        <p className="kicker">{SITE_NAME} <span>/ 你的中式人格卡</span></p>
        <p className="persona-symbol">命盘意象 · {card.image ?? card.element ?? "待确认"}</p>
        <h2>{cardTitle(card)}</h2>
        <p className="keywords">{card.keywords.join(" · ")}</p>
        <p className="meta-line">{card.element ? `${card.element} · ` : ""}{card.zodiacLabel}</p>
        <p className="sentence">{card.sentence}</p>
      </div>
    </article>
  );
}
