"use client";

import { useMemo, useState } from "react";
import type { Lead } from "../../types";
import { leadDomain, getLeadFunction, getLeadHeadquarters } from "../../lib/leads";
import {
  Search,
  SlidersHorizontal,
  MapPin,
  Building2,
  Users,
  ArrowRight,
  Check,
  RotateCcw,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Layers,
  Award,
} from "lucide-react";

interface LeadManagementViewProps {
  leads: Lead[];
  selectedLeadIds: Set<string>;
  onToggleLead: (id: string) => void;
  onSelectAll: (ids?: string[]) => void;
  onClearAll?: () => void;
  onAddToConnect?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  showContinue?: boolean;
}

type SortKey = "match" | "name" | "company";

interface FilterOption {
  value: string;
  count: number;
}

function FilterTypeahead({
  options,
  search,
  onSearchChange,
  selected,
  onToggle,
  placeholder,
}: {
  options: FilterOption[];
  search: string;
  onSearchChange: (value: string) => void;
  selected: Set<string>;
  onToggle: (value: string) => void;
  placeholder: string;
}) {
  const query = search.trim().toLowerCase();
  const matches =
    query.length > 0
      ? options.filter((opt) => opt.value.toLowerCase().includes(query))
      : [];

  return (
    <>
      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(selected).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-green px-2.5 py-0.5 text-[11px] font-bold text-white"
            >
              <span className="truncate">{value}</span>
              <X className="h-2.5 w-2.5 shrink-0" />
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2 h-3.5 w-3.5 text-muted" />
        <input
          type="search"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          autoComplete="off"
          className="w-full rounded-xl border border-line bg-canvas py-1.5 pl-8 pr-7 text-xs text-ink placeholder:text-muted/70 focus:border-green focus:bg-white focus:outline-none"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-2 text-muted hover:text-ink cursor-pointer"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {query.length > 0 && (
        <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
          {matches.map((opt) => {
            const isChecked = selected.has(opt.value);
            return (
              <label
                key={opt.value}
                className="flex items-center justify-between gap-2 rounded-lg p-1.5 hover:bg-mist cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggle(opt.value)}
                    className="h-3.5 w-3.5 rounded accent-green cursor-pointer shrink-0"
                  />
                  <span className="text-xs text-ink truncate">{opt.value}</span>
                </div>
                <span className="rounded-full bg-mist border border-line px-1.5 py-0.2 text-[10px] font-semibold text-muted shrink-0">
                  {opt.count}
                </span>
              </label>
            );
          })}
          {matches.length === 0 && (
            <p className="text-[11px] text-muted italic">No matching options</p>
          )}
        </div>
      )}
    </>
  );
}

