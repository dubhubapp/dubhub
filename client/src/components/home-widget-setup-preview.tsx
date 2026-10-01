import { useRef, useState, type ReactNode } from "react";
import { Music } from "lucide-react";
import { HOME_WIDGET_COPY } from "@shared/home-widget-copy";
import dubHubMarkUrl from "../../../ios/App/ReleaseCountdownWidget/Assets.xcassets/DubHubD.imageset/DubHubD.png";
import {
  HOME_WIDGET_SETUP_PREVIEW_FAMILIES,
  type HomeWidgetSetupPreviewFamily,
  type HomeWidgetSetupPreviewModel,
} from "@/lib/home-widget-setup-preview";

const FAMILY_LABEL: Record<HomeWidgetSetupPreviewFamily, string> = {
  small: "Small",
  medium: "Medium",
};

function Artwork({
  url,
  className,
}: {
  url: string | null;
  className: string;
}) {
  return (
    <div className={`shrink-0 overflow-hidden rounded-[12px] bg-white/10 ${className}`}>
      {url ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-white/70">
          <Music className="h-[36%] w-[36%]" />
        </div>
      )}
    </div>
  );
}

function BrandMark({ size }: { size: number }) {
  return (
    <img
      src={dubHubMarkUrl}
      alt=""
      aria-hidden
      draggable={false}
      data-testid="home-widget-setup-preview-mark"
      className="pointer-events-none block object-contain opacity-[0.88]"
      style={{
        width: size,
        height: "auto",
        maxHeight: size,
        mixBlendMode: "screen",
      }}
    />
  );
}

function WidgetChrome({
  artworkUrl,
  children,
  testId,
  className,
}: {
  artworkUrl: string | null;
  children: ReactNode;
  testId: string;
  className: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`relative overflow-hidden text-white ${className}`}
    >
      {artworkUrl ? (
        <>
          <img
            src={artworkUrl}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-[28px]"
          />
          <div className="absolute inset-0 bg-black/55" />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgb(18, 20, 41) 0%, rgb(10, 13, 26) 100%)",
          }}
        />
      )}
      <div className="relative z-[1] h-full">{children}</div>
    </div>
  );
}

function EmptyPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div
      data-testid="home-widget-setup-preview-empty"
      className={`flex h-full items-center text-left ${compact ? "gap-2 px-3" : "gap-3 px-3.5"}`}
    >
      <Artwork url={null} className={compact ? "h-11 w-11" : "h-[4.5rem] w-[4.5rem]"} />
      <div className="min-w-0">
        <p className="text-[15px] font-bold leading-tight">{HOME_WIDGET_COPY.title}</p>
        <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-white/75">
          {HOME_WIDGET_COPY.emptyBody}
        </p>
      </div>
    </div>
  );
}

function PreviewShadow({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[22px] shadow-[0_10px_22px_rgba(0,0,0,0.32)]">{children}</div>
  );
}

function SmallPreview({ model }: { model: HomeWidgetSetupPreviewModel | null }) {
  return (
    <PreviewShadow>
      <WidgetChrome
        artworkUrl={model?.artworkUrl ?? null}
        testId="home-widget-setup-preview-small"
        className="aspect-square w-full rounded-[22px]"
      >
        <div data-layout="small-centered" className="h-full">
          {model ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-3 pb-8 pt-3 text-center">
              <Artwork url={model.artworkUrl} className="aspect-square w-[46%]" />
              <div className="flex w-full flex-col items-center gap-1">
                <p className="line-clamp-1 w-full text-[11px] font-semibold leading-tight text-white/[0.78]">
                  {model.artistName}
                </p>
                <p className="line-clamp-2 w-full text-[15px] font-bold leading-[1.15]">
                  {model.title}
                </p>
                <p
                  className="line-clamp-1 w-full text-[20px] font-bold leading-none"
                  style={{ color: model.isOutNow ? "rgb(115, 242, 166)" : "#fff" }}
                >
                  {model.smallCountdownLabel}
                </p>
              </div>
            </div>
          ) : (
            <EmptyPreview compact />
          )}
          <div className="absolute bottom-3 right-3">
            <BrandMark size={19} />
          </div>
        </div>
      </WidgetChrome>
    </PreviewShadow>
  );
}

