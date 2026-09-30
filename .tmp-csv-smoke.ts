import { validateAndParseCsv } from "./components/modules/CampaignsModule";

const file = { name: "leads.csv" } as File;
const valid = validateAndParseCsv(
  file,
  'Person,Role,Company,Email,LinkedIn Profile,Industry,Location\nJane Doe,VP Sales,Northstar,jane@northstar.test,https://linkedin.com/in/jane,Software,"Austin, USA"',
);
const invalid = validateAndParseCsv(file, "Person,Role,Email\nJane Doe,VP Sales,jane@example.test");
if (
  !valid.valid ||
  valid.leads.length !== 1 ||
  valid.leads[0].importSource !== "csv" ||
  valid.leads[0].linkedinUrl !== "https://linkedin.com/in/jane" ||
  valid.leads[0].city !== "Austin" ||
  invalid.valid
) {
  throw new Error("CSV parser smoke check failed");
}
console.log("CSV valid/invalid/header mapping checks passed");
