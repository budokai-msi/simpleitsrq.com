# Affiliate Dashboard Blueprint

## Overview
Full-stack dashboard aggregating affiliate links and platform data based on daily trends and search activity using open source REST APIs. Integrated into `simpleitsrq.com` admin portal at `/portal/affiliate` (admin-only).

---

## Tech Stack

### Backend
- **Runtime**: Node.js 20+ (Vercel Edge/Node.js runtime)
- **Framework**: Existing `/api/portal` consolidated function pattern
- **Database**: PostgreSQL (Neon) + Redis (Upstash) for caching/rate-limiting
- **Scheduler**: Vercel Cron + `node-cron` for sub-minute jobs

### Frontend
- **Framework**: React 18 + Vite (existing)
- **UI**: Tailwind CSS + Headless UI (existing design system)
- **Charts**: Recharts (lightweight, SSR-friendly)
- **State**: React Query (TanStack Query) for server state

### External APIs (Free/Open)
| Category | APIs |
|----------|------|
| Trends | Google Trends (pytrends/unofficial), Wikipedia Pageviews, Reddit API, Hacker News API, Product Hunt API, DuckDuckGo Instant Answer, SearXNG (self-hosted) |
| Affiliate | Amazon PA-API 5.0, eBay Browse API, AliExpress Affiliate API, ShareASale API, CJ Affiliate API, Impact Radius API, Awin API, Rakuten Advertising API |

---

## Database Schema

