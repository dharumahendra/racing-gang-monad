# Racing Gang â€” design system dari Stitch

Source: project Racing Gang Design System, projects/5583154990675470015, diambil22Oktober2026. Pilihan pengguna: Daylight Grand Prix default dan toggle Cyber Arcade Drift. Reference layar light04ba411d9f8d44668caae13e6de5c5c4 dan darkab00ca12f6294192ad352484f3c61b92.

Implementasi memakai explicit Brand/Colors/Components di markdown Stitch sebagai acuan ketika generated namedColors berbeda. Frame/roster/showroom/performance mengikuti contoh garasi, diadaptasi ke route dan data game yang benar. Font self-hosted Space Grotesk/Plus Jakarta Sans, dengan OFL asli. Jangan menyalin statistik321km/j, lap record, serverTokyo, nitro fuel atau fitur tuning dekoratif dari reference ke data produk.

Aksesibilitas: primary action terang memakai #0369A1 (varian hover resmi) dengan putih agar kontras melampaui4.5:1; aksen tetap#0284C7. Teks positif/warning menggunakan shade yang terbaca. Label UI minimal11px, nilai/gameplay tetap shared config. Nilai fallback theme light, preferensi lokal terpisah dari akun/auth, dapat berganti ketika storage diblokir. Tema memengaruhi shell, showroom dan komponen HUD, bukan aturan sim atau warna jalan gameplay.

Reference HTML dari Stitch tidak dijalankan di production; tidak membawa Tailwind CDN, gambar mobil foto, data dummy atau link dekoratif. Halaman publik/watch tetap tanpa login. Glow/gradient/pulse dekoratif tidak ditambahkan; precision/chamfer/segmented meter dan warna semantik membawa karakter arcade.

---

---
name: Daylight Grand Prix
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3f4850'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#707881'
  outline-variant: '#bfc7d2'
  surface-tint: '#006398'
  primary: '#006194'
  on-primary: '#ffffff'
  primary-container: '#007bb9'
  on-primary-container: '#fdfcff'
  inverse-primary: '#93ccff'
  secondary: '#ba0035'
  on-secondary: '#ffffff'
  secondary-container: '#e21e49'
  on-secondary-container: '#fffbff'
  tertiary: '#006b2c'
  on-tertiary: '#ffffff'
  tertiary-container: '#00873a'
  on-tertiary-container: '#f7fff2'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cce5ff'
  primary-fixed-dim: '#93ccff'
  on-primary-fixed: '#001d31'
  on-primary-fixed-variant: '#004b73'
  secondary-fixed: '#ffdada'
  secondary-fixed-dim: '#ffb3b6'
  on-secondary-fixed: '#40000c'
  on-secondary-fixed-variant: '#920028'
  tertiary-fixed: '#7ffc97'
  tertiary-fixed-dim: '#62df7d'
  on-tertiary-fixed: '#002109'
  on-tertiary-fixed-variant: '#005320'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
  track-white: '#FFFFFF'
  pale-titanium: '#F4F6F9'
  panel-slate: '#1E293B'
  graphite-border: '#D1D5DB'
  electric-lime: '#65A30D'
  nitro-crimson: '#E11D48'
  cyber-cyan: '#0284C7'
  cyber-cyan-light: '#E0F2FE'
  synthwave-violet: '#7E22CE'
  grand-prix-gold: '#CA8A04'
typography:
  display-hero:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.02em
  display-hero-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: 0.02em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
    letterSpacing: 0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: 0.03em
  title-sm:
    fontFamily: Space Grotesk
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.04em
  hud-odometer:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: 0.08em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.25rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system translates the pulse of 90s arcade racing into high-clarity daylight track conditions. Engineered for modern low-poly competitive racing, it balances arcade nostalgia with surgical technical telemetry designed for bright daylight environments.

The visual style unites **Technical Minimalism** with **Arcade Kineticism**:
- **Daylight Track Telemetry**: High-albedo titanium shells, pristine racing whites, and deep graphite framing replace nighttime darkness, delivering instant readability under bright ambient glare.
- **Micro-Chamfered Precision**: Crisp 45-degree corner clips, segmented mechanical indicators, and high-contrast decal trims mirror race car composites, telemetry cockpits, and arcade circuit timing boards.
- **High-Velocity Contrast**: Pure white canvas layers are anchored by deep slate-charcoal structural panels and punchy primary hues, keeping interactive controls, nitro reserves, and speed metrics prominent without visual fatigue.

## Colors

