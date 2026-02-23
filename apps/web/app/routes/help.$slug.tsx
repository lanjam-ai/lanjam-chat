import Fuse from "fuse.js";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code,
  Copy,
  List,
  MessageSquare,
  Paperclip,
  Rocket,
  Search,
  Settings,
  Shield,
  UserCircle,
  X,
} from "lucide-react";
import { useRef, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  type HelpArticle,
  HELP_ARTICLES,
  HELP_CATEGORIES,
  getAdjacentArticles,
  getArticleBySlug,
  getArticlesForCategory,
  getCategoryById,
} from "~/lib/help-content.js";

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Rocket,
  UserCircle,
  MessageSquare,
  Paperclip,
  Shield,
  Settings,
  Code,
};

function getCategoryIcon(iconName: string) {
  return CATEGORY_ICONS[iconName] ?? Rocket;
}

const fuse = new Fuse(HELP_ARTICLES, {
  keys: [
    { name: "title", weight: 2.0 },
    { name: "description", weight: 1.5 },
    { name: "tags", weight: 1.5 },
    { name: "content", weight: 0.5 },
  ],
  threshold: 0.4,
  includeScore: true,
  minMatchCharLength: 2,
});

function PreBlock(props: React.HTMLAttributes<HTMLPreElement>) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = ref.current?.textContent ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="relative">
      <pre ref={ref} {...props} />
      <div className="absolute right-2 top-1 z-10 flex items-center gap-1.5">
        {copied && (
          <span className="inline-flex items-center rounded-md bg-emerald-500/20 backdrop-blur-sm px-2 py-1 text-[10px] font-medium text-emerald-400 copy-pill-in">
            Copied!
          </span>
        )}
        <span
          role="button"
          tabIndex={0}
          onClick={handleCopy}
          onKeyDown={(e) => e.key === "Enter" && handleCopy()}
          title={copied ? "Copied!" : "Copy code"}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 text-gray-400 backdrop-blur-sm transition-colors cursor-pointer hover:bg-white/20 hover:text-white"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </span>
      </div>
    </div>
  );
}

const markdownComponents: Components = { pre: PreBlock };

export function meta({ params }: { params: { slug: string } }) {
  const article = getArticleBySlug(params.slug);
  return [{ title: article ? `${article.title} - Help - LanJAM` : "Help - LanJAM" }];
}

export default function HelpArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const article = slug ? getArticleBySlug(slug) : undefined;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [query, setQuery] = useState("");

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return fuse.search(query).map((r) => r.item);
  }, [query]);

  if (!article) {
    return <Navigate to="/help" replace />;
  }

  const category = getCategoryById(article.category);
  const { prev, next } = getAdjacentArticles(article.slug);

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border lg:block">
        <nav className="p-4">
          <Link
            to="/help"
            className="mb-4 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All topics
          </Link>
          <SidebarNav currentSlug={article.slug} />
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
          {/* Mobile nav toggle */}
          <div className="mb-4 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <List className="h-4 w-4" />
              Browse articles
              <ChevronDown
                className={`h-4 w-4 transition-transform ${mobileNavOpen ? "rotate-180" : ""}`}
              />
            </button>
            {mobileNavOpen && (
              <div className="mt-2 rounded-lg border border-border bg-card p-4">
                <Link
                  to="/help"
                  className="mb-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  All topics
                </Link>
                <SidebarNav currentSlug={article.slug} onNavigate={() => setMobileNavOpen(false)} />
              </div>
            )}
          </div>

          {/* Breadcrumb */}
          <div className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link to="/help" className="hover:text-foreground transition-colors">
              Help
            </Link>
            <ChevronRight className="h-3 w-3" />
            {category && (
              <>
                <span>{category.title}</span>
                <ChevronRight className="h-3 w-3" />
              </>
            )}
            <span className="text-foreground font-medium truncate">{article.title}</span>
          </div>

          {/* Inline Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help articles..."
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-9 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Search Results Overlay */}
          {query.trim() && (
            <div className="mb-6 rounded-lg border border-border bg-card p-4">
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">No matching articles found</p>
              ) : (
                <div className="space-y-1">
                  {searchResults.map((result) => (
                    <Link
                      key={result.id}
                      to={`/help/${result.slug}`}
                      onClick={() => setQuery("")}
                      className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                        result.slug === article.slug ? "bg-accent font-medium" : "hover:bg-accent"
                      }`}
                    >
                      <span>{result.title}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {getCategoryById(result.category)?.title}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Article Content */}
          <article>
            <h1 className="mb-6 text-2xl font-bold">{article.title}</h1>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {article.content}
              </Markdown>
            </div>
          </article>

          {/* Prev / Next Navigation */}
          <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-stretch sm:gap-4">
            {prev ? (
              <Link
                to={`/help/${prev.slug}`}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Previous
                  </p>
                  <p className="text-sm font-medium truncate">{prev.title}</p>
                </div>
              </Link>
            ) : (
              <div className="hidden sm:block flex-1" />
            )}
            {next ? (
              <Link
                to={`/help/${next.slug}`}
                className="flex min-w-0 flex-1 items-center justify-end gap-3 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors text-right"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Next
                  </p>
                  <p className="text-sm font-medium truncate">{next.title}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ) : (
              <div className="hidden sm:block flex-1" />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar Navigation
// ---------------------------------------------------------------------------

function SidebarNav({
  currentSlug,
  onNavigate,
}: {
  currentSlug: string;
  onNavigate?: () => void;
}) {
  const sortedCategories = [...HELP_CATEGORIES].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-5">
      {sortedCategories.map((category) => {
        const articles = getArticlesForCategory(category.id);
        const Icon = getCategoryIcon(category.icon);
        const hasActive = articles.some((a) => a.slug === currentSlug);

        return (
          <div key={category.id}>
            <h3 className="flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              {category.title}
            </h3>
            <ul className="mt-1.5 space-y-0.5">
              {articles.map((article) => {
                const isActive = article.slug === currentSlug;
                return (
                  <li key={article.slug}>
                    <Link
                      to={`/help/${article.slug}`}
                      onClick={onNavigate}
                      className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                        isActive
                          ? "bg-accent font-medium border-l-2 border-primary ml-0 pl-2.5"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {article.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
