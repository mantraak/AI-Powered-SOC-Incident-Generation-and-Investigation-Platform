import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { useAuth } from "../../store/authContext";
import { Badge, Button, Card, EmptyState, Icon, Spinner } from "../../components/ui";
import type { DraftConflict, NewsArticle, NewsFeed } from "../../types";
import { createDraftLab } from "../../utils/draftLab";

const TOPICS = [
  { label: "All threats", query: "" },
  { label: "Ransomware", query: "ransomware" },
  { label: "Data breach", query: "data breach" },
  { label: "Malware", query: "malware" },
  { label: "Zero-day", query: "zero-day OR vulnerability" },
  { label: "Phishing", query: "phishing" },
];

function timeAgo(published?: string): string {
  if (!published) return "";
  const then = new Date(published.replace(" ", "T") + (published.endsWith("Z") ? "" : "Z"));
  if (Number.isNaN(then.getTime())) return published;
  const minutes = Math.round((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function ArticleCard({
  article,
  onDiscuss,
  onCreateLab,
  creating,
}: {
  article: NewsArticle;
  onDiscuss?: (article: NewsArticle) => void;
  onCreateLab?: (article: NewsArticle) => void;
  creating?: boolean;
}) {
  return (
    <Card className="group hover:border-[#6f91ef]/30 hover:-translate-y-0.5 transition-all flex flex-col">
      <div className="flex items-start gap-4">
        {article.image_url && (
          <img
            src={article.image_url}
            alt=""
            loading="lazy"
            onError={(event) => { event.currentTarget.style.display = "none"; }}
            className="w-24 h-24 rounded-xl object-cover flex-shrink-0 border border-white/[0.08]"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <Badge color="cyan">{article.source}</Badge>
            {article.published_at && (
              <span className="text-[11px] text-[#737888]">{timeAgo(article.published_at)}</span>
            )}
          </div>
          <a
            href={article.link}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-[#e1e2ed] hover:text-[#b4c5ff] transition-colors leading-snug block"
          >
            {article.title}
          </a>
          {article.description && (
            <p className="text-xs text-[#8d90a0] mt-2 leading-relaxed line-clamp-3">{article.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/[0.07] flex-wrap">
        <a href={article.link} target="_blank" rel="noreferrer">
          <Button variant="secondary" size="sm">
            <Icon name="open_in_new" className="text-sm" />
            Read
          </Button>
        </a>
        {onDiscuss && (
          <Button variant="ghost" size="sm" onClick={() => onDiscuss(article)}>
            <Icon name="smart_toy" className="text-sm" />
            Analyze with AI
          </Button>
        )}
        {onCreateLab && (
          <Button variant="ghost" size="sm" onClick={() => onCreateLab(article)} disabled={creating} data-testid="create-lab-btn">
            {creating ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Icon name="add_box" className="text-sm" />
            )}
            Create Lab
          </Button>
        )}
      </div>
    </Card>
  );
}

export function ThreatFeedPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [feed, setFeed] = useState<NewsFeed | null>(null);
  const [topic, setTopic] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creatingLink, setCreatingLink] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ article: NewsArticle; data: DraftConflict } | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get<NewsFeed>("/news/latest", {
        params: query ? { q: query } : {},
      });
      setFeed(response.data);
    } catch (err: any) {
      setFeed(null);
      setError(
        err.response?.data?.detail ||
          "Could not load the threat feed. An administrator may need to configure the newsdata.io key."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(topic); }, [topic, load]);

  const submitSearch = () => {
    setTopic(search.trim());
  };

  const discuss = (article: NewsArticle) => {
    navigate(`/admin/ai-assistant?link=${encodeURIComponent(article.link)}`);
  };

  const createLab = async (article: NewsArticle, forceNewVersion = false) => {
    setCreatingLink(article.link);
    setError("");
    try {
      const result = await createDraftLab(
        {
          title: article.title,
          description: article.description,
          source_url: article.link,
          source_title: article.source,
          source_article: article.description,
        },
        { forceNewVersion }
      );
      if (result.conflict) {
        setConflict({ article, data: result.conflict });
        return;
      }
      if (result.scenario) {
        navigate(`/admin/scenarios/${result.scenario.id}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Could not create a Draft Lab from this article.");
    } finally {
      setCreatingLink(null);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <PageHeader
          title="Threat Feed"
          subtitle="Latest cybersecurity incidents, breaches, and campaigns reported in the wild"
          action={
            <Button variant="secondary" onClick={() => load(topic)} disabled={loading}>
              <Icon name="refresh" className="text-base" />
              Refresh
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex flex-wrap gap-2 flex-1">
            {TOPICS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => { setTopic(item.query); setSearch(""); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  topic === item.query
                    ? "bg-[#2563eb]/20 border-[#2563eb]/40 text-[#c8d5ff]"
                    : "bg-white/[0.03] border-white/[0.08] text-[#8d90a0] hover:text-[#e1e2ed] hover:bg-white/[0.07]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-[#0b0f18]/90 border border-white/[0.1] px-3 focus-within:border-[#7f9eff] transition-all sm:w-72">
            <Icon name="search" className="text-[#737888] text-lg" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") submitSearch(); }}
              placeholder="Search incidents…"
              data-testid="threat-feed-search"
              className="flex-1 bg-transparent py-2 text-sm text-[#e1e2ed] placeholder-[#737888] focus:outline-none"
            />
          </div>
        </div>

        {feed?.cached && (
          <p className="text-[11px] text-[#737888] mb-3 flex items-center gap-1.5">
            <Icon name="cached" className="text-sm" />
            Served from cache to conserve API credits — refresh again shortly for newer headlines.
          </p>
        )}

        {error && (
          <div className="mb-4 p-3 bg-[#93000a]/25 border border-[#93000a]/60 rounded-lg text-[#ffb4ab] text-sm flex items-start gap-2">
            <Icon name="error" filled className="text-base flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {loading ? (
          <Spinner />
        ) : feed === null && error ? (
          <Card className="!border-[#93000a]/60 !bg-[#93000a]/10">
            <div className="flex items-start gap-3">
              <Icon name="error" filled className="text-[#ffb4ab] text-xl flex-shrink-0" />
              <div>
                <p className="text-sm text-[#ffb4ab] font-medium">{error}</p>
                {isAdmin && (
                  <Button variant="secondary" size="sm" className="mt-3" onClick={() => navigate("/admin/ai-settings")}>
                    <Icon name="settings" className="text-sm" />
                    Configure newsdata.io key
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ) : !feed?.articles.length ? (
          <EmptyState
            icon="newspaper"
            title="No incidents found"
            description="Nothing matched this topic. Try a different filter or search term."
          />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {feed.articles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                onDiscuss={isAdmin ? discuss : undefined}
                onCreateLab={isAdmin ? (a) => createLab(a) : undefined}
                creating={creatingLink === article.link}
              />
            ))}
          </div>
        )}

        {conflict && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <Card className="max-w-md w-full">
              <div className="flex items-start gap-3 mb-4">
                <span className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                  <Icon name="content_copy" className="text-amber-300" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-[#edf0fa]">Draft Lab already exists</h3>
                  <p className="text-xs text-[#9299aa] mt-1.5 leading-relaxed">
                    "{conflict.data.existing_title}" was already created from this article
                    (status: {conflict.data.existing_status}).
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={() => { navigate(`/admin/scenarios/${conflict.data.existing_scenario_id}`); setConflict(null); }}
                  data-testid="open-existing-draft-btn"
                >
                  <Icon name="folder_open" className="text-base" />
                  Open Existing Draft
                </Button>
                <Button
                  variant="secondary"
                  onClick={async () => { const a = conflict.article; setConflict(null); await createLab(a, true); }}
                  data-testid="create-new-version-btn"
                >
                  <Icon name="difference" className="text-base" />
                  Create New Version
                </Button>
                <Button variant="ghost" onClick={() => setConflict(null)}>Cancel</Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