```sql
-- trends_daily: aggregated daily trend snapshots
CREATE TABLE trends_daily (
  id              bigserial PRIMARY KEY,
  date            date NOT NULL,
  source          text NOT NULL,           -- 'google_trends', 'wikipedia', 'reddit', 'hackernews', 'producthunt'
  keyword         text NOT NULL,
  score           numeric NOT NULL,        -- normalized 0-100
  volume          bigint,                  -- search volume if available
  url             text,                    -- source URL
  metadata        jsonb DEFAULT '{}',      -- raw API response subset
  created_at      timestamptz DEFAULT now(),
  UNIQUE (date, source, keyword)
);

CREATE INDEX trends_daily_date_idx ON trends_daily (date DESC);
CREATE INDEX trends_daily_keyword_idx ON trends_daily (keyword);

-- search_terms: tracked keywords with affiliate intent
CREATE TABLE search_terms (
  id              bigserial PRIMARY KEY,
  term            text NOT NULL UNIQUE,
  intent          text CHECK (intent IN ('informational', 'commercial', 'transactional', 'navigational')),
  category        text,                    -- 'tech', 'health', 'finance', etc.
  difficulty      numeric,                 -- 0-100 SEO difficulty
  cpc             numeric,                 -- estimated cost per click
  volume_monthly  bigint,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- affiliate_networks: configured affiliate platforms
CREATE TABLE affiliate_networks (
  id              bigserial PRIMARY KEY,
  code            text NOT NULL UNIQUE,    -- 'amazon', 'ebay', 'shareasale', 'cj', 'impact', 'awin', 'rakuten', 'aliexpress'
  name            text NOT NULL,
  api_base_url    text,
  auth_type       text NOT NULL,           -- 'oauth2', 'api_key', 'signature', 'feed'
  rate_limit_rpm  int DEFAULT 60,
  is_active       boolean DEFAULT true,
  config          jsonb DEFAULT '{}',      -- client_id, secrets refs, feed URLs
  created_at      timestamptz DEFAULT now()
);

-- affiliate_products: normalized product catalog
CREATE TABLE affiliate_products (
  id                  bigserial PRIMARY KEY,
  network_id          bigint NOT NULL REFERENCES affiliate_networks(id),
  external_id         text NOT NULL,       -- network's product ID
  title               text NOT NULL,
  description         text,
  brand               text,
  category            text,
  price_cents         int,                 -- current price in cents
  currency            char(3) DEFAULT 'USD',
  image_url           text,
  product_url         text NOT NULL,       -- affiliate link (with tracking)
  commission_rate     numeric,             -- percentage or fixed
  commission_type     text CHECK (commission_type IN ('percent', 'fixed')),
  epc                 numeric,             -- earnings per click (network reported)
  conversion_rate     numeric,             -- network reported
  gravity             numeric,             -- popularity score (ClickBank style)
  raw_data            jsonb DEFAULT '{}',  -- full API response
  last_synced_at      timestamptz DEFAULT now(),
  created_at          timestamptz DEFAULT now(),
  UNIQUE (network_id, external_id)
);

CREATE INDEX affiliate_products_network_idx ON affiliate_products (network_id);
CREATE INDEX affiliate_products_category_idx ON affiliate_products (category);
CREATE INDEX affiliate_products_price_idx ON affiliate_products (price_cents);

-- affiliate_clicks: click tracking (extends existing 005_affiliate_clicks.sql)
CREATE TABLE affiliate_clicks (
  id                  bigserial PRIMARY KEY,
  product_id          bigint REFERENCES affiliate_products(id) ON DELETE SET NULL,
  network_code        text NOT NULL,       -- denormalized for queries
  session_id          text,                -- anon session
  user_id             uuid REFERENCES users(id) ON DELETE SET NULL,
  referrer            text,
  landing_page        text,
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  utm_term            text,
  utm_content         text,
  ip_hash             text,                -- SHA-256 hashed
  country             char(2),
  device              text,
  clicked_at          timestamptz DEFAULT now()
);

CREATE INDEX affiliate_clicks_product_idx ON affiliate_clicks (product_id);
CREATE INDEX affiliate_clicks_date_idx ON affiliate_clicks (clicked_at DESC);
CREATE INDEX affiliate_clicks_session_idx ON affiliate_clicks (session_id);

-- affiliate_conversions: post-click conversions
CREATE TABLE affiliate_conversions (
  id                  bigserial PRIMARY KEY,
  click_id            bigint NOT NULL REFERENCES affiliate_clicks(id) ON DELETE CASCADE,
  product_id          bigint REFERENCES affiliate_products(id) ON DELETE SET NULL,
  network_code        text NOT NULL,
  order_id            text,                -- network's order ID
  commission_cents    int NOT NULL,        -- earned commission
  currency            char(3) DEFAULT 'USD',
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'reversed', 'paid')),
  converted_at        timestamptz DEFAULT now(),
  reported_at         timestamptz,         -- when network reported it
  raw_data            jsonb DEFAULT '{}'
);

CREATE INDEX affiliate_conversions_click_idx ON affiliate_conversions (click_id);
CREATE INDEX affiliate_conversions_date_idx ON affiliate_conversions (converted_at DESC);
CREATE INDEX affiliate_conversions_status_idx ON affiliate_conversions (status);

-- affiliate_sync_log: audit trail for data ingestion
CREATE TABLE affiliate_sync_log (
  id              bigserial PRIMARY KEY,
  network_id      bigint NOT NULL REFERENCES affiliate_networks(id),
  sync_type       text NOT NULL,           -- 'full', 'incremental', 'feed', 'api'
  status          text NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'partial')),
  records_fetched int DEFAULT 0,
  records_upserted int DEFAULT 0,
  records_failed  int DEFAULT 0,
  error_message   text,
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz
);

-- trend_product_mapping: links trends to relevant affiliate products
CREATE TABLE trend_product_mapping (
  id                  bigserial PRIMARY KEY,
  trend_date          date NOT NULL,
  trend_keyword       text NOT NULL,
  product_id          bigint NOT NULL REFERENCES affiliate_products(id) ON DELETE CASCADE,
  relevance_score     numeric DEFAULT 1.0, -- 0-1 semantic relevance
  created_at          timestamptz DEFAULT now(),
  UNIQUE (trend_date, trend_keyword, product_id)
);

CREATE INDEX trend_product_mapping_date_idx ON trend_product_mapping (trend_date DESC);
```

---

## API Endpoints (Backend → Frontend)

### Core Dashboard Endpoints