function MediumPreview({ model }: { model: HomeWidgetSetupPreviewModel | null }) {
  return (
    <PreviewShadow>
      <WidgetChrome
        artworkUrl={model?.artworkUrl ?? null}
        testId="home-widget-setup-preview-medium"
        className="aspect-[338/158] w-full rounded-[22px]"
      >
        <div data-layout="medium-row" className="h-full">
          {model ? (
            <div className="flex h-full flex-col p-3">
              <div className="flex min-h-0 flex-1 items-start gap-3">
                <Artwork url={model.artworkUrl} className="aspect-square h-[78%] max-h-full" />
                <div className="flex h-[78%] min-w-0 flex-1 flex-col text-left">
                  <p className="line-clamp-1 text-[12px] font-semibold leading-tight text-white/[0.78]">
                    {model.artistName}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[16px] font-bold leading-[1.15]">
                    {model.title}
                  </p>
                  <p
                    className="mt-1.5 line-clamp-1 text-[20px] font-bold leading-none"
                    style={{ color: model.isOutNow ? "rgb(115, 242, 166)" : "#fff" }}
                  >
                    {model.countdownLabel}
                  </p>
                  {model.announcementLabel ? (
                    <p className="mt-1 line-clamp-1 text-[11px] font-medium text-white/55">
                      {model.announcementLabel}
                    </p>
                  ) : null}
                  {model.releaseDateLabel ? (
                    <p className="mt-auto line-clamp-1 pt-1 text-[11px] text-white/[0.65]">
                      {model.releaseDateLabel}
                    </p>
                  ) : null}
                </div>
              </div>
              <div
                data-testid="home-widget-setup-preview-footer"
                className="mt-1.5 flex items-end justify-between"
              >
                <p className="text-[11px] font-medium leading-none text-white/45">
                  {HOME_WIDGET_COPY.brand}
                </p>
                <BrandMark size={24} />
              </div>
            </div>
          ) : (
            <>
              <EmptyPreview />
              <div className="absolute bottom-3 right-3">
                <BrandMark size={24} />
              </div>
            </>
          )}
        </div>
      </WidgetChrome>
    </PreviewShadow>
  );
}

export function HomeWidgetSetupPreview({
  model,
}: {
  model: HomeWidgetSetupPreviewModel | null;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const scrollTo = (next: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(HOME_WIDGET_SETUP_PREVIEW_FAMILIES.length - 1, next));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    setIndex(clamped);
  };

  return (
    <div data-testid="home-widget-setup-preview" className="mt-5">
      <div
        ref={scrollerRef}
        data-testid="home-widget-setup-preview-scroller"
        className="flex snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          const el = event.currentTarget;
          if (el.clientWidth <= 0) return;
          const next = Math.round(el.scrollLeft / el.clientWidth);
          setIndex(
            Math.max(0, Math.min(HOME_WIDGET_SETUP_PREVIEW_FAMILIES.length - 1, next)),
          );
        }}
      >
        <div
          data-testid="home-widget-setup-preview-slide-small"
          className="flex w-full shrink-0 snap-center items-center justify-center px-6 pt-6 pb-12"
        >
          <div className="w-[46.75%] max-w-[158px]">
            <SmallPreview model={model} />
          </div>
        </div>
        <div
          data-testid="home-widget-setup-preview-slide-medium"
          className="flex w-full shrink-0 snap-center items-center justify-center px-6 pt-6 pb-12"
        >
          <div className="w-full max-w-[338px]">
            <MediumPreview model={model} />
          </div>
        </div>
      </div>
      <div
        className="mt-3 flex items-center justify-center gap-2"
        role="tablist"
        aria-label="Widget size"
      >
        {HOME_WIDGET_SETUP_PREVIEW_FAMILIES.map((family, familyIndex) => {
          const active = familyIndex === index;
          return (
            <button
              key={family}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={FAMILY_LABEL[family]}
              data-testid={`home-widget-setup-preview-dot-${family}`}
              onClick={() => scrollTo(familyIndex)}
              className={`h-1.5 rounded-full transition-all ${
                active ? "w-4 bg-[#101828]/70 dark:bg-white/80" : "w-1.5 bg-[#101828]/25 dark:bg-white/30"
              }`}
            />
          );
        })}
      </div>
      <p className="mt-2 text-center text-[12px] font-medium text-[#101828]/55 dark:text-white/50">
        {FAMILY_LABEL[HOME_WIDGET_SETUP_PREVIEW_FAMILIES[index] ?? "small"]}
      </p>
    </div>
  );
}
