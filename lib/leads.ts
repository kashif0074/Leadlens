import "server-only";

import type { Lead } from "../types";
import { extractSearchCriteria, type SearchCriteria } from "./grok";
import { getCityCoordinates, mapIndustryToCategory, searchBusinessesByCategory } from "./geoapify";
import { confirmCompanyDomain } from "./tavily";
import { scrapeCompanyWebsite, normalizeWebsiteUrl, extractDomainFromUrl, isInvalidDomain } from "./scraper";
import { findEmailsByDomain, pickBestEmail } from "./snov";
import { verifyEmail } from "./zerobounce";
import {
  scoreCompany,
  determineLeadRole,
  determineLeadFunction,
  determineVerificationTag,
  generateMatchReason,
} from "./scoring";
import { db } from "./db";
import { cleanCompanyName } from "./leadDisplay";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REJECTED_ZEROBOUNCE = new Set(["invalid", "spamtrap", "abuse", "do_not_mail"]);

export type PipelineResult = {
  criteria: SearchCriteria;
  totalFound: number;
  leads: Lead[];
  previewLeads: Lead[];
};

export async function discoverCompaniesFromPrompt(
  prompt: string,
  userId?: string | null,
  maxLeads: number = 8,
): Promise<PipelineResult> {
  const criteria = await extractSearchCriteria(prompt);

  const { lat, lon, city: detectedCity, country: detectedCountry } = await getCityCoordinates(
    criteria.city,
    criteria.country,
  );
  const effectiveCity = detectedCity || criteria.city;
  const effectiveCountry = detectedCountry || criteria.country || "Global";

  const category = mapIndustryToCategory(criteria.industry);
  const businesses = await searchBusinessesByCategory(category, lat, lon, 25000, 30);

  const seenDomains = new Set<string>();
  const seenNames = new Set<string>();
  const uniqueCompanies: Array<{
    name: string;
    cleanedName: string;
    website: string | null;
    domain: string;
    address: string;
    phone: string | null;
    city: string;
    country: string;
  }> = [];

  for (const biz of businesses) {
    const rawName = biz.name?.trim() || "";
    if (!rawName || rawName.toLowerCase() === "unknown" || rawName.length < 2) continue;

    const cleanedName = cleanCompanyName(rawName);
    const normalizedNameKey = cleanedName.toLowerCase();
    if (seenNames.has(normalizedNameKey)) continue;

    let domain = "";
    let website = biz.website ? normalizeWebsiteUrl(biz.website) : null;

    if (website) {
      domain = extractDomainFromUrl(website);
      if (isInvalidDomain(domain)) {
        website = null;
        domain = "";
      }
    }

    if (domain && seenDomains.has(domain)) continue;

    if (domain) seenDomains.add(domain);
    seenNames.add(normalizedNameKey);

    uniqueCompanies.push({
      name: rawName,
      cleanedName,
      website,
      domain,
      address: biz.address || `${effectiveCity}, ${effectiveCountry}`,
      phone: biz.phone,
      city: biz.city || effectiveCity,
      country: biz.country || effectiveCountry,
    });

    if (uniqueCompanies.length >= maxLeads + 4) break;
  }

  if (!uniqueCompanies.length) {
    return {
      criteria,
      totalFound: 0,
      leads: [],
      previewLeads: [],
    };
  }

  const targetCompanies = uniqueCompanies.slice(0, maxLeads);
  const companyEnrichmentPromises = targetCompanies.map(async (company) => {
    try {
      const tavilyResult = await confirmCompanyDomain(
        company.cleanedName,
        company.website,
        company.city,
      );

      const verifiedWebsite = tavilyResult.discoveredWebsite || company.website;
      const domain = verifiedWebsite ? extractDomainFromUrl(verifiedWebsite) : company.domain;
      const isDomainConfirmed = tavilyResult.isValid;
      const researchSummary = tavilyResult.summary;

      let scrapedText = "";
      let teamText = "";
      let discoveredEmails: string[] = [];
      let discoveredExecutives: Array<{ name: string; jobTitle: string; role: Lead["role"] }> = [];

      if (verifiedWebsite && !isInvalidDomain(domain)) {
        try {
          const scrapeResult = await scrapeCompanyWebsite(verifiedWebsite);
          scrapedText = scrapeResult.homepageText;
          teamText = scrapeResult.teamPageText;
          discoveredEmails = scrapeResult.discoveredEmails.filter((email) => EMAIL_PATTERN.test(email));
          discoveredExecutives = scrapeResult.discoveredExecutives;
        } catch {
          // ignore scraping failure
        }
      }

      let snovEmails: Array<{
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        position: string | null;
        status: string | null;
      }> = [];
      if (domain && !isInvalidDomain(domain)) {
        try {
          snovEmails = await findEmailsByDomain(domain);
        } catch {
          snovEmails = [];
        }
      }

      const bestSnov = pickBestEmail(snovEmails);

      let contactName = "";
      let contactJobTitle = "";
      let contactEmail = "";
      let emailVerified = false;
      let emailVerifyStatus = "unverified";

      if (bestSnov?.email && EMAIL_PATTERN.test(bestSnov.email)) {
        contactEmail = bestSnov.email;
        contactName = [bestSnov.firstName, bestSnov.lastName].filter(Boolean).join(" ").trim();
        contactJobTitle = bestSnov.position || "Director";
        emailVerified = bestSnov.status === "valid" || bestSnov.status === "verified";
        emailVerifyStatus = bestSnov.status || "valid";
      } else if (discoveredEmails.length > 0) {
        contactEmail = discoveredEmails[0];
        const topExec = discoveredExecutives[0];
        contactName = topExec?.name || `${company.cleanedName} Leadership`;
        contactJobTitle = topExec?.jobTitle || "Director";
        emailVerifyStatus = "scraped";
      } else {
        return null;
      }

      if (process.env.ZEROBOUNCE_API_KEY?.trim()) {
        const zb = await verifyEmail(contactEmail);
        emailVerifyStatus = zb.status;
        emailVerified = zb.isDeliverable;
        if (REJECTED_ZEROBOUNCE.has(zb.status)) {
          return null;
        }
      }

      if (!contactName || contactName.length < 3) {
        contactName = `${company.cleanedName} Leadership`;
      }

      const role = determineLeadRole(contactJobTitle);
      const leadFunction = determineLeadFunction(contactJobTitle, criteria.industry);
      const verificationTag = determineVerificationTag(emailVerified, emailVerifyStatus, isDomainConfirmed);

      const score = scoreCompany({
        emailVerified,
        emailVerifyStatus,
        foundEmail: contactEmail,
        researchSummary,
        teamPageText: teamText,
        homepageText: scrapedText,
        jobTitle: contactJobTitle,
        role,
        industry: criteria.industry,
        company: company.cleanedName,
        city: company.city,
      });

      const matchReason = generateMatchReason(
        contactName,
        contactJobTitle,
        company.cleanedName,
        criteria.industry,
        company.city,
        prompt,
      );

      const finalLead: Lead = {
        id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: contactName,
        jobTitle: contactJobTitle,
        role,
        function: leadFunction,
        company: company.cleanedName,
        industry: criteria.industry,
        companySize: criteria.companySize || "Unknown",
        country: company.country,
        state: company.city,
        city: company.city,
        location: `${company.city}, ${company.country}`,
        companyHeadquarters: `${company.city}, ${company.country}`,
        email: contactEmail,
        domain: domain || (verifiedWebsite ? extractDomainFromUrl(verifiedWebsite) : ""),
        verificationTag,
        matchReason,
        matchScore: score,
        status: "Discovered",
      };

      if (userId) {
        try {
          const companyHandle = domain || company.cleanedName.toLowerCase().replace(/[^a-z0-9]/g, "-");

          const dbCompany = await db.company.upsert({
            where: { handle: companyHandle },
            update: {
              name: company.cleanedName,
              website: verifiedWebsite,
              industry: criteria.industry,
              city: company.city,
              country: company.country,
              phone: company.phone,
              address: company.address,
              verifiedDomain: isDomainConfirmed,
              researchSummary: researchSummary || null,
              matchScore: score,
            },
            create: {
              handle: companyHandle,
              name: company.cleanedName,
              website: verifiedWebsite,
              industry: criteria.industry,
              city: company.city,
              country: company.country,
              phone: company.phone,
              address: company.address,
              verifiedDomain: isDomainConfirmed,
              researchSummary: researchSummary || null,
              matchScore: score,
            },
          });

          const dbLead = await db.lead.create({
            data: {
              companyId: dbCompany.id,
              userId,
              name: finalLead.name,
              jobTitle: finalLead.jobTitle,
              role: finalLead.role,
              function: finalLead.function,
              company: finalLead.company,
              industry: finalLead.industry,
              companySize: finalLead.companySize,
              country: finalLead.country,
              city: finalLead.city,
              location: finalLead.location,
              companyHeadquarters: finalLead.companyHeadquarters,
              email: finalLead.email,
              domain: finalLead.domain,
              emailVerified,
              emailVerifyStatus,
              verificationTag: finalLead.verificationTag,
              matchReason: finalLead.matchReason,
              matchScore: finalLead.matchScore,
              status: "Discovered",
            },
          });

          finalLead.id = dbLead.id;

          await db.source.createMany({
            data: [
              {
                leadId: dbLead.id,
                companyId: dbCompany.id,
                type: "geoapify",
                title: "Geoapify Business Directory",
                url: company.website,
                rawData: { address: company.address, category },
              },
              {
                leadId: dbLead.id,
                companyId: dbCompany.id,
                type: "tavily",
                title: "Tavily Web Research",
                url: verifiedWebsite,
                rawData: { confirmed: isDomainConfirmed, summary: researchSummary },
              },
              {
                leadId: dbLead.id,
                companyId: dbCompany.id,
                type: bestSnov ? "snov" : "website_scrape",
                title: bestSnov ? "Snov.io Professional Verification" : "Website Scraper & Metadata",
                url: verifiedWebsite,
                rawData: { email: contactEmail, status: emailVerifyStatus },
              },
            ],
          });

          await db.evidence.createMany({
            data: [
              {
                leadId: dbLead.id,
                companyId: dbCompany.id,
                type: "domain_confirmation",
                content: isDomainConfirmed
                  ? `Official domain ${domain} verified via web research.`
                  : `Domain ${domain} discovered via directory listing.`,
                confidenceScore: isDomainConfirmed ? 95 : 80,
                verifiedAt: new Date(),
              },
              {
                leadId: dbLead.id,
                companyId: dbCompany.id,
                type: "icp_fit",
                content: matchReason,
                confidenceScore: score,
                verifiedAt: new Date(),
              },
            ],
          });
        } catch (dbErr) {
          console.warn("[MySQL Persistence] Error saving Lead/Company/Source/Evidence:", dbErr);
        }
      }

      return finalLead;
    } catch (enrichErr) {
      console.warn(`[Pipeline] Enrichment failed for ${company.cleanedName}:`, enrichErr);
      return null;
    }
  });

  const settled = await Promise.allSettled(companyEnrichmentPromises);
  const generatedLeads: Lead[] = [];

  for (const s of settled) {
    if (s.status === "fulfilled" && s.value) {
      generatedLeads.push(s.value);
    }
  }

  generatedLeads.sort((a, b) => b.matchScore - a.matchScore);

  const finalLeads = generatedLeads.slice(0, maxLeads);
  return {
    criteria,
    totalFound: businesses.length,
    leads: finalLeads,
    previewLeads: finalLeads.slice(0, 3),
  };
}