```typescript
// GET /api/portal?action=affiliate-dashboard-summary
// Returns: top trends, top products, total clicks/commissions for today
interface DashboardSummary {
  date: string;
  trends: {
    top: Array<{ keyword: string; source: string; score: number; volume?: number }>;
    bySource: Record<string, number>;
  };
  products: {
    topByClicks: ProductSummary[];
    topByCommission: ProductSummary[];
    topByEPC: ProductSummary[];
  };
  totals: {
    clicks: number;
    conversions: number;
    commissionsCents: number;
    epc: number;
    conversionRate: number;
  };
  networks: NetworkPerformance[];
}

// GET /api/portal?action=trends&date=YYYY-MM-DD&source=google_trends&limit=50
interface TrendsResponse {
  date: string;
  trends: Array<{
    keyword: string;
    source: string;
    score: number;
    volume?: number;
    change24h?: number;      // vs previous day
    relatedKeywords?: string[];
    url?: string;
  }>;
  sources: string[];
}

// GET /api/portal?action=affiliate-products&keyword=laptop&platform=amazon&category=electronics&minPrice=1000&maxPrice=5000&sort=epc&order=desc&page=1&limit=20
interface ProductsResponse {
  products: Array<{
    id: number;
    network: string;
    externalId: string;
    title: string;
    brand: string;
    category: string;
    priceCents: number;
    currency: string;
    imageUrl: string;
    productUrl: string;
    commissionRate: number;
    commissionType: 'percent' | 'fixed';
    epc: number;
    conversionRate: number;
    gravity: number;
    clicks7d: number;
    conversions7d: number;
    commissions7d: number;
    trendScore?: number;       // if linked to today's trends
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
  filters: { networks: string[]; categories: string[]; priceRange: [number, number] };
}

// GET /api/portal?action=affiliate-stats&period=last7days&network=amazon&groupBy=day
interface ClicksStatsResponse {
  period: string;
  groupBy: 'hour' | 'day' | 'week';
  series: Array<{
    period: string;            // ISO date/hour
    clicks: number;
    conversions: number;
    commissionsCents: number;
    epc: number;
    conversionRate: number;
    ctr: number;
  }>;
  totals: {
    clicks: number;
    conversions: number;
    commissionsCents: number;
    avgEpc: number;
    avgConversionRate: number;
  };
  byNetwork: NetworkPerformance[];
  byProduct: ProductPerformance[];
}

// GET /api/portal?action=affiliate-networks
interface NetworksResponse {
  networks: Array<{
    id: number;
    code: string;
    name: string;
    isActive: boolean;
    lastSyncAt: string;
    stats: {
      products: number;
      clicks7d: number;
      commissions7d: number;
      epc: number;
    };
  }>;
}

// POST /api/portal?action=affiliate-sync { networkCode: 'amazon', type: 'incremental' }
interface SyncResponse {
  ok: boolean;
  syncId: number;
  status: 'started' | 'completed' | 'failed';
  message: string;
}
```

---

## Sample Implementation Code

### 1. Trend Fetching: Google Trends (Python/pytrends) + Wikipedia Pageviews

```python
# scripts/trends/fetch_google_trends.py
import asyncio
import os
from datetime import datetime, timedelta
from pytrends.request import TrendReq
import asyncpg

async def fetch_google_trends(date: str, pool: asyncpg.Pool):
    """Fetch daily Google Trends for configured keywords."""
    pytrends = TrendReq(hl='en-US', tz=360, timeout=(10, 25))
    
    # Get tracked search terms from DB
    terms = await pool.fetch("SELECT term FROM search_terms WHERE intent IN ('commercial', 'transactional')")
    keywords = [t['term'] for t in terms]
    
    if not keywords:
        return
    
    # Batch into chunks of 5 (pytrends limit)
    for i in range(0, len(keywords), 5):
        chunk = keywords[i:i+5]
        try:
            pytrends.build_payload(chunk, cat=0, timeframe=f'{date} {date}', geo='US', gprop='')
            interest = pytrends.interest_over_time()
            
            if not interest.empty:
                for kw in chunk:
                    if kw in interest.columns:
                        score = float(interest[kw].iloc[-1]) if len(interest) > 0 else 0
                        await pool.execute("""
                            INSERT INTO trends_daily (date, source, keyword, score, metadata)
                            VALUES ($1, 'google_trends', $2, $3, $4)
                            ON CONFLICT (date, source, keyword) DO UPDATE
                            SET score = EXCLUDED.score, metadata = EXCLUDED.metadata
                        """, date, kw, score, '{}')
        except Exception as e:
            print(f"Error fetching trends for {chunk}: {e}")
        await asyncio.sleep(1)  # rate limit courtesy

# scripts/trends/fetch_wikipedia_pageviews.py
import aiohttp
import asyncpg
from datetime import datetime, timedelta

async def fetch_wikipedia_pageviews(date: str, pool: asyncpg.Pool):
    """Fetch Wikipedia pageviews for tracked entities."""
    terms = await pool.fetch("SELECT term FROM search_terms")
    
    async with aiohttp.ClientSession() as session:
        for term in terms:
            # Sanitize term for Wikipedia API
            title = term['term'].replace(' ', '_')
            url = f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/{title}/daily/{date.replace('-', '')}/{date.replace('-', '')}"
            
            try:
                async with session.get(url, headers={'User-Agent': 'SimpleITSRQ-Trends/1.0'}) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        views = sum(item['views'] for item in data.get('items', []))
                        await pool.execute("""
                            INSERT INTO trends_daily (date, source, keyword, score, volume, metadata)
                            VALUES ($1, 'wikipedia', $2, $3, $4, $5)
                            ON CONFLICT (date, source, keyword) DO UPDATE
                            SET score = EXCLUDED.score, volume = EXCLUDED.volume
                        """, date, term['term'], min(views / 1000, 100), views, '{}')
            except Exception as e:
                print(f"Error fetching Wikipedia views for {term}: {e}")
```

