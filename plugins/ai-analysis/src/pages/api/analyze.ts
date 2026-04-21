import type { NextApiRequest, NextApiResponse } from "next";
import { b } from "../../../baml_client";
import { createServerSDK } from "../../../../server-sdk";
import type { AnalysisResult } from "../../domain";

interface AnalyzeRequest {
  productId: string | number;
}

interface ErrorResponse {
  error: string;
  details?: string[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnalysisResult | ErrorResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body as Partial<AnalyzeRequest>;

  const productId = body.productId != null ? String(body.productId).trim() : "";
  if (!productId) {
    return res.status(400).json({
      error: "Missing required fields",
      details: ["productId"],
    });
  }

  const sdk = createServerSDK("ai-analysis", undefined, req);

  try {
    const product = (await sdk.hostApp.getProduct(productId)) as {
      name: string;
      description: string;
      category: { name: string };    
      price: number;
    };

    const result = await b.AnalyzeProduct(
      product.name,
      product.description,
      product.category.name,
      product.price
    );

    return res.status(200).json({
      rows: [
        {
          dimension: "description",
          verdict: result.description.verdict,
          justification: result.description.verdict === "OK" ? null : (result.description.justification ?? null),
        },
        {
          dimension: "category",
          verdict: result.category.verdict,
          justification: result.category.verdict === "OK" ? null : (result.category.justification ?? null),
        },
        {
          dimension: "price",
          verdict: result.price.verdict,
          justification: result.price.verdict === "OK" ? null : (result.price.justification ?? null),
        },
      ],
    });
  } catch (err) {
    console.error("Analyze failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    const statusMatch = message.match(/Host API error (\d+)/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 500;
    return res.status(status).json({ error: message });
  }
}
