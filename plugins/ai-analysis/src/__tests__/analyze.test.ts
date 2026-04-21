import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

const mockAnalyzeProduct = jest.fn();

jest.mock("../../baml_client", () => ({
  b: {
    AnalyzeProduct: (...args: unknown[]) => mockAnalyzeProduct(...args),
  },
}));

const mockGetProduct = jest.fn();

jest.mock("../../../server-sdk", () => ({
  createServerSDK: () => ({
    hostApp: {
      getProduct: (...args: unknown[]) => mockGetProduct(...args),
    },
  }),
}));

import handler from "../pages/api/analyze";

describe("POST /api/analyze", () => {
  beforeEach(() => {
    mockAnalyzeProduct.mockReset();
    mockGetProduct.mockReset();
  });

  test("rejects_missingProductId_returns400WithDetails", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const body = JSON.parse(res._getData());
    expect(body.error).toBe("Missing required fields");
    expect(body.details).toContain("productId");
  });

  test("rejects_nonPostMethod_returns405", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      body: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  test("accepts_validRequest_fetchesProductAndInvokesBaml", async () => {
    mockGetProduct.mockResolvedValue({
      name: "Test Product",
      description: "A test product",
      category: "Electronics",
      price: 99.99,
    });
    mockAnalyzeProduct.mockResolvedValue({
      description: { verdict: "OK", justification: null },
      category: { verdict: "OK", justification: null },
      price: { verdict: "OK", justification: null },
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: { productId: "5" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockGetProduct).toHaveBeenCalledWith("5");
    expect(mockAnalyzeProduct).toHaveBeenCalledWith(
      "Test Product",
      "A test product",
      "Electronics",
      99.99
    );
  });

  test("success_mapsProductAnalysisToThreeRows", async () => {
    mockGetProduct.mockResolvedValue({
      name: "Widget",
      description: "A great widget",
      category: "Tools",
      price: 49.99,
    });
    mockAnalyzeProduct.mockResolvedValue({
      description: { verdict: "OK", justification: null },
      category: { verdict: "ISSUE", justification: "Category does not match product type." },
      price: { verdict: "ISSUE", justification: "Price is 5x above typical market range of $8–$12." },
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: { productId: "10" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.rows).toHaveLength(3);
    expect(body.rows[0]).toEqual({ dimension: "description", verdict: "OK", justification: null });
    expect(body.rows[1]).toEqual({ dimension: "category", verdict: "ISSUE", justification: "Category does not match product type." });
    expect(body.rows[2]).toEqual({ dimension: "price", verdict: "ISSUE", justification: "Price is 5x above typical market range of $8–$12." });
  });

  test("productFetchFails_returns500", async () => {
    mockGetProduct.mockRejectedValue(new Error("Host API error 404"));

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: { productId: "999" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  test("bamlFailure_returns500_withoutLeakingInternals", async () => {
    mockGetProduct.mockResolvedValue({
      name: "Widget",
      description: "A great widget",
      category: "Tools",
      price: 49.99,
    });
    mockAnalyzeProduct.mockRejectedValue(new Error("LLM provider timeout"));

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: { productId: "42" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const body = JSON.parse(res._getData());
    expect(body.error).toBeDefined();
  });
});