The daylight palette shifts from nocturnal neon backdrops to crisp, high-visibility track surfaces with rich saturated accents.

- **Primary (`#0284C7` - Racing Cyan)**: The foundational digital HUD tone. Used for active navigation links, focused states, interactive badges, selection indicators, and primary telemetry borders.
- **Secondary (`#E11D48` - Crimson Nitro)**: High-priority triggers, nitro reservoirs, tachometer redlines, acceleration alerts, and primary calls to action requiring immediate visual acquisition.
- **Tertiary (`#16A34A` / `#65A30D` - Telemetry Lime)**: Positive delta splits, optimal gear-shift notifications, battery/boost readiness, and verified status checks.
- **Synthwave Violet (`#7E22CE`)**: Exotic vehicle unlocks, championship tiers, and prestige rank badges.
- **Grand Prix Gold (`#CA8A04`)**: Podium standings, G-Coin balances, and checkered flag milestones.
- **Surfaces & Layout Structure**:
  - `track-white` (`#FFFFFF`): Primary foreground containers, data cards, and active control surfaces.
  - `pale-titanium` (`#F4F6F9`): Main track canvas and dashboard background tone.
  - `panel-slate` (`#1E293B`): High-contrast telemetry shells, HUD topbars, and deep cockpit frames.
  - `graphite-border` (`#D1D5DB`): 1px structural framing for standard day-mode panels.
  - `neutral` (`#0F172A`): Deep slate text color for maximum daylight legibility across white and light titanium surfaces.

## Typography

Typography pairs the structural, geometric presence of **Space Grotesk** with the clean legibility of **Plus Jakarta Sans**.

- **Space Grotesk**: Commands all tactical interfaces, lap metrics, HUD readouts, telemetry titles, and navigation buttons. Uppercase styling with tracking from `0.04em` to `0.1em` reinforces mechanical instrumentation and arcade timing towers.
- **Plus Jakarta Sans**: Manages all readable copy, vehicle specs, tuning tooltips, and conversational settings. Rendered in `#0F172A` with medium weight (`500`) to resist washout in high-brightness outdoor lighting.

## Layout & Spacing

The layout operates on a 12-column fluid grid calibrated for both desktop control centers and handheld racing setups.

- **Breakpoints**:
  - `Desktop` (1200px+): 12 columns, 24px gutters, 32px margins. Maximum content width capped at 1440px for fixed telemetry alignment.
  - `Tablet` (768px â€“ 1199px): 8 columns, 16px gutters, 20px margins.
  - `Mobile` (< 768px): 4 columns, 16px gutters, 16px margins.
- **Cockpit Insets**: Overlaid racing metrics (mini-map, lap delta, tachometer) adhere to a 16px perimeter safe area on desktop and 12px on mobile to preserve viewport visibility around the low-poly 3D chassis.
- **Grid Alignment**: Card padding, telemetry readouts, and decal markers align strictly to a 4px/8px incremental base unit.

## Elevation & Depth

Visual hierarchy uses crisp technical layering, surface tinting, and hard micro-borders instead of heavy blurred dark shadows:

- **Level 0 (Track Ground)**: Base background `#F4F6F9`.
- **Level 1 (Sub-Panels & Data Grids)**: Crisp `#FFFFFF` surfaces bounded by a 1px solid `#D1D5DB` edge.
- **Level 2 (Interactive Cards & Tuning Trays)**: High-spec white cards with 1px `#CBD5E1` outline and a clean ambient drop: `box-shadow: 0 4px 12px -2px rgba(15, 23, 42, 0.06), 0 2px 4px -1px rgba(15, 23, 42, 0.04)`.
- **Level 3 (Tactical HUD Insets & Cockpit Overlays)**: Inverted dark slate surfaces (`#1E293B`) embedded directly into light screens to establish immediate hierarchy, bounded by a 1px border `rgba(2, 132, 199, 0.3)`.
- **Level 4 (Modals & Flyouts)**: Elevated white cards bounded by a 2px `#0284C7` accent border, floating over a daylight scrim of `rgba(15, 23, 42, 0.45)` with `backdrop-filter: blur(6px)`.
- **Overdrive & Nitro States**: Interactive elements active under boost drop dynamic colored halos: `box-shadow: 0 0 0 3px rgba(225, 29, 72, 0.2), 0 4px 16px rgba(225, 29, 72, 0.3)`.

## Shapes

The design system maintains a **Soft (Level 1)** curvature baseline with `0.25rem` (4px) corner radii, reinforced with racing-grade chamfers:

