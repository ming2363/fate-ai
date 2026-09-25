export type FestivalMotif = "moon" | "mooncake" | "rabbit" | "change" | "lantern" | "boat" | "zongzi" | "flower" | "leaf" | "sun" | "snow" | "flag" | "book" | "grain";

export type FestivalTheme = {
  readonly name: string;
  readonly caption: string;
  readonly motifs: readonly FestivalMotif[];
};
