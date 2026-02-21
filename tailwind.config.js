/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        sm: "100%",
        md: "430px",
      },
    },
    extend: {
      fontFamily: {
        // Body: Urbanist (spec: DESIGN_MASTER_SPEC §4)
        sans: [
          "Urbanist",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        // Display/Headers: Clash Display with Satoshi fallback
        display: [
          "Clash Display",
          "Satoshi",
          "General Sans",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
      },
      fontSize: {
        // Locked typography scale (DESIGN_MASTER_SPEC §4)
        base: ["16px", { lineHeight: "1.5" }],   // body primary
        sub: ["14px", { lineHeight: "1.5" }],     // label
        helper: ["12px", { lineHeight: "1.5" }],  // helper/caption
        h1: ["24px", { lineHeight: "1.25", fontWeight: "600" }],
        h2: ["20px", { lineHeight: "1.25", fontWeight: "600" }],
        h3: ["18px", { lineHeight: "1.35", fontWeight: "600" }],
        hero: ["60px", { lineHeight: "1.1", fontWeight: "600" }], // hero moments only
        "hero-sm": ["44px", { lineHeight: "1.1", fontWeight: "600" }],
      },
      colors: {
        // Brand tokens — canonical (DESIGN_MASTER_SPEC §3)
        brandBlue: "#2145CF",        // corrected from #2D37C8
        brandGold: "#CFAB21",
        brandText: "#424965",
        brandSubtext: "#4a4a4a",
        brandError: "#EF4444",
        brandEmergency: "#F97316",  // warm red/orange for emergency ONLY
        brandSuccess: "#10b981",
        brandAmber: "#F59E0B",

        // shadcn design tokens (kept for compatibility)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          soft: "hsl(var(--primary-soft))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          soft: "hsl(var(--accent-soft))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
          elevated: "hsl(var(--card-elevated))",
        },
        success: "hsl(var(--success))",
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: "hsl(var(--info))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        // Locked radius tokens (DESIGN_MASTER_SPEC §token)
        card: "12px",       // E1 content cards
        btn: "8px",         // buttons / inputs
        glass: "16px",      // E2 glass overlays
        modal: "20px",      // E3 active modals
        full: "9999px",
        lg: "var(--radius-lg)",
        md: "var(--radius)",
        sm: "var(--radius-sm)",
        xl: "1.5rem",
        "2xl": "2rem",
      },
      boxShadow: {
        // Elevation tokens (DESIGN_MASTER_SPEC §1.1)
        "e1": "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
        "e2": "0 8px 32px rgba(0,0,0,0.12)",
        "e3": "0 16px 48px rgba(0,0,0,0.16), 0 0 1px rgba(0,0,0,0.08)",
        // Neumorphic tokens
        "neu-raised": "6px 6px 12px rgba(0,0,0,0.08), -4px -4px 8px rgba(255,255,255,0.8)",
        "neu-pressed": "inset 3px 3px 6px rgba(0,0,0,0.10), inset -2px -2px 4px rgba(255,255,255,0.60)",
        "neu-primary-raised": "6px 6px 12px rgba(33,69,207,0.25), -4px -4px 8px rgba(60,100,255,0.4)",
        "neu-gold-raised": "6px 6px 12px rgba(207,171,33,0.25), -4px -4px 8px rgba(240,200,80,0.4)",
        "neu-icon": "4px 4px 8px rgba(0,0,0,0.06), -3px -3px 6px rgba(255,255,255,0.8)",
        // Legacy
        card: "var(--shadow-card)",
        elevated: "var(--shadow-elevated)",
        soft: "var(--shadow-soft)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-out-right": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(100%)" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "glass-fade": {
          from: { opacity: "0", transform: "translateY(20px)", backdropFilter: "blur(0px)" },
          to: { opacity: "1", transform: "translateY(0)", backdropFilter: "blur(20px)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "skeleton-shimmer": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(100%)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "slide-out-right": "slide-out-right 0.3s ease-out",
        "slide-up": "slide-up 0.24s cubic-bezier(0.4,0,0.2,1)",
        "glass-fade": "glass-fade 0.3s ease-out",
        "fade-in": "fade-in 0.25s ease-in-out",
        "skeleton-shimmer": "skeleton-shimmer 1.5s linear infinite",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      spacing: {
        nav: "var(--nav-height)",
        safe: "env(safe-area-inset-bottom, 0px)",
        "token-1": "var(--space-1)",
        "token-2": "var(--space-2)",
        "token-3": "var(--space-3)",
        "token-4": "var(--space-4)",
        "token-5": "var(--space-5)",
        "token-6": "var(--space-6)",
      },
      borderWidth: {
        token: "var(--border-thin)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
