export type Item = {
  id: number;
  series_id?: number;
  sku: string;
  name: string;
  category: "material" | "part" | "product";
  pack_qty?: number;
  managed_unit: "g" | "pcs";
  rev_code?: string;
  stock_managed: boolean;
  note?: string;
  created_at?: string;
  updated_at?: string;
  product?: {
    total_weight?: number;
    pack_size?: string;
    note?: string;
  };
  material?: {
    manufacturer?: string;
    material_type?: string;
    color?: string;
  };
  part?: {
    manufacturer?: string;
    note?: string;
  };
};