- **Base Radii**: Standard interactive controls, badges, data inputs, and metric chips maintain a tight 4px radius (`rounded-sm`).
- **Cards & Primary Modules**: Utilize 8px (`rounded-lg`) corner radii.
- **Chamfered Cuts**: High-tier stat cards and nitro triggers employ a 45-degree corner clip (`clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)`) to retain authentic low-poly arcade chassis cues.
- **Segmented Meters**: Speed and fuel indicators use strict 0px sharp-cornered segment blocks partitioned by 2px whitespace dividers.

## Components

### Buttons
- **Primary Daylight Action**: Solid `#0284C7` background, crisp `#FFFFFF` Space Grotesk bold text. Hover shifts to `#0369A1` with an ambient glow of `0 4px 14px rgba(2, 132, 199, 0.35)`. Active scale: `0.98`.
- **Nitro Boost CTA**: Slanted 45-degree chamfered button filled with Vivid Crimson Nitro (`#E11D48`), pure white text, and a live linear-gradient shift on hover.
- **Secondary Ghost**: Transparent background, `#0F172A` text, 1px border `#D1D5DB`. Hover applies `#F8FAFC` background with a `#0284C7` border and text transition.
- **Disabled**: `#E2E8F0` solid fill, `#94A3B8` muted typography, zero shadow, non-clickable cursor.

### Chips & Badges
- **Status / Telemetry Chip**: Height 24px, 4px corner radius, background `#F1F5F9`, border 1px solid `#CBD5E1`. Space Grotesk caps label in `#0F172A`.
- **Tier Pills**:
  - *Tier 1 (Pro)*: `#E0F2FE` background, `#0284C7` border and text.
  - *Tier 2 (Elite)*: `#DCFCE7` background, `#16A34A` border and text.
  - *Legendary*: `#F3E8FF` background, `#7E22CE` border and text.

### Cards (Showroom & Garage)
- `#FFFFFF` surface framed with a 1px `#D1D5DB` border and subtle bottom lip bevel. Top card header features an angled 3px colored accent stripe reflecting the vehicle's racing class.
- Low-poly vehicle display area features a light isometric grid backdrop (`#E2E8F0` gridlines over `#F8FAFC`).
- Integrated stat meters display segmented gauge blocks for **Top Speed**, **Acceleration**, and **Handling** filled with `#65A30D` (Telemetry Lime) over an inactive `#E2E8F0` track.

### Form Inputs & Telemetry Toggles
- **Inputs**: `#FFFFFF` background, `#0F172A` text, 1px border `#CBD5E1`, 4px radius. Focus triggers a 1.5px `#0284C7` ring with `0 0 0 3px rgba(2, 132, 199, 0.15)`.
- **Checkboxes & Radios**: 16px geometric containers with 2px borders. Selected states lock in `#0284C7` fill with white mechanical checkmark iconography.

### HUD Odometer & Speed Tickers
- Dual-tone daylight display: Housed in a compact `#1E293B` dark slate container embedded within the light interface.
- Numerical values in Space Grotesk at 28px font size, rendered in high-contrast crisp white (`#FFFFFF`) alongside an electric cyan `#38BDF8` unit descriptor (`KM/H`).

---

---
name: Cyber Arcade Drift
colors:
  surface: '#111317'
  surface-dim: '#111317'
  surface-bright: '#37393e'
  surface-container-lowest: '#0c0e12'
  surface-container-low: '#1a1c20'
  surface-container: '#1e2024'
  surface-container-high: '#282a2e'
  surface-container-highest: '#333539'
  on-surface: '#e2e2e8'
  on-surface-variant: '#b9cac8'
  inverse-surface: '#e2e2e8'
  inverse-on-surface: '#2f3035'
  outline: '#849492'
  outline-variant: '#3b4a48'
  surface-tint: '#00ddd6'
  primary: '#a0fff9'
  on-primary: '#003735'
  primary-container: '#15eae2'
  on-primary-container: '#006561'
  inverse-primary: '#006a66'
  secondary: '#ffb4ab'
  on-secondary: '#690005'
  secondary-container: '#dc0015'
  on-secondary-container: '#ffece9'
  tertiary: '#c9ff95'
  on-tertiary: '#1b3700'
  tertiary-container: '#88eb17'
  on-tertiary-container: '#376600'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#3efbf2'
  primary-fixed-dim: '#00ddd6'
  on-primary-fixed: '#00201e'
  on-primary-fixed-variant: '#00504d'
  secondary-fixed: '#ffdad6'
  secondary-fixed-dim: '#ffb4ab'
  on-secondary-fixed: '#410002'
  on-secondary-fixed-variant: '#93000a'
  tertiary-fixed: '#97fc2f'
  tertiary-fixed-dim: '#7dde00'
  on-tertiary-fixed: '#0d2000'
  on-tertiary-fixed-variant: '#2a5000'
  background: '#111317'
  on-background: '#e2e2e8'
  surface-variant: '#333539'
