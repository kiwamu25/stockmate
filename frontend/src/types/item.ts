export type ComponentType = "part" | "material" | "consumable";
export type ComponentPurchaseLink = {
  id?: number;
  url: string;
  label?: string;
  sort_order?: number;
  created_at?: string;
  enabled: boolean;
};

export type Item = {
  id: number;
  series_id?: number;
  sku: string;
  name: string;
  item_type: "component" | "assembly";
  pack_qty?: number;
  reorder_point?: number;
  managed_unit: "g" | "pcs";
  stock_managed: boolean;
  is_sellable: boolean;
  is_final: boolean;
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
    component_type?: ComponentType;
    color?: string;
    purchase_links?: ComponentPurchaseLink[];
  };
};
