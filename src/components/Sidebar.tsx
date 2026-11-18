export type NavId =
  | "accueil"
  | "corpus"
  | "recherche"
  | "agents"
  | "graph"
  | "analyses"
  | "settings";

const NAV: { id: NavId; label: string; hint: string; icon: string }[] = [
  { id: "accueil", label: "Accueil", hint: "Vue d’ensemble du cerveau", icon: "home" },
  { id: "corpus", label: "Corpus", hint: "Spaces, notes, record", icon: "corpus" },
  { id: "recherche", label: "Recherche", hint: "Ask or search", icon: "search" },
  { id: "agents", label: "Agents", hint: "Import, auto-tag, MCP", icon: "agents" },
  { id: "graph", label: "Graph", hint: "Brain / spheres / clusters", icon: "graph" },
  { id: "analyses", label: "Analyses", hint: "Comptes et fonctions", icon: "chart" },
  { id: "settings", label: "Réglages", hint: "Thème, palette, vault", icon: "settings" },
];

type Props = {
  active: NavId;
  onNavigate: (id: NavId) => void;
  query: string;
  onQuery: (q: string) => void;
  noteCount: number;
  agentBusy: boolean;
  vaultLabel?: string | null;
};

function Icon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
        </svg>
      );
    case "corpus":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="4" rx="1" />
          <rect x="4" y="11" width="16" height="4" rx="1" />
          <rect x="4" y="17" width="12" height="3" rx="1" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "agents":
      return (
        <svg {...common}>
          <rect x="7" y="9" width="10" height="9" rx="2" />
          <path d="M12 5v4M9 18v2M15 18v2M7 13H5M19 13h-2" />
          <circle cx="10" cy="13" r="0.8" fill="currentColor" />
          <circle cx="14" cy="13" r="0.8" fill="currentColor" />
        </svg>
      );
    case "graph":
      return (
        <svg {...common}>
          <circle cx="7" cy="8" r="2.2" />
          <circle cx="17" cy="7" r="2.2" />
          <circle cx="12" cy="16" r="2.4" />
          <path d="M8.8 9.5 10.5 14M15.2 9 13.4 14M9.2 8.2h5.6" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M5 19V10M10 19V5M15 19v-7M20 19V8" />
        </svg>
      );
  }
}

export function Sidebar({
  active,
  onNavigate,
  query,
  onQuery,
  noteCount,
  agentBusy,
  vaultLabel,
}: Props) {
  return (
    <aside className="sidebar" aria-label="Navigation CortexCraft">
      <button
        type="button"
        className="sidebar-brand"
        onClick={() => onNavigate("accueil")}
        title="Accueil"
      >
        <img
          src="/brand/elephant-64.png"
          alt=""
          className="sidebar-logo"
          width={36}
          height={36}
        />
        <span className="sidebar-brand-text">
          <span className="sidebar-name">CortexCraft</span>
          <span className="sidebar-sub">vault · chats · MCP</span>
        </span>
      </button>

      <label className="sidebar-search">
        <Icon name="search" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onFocus={() => onNavigate("recherche")}
          placeholder="Ask or search"
          aria-label="Ask or search"
        />
        <kbd>⌘K</kbd>
      </label>

      <nav className="sidebar-nav" aria-label="Sections">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={active === item.id ? "nav-item active" : "nav-item"}
            onClick={() => onNavigate(item.id)}
            title={item.hint}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="sidebar-mini" aria-hidden>
          <img src="/brand/elephant-64.png" alt="" width={72} height={72} />
        </div>
        <p className="sidebar-status">
          {agentBusy ? "AGENT RUNNING" : "NO AI RUNNING NOW"}
        </p>
        <p className="sidebar-meta">
          {noteCount} notes
          {vaultLabel ? ` · ${vaultLabel}` : ""}
        </p>
      </div>
    </aside>
  );
}