typography:
  display-hero:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.02em
  display-hero-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: 0.02em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
    letterSpacing: 0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: 0.03em
  title-sm:
    fontFamily: Space Grotesk
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.04em
  hud-odometer:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: 0.08em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system captures the adrenaline-fueled pulse of retro 90s arcade racing merged with modern low-poly aesthetics and high-octane cyber-futurism. Built for competitive web-based 3D racing, it prioritizes immediate visual recognition, tactile feedback, and high-contrast telemetry.

The aesthetic is characterized by:
- **Cockpit HUD Precision**: Dark titanium and asphalt surfaces illuminated by neon accents, evoking late-night underground arcade machines and night highway circuits.
- **Micro-Chamfered Geometry**: Precision-cut angular corners and tight bevels reminiscent of polygonal chassis, dashboard instruments, and arcade cabinet consoles.
- **Arcade Kineticism**: Dynamic states engineered for quick scanning during rapid 3D gameplay, balancing clean readability with electrifying visual cues.

## Colors

The color palette anchors on deep asphalt tones punctuated by neon frequencies.

- **Primary (`#15EAE2` - Turbo Aqua / Cyber Cyan)**: The foundational cockpit glow used for active states, selected items, primary HUD readouts, and core interactive boundaries.
- **Secondary (`#EA151D` - Speed Crimson / Nitro Red)**: Reserved for nitro propulsion, extreme acceleration meters, hazard warnings, and primary call-to-action triggers.
- **Tertiary (`#87EA15` - Electric Lime / Boost Green)**: Denotes speed gains, tachometer green-lines, turbo-readiness, and positive telemetry deltas.
- **Synthwave Violet (`#7815EA`)**: Used for special tier badges, exotic vehicle unlocks, and ambient chassis underglow.
- **Accent Warning Yellow (`#FDE047`)**: Checkered flags, rank emblems, timers, and critical warning flashes.
- **Dark Surfaces**:
  - `surface-canvas`: `#101216` (Deep Asphalt base)
  - `surface-panel`: `#191B1C` (Inner cockpit shell)
  - `surface-card`: `#26292E` (Component container tier)
  - `surface-elevated`: `#2A2E35` (Active overlays and popovers)
- **High-Contrast Typography**: Off-white `#EDEFF0` for primary readability against dark titanium backgrounds.

## Typography

The typography couples the angular, structural geometry of **Space Grotesk** with the balanced ergonomic legibility of **Plus Jakarta Sans**.

- **Space Grotesk**: Applied across all HUD indicators, section headings, timers, telemetry readouts, and card titles. Use uppercase styling with widened tracking (`0.04em` to `0.1em`) for operational metadata, tiers, and speed metrics.
- **Plus Jakarta Sans**: Dedicated to user interface body text, modal descriptions, garage upgrade guides, and micro-copy to ensure instant visual processing during active gaming sessions.

## Layout & Spacing

The layout utilizes a structured 12-column fluid grid system engineered for cross-platform responsiveness across desktop ultrawides and handheld screens.

- **Breakpoints**:
  - `Desktop`: 1200px and up (12 columns, 24px gutters, 32px safe margins)
  - `Tablet`: 768px â€“ 1199px (8 columns, 16px gutters, 20px safe margins)
  - `Mobile / Compact`: under 768px (4 columns, 12px gutters, 16px safe margins)
- **HUD Safe Areas**: Floating HUD overlays (telemetry, lap times, mini-map) adhere to a 16px peripheral inset on desktop and 12px inset on mobile to keep 3D driving viewports uncluttered.
- **Rhythm**: Internal card gaps and component internals adhere to strict 4px / 8px sub-grids to maintain rigid technical alignment.

## Elevation & Depth

Visual hierarchy combines low-opacity neon edge luminescence with dark metallic tiers rather than traditional diffused drop shadows.

