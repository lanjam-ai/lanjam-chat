import Fuse from "fuse.js";
import {
  ChevronRight,
  Code,
  MessageSquare,
  Paperclip,
  Rocket,
  Search,
  Settings,
  Shield,
  UserCircle,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  type HelpArticle,
  type HelpCategory,
  HELP_ARTICLES,
  HELP_CATEGORIES,
  getArticlesForCategory,
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

export function meta() {
  return [{ title: "Help - LanJAM" }];
}

export default function HelpPage() {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return fuse.search(query).map((r) => r.item);
  }, [query]);

  const isSearching = query.trim().length > 0;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Help</h1>
          <p className="mt-1 text-sm text-muted-foreground">Find answers about using LanJAM</p>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help articles..."
            className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Search Results */}
        {isSearching ? (
          <div>
            <p className="mb-4 text-sm text-muted-foreground">
              {results.length === 0
                ? "No matching articles found"
                : `${results.length} result${results.length === 1 ? "" : "s"} found`}
            </p>
            {results.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-muted-foreground">
                <Search className="mb-3 h-10 w-10 opacity-30" />
                <p className="text-sm">Try a different search term</p>
              </div>
            ) : (
              <div className="space-y-2">
                {results.map((article) => (
                  <SearchResult key={article.id} article={article} />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Category Grid */
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {HELP_CATEGORIES.sort((a, b) => a.order - b.order).map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryCard({ category }: { category: HelpCategory }) {
  const articles = getArticlesForCategory(category.id);
  const firstArticle = articles[0];
  const Icon = getCategoryIcon(category.icon);

  return (
    <Link
      to={firstArticle ? `/help/${firstArticle.slug}` : "/help"}
      className="group flex flex-col rounded-lg border border-border p-5 hover:bg-accent/50 transition-colors"
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h2 className="text-sm font-semibold">{category.title}</h2>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{category.description}</p>
      <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
        <span>
          {articles.length} article{articles.length === 1 ? "" : "s"}
        </span>
        <ChevronRight className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
      </div>
    </Link>
  );
}

function SearchResult({ article }: { article: HelpArticle }) {
  const category = HELP_CATEGORIES.find((c) => c.id === article.category);

  return (
    <Link
      to={`/help/${article.slug}`}
      className="flex items-start gap-3 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium">{article.title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{article.description}</p>
        {category && (
          <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {category.title}
          </span>
        )}
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
