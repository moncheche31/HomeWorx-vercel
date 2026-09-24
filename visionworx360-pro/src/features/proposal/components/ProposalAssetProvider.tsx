import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SignedImage } from "@/features/project-workspace/components/SignedImage";

/**
 * The proposal document renders in two very different places: the signed-in
 * contractor app (project-scoped signed URLs) and the client portal (share
 * token-scoped signed URLs). The document components stay identical; only the
 * way a private storage path becomes a URL is swapped through this provider.
 */
export type ProposalAssetResolver = (storagePath: string) => Promise<string>;

const ProposalAssetContext = createContext<ProposalAssetResolver | null>(null);

export function ProposalAssetProvider({
  resolve,
  children,
}: {
  resolve: ProposalAssetResolver;
  children: ReactNode;
}) {
  return <ProposalAssetContext.Provider value={resolve}>{children}</ProposalAssetContext.Provider>;
}

export function useProposalAssetResolver(): ProposalAssetResolver | null {
  return useContext(ProposalAssetContext);
}

interface Props {
  projectId: string;
  storagePath: string;
  alt: string;
  className?: string;
}

/** Image inside a proposal. Uses the share resolver when one is provided. */
export function ProposalImage({ projectId, storagePath, alt, className }: Props) {
  const resolve = useProposalAssetResolver();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!resolve) return;
    let active = true;
    setUrl(null);
    setFailed(false);
    resolve(storagePath)
      .then((next) => {
        if (active) setUrl(next);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [resolve, storagePath]);

  if (!resolve) {
    return <SignedImage projectId={projectId} storagePath={storagePath} alt={alt} className={className} />;
  }
  if (failed)
    return (
      <div
        className={`${className ?? ""} flex items-center justify-center bg-muted`}
        role="img"
        aria-label={alt}
      >
        <ImageOff className="size-5" aria-hidden />
      </div>
    );
  if (!url) return <Skeleton className={className} />;
  return <img src={url} alt={alt} className={className} loading="lazy" decoding="async" />;
}
