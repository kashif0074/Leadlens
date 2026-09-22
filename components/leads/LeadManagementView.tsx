"use client";

import { useMemo, useState } from "react";
import type { Lead } from "../../types";
import { leadDomain, uniqueSorted } from "../../lib/leads";
import {
  Search,
  SlidersHorizontal,
  MapPin,
  Building2,
  Briefcase,
  Users,
  ArrowRight,
  Check,
  RotateCcw,
  ShieldCheck,
  ChevronRight,
  X,
  Globe,
} from "lucide-react";

interface LeadManagementViewProps {
  leads: Lead[];
  selectedLeadIds: Set<string>;
  onToggleLead: (id: string) => void;
  onSelectAll: (ids?: string[]) => void;
  onClearAll: () => void;
  onContinue: () => void;
  continueLabel?: string;
  showContinue?: boolean;
}

type SortKey = "match" | "name" | "company";

export default function LeadManagementView({
  leads,
  selectedLeadIds,
  onToggleLead,
  onSelectAll,
  onClearAll,
  onContinue,
  continueLabel = "Continue",
  showContinue = true,
}: LeadManagementViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSort, setSelectedSort] = useState<SortKey>("match");
  const [locationText, setLocationText] = useState("");
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState("All");
  const [selectedState, setSelectedState] = useState("All");
  const [selectedCity, setSelectedCity] = useState("All");
  const [selectedRole, setSelectedRole] = useState("All");
  const [jobTitleQuery, setJobTitleQuery] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("All");
  const [selectedCompanySize, setSelectedCompanySize] = useState("All");
  const [selectedVerification, setSelectedVerification] = useState("All");
  const [companyQuery, setCompanyQuery] = useState("");
  const [domainQuery, setDomainQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeDrawerLead, setActiveDrawerLead] = useState<Lead | null>(null);

  const filterOptions = useMemo(() => {
    const countries = uniqueSorted(leads.map((lead) => lead.country));
    const states = uniqueSorted(
      leads
        .filter((lead) => selectedCountry === "All" || lead.country === selectedCountry)
        .map((lead) => lead.state),
    );
    const cities = uniqueSorted(
      leads
        .filter((lead) => {
          if (selectedCountry !== "All" && lead.country !== selectedCountry) return false;
          if (selectedState !== "All" && lead.state !== selectedState) return false;
          return true;
        })
        .map((lead) => lead.city),
    );
    return {
      countries,
      states,
      cities,
      roles: uniqueSorted(leads.map((lead) => lead.role)),
      industries: uniqueSorted(leads.map((lead) => lead.industry)),
      sizes: uniqueSorted(leads.map((lead) => lead.companySize)),
      verifications: uniqueSorted(leads.map((lead) => lead.verificationTag)),
      locations: uniqueSorted(leads.flatMap((lead) => [lead.location, lead.city, lead.country])),
    };
  }, [leads, selectedCountry, selectedState]);

  const locationSuggestions = useMemo(() => {
    const query = locationText.trim().toLowerCase();
    if (!query) return [];
    return filterOptions.locations.filter((location) => location.toLowerCase().includes(query)).slice(0, 8);
  }, [filterOptions.locations, locationText]);

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedSort("match");
    setLocationText("");
    setSelectedCountry("All");
    setSelectedState("All");
    setSelectedCity("All");
    setSelectedRole("All");
    setJobTitleQuery("");
    setSelectedIndustry("All");
    setSelectedCompanySize("All");
    setSelectedVerification("All");
    setCompanyQuery("");
    setDomainQuery("");
  };

  const filteredLeads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const location = locationText.trim().toLowerCase();
    const title = jobTitleQuery.trim().toLowerCase();
    const company = companyQuery.trim().toLowerCase();
    const domain = domainQuery.trim().toLowerCase();

    return leads
      .filter((lead) => {
        const haystack = [
          lead.name,
          lead.company,
          lead.jobTitle,
          lead.location,
          lead.industry,
          lead.email,
          leadDomain(lead),
        ]
          .join(" ")
          .toLowerCase();

        const matchesSearch = !query || haystack.includes(query);
        const matchesLocationText = !location || lead.location.toLowerCase().includes(location);
        const matchesCountry = selectedCountry === "All" || lead.country === selectedCountry;
        const matchesState = selectedState === "All" || lead.state === selectedState;
        const matchesCity = selectedCity === "All" || lead.city === selectedCity;
        const matchesRole = selectedRole === "All" || lead.role === selectedRole;
        const matchesJobTitle = !title || lead.jobTitle.toLowerCase().includes(title);
        const matchesIndustry = selectedIndustry === "All" || lead.industry === selectedIndustry;
        const matchesCompanySize = selectedCompanySize === "All" || lead.companySize === selectedCompanySize;
        const matchesVerification = selectedVerification === "All" || lead.verificationTag === selectedVerification;
        const matchesCompany = !company || lead.company.toLowerCase().includes(company);
        const matchesDomain = !domain || leadDomain(lead).toLowerCase().includes(domain);

        return (
          matchesSearch &&
          matchesLocationText &&
          matchesCountry &&
          matchesState &&
          matchesCity &&
          matchesRole &&
          matchesJobTitle &&
          matchesIndustry &&
          matchesCompanySize &&
          matchesVerification &&
          matchesCompany &&
          matchesDomain
        );
      })
      .sort((a, b) => {
        if (selectedSort === "name") return a.name.localeCompare(b.name);
        if (selectedSort === "company") return a.company.localeCompare(b.company);
        return b.matchScore - a.matchScore;
      });
  }, [
    companyQuery,
    domainQuery,
    jobTitleQuery,
    leads,
    locationText,
    searchQuery,
    selectedCity,
    selectedCompanySize,
    selectedCountry,
    selectedIndustry,
    selectedRole,
    selectedSort,
    selectedState,
    selectedVerification,
  ]);

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (locationText.trim()) chips.push({ key: "location", label: `Location: ${locationText}`, clear: () => setLocationText("") });
    if (selectedCountry !== "All") chips.push({ key: "country", label: selectedCountry, clear: () => { setSelectedCountry("All"); setSelectedState("All"); setSelectedCity("All"); } });
    if (selectedState !== "All") chips.push({ key: "state", label: selectedState, clear: () => { setSelectedState("All"); setSelectedCity("All"); } });
    if (selectedCity !== "All") chips.push({ key: "city", label: selectedCity, clear: () => setSelectedCity("All") });
    if (selectedRole !== "All") chips.push({ key: "role", label: selectedRole, clear: () => setSelectedRole("All") });
    if (jobTitleQuery.trim()) chips.push({ key: "title", label: `Title: ${jobTitleQuery}`, clear: () => setJobTitleQuery("") });
    if (companyQuery.trim()) chips.push({ key: "company", label: `Company: ${companyQuery}`, clear: () => setCompanyQuery("") });
    if (selectedCompanySize !== "All") chips.push({ key: "size", label: `${selectedCompanySize} emp`, clear: () => setSelectedCompanySize("All") });
    if (selectedIndustry !== "All") chips.push({ key: "industry", label: selectedIndustry, clear: () => setSelectedIndustry("All") });
    if (domainQuery.trim()) chips.push({ key: "domain", label: `Domain: ${domainQuery}`, clear: () => setDomainQuery("") });
    if (selectedVerification !== "All") chips.push({ key: "email", label: selectedVerification, clear: () => setSelectedVerification("All") });
    return chips;
  }, [
    companyQuery,
    domainQuery,
    jobTitleQuery,
    locationText,
    selectedCity,
    selectedCompanySize,
    selectedCountry,
    selectedIndustry,
    selectedRole,
    selectedState,
    selectedVerification,
  ]);

  const filteredIds = filteredLeads.map((lead) => lead.id);
  const allFilteredSelected = filteredLeads.length > 0 && filteredLeads.every((lead) => selectedLeadIds.has(lead.id));

  const selectClass = "w-full rounded-xl border border-line bg-canvas p-2 text-xs text-ink focus:border-green focus:bg-white focus:outline-none";
  const inputClass = "w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink placeholder:text-muted/70 focus:border-green focus:bg-white focus:outline-none";

  return (
    <div className="space-y-4 text-ink">
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-4 top-3.5 h-4 w-4 text-muted" />
          <input
            type="search"
            placeholder="Search loaded leads by name, title, company, location, domain, or industry"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full rounded-2xl border border-line bg-white py-3 pl-11 pr-10 text-sm text-ink shadow-2xs placeholder:text-muted/70 focus:border-green focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-3 top-3 rounded-full p-0.5 text-muted hover:bg-mist hover:text-ink"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          value={selectedSort}
          onChange={(event) => setSelectedSort(event.target.value as SortKey)}
          className="w-full rounded-2xl border border-line bg-white px-3 py-3 text-xs text-ink shadow-2xs focus:border-green focus:outline-none sm:w-48"
        >
          <option value="match">Sort: Best match</option>
          <option value="name">Sort: Lead name</option>
          <option value="company">Sort: Company</option>
        </select>
        <button
          type="button"
          className="btn btn-secondary lg:hidden"
          onClick={() => setFiltersOpen((value) => !value)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters{activeFilters.length ? ` (${activeFilters.length})` : ""}
        </button>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.clear}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-ink hover:border-green"
            >
              {chip.label}
              <X className="h-3 w-3 text-muted" />
            </button>
          ))}
          <button type="button" onClick={resetFilters} className="text-xs font-semibold text-green hover:underline">
            Clear all filters
          </button>
        </div>
      )}

      <div className="flex flex-col items-start gap-5 lg:flex-row">
        <aside className={`${filtersOpen ? "block" : "hidden"} w-full shrink-0 space-y-4 rounded-3xl border border-line bg-white p-5 text-xs shadow-xs lg:block lg:w-72`}>
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-ink">
              <SlidersHorizontal className="h-4 w-4 text-green" />
              <span>Filters</span>
            </div>
            <button type="button" onClick={resetFilters} className="flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-green hover:underline">
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-1.5 font-bold text-ink">
              <MapPin className="h-3.5 w-3.5 text-green" />
              Location
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Type city or country..."
                value={locationText}
                onChange={(event) => {
                  setLocationText(event.target.value);
                  setShowLocationSuggestions(true);
                }}
                onFocus={() => setShowLocationSuggestions(true)}
                onBlur={() => window.setTimeout(() => setShowLocationSuggestions(false), 120)}
                className={inputClass}
              />
              {showLocationSuggestions && locationText.length > 0 && (
                <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-36 overflow-y-auto rounded-2xl border border-line bg-white shadow-lg">
                  {locationSuggestions.length > 0 ? (
                    locationSuggestions.map((location) => (
                      <button
                        key={location}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setLocationText(location);
                          setShowLocationSuggestions(false);
                        }}
                        className="w-full px-3 py-1.5 text-left text-xs text-ink hover:bg-mist"
                      >
                        {location}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-[11px] text-muted">No matching locations in this list</div>
                  )}
                </div>
              )}
            </div>
            <label className="block">
              <span className="font-medium text-muted">Country</span>
              <select
                value={selectedCountry}
                onChange={(event) => {
                  setSelectedCountry(event.target.value);
                  setSelectedState("All");
                  setSelectedCity("All");
                }}
                className={`${selectClass} mt-1`}
              >
                <option value="All">All countries</option>
                {filterOptions.countries.map((country) => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </select>
            </label>
            {selectedCountry !== "All" && filterOptions.states.length > 0 && (
              <label className="block">
                <span className="font-medium text-muted">State / Province</span>
                <select
                  value={selectedState}
                  onChange={(event) => {
                    setSelectedState(event.target.value);
                    setSelectedCity("All");
                  }}
                  className={`${selectClass} mt-1`}
                >
                  <option value="All">All states</option>
                  {filterOptions.states.map((state) => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </label>
            )}
            {selectedCountry !== "All" && filterOptions.cities.length > 0 && (
              <label className="block">
                <span className="font-medium text-muted">City</span>
                <select value={selectedCity} onChange={(event) => setSelectedCity(event.target.value)} className={`${selectClass} mt-1`}>
                  <option value="All">All cities</option>
                  {filterOptions.cities.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="space-y-2 border-t border-line pt-3">
            <label className="flex items-center gap-1.5 font-bold text-ink">
              <Briefcase className="h-3.5 w-3.5 text-green" />
              Role
            </label>
            <input className={inputClass} placeholder="Filter by job title..." value={jobTitleQuery} onChange={(event) => setJobTitleQuery(event.target.value)} />
            <select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)} className={selectClass}>
              <option value="All">All seniority roles</option>
              {filterOptions.roles.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 border-t border-line pt-3">
            <label className="flex items-center gap-1.5 font-bold text-ink">
              <Building2 className="h-3.5 w-3.5 text-green" />
              Company
            </label>
            <input className={inputClass} placeholder="Search company name..." value={companyQuery} onChange={(event) => setCompanyQuery(event.target.value)} />
            <select value={selectedCompanySize} onChange={(event) => setSelectedCompanySize(event.target.value)} className={selectClass}>
              <option value="All">All company sizes</option>
              {filterOptions.sizes.map((size) => (
                <option key={size} value={size}>{size} employees</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 border-t border-line pt-3">
            <label className="flex items-center gap-1.5 font-bold text-ink">
              <Users className="h-3.5 w-3.5 text-green" />
              Industry
            </label>
            <select value={selectedIndustry} onChange={(event) => setSelectedIndustry(event.target.value)} className={selectClass}>
              <option value="All">All industries</option>
              {filterOptions.industries.map((industry) => (
                <option key={industry} value={industry}>{industry}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 border-t border-line pt-3">
            <label className="flex items-center gap-1.5 font-bold text-ink">
              <Globe className="h-3.5 w-3.5 text-green" />
              Domain
            </label>
            <input className={inputClass} placeholder="Filter by domain..." value={domainQuery} onChange={(event) => setDomainQuery(event.target.value)} />
          </div>

          <div className="space-y-2 border-t border-line pt-3">
            <label className="flex items-center gap-1.5 font-bold text-ink">
              <ShieldCheck className="h-3.5 w-3.5 text-green" />
              Email status
            </label>
            <select value={selectedVerification} onChange={(event) => setSelectedVerification(event.target.value)} className={selectClass}>
              <option value="All">All email statuses</option>
              {filterOptions.verifications.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </aside>

        <div className="flex min-w-0 w-full flex-1 flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-line bg-canvas px-4 py-3 text-xs text-muted">
            <span>
              Showing <strong className="text-ink">{filteredLeads.length}</strong> of {leads.length} loaded leads
            </span>
            {searchQuery && <span>Search: “{searchQuery}”</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
              <thead className="border-b border-line bg-canvas font-semibold text-muted">
                <tr>
                  <th className="w-12 p-4 text-center">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={() => {
                        if (allFilteredSelected) {
                          onSelectAll([...selectedLeadIds].filter((id) => !filteredIds.includes(id)));
                          return;
                        }
                        onSelectAll([...new Set([...selectedLeadIds, ...filteredIds])]);
                      }}
                      disabled={!filteredLeads.length}
                      className="h-4 w-4 cursor-pointer accent-green"
                      aria-label="Select all visible leads"
                    />
                  </th>
                  <th className="p-4">Lead</th>
                  <th className="p-4">Role</th>
                  <th className="p-4">Company</th>
                  <th className="p-4">Domain</th>
                  <th className="p-4">Industry</th>
                  <th className="p-4">Location</th>
                  <th className="p-4">Email status</th>
                  <th className="p-4 text-right">Match</th>
                  <th className="w-12 p-4 text-center">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredLeads.map((lead) => {
                  const checked = selectedLeadIds.has(lead.id);
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => onToggleLead(lead.id)}
                      className={`h-16 cursor-pointer hover:bg-canvas ${checked ? "bg-green-soft/40" : "bg-white"}`}
                    >
                      <td className="p-4 text-center" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleLead(lead.id)}
                          className="h-4 w-4 cursor-pointer accent-green"
                          aria-label={`Select ${lead.name}`}
                        />
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-sm text-ink">{lead.name}</div>
                        <div className="text-[11px] text-muted">{lead.email}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-ink">{lead.jobTitle}</div>
                        <div className="text-[11px] text-muted">{lead.role}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-ink">{lead.company}</div>
                        <div className="text-[11px] text-muted">{lead.companySize} emp</div>
                      </td>
                      <td className="p-4 text-muted">{leadDomain(lead) || "—"}</td>
                      <td className="p-4">
                        <span className="rounded-full border border-line bg-white px-2.5 py-1 text-[11px] text-muted">
                          {lead.industry}
                        </span>
                      </td>
                      <td className="p-4 text-muted">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-gold" />
                          {lead.location}
                        </span>
                      </td>
                      <td className="p-4">
                        {lead.verificationTag === "Email verified" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-soft px-3 py-1 text-[11px] font-bold text-green">
                            <Check className="h-3 w-3" /> Email verified
                          </span>
                        ) : lead.verificationTag === "Enriched" ? (
                          <span className="rounded-full bg-green-soft px-3 py-1 text-[11px] font-bold text-green">Enriched</span>
                        ) : (
                          <span className="rounded-full bg-gold-soft px-3 py-1 text-[11px] font-bold text-gold">Review contact</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <span className="rounded-full bg-green-soft px-2.5 py-1 text-xs font-bold text-green">{lead.matchScore}%</span>
                      </td>
                      <td className="p-4 text-center" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setActiveDrawerLead(lead)}
                          className="rounded-xl border border-line p-1.5 text-muted hover:bg-mist hover:text-green"
                          title="Inspect lead"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredLeads.length === 0 && (
            <div className="px-6 py-16 text-center text-sm text-muted">
              {leads.length === 0
                ? "No leads are loaded yet. Generate a campaign brief to populate this list."
                : "No leads match the current search and filters."}
              {leads.length > 0 && (
                <div className="mt-3">
                  <button type="button" onClick={resetFilters} className="text-sm font-semibold text-green hover:underline">
                    Reset search and filters
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col justify-between gap-4 border-t border-line bg-canvas p-4 sm:flex-row sm:items-center sm:p-5">
            <div>
              <div className="text-sm font-bold text-ink">
                <strong className="text-green">{selectedLeadIds.size}</strong> of {leads.length} leads selected
              </div>
              <p className="text-[11px] text-muted">Select prospects to include in this campaign.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => onSelectAll([...new Set([...selectedLeadIds, ...filteredIds])])}
                className="btn btn-secondary text-xs"
              >
                Select visible
              </button>
              <button type="button" onClick={onClearAll} className="btn btn-secondary text-xs">
                Clear selection
              </button>
              {showContinue && (
                <button
                  type="button"
                  onClick={onContinue}
                  disabled={selectedLeadIds.size === 0}
                  className="btn btn-primary text-xs"
                >
                  {continueLabel}
                  <ArrowRight className="h-4 w-4 text-gold" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {activeDrawerLead && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={() => setActiveDrawerLead(null)}>
          <aside className="flex h-full w-full max-w-md flex-col justify-between overflow-y-auto bg-white p-6 shadow-2xl sm:p-8" onClick={(event) => event.stopPropagation()}>
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold tracking-wider text-green uppercase">Lead details</span>
                  <h2 className="mt-1 font-serif text-2xl font-bold text-ink">{activeDrawerLead.name}</h2>
                  <p className="mt-0.5 text-sm text-muted">
                    {activeDrawerLead.jobTitle} · {activeDrawerLead.company}
                  </p>
                </div>
                <button type="button" onClick={() => setActiveDrawerLead(null)} className="icon-btn" aria-label="Close details">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="chip">{activeDrawerLead.industry}</span>
                <span className="chip">{activeDrawerLead.location}</span>
                <span className="chip">{leadDomain(activeDrawerLead) || "No domain"}</span>
                <span className="status good">{activeDrawerLead.verificationTag}</span>
              </div>
              <div>
                <h3 className="text-xs font-bold tracking-wider text-ink uppercase">Why this lead matches</h3>
                <p className="mt-2 rounded-2xl border border-line bg-canvas p-4 text-sm leading-relaxed text-ink">
                  {activeDrawerLead.matchReason}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => setActiveDrawerLead(null)} className="btn btn-primary mt-6 w-full">
              Back to selection
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
