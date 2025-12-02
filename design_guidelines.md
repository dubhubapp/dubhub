# DubHub Leaderboard Design Guidelines

## Design Approach

**Reference-Based Approach:** Drawing inspiration from Spotify's data displays, Discord's community rankings, and gaming leaderboards (League of Legends, Valorant) combined with electronic music culture aesthetics. The design emphasizes hierarchy, motion-inspired layouts, and technical precision while maintaining clean readability.

**Core Principles:**
- Tech-forward minimalism with bold data visualization
- Rhythmic vertical spacing that creates visual "beats"
- High information density without clutter
- Gaming-inspired progression systems with music culture edge

## Typography

**Font Stack:**
- Primary: Inter (via Google Fonts CDN) - clean, technical, highly legible
- Accent: JetBrains Mono (via Google Fonts CDN) - for numbers, ranks, stats

**Hierarchy:**
- Page Title: text-4xl md:text-5xl, font-bold, tracking-tight
- Section Headers: text-2xl md:text-3xl, font-semibold
- Rank Numbers: text-3xl md:text-4xl, font-mono, font-bold
- Username/Track Names: text-lg md:text-xl, font-semibold
- Stats/Metadata: text-sm, font-medium
- Secondary Info: text-xs md:text-sm, opacity-70

## Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 6, 8, 12, 16 for consistent rhythm
- Component padding: p-4 to p-8
- Section gaps: space-y-6 to space-y-12
- Card spacing: gap-4 to gap-6

**Grid Structure:**
- Desktop: max-w-7xl container, mx-auto, px-6
- Leaderboard entries: Single column for optimal readability
- Stats cards: grid-cols-2 md:grid-cols-4 for top metrics
- Filter tabs: Horizontal scroll on mobile, full width on desktop

## Component Library

### Page Header
Full-width section with gradient background treatment (avoid solid fills):
- Title: "Leaderboard" with animated pulse indicator
- Subtitle: Current season/period information
- Top stats bar: 4-column grid showing total tracks, active users, weekly submissions, top scorer
- Each stat card: Large number (text-3xl font-mono) + label (text-xs uppercase tracking-wide)

### Filter Tabs System
Sticky navigation bar (sticky top-0 z-10):
- Horizontal tab group: "All Time" | "This Month" | "This Week" | "Today" | "Genre Leaders"
- Active tab: border-b-2 treatment with bold font-weight
- Secondary filters: Dropdown for "Top Contributors" | "Most Identified" | "Fastest Identifiers"
- Include search bar on right side: icon-left input field, rounded-full, max-w-sm

### Rewards Banner
Positioned between filters and leaderboard list, full-width:
- Gradient banner with blurred background
- Left side: Trophy/medal icon (Heroicons) + "Season 4 Rewards"
- Center: Grid of 3 reward tiers showing level badges
- Right side: "Ends in 5 days" countdown with progress ring
- Each tier shows: Badge icon, tier name, point threshold
- Height: h-32 md:h-40

### Leaderboard List Structure

**Top 3 Podium Display:**
Unique treatment for ranks 1-3, displayed horizontally:
- Each position: Large profile image (rounded-full, w-20 h-20 md:w-24 h-24)
- Rank badge: Positioned absolute, top-right of avatar, large badge design
- Username below avatar (text-center, truncate)
- Stats: Points (font-mono, text-2xl), tracks identified (text-sm)
- Vertical ordering: 2nd place (left) | 1st place (center, elevated) | 3rd place (right)
- Background cards with subtle gradient, p-6, rounded-2xl

**Ranks 4-50+ List:**
Vertical list items, each entry structured as:
- Rank indicator: Left-aligned, fixed width (w-12), font-mono, text-xl
- Avatar: rounded-full, w-12 h-12
- User info block: flex-1
  - Username (font-semibold, text-lg) + verification badge if applicable
  - Level indicator bar: horizontal progress bar showing level completion
  - Stats row: Tracks identified • Accuracy rate • Streak days
- Right column: Points display (font-mono, text-2xl, font-bold) + trend arrow (up/down/neutral)
- Hover state: subtle scale-105 transform
- Spacing: py-4, border-b on each entry

### Visual Level Indicators

**Level Badge System:**
Circular progress ring wrapping user avatar in list:
- SVG circle with stroke-dasharray showing level progress
- Level number overlay: Small badge (text-xs, font-mono) positioned top-right
- Color gradient intensity increases with level (use opacity variations, not colors)

**Experience Bar:**
Linear progress bar under username in expanded view:
- Height: h-2
- Width: full width of name section
- Shows current XP / next level XP with numbers (text-xs, font-mono) on ends
- Segmented bars for major milestones every 10 levels

### User Row Expansion (on click)
Expandable detail panel revealing:
- Recent activity feed: Last 5 identified tracks with timestamps
- Achievement badges: Grid of earned badges (grid-cols-4 md:grid-cols-6)
- Personal stats: Genre breakdown pie chart placeholder, best streak, total contributions
- Challenge button: "Send Challenge" CTA

### Quick Stats Cards
Interspersed every 10 entries, showing contextual information:
- "You're beating X% of users"
- "Next reward tier in X points"
- Featured challenge banner
- Height: h-24, background with subtle pattern

### Empty States
For filtered views with no results:
- Centered icon (Heroicons chart-bar, w-16 h-16)
- Message: "No results for this period"
- CTA: "View All Time Leaderboard" button

## Images

**No hero image required** - This is a functional dashboard page.

**Profile Avatars:**
- Circular user profile images throughout leaderboard
- Placeholder: Abstract geometric patterns or initials for users without photos
- Size hierarchy: 96x96px for top 3, 48x48px for remaining entries

**Badge/Achievement Images:**
- Vector-style SVG badges for different achievement types
- Placed in reward banners and user profile expansions
- Size: 64x64px for banners, 40x40px for inline displays

**Background Pattern:**
- Subtle circuit-board or waveform pattern overlay on reward banner only
- Very low opacity to maintain readability
- Adds electronic music aesthetic without overwhelming content

## Navigation & Interaction

**Scroll Behavior:**
- Infinite scroll implementation for ranks beyond 50
- Sticky filter bar remains visible during scroll
- Current user's rank highlighted and quick-jump button in bottom-right corner
- "Jump to My Rank" floating action button (fixed bottom-4 right-4, rounded-full, p-4)

**Responsive Breakpoints:**
- Mobile: Stack all stat cards vertically, horizontal scroll for tabs
- Tablet: 2-column stats grid, abbreviated user stats in list
- Desktop: Full 4-column stats, complete information display