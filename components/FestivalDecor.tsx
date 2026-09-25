import type { FestivalMotif, FestivalTheme } from "@/lib/shared/festival";

function FestivalIcon({ motif }: { readonly motif: FestivalMotif }) {
  const shared = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" {...shared}>
    {motif === "moon" ? <><path d="M32 7a18 18 0 1 0 9 30A19 19 0 0 1 32 7Z"/><path d="m12 6 1 3 3 1-3 1-1 3-1-3-3-1 3-1ZM37 13l.6 2 2 .6-2 .6-.6 2-.6-2-2-.6 2-.6Z"/></> : null}
    {motif === "mooncake" ? <><circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="13"/><path d="M24 14c4 4 4 6 0 10-4-4-4-6 0-10Zm0 20c4-4 4-6 0-10-4 4-4 6 0 10ZM14 24c4-4 6-4 10 0-4 4-6 4-10 0Zm20 0c-4-4-6-4-10 0 4 4 6 4 10 0Z"/></> : null}
    {motif === "rabbit" ? <><path d="M18 22c-3-7-4-15 0-16 4-1 5 7 6 14 1-7 3-15 7-14 4 1 3 9-1 16 7 2 11 6 11 11 0 7-8 11-17 11S7 40 7 33c0-5 4-9 11-11Z"/><path d="M17 32h.2m14-.2h.2M22 37l2 2 2-2M8 36l-5 2m37-2 5 2"/></> : null}
    {motif === "change" ? <><circle cx="25" cy="12" r="4"/><path d="M20 11c0-5 2-7 5-7m-6 15c-2 5-5 9-10 11m20-11c3 5 7 8 12 9M20 19h9l3 11 8 12H9l8-12 3-11ZM12 27c4-1 6-3 8-6m17 6c-4-1-6-3-8-6M18 42c4-5 8-8 14-11"/></> : null}
    {motif === "lantern" ? <><path d="M24 4v6m-9 4h18m-18 20h18M18 10h12l5 6v14l-5 5H18l-5-5V16l5-6Zm6 25v9m-4-4 4 4 4-4M13 19h22M13 27h22"/></> : null}
    {motif === "boat" ? <><path d="m7 27 34-3-6 13H14L7 27Zm-3 15c4-2 7-2 10 0 3-2 6-2 10 0 4-2 7-2 10 0 3-2 6-2 10 0M24 5v21m0-18 12 12H24"/></> : null}
    {motif === "zongzi" ? <><path d="M24 6 41 37H7L24 6Zm0 0v31m-17 0 17-14 17 14M12 29c8-7 16-7 24 0"/></> : null}
    {motif === "flower" ? <><circle cx="24" cy="24" r="3"/><path d="M24 21c-8-11-10-3-8 3-10-3-10 5-3 8-7 7 0 11 7 7 4 9 10 7 11-1 9 2 11-5 4-9 8-5 3-11-4-8 0-8-6-12-7 0Z"/></> : null}
    {motif === "leaf" ? <><path d="M39 7C19 8 9 18 9 31c0 7 5 10 11 9C34 38 40 25 39 7ZM9 42c7-12 15-19 26-27m-16 16-7-5m15-4 1 10"/></> : null}
    {motif === "sun" ? <><circle cx="24" cy="24" r="9"/><path d="M24 3v8m0 26v8M3 24h8m26 0h8M9 9l6 6m18 18 6 6M39 9l-6 6M15 33l-6 6"/></> : null}
    {motif === "snow" ? <><path d="M24 4v40M7 14l34 20M7 34l34-20M19 8l5 5 5-5m-10 32 5-5 5 5M8 19l7-1-1-7m20 26 1-7 7-1M8 29l7 1-1 7m20-26 1 7 7 1"/></> : null}
    {motif === "flag" ? <><path d="M10 44V6m0 2c8-5 14 5 28 0v24c-13 5-20-5-28 0"/><path d="m20 17 2 3-1 3 3-2 3 2-1-3 2-3-4 1-4-1Z"/></> : null}
    {motif === "book" ? <><path d="M24 13C18 8 11 8 5 10v27c7-2 13-1 19 4 6-5 12-6 19-4V10c-6-2-13-2-19 3Zm0 0v28M10 17c4-1 7 0 10 2m8 0c3-2 6-3 10-2M10 25c4-1 7 0 10 2m8 0c3-2 6-3 10-2"/></> : null}
    {motif === "grain" ? <><path d="M23 44V8m0 12c-8 0-12-4-12-10 7-1 11 2 12 10Zm1 8c8 0 12-4 12-10-7-1-11 2-12 10Zm-1 8c-8 0-12-4-12-10 7-1 11 2 12 10Zm1-24c6-1 9-4 9-9-6-1-9 2-9 9Z"/></> : null}
  </svg>;
}

export function FestivalLabel({ theme }: { readonly theme: FestivalTheme }) {
  return <span className="festival-label"><FestivalIcon motif={theme.motifs[0] ?? "flower"} /><span>今日 · {theme.name}<small>{theme.caption}</small></span></span>;
}

export function FestivalOrnaments({ theme, place }: { readonly theme: FestivalTheme; readonly place: "hero" | "form" | "overview" }) {
  return <div className={`festival-ornaments festival-ornaments-${place}`} aria-hidden="true">
    {theme.motifs.map((motif, index) => <span key={`${motif}-${index}`}><FestivalIcon motif={motif} /></span>)}
  </div>;
}
