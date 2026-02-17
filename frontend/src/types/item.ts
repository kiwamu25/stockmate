export type Item = {
  id: number;
  sku: string;
  name: string;
  category: "material" | "part" | "product";
  base_unit: "g" | "pcs";
  stock_managed: boolean;
  note?: string;
  created_at?: string;
  updated_at?: string;
};