### 2. Affiliate Product Fetch: eBay Browse API

```javascript
// api/_lib/affiliate/ebay.js
import { sql } from '../db.js';

const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';

let tokenCache = { token: null, expiresAt: 0 };

async function getEbayToken() {
  const now = Date.now();
  if (tokenCache.token && now < tokenCache.expiresAt - 60000) {
    return tokenCache.token;
  }
  
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  const resp = await fetch(EBAY_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });
  
  const data = await resp.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in * 1000),
  };
  return data.access_token;
}

export async function fetchEbayProducts(keyword, { limit = 50, categoryId, minPrice, maxPrice } = {}) {
  const token = await getEbayToken();
  const params = new URLSearchParams({
    q: keyword,
    limit: limit.toString(),
    filter: 'buyingOptions:{FIXED_PRICE}',
  });
  
  if (categoryId) params.append('category_ids', categoryId);
  if (minPrice) params.append('filter', `${params.get('filter')},price:[${minPrice}..]`);
  if (maxPrice) params.append('filter', `${params.get('filter')},price:[..${maxPrice}]`);
  
  const resp = await fetch(`${EBAY_BROWSE_URL}?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    },
  });
  
  if (!resp.ok) {
    throw new Error(`eBay API ${resp.status}: ${await resp.text()}`);
  }
  
  const data = await resp.json();
  return data.itemSummaries?.map(item => ({
    externalId: item.itemId,
    title: item.title,
    description: item.shortDescription,
    brand: item.brand,
    category: item.categoryPath,
    priceCents: Math.round(parseFloat(item.price.value) * 100),
    currency: item.price.currency,
    imageUrl: item.image?.imageUrl,
    productUrl: item.itemWebUrl, // Already has affiliate tracking if configured
    rawData: item,
  })) || [];
}

export async function syncEbayProducts(networkId, keywords = ['laptop', 'phone', 'headphones']) {
  const logId = await sql`INSERT INTO affiliate_sync_log (network_id, sync_type, status) VALUES (${networkId}, 'api', 'started') RETURNING id`;
  
  let totalFetched = 0, totalUpserted = 0, totalFailed = 0;
  
  for (const keyword of keywords) {
    try {
      const products = await fetchEbayProducts(keyword, { limit: 100 });
      totalFetched += products.length;
      
      for (const p of products) {
        try {
          await sql`
            INSERT INTO affiliate_products (network_id, external_id, title, description, brand, category, price_cents, currency, image_url, product_url, raw_data, last_synced_at)
            VALUES (${networkId}, ${p.externalId}, ${p.title}, ${p.description}, ${p.brand}, ${p.category}, ${p.priceCents}, ${p.currency}, ${p.imageUrl}, ${p.productUrl}, ${JSON.stringify(p.rawData)}, now())
            ON CONFLICT (network_id, external_id) DO UPDATE SET
              title = EXCLUDED.title,
              price_cents = EXCLUDED.price_cents,
              image_url = EXCLUDED.image_url,
              product_url = EXCLUDED.product_url,
              raw_data = EXCLUDED.raw_data,
              last_synced_at = now()
          `;
          totalUpserted++;
        } catch (e) {
          totalFailed++;
          console.error(`Upsert failed for ${p.externalId}:`, e);
        }
      }
    } catch (e) {
      totalFailed++;
      console.error(`Fetch failed for ${keyword}:`, e);
    }
  }
  
  await sql`
    UPDATE affiliate_sync_log SET 
      status = ${totalFailed === 0 ? 'completed' : totalUpserted > 0 ? 'partial' : 'failed'},
      records_fetched = ${totalFetched},
      records_upserted = ${totalUpserted},
      records_failed = ${totalFailed},
      completed_at = now()
    WHERE id = ${logId[0].id}
  `;
  
  return { fetched: totalFetched, upserted: totalUpserted, failed: totalFailed };
}
```

### 3. Scheduler Setup (Vercel Cron + Node-cron)

```javascript
// api/cron/affiliate-sync.js
// Runs daily at 03:00 UTC - full sync for all active networks
import { sql } from '../_lib/db.js';
import { syncEbayProducts } from '../_lib/affiliate/ebay.js';
import { syncAmazonProducts } from '../_lib/affiliate/amazon.js';
// ... import other network syncs

