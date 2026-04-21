import { useState, useEffect, useRef } from "react";
import { getSDK } from "../../../sdk";
import type { PluginSDKType } from "../../../sdk";
import type { AnalysisResult } from "../domain";

export default function ProductTab() {
  const sdkRef = useRef<PluginSDKType | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sdk = getSDK();
    sdkRef.current = sdk;
    setProductId(sdk.thisPlugin.productId ?? "");
  }, []);

  // Still mounting — render nothing to avoid hydration mismatch
  if (productId === null) return null;

  if (!productId) {
    return (
      <div className="tc-plugin" style={{ padding: "1.5rem" }}>
        <p className="tc-error">Product ID is missing. This tab must be opened from a product detail page.</p>
      </div>
    );
  }

  async function handleAnalyze() {
    const sdk = sdkRef.current;
    if (!sdk) return;
    setError(null);
    setLoading(true);

    try {
      const token = await sdk.hostApp.getToken();
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ productId }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Analysis failed.");
      }

      const data = (await response.json()) as AnalysisResult;
      setResult(data);
    } catch (err) {
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        setError("Network error. Please check your connection and try again.");
      } else {
        setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tc-plugin" style={{ padding: "1.5rem" }}>
      <h3 style={{ margin: "0 0 1rem" }}>AI Analysis</h3>

      {error && <p className="tc-error">{error}</p>}

      {result && (
        <table className="tc-table" style={{ marginBottom: "1rem", width: "100%" }}>
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Verdict</th>
              <th>Justification</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.dimension}>
                <td style={{ textTransform: "capitalize" }}>{row.dimension}</td>
                <td>
                  <span className={row.verdict === "OK" ? "tc-badge--success" : "tc-badge--danger"}>
                    {row.verdict}
                  </span>
                </td>
                <td>{row.justification ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button
        className="tc-primary-button"
        onClick={() => void handleAnalyze()}
        disabled={loading}
      >
        {loading ? "Analyzing…" : result ? "Re-analyze" : "Analyze"}
      </button>
    </div>
  );
}
