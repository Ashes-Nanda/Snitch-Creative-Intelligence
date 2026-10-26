import type { PriceTable } from './telemetry'

/**
 * Prices used only when the provider does not report a request's cost. OpenRouter reports cost for each request,
 * so this is empty and costs without a report show as unavailable. Add an entry only with its source and effective
 * date, e.g. the model's page on openrouter.ai/models on the day you copied it, in USD per million tokens.
 */
export const modelPrices: PriceTable = {}