export default async function handler(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }
  
  const networks = await sql`SELECT id, code FROM affiliate_networks WHERE is_active = true`;
  
  for (const net of networks) {
    try {
      if (net.code === 'ebay') await syncEbayProducts(net.id);
      else if (net.code === 'amazon') await syncAmazonProducts(net.id);
      // ... other networks
    } catch (e) {
      console.error(`Sync failed for ${net.code}:`, e);
    }
  }
  
  return new Response(JSON.stringify({ ok: true, synced: networks.length }));
}

// vercel.json cron entry:
/*
{
  "crons": [
    { "path": "/api/cron/affiliate-sync", "schedule": "0 3 * * *" }
  ]
}
*/

// scripts/scheduler.js (for local dev with node-cron)
import cron from 'node-cron';
import { syncEbayProducts } from '../api/_lib/affiliate/ebay.js';

cron.schedule('0 3 * * *', async () => {
  console.log('[cron] Starting daily affiliate sync...');
  const networks = await sql`SELECT id, code FROM affiliate_networks WHERE is_active = true`;
  for (const net of networks) {
    if (net.code === 'ebay') await syncEbayProducts(net.id);
  }
  console.log('[cron] Daily affiliate sync complete');
});

// Hourly trend fetch
cron.schedule('0 * * * *', async () => {
  const today = new Date().toISOString().split('T')[0];
  await fetchGoogleTrends(today, pool);
  await fetchWikipediaPageviews(today, pool);
});
```

---

## Frontend Components (React + TypeScript)

### File Structure
```
src/
├── components/
│   ├── admin/
│   │   ├── AffiliateDashboard.jsx      # Main dashboard page
│   │   ├── AffiliateDashboard.css
│   │   ├── AffiliateTab.jsx            # Lazy-loaded tab for AdminOps
│   │   ├── ProductCard.jsx             # Product display card
│   │   ├── TrendChart.jsx              # Time-series trend chart
│   │   ├── NetworkFilter.jsx           # Multi-select network filter
│   │   ├── DateRangePicker.jsx         # Period selector
│   │   └── StatsGrid.jsx               # KPI cards
│   └── charts/
│       ├── LineChart.jsx
│       ├── BarChart.jsx
│       └── Sparkline.jsx
├── hooks/
│   ├── useAffiliateDashboard.js        # Dashboard data fetching
│   ├── useTrends.js                    # Trends data + filters
│   ├── useAffiliateProducts.js         # Product search + pagination
│   └── useAffiliateStats.js            # Click/commission analytics
└── pages/
    └── AffiliateDashboardPage.jsx      # Standalone page (optional)
```

### Key Component Sketches

```jsx
// src/components/admin/AffiliateTab.jsx
import { useState, useEffect } from 'react';
import { lazy, Suspense } from 'react';
import { useAffiliateDashboard } from '../../hooks/useAffiliateDashboard';
import { useTrends } from '../../hooks/useTrends';
import { useAffiliateProducts } from '../../hooks/useAffiliateProducts';
import { useAffiliateStats } from '../../hooks/useAffiliateStats';
import { NetworkFilter } from './NetworkFilter';
import { DateRangePicker } from './DateRangePicker';
import { StatsGrid } from './StatsGrid';
import { ProductCard } from './ProductCard';
import { TrendChart } from './TrendChart';
import { Spinner } from '../ui/Spinner';

