import { useEffect, useState, useCallback } from "react";
import { getSDK } from "../../../sdk";
import { toDeliveryMethod, toProductShippingData } from "../domain";
import type { DeliveryMethod } from "../domain";

export function ProductShippingTab() {
  const sdk = getSDK();
  const productId = sdk.thisPlugin.productId ?? "";

  const [methods, setMethods] = useState<DeliveryMethod[]>([]);
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const sdk2 = getSDK();
      const objects = await sdk2.thisPlugin.objects.list("method");
      const loadedMethods = objects.map(toDeliveryMethod);

      let raw: Record<string, unknown> | null = null;
      try {
        raw = (await sdk2.thisPlugin.getData(productId)) as Record<string, unknown> | null;
      } catch {
        // no data yet
      }

      const shippingData = toProductShippingData(raw);
      const map: Record<string, boolean> = {};
      for (const m of loadedMethods) {
        map[m.objectId] = !shippingData.disabledMethods.includes(m.objectId);
      }

      setMethods(loadedMethods);
      setEnabledMap(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shipping data");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const disabledMethods = methods.filter((m) => !enabledMap[m.objectId]).map((m) => m.objectId);
      await sdk.thisPlugin.setData(productId, { disabledMethods } as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save shipping settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="tc-plugin" style={{ padding: "1rem" }}>Loading...</div>;

  return (
    <div className="tc-plugin" style={{ padding: "1rem" }}>
      <h3 style={{ margin: "0 0 1rem" }}>Shipping Methods</h3>
      {error && <p className="tc-error">{error}</p>}

      {methods.length === 0 ? (
        <p>No delivery methods defined. Add methods in the Logistics section.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
            {methods.map((m) => (
              <label key={m.objectId} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={enabledMap[m.objectId] ?? true}
                  onChange={(e) =>
                    setEnabledMap((prev) => ({ ...prev, [m.objectId]: e.target.checked }))
                  }
                />
                {m.name}
              </label>
            ))}
          </div>
          <button className="tc-primary-button" onClick={() => void handleSave()} disabled={saving}>
            {saved ? "Saved!" : "Save"}
          </button>
        </>
      )}
    </div>
  );
}
