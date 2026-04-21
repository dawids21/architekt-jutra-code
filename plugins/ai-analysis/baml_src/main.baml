enum Verdict {
  OK
  ISSUE
}

class DimensionResult {
  verdict Verdict
  justification string? // present only when verdict is ISSUE; one sentence
}

class ProductAnalysis {
  description DimensionResult
  category DimensionResult
  price DimensionResult
}

function AnalyzeProduct(
  name: string,
  description: string,
  category: string,
  price: float
) -> ProductAnalysis {
  client LlmProvider
  prompt #"
    You are a product quality analyst. Analyze the product record below and return a structured verdict for each of three dimensions.

    Product Name: {{ name }}
    Description: {{ description }}
    Category: {{ category }}
    Price: {{ price }}

    ## Dimension rules

    **description**: Judge solely from the record.
    - ISSUE if description is empty, too short (under 10 words), or clearly irrelevant to the product name.
    - OK otherwise.

    **category**: Judge solely from the record.
    - ISSUE if the category is missing or does not match the product name/description.
    - OK otherwise.

    **price**: Use web search to find current market prices for comparable products.
    - ISSUE if the price is significantly out of range (more than 3x above or below typical market price), with a one-sentence justification citing the range found.
    - OK if the price is reasonable OR if you cannot find sufficient comparable products to make a confident judgment. When returning OK, set justification to null.

    For each dimension:
    - Set verdict to OK or ISSUE.
    - Set justification to a single sentence explaining the issue, or null when verdict is OK.

    {{ ctx.output_format }}
  "#
}
