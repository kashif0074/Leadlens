export type GeoapifyBusiness = {
  name: string;
  address: string;
  website: string | null;
  phone: string | null;
  category: string | null;
  city: string;
  state: string;
  country: string;
  lat: number;
  lon: number;
};

const DEFAULT_COORDINATES: Record<string, { lat: number; lon: number; country: string }> = {
  london: { lat: 51.5074, lon: -0.1278, country: "United Kingdom" },
  dubai: { lat: 25.2048, lon: 55.2708, country: "United Arab Emirates" },
  "new york": { lat: 40.7128, lon: -74.006, country: "United States" },
  "san francisco": { lat: 37.7749, lon: -122.4194, country: "United States" },
  austin: { lat: 30.2672, lon: -97.7431, country: "United States" },
  berlin: { lat: 52.52, lon: 13.405, country: "Germany" },
  singapore: { lat: 1.3521, lon: 103.8198, country: "Singapore" },
  toronto: { lat: 43.6532, lon: -79.3832, country: "Canada" },
  sydney: { lat: -33.8688, lon: 151.2093, country: "Australia" },
  paris: { lat: 48.8566, lon: 2.3522, country: "France" },
  karachi: { lat: 24.8607, lon: 67.0011, country: "Pakistan" },
  riyadh: { lat: 24.7136, lon: 46.6753, country: "Saudi Arabia" },
};

/**
 * Converts a city (and optional country) name into lat/lon coordinates.
 */
export async function getCityCoordinates(
  cityName: string,
  countryName?: string,
): Promise<{ lat: number; lon: number; city: string; country: string }> {
  const normalizedCity = cityName.trim();
  const normalizedCountry = countryName?.trim() || "";
  const query = normalizedCountry ? `${normalizedCity}, ${normalizedCountry}` : normalizedCity;

  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (apiKey) {
    try {
      const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(
        query,
      )}&apiKey=${apiKey}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        if (data.features?.length) {
          const feature = data.features[0];
          const [lon, lat] = feature.geometry.coordinates;
          const detectedCity = feature.properties?.city || feature.properties?.name || normalizedCity;
          const detectedCountry = feature.properties?.country || normalizedCountry || "Global";
          return { lat, lon, city: detectedCity, country: detectedCountry };
        }
      }
    } catch (err) {
      console.warn("[Geoapify] Geocoding request failed or timed out:", err);
    }
  }

  // Fallback to known coordinate table
  const key = normalizedCity.toLowerCase();
  for (const [k, coords] of Object.entries(DEFAULT_COORDINATES)) {
    if (key.includes(k)) {
      return {
        lat: coords.lat,
        lon: coords.lon,
        city: normalizedCity,
        country: normalizedCountry || coords.country,
      };
    }
  }

  // Default coordinate if completely unknown (Central London fallback)
  return {
    lat: 51.5074,
    lon: -0.1278,
    city: normalizedCity || "London",
    country: normalizedCountry || "United Kingdom",
  };
}

/**
 * Maps a free-text industry description to the closest Geoapify category.
 */
export function mapIndustryToCategory(industry: string): string {
  const normalized = industry.toLowerCase();

  const categoryMap: Array<[RegExp, string]> = [
    [/dental|dentist|orthodont/i, "healthcare.dentist"],
    [/clinic|praxis|medical center|doctor|physician/i, "healthcare.clinic_or_praxis"],
    [/hospital|healthcare|pharma|biotech/i, "healthcare.hospital"],
    [/marketing|advertising|digital agency|media agency|seo|pr agency/i, "office.advertising_agency"],
    [/consulting|advisory|management consult/i, "office.consulting"],
    [/recruitment|staffing|talent|headhunter|employment/i, "office.employment_agency"],
    [/real estate|property|realtor|estate agent/i, "office.estate_agent"],
    [/fintech|financial|wealth|investment|banking|hedge/i, "office.financial"],
    [/accounting|audit|tax|cpa/i, "office.accountant"],
    [/legal|law firm|solicitor|attorney|lawyer/i, "office.lawyer"],
    [/software|saas|it|tech|cloud|cybersecurity|ai|app developer/i, "office.it"],
    [/logistics|freight|supply chain|shipping|warehousing/i, "commercial.logistics"],
    [/restaurant|cafe|catering|hospitality|food/i, "catering.restaurant"],
    [/retail|ecommerce|shopping|store/i, "commercial.shopping_mall"],
  ];

  for (const [pattern, category] of categoryMap) {
    if (pattern.test(normalized)) {
      return category;
    }
  }

  return "commercial.office";
}

/**
 * Searches for businesses near a given coordinate point, filtered by category with fallback.
 */
export async function searchBusinessesByCategory(
  category: string,
  lat: number,
  lon: number,
  radiusMeters: number = 25000,
  limit: number = 25,
): Promise<GeoapifyBusiness[]> {
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[Geoapify] GEOAPIFY_API_KEY is not configured.");
    return [];
  }

  const categoriesToTry = [category, "office.advertising_agency,office.consulting,office.it", "commercial.office", "commercial"];

  for (const cat of categoriesToTry) {
    try {
      const url = `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(
        cat,
      )}&filter=circle:${lon},${lat},${radiusMeters}&bias=proximity:${lon},${lat}&limit=${limit}&apiKey=${apiKey}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        console.warn(`[Geoapify] Places API returned HTTP ${res.status} for category ${cat}`);
        continue;
      }

      const data = await res.json();
      const features = data.features || [];

      if (features.length > 0) {
        return features.map((f: any) => {
          const props = f.properties || {};
          return {
            name: props.name || props.address_line1 || "Business",
            address: props.formatted || props.address_line2 || "",
            website: props.website || props.contact?.website || null,
            phone: props.contact?.phone || props.phone || null,
            category: props.categories?.[0] || cat,
            city: props.city || props.county || "",
            state: props.state || props.region || "",
            country: props.country || "",
            lat: props.lat || lat,
            lon: props.lon || lon,
          };
        });
      }
    } catch (err) {
      console.warn(`[Geoapify] Error searching category ${cat}:`, err);
    }
  }

  return [];
}