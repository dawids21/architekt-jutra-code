import { useEffect, useState, useCallback } from "react";
import { getSDK } from "../../../sdk";
import { toDeliveryMethod } from "../domain";
import type { DeliveryMethod } from "../domain";

export function MethodsPage() {
  const [methods, setMethods] = useState<DeliveryMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const loadMethods = useCallback(async () => {
    try {
      const sdk = getSDK();
      const objects = await sdk.thisPlugin.objects.list("method");
      setMethods(objects.map(toDeliveryMethod));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load delivery methods");
    }
  }, []);

  useEffect(() => {
    void loadMethods().finally(() => setLoading(false));
  }, [loadMethods]);

  async function handleAdd() {
    if (!newName.trim()) return;
    setError(null);
    try {
      const sdk = getSDK();
      await sdk.thisPlugin.objects.save("method", crypto.randomUUID(), { name: newName.trim() });
      setNewName("");
      await loadMethods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add delivery method");
    }
  }

  function handleStartEdit(id: string, currentName: string) {
    setEditingId(id);
    setEditingName(currentName);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditingName("");
  }

  async function handleSaveEdit() {
    if (!editingId || !editingName.trim()) return;
    setError(null);
    try {
      const sdk = getSDK();
      await sdk.thisPlugin.objects.save("method", editingId, { name: editingName.trim() });
      setEditingId(null);
      setEditingName("");
      await loadMethods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename delivery method");
    }
  }

  async function handleDelete(objectId: string) {
    setError(null);
    try {
      const sdk = getSDK();
      await sdk.thisPlugin.objects.delete("method", objectId);
      await loadMethods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete delivery method");
    }
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div className="tc-plugin" style={{ padding: "1rem", maxWidth: 800 }}>
      <h1>Delivery Methods</h1>
      {error && <p className="tc-error">{error}</p>}

      <section className="tc-section">
        <div className="tc-flex" style={{ marginBottom: "1rem" }}>
          <input
            className="tc-input"
            placeholder="Method name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="tc-primary-button" onClick={() => void handleAdd()} disabled={!newName.trim()}>
            Add
          </button>
        </div>

        {methods.length === 0 ? (
          <p>No delivery methods yet. Add one above.</p>
        ) : (
          <table className="tc-table">
            <thead>
              <tr>
                <th>Name</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {methods.map((m) =>
                editingId === m.objectId ? (
                  <tr key={m.objectId}>
                    <td>
                      <input
                        className="tc-input"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                      />
                    </td>
                    <td>
                      <div className="tc-flex">
                        <button
                          className="tc-primary-button"
                          onClick={() => void handleSaveEdit()}
                          disabled={!editingName.trim()}
                        >
                          Save
                        </button>
                        <button className="tc-ghost-button" onClick={handleCancelEdit}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={m.objectId}>
                    <td>{m.name}</td>
                    <td>
                      <div className="tc-flex">
                        <button
                          className="tc-ghost-button"
                          onClick={() => handleStartEdit(m.objectId, m.name)}
                          disabled={editingId !== null}
                        >
                          Edit
                        </button>
                        <button
                          className="tc-ghost-button tc-ghost-button--danger"
                          onClick={() => void handleDelete(m.objectId)}
                          disabled={editingId !== null}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