const AffiliateTab = () => {
  const [period, setPeriod] = useState('last7days');
  const [networks, setNetworks] = useState([]);
  const [keyword, setKeyword] = useState('');
  
  const { data: summary, isLoading: summaryLoading } = useAffiliateDashboard();
  const { data: trends, isLoading: trendsLoading } = useTrends({ period });
  const { data: products, isLoading: productsLoading, refetch } = useAffiliateProducts({ 
    keyword, 
    networks, 
    sort: 'epc', 
    order: 'desc' 
  });
  const { data: stats, isLoading: statsLoading } = useAffiliateStats({ period, networks });
  
  return (
    <div className="affiliate-dashboard">
      <header className="aff-dashboard-header">
        <h1>Affiliate Dashboard</h1>
        <div className="aff-dashboard-controls">
          <DateRangePicker value={period} onChange={setPeriod} />
          <NetworkFilter value={networks} onChange={setNetworks} />
          <input
            type="search"
            placeholder="Search products..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="aff-search-input"
          />
        </div>
      </header>
      
      <Suspense fallback={<Spinner />}>
        <StatsGrid data={summary?.totals} />
      </Suspense>
      
      <section className="aff-section">
        <h2>Daily Trends</h2>
        <Suspense fallback={<Spinner />}>
          <TrendChart data={trends} period={period} />
        </Suspense>
      </section>
      
      <section className="aff-section">
        <div className="aff-section-head">
          <h2>Top Affiliate Products</h2>
          <button onClick={() => refetch()} disabled={productsLoading}>Refresh</button>
        </div>
        <Suspense fallback={<Spinner />}>
          <div className="aff-product-grid">
            {products?.products?.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </Suspense>
      </section>
      
      <section className="aff-section">
        <h2>Performance by Network</h2>
        <Suspense fallback={<Spinner />}>
          <NetworkPerformanceChart data={stats?.byNetwork} />
        </Suspense>
      </section>
    </div>
  );
};

export default AffiliateTab;
```

```jsx
// src/components/admin/ProductCard.jsx
import { ExternalLink, TrendingUp, DollarSign, MousePointer, CheckCircle } from 'lucide-react';

export function ProductCard({ product }) {
  const commissionDisplay = product.commissionType === 'percent' 
    ? `${product.commissionRate}%` 
    : `$${(product.commissionRate / 100).toFixed(2)}`;
  
  return (
    <article className="aff-product-card">
      <div className="aff-product-image">
        {product.imageUrl && <img src={product.imageUrl} alt={product.title} loading="lazy" />}
      </div>
      <div className="aff-product-content">
        <h3 className="aff-product-title">{product.title}</h3>
        <p className="aff-product-brand">{product.brand}</p>
        
        <div className="aff-product-meta">
          <span className="aff-badge aff-badge--network">{product.network}</span>
          <span className="aff-badge aff-badge--category">{product.category}</span>
        </div>
        
        <div className="aff-product-stats">
          <div className="aff-stat">
            <DollarSign size={14} />
            <span>${(product.priceCents / 100).toFixed(2)}</span>
          </div>
          <div className="aff-stat">
            <MousePointer size={14} />
            <span>{product.clicks7d} clicks (7d)</span>
          </div>
          <div className="aff-stat">
            <CheckCircle size={14} />
            <span>{product.conversions7d} conv.</span>
          </div>
          <div className="aff-stat aff-stat--highlight">
            <DollarSign size={14} />
            <span>${(product.commissions7d / 100).toFixed(2)} earned</span>
          </div>
        </div>
        
        <div className="aff-product-commission">
          <span>Commission: {commissionDisplay}</span>
          <span>EPC: ${product.epc?.toFixed(2) || '0.00'}</span>
          <span>CR: {(product.conversionRate * 100).toFixed(1)}%</span>
        </div>
        
        <a 
          href={product.productUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="aff-product-link"
        >
          <ExternalLink size={14} /> View on {product.network}
        </a>
      </div>
    </article>
  );
}
```

```jsx
// src/components/admin/TrendChart.jsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export function TrendChart({ data, period }) {
  if (!data?.trends?.length) return <div className="aff-empty">No trend data for this period</div>;
  
  // Transform for Recharts: each keyword = line
  const keywords = [...new Set(data.trends.map(t => t.keyword))].slice(0, 10);
  const dates = [...new Set(data.trends.map(t => t.date))].sort();
  
  const chartData = dates.map(date => {
    const row = { date };
    keywords.forEach(kw => {
      const trend = data.trends.find(t => t.keyword === kw && t.date === date);
      row[kw] = trend?.score || 0;
    });
    return row;
  });
  
  return (
    <div className="aff-chart-container" style={{ height: 400 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="date" tickFormatter={d => new Date(d).toLocaleDateString()} />
          <YAxis domain={[0, 'auto']} label={{ value: 'Trend Score (0-100)', angle: -90, position: 'insideLeft' }} />
          <Tooltip 
            formatter={(value, name) => [value, name]}
            labelFormatter={d => new Date(d).toLocaleDateString()}
          />
          <Legend />
          {keywords.map((kw, i) => (
            <Line
              key={kw}
              type="monotone"
              dataKey={kw}
              stroke={`hsl(${i * 36}, 70%, 50%)`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6 }}
              name={kw}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

```javascript
// src/hooks/useAffiliateDashboard.js
import { useQuery } from '@tanstack/react-query';
import { getJson } from '../components/admin/shared';

export function useAffiliateDashboard() {
  return useQuery({
    queryKey: ['affiliate-dashboard-summary'],
    queryFn: () => getJson('affiliate-dashboard-summary'),
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

export function useTrends({ period }) {
  return useQuery({
    queryKey: ['trends', period],
    queryFn: () => getJson('trends', { period }),
    staleTime: 10 * 60 * 1000,
  });
}

export function useAffiliateProducts({ keyword, networks, sort, order, page = 1, limit = 20 }) {
  return useQuery({
    queryKey: ['affiliate-products', { keyword, networks, sort, order, page, limit }],
    queryFn: () => getJson('affiliate-products', { 
      keyword, 
      platform: networks.join(','), 
      sort, 
      order, 
      page, 
      limit 
    }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useAffiliateStats({ period, networks }) {
  return useQuery({
    queryKey: ['affiliate-stats', { period, networks }],
    queryFn: () => getJson('affiliate-stats', { period, network: networks.join(',') }),
    staleTime: 5 * 60 * 1000,
  });
}
```

---

## Rate Limiting, Caching & Security

### Rate Limiting (Redis + Upstash)
```javascript
// api/_lib/rateLimit.js
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function rateLimit({ key, limit, windowMs }) {
  const redisKey = `ratelimit:${key}`;
  const current = await redis.incr(redisKey);
  
  if (current === 1) {
    await redis.pexpire(redisKey, windowMs);
  }
  
  return {
    ok: current <= limit,
    remaining: Math.max(0, limit - current),
    resetAt: Date.now() + windowMs,
  };
}

// Per-API rate limit middleware
export async function withRateLimit(request, { bucket, max, windowSeconds }) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = await rateLimit({ key: `${bucket}:${ip}`, limit: max, windowMs: windowSeconds * 1000 });
  
  if (!rl.ok) {
    return { error: 'rate_limited', retryAfter: Math.ceil(windowSeconds * (1 - rl.remaining / max)) };
  }
  return null;
}
```

### Caching Strategy
```javascript
// api/_lib/cache.js
const CACHE_TTL = {
  trends: 3600,        // 1 hour
  products: 1800,      // 30 min
  stats: 300,          // 5 min
  networks: 3600,      // 1 hour
};

export async function getCached(key, fetcher, ttl = 300) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  
  const fresh = await fetcher();
  await redis.setex(key, ttl, JSON.stringify(fresh));
  return fresh;
}

// Usage in handlers
const trends = await getCached(
  `trends:${date}:${source}`,
  () => fetchTrendsFromDB(date, source),
  CACHE_TTL.trends
);
```

### Security
- **API Keys**: All secrets in Vercel Environment Variables (encrypted at rest)
- **Admin Access**: `ADMIN_API_TOKEN` (32+ char) + `ADMIN_EMAIL` digest verification
- **CSRF**: Double-submit cookie (`sit_csrf`) + Origin validation
- **Affiliate Compliance**: 
  - All outbound links include `rel="noopener noreferrer"`
  - Tracking parameters (`utm_source=simpleitsrq`, `utm_medium=affiliate`) auto-appended
  - FTC disclosure banner on affiliate content pages
  - No cloaking — direct links to merchant with transparent redirect

---

## Integration into simpleitsrq.com Admin Portal

### 1. Add Route (App.jsx)
```jsx
// In App.jsx routes section
<Route 
  path="/portal/affiliate" 
  element={
    <OwnerOnlyRoute>
      <AdminOps defaultTab="affiliate" />
    </OwnerOnlyRoute>
  } 
/>
```

### 2. Add Tab to AdminOps (TABS array)
```javascript
// In AdminOps.jsx TABS array
const TABS = [
  // ... existing tabs
  ["affiliate", "Affiliate", DollarSign],
  // ...
];
```

### 3. Add AffiliateTab to Lazy Imports
```javascript
const LazyAffiliateTab = lazy(() => import("../components/admin/AffiliateTab"));
```

### 4. Add CORE_ACTIONS
```javascript
const CORE_ACTIONS = [
  // ... existing
  "affiliate-dashboard-summary",
  "trends",
  "affiliate-products",
  "affiliate-stats",
  "affiliate-networks",
  "affiliate-sync",
];
```

### 5. Register in portal.js ADMIN_TOKEN_ACTIONS
```javascript
// In portal.js ADMIN_TOKEN_ACTIONS set
"affiliate-dashboard-summary",
"trends",
"affiliate-products",
"affiliate-stats",
"affiliate-networks",
"affiliate-sync",
```

---

## Implementation Checklist

### Phase 1: Database & Backend (Week 1)
- [ ] Run migrations (022_affiliate_dashboard.sql)
- [ ] Create `affiliate_networks` seed data
- [ ] Implement `api/_lib/affiliate/` modules for each network
- [ ] Add portal actions: `affiliate-dashboard-summary`, `trends`, `affiliate-products`, `affiliate-stats`, `affiliate-networks`, `affiliate-sync`
- [ ] Add cron job for daily sync + hourly trend fetch

### Phase 2: Frontend (Week 2)
- [ ] Create `AffiliateTab.jsx` + components
- [ ] Add React Query hooks
- [ ] Integrate into AdminOps lazy tabs
- [ ] Style with existing design system (leadgen.css)

### Phase 3: Data Population (Week 3)
- [ ] Configure Amazon PA-API 5.0 credentials
- [ ] Configure eBay Browse API credentials
- [ ] Configure ShareASale/CJ/Impact/Awin/Rakuten API access
- [ ] Set up SearXNG instance for trend aggregation
- [ ] Run initial full sync for all networks

### Phase 4: Polish & Monitoring (Week 4)
- [ ] Add alerting for sync failures
- [ ] Build trend→product auto-mapping (semantic similarity)
- [ ] Add export (CSV) for product catalog
- [ ] Document affiliate compliance workflow

---

## Environment Variables Required

```bash
# Affiliate Network Credentials (Vercel Encrypted)
AMAZON_ACCESS_KEY=
AMAZON_SECRET_KEY=
AMAZON_PARTNER_TAG=
AMAZON_REGION=us-east-1

EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_CAMPAIGN_ID=

ALIEXPRESS_APP_KEY=
ALIEXPRESS_APP_SECRET=
ALIEXPRESS_TRACKING_ID=

SHAREASALE_API_TOKEN=
SHAREASALE_MERCHANT_ID=

CJ_CLIENT_ID=
CJ_CLIENT_SECRET=
CJ_WEBSITE_ID=

IMPACT_ACCOUNT_SID=
IMPACT_AUTH_TOKEN=

AWIN_API_KEY=
AWIN_PUBLISHER_ID=

RAKUTEN_CLIENT_ID=
RAKUTEN_CLIENT_SECRET=
RAKUTEN_AFFILIATE_ID=

# Trend APIs
SERPAPI_KEY=              # For Google Trends fallback
SEARXNG_URL=http://localhost:8888  # Self-hosted

# Infrastructure
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
CRON_SECRET=              # Already exists
```

---

## Notes for Development

1. **Admin Access**: Use Google OAuth (`/api/auth/login?provider=google&redirect=/portal/affiliate`) to sign in as `ivanovspccenter@gmail.com` (already whitelisted via admin digest).

2. **Local Dev**: Run `npm run dev` and visit `http://localhost:5173/portal/affiliate`

3. **Testing API**: Use admin token header: `x-admin-token: <token>` for direct API testing

4. **Compliance**: Every product link must include tracking params. The `product_url` from networks should already have affiliate IDs; if not, append `?utm_source=simpleitsrq&utm_medium=affiliate&utm_campaign=dashboard`

5. **Performance**: Product searches hit cached DB — external API calls only during scheduled syncs. Trend data cached 1hr.

---

*Generated for simpleitsrq.com admin portal integration. Ready for implementation.*