export default function LeadManagementView({
  leads,
  selectedLeadIds,
  onToggleLead,
  onSelectAll,
  onClearAll,
  onAddToConnect,
  onContinue,
  continueLabel = "Continue",
  showContinue = true,
}: LeadManagementViewProps) {
  // Global search & sort
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSort, setSelectedSort] = useState<SortKey>("match");
  const [showGlobalSuggestions, setShowGlobalSuggestions] = useState(false);

  // The 5 Required Filter States (Multi-select)
  const [selectedIndustries, setSelectedIndustries] = useState<Set<string>>(new Set());
  const [selectedGeographies, setSelectedGeographies] = useState<Set<string>>(new Set());
  const [selectedSeniorities, setSelectedSeniorities] = useState<Set<string>>(new Set());
  const [selectedFunctions, setSelectedFunctions] = useState<Set<string>>(new Set());
  const [selectedHeadquarters, setSelectedHeadquarters] = useState<Set<string>>(new Set());

  // In-filter search query states
  const [industrySearch, setIndustrySearch] = useState("");
  const [geographySearch, setGeographySearch] = useState("");
  const [senioritySearch, setSenioritySearch] = useState("");
  const [functionSearch, setFunctionSearch] = useState("");
  const [hqSearch, setHqSearch] = useState("");

  // Accordion open/close states
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    industry: true,
    geography: true,
    seniority: true,
    function: true,
    headquarters: true,
  });

  // Mobile / drawer state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeDrawerLead, setActiveDrawerLead] = useState<Lead | null>(null);

  // Toggle filter section collapse
  const toggleSection = (section: string) => {
    setOpenSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  // Helper to toggle item in a Set
  const toggleSetItem = (set: Set<string>, setFn: (newSet: Set<string>) => void, item: string) => {
    const next = new Set(set);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    setFn(next);
  };

  // Compute Supported Filter Options Strictly from Actual Loaded Leads
  // 1. Industry Options
  const availableIndustries = useMemo<FilterOption[]>(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      if (lead.industry) {
        counts.set(lead.industry, (counts.get(lead.industry) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }, [leads]);

  // 2. Geography Options (Country & Region)
  const availableGeographies = useMemo<FilterOption[]>(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      if (lead.country) {
        counts.set(lead.country, (counts.get(lead.country) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }, [leads]);

  // 3. Seniority Level Options
  const availableSeniorities = useMemo<FilterOption[]>(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      if (lead.role) {
        counts.set(lead.role, (counts.get(lead.role) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }, [leads]);

  // 4. Function Options
  const availableFunctions = useMemo<FilterOption[]>(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      const fn = getLeadFunction(lead);
      if (fn) {
        counts.set(fn, (counts.get(fn) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }, [leads]);

  // 5. Company Headquarters Options
  const availableHeadquarters = useMemo<FilterOption[]>(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      const hq = getLeadHeadquarters(lead);
      if (hq) {
        counts.set(hq, (counts.get(hq) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }, [leads]);

  // Reset all filters
  const resetFilters = () => {
    setSearchQuery("");
    setSelectedSort("match");
    setSelectedIndustries(new Set());
    setSelectedGeographies(new Set());
    setSelectedSeniorities(new Set());
    setSelectedFunctions(new Set());
    setSelectedHeadquarters(new Set());
    setIndustrySearch("");
    setGeographySearch("");
    setSenioritySearch("");
    setFunctionSearch("");
    setHqSearch("");
  };

  // Immediate filtering of leads using all active filter dimensions
  const filteredLeads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return leads
      .filter((lead) => {
        // Global search query
        if (query) {
          const fn = getLeadFunction(lead);
          const hq = getLeadHeadquarters(lead);
          const haystack = [
            lead.name,
            lead.company,
            lead.jobTitle,
            lead.role,
            fn,
            lead.industry,
            lead.country,
            lead.state,
            lead.city,
            lead.location,
            hq,
            lead.email,
            leadDomain(lead),
          ]
            .join(" ")
            .toLowerCase();

          if (!haystack.includes(query)) return false;
        }

        // 1. Industry (Multi-select)
        if (selectedIndustries.size > 0 && !selectedIndustries.has(lead.industry)) {
          return false;
        }

        // 2. Geography (Multi-select)
        if (selectedGeographies.size > 0) {
          const matchesGeo =
            selectedGeographies.has(lead.country) ||
            selectedGeographies.has(lead.location) ||
            Array.from(selectedGeographies).some((geo) =>
              lead.location.toLowerCase().includes(geo.toLowerCase()) ||
              lead.country.toLowerCase().includes(geo.toLowerCase()),
            );
          if (!matchesGeo) return false;
        }

        // 3. Seniority Level (Multi-select)
        if (selectedSeniorities.size > 0 && !selectedSeniorities.has(lead.role)) {
          return false;
        }

        // 4. Function (Multi-select)
        if (selectedFunctions.size > 0) {
          const fn = getLeadFunction(lead);
          if (!selectedFunctions.has(fn)) return false;
        }

        // 5. Company Headquarters (Multi-select)
        if (selectedHeadquarters.size > 0) {
          const hq = getLeadHeadquarters(lead);
          const matchesHq =
            selectedHeadquarters.has(hq) ||
            Array.from(selectedHeadquarters).some((selectedHq) =>
              hq.toLowerCase().includes(selectedHq.toLowerCase()) ||
              (lead.companyHeadquarters &&
                lead.companyHeadquarters.toLowerCase().includes(selectedHq.toLowerCase())),
            );
          if (!matchesHq) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (selectedSort === "name") return a.name.localeCompare(b.name);
        if (selectedSort === "company") return a.company.localeCompare(b.company);
        return b.matchScore - a.matchScore;
      });
  }, [
    leads,
    searchQuery,
    selectedIndustries,
    selectedGeographies,
    selectedSeniorities,
    selectedFunctions,
    selectedHeadquarters,
    selectedSort,
  ]);

  // Active filter chips for easy one-click removal
  const activeFilters = useMemo(() => {
    const chips: { id: string; category: string; label: string; onRemove: () => void }[] = [];

    selectedIndustries.forEach((val) => {
      chips.push({
        id: `ind-${val}`,
        category: "Industry",
        label: val,
        onRemove: () => toggleSetItem(selectedIndustries, setSelectedIndustries, val),
      });
    });

    selectedGeographies.forEach((val) => {
      chips.push({
        id: `geo-${val}`,
        category: "Geography",
        label: val,
        onRemove: () => toggleSetItem(selectedGeographies, setSelectedGeographies, val),
      });
    });

    selectedSeniorities.forEach((val) => {
      chips.push({
        id: `sen-${val}`,
        category: "Seniority",
        label: val,
        onRemove: () => toggleSetItem(selectedSeniorities, setSelectedSeniorities, val),
      });
    });

    selectedFunctions.forEach((val) => {
      chips.push({
        id: `fn-${val}`,
        category: "Function",
        label: val,
        onRemove: () => toggleSetItem(selectedFunctions, setSelectedFunctions, val),
      });
    });

    selectedHeadquarters.forEach((val) => {
      chips.push({
        id: `hq-${val}`,
        category: "HQ",
        label: val,
        onRemove: () => toggleSetItem(selectedHeadquarters, setSelectedHeadquarters, val),
      });
    });

    return chips;
  }, [
    selectedIndustries,
    selectedGeographies,
    selectedSeniorities,
    selectedFunctions,
    selectedHeadquarters,
  ]);

  // Autocomplete suggestions for top search bar (matching suggestions appear dynamically from the 1st typed character)
  const globalSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || query.length < 1) return [];

    const suggestions: { label: string; type: string; onSelect: () => void }[] = [];

    // Check industries
    for (const opt of availableIndustries) {
      if (opt.value.toLowerCase().includes(query)) {
        suggestions.push({
          label: opt.value,
          type: "Industry",
          onSelect: () => {
            setSelectedIndustries((curr) => new Set(curr).add(opt.value));
            setSearchQuery("");
            setShowGlobalSuggestions(false);
          },
        });
      }
    }

    // Check geography
    for (const opt of availableGeographies) {
      if (opt.value.toLowerCase().includes(query)) {
        suggestions.push({
          label: opt.value,
          type: "Geography",
          onSelect: () => {
            setSelectedGeographies((curr) => new Set(curr).add(opt.value));
            setSearchQuery("");
            setShowGlobalSuggestions(false);
          },
        });
      }
    }

    // Check seniority
    for (const opt of availableSeniorities) {
      if (opt.value.toLowerCase().includes(query)) {
        suggestions.push({
          label: opt.value,
          type: "Seniority",
          onSelect: () => {
            setSelectedSeniorities((curr) => new Set(curr).add(opt.value));
            setSearchQuery("");
            setShowGlobalSuggestions(false);
          },
        });
      }
    }

    // Check function
    for (const opt of availableFunctions) {
      if (opt.value.toLowerCase().includes(query)) {
        suggestions.push({
          label: opt.value,
          type: "Function",
          onSelect: () => {
            setSelectedFunctions((curr) => new Set(curr).add(opt.value));
            setSearchQuery("");
            setShowGlobalSuggestions(false);
          },
        });
      }
    }

    // Check headquarters
    for (const opt of availableHeadquarters) {
      if (opt.value.toLowerCase().includes(query)) {
        suggestions.push({
          label: opt.value,
          type: "Headquarters",
          onSelect: () => {
            setSelectedHeadquarters((curr) => new Set(curr).add(opt.value));
            setSearchQuery("");
            setShowGlobalSuggestions(false);
          },
        });
      }
    }

    // Check lead names and companies
    for (const lead of leads) {
      if (lead.name.toLowerCase().includes(query)) {
        suggestions.push({
          label: lead.name,
          type: `Lead (${lead.company})`,
          onSelect: () => {
            setSearchQuery(lead.name);
            setShowGlobalSuggestions(false);
          },
        });
      }
      if (lead.company.toLowerCase().includes(query)) {
        suggestions.push({
          label: lead.company,
          type: "Company",
          onSelect: () => {
            setSearchQuery(lead.company);
            setShowGlobalSuggestions(false);
          },
        });
      }
    }

    return suggestions.slice(0, 8);
  }, [
    searchQuery,
    availableIndustries,
    availableGeographies,
    availableSeniorities,
    availableFunctions,
    availableHeadquarters,
    leads,
  ]);

  const filteredIds = filteredLeads.map((lead) => lead.id);
  const allFilteredSelected =
    filteredLeads.length > 0 && filteredLeads.every((lead) => selectedLeadIds.has(lead.id));

  // Total active filter categories count
  const totalActiveFilterCategories =
    (selectedIndustries.size > 0 ? 1 : 0) +
    (selectedGeographies.size > 0 ? 1 : 0) +
    (selectedSeniorities.size > 0 ? 1 : 0) +
    (selectedFunctions.size > 0 ? 1 : 0) +
    (selectedHeadquarters.size > 0 ? 1 : 0);

  return (
    <div className="space-y-4 text-ink">
      {/* Top Search & Filter Bar */}
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-4 top-3.5 h-4 w-4 text-muted" />
          <input
            type="search"
            placeholder="Search leads by name, company, industry, function, seniority, location, or domain..."
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setShowGlobalSuggestions(true);
            }}
            onFocus={() => setShowGlobalSuggestions(true)}
            onBlur={() => setTimeout(() => setShowGlobalSuggestions(false), 200)}
            className="w-full rounded-2xl border border-line bg-white py-3 pl-11 pr-10 text-xs sm:text-sm text-ink shadow-2xs placeholder:text-muted/70 focus:border-green focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-3 top-3 rounded-full p-0.5 text-muted hover:bg-mist hover:text-ink cursor-pointer"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {/* Autocomplete suggestions dropdown */}
          {showGlobalSuggestions && globalSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-2xl border border-line bg-white shadow-xl">
              <div className="px-3 py-2 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-line bg-canvas">
                Suggested Filters & Matches
              </div>
              {globalSuggestions.map((item, index) => (
                <button
                  key={`${item.type}-${item.label}-${index}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    item.onSelect();
                  }}
                  className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs hover:bg-mist cursor-pointer transition-colors"
                >
                  <span className="font-semibold text-ink truncate">{item.label}</span>
                  <span className="rounded-full bg-mist border border-line px-2 py-0.5 text-[10px] font-medium text-muted shrink-0 ml-2">
                    {item.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sort Selector */}
        <select
          value={selectedSort}
          onChange={(event) => setSelectedSort(event.target.value as SortKey)}
          className="w-full rounded-2xl border border-line bg-white px-3.5 py-3 text-xs text-ink shadow-2xs focus:border-green focus:outline-none sm:w-48 cursor-pointer"
        >
          <option value="match">Sort: Best match</option>
          <option value="name">Sort: Lead name</option>
          <option value="company">Sort: Company</option>
        </select>

        {/* Mobile Filter Toggle */}
        <button
          type="button"
          className="btn btn-secondary lg:hidden cursor-pointer"
          onClick={() => setFiltersOpen((value) => !value)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>Filters</span>
          {activeFilters.length > 0 && (
            <span className="rounded-full bg-green text-white px-2 py-0.5 text-[10px] font-bold">
              {activeFilters.length}
            </span>
          )}
        </button>
      </div>

      {/* Active Filter Chips Bar */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white/70 p-3">
          <span className="text-xs font-semibold text-muted">Active filters:</span>
          {activeFilters.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={chip.onRemove}
              className="inline-flex items-center gap-1.5 rounded-full border border-green/30 bg-green-soft px-3 py-1 text-xs font-semibold text-green hover:bg-green-soft/70 cursor-pointer transition-all"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-green-dark">
                {chip.category}:
              </span>
              <span>{chip.label}</span>
              <X className="h-3 w-3 hover:text-ink" />
            </button>
          ))}
          <button
            type="button"
            onClick={resetFilters}
            className="flex items-center gap-1 text-xs font-bold text-green hover:underline cursor-pointer ml-auto"
          >
            <RotateCcw className="h-3 w-3" />
            Clear all filters
          </button>
        </div>
      )}

      {/* Layout Grid: Sidebar Filters & Leads Table */}
      <div className="flex flex-col items-start gap-5 lg:flex-row">
        {/* ========================================================= */}
        {/* FILTER SIDEBAR                                            */}
        {/* ========================================================= */}
        <aside
          className={`${
            filtersOpen ? "block" : "hidden"
          } w-full shrink-0 space-y-4 rounded-3xl border border-line bg-white p-5 text-xs shadow-xs lg:block lg:w-80`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-ink">
              <SlidersHorizontal className="h-4 w-4 text-green" />
              <span>Filters</span>
              {totalActiveFilterCategories > 0 && (
                <span className="rounded-full bg-green text-white px-2 py-0.5 text-[10px] font-bold">
                  {totalActiveFilterCategories} active
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="flex cursor-pointer items-center gap-1 text-[11px] font-bold text-green hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>

          {/* ========================================================= */}
          {/* 1. INDUSTRY FILTER                                        */}
          {/* ========================================================= */}
          <div className="space-y-2 border-b border-line pb-4">
            <button
              type="button"
              onClick={() => toggleSection("industry")}
              className="flex w-full items-center justify-between text-left font-bold text-ink cursor-pointer hover:text-green"
            >
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-green" />
                <span>Industry</span>
                {selectedIndustries.size > 0 && (
                  <span className="rounded-full bg-green text-white px-1.5 py-0.2 text-[10px] font-bold">
                    {selectedIndustries.size}
                  </span>
                )}
              </div>
              {openSections.industry ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted" />
              )}
            </button>

            {openSections.industry && (
              <div className="space-y-2 pt-1">
                <FilterTypeahead
                  options={availableIndustries}
                  search={industrySearch}
                  onSearchChange={setIndustrySearch}
                  selected={selectedIndustries}
                  onToggle={(value) =>
                    toggleSetItem(selectedIndustries, setSelectedIndustries, value)
                  }
                  placeholder="Search industries..."
                />
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* 2. GEOGRAPHY FILTER                                       */}
          {/* ========================================================= */}
          <div className="space-y-2 border-b border-line pb-4">
            <button
              type="button"
              onClick={() => toggleSection("geography")}
              className="flex w-full items-center justify-between text-left font-bold text-ink cursor-pointer hover:text-green"
            >
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-green" />
                <span>Geography</span>
                {selectedGeographies.size > 0 && (
                  <span className="rounded-full bg-green text-white px-1.5 py-0.2 text-[10px] font-bold">
                    {selectedGeographies.size}
                  </span>
                )}
              </div>
              {openSections.geography ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted" />
              )}
            </button>

            {openSections.geography && (
              <div className="space-y-2 pt-1">
                <FilterTypeahead
                  options={availableGeographies}
                  search={geographySearch}
                  onSearchChange={setGeographySearch}
                  selected={selectedGeographies}
                  onToggle={(value) =>
                    toggleSetItem(selectedGeographies, setSelectedGeographies, value)
                  }
                  placeholder="Search countries / regions..."
                />
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* 3. SENIORITY LEVEL FILTER                                 */}
          {/* ========================================================= */}
          <div className="space-y-2 border-b border-line pb-4">
            <button
              type="button"
              onClick={() => toggleSection("seniority")}
              className="flex w-full items-center justify-between text-left font-bold text-ink cursor-pointer hover:text-green"
            >
              <div className="flex items-center gap-1.5">
                <Award className="h-3.5 w-3.5 text-green" />
                <span>Seniority Level</span>
                {selectedSeniorities.size > 0 && (
                  <span className="rounded-full bg-green text-white px-1.5 py-0.2 text-[10px] font-bold">
                    {selectedSeniorities.size}
                  </span>
                )}
              </div>
              {openSections.seniority ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted" />
              )}
            </button>

            {openSections.seniority && (
              <div className="space-y-2 pt-1">
                <FilterTypeahead
                  options={availableSeniorities}
                  search={senioritySearch}
                  onSearchChange={setSenioritySearch}
                  selected={selectedSeniorities}
                  onToggle={(value) =>
                    toggleSetItem(selectedSeniorities, setSelectedSeniorities, value)
                  }
                  placeholder="Search seniority levels..."
                />
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* 4. FUNCTION FILTER                                        */}
          {/* ========================================================= */}
          <div className="space-y-2 border-b border-line pb-4">
            <button
              type="button"
              onClick={() => toggleSection("function")}
              className="flex w-full items-center justify-between text-left font-bold text-ink cursor-pointer hover:text-green"
            >
              <div className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-green" />
                <span>Function</span>
                {selectedFunctions.size > 0 && (
                  <span className="rounded-full bg-green text-white px-1.5 py-0.2 text-[10px] font-bold">
                    {selectedFunctions.size}
                  </span>
                )}
              </div>
              {openSections.function ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted" />
              )}
            </button>

            {openSections.function && (
              <div className="space-y-2 pt-1">
                <FilterTypeahead
                  options={availableFunctions}
                  search={functionSearch}
                  onSearchChange={setFunctionSearch}
                  selected={selectedFunctions}
                  onToggle={(value) =>
                    toggleSetItem(selectedFunctions, setSelectedFunctions, value)
                  }
                  placeholder="Search functions / departments..."
                />
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* 5. COMPANY HEADQUARTERS FILTER                            */}
          {/* ========================================================= */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => toggleSection("headquarters")}
              className="flex w-full items-center justify-between text-left font-bold text-ink cursor-pointer hover:text-green"
            >
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-green" />
                <span>Company Headquarters</span>
                {selectedHeadquarters.size > 0 && (
                  <span className="rounded-full bg-green text-white px-1.5 py-0.2 text-[10px] font-bold">
                    {selectedHeadquarters.size}
                  </span>
                )}
              </div>
              {openSections.headquarters ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted" />
              )}
            </button>

            {openSections.headquarters && (
              <div className="space-y-2 pt-1">
                <FilterTypeahead
                  options={availableHeadquarters}
                  search={hqSearch}
                  onSearchChange={setHqSearch}
                  selected={selectedHeadquarters}
                  onToggle={(value) =>
                    toggleSetItem(selectedHeadquarters, setSelectedHeadquarters, value)
                  }
                  placeholder="Search headquarters..."
                />
              </div>
            )}
          </div>
        </aside>

        {/* ========================================================= */}
        {/* LEADS TABLE & CONTROLS                                    */}
        {/* ========================================================= */}
        <div className="flex min-w-0 w-full flex-1 flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-xs">
          {/* Table Top Counter */}
          <div className="flex items-center justify-between border-b border-line bg-canvas px-4 py-3 text-xs text-muted">
            <div className="flex items-center gap-2">
              <span>
                Showing <strong className="text-ink font-bold">{filteredLeads.length}</strong> of{" "}
                {leads.length} loaded prospects
              </span>
              {filteredLeads.length !== leads.length && (
                <span className="rounded-full bg-green-soft px-2 py-0.5 text-[10px] font-bold text-green">
                  Filtered
                </span>
              )}
            </div>
            {searchQuery && <span>Search: “{searchQuery}”</span>}
          </div>

          {/* Table Container */}
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
                          onSelectAll(
                            [...selectedLeadIds].filter((id) => !filteredIds.includes(id)),
                          );
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
                  <th className="p-4">Seniority & Title</th>
                  <th className="p-4">Function</th>
                  <th className="p-4">Company</th>
                  <th className="p-4">HQ & Location</th>
                  <th className="p-4">Industry</th>
                  <th className="p-4">Email status</th>
                  <th className="p-4 text-right">Match</th>
                  <th className="w-12 p-4 text-center">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredLeads.map((lead) => {
                  const checked = selectedLeadIds.has(lead.id);
                  const fn = getLeadFunction(lead);
                  const hq = getLeadHeadquarters(lead);

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => onToggleLead(lead.id)}
                      className={`h-16 cursor-pointer hover:bg-canvas transition-colors ${
                        checked ? "bg-green-soft/40" : "bg-white"
                      }`}
                    >
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
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
                        <div className="inline-flex items-center gap-1 text-[11px] text-muted">
                          <span className="rounded bg-mist px-1.5 py-0.2 font-medium">
                            {lead.role}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="rounded-full bg-mist border border-line px-2.5 py-1 text-[11px] font-semibold text-ink">
                          {fn}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-ink">{lead.company}</div>
                        <div className="text-[11px] text-muted">{lead.companySize} emp</div>
                      </td>
                      <td className="p-4 text-muted">
                        <div className="inline-flex items-center gap-1 font-medium text-ink">
                          <Building2 className="h-3 w-3 text-muted shrink-0" />
                          <span>{hq}</span>
                        </div>
                        <div className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3 text-gold shrink-0" />
                          <span>{lead.location}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="rounded-full border border-line bg-white px-2.5 py-1 text-[11px] text-muted">
                          {lead.industry}
                        </span>
                      </td>
                      <td className="p-4">
                        {lead.verificationTag === "Email verified" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-soft px-3 py-1 text-[11px] font-bold text-green">
                            <Check className="h-3 w-3" /> Email verified
                          </span>
                        ) : lead.verificationTag === "Enriched" ? (
                          <span className="rounded-full bg-green-soft px-3 py-1 text-[11px] font-bold text-green">
                            Enriched
                          </span>
                        ) : (
                          <span className="rounded-full bg-gold-soft px-3 py-1 text-[11px] font-bold text-gold">
                            Review contact
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <span className="rounded-full bg-green-soft px-2.5 py-1 text-xs font-bold text-green">
                          {lead.matchScore}%
                        </span>
                      </td>
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setActiveDrawerLead(lead)}
                          className="rounded-xl border border-line p-1.5 text-muted hover:bg-mist hover:text-green cursor-pointer"
                          title="Inspect lead details"
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

          {/* Empty State */}
          {filteredLeads.length === 0 && (
            <div className="px-6 py-16 text-center text-sm text-muted">
              {leads.length === 0
                ? "No leads are loaded yet. Generate a campaign brief to populate this list."
                : "No leads match the current filters and search criteria."}
              {leads.length > 0 && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="btn btn-secondary text-xs cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset all filters
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Bottom Table Actions */}
          <div className="flex flex-col justify-between gap-4 border-t border-line bg-canvas p-4 sm:flex-row sm:items-center sm:p-5">
            <div>
              <div className="text-sm font-bold text-ink">
                <strong className="text-green font-extrabold">{selectedLeadIds.size}</strong> of{" "}
                {leads.length} leads selected
              </div>
              <p className="text-[11px] text-muted">
                Selected prospects will receive personalized outreach sequences in this campaign.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (onAddToConnect) {
                    onAddToConnect();
                  } else {
                    onSelectAll([...new Set([...selectedLeadIds, ...filteredIds])]);
                  }
                }}
                className="btn btn-secondary text-xs cursor-pointer"
              >
                Add to Connect
              </button>
              <button
                type="button"
                onClick={() => onSelectAll(leads.map((lead) => lead.id))}
                className="btn btn-secondary text-xs cursor-pointer"
              >
                Select All
              </button>
              {onClearAll && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="btn btn-secondary text-xs cursor-pointer"
                >
                  Clear Selection
                </button>
              )}
              {showContinue && (
                <button
                  type="button"
                  onClick={onContinue}
                  disabled={selectedLeadIds.size === 0}
                  className="btn btn-primary text-xs cursor-pointer flex items-center gap-2"
                >
                  <span>{continueLabel}</span>
                  <ArrowRight className="h-4 w-4 text-gold" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* LEAD DETAILS INSPECT DRAWER                               */}
      {/* ========================================================= */}
      {activeDrawerLead && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-ink/30 backdrop-blur-2xs"
          onClick={() => setActiveDrawerLead(null)}
        >
          <aside
            className="flex h-full w-full max-w-md flex-col justify-between overflow-y-auto bg-white p-6 shadow-2xl sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold tracking-wider text-green uppercase">
                    Prospect Profile
                  </span>
                  <h2 className="mt-1 font-serif text-2xl font-bold text-ink">
                    {activeDrawerLead.name}
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">
                    {activeDrawerLead.jobTitle} · {activeDrawerLead.company}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveDrawerLead(null)}
                  className="icon-btn cursor-pointer"
                  aria-label="Close details"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* 5 Core Attributes Badges */}
              <div className="rounded-2xl border border-line bg-canvas p-4 space-y-3">
                <div className="text-xs font-bold text-ink uppercase tracking-wider">
                  Target Dimensions
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-white p-2.5 border border-line">
                    <div className="text-[10px] text-muted font-bold uppercase">Industry</div>
                    <div className="font-semibold text-ink mt-0.5">
                      {activeDrawerLead.industry}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white p-2.5 border border-line">
                    <div className="text-[10px] text-muted font-bold uppercase">Seniority Level</div>
                    <div className="font-semibold text-ink mt-0.5">
                      {activeDrawerLead.role}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white p-2.5 border border-line">
                    <div className="text-[10px] text-muted font-bold uppercase">Function</div>
                    <div className="font-semibold text-ink mt-0.5">
                      {getLeadFunction(activeDrawerLead)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white p-2.5 border border-line">
                    <div className="text-[10px] text-muted font-bold uppercase">Geography</div>
                    <div className="font-semibold text-ink mt-0.5">
                      {activeDrawerLead.country}
                    </div>
                  </div>
                  <div className="col-span-2 rounded-xl bg-white p-2.5 border border-line">
                    <div className="text-[10px] text-muted font-bold uppercase">
                      Company Headquarters
                    </div>
                    <div className="font-semibold text-ink mt-0.5">
                      {getLeadHeadquarters(activeDrawerLead)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Tags */}
              <div className="flex flex-wrap gap-2">
                <span className="chip">{leadDomain(activeDrawerLead) || "No domain"}</span>
                <span className="chip">{activeDrawerLead.location}</span>
                <span className="status good">{activeDrawerLead.verificationTag}</span>
                <span className="rounded-full bg-green-soft px-3 py-1 text-xs font-bold text-green">
                  {activeDrawerLead.matchScore}% Match
                </span>
              </div>

              {/* Why This Lead Matches */}
              <div>
                <h3 className="text-xs font-bold tracking-wider text-ink uppercase">
                  AI Fit Rationale
                </h3>
                <p className="mt-2 rounded-2xl border border-line bg-canvas p-4 text-xs sm:text-sm leading-relaxed text-ink">
                  {activeDrawerLead.matchReason}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveDrawerLead(null)}
              className="btn btn-primary mt-6 w-full cursor-pointer"
            >
              Back to selection
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
