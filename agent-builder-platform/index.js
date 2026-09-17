import "dotenv/config";
import { runTrendBriefAgent } from "./src/archetypes/trend-brief/run.js";

const result = await runTrendBriefAgent();

console.log(`\nClient: ${result.client.businessName}`);
console.log(`Mocked run: ${result.run.mocked}`);
console.log(`Estimated cost: $${result.run.costUsd.toFixed(4)}`);
console.log(
  result.delivery.dryRun
    ? `Dry run — brief written to ${result.delivery.filePath}`
    : `Delivered to ${result.delivery.to}`
);
console.log("\n--- Brief ---\n");
console.log(result.brief);
