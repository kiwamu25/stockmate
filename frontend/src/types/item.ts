export type Item = {
  id: number;
  series_id?: number;
  sku: string;
  name: string;
  item_type: "component" | "assembly";
  pack_qty?: number;
  reorder_point?: number;
  managed_unit: "g" | "pcs";
  rev_code?: string;
  stock_managed: boolean;
  is_sellable: boolean;
  is_final: boolean;
  output_category?: string;
  note?: string;
  created_at?: string;
  updated_at?: string;
  assembly?: {
    manufacturer?: string;
    total_weight?: number;
    pack_size?: string;
    note?: string;
  };
  component?: {
    manufacturer?: string;
    component_type?: string;
    color?: string;
  };
};
