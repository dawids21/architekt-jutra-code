import type { PluginObject } from "../../sdk";

export interface DeliveryMethod {
  objectId: string;
  name: string;
}

export interface ProductShippingData {
  disabledMethods: string[];
}

export function toDeliveryMethod(obj: PluginObject): DeliveryMethod {
  return { objectId: obj.objectId, name: obj.data.name as string };
}

export function toProductShippingData(raw: Record<string, unknown> | null): ProductShippingData {
  if (!raw || !Array.isArray(raw.disabledMethods)) {
    return { disabledMethods: [] };
  }
  return { disabledMethods: raw.disabledMethods as string[] };
}
