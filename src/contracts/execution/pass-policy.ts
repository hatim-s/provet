type PassPolicy =
  | { readonly type: "all" }
  | { readonly type: "any" }
  | { readonly minimumRatio: number; readonly type: "ratio" };

export type { PassPolicy };