- **Level 0 (Track Canvas)**: Deep asphalt `#101216` backplane.
- **Level 1 (Sub-Panels & Inset HUDs)**: `#191B1C` with an inner 1px border `rgba(255, 255, 255, 0.05)`.
- **Level 2 (Cards & Active Modules)**: `#26292E` finished with a top-lit 1px bevel border `rgba(21, 234, 226, 0.2)` and a soft ambient glow `0 4px 20px rgba(0, 0, 0, 0.6)`.
- **Level 3 (Modals & Overlays)**: `#2A2E35` with full-edge neon framing: `0 0 24px rgba(21, 234, 226, 0.25)`, paired with an ultra-dark backdrop blur filter (`backdrop-filter: blur(12px)` over a 70% black tint).
- **Nitro & Critical Overdrive**: Elevated interactive states deploy a dynamic double-glow: `box-shadow: 0 0 12px rgba(234, 21, 29, 0.6), inset 0 0 6px rgba(234, 21, 29, 0.4)`.

## Shapes

The design system adopts **Level 1 (Soft)** with precision micro-beveled corners (`0.25rem` / `4px`).

- Standard inputs, HUD badges, and list cells feature 4px corner radii.
- Larger containers and cards maintain 8px radii (`rounded-lg`), often enhanced with pseudo-chamfered clip paths on high-tier vehicle panels (`clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)`).
- Stat bars and gauge segments preserve hard, flat-cut segment geometry to mirror digital arcade readouts.

## Components

### Buttons
- **Primary Arcade Action**: `#15EAE2` background with `#101216` Space Grotesk bold text. Border: 1px solid `#15EAE2`. Hover: brightens to `#D1FFFB` with an outer glow of `0 0 16px rgba(21, 234, 226, 0.5)`. Active: scales down 0.98.
- **Nitro Boost CTA**: Slanted pill or chamfered block with `#EA151D` fill, white text, and a constant subtle pulse animation. Hover: intense glow `0 0 20px #EA151D`.
- **Secondary Ghost**: Transparent background, `#EDEFF0` text, 1px border of `rgba(237, 239, 240, 0.2)`. Hover: border brightens to Turbo Aqua with background tint `rgba(21, 234, 226, 0.08)`.
- **Disabled**: `#191B1C` fill, `#595F61` muted text, no glow, cursor not-allowed.
- **Google Sign-In Button**: `#191B1C` container with clean white border, official multi-color "G" icon, and white Space Grotesk label.

### Car Card (Garage & Showroom)
- Features a dark titanium background (`#26292E`) with a top accent bar tinted by car tier (Turbo Aqua for Tier 1, Electric Lime for Tier 2, Synthwave Violet for Legendary).
- Center stage displays the low-poly vehicle 3D canvas or silhouette against an arcade radial grid.
- Stat Matrix: Linear segmented bars for **Speed**, **Accel**, and **Drift**, filled with `#87EA15` and glowing tick marks. Includes a compact pill badge for top speed (e.g., `320 KM/H`).

### Currency & Resources HUD
- **G-Coins**: `#191B1C` chamfered chip containing a metallic gold coin glyph, accompanied by bright `#FDE047` numerical text.
- **Nitro Fuel**: Chip with a glowing miniature canister icon, featuring a dual-stage percentage bar in `#EA151D`.

### HUD Telemetry & Fan Energy Gauge
- **Speedometer / Gear**: Semi-transparent `#101216` overlay (`backdrop-filter: blur(8px)`). Large gear indicator in `#15EAE2`, paired with digital speed values in Space Grotesk.
- **Fan / Spectator Energy Bar**: Horizontal stadium gauge filling from `#7815EA` (base) into `#15EAE2` (full hype), crowned with animated chevron arrows on maximum charge.

### Input Fields & Controls
- **Inputs**: `#191B1C` surface, 1px border `#383B3D`. Focus triggers 1px `#15EAE2` stroke with `0 0 8px rgba(21, 234, 226, 0.3)`. Text is `#EDEFF0` in Plus Jakarta Sans.
- **Checkboxes & Radios**: 16px square micro-cut boxes. Checked state displays `#15EAE2` fill with dark contrasting checkmark.

### Modals & Toast Notifications
- **Modal Dialog**: Centered overlay on darkened backdrop (`rgba(16, 18, 22, 0.85)`). Top header features double racing hazard stripes, Space Grotesk title, and an affirmative neon action button.
- **Toasts**: Slide-in banners anchored to the top-right corner. Success states use Electric Lime `#87EA15` left-border accents; race alerts and penalties use Nitro Red `#EA151D`.
